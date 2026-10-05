// Type declaration next to numbers.js (plain browser ESM, no build step).
export interface Number {
  kind: "amount" | "percent" | "number" | "unclear";
  value: number | string; // unclear: the text as written
  text: string;
}
export function getNumbers(text: unknown): Number[];
export function uncoveredNumbers(text: unknown, facts: Array<{ text: string }>): Number[];
