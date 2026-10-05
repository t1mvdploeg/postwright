// Marketingstudio — resultaten per sjabloon, voor het Overzicht.
import { describe, it, expect } from "vitest";
import { resultatenPerSjabloon } from "../src/model/marketing-resultaten.js";
import type { Post } from "../src/model/marketing-schema.js";

const post = (sjabloon: string, op: string, resultaat: Post["resultaat"], status: Post["status"] = "gepubliceerd") =>
  ({ sjabloon, status, gepubliceerd: { op, url: "" }, resultaat } as unknown as Post);

describe("resultatenPerSjabloon", () => {
  it("telt per sjabloon de gepubliceerde posts met resultaat sinds de datum; leeg telt als 0", () => {
    const r = resultatenPerSjabloon([
      post("stelling", "2026-09-01T08:00:00Z", { vertoningen: 100, reacties: 3, klikken: null, op: "x" }),
      post("stelling", "2026-09-10T08:00:00Z", { vertoningen: 50, reacties: null, klikken: 2, op: "x" }),
      post("vraag", "2026-09-10T08:00:00Z", null),
      post("vraag", "2026-01-01T08:00:00Z", { vertoningen: 999, reacties: 0, klikken: 0, op: "x" }),
      post("cijfer", "2026-09-10T08:00:00Z", { vertoningen: 10, reacties: 1, klikken: 1, op: "x" }, "concept"),
    ], "2026-03-01");
    expect(r).toEqual([{ sjabloon: "stelling", posts: 2, vertoningen: 150, reacties: 3, klikken: 2 }]);
  });

  it("telt een gearchiveerde post mee: archiveren houdt publicatie en resultaat (afsluitende review, A4)", () => {
    const r = resultatenPerSjabloon([
      post("stelling", "2026-09-01T08:00:00Z", { vertoningen: 100, reacties: 3, klikken: 1, op: "x" }),
      post("stelling", "2026-09-10T08:00:00Z", { vertoningen: 40, reacties: 2, klikken: 0, op: "x" }, "gearchiveerd"),
      // Gearchiveerd zonder publicatie (bv. een concept dat is opgeruimd) telt niet.
      { ...post("vraag", "2026-09-10T08:00:00Z", { vertoningen: 5, reacties: 0, klikken: 0, op: "x" }, "gearchiveerd"), gepubliceerd: null } as Post,
    ], "2026-03-01");
    expect(r).toEqual([{ sjabloon: "stelling", posts: 2, vertoningen: 140, reacties: 5, klikken: 1 }]);
  });
});
