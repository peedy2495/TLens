import puppeteer from "puppeteer-core";
import { mkdir, writeFile } from "node:fs/promises";
import { resolve } from "node:path";
import assert from "node:assert/strict";
import { createConnectorServer } from "../server/connector.mjs";
import { once } from "node:events";
const root = resolve("artifacts/browser-check");
await mkdir(root, { recursive: true });
const origin = process.env.DLENS_TEST_URL ?? "http://127.0.0.1:4321";
const connector = createConnectorServer({
  token: "browser-test-token-00000000000000",
  origin,
  tables: ["events"],
  readRows: async function* () {
    yield { ID: "api-001", Person: { ID: "person1" } };
    yield { ID: "api-002" };
  },
});
connector.listen(0, "127.0.0.1");
await once(connector, "listening");
const endpoint = `http://127.0.0.1:${connector.address().port}/records?table=events`;
assert.equal((await fetch(endpoint)).status, 401);
assert.equal(
  (
    await fetch(endpoint, {
      headers: {
        Authorization: "Bearer browser-test-token-00000000000000",
        Origin: "https://wrong.example",
      },
    })
  ).status,
  403,
);
assert.equal(
  (
    await fetch(endpoint.replace("table=events", "table=forbidden"), {
      headers: { Authorization: "Bearer browser-test-token-00000000000000" },
    })
  ).status,
  404,
);
const browser = await puppeteer.launch({
  executablePath: "/usr/bin/google-chrome",
  headless: true,
  args: ["--no-sandbox", "--disable-dev-shm-usage"],
  userDataDir: root + "/profile-" + Date.now(),
});
try {
  const page = await browser.newPage();
  page.on("console", (m) => {
    if (m.type() === "error") console.error("CONSOLE:", m.text());
  });
  page.on("pageerror", (e) => console.error("PAGE:", e.message));
  await page.goto(process.env.DLENS_TEST_URL ?? "http://127.0.0.1:4321");
  await page.waitForSelector("input[type=file]:not(:disabled)");
  const name = `browser-${Date.now()}.xml`;
  const fixture =
    "<Events><Event><EventID>001</EventID><Date>2026-09-08</Date><Start>09:00</Start><End>10:00</End><People><Person><ID>p1</ID></Person></People></Event><Event><EventID>002</EventID><Date>2026-09-08</Date><Start>11:00</Start><End>12:00</End></Event></Events>";
  await writeFile(root + "/" + name, fixture);
  await (await page.$("input[type=file]")).uploadFile(root + "/" + name);
  await page.waitForFunction(
    () => document.body.textContent.includes("Datei lokal gespeichert"),
    { timeout: 30000 },
  );
  await page.waitForFunction(
    () => document.querySelectorAll("tbody tr").length === 2,
  );
  const text = await page.$eval("tbody", (el) => el.textContent);
  assert.match(text, /001/);
  assert.match(text, /002/);
  await page.screenshot({ path: root + "/import.png", fullPage: true });
  await page.click("tbody tr");
  await page.waitForSelector(".record-tree details");
  await page.click(".record-tree summary");
  await page.waitForFunction(
    () => document.querySelectorAll(".record-tree details").length > 1,
  );
  await page.reload();
  await page.waitForSelector(".source-button");
  await page.click(".source-button");
  await page.waitForFunction(
    (name) =>
      [...document.querySelectorAll(".sources button")].some((b) =>
        b.textContent.includes(name),
      ),
    {},
    name,
  );
  await page.evaluate(
    (name) =>
      [...document.querySelectorAll(".sources button")]
        .find((b) => b.textContent.includes(name))
        .click(),
    name,
  );
  await page.waitForFunction(
    () => document.querySelectorAll("tbody tr").length === 2,
  );
  const second = await browser.newPage();
  await second.goto(process.env.DLENS_TEST_URL ?? "http://127.0.0.1:4321");
  await second.waitForFunction(
    () => document.body.textContent.includes("anderem Tab"),
    { timeout: 30000 },
  );
  await second.close();
  await writeFile(
    root + "/cancel.xml",
    "<Events>" +
      "<Event><ID>cancel</ID><Text>" +
      "x".repeat(20000000) +
      "</Text></Event></Events>",
  );
  await (await page.$("input[type=file]")).uploadFile(root + "/cancel.xml");
  await page.waitForSelector(".import-progress button");
  const cancelStarted = Date.now();
  await page.click(".import-progress button");
  await page.waitForFunction(
    () => !document.querySelector(".import-progress"),
    { timeout: 10000 },
  );
  assert.ok(
    Date.now() - cancelStarted < 2000,
    "Cancellation must settle within two seconds",
  );
  assert.equal(await page.$$eval("tbody tr", (rows) => rows.length), 2);
  await page.click('button[title="Einstellungen"]');
  await page.waitForSelector("input[type=url]");
  await page.type("input[type=url]", endpoint);
  await page.type("input[type=password]", "browser-test-token-00000000000000");
  await page.evaluate(() =>
    [...document.querySelectorAll("button")]
      .find((b) => b.textContent === "Remote-Quelle importieren")
      .click(),
  );
  await page.waitForFunction(
    () => document.body.textContent.includes("Remote-Daten lokal gespeichert"),
    { timeout: 30000 },
  );
  await page.waitForFunction(() =>
    document.querySelector("tbody")?.textContent.includes("api-001"),
  );
  const clickText = async (text) => page.evaluate((text) => {
    const button = [...document.querySelectorAll("button")].find((b) => b.textContent === text);
    if (!button) throw new Error("Missing button: " + text);
    button.click();
  }, text);
  await page.click("tbody tr");
  page.once("dialog", (dialog) => dialog.dismiss());
  await clickText("Datensatz löschen");
  assert.equal(await page.$$eval("tbody tr", (rows) => rows.length), 2);
  page.once("dialog", (dialog) => dialog.accept());
  await clickText("Datensatz löschen");
  await page.waitForFunction(() => !document.querySelector(".record-dialog") && document.querySelectorAll("tbody tr").length === 1);
  assert.match(await page.$eval("tbody", (el) => el.textContent), /api-002/);
  await page.reload();
  await page.waitForSelector("input[type=file]:not(:disabled)");
  await page.click(".source-button");
  await page.evaluate(() => [...document.querySelectorAll(".sources button")].find((b) => b.textContent.includes("API ·")).click());
  await page.waitForFunction(() => document.querySelectorAll("tbody tr").length === 1);
  await page.click(".source-button");
  const trash = await page.$(".source-option .source-delete");
  const rowBounds = await trash.evaluate((button) => {
    const row = button.parentElement.getBoundingClientRect();
    const icon = button.getBoundingClientRect();
    return Math.abs(row.right - icon.right);
  });
  assert.ok(rowBounds < 2, "Trash button must align with the right edge");
  page.once("dialog", (dialog) => dialog.dismiss());
  await trash.click();
  assert.equal(await page.$$(".source-option").then((rows) => rows.length), 2);
  page.once("dialog", (dialog) => dialog.accept());
  await trash.click();
  await page.waitForFunction(() => document.querySelectorAll(".source-option").length === 1);
  assert.match(await page.$eval(".source-button", (el) => el.textContent), /API ·/);
  assert.match(await page.$eval("tbody", (el) => el.textContent), /api-002/);
  await page.click('button[title="Einstellungen"]');
  await page.waitForFunction(() => ![...document.querySelectorAll("button")].find((b) => b.textContent === "Alle importierten Daten löschen")?.disabled);
  page.once("dialog", (dialog) => dialog.accept());
  await clickText("Alle importierten Daten löschen");
  await page.waitForFunction(() => [...document.querySelectorAll("button")].find((b) => b.textContent === "Alle importierten Daten löschen")?.disabled);
  await page.waitForFunction(() => !document.querySelector("input[type=file]").disabled);
  // Reset must remain available even when no datasets are visible.
  assert.equal(await page.evaluate(() => [...document.querySelectorAll("button")].find((b) => b.textContent === "Alle importierten Daten löschen").disabled), false);
  page.once("dialog", (dialog) => dialog.accept());
  await clickText("Alle importierten Daten löschen");
  await page.waitForFunction(() => !document.querySelector("input[type=file]").disabled);
  await page.reload();
  await page.waitForSelector("input[type=file]:not(:disabled)");
  await page.click(".source-button");
  assert.equal(await page.$$eval(".sources button", (buttons) => buttons.filter((b) => /browser-|API ·/.test(b.textContent)).length), 0);
  await (await page.$("input[type=file]")).uploadFile(root + "/" + name);
  await page.waitForFunction(() => document.querySelectorAll("tbody tr").length === 2);
  await (await page.$("input[type=file]")).uploadFile(resolve("src/lib/ingestion/fixtures/win10vm.yaml"));
  await page.waitForFunction(() => document.querySelector(".source-button")?.textContent.includes("win10vm.yaml"), { timeout: 30000 });
  await page.waitForFunction(() => document.querySelectorAll("tbody tr").length > 0);
  await page.waitForSelector("input[type=file]:not(:disabled)");
  await (await page.$("input[type=file]")).uploadFile(resolve("src/lib/ingestion/fixtures/win10vm.kyaml"));
  await page.waitForFunction(() => document.querySelector(".source-button")?.textContent.includes("win10vm.kyaml"), { timeout: 30000 });
  await page.waitForFunction(() => document.querySelector("tbody")?.textContent.includes("VirtualMachineInstance"));
  assert.equal(await page.$$eval("tbody tr", (rows) => rows.length), 1);
  const largeRecord = root + "/limit-record.json";
  await writeFile(largeRecord, JSON.stringify([{ ID: "large-record", Items: Array(31000).fill(0) }]));
  await page.waitForSelector("input[type=file]:not(:disabled)");
  await (await page.$("input[type=file]")).uploadFile(largeRecord);
  await page.waitForSelector(".import-warning");
  assert.equal(await page.$$eval(".import-warning button", (buttons) => buttons.length), 2);
  await clickText("Fortsetzen");
  await page.waitForFunction(() => document.querySelector(".import-warning")?.textContent.includes("20.000"));
  await clickText("Fortsetzen und für diesen Import nicht erneut fragen");
  await page.waitForFunction(() => document.querySelector("tbody")?.textContent.includes("large-record"));
  await page.waitForSelector("input[type=file]:not(:disabled)");
  await (await page.$("input[type=file]")).uploadFile(largeRecord);
  await page.waitForSelector(".import-warning");
  await clickText("Import abbrechen");
  await page.waitForSelector("input[type=file]:not(:disabled)");
  assert.match(await page.$eval("tbody", (el) => el.textContent), /large-record/);
  console.log(
    "PASS: UI XML import, OPFS reload, source selection, exclusive tab ownership, cancellation, authenticated HTTP connector, deletion confirmation, record/source deletion, reset, reimport and backend access controls",
  );
} catch (error) {
  for (const page of await browser.pages())
    console.error(await page.evaluate(() => document.body.innerText));
  throw error;
} finally {
  await browser.close();
  connector.close();
}
