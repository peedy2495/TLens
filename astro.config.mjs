import { defineConfig } from "astro/config";
import react from "@astrojs/react";
import tailwindcss from "@tailwindcss/vite";
import AstroPWA from "@vite-pwa/astro";
import { handleImportUrl, createImportUrlHandler } from "./server/import-relay.mjs";
// Same-origin import relay for local dev/preview. Production uses the
// identical default handler as the Vercel function api/import-url.mjs.
// DLENS_RELAY_ALLOW_LOOPBACK=1 lifts only the loopback block for local
// fixture testing (browser smoke); never set it in deployed environments.
const localRelay =
  process.env.DLENS_RELAY_ALLOW_LOOPBACK === "1"
    ? createImportUrlHandler({ allowLoopback: true })
    : handleImportUrl;
// Same-origin import relay for local dev/preview. Production uses the
// identical default handler as the Vercel function api/import-url.mjs.
function importUrlRelay() {
  const mount = (server) => {
    const middlewares = server?.middlewares;
    if (!middlewares?.use) return;
    middlewares.use("/api/import-url", (req, res) => {
      void localRelay(req, res);
    });
  };
  return {
    name: "dlens-import-url-relay",
    configureServer: mount,
    configurePreviewServer: mount,
  };
}
export default defineConfig({
  integrations: [
    react(),
    AstroPWA({
      registerType: "prompt",
      injectRegister: false,
      devOptions: { enabled: false },
      manifest: {
        name: "DLens",
        short_name: "DLens",
        description: "DLens – Data Explorer: filter and display hierarchical and relational data.",
        id: "/",
        start_url: "/",
        scope: "/",
        display: "standalone",
        orientation: "any",
        theme_color: "#f7f9fc",
        background_color: "#f7f9fc",
        icons: [
          { src: "icons/dlens-192.png", sizes: "192x192", type: "image/png" },
          { src: "icons/dlens-512.png", sizes: "512x512", type: "image/png" },
          {
            src: "icons/dlens-maskable-512.png",
            sizes: "512x512",
            type: "image/png",
            purpose: "maskable",
          },
        ],
      },
      workbox: {
        globPatterns: [
          "index.html",
          "settings/index.html",
          "_astro/**/*.{js,css,wasm,woff,woff2}",
          "favicon.svg",
          "icons/*.png",
        ],
        maximumFileSizeToCacheInBytes: 5 * 1024 * 1024,
        navigateFallback: "/",
        navigateFallbackAllowlist: [/^\/(\?.*)?$/, /^\/settings\/?(\?.*)?$/],
        cleanupOutdatedCaches: true,
        skipWaiting: false,
        clientsClaim: false,
      },
    }),
  ],
  vite: { plugins: [tailwindcss(), importUrlRelay()], cacheDir: process.env.DLENS_VITE_CACHE ?? ".dlens-cache/vite", worker: { format: "es" }, optimizeDeps: { exclude: ["@sqlite.org/sqlite-wasm"] } },
});
