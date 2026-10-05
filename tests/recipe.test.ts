// Building recipes and sending them to the server, and the time helpers.
import { describe, it, expect } from "vitest";
import { execFileSync } from "node:child_process";
import { pathToFileURL } from "node:url";
import {
  ideaToRecipe,
  readableMoment,
  withOffset,
  toInput,
  toLocal,
  newRecipe,
  localToday,
  moveSlide,
  convert,
} from "../src/web/studio/recipe.js";
import { template, type Slide } from "../src/web/studio/templates.js";
import { PostInputSchema } from "../src/server/schema.js";

describe("time", () => {
  it("gives the local calendar date, also around midnight", () => {
    expect(localToday(new Date("2026-10-01T23:30:00Z"))).toBe("2026-10-01");
    expect(localToday(new Date("2026-12-31T23:59:59Z"))).toBe("2026-12-31");
    expect(localToday(new Date("2027-01-01T00:00:00Z"))).toBe("2027-01-01");
  });

  it("corrects the offset in a zone with daylight saving time (run in a child process: the suite runs in UTC)", () => {
    const module = (name: string) =>
      pathToFileURL(new URL(`../src/web/studio/${name}.js`, import.meta.url).pathname).href;
    const script = `
      const { withOffset } = await import(${JSON.stringify(module("recipe"))});
      const { rescheduleToDay } = await import(${JSON.stringify(module("calendar"))});
      console.log(JSON.stringify([
        withOffset("2026-12-01T09:00"),
        withOffset("2026-07-01T09:00"),
        withOffset("2026-10-25T01:30"),
        rescheduleToDay("2026-10-20T08:30:00+02:00", "2026-11-03"),
      ]));`;
    const out = execFileSync(process.execPath, ["--import", "tsx", "--input-type=module", "-e", script], {
      env: { ...process.env, TZ: "Europe/Amsterdam" },
      encoding: "utf8",
    });
    expect(JSON.parse(out)).toEqual([
      "2026-12-01T09:00:00+01:00",
      "2026-07-01T09:00:00+02:00",
      // An hour before the change to winter time: still +02:00, which needs the second pass.
      "2026-10-25T01:30:00+02:00",
      // Same clock time across the change from summer to winter time.
      "2026-11-03T08:30:00+01:00",
    ]);
  });

  it("converts a datetime-local value to a timestamp with offset and back", () => {
    const iso = withOffset("2026-10-06T08:30")!;
    expect(iso).toBe("2026-10-06T08:30:00+00:00");
    expect(new Date(iso).getTime()).toBe(new Date("2026-10-06T08:30").getTime());
    expect(toLocal(iso)).toBe("2026-10-06T08:30");
    expect(withOffset("not a date")).toBeNull();
    expect(toLocal("x")).toBe("");
  });

  it("reads the input as the clock time of this computer", () => {
    expect(withOffset("2026-12-01T09:00")).toBe("2026-12-01T09:00:00+00:00");
    expect(toLocal("2026-12-01T09:00:00Z")).toBe("2026-12-01T09:00");
    // A timestamp with another offset is shown on the local clock.
    expect(toLocal("2026-10-06T08:30:00+02:00")).toBe("2026-10-06T06:30");
  });

  it("shows a moment readably in local time", () => {
    expect(readableMoment("2026-10-06T06:30:00Z")).toMatch(/6 Oct 2026.*06:30/);
    expect(readableMoment("x")).toBe("–");
  });
});

describe("recipes", () => {
  it("creates a new recipe with the default content and the formats that are on", () => {
    const r = newRecipe("statement", {
      enabledFormats: ["li-square", "li-portrait", "li-link"],
      brandVersion: "postwright-1.0",
    });
    expect(r.formats).toEqual(["li-square", "li-portrait"]);
    expect(r.content.ground).toBe("accent");
    expect(r.title).toBe("On-brand posts, without the design tool.");
    expect(newRecipe("link-preview", { enabledFormats: [] }).formats).toEqual(["li-link"]);
    const c = newRecipe("carousel", { enabledFormats: ["li-carousel"] });
    expect(c.slides).toHaveLength(6);
    expect(c.content).toEqual({});
    expect(() => newRecipe("poster")).toThrow();
  });

  it("only sends fields the template knows, and that comes from the server schema", () => {
    const s = template("statement")!;
    const r = {
      ...newRecipe("statement", { enabledFormats: ["li-square"], brandVersion: "postwright-1.0" }),
      content: { headline: "A *headline*", foreign: "remove" },
      caption: { linkedin: "Text", x: "  " },
    };
    const input = toInput(r, s, { errors: 0, attention: 1, on: "2026-10-01T10:00:00.000Z" });
    expect(input.content).not.toHaveProperty("foreign");
    expect(input.content.headline).toBe("A *headline*");
    expect(input.content.ground).toBe("accent");
    expect(input.caption).toEqual({ linkedin: "Text" });
    expect(PostInputSchema.safeParse(input).success).toBe(true);
    const c = template("carousel")!;
    const ci = toInput(
      newRecipe("carousel", { enabledFormats: ["li-carousel"], brandVersion: "postwright-1.0" }),
      c,
      null,
    );
    expect(ci.slides).toHaveLength(6);
    expect(PostInputSchema.safeParse(ci).success).toBe(true);
  });

  it("moves slides within the list", () => {
    const slides: Slide[] = [
      { kind: "cover", content: {} },
      { kind: "step", content: { headline: "a" } },
      { kind: "closing", content: {} },
    ];
    expect(moveSlide(slides, 1, -1)).toBe(0);
    expect(slides.map((d) => d.kind)).toEqual(["step", "cover", "closing"]);
    expect(moveSlide(slides, 0, -1)).toBe(0);
    expect(moveSlide(slides, 2, 1)).toBe(2);
  });
});

describe("ideaToRecipe", () => {
  it("fills in the headline, facts, campaign and title", () => {
    const r = ideaToRecipe(
      {
        template: "statement",
        title: "Explain the launch",
        headline: "The launch is coming. *Are you ready?*",
        facts: ["f-1"],
        campaign: null,
      },
      { enabledFormats: ["li-square"], brandVersion: "m" },
    );
    expect(r).toMatchObject({
      template: "statement",
      title: "Explain the launch",
      facts: ["f-1"],
      campaign: null,
      formats: ["li-square"],
      brandVersion: "m",
    });
    expect(r.content.headline).toBe("The launch is coming. *Are you ready?*");
  });
  it("puts the headline on the cover of a carousel and leaves an empty headline the default", () => {
    const r = ideaToRecipe({ template: "carousel", title: "Series", headline: "Four *steps.*" });
    expect(r.slides[0].kind).toBe("cover");
    expect(r.slides[0].content.headline).toBe("Four *steps.*");
    const without = ideaToRecipe({ template: "statement", title: "x", headline: "" });
    expect(without.content.headline).toBe(newRecipe("statement").content.headline);
  });
});

describe("convert", () => {
  const statement = {
    ...newRecipe("statement"),
    title: "My post",
    content: { ...newRecipe("statement").content, ground: "accent", headline: "My *headline.*", text: "My text." },
    caption: { linkedin: "Hello" },
    facts: ["f-1"],
    campaign: "c-1",
    altText: "Alt",
    link: "https://postwright.example/",
  };
  it("takes over fields with the same name; choices only if it is an option there", () => {
    const r = convert(statement, "question");
    expect(r).toMatchObject({
      template: "question",
      title: "My post (Question and answer)",
      facts: ["f-1"],
      campaign: "c-1",
      altText: "Alt",
      link: "https://postwright.example/",
    });
    expect(r.content.headline).toBe("My *headline.*");
    expect(r.content.text).toBe("My text.");
    expect(r.content).not.toHaveProperty("ground");
    expect(
      convert({ ...statement, content: { ...statement.content, ground: "light" } }, "carousel").slides[0].content
        .ground,
    ).toBe("ink");
    expect(convert(statement, "carousel").slides[0].content).toMatchObject({
      ground: "accent",
      headline: "My *headline.*",
      text: "My text.",
    });
  });
  it("takes the cover from a carousel and copies the caption separately from the original", () => {
    const c = { ...newRecipe("carousel"), title: "Series" };
    c.slides[0].content.headline = "Cover *headline.*";
    const r = convert(c, "statement");
    expect(r.content.headline).toBe("Cover *headline.*");
    const s = convert(statement, "question");
    s.caption.linkedin = "Other";
    expect(statement.caption.linkedin).toBe("Hello");
  });
  it("only takes over a valid media id", () => {
    const p = {
      ...newRecipe("product-image"),
      title: "x",
      content: { ...newRecipe("product-image").content, image: "javascript:alert(1)" },
    };
    expect(convert(p, "product-image").content.image).toBe(newRecipe("product-image").content.image);
  });
});
