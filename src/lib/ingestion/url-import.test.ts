import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from "vitest";
import sqlite3InitModule, { type Sqlite3Static } from "@sqlite.org/sqlite-wasm";
import { Repository } from "../storage/repository";
import { ingestFromUrl } from "./service";
import { defaultCsvOptions } from "../csv";
import { limits } from "./contracts";

let sqlite: Sqlite3Static;
beforeAll(async () => {
  sqlite = await sqlite3InitModule();
});
const repos: Repository[] = [];
afterAll(() => repos.forEach((repo) => repo.close()));
afterEach(() => vi.unstubAllGlobals());

function repository(): Repository {
  const repo = new Repository(new sqlite.oo1.DB(":memory:"), sqlite);
  repos.push(repo);
  return repo;
}

const signal = () => new AbortController().signal;
const noop = () => {};
const SOURCE_URL = "https://example.org/data.csv";

function directResponse(body: string, init?: ResponseInit): Response {
  return new Response(body, init);
}

function stubFetch(implementation: (url: string) => Promise<Response> | Response) {
  const calls: string[] = [];
  vi.stubGlobal(
    "fetch",
    vi.fn(async (url: string) => {
      calls.push(String(url));
      return implementation(String(url));
    }),
  );
  return calls;
}

describe("URL import transport", () => {
  it("keeps CORS-enabled direct streaming without touching the relay", async () => {
    const calls = stubFetch(() => directResponse("Name,Value\na,1\n"));
    const repo = repository();
    const dataset = await ingestFromUrl(repo, SOURCE_URL, defaultCsvOptions, signal(), noop, "de");
    expect(calls).toEqual([SOURCE_URL]);
    expect(Array.isArray(dataset) ? dataset[0].name : dataset.name).toBe("data.csv");
    const stored = Array.isArray(dataset) ? dataset[0] : dataset;
    expect(stored.source).toMatchObject({ kind: "url", url: SOURCE_URL });
    expect(repo.query({
      dataset: stored.id, query: "", filters: [], language: "de", filterColumn: "Name",
      day: "", today: "2026-09-08", mapping: { start: "", end: "" }, colorColumn: "Name", sorts: {}, pages: {},
    }).total).toBe(1);
  });

  it.each([
    ["row.json", '[{"ID":"r1"}]'],
    ["row.csv", "Name,Value\na,1\n"],
    ["row.xml", "<Events><Event><EventID>007</EventID></Event></Events>"],
    ["row.yaml", "EventID: \"009\"\n"],
  ])("falls back to the same-origin relay for %s after a CORS/network failure", async (filename, body) => {
    const source = `https://cdn.example.org/${filename}`;
    const calls = stubFetch((url) =>
      url === source
        ? Promise.reject(new TypeError("Failed to fetch"))
        : (() => {
          const response = directResponse(body, { headers: { "content-disposition": "attachment" } });
          // Real fetch responses carry the transport URL; it is not a filename.
          Object.defineProperty(response, "url", { value: `https://dlens.example/api/import-url?url=${encodeURIComponent(source)}` });
          return response;
        })(),
    );
    const repo = repository();
    const result = await ingestFromUrl(repo, source, defaultCsvOptions, signal(), noop, "de");
    const datasets = Array.isArray(result) ? result : [result];
    expect(calls[0]).toBe(source);
    expect(calls[1]).toMatch(/^\/api\/import-url\?url=/);
    expect(decodeURIComponent(calls[1].split("url=")[1])).toBe(source);
    // Identity and display keep the original URL, never the relay address.
    for (const dataset of datasets) {
      expect(dataset.source).toMatchObject({ kind: "url", url: source });
      expect(dataset.name).toBe(filename);
      expect(JSON.stringify(dataset)).not.toContain("/api/import-url");
    }
    const rows = repo.query({
      dataset: datasets[0].id, query: "", filters: [], language: "de", filterColumn: "ID",
      day: "", today: "2026-09-08", mapping: { start: "", end: "" }, colorColumn: "ID", sorts: {}, pages: {},
    }).tables[0]?.rows ?? [];
    expect(rows.length).toBeGreaterThan(0);
  });

  it("treats direct HTTP answers as authoritative and never retries the relay", async () => {
    const calls = stubFetch(() => directResponse("missing", { status: 404 }));
    await expect(
      ingestFromUrl(repository(), SOURCE_URL, defaultCsvOptions, signal(), noop, "de"),
    ).rejects.toThrow("HTTP 404");
    expect(calls).toEqual([SOURCE_URL]);
  });

  it("never retries the relay after cancellation", async () => {
    const calls = stubFetch(() => {
      const error = new DOMException("Aborted", "AbortError");
      return Promise.reject(error);
    });
    const controller = new AbortController();
    controller.abort();
    await expect(
      ingestFromUrl(repository(), SOURCE_URL, defaultCsvOptions, controller.signal, noop, "de"),
    ).rejects.toThrow("Abgebrochen / Cancelled");
    expect(calls).toEqual([SOURCE_URL]);
  });

  it("enforces the YAML limit on relayed payloads", async () => {
    const yamlUrl = SOURCE_URL.replace(/\.csv$/, ".yaml");
    stubFetch((url) =>
      url === yamlUrl
        ? Promise.reject(new TypeError("Failed to fetch"))
        : directResponse(`value: "${"x".repeat(limits.yamlBytes)}"\n`),
    );
    await expect(
      ingestFromUrl(repository(), yamlUrl, defaultCsvOptions, signal(), noop, "de"),
    ).rejects.toThrow("Maximal 5 MB");
  });

  it("reports an actionable bilingual error when both paths fail, and the size limit on relay 413", async () => {
    stubFetch((url) =>
      url === SOURCE_URL
        ? Promise.reject(new TypeError("Failed to fetch"))
        : Promise.reject(new TypeError("relay down")),
    );
    await expect(
      ingestFromUrl(repository(), SOURCE_URL, defaultCsvOptions, signal(), noop, "de"),
    ).rejects.toThrow(/Relay nicht erreichbar.*relay unavailable/);

    stubFetch((url) =>
      url === SOURCE_URL
        ? Promise.reject(new TypeError("Failed to fetch"))
        : directResponse("too big", { status: 413 }),
    );
    await expect(
      ingestFromUrl(repository(), SOURCE_URL, defaultCsvOptions, signal(), noop, "de"),
    ).rejects.toThrow(/Größenbegrenzung.*size limit/);
  });
});

function responseWithUrl(body: string, url: string, init?: ResponseInit): Response {
  const response = directResponse(body, init);
  Object.defineProperty(response, "url", { value: url });
  return response;
}

describe("URL import downloaded filenames", () => {
  it("accepts an extensionless URL and uses the Content-Disposition filename", async () => {
    const extensionless = "https://example.org/download?id=42";
    stubFetch(() => responseWithUrl("Name,Value\na,1\n", extensionless, {
      headers: { "content-disposition": 'attachment; filename="server-data.csv"' },
    }));
    const repo = repository();
    const result = await ingestFromUrl(repo, extensionless, defaultCsvOptions, signal(), noop, "de");
    const stored = Array.isArray(result) ? result[0] : result;
    expect(stored.name).toBe("server-data.csv");
    expect(stored.source).toMatchObject({ kind: "url", url: extensionless, filename: "server-data.csv" });
  });

  it("prefers filename* and falls back to the final response URL path", async () => {
    const extensionless = "https://example.org/download?id=7";
    stubFetch(() =>
      responseWithUrl("Name,Value\na,1\n", "https://cdn.example.org/files/redirected.csv", {
        headers: { "content-disposition": "attachment; filename*=UTF-8''%E2%82%AC%20rates.csv" },
      }),
    );
    const repo = repository();
    const result = await ingestFromUrl(repo, extensionless, defaultCsvOptions, signal(), noop, "de");
    expect(Array.isArray(result) ? result[0].name : result.name).toBe("€ rates.csv");

    stubFetch(() =>
      responseWithUrl("Name,Value\na,1\n", "https://cdn.example.org/files/redirected.csv"),
    );
    const second = await ingestFromUrl(repository(), extensionless, defaultCsvOptions, signal(), noop, "de");
    expect(Array.isArray(second) ? second[0].name : second.name).toBe("redirected.csv");
  });

  it("rejects an unsupported downloaded filename bilingually after the response", async () => {
    const extensionless = "https://example.org/download?id=9";
    stubFetch(() => responseWithUrl("plain text", extensionless, {
      headers: { "content-disposition": 'attachment; filename="notes.txt"' },
    }));
    await expect(
      ingestFromUrl(repository(), extensionless, defaultCsvOptions, signal(), noop, "de"),
    ).rejects.toThrow(/heruntergeladene Datei.*has no supported format/);
  });

  it("retries the relay when direct headers hide the server filename, never on abort", async () => {
    const extensionless = "https://example.org/no-headers?id=1";
    const calls = stubFetch((url) =>
      url === extensionless
        ? directResponse("Name,Value\na,1\n")
        : responseWithUrl("Name,Value\na,1\n", url, {
          headers: { "content-disposition": 'attachment; filename="relayed.csv"' },
        }),
    );
    const repo = repository();
    const result = await ingestFromUrl(repo, extensionless, defaultCsvOptions, signal(), noop, "de");
    const stored = Array.isArray(result) ? result[0] : result;
    expect(calls).toHaveLength(2);
    expect(calls[1]).toMatch(/^\/api\/import-url\?url=/);
    expect(stored.name).toBe("relayed.csv");
    expect(stored.source).toMatchObject({ kind: "url", url: extensionless });

    const aborted = new AbortController();
    aborted.abort();
    stubFetch(() => directResponse("Name,Value\na,1\n"));
    const abortCalls = stubFetch(() => directResponse("Name,Value\na,1\n"));
    await expect(
      ingestFromUrl(repository(), extensionless, defaultCsvOptions, aborted.signal, noop, "de"),
    ).rejects.toThrow("Abgebrochen / Cancelled");
    expect(abortCalls).toHaveLength(1);
  });

  it("keeps the same downloaded basename from distinct URLs separate (YAML)", async () => {
    const firstUrl = "https://example.org/a/export";
    const secondUrl = "https://example.org/b/export";
    stubFetch((url) => {
      const body = url === firstUrl ? "EventID: \"101\"\n" : "EventID: \"202\"\n";
      return responseWithUrl(body, url, {
        headers: { "content-disposition": 'attachment; filename="bundle.yaml"' },
      });
    });
    const repo = repository();
    const first = await ingestFromUrl(repo, firstUrl, defaultCsvOptions, signal(), noop, "de");
    const second = await ingestFromUrl(repo, secondUrl, defaultCsvOptions, signal(), noop, "de");
    const firstStored = Array.isArray(first) ? first[0] : first;
    const secondStored = Array.isArray(second) ? second[0] : second;
    expect(firstStored.name).toBe("bundle.yaml");
    expect(secondStored.name).toBe("bundle.yaml");
    expect(firstStored.id).not.toBe(secondStored.id);
    expect(firstStored.source).toMatchObject({ kind: "url", url: firstUrl });
    expect(secondStored.source).toMatchObject({ kind: "url", url: secondUrl });
    expect(repo.list()).toHaveLength(2);
  });
});
