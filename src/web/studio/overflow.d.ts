// Type declaration next to overflow.js (plain browser ESM, no build step).
import type { Rectangle } from "./formats.js";

export interface Block {
  el: { contains(other: unknown): boolean };
  r: Rectangle;
}
export function overlapPairs<T extends Block>(items: T[], tolerance?: number): Array<[T, T]>;
