// What the AI costs and what has already been spent this month. One line per call in
// `<data folder>/ai-usage.jsonl`.
import { appendFile, mkdir, open, readFile } from "node:fs/promises";
import { dirname } from "node:path";
import { path, reason } from "../files.js";
import { ApiError } from "../http.js";
import type { Usage } from "./provider.js";

/**
 * Dollars per million tokens: [input, output, cache read]. Cache write (5 minutes) costs
 * 1.25 times the input price. Source: Anthropic's model table (prices as of 2026-09-25) and
 * the explanation of prompt caching; cache read is 0.1 times the input price, except where
 * the source gives its own amount (Fable 5.1: 0.25; Opus 5.5: 0.20).
 */
const PRICES: Record<string, readonly [number, number, number]> = {
  "claude-fable-5-1": [10, 50, 0.25],
  "claude-opus-5-5": [4, 20, 0.2],
  "claude-opus-5": [5, 25, 0.5],
  "claude-opus-4-8": [5, 25, 0.5],
  "claude-opus-4-7": [5, 25, 0.5],
  "claude-opus-4-6": [5, 25, 0.5],
  "claude-sonnet-5-5": [2, 10, 0.2],
  "claude-sonnet-5": [2, 10, 0.2],
  "claude-sonnet-4-6": [3, 15, 0.3],
  "claude-haiku-4-5": [1, 5, 0.1],
};
/**
 * A model that is not in the table is priced at the most expensive rate: the cap must
 * never count too low.
 */
const UNKNOWN = PRICES["claude-fable-5-1"];

export function costUsd(model: string, u: Usage): number {
  const [input, output, read] = PRICES[model] ?? UNKNOWN;
  return (u.input * input + u.output * output + u.cacheRead * read + u.cacheWrite * input * 1.25) / 1_000_000;
}

export interface UsageEntry {
  timestamp: string;
  model: string;
  task: string;
  usd: number;
  ok: boolean;
}

const file = (dataDir: string) => path({ dir: dataDir }, "ai-usage.jsonl");

/**
 * Fails (500) if the usage file cannot be appended to. Called before a paid call: a call
 * that cannot be booked afterwards would not count towards the cap.
 */
export async function assertBookable(dataDir: string): Promise<void> {
  const p = file(dataDir);
  try {
    await mkdir(dirname(p), { recursive: true, mode: 0o700 });
    await (await open(p, "a", 0o600)).close();
  } catch (e) {
    throw new ApiError(500, `ai-usage.jsonl cannot be written (${reason(e)}); no live AI calls until that is fixed`);
  }
}

/**
 * Appends the line after the existing ones. If the file does not end with a line break (a
 * crashed process), the new line starts on a line of its own.
 */
export async function book(dataDir: string, line: UsageEntry): Promise<void> {
  const p = file(dataDir);
  await mkdir(dirname(p), { recursive: true, mode: 0o700 });
  const existing = await readFile(p, "utf8").catch((e) => {
    if ((e as NodeJS.ErrnoException).code === "ENOENT") return "";
    throw e;
  });
  const begin = existing && !existing.endsWith("\n") ? "\n" : "";
  await appendFile(p, begin + JSON.stringify(line) + "\n", { mode: 0o600 });
}

/**
 * Everything booked in the month of `now` (UTC), failed calls included: they cost tokens.
 * The cap must never count too low, so a line that cannot be read, or whose `usd` is not a
 * number, gives a 500 (the live call is then refused). Only a last line without a line
 * break, the trace of a crashed process, is ignored.
 */
export async function monthTotalUsd(dataDir: string, now: Date): Promise<number> {
  let text: string;
  try {
    text = await readFile(file(dataDir), "utf8");
  } catch (e) {
    if ((e as NodeJS.ErrnoException).code === "ENOENT") return 0;
    throw e;
  }
  const month = now.toISOString().slice(0, 7);
  const rawLines = text.split("\n");
  let sum = 0;
  for (const [i, rawLine] of rawLines.entries()) {
    if (!rawLine.trim()) continue;
    const unreadable = () =>
      new ApiError(500, `ai-usage.jsonl: line ${i + 1} is unreadable; repair or remove that line`);
    let r: Partial<UsageEntry> | null;
    try {
      r = JSON.parse(rawLine);
    } catch {
      if (i === rawLines.length - 1) continue; // the last line without a line break: an interrupted write
      throw unreadable();
    }
    if (typeof r !== "object" || r === null || typeof r.timestamp !== "string" || !Number.isFinite(r.usd))
      throw unreadable();
    if (r.timestamp.slice(0, 7) === month) sum += r.usd as number;
  }
  return sum;
}
