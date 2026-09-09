// Reproducible DLens PWA icon generator.
// Renders the rounded orange "D" mark (matching theme #f97316) with sharp
// and writes regular, maskable and Apple touch icons into public/icons.
// Run: node scripts/generate-pwa-icons.mjs
import { mkdir, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import sharp from "sharp";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const outDir = resolve(root, "public/icons");
await mkdir(outDir, { recursive: true });

const ORANGE = "#f97316";

function markSvg(size, { maskable = false } = {}) {
  // Maskable icons keep the foreground inside the central ~66% safe zone
  // on a fully opaque background so no transparency is ever required.
  if (maskable) {
    return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${size} ${size}"><rect width="${size}" height="${size}" fill="${ORANGE}"/><g transform="translate(${size * 0.17} ${size * 0.17}) scale(${(size * 0.66) / 40})"><rect width="40" height="40" rx="12" fill="${ORANGE}"/><path d="M13 11v18h6a9 9 0 0 0 0-18h-6Z" fill="none" stroke="white" stroke-width="3.4" stroke-linecap="round" stroke-linejoin="round"/></g></svg>`;
  }
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 40 40"><title>DLens</title><rect width="40" height="40" rx="12" fill="${ORANGE}"/><path d="M13 11v18h6a9 9 0 0 0 0-18h-6Z" fill="none" stroke="white" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"/></svg>`;
}

async function rasterize(svg, size, destination, { opaque = false } = {}) {
  let pipeline = sharp(Buffer.from(svg)).resize(size, size, { fit: "cover" });
  if (opaque) pipeline = pipeline.flatten({ background: ORANGE }).removeAlpha();
  const png = await pipeline.png().toBuffer();
  await writeFile(destination, png);
  console.log(`wrote ${destination} (${png.length} bytes)`);
}

await rasterize(markSvg(192), 192, resolve(outDir, "dlens-192.png"));
await rasterize(markSvg(512), 512, resolve(outDir, "dlens-512.png"));
await rasterize(
  markSvg(512, { maskable: true }),
  512,
  resolve(outDir, "dlens-maskable-512.png"),
  { opaque: true },
);
await rasterize(markSvg(180), 180, resolve(outDir, "apple-touch-icon.png"));
