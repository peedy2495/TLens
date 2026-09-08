import puppeteer from "puppeteer-core";
import { mkdir, open, writeFile, readFile } from "node:fs/promises";
import { resolve } from "node:path";
const size = Number(process.env.DLENS_BENCH_BYTES ?? 2_200_000_000);
const root = resolve("artifacts/storage-benchmark");
await mkdir(root, { recursive: true });
const filename = `${root}/records-${size}.xml`;
const row =
  "<Record><ID>001</ID><Payload>" + "a".repeat(8192) + "</Payload></Record>\n";
const count = Math.ceil((size - 20) / Buffer.byteLength(row));
const file = await open(filename, "w");
await file.write("<Records>\n");
for (let i = 0; i < count; i += 128)
  await file.write(row.repeat(Math.min(128, count - i)));
await file.write("</Records>");
await file.close();
const browser = await puppeteer.launch({
  executablePath: "/usr/bin/google-chrome",
  headless: true,
  protocolTimeout: 0,
  args: ["--no-sandbox", "--disable-dev-shm-usage"],
  userDataDir: root + `/profile-${size}`,
});
let peakRss = 0,
  timer,
  lastProgress = "";
async function rss(pid) {
  try {
    const text = await readFile(`/proc/${pid}/status`, "utf8");
    const children = (
      await readFile(`/proc/${pid}/task/${pid}/children`, "utf8")
    )
      .trim()
      .split(/\s+/)
      .filter(Boolean);
    return (
      Number(/VmRSS:\s+(\d+)/.exec(text)?.[1] ?? 0) * 1024 +
      (await Promise.all(children.map(rss))).reduce((a, b) => a + b, 0)
    );
  } catch {
    return 0;
  }
}
try {
  const page = await browser.newPage();
  page.on("console", (m) => {
    if (m.type() === "error") console.error(m.text());
  });
  await page.goto(
    (process.env.DLENS_TEST_URL ?? "http://127.0.0.1:4322") +
      "/__storage_benchmark__",
  );
  await page.setContent('<input type="file">');
  await page.exposeFunction("reportProgress", (progress) => {
    lastProgress = `${progress.phase} ${(progress.bytes / 1e6).toFixed(1)} MB, ${progress.records} records`;
  });
  await (await page.$("input")).uploadFile(filename);
  timer = setInterval(async () => {
    peakRss = Math.max(peakRss, await rss(browser.process().pid));
    console.log(lastProgress, `peak RSS ${(peakRss / 2 ** 20).toFixed(0)} MiB`);
  }, 5000);
  const result = await page.evaluate(
    async () => {
      const { StorageClient } = await import("/src/lib/storage/client.ts");
      const client = new StorageClient();
      for (const dataset of await client.request({ type: "list" }))
        await client.request({ type: "delete", dataset: dataset.id });
      const file = document.querySelector("input").files[0];
      const started = performance.now();
      const dataset = await client.request(
        {
          type: "import",
          file,
          csv: { delimiter: "auto", quote: '"', header: true },
        },
        { progress: window.reportProgress },
      );
      const seconds = (performance.now() - started) / 1000;
      const storage = await client.request({ type: "storage" });
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
      const queryStarted = performance.now();
      const result = await client.request({ type: "query", query });
      const querySeconds = (performance.now() - queryStarted) / 1000;
      client.close();
      return {
        bytes: file.size,
        records: dataset.count,
        seconds,
        querySeconds,
        visibleRows: result.tables[0]?.rows.length,
        total: result.total,
        storage,
        userAgent: navigator.userAgent,
      };
    },
    { timeout: 0 },
  );
  if (
    result.records !== count ||
    result.total !== count ||
    result.visibleRows !== Math.min(100, count)
  )
    throw new Error("Record count or pagination mismatch");
  result.peakBrowserRssBytes = peakRss;
  result.expectedRecords = count;
  await writeFile(
    `${root}/result-${size}.json`,
    JSON.stringify(result, null, 2),
  );
  console.log(JSON.stringify(result, null, 2));
} finally {
  clearInterval(timer);
  await browser.close();
}
