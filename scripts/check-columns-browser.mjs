import puppeteer from "puppeteer-core";
import { mkdir, writeFile } from "node:fs/promises";
import { resolve } from "node:path";
import assert from "node:assert/strict";

// Focused regression for the Anzeige field tree + date-picker tooltip.
// Requires the dev/preview server (DLENS_TEST_URL or http://127.0.0.1:4321).
const root = resolve("artifacts/browser-check-columns");
await mkdir(root, { recursive: true });
const browser = await puppeteer.launch({
  executablePath: "/usr/bin/google-chrome",
  headless: true,
  args: ["--no-sandbox", "--disable-dev-shm-usage"],
  userDataDir: `${root}/profile-${Date.now()}`,
});
try {
  const page = await browser.newPage();
  await page.evaluateOnNewDocument(() => {
    Object.defineProperty(window, "showOpenFilePicker", { value: undefined, configurable: true });
  });
  page.on("pageerror", (e) => console.error("PAGE:", e.message));
  await page.goto(process.env.DLENS_TEST_URL ?? "http://127.0.0.1:4321");
  await page.waitForSelector("input[type=file]:not(:disabled)");
  const name = `columns-${Date.now()}.xml`;
  const fixture =
    "<Events><Event><EventID>001</EventID><Date>2026-09-08</Date><Start>09:00</Start><End>10:00</End><Area>Stage</Area></Event>" +
    "<Event><EventID>002</EventID><Date>2026-09-08</Date><Start>11:00</Start><End>12:00</End><Area>Tent</Area><People><Person><EventID>nested-1</EventID></Person></People></Event></Events>";
  await writeFile(`${root}/${name}`, fixture);
  await (await page.$("input[type=file]")).uploadFile(`${root}/${name}`);
  await page.waitForFunction(() => document.body.textContent.includes("Datei lokal gespeichert"), { timeout: 30000 });
  await page.waitForFunction(() => document.querySelectorAll("tbody tr").length === 2);

  // Date-picker tooltip on the calendar IconButton.
  const tooltip = await page.evaluate(() => {
    const buttons = [...document.querySelectorAll(".date-actions button")];
    const calendar = buttons.find((b) => b.querySelector("svg") && !b.classList.contains("icon-button") || b.getAttribute("aria-label")?.includes("Datum") || b.getAttribute("aria-label")?.includes("date"));
    return { title: calendar?.getAttribute("title") ?? "", label: calendar?.getAttribute("aria-label") ?? "", iconButton: calendar?.classList.contains("icon-button") };
  });
  assert.match(tooltip.label, /Datum|date/i);
  assert.equal(tooltip.title, tooltip.label);
  assert.equal(tooltip.iconButton, true);

  // Anzeige panel: flat by default with tree toggle.
  await page.evaluate(() => [...document.querySelectorAll("button")].find((b) => b.textContent.includes("Anzeige") || b.textContent.includes("Display")).click());
  await page.waitForSelector(".column-options");
  assert.equal(await page.$(".column-tree"), null);
  const toggleTitle = await page.$eval(".column-options-heading .icon-button", (el) => el.getAttribute("title") ?? "");
  assert.match(toggleTitle, /Baum|Tree/);

  // Enter tree view: branches for the source hierarchy.
  await page.click(".column-options-heading .icon-button");
  await page.waitForSelector(".column-branch");
  const branches = await page.$$eval(".column-branch-toggle > span:first-of-type", (nodes) => nodes.map((n) => n.textContent));
  assert.ok(branches.some((b) => b.includes("Events")), `expected Events branch, got ${branches}`);
  const toggleBack = await page.$eval(".column-options-heading .icon-button", (el) => el.getAttribute("title") ?? "");
  assert.match(toggleBack, /Flach|Flat/);

  // Every hierarchy level starts expanded, including nested branches.
  assert.ok(await page.$$eval(".column-branch-toggle", (nodes) =>
    nodes.length > 1 && nodes.every((node) => node.getAttribute("aria-expanded") === "true")));
  // A collapsed nested branch must not inherit padding from an open ancestor.
  await page.evaluate(() => document.querySelector(".column-branch .column-branch .column-branch-toggle").click());
  await page.waitForFunction(() => {
    const body = document.querySelector(".column-branch-body:not(.open)");
    return body && body.getBoundingClientRect().height === 0;
  });
  assert.equal(await page.$eval(".column-branch-body:not(.open)", (body) => body.inert), true);
  await page.evaluate(() => document.querySelector('.column-branch-toggle[aria-expanded="false"]').click());
  await page.waitForFunction(() => !document.querySelector('.column-branch-toggle[aria-expanded="false"]'));
  const sync = await page.evaluate(() => {
    const boxes = [...document.querySelectorAll(".column-branch-fields label")].filter((l) => l.textContent.trim() === "EventID");
    return { count: boxes.length, states: boxes.map((l) => l.querySelector("input").checked) };
  });
  assert.ok(sync.count >= 1, "EventID leaves expected in tree");
  // Toggle one EventID checkbox: all same-name leaves must follow.
  await page.evaluate(() => {
    const first = [...document.querySelectorAll(".column-branch-fields label")]
      .find((l) => l.textContent.trim() === "EventID").querySelector("input");
    first.click();
  });
  const after = await page.evaluate(() => [...document.querySelectorAll(".column-branch-fields label")]
    .filter((l) => l.textContent.trim() === "EventID")
    .map((l) => l.querySelector("input").checked));
  assert.ok(after.length >= 1 && after.every((v) => v === after[0]), "same-name checkboxes must stay synchronized");

  // Retained selection across flat/tree toggles.
  await page.click(".column-options-heading .icon-button");
  await page.waitForSelector(".column-flat");
  const flatState = await page.evaluate(() => [...document.querySelectorAll(".column-flat label")]
    .find((l) => l.textContent.trim() === "EventID").querySelector("input").checked);
  assert.equal(flatState, after[0]);
  await page.click(".column-options-heading .icon-button");
  await page.waitForSelector(".column-branch");

  // Animated sizing with reduced-motion support.
  const motion = await page.evaluate(() => {
    const body = document.querySelector(".column-branch-body");
    const transition = getComputedStyle(body).transitionDuration;
    return { transition };
  });
  assert.notEqual(motion.transition, "", "branch expansion must be transitioned");
  await page.emulateMediaFeatures([{ name: "prefers-reduced-motion", value: "reduce" }]);
  const reduced = await page.evaluate(() => {
    const body = document.querySelector(".column-branch-body");
    return getComputedStyle(body).transitionDuration;
  });
  assert.ok(reduced === "0s" || reduced === "", `reduced motion must disable transition, got ${reduced}`);
  console.log("PASS: date-picker tooltip, flat/tree toggle, branch expansion, same-name sync, retained selection, animated sizing with reduced motion");
} finally {
  await browser.close();
}
