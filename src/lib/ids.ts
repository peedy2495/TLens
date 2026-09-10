// Secure-context-safe unique ID generation. crypto.randomUUID() is only
// available in secure contexts (https, localhost); plain-http LAN access
// (e.g. Vite --host) leaves it undefined, so fall back gracefully.
export function newId(prefix = "id"): string {
  try {
    const randomUUID = globalThis.crypto?.randomUUID;
    if (typeof randomUUID === "function") return randomUUID.call(globalThis.crypto);
  } catch {
    /* Fall through to manual generation. */
  }
  try {
    const bytes = new Uint8Array(16);
    globalThis.crypto?.getRandomValues?.(bytes);
    if (bytes.some((byte) => byte !== 0)) {
      bytes[6] = (bytes[6] & 0x0f) | 0x40;
      bytes[8] = (bytes[8] & 0x3f) | 0x80;
      const hex = [...bytes].map((byte) => byte.toString(16).padStart(2, "0")).join("");
      return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
    }
  } catch {
    /* Fall through to Math.random. */
  }
  return `${prefix}-${Date.now()}-${Math.floor(Math.random() * 1e9)}`;
}
