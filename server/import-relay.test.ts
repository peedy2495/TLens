import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createServer, type Server } from "node:http";
import { once } from "node:events";
import {
  RELAY_MAX_BYTES,
  createImportUrlHandler,
  handleImportUrl,
  isPublicAddress,
  parseRelayTarget,
} from "./import-relay.mjs";

const CSV = "Name,Value\na,1\nb,2\n";

let upstreamSeen: Record<string, string | undefined> = {};
let upstreamBody = CSV;
let servers: Server[] = [];

async function listen(server: Server): Promise<string> {
  servers.push(server);
  server.listen(0, "127.0.0.1");
  await once(server, "listening");
  const address = server.address();
  const port = typeof address === "object" && address ? address.port : 0;
  return `http://127.0.0.1:${port}`;
}

function upstream() {
  return createServer((req, res) => {
    upstreamSeen = { cookie: req.headers.cookie, authorization: req.headers.authorization };
    const url = new URL(req.url ?? "/", "http://127.0.0.1");
    if (url.pathname === "/file.csv") {
      res.writeHead(200, {
        "content-type": "text/csv; charset=utf-8",
        "content-length": Buffer.byteLength(upstreamBody),
        // Must never reach relay clients.
        "set-cookie": "session=secret",
        "x-custom-header": "evil",
      });
      res.end(upstreamBody);
      return;
    }
    if (url.pathname === "/redirect") {
      res.writeHead(302, { location: "/file.csv" });
      res.end();
      return;
    }
    if (url.pathname === "/named.csv") {
      res.writeHead(200, {
        "content-type": "text/csv; charset=utf-8",
        "content-disposition": 'attachment; filename="server name.csv"',
      });
      res.end(upstreamBody);
      return;
    }
    if (url.pathname === "/evil") {
      res.writeHead(200, {
        "content-type": "text/csv",
        // Must never pass through verbatim: path components are stripped.
        "content-disposition": 'attachment; filename="../../etc/passwd"',
      });
      res.end(upstreamBody);
      return;
    }
    if (url.pathname === "/redirect-named") {
      res.writeHead(302, { location: "/named.csv" });
      res.end();
      return;
    }
    if (url.pathname === "/redirect-private") {
      res.writeHead(302, { location: "http://169.254.169.254/latest/meta-data" });
      res.end();
      return;
    }
    if (url.pathname === "/redirect-loop") {
      res.writeHead(302, { location: "/redirect-loop" });
      res.end();
      return;
    }
    if (url.pathname === "/huge") {
      res.writeHead(200, {
        "content-type": "text/csv",
        "content-length": String(RELAY_MAX_BYTES + 1),
      });
      res.end("too big");
      return;
    }
    res.writeHead(404, { "content-type": "text/plain" });
    res.end("missing");
  });
}

function relay(handler: (req: never, res: never) => Promise<void>) {
  return createServer((req, res) => {
    void handler(req as never, res as never);
  });
}

let fileOrigin = "";
let openRelay = "";
let strictRelay = "";

beforeAll(async () => {
  fileOrigin = await listen(upstream());
  // Loopback fixtures exercise streaming/redirect/cancel through the same
  // code path; production uses the strict default handler instead.
  openRelay = await listen(relay(createImportUrlHandler({ allowLoopback: true })));
  strictRelay = await listen(relay(handleImportUrl));
});

afterAll(() => {
  for (const server of servers) server.close();
  servers = [];
});

async function relayGet(base: string, target: string, init?: RequestInit): Promise<Response> {
  return fetch(`${base}/api/import-url?url=${encodeURIComponent(target)}`, init);
}

describe("import relay SSRF policy (strict default)", () => {
  it.each([
    ["http://127.0.0.1/file.csv", "loopback IPv4"],
    ["http://10.0.0.5/file.csv", "private 10/8"],
    ["http://192.168.1.10/file.csv", "private 192.168/16"],
    ["http://169.254.169.254/latest", "cloud metadata IP"],
    ["http://[::1]/file.csv", "IPv6 loopback"],
    ["http://[::ffff:127.0.0.1]/file.csv", "mapped loopback"],
    ["http://localhost/file.csv", "localhost name"],
    ["http://metadata.google.internal/", "metadata hostname"],
    ["http://user:pass@example.com/file.csv", "URL credentials"],
    ["ftp://example.com/file.csv", "non-http scheme"],
  ])("rejects %s (%s) without fetching upstream", async (target) => {
    const response = await relayGet(strictRelay, target);
    expect(response.status).toBe(400);
    expect(await response.text()).toMatch(/public http\(s\)|credentials|http\(s\)|Missing/);
  });

  it("rejects a missing url parameter and non-GET methods", async () => {
    expect((await fetch(`${strictRelay}/api/import-url`)).status).toBe(400);
    expect((await fetch(`${strictRelay}/api/import-url?url=${encodeURIComponent("https://example.com/a.csv")}`, { method: "POST" })).status).toBe(405);
  });

  it("rejects redirects to non-public destinations", async () => {
    const response = await relayGet(openRelay, `${fileOrigin}/redirect-private`);
    expect(response.status).toBe(400);
    expect(await response.text()).toMatch(/public http\(s\)/);
  });

  it("stops redirect loops with a terse error", async () => {
    const response = await relayGet(openRelay, `${fileOrigin}/redirect-loop`);
    expect(response.status).toBe(502);
    expect(await response.text()).toBe("File unavailable (HTTP error).");
  });
});

describe("import relay streaming", () => {
  it("streams the file without forwarding cookies, auth or upstream headers", async () => {
    const response = await relayGet(openRelay, `${fileOrigin}/file.csv`, {
      headers: { cookie: "caller=1", authorization: "Bearer caller" },
    });
    expect(response.status).toBe(200);
    expect(response.headers.get("content-type")).toContain("text/csv");
    expect(response.headers.get("cache-control")).toBe("no-store");
    expect(response.headers.get("set-cookie")).toBeNull();
    expect(response.headers.get("x-custom-header")).toBeNull();
    expect(await response.text()).toBe(CSV);
    expect(upstreamSeen.cookie).toBeUndefined();
    expect(upstreamSeen.authorization).toBeUndefined();
  });

  it("follows same-origin redirects", async () => {
    const response = await relayGet(openRelay, `${fileOrigin}/redirect`);
    expect(response.status).toBe(200);
    expect(await response.text()).toBe(CSV);
  });

  it("maps upstream HTTP failures tersely and rejects oversized payloads explicitly", async () => {
    const missing = await relayGet(openRelay, `${fileOrigin}/missing`);
    expect(missing.status).toBe(404);
    expect(await missing.text()).toBe("File unavailable (HTTP error).");
    const huge = await relayGet(openRelay, `${fileOrigin}/huge`);
    expect(huge.status).toBe(413);
  });

  it("stops upstream work when the downstream client cancels", async () => {
    let chunksWritten = 0;
    const slowUpstream = createServer((req, res) => {
      res.writeHead(200, { "content-type": "text/csv" });
      const timer = setInterval(() => {
        chunksWritten++;
        if (!res.write("Name,Value\n")) clearInterval(timer);
      }, 5);
      // The response closing means the relay stopped consuming upstream.
      res.on("close", () => {
        clearInterval(timer);
        (slowUpstream as unknown as { closedUpstream?: boolean }).closedUpstream = true;
      });
    });
    const slowOrigin = await listen(slowUpstream);
    const slowRelay = await listen(relay(createImportUrlHandler({ allowLoopback: true })));
    const controller = new AbortController();
    // Headers arrive (200) before the abort, like a real UI cancellation
    // mid-import: the streamed body must fail and upstream work must stop.
    const response = await fetch(`${slowRelay}/api/import-url?url=${encodeURIComponent(`${slowOrigin}/slow.csv`)}`, {
      signal: controller.signal,
    });
    expect(response.status).toBe(200);
    const reader = response.body!.getReader();
    await reader.read();
    controller.abort();
    await expect(reader.read()).rejects.toThrow();
    await new Promise((resolve) => setTimeout(resolve, 100));
    expect((slowUpstream as unknown as { closedUpstream?: boolean }).closedUpstream).toBe(true);
    expect(chunksWritten).toBeGreaterThan(0);
  });
});

describe("public address checks", () => {
  it.each([
    ["8.8.8.8", true],
    ["1.1.1.1", true],
    ["127.0.0.1", false],
    ["10.1.2.3", false],
    ["172.16.0.1", false],
    ["172.31.255.255", false],
    ["172.32.0.1", true],
    ["192.168.0.1", false],
    ["169.254.169.254", false],
    ["100.64.0.1", false],
    ["224.0.0.1", false],
    ["0.0.0.0", false],
    ["::1", false],
    ["fe80::1", false],
    ["fc00::1", false],
    ["ff02::1", false],
    ["::ffff:127.0.0.1", false],
    ["::ffff:8.8.8.8", true],
    ["2001:db8::1", false],
    ["2606:4700:4700::1111", true],
  ])("isPublicAddress(%s) === %s", (ip, expected) => {
    expect(isPublicAddress(ip)).toBe(expected);
  });

  it("keeps parse errors terse and credential-free", async () => {
    expect(parseRelayTarget("/api/import-url", "x").error).toBe("Missing url parameter.");
    const secret = await (await relayGet(strictRelay, "http://user:hunter2@10.0.0.1/x.csv")).text();
    expect(secret).not.toContain("hunter2");
  });

  it("exposes the shared handler as the deployed Vercel route", async () => {
    const route = await import("../api/import-url.mjs");
    expect(typeof route.default).toBe("function");
  });
});

describe("relay filename propagation", () => {
  it("preserves the upstream disposition filename as a safe attachment", async () => {
    const response = await relayGet(openRelay, `${fileOrigin}/named.csv`);
    expect(response.status).toBe(200);
    const disposition = response.headers.get("content-disposition") ?? "";
    expect(disposition).toMatch(/^attachment/);
    expect(disposition).toContain('filename="server name.csv"');
    expect(await response.text()).toBe(CSV);
  });

  it("follows redirects and keeps the final filename without path traversal", async () => {
    const redirected = await relayGet(openRelay, `${fileOrigin}/redirect-named`);
    expect(redirected.status).toBe(200);
    expect(redirected.headers.get("content-disposition")).toContain('filename="server name.csv"');

    const evil = await relayGet(openRelay, `${fileOrigin}/evil`);
    expect(evil.status).toBe(200);
    const disposition = evil.headers.get("content-disposition") ?? "";
    expect(disposition).toMatch(/^attachment/);
    expect(disposition).not.toContain("../");
    expect(disposition).toContain("passwd");
    await evil.text();
  });
});

describe("relay final boundary checks", () => {  it.each(["fe90::1", "febf::1", "fecf::1", "0:0:0:0:0:ffff:7f00:1", "2002:7f00:1::", "192.0.0.8"])("rejects non-public or transition destination %s", address => {
    expect(isPublicAddress(address)).toBe(false);
  });
});
