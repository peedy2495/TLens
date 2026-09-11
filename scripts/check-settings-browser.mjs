// Focused settings-route browser regression (production preview only).
// Uses an isolated Chrome profile; artifacts: artifacts/settings-route-check.
import puppeteer from "puppeteer-core";
import assert from "node:assert/strict";
import { mkdir } from "node:fs/promises";
import { join, resolve } from "node:path";

const ORIGIN = process.env.DLENS_PREVIEW_ORIGIN ?? "http://127.0.0.1:4333";
const ARTIFACTS = resolve("artifacts/settings-route-check");
await mkdir(ARTIFACTS, { recursive: true });

const executablePath =
  process.env.PWA_CHROME_PATH ?? process.env.CHROME_PATH ?? "/usr/bin/google-chrome";
const browser = await puppeteer.launch({
  executablePath,
  headless: true,
  args: ["--no-sandbox", "--disable-dev-shm-usage"],
  userDataDir: `${ARTIFACTS}/profile-${Date.now()}`,
});
try {
  const page = await browser.newPage();
  await page.goto(ORIGIN, { waitUntil: "networkidle0" });
  await page.waitForSelector(".source-button", { timeout: 30000 });
  assert.equal(new URL(page.url()).pathname, "/");

  // Type a query so workspace state preservation can be verified later.
  await page.click(".search-box input");
  await page.type(".search-box input", "route-state-probe");
  assert.equal(await page.$eval(".search-box input", (el) => el.value), "route-state-probe");

  // Open via app: push /settings, settings view with enter animation.
  await page.evaluate(() => {
    document.querySelector('button[title="Einstellungen"]')?.click();
  });
  await page.waitForSelector(".settings-page", { timeout: 10000 });
  assert.equal(new URL(page.url()).pathname, "/settings");
  const enterClass = await page.$eval(".settings-page", (el) => el.className);
  assert.ok(enterClass.includes("settings-enter"), `enter animation class (${enterClass})`);

  // Client-side close preserves in-memory workspace state (no reload yet).
  await Promise.all([
    page.waitForSelector(".settings-page", { hidden: true, timeout: 10000 }),
    page.evaluate(() => document.querySelector(".settings-back")?.click()),
  ]);
  assert.equal(new URL(page.url()).pathname, "/");
  assert.equal(await page.$eval(".search-box input", (el) => el.value), "route-state-probe");

  // Reopen, then reload retains settings (in-memory query is reset by the
  // reload itself, which is expected browser behavior).
  await page.evaluate(() => {
    document.querySelector('button[title="Einstellungen"]')?.click();
  });
  await page.waitForSelector(".settings-page", { timeout: 10000 });
  await page.reload({ waitUntil: "networkidle0" });
  await page.waitForSelector(".settings-page", { timeout: 15000 });
  assert.equal(new URL(page.url()).pathname, "/settings");

  // Back returns workspace with exit animation.
  await Promise.all([
    page.waitForSelector(".settings-page", { hidden: true, timeout: 10000 }),
    page.goBack({ waitUntil: "networkidle0" }),
  ]);
  assert.equal(new URL(page.url()).pathname, "/");

  // Forward reopens settings.
  await Promise.all([
    page.waitForSelector(".settings-page", { timeout: 10000 }),
    page.goForward({ waitUntil: "networkidle0" }),
  ]);
  assert.equal(new URL(page.url()).pathname, "/settings");

  // UI back closes to workspace.
  await Promise.all([
    page.waitForSelector(".settings-page", { hidden: true, timeout: 10000 }),
    page.evaluate(() => document.querySelector(".settings-back")?.click()),
  ]);
  assert.equal(new URL(page.url()).pathname, "/");

  // Repeated cycles add no duplicate history loops: open/close twice, then
  // a single Back must leave /settings for good.
  for (let i = 0; i < 2; i++) {
    await page.evaluate(() => document.querySelector('button[title="Einstellungen"]')?.click());
    await page.waitForSelector(".settings-page", { timeout: 10000 });
    await page.evaluate(() => document.querySelector(".settings-back")?.click());
    await page.waitForSelector(".settings-page", { hidden: true, timeout: 10000 });
  }
  await page.evaluate(() => document.querySelector('button[title="Einstellungen"]')?.click());
  await page.waitForSelector(".settings-page", { timeout: 10000 });
  await page.goBack({ waitUntil: "networkidle0" });
  await page.waitForSelector(".settings-page", { hidden: true, timeout: 10000 });
  assert.equal(new URL(page.url()).pathname, "/");
  assert.equal(await page.evaluate(() => document.querySelector(".settings-page") !== null), false);

  // Escape closes settings.
  await page.evaluate(() => document.querySelector('button[title="Einstellungen"]')?.click());
  await page.waitForSelector(".settings-page", { timeout: 10000 });
  await page.keyboard.press("Escape");
  await page.waitForSelector(".settings-page", { hidden: true, timeout: 10000 });
  assert.equal(new URL(page.url()).pathname, "/");

  // Escape consumed by a child overlay must not dismiss settings.
  await page.evaluate(() => document.querySelector('button[title="Einstellungen"]')?.click());
  await page.waitForSelector(".settings-page", { timeout: 10000 });
  await page.evaluate(() => {
    window.addEventListener("keydown", (e) => { if (e.key === "Escape") e.preventDefault(); }, { capture: true, once: true });
  });
  await page.keyboard.press("Escape");
  await new Promise((r) => setTimeout(r, 500));
  assert.equal(await page.evaluate(() => document.querySelector(".settings-page") !== null), true, "consumed Escape keeps settings open");
  assert.equal(new URL(page.url()).pathname, "/settings");
  await page.keyboard.press("Escape");
  await page.waitForSelector(".settings-page", { hidden: true, timeout: 10000 });

  // Direct /settings load renders settings; Escape stays within the app root.
  const direct = await browser.newPage();
  try {
    await direct.goto(`${ORIGIN}/settings`, { waitUntil: "networkidle0" });
    await direct.waitForSelector(".settings-page", { timeout: 15000 });
    await direct.keyboard.press("Escape");
    await direct.waitForSelector(".settings-page", { hidden: true, timeout: 10000 });
    assert.equal(new URL(direct.url()).pathname, "/");
    assert.ok((await direct.content()).includes("app-shell"), "Escape from direct settings stays in app");
  } finally {
    await direct.close().catch(() => {});
  }

  // A later direct visit in the same tab must not inherit an old opener.
  await page.goto(`${ORIGIN}/settings`, { waitUntil: "networkidle0" });
  await page.waitForSelector(".settings-page");
  await page.keyboard.press("Escape");
  await page.waitForSelector(".source-button");
  assert.equal(new URL(page.url()).pathname, "/");

  // Reduced motion: open/close still works without animation dependence.
  await page.emulateMediaFeatures([{ name: "prefers-reduced-motion", value: "reduce" }]);
  await page.evaluate(() => document.querySelector('button[title="Einstellungen"]')?.click());
  await page.waitForSelector(".settings-page", { timeout: 10000 });
  await page.keyboard.press("Escape");
  await page.waitForSelector(".settings-page", { hidden: true, timeout: 10000 });
  assert.equal(new URL(page.url()).pathname, "/");
  await page.emulateMediaFeatures([{ name: "prefers-reduced-motion", value: "no-preference" }]);

  console.log("PASS: settings route history, reload, Escape, reduced-motion, state preservation");
} finally {
  await browser?.close().catch(() => {});
}
