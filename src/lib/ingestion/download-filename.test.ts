import { describe, expect, it } from "vitest";
import {
  parseContentDisposition,
  resolveDownloadFilename,
  sanitizeDownloadFilename,
} from "./download-filename";

describe("download filename resolution", () => {
  it("prefers RFC 5987 filename* over the legacy filename parameter", () => {
    expect(
      parseContentDisposition(
        `attachment; filename="fallback.csv"; filename*=UTF-8''%E2%82%AC%20rates.csv`,
      ),
    ).toBe("€ rates.csv");
  });

  it("parses quoted filenames and strips directory components", () => {
    expect(parseContentDisposition('attachment; filename="report.csv"')).toBe("report.csv");
    expect(parseContentDisposition('attachment; filename="../../etc/report.csv"')).toBe("report.csv");
    expect(parseContentDisposition("attachment; filename=data.json")).toBe("data.json");
  });

  it("handles malformed values deterministically without throwing", () => {
    expect(parseContentDisposition("attachment; filename*=UTF-8''%E0%A4%A")).toBe(null);
    expect(parseContentDisposition("attachment; filename=")).toBe(null);
    expect(parseContentDisposition("attachment; filename=..")).toBe(null);
    expect(parseContentDisposition(null)).toBe(null);
    expect(parseContentDisposition("")).toBe(null);
    expect(sanitizeDownloadFilename("  ")).toBe(null);
    expect(sanitizeDownloadFilename("a/b\\c.csv")).toBe("c.csv");
  });

  it("falls back from headers to the final response URL, then the request URL", () => {
    expect(
      resolveDownloadFilename({
        disposition: null,
        responseUrl: "https://cdn.example.org/download/actual.csv?x=1",
        fallbackUrl: "https://example.org/extensionless",
      }),
    ).toBe("actual.csv");
    expect(
      resolveDownloadFilename({
        disposition: null,
        responseUrl: "https://cdn.example.org/",
        fallbackUrl: "https://example.org/extensionless",
      }),
    ).toBe("extensionless");
    expect(
      resolveDownloadFilename({
        disposition: 'attachment; filename="server.csv"',
        responseUrl: "https://cdn.example.org/other.json",
        fallbackUrl: "https://example.org/extensionless",
      }),
    ).toBe("server.csv");
  });

  it("returns null when no usable filename exists", () => {
    expect(
      resolveDownloadFilename({
        disposition: null,
        responseUrl: "https://cdn.example.org/",
        fallbackUrl: "https://example.org/",
      }),
    ).toBe(null);
  });
});
