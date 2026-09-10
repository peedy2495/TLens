// Browser-safe resolution of the trustworthy downloaded filename for URL imports.
// Priority: Content-Disposition filename* (RFC 5987 UTF-8) > filename >
// final response URL path > original request URL path. Never throws.

export interface DownloadFilenameInput {
  disposition: string | null | undefined;
  responseUrl?: string | null;
  fallbackUrl?: string | null;
}

const MAX_HEADER_SCAN = 2048;
const MAX_FILENAME_CHARS = 128;

export function sanitizeDownloadFilename(raw: unknown): string | null {
  if (typeof raw !== "string") return null;
  let value = raw.trim();
  if (!value) return null;
  const slash = Math.max(value.lastIndexOf("/"), value.lastIndexOf("\\"));
  if (slash >= 0) value = value.slice(slash + 1);
  // Strip control characters (including encoded ones that survived decoding).
  // eslint-disable-next-line no-control-regex
  value = value.replace(/[\x00-\x1f\x7f]/g, "").trim();
  if (!value || value === "." || value === "..") return null;
  if (value.length > MAX_FILENAME_CHARS) value = value.slice(0, MAX_FILENAME_CHARS);
  return value || null;
}

function safeDecode(value: string): string {
  try {
    return decodeURIComponent(value);
  } catch {
    return value;
  }
}

export function parseContentDisposition(header: unknown): string | null {
  if (typeof header !== "string" || !header) return null;
  const scanned = header.slice(0, MAX_HEADER_SCAN);
  // RFC 5987 UTF-8 filename* wins over the legacy filename parameter.
  const extended = /filename\*\s*=\s*(?:UTF-8|utf-8)''([^;\s]+)/.exec(scanned);
  if (extended) {
    try {
      const decoded = sanitizeDownloadFilename(decodeURIComponent(extended[1].trim()));
      if (decoded) return decoded;
    } catch {
      // Invalid percent-encoding: ignore filename* deterministically and
      // fall through to the legacy filename parameter (else null).
    }
  }
  const quoted = /filename\s*=\s*"([^"]{1,200})"/.exec(scanned);
  if (quoted) {
    const cleaned = sanitizeDownloadFilename(quoted[1]);
    if (cleaned) return cleaned;
  }
  const bare = /filename\s*=\s*([^;\s]{1,200})/.exec(scanned);
  if (bare) {
    let token = bare[1].trim();
    // A bare filename*=... (without charset prefix) is malformed: ignore it
    // deterministically instead of treating the encoded blob as a name.
    if (/^UTF-8''/i.test(token)) return null;
    if ((token.startsWith("'") && token.endsWith("'")) || (token.startsWith('"') && token.endsWith('"'))) {
      token = token.slice(1, -1);
    }
    const cleaned = sanitizeDownloadFilename(token);
    if (cleaned) return cleaned;
  }
  return null;
}

function basenameOfUrl(raw: string | null | undefined): string | null {
  if (typeof raw !== "string" || !raw) return null;
  try {
    const pathname = new URL(raw).pathname;
    const base = pathname.split("/").filter(Boolean).pop() ?? "";
    if (!base) return null;
    return sanitizeDownloadFilename(safeDecode(base));
  } catch {
    return null;
  }
}

export function resolveDownloadFilename(input: DownloadFilenameInput): string | null {
  const fromHeader = parseContentDisposition(input.disposition);
  if (fromHeader) return fromHeader;
  return basenameOfUrl(input.responseUrl) ?? basenameOfUrl(input.fallbackUrl);
}
