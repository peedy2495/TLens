// Vercel Node function: same-origin relay for public URL imports.
// Shares its implementation with local dev/preview (see astro.config.mjs).
// Never deployed with credentials; never forwards cookies or auth upstream.
import { handleImportUrl } from "../server/import-relay.mjs";

export const config = { maxDuration: 25 };

export default function handler(req, res) {
  return handleImportUrl(req, res);
}
