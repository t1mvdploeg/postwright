import { describe, expect, it } from "vitest";
import { deskOf, factProblems } from "../src/web/studio/desk.js";

const post = (id: string, over: object = {}) => ({
  id,
  status: "draft",
  updated: `2026-10-0${id}`,
  facts: [] as string[],
  ...over,
});

describe("the desk", () => {
  it("takes the most recently updated posts and leaves the archive out", () => {
    const posts = [post("1"), post("2"), post("3", { status: "archived" }), post("4"), post("5")];
    expect(deskOf(posts, 3).map((p) => p.id)).toEqual(["5", "4", "2"]);
  });
  it("names every post with a fact that is gone or unusable, also off the desk", () => {
    const posts = [post("1", { facts: ["f1"] }), post("2", { facts: ["gone"] }), post("3", { facts: ["f2"] })];
    const facts = [
      { id: "f1", status: "active", validUntil: null },
      { id: "f2", status: "withdrawn", validUntil: null },
    ];
    expect([...factProblems(posts, facts, "2026-10-12")].sort()).toEqual(["2", "3"]);
  });
  it("counts an expired fact, and leaves archived posts out", () => {
    const facts = [{ id: "f1", status: "active", validUntil: "2026-10-11" }];
    expect([...factProblems([post("1", { facts: ["f1"] })], facts, "2026-10-12")]).toEqual(["1"]);
    expect(factProblems([post("1", { facts: ["gone"], status: "archived" })], [], "2026-10-12").size).toBe(0);
  });
});
