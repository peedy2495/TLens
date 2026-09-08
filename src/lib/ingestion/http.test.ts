import { afterEach, expect, it, vi } from "vitest";
import sqlite3InitModule from "@sqlite.org/sqlite-wasm";
import { Repository } from "../storage/repository";
import { HttpConnector, ndjsonParser } from "./http";
import { ingestConnector } from "./service";
afterEach(() => vi.unstubAllGlobals());
it("ingests bounded API batches through the same repository and releases the stream", async () => {
  const sqlite = await sqlite3InitModule(),
    repo = new Repository(new sqlite.oo1.DB(":memory:"), sqlite);
  let pulls = 0;
  vi.stubGlobal(
    "fetch",
    vi.fn(async (_url, options) => {
      expect(options.headers.Authorization).toBe("Bearer temporary");
      return new Response(
        new ReadableStream({
          pull(controller) {
            pulls++;
            if (pulls === 1)
              controller.enqueue(
                new TextEncoder().encode(
                  '{"ID":"001","Nested":{"Value":true}}\n',
                ),
              );
            else if (pulls === 2)
              controller.enqueue(new TextEncoder().encode('{"ID":"002"}\n'));
            else controller.close();
          },
        }),
        { headers: { "content-type": "application/x-ndjson" } },
      );
    }),
  );
  try {
    const data = await ingestConnector(
      repo,
      new HttpConnector("https://example.test/records", "temporary"),
      "API",
      "api",
      0,
      new AbortController().signal,
      () => {},
      ndjsonParser,
    );
    expect(data.count).toBe(2);
    expect(data.filterColumns).toContain("Value");
    expect(JSON.stringify(repo.list())).not.toContain("temporary");
  } finally {
    repo.close();
  }
});
it("rejects credentials in URLs, insecure remote HTTP and unexpected content", async () => {
  expect(() => new HttpConnector("https://user:pass@example.test")).toThrow();
  expect(() => new HttpConnector("http://example.test")).toThrow();
  vi.stubGlobal(
    "fetch",
    async () =>
      new Response("not ndjson", { headers: { "content-type": "text/plain" } }),
  );
  await expect(
    new HttpConnector("https://example.test").open(
      new AbortController().signal,
    ),
  ).rejects.toThrow("ndjson");
});
