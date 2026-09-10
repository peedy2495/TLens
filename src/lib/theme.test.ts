import { describe, expect, it, vi, beforeEach } from "vitest";
import { applyTheme, readThemePreference, resolveTheme, themeColorFor } from "./theme";

const store = new Map<string, string>();
let metaContent = "#f7f9fc";
let datasetTheme = "";

beforeEach(() => {
  store.clear();
  metaContent = "#f7f9fc";
  datasetTheme = "";
  vi.unstubAllGlobals();
  vi.stubGlobal("localStorage", {
    getItem: (key: string) => (store.has(key) ? store.get(key)! : null),
    setItem: (key: string, value: string) => { store.set(key, String(value)); },
    removeItem: (key: string) => { store.delete(key); },
    clear: () => { store.clear(); },
  });
  vi.stubGlobal("document", {
    documentElement: { dataset: {} },
    head: { appendChild: () => {} },
    createElement: () => ({
      setAttribute: (name: string, value: string) => { if (name === "content") metaContent = value; },
      getAttribute: () => metaContent,
    }),
    querySelector: () => ({
      setAttribute: (name: string, value: string) => { if (name === "content") metaContent = value; },
      getAttribute: () => metaContent,
    }),
  });
  void datasetTheme;
});

describe("theme preference", () => {
  it("uses the saved manual choice over the system theme", () => {
    store.set("dlens-dark", "true");
    vi.stubGlobal("matchMedia", () => ({ matches: false }));
    (globalThis as { window?: unknown }).window = { matchMedia: () => ({ matches: false }) };
    expect(readThemePreference()).toBe(true);
    expect(resolveTheme()).toBe(true);
  });

  it("falls back to the system theme without persisting it", () => {
    (globalThis as { window?: unknown }).window = { matchMedia: () => ({ matches: true }) };
    expect(readThemePreference()).toBe(null);
    expect(resolveTheme()).toBe(true);
    expect(store.has("dlens-dark")).toBe(false);
  });

  it("treats invalid stored values as automatic", () => {
    store.set("dlens-dark", '"dark"');
    (globalThis as { window?: unknown }).window = { matchMedia: () => ({ matches: false }) };
    expect(readThemePreference()).toBe(null);
    expect(resolveTheme()).toBe(false);
  });

  it("updates the document theme and meta theme-color immediately", () => {
    applyTheme(true);
    expect(metaContent).toBe(themeColorFor(true));
    applyTheme(false);
    expect(metaContent).toBe(themeColorFor(false));
  });
});
