// DLens public-file import relay (shared by the Vercel endpoint and local dev/preview).
// Streams public http(s) files same-origin so browser URL imports work even when
// the upstream host sends no CORS headers. Never forwards caller credentials and
// never passes upstream cookies/headers through to the client.
import { lookup as dnsLookup } from "node:dns";
import { isIP } from "node:net";
import http from "node:http";
import https from "node:https";

export const RELAY_MAX_REDIRECTS = 5;
export const RELAY_TIMEOUT_MS = 25_000;
// Streaming keeps memory bounded; the cap only rejects absurd payloads explicitly.
export const RELAY_MAX_BYTES = 256 * 1024 * 1024;

function fail(res, status, message) {
  if (res.headersSent) {
    try { res.destroy(); } catch { /* Already torn down. */ }
    return;
  }
  res.writeHead(status, {
    "content-type": "text/plain; charset=utf-8",
    "cache-control": "no-store",
  });
  res.end(message);
}

function ipv4Public(parts) {
  const [a, b] = parts;
  if (a === 10) return false;
  if (a === 127) return false; // loopback
  if (a === 0) return false; // current network
  if (a === 169 && b === 254) return false; // link-local + cloud metadata
  if (a === 172 && b >= 16 && b <= 31) return false;
  if (a === 192 && b === 168) return false;
  if (a === 192 && b === 0 && parts[2] === 0) return false;
  if (a === 100 && b >= 64 && b <= 127) return false; // carrier-grade NAT
  if (a === 192 && b === 0 && parts[2] === 2) return false; // TEST-NET-1
  if (a === 198 && (b === 18 || b === 19)) return false; // benchmark
  if (a === 198 && b === 51 && parts[2] === 100) return false; // TEST-NET-2
  if (a === 203 && b === 0 && parts[2] === 113) return false; // TEST-NET-3
  if (a === 192 && b === 88 && parts[2] === 99) return false; // deprecated relay
  if (a >= 224) return false; // multicast + reserved
  return true;
}

// True only for publicly routable destinations. Rejects loopback, private,
// link-local, reserved and IPv4-mapped IPv6 ranges (incl. cloud metadata).
export function isPublicAddress(ip) {
  if (typeof ip !== "string" || !ip) return false;
  const lower = ip.toLowerCase();
  // IPv4-mapped IPv6 (e.g. ::ffff:127.0.0.1) must pass the inner IPv4 check.
  const mapped = lower.match(/^::ffff:(\d+\.\d+\.\d+\.\d+)$/);
  if (mapped) return isPublicAddress(mapped[1]);
  if (isIP(ip) === 6) {
    // Allow only ordinary global unicast; conservatively exclude special
    // protocol, transition and documentation allocations within that range.
    const canonical = new URL(`http://[${ip}]/`).hostname.slice(1, -1);
    const [first, second] = canonical.split(":").map(part => parseInt(part || "0", 16));
    if (first < 0x2000 || first > 0x3fff) return false;
    if (first === 0x2001 && (second <= 0x1ff || second === 0xdb8)) return false;
    if (first === 0x2002 || first === 0x3fff) return false;
    return true;
  }
  if (isIP(ip) !== 4) return false;
  return ipv4Public(ip.split(".").map(Number));
}

function loopbackHostname(hostname) {
  // Bracketed IPv6 literals (new URL keeps the brackets on .hostname).
  const host = hostname.toLowerCase().replace(/\.+$/, "").replace(/^\[(.*)\]$/, "$1");
  if (host === "localhost" || host.endsWith(".localhost")) return true;
  if (host === "::1") return true;
  const mapped = host.match(/^::ffff:(\d+\.\d+\.\d+\.\d+)$/);
  if (mapped) return mapped[1].split(".").map(Number)[0] === 127;
  return isIP(host) === 4 && host.split(".").map(Number)[0] === 127;
}

function blockedHostname(hostname, allowLoopback = false) {
  // Bracketed IPv6 literals (new URL keeps the brackets on .hostname).
  const host = hostname.toLowerCase().replace(/\.+$/, "").replace(/^\[(.*)\]$/, "$1");
  if (host === "metadata.google.internal") return true;
  if (host === "instance-data") return true;
  if (loopbackHostname(host)) return !allowLoopback;
  if (isIP(host)) return !isPublicAddress(host);
  return false;
}

// Validating lookup: resolution and the actual socket target share one code
// path, so a validated address cannot be swapped before connecting. Every
// redirect re-validates through the same function.
function makeValidatingLookup(allowLoopback) {
  return function validatingLookup(hostname, options, callback) {
    if (typeof options === "function") {
      callback = options;
      options = {};
    }
    if (blockedHostname(hostname, allowLoopback)) {
      callback(new Error("Destination is not a public address."));
      return;
    }
    if (allowLoopback && loopbackHostname(hostname)) {
      dnsLookup(hostname, options, callback);
      return;
    }
    dnsLookup(hostname, { all: true }, (error, addresses) => {
      if (error || !addresses?.length) {
        callback(error ?? new Error("DNS resolution failed."));
        return;
      }
      // Loopback fixtures are pinned only when explicitly allowed; every
      // other non-public destination (metadata, private ranges) stays out.
      const usable = addresses.filter(
        (entry) => isPublicAddress(entry.address) || (allowLoopback && entry.address === "127.0.0.1"),
      );
      if (!usable.length) {
        callback(new Error("Destination is not a public address."));
        return;
      }
      // Pin this connection to the first usable address.
      const picked = usable[0];
      if (options?.all) callback(null, usable);
      else callback(null, picked.address, picked.family);
    });
  };
}

function requestOnce(url, signal, lookup, allowLoopback) {
  return new Promise((resolve, reject) => {
    if (signal.aborted) {
      reject(Object.assign(new Error("Abgebrochen / Cancelled"), { code: "ABORT" }));
      return;
    }
    // Node skips the validating lookup for literal IP destinations, so those
    // are checked up front; hostnames are validated (and pinned) inside it.
    if (blockedHostname(url.hostname, allowLoopback)) {
      reject(new Error("Destination is not a public address."));
      return;
    }
    const transport = url.protocol === "https:" ? https : http;
    const req = transport.request(
      url,
      {
        method: "GET",
        lookup,
        headers: {
          accept: "*/*",
          "accept-encoding": "identity",
          "user-agent": "DLens-import-relay",
        },
      },
      (res) => resolve(res),
    );
    const timer = setTimeout(() => req.destroy(new Error("Upstream timeout.")), RELAY_TIMEOUT_MS);
    const onAbort = () => req.destroy(Object.assign(new Error("Abgebrochen / Cancelled"), { code: "ABORT" }));
    signal.addEventListener("abort", onAbort, { once: true });
    req.on("error", (error) => {
      clearTimeout(timer);
      signal.removeEventListener("abort", onAbort);
      reject(error);
    });
    req.on("response", () => {
      clearTimeout(timer);
      signal.removeEventListener("abort", onAbort);
    });
    req.end();
  });
}

function sanitizeContentType(value) {
  if (typeof value !== "string") return "application/octet-stream";
  const first = value.split(",")[0].trim().slice(0, 128);
  return /^[a-z0-9.+-]+\/[a-z0-9.+-]+/i.test(first) ? first : "application/octet-stream";
}

// Browser-safe downloaded-filename resolution shared conceptually with
// src/lib/ingestion/download-filename.ts (kept dependency-free here so the
// Vercel function stays a single file). Priority: upstream filename*
// (RFC 5987 UTF-8) > filename > final upstream URL path. Never forwards
// arbitrary upstream header text; the caller rebuilds a safe attachment value.
function sanitizeRelayFilename(raw) {
  if (typeof raw !== "string") return null;
  let value = raw.trim();
  if (!value) return null;
  const slash = Math.max(value.lastIndexOf("/"), value.lastIndexOf("\\"));
  if (slash >= 0) value = value.slice(slash + 1);
  // eslint-disable-next-line no-control-regex
  value = value.replace(/[\x00-\x1f\x7f]/g, "").trim();
  if (!value || value === "." || value === "..") return null;
  return value.slice(0, 128) || null;
}

function safeDecodeRelay(value) {
  try {
    return decodeURIComponent(value);
  } catch {
    return value;
  }
}

function parseUpstreamDisposition(header) {
  if (typeof header !== "string" || !header) return null;
  const scanned = header.slice(0, 2048);
  const extended = /filename\*\s*=\s*(?:UTF-8|utf-8)''([^;\s]+)/.exec(scanned);
  if (extended) {
    try {
      const decoded = sanitizeRelayFilename(decodeURIComponent(extended[1].trim()));
      if (decoded) return decoded;
    } catch {
      // Invalid percent-encoding: fall through to filename (else null).
    }
  }
  const quoted = /filename\s*=\s*"([^"]{1,200})"/.exec(scanned);
  if (quoted) {
    const cleaned = sanitizeRelayFilename(quoted[1]);
    if (cleaned) return cleaned;
  }
  const bare = /filename\s*=\s*([^;\s]{1,200})/.exec(scanned);
  if (bare) {
    let token = bare[1].trim();
    if (/^UTF-8''/i.test(token)) return null;
    if ((token.startsWith("'") && token.endsWith("'")) || (token.startsWith('"') && token.endsWith('"'))) {
      token = token.slice(1, -1);
    }
    const cleaned = sanitizeRelayFilename(token);
    if (cleaned) return cleaned;
  }
  return null;
}

function basenameOfRelayUrl(raw) {
  if (typeof raw !== "string" || !raw) return null;
  try {
    const pathname = new URL(raw).pathname;
    const base = pathname.split("/").filter(Boolean).pop() ?? "";
    if (!base) return null;
    return sanitizeRelayFilename(safeDecodeRelay(base));
  } catch {
    return null;
  }
}

export function resolveRelayFilename(disposition, finalUrl) {
  return parseUpstreamDisposition(disposition) ?? basenameOfRelayUrl(finalUrl);
}

export function relayAttachmentHeader(filename) {
  const cleaned = sanitizeRelayFilename(filename);
  if (!cleaned) return "attachment";
  const ascii = cleaned.replace(/[^\x20-\x7e]/g, "_").replace(/["\\]/g, "_");
  const encoded = encodeURIComponent(cleaned).replace(/['()]/g, (c) => `%${c.charCodeAt(0).toString(16).toUpperCase()}`);
  if (ascii === cleaned) return `attachment; filename="${ascii}"`;
  return `attachment; filename="${ascii}"; filename*=UTF-8''${encoded}`;
}

async function fetchPublic(url, signal, redirectsLeft, lookup, allowLoopback) {
  const response = await requestOnce(url, signal, lookup, allowLoopback);
  const status = response.statusCode ?? 500;
  if ([301, 302, 303, 307, 308].includes(status)) {
    response.destroy();
    const location = response.headers.location;
    if (!location || redirectsLeft <= 0) {
      const error = new Error(redirectsLeft <= 0 ? "Too many redirects." : "Redirect without location.");
      error.code = "RELAY_HTTP";
      error.status = 502;
      throw error;
    }
    let next;
    try {
      next = new URL(location, url);
    } catch {
      const error = new Error("Invalid redirect target.");
      error.code = "RELAY_HTTP";
      error.status = 502;
      throw error;
    }
    if ((next.protocol !== "http:" && next.protocol !== "https:") || next.username || next.password) {
      const error = new Error("Redirect target is not a public http(s) file.");
      error.code = "RELAY_HTTP";
      error.status = 502;
      throw error;
    }
    return fetchPublic(next, signal, redirectsLeft - 1, lookup, allowLoopback);
  }
  if (status < 200 || status >= 300) {
    response.destroy();
    const error = new Error(`Upstream HTTP ${status}.`);
    error.code = "RELAY_HTTP";
    error.status = status === 404 ? 404 : 502;
    throw error;
  }
  return { response, finalUrl: url.toString() };
}

export function parseRelayTarget(reqUrl, host, allowLoopback = false) {
  let parsed;
  try {
    parsed = new URL(reqUrl, `http://${host ?? "localhost"}`);
  } catch {
    return { error: "Missing url parameter." };
  }
  const raw = parsed.searchParams.get("url");
  if (!raw) return { error: "Missing url parameter." };
  let target;
  try {
    target = new URL(raw.trim());
  } catch {
    return { error: "URL must use http(s)." };
  }
  if (target.protocol !== "http:" && target.protocol !== "https:") return { error: "URL must use http(s)." };
  if (target.username || target.password) return { error: "URL must not contain credentials." };
  if (blockedHostname(target.hostname, allowLoopback)) return { error: "URL must target a public http(s) host." };
  return { target };
}

// Handler factory. Production (Vercel function, dev/preview middleware) uses
// the default: loopback/private/link-local targets are rejected. Tests and
// local loopback fixtures may pass { allowLoopback: true } to exercise
// streaming/redirect/cancel behaviour through the same code path; cloud
// metadata and other non-public destinations stay blocked either way.
export function createImportUrlHandler(options = {}) {
  const { allowLoopback = false } = options;
  const lookup = makeValidatingLookup(allowLoopback);
  return async function handleImportUrlWithPolicy(req, res) {
    if (req.method !== "GET") {
      fail(res, 405, "Method not allowed.");
      return;
    }
    const { target, error } = parseRelayTarget(req.url ?? "/", req.headers.host, allowLoopback);
    if (!target) {
      fail(res, 400, error);
      return;
    }
    const controller = new AbortController();
    const deadline = setTimeout(() => {
      fail(res, 504, "Upstream timed out.");
      controller.abort();
    }, RELAY_TIMEOUT_MS);
    // Downstream cancellation only: res closes before the payload completed.
    // (req 'close' also fires on completed requests, so it cannot drive this.)
    const onResClose = () => {
      if (!res.writableEnded) controller.abort();
    };
    res.on("close", onResClose);
    try {
      const fetched = await fetchPublic(target, controller.signal, RELAY_MAX_REDIRECTS, lookup, allowLoopback);
      const upstream = fetched.response;
      const finalUrl = fetched.finalUrl;
    const declared = Number(upstream.headers["content-length"] ?? 0);
    if (Number.isFinite(declared) && declared > RELAY_MAX_BYTES) {
      upstream.destroy();
      fail(res, 413, "File exceeds the relay size limit.");
      return;
    }
    // Deliberately narrow: no upstream headers pass through except a
    // sanitized content type. No cookies, caching or credentials. The
    // resolved upstream filename (disposition, else final redirect URL) is
    // rebuilt as a safe attachment value so URL imports can determine the
    // format from the downloaded name without trusting upstream header text.
    res.writeHead(200, {
      "content-type": sanitizeContentType(upstream.headers["content-type"]),
      "cache-control": "no-store",
      "x-content-type-options": "nosniff",
      "content-disposition": relayAttachmentHeader(resolveRelayFilename(upstream.headers["content-disposition"], finalUrl)),
      "content-security-policy": "sandbox; default-src 'none'",
    });
    // The connection-phase abort listener is gone once headers arrive, so a
    // downstream cancel must destroy the live upstream stream explicitly.
    const abortUpstream = () => {
      try {
        upstream.destroy(Object.assign(new Error("Abgebrochen / Cancelled"), { code: "ABORT" }));
      } catch { /* Already torn down. */ }
    };
    if (controller.signal.aborted) abortUpstream();
    else controller.signal.addEventListener("abort", abortUpstream, { once: true });
    let bytes = 0;
    upstream.on("data", (chunk) => {
      bytes += chunk.length;
      if (bytes > RELAY_MAX_BYTES) {
        upstream.destroy(new Error("File exceeds the relay size limit."));
        return;
      }
      if (!res.write(chunk)) upstream.pause();
    });
    res.on("drain", () => upstream.resume());
    await new Promise((resolve, reject) => {
      upstream.on("end", resolve);
      upstream.on("error", reject);
      upstream.on("close", () => reject(new Error("Upstream closed early.")));
      res.on("close", () => reject(Object.assign(new Error("Abgebrochen / Cancelled"), { code: "ABORT" })));
    }).catch((streamError) => {
      if (streamError?.code === "ABORT" || controller.signal.aborted) return;
      throw streamError;
    }).finally(() => {
      controller.signal.removeEventListener("abort", abortUpstream);
    });
    if (!res.writableEnded && !controller.signal.aborted) res.end();
  } catch (fetchError) {
    if (controller.signal.aborted || fetchError?.code === "ABORT") {
      try { res.destroy(); } catch { /* Client went away. */ }
      return;
    }
    if (fetchError?.code === "RELAY_HTTP") {
      fail(res, fetchError.status ?? 502, "File unavailable (HTTP error).");
      return;
    }
    const message = String(fetchError?.message ?? fetchError);
    if (/not a public|private|loopback/i.test(message)) {
      fail(res, 400, "URL must target a public http(s) host.");
      return;
    }
    if (/timeout/i.test(message)) {
      fail(res, 504, "Upstream timed out.");
      return;
    }
    if (/size limit/i.test(message)) {
      fail(res, 413, "File exceeds the relay size limit.");
      return;
    }
    // Terse on purpose: no DNS/socket internals leak to clients.
      fail(res, 502, "File unavailable.");
    } finally {
      clearTimeout(deadline);
      res.off("close", onResClose);
    }
  };
}

// Shared Node http handler used by the Vercel function and local middleware.
export const handleImportUrl = createImportUrlHandler();
