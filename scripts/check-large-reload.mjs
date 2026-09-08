import puppeteer from "puppeteer-core";
import { open, writeFile } from "node:fs/promises";
import { resolve } from "node:path";
import assert from "node:assert/strict";
const root = resolve("artifacts/storage-benchmark");
const browser = await puppeteer.launch({
  executablePath: "/usr/bin/google-chrome",
  headless: true,
  protocolTimeout: 0,
  args: ["--no-sandbox", "--disable-dev-shm-usage"],
  userDataDir: root + "/profile-2200000000",
});
const output = await open(root + "/large-export.json", "w");
let bytes = 0,
  records = 0;
try {
  const page = await browser.newPage();
  await page.goto(
    (process.env.DLENS_TEST_URL ?? "http://127.0.0.1:4322") +
      "/__storage_benchmark__",
  );
  await page.exposeFunction("saveChunk", async (chunk) => {
    bytes += Buffer.byteLength(chunk);
    records += (chunk.match(/"ID":"001"/g) ?? []).length;
    await output.write(chunk);
  });
  const result = await page.evaluate(async () => {
    const { StorageClient } = await import("/src/lib/storage/client.ts");
    const client = new StorageClient();
    const dataset = (await client.request({ type: "list" }))[0];
    const query = {
      dataset: dataset.id,
      query: "",
      filters: [],
      language: "de",
      filterColumn: "ID",
      day: "",
      today: "2026-09-08",
      mapping: dataset.mapping,
      colorColumn: "ID",
      sorts: {},
      pages: {},
    };
    const started = performance.now();
    const result = await client.request({ type: "query", query });
    const querySeconds = (performance.now() - started) / 1000;
    const exportStarted = performance.now();
    await client.request(
      {
        type: "export",
        format: "json",
        query,
        csv: { delimiter: "auto", quote: '"', header: true },
      },
      { chunk: window.saveChunk },
    );
    const exportSeconds = (performance.now() - exportStarted) / 1000;
    // A failing destination must cancel the worker export and release its queue.
    let rejected = false;
    try {
      await client.request(
        {
          type: "export",
          format: "json",
          query,
          csv: { delimiter: "auto", quote: '"', header: true },
        },
        {
          chunk: async () => {
            throw new Error("Test destination full");
          },
        },
      );
    } catch {
      rejected = true;
    }
    const afterError = await client.request({ type: "list" });
    const storage = await client.request({ type: "storage" });
    client.close();
    return {
      count: dataset.count,
      total: result.total,
      rows: result.tables[0].rows.length,
      querySeconds,
      exportSeconds,
      exportFailureReleasedQueue: rejected && afterError.length === 1,
      storage,
    };
  });
  assert.equal(result.count, 266958);
  assert.equal(records, result.count);
  assert.equal(result.total, result.count);
  assert.equal(result.rows, 100);
  assert.ok(result.exportFailureReleasedQueue);
  await writeFile(
    root + "/reload-export-result.json",
    JSON.stringify(
      { ...result, exportBytes: bytes, exportedRecords: records },
      null,
      2,
    ),
  );
  console.log(
    JSON.stringify(
      { ...result, exportBytes: bytes, exportedRecords: records },
      null,
      2,
    ),
  );
} finally {
  await output.close();
  await browser.close();
}
