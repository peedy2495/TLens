export const LIGHT_THEME_COLOR = "#f7f9fc";
export const DARK_THEME_COLOR = "#131820";
const STORAGE_KEY = "dlens-dark";

export function readThemePreference(): boolean | null {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw === null) return null;
    const value = JSON.parse(raw);
    return typeof value === "boolean" ? value : null;
  } catch {
    return null;
  }
}

export function systemPrefersDark(): boolean {
  try {
    return window.matchMedia("(prefers-color-scheme: dark)").matches;
  } catch {
    return false;
  }
}

export function resolveTheme(): boolean {
  const stored = readThemePreference();
  if (stored !== null) return stored;
  return systemPrefersDark();
}

export function themeColorFor(dark: boolean): string {
  return dark ? DARK_THEME_COLOR : LIGHT_THEME_COLOR;
}

export function applyTheme(dark: boolean): void {
  try {
    document.documentElement.dataset.theme = dark ? "dark" : "light";
  } catch {
    /* DOM unavailable. */
  }
  try {
    let meta = document.querySelector('meta[name="theme-color"]');
    if (!meta) {
      meta = document.createElement("meta");
      meta.setAttribute("name", "theme-color");
      document.head?.appendChild(meta);
    }
    meta.setAttribute("content", themeColorFor(dark));
  } catch {
    /* Meta update unavailable. */
  }
}

export function persistThemeChoice(dark: boolean): void {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(dark));
  } catch {
    /* Private mode or unavailable storage: keep in-memory choice. */
  }
}
