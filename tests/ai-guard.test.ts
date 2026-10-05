// The guard around every paid call: the monthly cap (with a reserve for a big call), one call
// at a time, and booking, also for a failed call.
import { chmodSync, mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it, vi } from "vitest";
import { runPaid } from "../src/server/ai/guard.js";
import { AiError } from "../src/server/ai/provider.js";
import { book } from "../src/server/ai/usage.js";

const dir = () => mkdtempSync(join(tmpdir(), "pw-guard-"));
// 100,000 in and 10,000 out at $4 and $20 per million: $0.60.
const usage = { input: 100_000, output: 10_000, cacheRead: 0, cacheWrite: 0 };
const options = (dataDir: string, cap: number, extra: Record<string, unknown> = {}) => ({
  dataDir,
  cap: async () => cap,
  label: "Brand kit generation",
  task: "brandKit:x",
  model: "claude-opus-5-5",
  capped: true,
  ...extra,
});
const lines = (dataDir: string) =>
  readFileSync(join(dataDir, "ai-usage.jsonl"), "utf8")
    .trim()
    .split("\n")
    .map((l) => JSON.parse(l));

describe("runPaid", () => {
  it("returns the value and books the cost", async () => {
    const dataDir = dir();
    const r = await runPaid(options(dataDir, 10), async () => ({ value: "ok", model: "claude-opus-5-5", usage }));
    expect(r.value).toBe("ok");
    expect(lines(dataDir)).toMatchObject([{ task: "brandKit:x", model: "claude-opus-5-5", usd: 0.6, ok: true }]);
  });

  it("refuses before the call when the reserve does not fit under the cap", async () => {
    const dataDir = dir();
    await book(dataDir, { timestamp: new Date().toISOString(), model: "m", task: "x", usd: 5, ok: true });
    const call = vi.fn();
    await expect(runPaid(options(dataDir, 6, { reserveUsd: 2 }), call)).rejects.toMatchObject({ status: 429 });
    expect(call).not.toHaveBeenCalled();
    // With room for the reserve the same call goes through.
    await runPaid(options(dataDir, 10, { reserveUsd: 2 }), async () => ({ value: 1, model: "claude-opus-5-5", usage }));
  });

  it("keeps the old behaviour for a call without a reserve: refuse at the cap", async () => {
    const dataDir = dir();
    await book(dataDir, { timestamp: new Date().toISOString(), model: "m", task: "x", usd: 5, ok: true });
    await expect(runPaid(options(dataDir, 5), vi.fn())).rejects.toMatchObject({
      status: 429,
      message: "The monthly cap for AI help ($5) has been reached",
    });
  });

  it("books the tokens of a failed call and answers 502 with a readable message", async () => {
    const dataDir = dir();
    await expect(
      runPaid(options(dataDir, 10), async () => {
        throw new AiError("declined", usage);
      }),
    ).rejects.toMatchObject({ status: 502, message: "Brand kit generation did not give a usable answer: declined" });
    expect(lines(dataDir)).toMatchObject([{ ok: false, usd: 0.6 }]);
  });

  it("books zero for a failure without tokens", async () => {
    const dataDir = dir();
    await expect(
      runPaid(options(dataDir, 10), async () => {
        throw new Error("network down");
      }),
    ).rejects.toMatchObject({ status: 502 });
    expect(lines(dataDir)).toMatchObject([{ ok: false, usd: 0 }]);
  });

  it("ignores the cap when the call is not capped (the sample provider)", async () => {
    const dataDir = dir();
    await runPaid(options(dataDir, 0, { capped: false }), async () => ({
      value: 1,
      model: "sample",
      usage: { ...usage, input: 0, output: 0 },
    }));
    expect(lines(dataDir)).toHaveLength(1);
  });

  it("stops before the call when the usage file cannot be written", async () => {
    const dataDir = dir();
    writeFileSync(join(dataDir, "ai-usage.jsonl"), "");
    chmodSync(join(dataDir, "ai-usage.jsonl"), 0o400); // readable, but nothing can be appended
    const call = vi.fn();
    await expect(runPaid(options(dataDir, 10), call)).rejects.toMatchObject({ status: 500 });
    expect(call).not.toHaveBeenCalled();
  });

  it("runs two calls one after the other", async () => {
    const dataDir = dir();
    const order: string[] = [];
    const slow = (name: string, ms: number) =>
      runPaid(options(dataDir, 10), async () => {
        order.push(`${name}:start`);
        await new Promise((r) => setTimeout(r, ms));
        order.push(`${name}:end`);
        return { value: name, model: "claude-opus-5-5", usage };
      });
    await Promise.all([slow("a", 30), slow("b", 1)]);
    expect(order).toEqual(["a:start", "a:end", "b:start", "b:end"]);
  });
});
