// DLens PWA browser regression (production dist only).
// Serves dist/ on loopback, checks manifest/icons/SW precache, offline reload
// with persisted OPFS records, non-root fallback rejection, waiting-update
// behaviour and synthetic install-prompt flow. Uses an isolated Chrome profile;
// never touches real profiles or data. Artifacts: artifacts/pwa-check.
import puppeteer from "puppeteer-core";
import assert from "node:assert/strict";
import { createServer } from "node:http";
import { readFile, stat, mkdir, writeFile, readdir } from "node:fs/promises";
import { extname, join, normalize, resolve, sep } from "node:path";

const DIST = resolve("dist");
const ARTIFACTS = resolve("artifacts/pwa-check");
await mkdir(ARTIFACTS, { recursive: true });

const MIME = {
  ".html": "text/html; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".wasm": "application/wasm",
  ".webmanifest": "application/manifest+json",
  ".png": "image/png",
  ".svg": "image/svg+xml",
  ".json": "application/json; charset=utf-8",
};

function noCache(pathname) {
  return (
    pathname === "/sw.js" ||
    pathname === "/manifest.webmanifest" ||
    pathname === "/" ||
    pathname === "/index.html"
  );
}

// Mutable SW body lets the update regression serve a changed test-only suffix.
let swOverride = null;
const originalSw = await readFile(join(DIST, "sw.js"), "utf8").catch(() => null);
assert.ok(originalSw, "dist/sw.js must exist; run npm run build first");

const server = createServer(async (req, res) => {
  try {
    const url = new URL(req.url ?? "/", "http://127.0.0.1");
    const pathname = url.pathname;
    if (pathname === "/sw.js" && swOverride !== null) {
      res.writeHead(200, {
        "content-type": MIME[".js"],
        "cache-control": "public, max-age=0, must-revalidate",
      });
      res.end(swOverride);
      return;
    }
    const safe = normalize(pathname).replace(/^(\.\.[/\\])+/, "");
    const relative = safe.replace(/^\//, "") || "index.html";
    const file = join(DIST, relative);
    if (!file.startsWith(DIST + sep) && file !== DIST) {
      res.writeHead(403, { "content-type": "text/plain" });
      res.end("forbidden");
      return;
    }
    // Only the root document falls back to index.html. API/arbitrary paths
    // must not receive the app shell.
    if (pathname.startsWith("/api/")) {
      res.writeHead(404, { "content-type": "text/plain" });
      res.end("not found");
      return;
    }
    let target = file;
    try {
      const info = await stat(target);
      if (info.isDirectory()) target = join(target, "index.html");
    } catch {
      res.writeHead(404, { "content-type": "text/plain" });
      res.end("not found");
      return;
    }
    const body = await readFile(target);
    const headers = {
      "content-type": MIME[extname(target)] ?? "application/octet-stream",
    };
    if (noCache(pathname)) headers["cache-control"] = "public, max-age=0, must-revalidate";
    res.writeHead(200, headers);
    res.end(body);
  } catch (error) {
    res.writeHead(500, { "content-type": "text/plain" });
    res.end(String(error));
  }
});
await new Promise((resolvePromise) => server.listen(0, "127.0.0.1", resolvePromise));
const port = server.address().port;
const origin = `http://127.0.0.1:${port}`;

function pngSize(buffer, path) {
  assert.equal(buffer.subarray(0, 8).toString("hex"), "89504e470d0a1a0a", `${path} must be PNG`);
  const width = buffer.readUInt32BE(16);
  const height = buffer.readUInt32BE(20);
  return { width, height };
}

async function rowCount(page) {
  return page.evaluate(() => document.querySelectorAll("tbody tr").length);
}

async function openSettings(page) {
  await page.evaluate(() => {
    const byTitle =
      document.querySelector('button[title="Einstellungen"]') ??
      document.querySelector('button[title="Settings"]') ??
      [...document.querySelectorAll("button")].find(
        (b) => b.getAttribute("aria-label") === "Settings",
      );
    byTitle?.click();
  });
  await page.waitForSelector(".settings-page", { timeout: 10000 });
}

async function closeSettings(page) {
  await page.evaluate(() => {
    const back = document.querySelector('.settings-back');
    back?.click();
  });
  await page.waitForFunction(() => !document.querySelector(".settings-page"), { timeout: 10000 });
}

async function cacheUrls(page) {
  return page.evaluate(async () => {
    const names = await caches.keys();
    const urls = [];
    for (const name of names) {
      const cache = await caches.open(name);
      for (const request of await cache.keys()) urls.push(request.url);
    }
    return { names, urls };
  });
}

function assertCleanCache(urls, stage) {
  for (const url of urls) {
    assert.ok(!url.includes("/api/"), `${stage}: no API responses cached (${url})`);
    assert.ok(!url.includes("demo/"), `${stage}: no demo data cached (${url})`);
    assert.ok(!url.includes("pwa-fixture"), `${stage}: no fixture data cached (${url})`);
    assert.ok(!url.includes("pwa-offline"), `${stage}: no fixture data cached (${url})`);
    assert.ok(!url.includes("pwa-big"), `${stage}: no fixture data cached (${url})`);
  }
}

const executablePath =
  process.env.PWA_CHROME_PATH ?? process.env.CHROME_PATH ?? "/usr/bin/google-chrome";
let browser = null;
try {
  browser = await puppeteer.launch({
    executablePath,
    headless: true,
    args: ["--no-sandbox", "--disable-dev-shm-usage"],
    userDataDir: `${ARTIFACTS}/profile-${Date.now()}`,
  });
  // --- Static asset checks (MIME, manifest, icons, single link) ---
  const manifestRes = await fetch(`${origin}/manifest.webmanifest`);
  assert.equal(manifestRes.status, 200);
  assert.match(manifestRes.headers.get("content-type") ?? "", /application\/manifest\+json/);
  assert.match(manifestRes.headers.get("cache-control") ?? "", /no-cache|must-revalidate/);
  const manifest = await manifestRes.json();
  assert.equal(manifest.id, "/");
  assert.equal(manifest.start_url, "/");
  assert.equal(manifest.scope, "/");
  assert.equal(manifest.display, "standalone");
  assert.equal(manifest.theme_color, "#f7f9fc");
  const sizes = Object.fromEntries(manifest.icons.map((icon) => [icon.sizes, icon]));
  assert.ok(sizes["192x192"]);
  assert.ok(sizes["512x512"]);
  assert.ok(manifest.icons.some((icon) => icon.purpose === "maskable"));

  for (const [file, w, h] of [
    ["icons/dlens-192.png", 192, 192],
    ["icons/dlens-512.png", 512, 512],
    ["icons/dlens-maskable-512.png", 512, 512],
    ["icons/apple-touch-icon.png", 180, 180],
  ]) {
    const res = await fetch(`${origin}/${file}`);
    assert.equal(res.status, 200, file);
    assert.equal(res.headers.get("content-type"), "image/png");
    const buffer = Buffer.from(await res.arrayBuffer());
    assert.deepEqual(pngSize(buffer, file), { width: w, height: h });
  }
  const jsRes = await fetch(`${origin}/sw.js`);
  assert.match(jsRes.headers.get("content-type") ?? "", /javascript/);
  const wasmProbe = (await readdir(join(DIST, "_astro"))).find((f) => f.endsWith(".wasm"));
  assert.ok(wasmProbe, "expected a precached _astro wasm bundle");
  const wasmRes = await fetch(`${origin}/_astro/${wasmProbe}`);
  assert.equal(wasmRes.headers.get("content-type"), "application/wasm");
  const traversal = await fetch(`${origin}/%2e%2e/package.json`);
  assert.ok([400, 403, 404].includes(traversal.status), "traversal must be rejected");
  const apiRes = await fetch(`${origin}/api/records?table=events`);
  assert.equal(apiRes.status, 404, "non-root API paths must not fall back to index");

  const page = await browser.newPage();
  await page.goto(origin, { waitUntil: "networkidle0" });
  const linkCount = await page.$$eval('link[rel="manifest"]', (els) => els.map((el) => el.getAttribute("href")));
  assert.equal(linkCount.length, 1, "exactly one manifest link");
  assert.equal(linkCount[0], "/manifest.webmanifest");

  // Theme follows the system until a manual choice overrides it, including reloads.
  await page.emulateMediaFeatures([{ name: "prefers-color-scheme", value: "dark" }]);
  await page.waitForFunction(() => document.documentElement.dataset.theme === "dark");
  assert.equal(await page.$eval('meta[name="theme-color"]', el => el.content), "#131820");
  assert.equal(await page.evaluate(() => localStorage.getItem("dlens-dark")), null);
  await page.emulateMediaFeatures([{ name: "prefers-color-scheme", value: "light" }]);
  await page.waitForFunction(() => document.documentElement.dataset.theme === "light");
  assert.equal(await page.$eval('meta[name="theme-color"]', el => el.content), "#f7f9fc");
  await page.click('[aria-label="Dunkelmodus"]');
  await page.waitForFunction(() => localStorage.getItem("dlens-dark") === "true");
  await page.reload({ waitUntil: "networkidle0" });
  assert.equal(await page.$eval('meta[name="theme-color"]', el => el.content), "#131820");
  await page.emulateMediaFeatures([{ name: "prefers-color-scheme", value: "dark" }]);
  await page.emulateMediaFeatures([{ name: "prefers-color-scheme", value: "light" }]);
  assert.equal(await page.evaluate(() => document.documentElement.dataset.theme), "dark");

  // CDP installability (best effort: report, do not fail headless quirks).
  try {
    const cdp = await page.createCDPSession();
    const { installabilityErrors } = await cdp.send("Page.getInstallabilityErrors");
    await writeFile(join(ARTIFACTS, "installability.json"), JSON.stringify(installabilityErrors, null, 2));
  } catch {
    /* Installability signal unavailable headless; manifest assertions cover it. */
  }

  // --- Service worker readiness (real controller, bounded waits) ---
  // With clientsClaim:false the first load installs but does not control yet;
  // wait for registration readiness, reload once, then require control.
  await page.waitForFunction(
    async () => {
      try {
        await navigator.serviceWorker.ready;
        return true;
      } catch {
        return false;
      }
    },
    { timeout: 30000 },
  );
  await page.reload({ waitUntil: "networkidle0" });
  await page.waitForFunction(() => navigator.serviceWorker?.controller != null, { timeout: 30000 });
  const swUrl = await page.evaluate(() => navigator.serviceWorker.controller?.scriptURL ?? "");
  assert.match(swUrl, /\/sw\.js$/);

  // Cached workers/WASM, no domain or API data in Cache Storage.
  const initialCache = await cacheUrls(page);
  assert.ok(initialCache.urls.some((u) => u.endsWith(".wasm")), "WASM must be precached");
  assert.ok(initialCache.urls.some((u) => u.includes("worker-") || u.includes("sqlite3-worker")), "workers must be precached");
  assertCleanCache(initialCache.urls, "initial");

  // --- Online import, then offline reload with persisted OPFS records ---
  await page.waitForSelector("input[type=file]:not(:disabled)", { timeout: 30000 });
  const fixture = JSON.stringify([
    { EventID: "pwa-001", Date: "2026-09-08", Start: "09:00", End: "10:00", Area: "Stage" },
    { EventID: "pwa-002", Date: "2026-09-08", Start: "11:00", End: "12:00", Area: "Tent" },
  ]);
  const fixturePath = join(ARTIFACTS, "pwa-fixture.json");
  await writeFile(fixturePath, fixture);
  await (await page.$("input[type=file]")).uploadFile(fixturePath);
  await page.waitForFunction(() => document.querySelectorAll("tbody tr").length === 2, { timeout: 30000 });

  // Cache must still hold no user/API data after the online import.
  assertCleanCache((await cacheUrls(page)).urls, "after online import");

  // Offline cold reload: disable HTTP cache, go offline, reload, reselect source.
  await page.setCacheEnabled(false);
  await page.setOfflineMode(true);
  await page.reload({ waitUntil: "networkidle0" });
  await page.waitForSelector(".source-button", { timeout: 30000 });
  await page.click(".source-button");
  await page.waitForFunction(
    () => [...document.querySelectorAll(".sources button")].some((b) => (b.textContent ?? "").includes("pwa-fixture.json")),
    { timeout: 30000 },
  );
  await page.evaluate(() => {
    [...document.querySelectorAll(".sources button")]
      .find((b) => (b.textContent ?? "").includes("pwa-fixture.json"))
      ?.click();
  });
  await page.waitForFunction(() => document.querySelectorAll("tbody tr").length === 2, { timeout: 30000 });
  const offlineCells = await page.$$eval("tbody tr td", (cells) => cells.map((c) => c.textContent ?? ""));
  assert.ok(offlineCells.some((c) => c.includes("pwa-001")), "offline rows must contain pwa-001");
  assert.ok(offlineCells.some((c) => c.includes("pwa-002")), "offline rows must contain pwa-002");

  // Offline-ready UI reflects the activated service worker after reload.
  await openSettings(page);
  const offlineReadyCopy = await page.evaluate(() => document.querySelector(".pwa-settings")?.textContent ?? "");
  assert.match(offlineReadyCopy, /DLens ist offline verfügbar\./, "settings must report offline readiness after controlled reload");
  await closeSettings(page);

  // Offline search: exact row-value check, one match then clear to two rows.
  await page.click(".search-box input");
  await page.type(".search-box input", "pwa-001");
  await page.waitForFunction(() => document.querySelectorAll("tbody tr").length === 1, { timeout: 15000 });
  const searchCells = await page.$$eval("tbody tr td", (cells) => cells.map((c) => c.textContent ?? ""));
  assert.ok(searchCells.some((c) => c.includes("pwa-001")), "search must show exact pwa-001 row");
  assert.ok(!searchCells.some((c) => c.includes("pwa-002")), "search must hide pwa-002");
  await page.evaluate(() => {
    const clear = [...document.querySelectorAll("button")].find((b) => b.getAttribute("aria-label") === "Suche löschen" || b.getAttribute("aria-label") === "Clear search");
    clear?.click();
  });
  await page.waitForFunction(() => document.querySelectorAll("tbody tr").length === 2, { timeout: 15000 });

  // Offline field filter via the real filter UI: Area=Stage shows only pwa-001.
  await page.evaluate(() => {
    const btn = [...document.querySelectorAll("button")].find((b) => (b.textContent ?? "").includes("Filter"));
    btn?.click();
  });
  await page.waitForSelector(".filter-form", { timeout: 10000 });
  await page.select(".filter-form select", "Area");
  await page.evaluate(() => {
    const input = document.querySelector('.filter-form input[aria-label="Filterwert"], .filter-form input[aria-label="Filter value"]');
    if (input) input.focus();
  });
  await page.type('.filter-form input[aria-label="Filterwert"], .filter-form input[aria-label="Filter value"]', "Stage");
  await page.waitForSelector(".filter-form button.primary:not(:disabled)", { timeout: 15000 });
  await page.evaluate(() => {
    document.querySelector(".filter-form button.primary:not(:disabled)")?.click();
  });
  await page.waitForFunction(() => document.querySelectorAll("tbody tr").length === 1, { timeout: 15000 });
  const filterCells = await page.$$eval("tbody tr td", (cells) => cells.map((c) => c.textContent ?? ""));
  assert.ok(filterCells.some((c) => c.includes("pwa-001")), "Area=Stage must show pwa-001");
  assert.ok(!filterCells.some((c) => c.includes("pwa-002")), "Area=Stage must hide pwa-002");
  await page.evaluate(() => {
    document.querySelector("button.chip")?.click();
  });
  await page.waitForFunction(() => document.querySelectorAll("tbody tr").length === 2, { timeout: 15000 });

  // Offline local import of a second file while the network stays disabled.
  const offlineFixture = join(ARTIFACTS, "pwa-offline.json");
  await writeFile(offlineFixture, JSON.stringify([{ EventID: "pwa-off", Date: "2026-09-08", Start: "13:00", End: "14:00", Area: "Stage" }]));
  await (await page.$("input[type=file]")).uploadFile(offlineFixture);
  await page.waitForFunction(() => document.querySelectorAll("tbody tr").length === 1, { timeout: 30000 });
  await page.waitForFunction(() => [...document.querySelectorAll("tbody tr td")].some((c) => (c.textContent ?? "").includes("pwa-off")), { timeout: 30000 });
  const offlineImportCells = await page.$$eval("tbody tr td", (cells) => cells.map((c) => c.textContent ?? ""));
  assert.ok(offlineImportCells.some((c) => c.includes("pwa-off")), "offline import must render the exact pwa-off record");
  assertCleanCache((await cacheUrls(page)).urls, "after offline import");
  await page.screenshot({ path: join(ARTIFACTS, "offline.png") });

  // Offline API navigation must not render the app shell (separate page, closed promptly).
  const apiPage = await browser.newPage();
  try {
    await apiPage.setOfflineMode(true);
    const apiGoto = await apiPage.goto(`${origin}/api/records`, { waitUntil: "domcontentloaded" }).catch(() => null);
    assert.ok(apiGoto === null || apiGoto.status() === 404 || (await apiPage.content()).length < 20000, "API navigation offline must fail or 404");
    const apiBody = await apiPage.evaluate(() => document.body?.textContent ?? "");
    assert.ok(!apiBody.includes("Deine Daten") && !apiBody.includes("Data Explorer"), "API path must not render the DLens app shell");
    const hasShell = await apiPage.evaluate(() => document.querySelector(".app-shell") !== null);
    assert.equal(hasShell, false, "API path must not render the app shell");
  } finally {
    await apiPage.close().catch(() => {});
  }
  await page.setOfflineMode(false);
  await page.setCacheEnabled(true);

  // --- Real update regression: changed SW waits, no auto reload ---
  await page.waitForFunction(() => document.querySelectorAll("tbody tr").length >= 1, { timeout: 30000 });
  await page.evaluate(() => { window.__pwaNoReload = "stay"; });
  swOverride = `${originalSw}\n/* pwa-test-update-v2 */\n`;
  await page.evaluate(() => navigator.serviceWorker.ready.then((r) => r.update()));
  await page.waitForFunction(
    async () => navigator.serviceWorker.ready.then((r) => r.waiting != null).catch(() => false),
    { timeout: 30000 },
  );
  await page.waitForFunction(() => document.querySelector(".pwa-update-banner") !== null, { timeout: 30000 });
  const bannerVisible = await page.evaluate(() => document.querySelector(".pwa-update-banner") !== null);
  assert.equal(bannerVisible, true, "waiting worker must show the update banner");
  assert.equal(
    await page.evaluate(() => window.__pwaNoReload ?? null),
    "stay",
    "waiting SW must not auto reload",
  );
  // Later is required: it hides the banner while the update stays pending.
  const laterExists = await page.evaluate(() =>
    [...document.querySelectorAll(".pwa-update-banner button")].some((b) => b.textContent === "Später" || b.textContent === "Later"),
  );
  assert.equal(laterExists, true, "Later action must exist in the update banner");
  await page.evaluate(() => {
    [...document.querySelectorAll(".pwa-update-banner button")]
      .find((b) => b.textContent === "Später" || b.textContent === "Later")
      ?.click();
  });
  await page.waitForFunction(() => !document.querySelector(".pwa-update-banner"), { timeout: 10000 });

  // Settings still report the deferred update as pending with an enabled action.
  await openSettings(page);
  const settingsCopy = await page.evaluate(() => document.querySelector(".pwa-settings")?.textContent ?? "");
  assert.match(settingsCopy, /Eine neue Version ist bereit/, "settings must keep the deferred update pending");
  const settingsUpdate = await page.evaluate(() => {
    const btn = [...document.querySelectorAll(".settings-page button")].find((b) => (b.textContent ?? "").includes("Aktualisieren") || (b.textContent ?? "").includes("Update"));
    return btn ? { disabled: btn.disabled, text: btn.textContent } : null;
  });
  assert.ok(settingsUpdate, "settings update action must exist after defer");
  assert.equal(settingsUpdate.disabled, false, "settings update must be available after defer");

  // --- Working guard: large import warning disables the mounted update action ---
  const bigFixture = join(ARTIFACTS, "pwa-big.json");
  await writeFile(bigFixture, JSON.stringify([{ EventID: "pwa-big", Items: Array(31000).fill(0) }]));
  // Settings stay open so the real update action is mounted during the import.
  await (await page.$("input[type=file]")).uploadFile(bigFixture);
  await page.waitForSelector(".import-warning", { timeout: 30000 });
  const guardDisabled = await page.evaluate(() => {
    const btn = [...document.querySelectorAll(".settings-page button")].find((b) => (b.textContent ?? "").includes("Aktualisieren") || (b.textContent ?? "").includes("Update"));
    return btn ? btn.disabled : "missing";
  });
  assert.equal(guardDisabled, true, "update must be disabled while the import warning is active");
  await page.evaluate(() => { window.__pwaGuardSentinel = "guarded"; });
  await page.evaluate(() => {
    const btn = [...document.querySelectorAll(".settings-page button")].find((b) => (b.textContent ?? "").includes("Aktualisieren") || (b.textContent ?? "").includes("Update"));
    btn?.click();
  });
  assert.equal(await page.evaluate(() => window.__pwaGuardSentinel ?? null), "guarded", "forced click on disabled update must not navigate");
  assert.equal(await page.evaluate(() => document.querySelector(".import-warning") !== null), true, "import warning must still be active after guarded click");
  await page.evaluate(() => {
    [...document.querySelectorAll(".import-warning button")]
      .find((b) => (b.textContent ?? "").includes("Import abbrechen") || (b.textContent ?? "").includes("Cancel import"))
      ?.click();
  });
  await page.waitForFunction(() => !document.querySelector(".import-warning"), { timeout: 30000 });
  await page.waitForFunction(
    () => [...document.querySelectorAll(".settings-page button")].some((b) => ((b.textContent ?? "").includes("Aktualisieren") || (b.textContent ?? "").includes("Update")) && !b.disabled),
    { timeout: 30000 },
  );

  // Explicit update: real navigation, OPFS records preserved with exact values.
  await Promise.all([
    page.waitForNavigation({ waitUntil: "networkidle0", timeout: 60000 }),
    page.evaluate(() => {
      [...document.querySelectorAll(".settings-page button")]
        .find((b) => (b.textContent ?? "").includes("Aktualisieren") || (b.textContent ?? "").includes("Update"))
        ?.click();
    }),
  ]);
  await page.waitForSelector(".source-button", { timeout: 30000 });
  // The app starts without a selected source; reselect the persisted import.
  await page.click(".source-button");
  await page.waitForFunction(
    () => [...document.querySelectorAll(".sources button")].some((b) => (b.textContent ?? "").includes("pwa-fixture.json")),
    { timeout: 30000 },
  );
  await page.evaluate(() => {
    [...document.querySelectorAll(".sources button")]
      .find((b) => (b.textContent ?? "").includes("pwa-fixture.json"))
      ?.click();
  });
  await page.waitForFunction(() => document.querySelectorAll("tbody tr").length === 2, { timeout: 30000 });
  const preservedCells = await page.$$eval("tbody tr td", (cells) => cells.map((c) => c.textContent ?? ""));
  assert.ok(preservedCells.some((c) => c.includes("pwa-001")), "OPFS record pwa-001 survives the explicit update");
  assert.ok(preservedCells.some((c) => c.includes("pwa-002")), "OPFS record pwa-002 survives the explicit update");
  assert.ok(preservedCells.some((c) => c.includes("Stage")), "OPFS row values (Area=Stage) survive the explicit update");

  // --- Synthetic install-prompt flow bound to the real production callback ---
  await page.evaluate(() => {
    window.__promptCalls = 0;
    const event = new Event("beforeinstallprompt");
    Object.defineProperties(event, {
      prompt: { value: async () => { window.__promptCalls += 1; }, configurable: true },
      userChoice: { value: Promise.resolve({ outcome: "dismissed" }), configurable: true },
    });
    window.dispatchEvent(event);
  });
  await openSettings(page);
  const installVisible = await page.evaluate(() =>
    [...document.querySelectorAll(".settings-page button")].some((b) => (b.textContent ?? "").includes("DLens installieren") || (b.textContent ?? "").includes("Install DLens")),
  );
  assert.equal(installVisible, true, "synthetic prompt must surface the real Install control");
  await page.evaluate(() => {
    [...document.querySelectorAll(".settings-page button")]
      .find((b) => (b.textContent ?? "").includes("DLens installieren") || (b.textContent ?? "").includes("Install DLens"))
      ?.click();
  });
  await page.waitForFunction(() => window.__promptCalls === 1, { timeout: 10000 });
  await page.waitForFunction(
    () => ![...document.querySelectorAll(".settings-page button")].some((b) => (b.textContent ?? "").includes("DLens installieren") || (b.textContent ?? "").includes("Install DLens")),
    { timeout: 10000 },
  );
  assert.equal(await page.evaluate(() => window.__promptCalls), 1, "one-shot prompt must be called exactly once");
  // Repeated clicks cannot reuse the consumed event: no new prompt call.
  await page.evaluate(() => {
    [...document.querySelectorAll(".settings-page button")].forEach((b) => {
      if ((b.textContent ?? "").includes("DLens installieren") || (b.textContent ?? "").includes("Install DLens")) b.click();
    });
  });
  assert.equal(await page.evaluate(() => window.__promptCalls), 1, "consumed prompt must not be reusable");

  // Rejected prompt path surfaces a localized error, then appinstalled marks installed.
  await page.evaluate(() => {
    window.__promptCalls = 0;
    const event = new Event("beforeinstallprompt");
    Object.defineProperties(event, {
      prompt: { value: async () => { window.__promptCalls += 1; throw new Error("denied"); }, configurable: true },
      userChoice: { value: Promise.reject(new Error("denied")), configurable: true },
    });
    window.dispatchEvent(event);
  });
  await page.waitForFunction(
    () => [...document.querySelectorAll(".settings-page button")].some((b) => (b.textContent ?? "").includes("DLens installieren") || (b.textContent ?? "").includes("Install DLens")),
    { timeout: 10000 },
  );
  await page.evaluate(() => {
    [...document.querySelectorAll(".settings-page button")]
      .find((b) => (b.textContent ?? "").includes("DLens installieren") || (b.textContent ?? "").includes("Install DLens"))
      ?.click();
  });
  await page.waitForFunction(
    () => (document.querySelector(".pwa-settings")?.textContent ?? "").includes("Installation fehlgeschlagen"),
    { timeout: 10000 },
  );
  await page.evaluate(() => window.dispatchEvent(new Event("appinstalled")));
  await page.waitForFunction(
    () => (document.querySelector(".pwa-settings")?.textContent ?? "").includes("DLens ist als App installiert"),
    { timeout: 10000 },
  );

  // Standalone detection proof on a fresh page with injected iOS flag.
  const installedPage = await browser.newPage();
  try {
    await installedPage.evaluateOnNewDocument(() => {
      try {
        Object.defineProperty(window.navigator, "standalone", { value: true, configurable: true });
      } catch { /* older flag unavailable */ }
    });
    await installedPage.goto(origin, { waitUntil: "networkidle0" });
    await installedPage.evaluate(() => {
      const byTitle =
        document.querySelector('button[title="Einstellungen"]') ??
        document.querySelector('button[title="Settings"]');
      byTitle?.click();
    });
    await installedPage.waitForSelector(".settings-page", { timeout: 10000 });
    const installedCopy = await installedPage.evaluate(() => document.querySelector(".pwa-settings")?.textContent ?? "");
    assert.match(installedCopy, /DLens ist als App installiert/, "injected standalone flag must render the installed state");
  } finally {
    await installedPage.close().catch(() => {});
  }

  // Screenshots: desktop + mobile with the settings page confirmed open.
  await page.setViewport({ width: 1280, height: 900 });
  await page.waitForSelector(".settings-page", { timeout: 10000 });
  await page.screenshot({ path: join(ARTIFACTS, "settings-desktop.png"), fullPage: true });
  // DE/EN strings via the existing language select; no horizontal overflow.
  await page.select(".settings-group select", "en");
  await page.waitForFunction(() => (document.querySelector(".pwa-settings")?.textContent ?? "").includes("DLens is available offline"), { timeout: 10000 });
  const enCopy = await page.evaluate(() => document.querySelector(".pwa-settings")?.textContent ?? "");
  assert.match(enCopy, /DLens is available offline/, "EN offline copy must render");
  const overflowDesktop = await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth + 1);
  assert.equal(overflowDesktop, true, "desktop settings must not overflow horizontally");
  await page.select(".settings-group select", "de");
  await page.waitForFunction(() => (document.querySelector(".pwa-settings")?.textContent ?? "").includes("DLens ist offline verfügbar"), { timeout: 10000 });
  // Dark mobile capture via the existing theme toggle; no new UI.
  await page.evaluate(() => {
    const toggle = document.querySelector('button[title="Dunkelmodus"], button[title="Dark mode"], button[title="Hellmodus"], button[title="Light mode"]');
    toggle?.click();
  });
  await page.setViewport({ width: 390, height: 844, isMobile: true });
  if (!(await page.evaluate(() => document.querySelector(".settings-page") !== null))) {
    await page.waitForSelector('button[title="Einstellungen"], button[title="Settings"]', { timeout: 30000 });
    await openSettings(page);
  }
  await page.waitForSelector(".settings-page", { timeout: 10000 });
  const overflowMobile = await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth + 1);
  assert.equal(overflowMobile, true, "mobile settings must not overflow horizontally");
  await page.screenshot({ path: join(ARTIFACTS, "settings-mobile.png"), fullPage: true });

  console.log("PASS: PWA manifest/icons/SW, offline reload, update defer/explicit reload, install flow");
} finally {
  await browser?.close().catch(() => {});
  await new Promise((resolvePromise) => server.close(resolvePromise));
}
