// The studio's helper functions: only what can be tested without a DOM.
import { describe, it, expect, vi, afterEach } from "vitest";
import { debounce, isSaveShortcut } from "../src/web/ui.js";

describe("debounce", () => {
  afterEach(() => vi.useRealTimers());

  it("calls the function once, with the last arguments, after the wait time", () => {
    vi.useFakeTimers();
    const fn = vi.fn();
    const slow = debounce(fn, 200);
    slow("a");
    vi.advanceTimersByTime(150);
    slow("b");
    vi.advanceTimersByTime(150);
    expect(fn).not.toHaveBeenCalled();
    vi.advanceTimersByTime(50);
    expect(fn).toHaveBeenCalledTimes(1);
    expect(fn).toHaveBeenCalledWith("b");
  });
});

describe("isSaveShortcut", () => {
  const key = (k: string, mods: object = {}) => ({
    key: k,
    ctrlKey: false,
    metaKey: false,
    shiftKey: false,
    altKey: false,
    ...mods,
  });

  it("accepts Ctrl+S and Cmd+S", () => {
    expect(isSaveShortcut(key("s", { ctrlKey: true }))).toBe(true);
    expect(isSaveShortcut(key("S", { metaKey: true }))).toBe(true);
  });

  it("ignores a plain S and other combinations", () => {
    expect(isSaveShortcut(key("s"))).toBe(false);
    expect(isSaveShortcut(key("a", { ctrlKey: true }))).toBe(false);
    expect(isSaveShortcut(key("s", { ctrlKey: true, shiftKey: true }))).toBe(false);
    expect(isSaveShortcut(key("s", { metaKey: true, altKey: true }))).toBe(false);
  });
});
