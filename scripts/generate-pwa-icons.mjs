// Reproducible DLens PWA icon generator.
// Single source of truth: public/favicon.svg (canonical 35-unit vector
// geometry shared with the workspace .brand-mark in App.tsx). All PNGs are
// rasterized from that file with sharp — no host-font text rendering, so
// output is deterministic across machines.
// Run: node scripts/generate-pwa-icons.mjs
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import sharp from "sharp";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const outDir = resolve(root, "public/icons");
await mkdir(outDir, { recursive: true });

const BLUE = "#4b6ce4";

const canonical = await readFile(resolve(root, "public/favicon.svg"), "utf8");
const inner = canonical
  .replace(/^[^>]*>/, "")
  .replace(/<\/svg>\s*$/, "");
if (!inner.includes("<rect") || !inner.includes("<path")) {
  throw new Error("public/favicon.svg does not contain the canonical logo geometry");
}

function regularSvg() {
  return canonical;
}

function maskableSvg(size) {
  // Maskable icons keep the foreground inside the central ~66% safe zone
  // on a fully opaque background so no transparency is ever required.
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${size} ${size}"><rect width="${size}" height="${size}" fill="${BLUE}"/><g transform="translate(${size * 0.17} ${size * 0.17}) scale(${(size * 0.66) / 35})">${inner}</g></svg>`;
}

async function rasterize(svg, size, destination, { opaque = false } = {}) {
  let pipeline = sharp(Buffer.from(svg)).resize(size, size, { fit: "cover" });
  if (opaque) pipeline = pipeline.flatten({ background: BLUE }).removeAlpha();
  const png = await pipeline.png().toBuffer();
  await writeFile(destination, png);
  console.log(`wrote ${destination} (${png.length} bytes)`);
}

await rasterize(regularSvg(), 192, resolve(outDir, "dlens-192.png"));
await rasterize(regularSvg(), 512, resolve(outDir, "dlens-512.png"));
await rasterize(
  maskableSvg(512),
  512,
  resolve(outDir, "dlens-maskable-512.png"),
  { opaque: true },
);
await rasterize(regularSvg(), 180, resolve(outDir, "apple-touch-icon.png"), { opaque: true });
