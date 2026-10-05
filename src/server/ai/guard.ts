// The guard around every paid AI call: the monthly cap, one call at a time, and booking in
// `ai-usage.jsonl`. The cap fails closed: the usage file must be appendable before the call,
// and the cost of a call that could not be booked is kept in memory and counted with what
// the file says.
import { ApiError } from "../http.js";
import { serialize } from "../files.js";
import { AiError, type Usage } from "./provider.js";
import { assertBookable, book, costUsd, monthTotalUsd, type UsageEntry } from "./usage.js";

/** Dollars spent but not in the file, per data folder and UTC month. */
const unbooked = new Map<string, number>();

export interface PaidCall<T> {
  value: T;
  model: string;
  usage: Usage;
}

async function bookCounted(dataDir: string, line: UsageEntry) {
  try {
    await book(dataDir, line);
  } catch (e) {
    const key = `${dataDir}:${line.timestamp.slice(0, 7)}`;
    unbooked.set(key, (unbooked.get(key) ?? 0) + line.usd);
    throw e;
  }
}

/**
 * Runs one paid call. `reserveUsd` is what a big call may cost: the call is refused when the
 * month's total plus the reserve is at or over the cap. Every call is booked, a failed one
 * too (with the tokens already spent). Two calls never run at the same time.
 */
export async function runPaid<T>(
  o: {
    dataDir: string;
    cap: () => Promise<number>;
    label: string;
    task: string;
    model: string;
    capped: boolean;
    reserveUsd?: number;
  },
  call: () => Promise<PaidCall<T>>,
): Promise<PaidCall<T>> {
  return serialize(`ai:${o.dataDir}`, async () => {
    if (o.capped) {
      const cap = await o.cap();
      const now = new Date();
      const spent =
        (await monthTotalUsd(o.dataDir, now)) + (unbooked.get(`${o.dataDir}:${now.toISOString().slice(0, 7)}`) ?? 0);
      const reserve = o.reserveUsd ?? 0;
      if (spent + reserve >= cap) {
        throw new ApiError(
          429,
          reserve > 0
            ? `${o.label} can cost up to $${reserve}; the monthly cap ($${cap}) leaves too little room this month`
            : `The monthly cap for AI help ($${cap}) has been reached`,
        );
      }
      await assertBookable(o.dataDir);
    }
    let result: PaidCall<T>;
    try {
      result = await call();
    } catch (error) {
      const usd = error instanceof AiError && error.usage ? costUsd(o.model, error.usage) : 0;
      await bookCounted(o.dataDir, {
        timestamp: new Date().toISOString(),
        model: o.model,
        task: o.task,
        usd,
        ok: false,
      });
      throw new ApiError(
        502,
        `${o.label} did not give a usable answer: ${error instanceof Error ? error.message : String(error)}`,
      );
    }
    await bookCounted(o.dataDir, {
      timestamp: new Date().toISOString(),
      model: result.model,
      task: o.task,
      usd: costUsd(result.model, result.usage),
      ok: true,
    });
    return result;
  });
}
