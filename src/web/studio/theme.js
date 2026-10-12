// The colour choice: System (follow the computer), Light or Dark. Kept in this browser, like the
// pinned project. /theme-boot.js applies it before the first paint; this module is for Settings.
export const THEME_KEY = "postwright.theme";

/** The stored choice; "system" when nothing usable is stored or storage is blocked. */
export function readTheme(store = localStorage) {
  try {
    const t = store.getItem(THEME_KEY);
    return t === "light" || t === "dark" ? t : "system";
  } catch {
    return "system";
  }
}

export function applyTheme(choice, root = document.documentElement) {
  if (choice === "light" || choice === "dark") root.dataset.theme = choice;
  else delete root.dataset.theme;
}

/** Applies the choice and remembers it. A browser that blocks storage just forgets it. */
export function chooseTheme(choice, root = document.documentElement, store = localStorage) {
  applyTheme(choice, root);
  try {
    if (choice === "light" || choice === "dark") store.setItem(THEME_KEY, choice);
    else store.removeItem(THEME_KEY);
  } catch {
    // System is used next time.
  }
}
