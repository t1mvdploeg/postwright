import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { applyTheme, chooseTheme, readTheme } from "../src/web/studio/theme.js";
import { contrastRatio } from "../src/web/studio/color.js";

const store = (value: string | null) => ({ getItem: () => value, setItem: () => {}, removeItem: () => {} });
const blocked = {
  getItem: () => {
    throw new Error("blocked");
  },
  setItem: () => {
    throw new Error("blocked");
  },
  removeItem: () => {
    throw new Error("blocked");
  },
};
const root = () => ({ dataset: {} as Record<string, string> });

describe("colour choice", () => {
  it("reads light and dark, and treats anything else as System", () => {
    expect(readTheme(store("dark"))).toBe("dark");
    expect(readTheme(store("light"))).toBe("light");
    expect(readTheme(store("blue"))).toBe("system");
    expect(readTheme(store(null))).toBe("system");
  });
  it("falls back to System when storage is blocked", () => {
    expect(readTheme(blocked)).toBe("system");
    const r = root();
    expect(() => chooseTheme("dark", r, blocked)).not.toThrow();
    expect(r.dataset.theme).toBe("dark");
  });
  it("sets data-theme, and System removes it", () => {
    const r = root();
    applyTheme("dark", r);
    expect(r.dataset.theme).toBe("dark");
    applyTheme("system", r);
    expect("theme" in r.dataset).toBe(false);
  });
});

describe("interface palette", () => {
  const css = readFileSync(new URL("../src/web/studio.css", import.meta.url), "utf8");
  const token = (name: string) => {
    const m = new RegExp(`--${name}:\\s*light-dark\\((#[0-9a-f]{6}),\\s*(#[0-9a-f]{6})\\)`).exec(css);
    if (!m) throw new Error(`--${name} is not a light-dark() pair of hex colours`);
    return { light: m[1], dark: m[2] };
  };
  const pairs = [
    ["text", "background"],
    ["text", "card"],
    ["text-muted", "background"],
    ["text-muted", "sidebar"],
    ["text-muted", "card"],
    ["accent", "background"],
    ["accent", "accent-soft"],
    ["on-accent", "accent-fill"],
  ];
  for (const [text, ground] of pairs)
    for (const mode of ["light", "dark"] as const)
      it(`${text} on ${ground} reaches 4.5:1 (${mode})`, () => {
        expect(contrastRatio(token(text)[mode], token(ground)[mode])).toBeGreaterThanOrEqual(4.5);
      });
});
