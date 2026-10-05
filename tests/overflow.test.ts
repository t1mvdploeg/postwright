// The overlap check between text blocks (the browser part of the measurement cannot run here).
import { describe, it, expect } from "vitest";
import { overlapPairs } from "../src/web/studio/overflow.js";

const block = (id: string, y: number, height: number, children: unknown[] = []) => ({
  id,
  r: { x: 0, y, width: 100, height },
  el: { contains: (other: unknown) => children.includes(other) },
});

describe("overlapPairs", () => {
  it("does not report rows of a list that sit directly under each other", () => {
    // The rows of the checklist: in the layout they touch exactly, 85 pixels apart.
    const rows = [block("item1", 0, 85), block("item2", 85, 85), block("item3", 170, 85)];
    expect(overlapPairs(rows)).toEqual([]);
  });

  it("does not report blocks that overlap by a pixel or less than the tolerance", () => {
    expect(overlapPairs([block("a", 0, 85), block("b", 84, 85)])).toEqual([]);
  });

  it("reports blocks that really overlap", () => {
    const [a, b] = [block("a", 0, 85), block("b", 60, 85)];
    expect(overlapPairs([a, b])).toEqual([[a, b]]);
  });

  it("does not report a block inside another one", () => {
    const inner = block("inner", 10, 20);
    const outer = block("outer", 0, 85, [inner.el]);
    expect(overlapPairs([outer, inner])).toEqual([]);
  });
});
