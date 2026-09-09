import { defineConfig } from "astro/config";
import react from "@astrojs/react";
import tailwindcss from "@tailwindcss/vite";
import AstroPWA from "@vite-pwa/astro";
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
        theme_color: "#f97316",
        background_color: "#f6f8fa",
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
          "_astro/**/*.{js,css,wasm,woff,woff2}",
          "favicon.svg",
          "icons/*.png",
        ],
        maximumFileSizeToCacheInBytes: 5 * 1024 * 1024,
        navigateFallback: "/",
        navigateFallbackAllowlist: [/^\/(\?.*)?$/],
        cleanupOutdatedCaches: true,
        skipWaiting: false,
        clientsClaim: false,
      },
    }),
  ],
  vite: { plugins: [tailwindcss()], cacheDir: process.env.DLENS_VITE_CACHE ?? ".dlens-cache/vite", worker: { format: "es" }, optimizeDeps: { exclude: ["@sqlite.org/sqlite-wasm"] } },
});
