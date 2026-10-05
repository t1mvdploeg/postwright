// The calendar: a fixed list of annual days plus custom moments from moments.json, and the
// route that turns a moment into a draft fact without duplicates.
import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { allMoments, type Moment } from "../src/server/moments.js";
import { plusDays } from "../src/web/studio/calendar.js";
import { readCustomMoments } from "../src/server/routes.js";
import { FactInputSchema } from "../src/server/schema.js";
import { startStudio } from "./helpers/studio.js";

const custom = (x: Partial<Moment> = {}): Moment => ({
  key: "custom-launch",
  date: "2026-11-03",
  title: "Launch day",
  sentence: "Show the launch.",
  kind: "custom",
  ...x,
});

describe("allMoments", () => {
  it("gives the yearly days of the range, sorted, with the date as key", () => {
    const m = allMoments("2026-04-01", "2026-04-30");
    expect(m.map((x) => x.key)).toEqual(["2026-04-21", "2026-04-22"]);
    expect(m[1]).toEqual({
      key: "2026-04-22",
      date: "2026-04-22",
      title: "Earth Day",
      sentence: "Share one concrete thing you do, not a promise.",
      kind: "day",
    });
  });

  it("gives the moments of both years for a range across the new year", () => {
    const m = allMoments("2026-12-20", "2027-01-05");
    expect(m.map((x) => x.date)).toEqual(["2026-12-25", "2027-01-01"]);
  });

  it("includes the bounds and leaves out what falls outside", () => {
    expect(allMoments("2026-12-25", "2026-12-25")).toHaveLength(1);
    expect(allMoments("2026-12-26", "2027-01-01").map((x) => x.date)).toEqual(["2027-01-01"]);
    expect(allMoments("2026-12-26", "2026-12-31")).toEqual([]);
  });

  it("adds own moments, also from a year without a fixed day, and filters them on the range", () => {
    const m = allMoments("2026-10-01", "2026-12-31", [custom(), custom({ key: "custom-outside", date: "2027-03-01" })]);
    expect(m.map((x) => [x.date, x.kind])).toEqual([
      ["2026-10-10", "day"],
      ["2026-11-03", "custom"],
      ["2026-12-25", "day"],
    ]);
  });

  it("sorts by date and then by key", () => {
    const m = allMoments("2026-12-25", "2026-12-25", [custom({ key: "a", date: "2026-12-25" })]);
    expect(m.map((x) => x.key)).toEqual(["2026-12-25", "a"]);
  });

  it("every fixed day has a unique key, a title and a sentence that ends with a full stop", () => {
    const all = allMoments("2026-01-01", "2026-12-31");
    expect(all).toHaveLength(8);
    expect(new Set(all.map((m) => m.key)).size).toBe(8);
    for (const m of all) {
      expect(m.key).toMatch(/^[a-z0-9-]{3,60}$/);
      expect(m.title.length).toBeGreaterThan(0);
      expect(m.sentence).toMatch(/\.$/);
    }
  });

  it("counts days on calendar dates, also across winter time and the year boundary", () => {
    expect(plusDays("2026-10-24", 2)).toBe("2026-10-26");
    expect(plusDays("2026-12-31", 1)).toBe("2027-01-01");
    expect(plusDays("2026-03-01", -1)).toBe("2026-02-28");
  });
});

describe("readCustomMoments", () => {
  let studio: Awaited<ReturnType<typeof startStudio>>;
  beforeAll(async () => {
    studio = await startStudio();
  });
  afterAll(async () => {
    await studio.close();
  });
  const write = (content: string) => {
    mkdirSync(join(studio.dataDir, "marketing"), { recursive: true });
    writeFileSync(join(studio.dataDir, "marketing", "moments.json"), content);
  };
  const get = (path: string) => fetch(studio.base + path);

  it("gives an empty list while the file is not there", async () => {
    expect(await readCustomMoments({ dir: studio.dataDir })).toEqual([]);
  });

  it("reads own moments and marks them as own; they are included in the route", async () => {
    write(
      JSON.stringify([{ key: "custom-launch", date: "2026-11-03", title: "Launch day", sentence: "Show the launch." }]),
    );
    expect(await readCustomMoments({ dir: studio.dataDir })).toEqual([custom()]);
    const list = (await (await get("/api/moments?from=2026-11-01&to=2026-11-30")).json()).moments;
    expect(list).toEqual([custom()]);
  });

  it("gives an ApiError 500 with the file name on broken JSON or a wrong shape", async () => {
    write("{broken");
    await expect(readCustomMoments({ dir: studio.dataDir })).rejects.toMatchObject({
      status: 500,
      message: expect.stringContaining("moments.json"),
    });
    const r = await get("/api/moments");
    expect(r.status).toBe(500);
    expect((await r.json()).error).toContain("moments.json");
    write(JSON.stringify([{ key: "x", date: "2026-13-45", title: "Error" }]));
    await expect(readCustomMoments({ dir: studio.dataDir })).rejects.toMatchObject({
      status: 500,
      message: expect.stringContaining("moments.json"),
    });
    write("[]");
  });
});

describe("routes moments", () => {
  let studio: Awaited<ReturnType<typeof startStudio>>;
  beforeAll(async () => {
    studio = await startStudio();
  });
  afterAll(async () => {
    await studio.close();
  });
  const get = (path: string) => fetch(studio.base + path);
  // Every POST without a raw body requires application/json, even if the route does not read
  // the body.
  const post = (path: string) =>
    fetch(studio.base + path, { method: "POST", headers: { "content-type": "application/json" }, body: "{}" });

  it("gives the moments in a period and makes a draft fact of one once", async () => {
    const list = (await (await get("/api/moments?from=2026-04-22&to=2026-04-22")).json()).moments;
    expect(list.map((x: Moment) => x.key)).toEqual(["2026-04-22"]);
    const een = await post("/api/moments/2026-04-22/fact");
    expect(een.status).toBe(201);
    const fact = await een.json();
    expect(fact).toMatchObject({
      text: "Earth Day: Share one concrete thing you do, not a promise.",
      kind: "external",
      status: "draft",
      validUntil: null,
    });
    // The fact can itself be edited and saved again.
    const { id: _i, created: _a, updated: _g, ...input } = fact;
    expect(FactInputSchema.safeParse(input).success).toBe(true);
    const two = await post("/api/moments/2026-04-22/fact");
    expect(two.status).toBe(200);
    expect((await two.json()).id).toBe(fact.id);
    const facts = (await (await get("/api/facts")).json()).facts;
    expect(facts.filter((f: { text: string }) => f.text === fact.text)).toHaveLength(1);
    const unknown = await post("/api/moments/does-not-exist/fact");
    expect(unknown.status).toBe(404);
    // "Create post" in the planner (ideas-ui.js) recognises from exactly this text that the
    // moment is gone.
    expect((await unknown.json()).error).toBe("Unknown moment");
    // A date without a fixed day is unknown too.
    expect((await post("/api/moments/2026-04-23/fact")).status).toBe(404);
  });

  it("gives an active fact back, but refuses with 409 if the fact is withdrawn", async () => {
    const path = "/api/moments/2026-09-30/fact";
    const een = await post(path);
    expect(een.status).toBe(201);
    const fact = await een.json();
    const set = (status: string) =>
      fetch(`${studio.base}/api/facts/${fact.id}`, {
        method: "PUT",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          text: fact.text,
          kind: fact.kind,
          source: fact.source,
          validFrom: fact.validFrom,
          validUntil: fact.validUntil,
          status,
        }),
      });
    expect((await set("active")).status).toBe(200);
    const active = await post(path);
    expect(active.status).toBe(200);
    expect(await active.json()).toMatchObject({ id: fact.id, status: "active" });
    expect((await set("withdrawn")).status).toBe(200);
    const withdrawn = await post(path);
    expect(withdrawn.status).toBe(409);
    expect((await withdrawn.json()).error).toBe(
      "The fact for this moment is withdrawn; set it back to draft in the Fact bank if you want to use it again",
    );
    // No second fact with the same text is added either.
    const facts = (await (await get("/api/facts")).json()).facts;
    expect(facts.filter((f: { text: string }) => f.text === fact.text)).toHaveLength(1);
  });

  it("refuses an invalid period", async () => {
    expect((await get("/api/moments?from=yesterday")).status).toBe(400);
    // The right pattern, but not a real date: no 500 from plusDays, and no silent 2 March.
    expect((await get("/api/moments?from=2026-13-01")).status).toBe(400);
    expect((await get("/api/moments?from=2026-02-30")).status).toBe(400);
    expect((await get("/api/moments?from=2026-02-01&to=2026-02-30")).status).toBe(400);
    expect((await get("/api/moments?from=2026-12-01&to=2026-11-01")).status).toBe(400);
    expect((await get("/api/moments?from=2026-11-01")).status).toBe(200);
  });
});
