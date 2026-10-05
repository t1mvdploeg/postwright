// De hulpfuncties van de studio: alleen wat zonder DOM te testen is.
import { describe, it, expect, vi, afterEach } from "vitest";
import { debounce } from "../src/web/ui.js";

describe("debounce", () => {
  afterEach(() => vi.useRealTimers());

  it("roept de functie één keer aan, met de laatste argumenten, na de wachttijd", () => {
    vi.useFakeTimers();
    const fn = vi.fn();
    const traag = debounce(fn, 200);
    traag("a");
    vi.advanceTimersByTime(150);
    traag("b");
    vi.advanceTimersByTime(150);
    expect(fn).not.toHaveBeenCalled();
    vi.advanceTimersByTime(50);
    expect(fn).toHaveBeenCalledTimes(1);
    expect(fn).toHaveBeenCalledWith("b");
  });
});
