export type ThemeChoice = "system" | "light" | "dark";
interface Store {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
  removeItem(key: string): void;
}
interface Root {
  dataset: Record<string, string | undefined>;
}
export const THEME_KEY: string;
export function readTheme(store?: Store): ThemeChoice;
export function applyTheme(choice: string, root?: Root): void;
export function chooseTheme(choice: string, root?: Root, store?: Store): void;
