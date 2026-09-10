// Astro's static preview does not load configured Vite plugins. Mount the
// import relay explicitly while serving the production output through Vite.
import { parseArgs } from "node:util";
import { preview } from "vite";
import { createImportUrlHandler } from "../server/import-relay.mjs";

const { values } = parseArgs({ options: {
  host: { type: "string", default: "127.0.0.1" },
  port: { type: "string", default: "4321" },
} });
const relay = createImportUrlHandler({ allowLoopback: process.env.DLENS_RELAY_ALLOW_LOOPBACK === "1" });
const server = await preview({
  configFile: false,
  appType: "mpa",
  build: { outDir: "dist" },
  preview: { host: values.host, port: Number(values.port), strictPort: true },
  plugins: [{ name: "dlens-preview-relay", configurePreviewServer(server) {
    server.middlewares.use("/api/import-url", (req, res) => void relay(req, res));
  } }],
});
server.printUrls();
for (const signal of ["SIGINT", "SIGTERM"]) {
  process.once(signal, () => { void server.close(); });
}
