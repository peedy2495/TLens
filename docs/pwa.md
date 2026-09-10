# DLens PWA

DLens is an installable, offline-capable Progressive Web App (static build only).
The chrome follows the resolved theme: a saved `dlens-dark` boolean wins,
otherwise `prefers-color-scheme` applies and is followed live. Manual toggles
update `documentElement.dataset.theme` and `<meta name="theme-color">`
immediately (`#f7f9fc` light, `#131820` dark) and persist; automatic choices are
never stored. An inline head script applies the same resolution before first
paint. The manifest keeps the light `#f7f9fc` as static `theme_color` fallback.

## What is cached

Production `npm run build` generates `dist/manifest.webmanifest`, `dist/sw.js`
(Workbox GenerateSW) and precaches **only**:

- `/` (`index.html`)
- `_astro/**/*.{js,css,wasm,woff,woff2}` (app, SQLite workers, WASM runtime,
  including `virtual:pwa-register`/`workbox-window` chunks)
- `favicon.svg`, `icons/*.png`
- the generated manifest itself

Per-file ceiling: 5 MiB. No runtime caching: demos, user files, credentials and
HTTP/API responses are never cached – this includes `/api/import-url` relay
payloads, which always hit the network. Navigation fallback serves `/` **only**
for the root path with an optional query string; `/api/*` and other paths
return 404. In production `/api/import-url` is served by the Vercel function
(`api/import-url.mjs`), never by the service worker; offline URL imports fail
with the regular actionable import error.

## Install and update

- Install prompt handling lives in `src/lib/pwa.ts` (`usePwa`) and
  `src/components/PwaSettings.tsx`. The hook stays mounted in `WorkspaceApp`.
- `beforeinstallprompt` is captured on mount and invoked only from the
  settings click, then consumed; `appinstalled` clears it. Standalone mode is
  detected via `matchMedia("(display-mode: standalone)")`,
  `navigator.standalone` and display-mode changes. Listeners are cleaned up.
- No unsolicited install popups. Without a prompt the settings show
  browser-menu / Share → Add to Home Screen guidance (Safari macOS: Add to Dock).
- Offline readiness reflects the service-worker `onOfflineReady` signal, not
  `navigator.onLine`.
- Updates use `registerType: "prompt"`: a waiting worker never auto-reloads.
  The workspace banner offers Update/Later; Later defers while the update stays
  available in settings. Update is disabled and guarded while `working`
  (import/delete) is true. Registration errors stay local and never break app use.

## Requirements

- Browser with service workers, Web Locks and OPFS; HTTPS or localhost.
- First load must be online so the precache completes. Afterwards local
  imports, search and filters work offline. Remote connectors still need network.
- Only one window owns the SQLite worker (existing Web Lock behaviour);
  a second tab keeps showing the lock notice.
- No cross-device sync or shared storage across install platforms is promised.

## Verification

```sh
npm run build
npm run test:pwa
```

`scripts/check-pwa-browser.mjs` serves `dist/` on loopback with correct
JS/WASM/manifest MIME types, traversal rejection and no-cache headers for
`/sw.js`, `/manifest.webmanifest` and `/`, then checks manifest/icons, a single
manifest link, SW control, offline reload with persisted OPFS records, offline
import, cache contents, non-root fallback rejection, waiting-update behaviour
(explicit reload preserves OPFS) and the synthetic install-prompt flow.
Artifacts go to `artifacts/pwa-check/` (including desktop/mobile settings
screenshots). `PWA_CHROME_PATH` (or `CHROME_PATH`) overrides the Chrome binary.
