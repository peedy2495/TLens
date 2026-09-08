import { defineConfig } from "astro/config";
import react from "@astrojs/react";
import tailwindcss from "@tailwindcss/vite";
export default defineConfig({
  integrations: [react()],
  vite: { plugins: [tailwindcss()], cacheDir: process.env.DLENS_VITE_CACHE ?? ".dlens-cache/vite", worker: { format: "es" }, optimizeDeps: { exclude: ["@sqlite.org/sqlite-wasm"] } },
});
