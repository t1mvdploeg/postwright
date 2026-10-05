// The studio's helper functions: only what can be tested without a DOM.
import { describe, it, expect, vi, afterEach } from "vitest";
import { debounce } from "../src/web/ui.js";

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
