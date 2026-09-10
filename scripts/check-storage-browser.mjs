import puppeteer from "puppeteer-core";
import { mkdir, writeFile } from "node:fs/promises";
import { resolve } from "node:path";
import assert from "node:assert/strict";
import { createServer } from "node:http";
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
  await page.evaluate(() => [...document.querySelectorAll("button")].find(b => b.textContent.includes("Datenbank hinzufügen")).click());
  await page.waitForSelector('.settings-group input[type=url]');
  await page.type('.settings-group input[type=url]', endpoint.replace(/\/records.*$/, ""));
  await page.click(".settings-back");
  await page.click(".source-button");
  await page.select(".sources select", await page.$eval(".sources select option:nth-child(2)", el => el.value));
  await page.type(".sources input[type=password]", "browser-test-token-00000000000000");
  await page.evaluate(() => [...document.querySelectorAll("button")].find(b => b.textContent === "Verfügbare Quellen laden").click());
  await page.waitForFunction(() => document.querySelectorAll(".sources select").length === 2);
  await (await page.$$(".sources select"))[1].select("events");
  await page.evaluate(() => [...document.querySelectorAll("button")].find(b => b.textContent.includes("Connector importieren")).click());
  await page.waitForFunction(() => document.body.textContent.includes("Connector-Daten lokal gespeichert"), { timeout: 30000 });
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
  await page.evaluate(() => [...document.querySelectorAll(".sources button")].find((b) => b.textContent.includes("Datenbank ·")).click());
  await page.waitForFunction(() => document.querySelectorAll("tbody tr").length === 1);
  await page.click(".source-button");
  const trash = await page.$(".source-option .source-delete");
  const rowBounds = await trash.evaluate((button) => {
    const actions = button.closest(".source-actions") ?? button.parentElement;
    const row = button.closest(".source-option").getBoundingClientRect();
    const edge = actions.getBoundingClientRect();
    return Math.abs(row.right - edge.right);
  });
  assert.ok(rowBounds < 2, "Trash button must align with the right edge");
  page.once("dialog", (dialog) => dialog.dismiss());
  await trash.click();
  assert.equal(await page.$$(".source-option").then((rows) => rows.length), 2);
  page.once("dialog", (dialog) => dialog.accept());
  await trash.click();
  await page.waitForFunction(() => document.querySelectorAll(".source-option").length === 1);
  assert.match(await page.$eval(".source-button", (el) => el.textContent), /Datenbank ·/);
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
  assert.equal(await page.$$eval(".sources button", (buttons) => buttons.filter((b) => /browser-|Datenbank ·/.test(b.textContent)).length), 0);
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
  // --- URL import without upstream CORS: direct fetch fails, the
  // same-origin relay streams the file. Requires the dev/preview server with
  // DLENS_RELAY_ALLOW_LOOPBACK=1 so the relay may fetch this loopback fixture.
  let urlCsv = "EventID,Date,Start,End,Area\nURL-001,2026-09-08,09:00,10:00,Stage\n";
  const urlFixture = createServer((req, res) => {
    // Deliberately no Access-Control-Allow-Origin: cross-port this is a
    // CORS failure without the relay. The extensionless path proves the
    // format follows the downloaded filename, not the request URL.
    const url = new URL(req.url ?? "/", "http://127.0.0.1");
    if (url.pathname === "/extensionless-download") {
      res.writeHead(200, {
        "content-type": "text/csv",
        "content-disposition": 'attachment; filename="url-fixture.csv"',
      });
      res.end(urlCsv);
      return;
    }
    res.writeHead(200, { "content-type": "text/csv" });
    res.end(urlCsv);
  });
  urlFixture.listen(0, "127.0.0.1");
  await once(urlFixture, "listening");
  const fixtureUrl = `http://127.0.0.1:${urlFixture.address().port}/extensionless-download`;
  try {
    const probe = await fetch(`${origin}/api/import-url?url=${encodeURIComponent(fixtureUrl)}`);
    assert.equal(probe.status, 200, "relay must serve the loopback fixture (run dev/preview with DLENS_RELAY_ALLOW_LOOPBACK=1)");
    await probe.text();
    await page.click(".source-button");
    await page.waitForSelector(".url-form");
    // Web Source heading with an adjacent info button; opening the help
    // must not start an import.
    await page.waitForFunction(
      () => document.querySelector("#url-heading-label")?.textContent === "Web Source",
      { timeout: 30000 },
    );
    await page.click(".url-form .url-info");
    await page.waitForSelector(".url-help-dialog");
    const helpText = await page.$eval(".url-help-dialog", (el) => el.textContent);
    assert.match(helpText, /Dateiname|downloaded filename/i);
    const rowsBeforeHelp = await page.$$eval("tbody tr", (rows) => rows.length);
    await new Promise((resolve) => setTimeout(resolve, 500));
    assert.equal(await page.$$eval("tbody tr", (rows) => rows.length), rowsBeforeHelp);
    // No separate + Import URL button: Enter or the trailing icon submits.
    assert.equal(
      await page.$$eval(".sources > button", (buttons) => buttons.filter((b) => /URL importieren|Import URL/.test(b.textContent)).length),
      0,
    );
    const submitBounds = await page.evaluate(() => {
      const input = document.querySelector(".url-field input");
      const button = document.querySelector(".url-field .url-submit");
      const inputBox = input.getBoundingClientRect();
      const buttonBox = button.getBoundingClientRect();
      return {
        inside: buttonBox.left > inputBox.left && buttonBox.right <= inputBox.right + 1,
        disabled: button.disabled,
      };
    });
    assert.equal(submitBounds.inside, true, "download button must sit inside the input's right edge");
    assert.equal(submitBounds.disabled, true, "submit must stay disabled for a blank input");
    await page.type(".url-field input", fixtureUrl);
    await page.keyboard.press("Enter");
    await page.waitForFunction(() => document.querySelector("tbody")?.textContent.includes("URL-001"), { timeout: 30000 });
    assert.match(await page.$eval(".source-button", (el) => el.textContent), /url-fixture\.csv/);
    // Importing closes the sources panel; re-open it before asserting rows.
    assert.equal(await page.$eval(".source-button strong", (el) => el.getAttribute("title") ?? ""), fixtureUrl);
    await page.click(".source-button");
    await page.waitForFunction(
      () => [...document.querySelectorAll(".source-option")].some((el) => (el.textContent ?? "").includes("url-fixture.csv")),
      { timeout: 30000 },
    );
    // URL datasets use the cloud icon; hovering the filename shows the
    // original download URL (persisted identity, not the display name).
    const urlTitle = await page.evaluate(() => {
      const row = [...document.querySelectorAll(".source-option")].find((el) => (el.textContent ?? "").includes("url-fixture.csv"));
      return row?.querySelector(".source-name")?.getAttribute("title") ?? "";
    });
    assert.equal(urlTitle, fixtureUrl);
    // URL rows and the selected source use the cloud icon, distinct from
    // the local-file document icon.
    const iconKinds = await page.evaluate(() => {
      const icon = (root) => root?.querySelector(".source-select svg, svg")?.outerHTML ?? "";
      const rows = [...document.querySelectorAll(".source-option")];
      const urlRow = rows.find((el) => (el.textContent ?? "").includes("url-fixture.csv"));
      const localRow = rows.find((el) => !((el.textContent ?? "").includes("url-fixture.csv")) && el.querySelector(".source-select svg"));
      return {
        url: icon(urlRow).length,
        local: icon(localRow).length,
        selected: (document.querySelector(".source-button > svg")?.outerHTML ?? "").length,
        urlHtml: icon(urlRow),
        localHtml: icon(localRow),
        selectedHtml: document.querySelector(".source-button > svg")?.outerHTML ?? "",
      };
    });
    assert.ok(iconKinds.url > 0, "URL row must render an icon");
    assert.notEqual(iconKinds.urlHtml, iconKinds.localHtml, "URL row icon must differ from the local file icon");
    assert.equal(iconKinds.selectedHtml, iconKinds.urlHtml, "selected source must use the URL cloud icon");
    // Connector chevrons match the Select Datasource chevron (desktop).
    const chevronParity = () => page.evaluate(() => {
      const reference = document.querySelector(".source-button > svg:last-child");
      const selects = [...document.querySelectorAll(".select-wrap > svg")];
      const width = (el) => el.getBoundingClientRect().width;
      return { reference: width(reference), selects: selects.map(width), count: selects.length };
    });
    // Sources panel is already open from the row assertions above.
    await page.waitForSelector(".select-wrap > svg");
    const desktop = await chevronParity();
    assert.ok(desktop.count >= 1, "connector/source selects must render decorative chevrons");
    for (const w of desktop.selects) assert.ok(Math.abs(w - desktop.reference) < 0.6, `select chevron ${w}px must match source button ${desktop.reference}px`);
    // URL rows show trash then reload at the far right, in that order.
    const order = await page.evaluate(() => {
      const row = [...document.querySelectorAll(".source-option")].find((el) => (el.textContent ?? "").includes("url-fixture.csv"));
      const trash = row.querySelector(".source-delete").getBoundingClientRect();
      const reload = row.querySelector(".source-reload").getBoundingClientRect();
      const rowBox = row.getBoundingClientRect();
      return { trashLeft: trash.left, reloadLeft: reload.left, gapToEdge: rowBox.right - reload.right };
    });
    assert.ok(order.trashLeft < order.reloadLeft, "trash must precede reload");
    assert.ok(order.gapToEdge < 8, "reload must sit at the far right edge");
    // Reload replaces all records of the URL identity from the saved URL.
    urlCsv = "EventID,Date,Start,End,Area\nURL-002,2026-09-08,11:00,12:00,Tent\n";
    await page.evaluate(() => {
      [...document.querySelectorAll(".source-option")]
        .find((el) => (el.textContent ?? "").includes("url-fixture.csv"))
        .querySelector(".source-reload").click();
    });
    await page.waitForFunction(() => document.querySelector("tbody")?.textContent.includes("URL-002"), { timeout: 30000 });
    assert.ok(!(await page.$eval("tbody", (el) => el.textContent)).includes("URL-001"), "reload must replace, not append");
    // Persisted URL metadata survives a restart and reloads again.
    await page.reload();
    await page.waitForSelector("input[type=file]:not(:disabled)");
    await page.click(".source-button");
    await page.waitForFunction(
      () => [...document.querySelectorAll(".source-option")].some((el) => (el.textContent ?? "").includes("url-fixture.csv")),
      { timeout: 30000 },
    );
    await page.evaluate(() => {
      [...document.querySelectorAll(".source-option")]
        .find((el) => (el.textContent ?? "").includes("url-fixture.csv"))
        .querySelector(".source-select").click();
    });
    await page.waitForFunction(() => document.querySelector("tbody")?.textContent.includes("URL-002"), { timeout: 30000 });
    urlCsv = "EventID,Date,Start,End,Area\nURL-003,2026-09-08,13:00,14:00,Stage\n";
    await page.click(".source-button");
    await page.evaluate(() => {
      [...document.querySelectorAll(".source-option")]
        .find((el) => (el.textContent ?? "").includes("url-fixture.csv"))
        .querySelector(".source-reload").click();
    });
    await page.waitForFunction(() => document.querySelector("tbody")?.textContent.includes("URL-003"), { timeout: 30000 });
    // Chevron parity holds on mobile widths too (toggling mobile emulation
    // reloads the page, so wait for the app shell again).
    await page.setViewport({ width: 390, height: 844, isMobile: true });
    await page.waitForSelector(".source-button", { timeout: 30000 });
    await page.click(".source-button");
    await page.waitForSelector(".select-wrap > svg");
    const mobile = await chevronParity();
    for (const w of mobile.selects) assert.ok(Math.abs(w - mobile.reference) < 0.6, "mobile select chevron must match source button");
    await page.setViewport({ width: 1280, height: 900 });
    await page.waitForSelector(".source-button", { timeout: 30000 });
  } finally {
    await new Promise((resolve) => urlFixture.close(resolve));
  }
  // --- Local file reload: a fresh selection replaces exactly the chosen
  // pathless source (durable group identity survives restarts); a mismatched
  // selection keeps the existing data.
  const localReloadPath = root + "/local-reload.csv";
  const reloadLocalRow = async (name, acceptPath) => {
    const chooser = await Promise.all([
      page.waitForFileChooser({ timeout: 30000 }),
      page.evaluate((rowName) => {
        [...document.querySelectorAll(".source-option")]
          .find((el) => (el.textContent ?? "").includes(rowName))
          .querySelector(".source-reload").click();
      }, name),
    ]).then(([fileChooser]) => fileChooser);
    await chooser.accept([acceptPath]);
  };
  await writeFile(localReloadPath, "EventID,Date,Start,End,Area\nLOCAL-001,2026-09-08,09:00,10:00,Stage\n");
  await page.waitForSelector("input[type=file]:not(:disabled)");
  await (await page.$("input[type=file]")).uploadFile(localReloadPath);
  await page.waitForFunction(() => document.querySelector("tbody")?.textContent.includes("LOCAL-001"), { timeout: 30000 });
  await page.click(".source-button");
  await page.waitForFunction(
    () => [...document.querySelectorAll(".source-option")].some((el) => (el.textContent ?? "").includes("local-reload.csv")),
    { timeout: 30000 },
  );
  // Local rows show trash then reload at the far right, in that order.
  const localOrder = await page.evaluate(() => {
    const row = [...document.querySelectorAll(".source-option")].find((el) => (el.textContent ?? "").includes("local-reload.csv"));
    const trash = row.querySelector(".source-delete").getBoundingClientRect();
    const reload = row.querySelector(".source-reload").getBoundingClientRect();
    const rowBox = row.getBoundingClientRect();
    return { trashLeft: trash.left, reloadLeft: reload.left, gapToEdge: rowBox.right - reload.right };
  });
  assert.ok(localOrder.trashLeft < localOrder.reloadLeft, "local trash must precede reload");
  assert.ok(localOrder.gapToEdge < 8, "local reload must sit at the far right edge");
  // Edit the fixture on disk, then reload the LOCAL row with the same file.
  await writeFile(localReloadPath, "EventID,Date,Start,End,Area\nLOCAL-002,2026-09-08,11:00,12:00,Tent\n");
  await reloadLocalRow("local-reload.csv", localReloadPath);
  await page.waitForFunction(() => document.querySelector("tbody")?.textContent.includes("LOCAL-002"), { timeout: 30000 });
  assert.ok(!(await page.$eval("tbody", (el) => el.textContent)).includes("LOCAL-001"), "local reload must replace, not append");
  // A successful reload closes the sources panel; reopen it to count rows.
  await page.click(".source-button");
  await page.waitForFunction(
    () => [...document.querySelectorAll(".source-option")].some((el) => (el.textContent ?? "").includes("local-reload.csv")),
    { timeout: 30000 },
  );
  assert.equal(
    await page.$$eval(".source-option", (rows) => rows.filter((el) => (el.textContent ?? "").includes("local-reload.csv")).length),
    1,
  );
  // Restart persistence: reload the app, then reload the same source again.
  await writeFile(localReloadPath, "EventID,Date,Start,End,Area\nLOCAL-003,2026-09-08,13:00,14:00,Stage\n");
  await page.reload();
  await page.waitForSelector("input[type=file]:not(:disabled)");
  await page.click(".source-button");
  await page.waitForFunction(
    () => [...document.querySelectorAll(".source-option")].some((el) => (el.textContent ?? "").includes("local-reload.csv")),
    { timeout: 30000 },
  );
  await page.evaluate(() => {
    [...document.querySelectorAll(".source-option")]
      .find((el) => (el.textContent ?? "").includes("local-reload.csv"))
      .querySelector(".source-select").click();
  });
  await page.waitForFunction(() => document.querySelector("tbody")?.textContent.includes("LOCAL-002"), { timeout: 30000 });
  // Selecting a source closes the panel; reopen it before reloading.
  await page.click(".source-button");
  await page.waitForFunction(
    () => [...document.querySelectorAll(".source-option")].some((el) => (el.textContent ?? "").includes("local-reload.csv")),
    { timeout: 30000 },
  );
  await reloadLocalRow("local-reload.csv", localReloadPath);
  await page.waitForFunction(() => document.querySelector("tbody")?.textContent.includes("LOCAL-003"), { timeout: 30000 });
  assert.ok(!(await page.$eval("tbody", (el) => el.textContent)).includes("LOCAL-002"), "post-restart reload must replace, not append");
  // A mismatched filename keeps the existing data.
  const mismatchPath = root + "/local-other.csv";
  await writeFile(mismatchPath, "EventID,Date,Start,End,Area\nWRONG-001,2026-09-08,09:00,10:00,Stage\n");
  await page.click(".source-button");
  await page.waitForFunction(
    () => [...document.querySelectorAll(".source-option")].some((el) => (el.textContent ?? "").includes("local-reload.csv")),
    { timeout: 30000 },
  );
  await reloadLocalRow("local-reload.csv", mismatchPath);
  await page.waitForFunction(() => document.body.textContent.includes("passt nicht"), { timeout: 30000 });
  assert.match(await page.$eval("tbody", (el) => el.textContent), /LOCAL-003/);
  assert.ok(!(await page.$eval("tbody", (el) => el.textContent)).includes("WRONG-001"), "mismatched reload must keep old data");
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
    "PASS: UI XML import, OPFS reload, source selection, exclusive tab ownership, cancellation, authenticated HTTP connector, deletion confirmation, record/source deletion, reset, reimport, CORS-less URL import via relay with trash/reload and persisted reload, local file reload via fresh selection with persisted group and mismatch protection, and backend access controls",
  );
} catch (error) {
  for (const page of await browser.pages())
    console.error(await page.evaluate(() => document.body.innerText));
  throw error;
} finally {
  await browser.close();
  connector.close();
}
