// Results per template, for the Overview.
import { describe, it, expect } from "vitest";
import { resultsPerTemplate } from "../src/server/results.js";
import type { Post } from "../src/server/schema.js";

const post = (template: string, on: string, result: Post["result"], status: Post["status"] = "published") =>
  ({ template, status, published: { on, url: "" }, result }) as unknown as Post;

describe("resultsPerTemplate", () => {
  it("counts per template the published posts with a result since the date; empty counts as 0", () => {
    const r = resultsPerTemplate(
      [
        post("statement", "2026-09-01T08:00:00Z", { impressions: 100, comments: 3, clicks: null, on: "x" }),
        post("statement", "2026-09-10T08:00:00Z", { impressions: 50, comments: null, clicks: 2, on: "x" }),
        post("question", "2026-09-10T08:00:00Z", null),
        post("question", "2026-01-01T08:00:00Z", { impressions: 999, comments: 0, clicks: 0, on: "x" }),
        post("statistic", "2026-09-10T08:00:00Z", { impressions: 10, comments: 1, clicks: 1, on: "x" }, "draft"),
      ],
      "2026-03-01",
    );
    expect(r).toEqual([{ template: "statement", posts: 2, impressions: 150, comments: 3, clicks: 2 }]);
  });

  it("counts an archived post too: archiving keeps publication and result", () => {
    const r = resultsPerTemplate(
      [
        post("statement", "2026-09-01T08:00:00Z", { impressions: 100, comments: 3, clicks: 1, on: "x" }),
        post("statement", "2026-09-10T08:00:00Z", { impressions: 40, comments: 2, clicks: 0, on: "x" }, "archived"),
        // Archived without a publication (e.g. a draft that was cleaned up) does not count.
        {
          ...post("question", "2026-09-10T08:00:00Z", { impressions: 5, comments: 0, clicks: 0, on: "x" }, "archived"),
          published: null,
        } as Post,
      ],
      "2026-03-01",
    );
    expect(r).toEqual([{ template: "statement", posts: 2, impressions: 140, comments: 5, clicks: 1 }]);
  });
});
