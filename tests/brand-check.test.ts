// Caption, numbers, contrast and the brand check as a whole.
import { describe, it, expect } from "vitest";
import {
  checkCaption,
  hashtags,
  lengthFor,
  linksWithoutUtm,
  splitAtFold,
  countCharacters,
  addUtm,
  setUtmContent,
} from "../src/web/studio/caption.js";
import { getNumbers, uncoveredNumbers } from "../src/web/studio/numbers.js";
import { contrastRatio, contrastOn } from "../src/web/studio/color.js";
import { containsWord, runCheck, factUsable, textsOf, titleFrom } from "../src/web/studio/brand-check.js";
import { template } from "../src/web/studio/templates.js";
import { factUnusable } from "../src/server/routes.js";
import { DEFAULT_SETTINGS } from "../src/server/schema.js";
import { brandFromDisk } from "./helpers/brand.js";

describe("caption", () => {
  it("counts characters like a reader: an emoji or a letter with an accent is one character", () => {
    expect(countCharacters("café")).toBe(4);
    expect(countCharacters("👍🏽 ok")).toBe(4);
    expect(countCharacters("")).toBe(0);
  });

  it("counts every link as 23 characters on X", () => {
    expect(lengthFor("x", "Read more: https://example.com/?utm_source=x&utm_medium=social")).toBe(
      "Read more: ".length + 23,
    );
    expect(lengthFor("linkedin", "https://a.io")).toBe(12);
  });

  it("gives an error just above the limit and not at it", () => {
    expect(checkCaption("x", "a".repeat(280)).some((b) => b.code === "caption-too-long")).toBe(false);
    expect(checkCaption("x", "a".repeat(281)).some((b) => b.code === "caption-too-long")).toBe(true);
    expect(checkCaption("linkedin", "a".repeat(3001))[0]).toMatchObject({
      level: "error",
      code: "caption-too-long",
    });
    expect(checkCaption("linkedin", "  ")[0]).toMatchObject({ level: "attention", code: "caption-empty" });
  });

  it("finds hashtags, duplicate and truncated ones, and counts them for Instagram", () => {
    const h = hashtags("Read #Planning and #planning, #brandsafe-posts. Not a tag: a#b or &#39;");
    expect(h.list).toEqual(["Planning", "planning", "brandsafe"]);
    expect(h.duplicate).toEqual(["planning"]);
    expect(h.truncated).toEqual(["brandsafe-posts"]);
    const tooMany = Array.from({ length: 31 }, (_, i) => `#tag${i}`).join(" ");
    expect(checkCaption("instagram", tooMany).some((b) => b.code === "too-many-hashtags")).toBe(true);
    expect(checkCaption("linkedin", tooMany).some((b) => b.code === "too-many-hashtags")).toBe(false);
  });

  it("puts UTM on an https link and leaves existing parameters and the anchor alone", () => {
    expect(
      addUtm("https://example.com/?ref=a#demo", {
        source: "linkedin",
        medium: "social",
        campaign: "autumn",
        content: "p-1",
      }),
    ).toBe("https://example.com/?ref=a&utm_source=linkedin&utm_medium=social&utm_campaign=autumn&utm_content=p-1#demo");
    expect(addUtm("https://example.com/?utm_source=old", { source: "x" })).toBe("https://example.com/?utm_source=x");
    expect(addUtm("javascript:alert(1)", { source: "x" })).toBeNull();
    expect(addUtm("http://example.com", { source: "x" })).toBeNull();
    expect(addUtm("not a url", {})).toBeNull();
    expect(linksWithoutUtm("a https://a.io/?utm_source=x b https://b.io/c")).toEqual(["https://b.io/c"]);
  });

  it("splits at the fold", () => {
    const t = "a".repeat(250);
    expect(splitAtFold("linkedin", t).above).toHaveLength(210);
    expect(splitAtFold("linkedin", t).below).toHaveLength(40);
    expect(splitAtFold("x", t).below).toBe("");
  });
});

describe("setUtmContent", () => {
  it("puts utm_content only in links with utm_source and leaves punctuation outside", () => {
    const t =
      "See https://example.com/?utm_source=linkedin. And https://example.org/path, also (https://x.io/?utm_source=x&utm_content=old).";
    expect(setUtmContent(t, "p-1")).toBe(
      "See https://example.com/?utm_source=linkedin&utm_content=p-1. And https://example.org/path, also (https://x.io/?utm_source=x&utm_content=p-1).",
    );
  });
  it("leaves text without links, empty text and broken links alone", () => {
    expect(setUtmContent("no link here", "p-1")).toBe("no link here");
    expect(setUtmContent("", "p-1")).toBe("");
    expect(setUtmContent(undefined, "p-1")).toBe("");
  });
  it("is idempotent", () => {
    const first = setUtmContent("https://a.io/?utm_source=x", "p-1");
    expect(setUtmContent(first, "p-1")).toBe(first);
  });
});

describe("numbers", () => {
  const values = (t: string) => getNumbers(t).map((g) => [g.kind, g.value]);

  it("recognises amounts, percentages and numbers", () => {
    const cases: Array<[string, Array<[string, number]>]> = [
      ["€ 12.50 per hour", [["amount", 12.5]]],
      ["€12.50", [["amount", 12.5]]],
      ["$9.99", [["amount", 9.99]]],
      ["£ 7", [["amount", 7]]],
      ["12.50 euro", [["amount", 12.5]]],
      ["12.50 EUR", [["amount", 12.5]]],
      ["30 dollars", [["amount", 30]]],
      ["1,250 pounds", [["amount", 1250]]],
      ["€ 1,250.75 per month", [["amount", 1250.75]]],
      ["€ 1,250", [["amount", 1250]]],
      ["€ 5", [["amount", 5]]],
      ["8%", [["percent", 8]]],
      ["8.33 %", [["percent", 8.33]]],
      ["8.4 percent", [["percent", 8.4]]],
      ["a working week of 40 hours", [["number", 40]]],
      [
        "27 + 13 days",
        [
          ["number", 27],
          ["number", 13],
        ],
      ],
      ["1,250 employees", [["number", 1250]]],
      ["factor 1.5", [["number", 1.5]]],
    ];
    for (const [text, expected] of cases) expect(values(text), text).toEqual(expected);
  });

  it("does not treat digits in a link (UTM with post id) as a claim", () => {
    expect(
      values(
        "Read more: https://example.com/?utm_source=linkedin&utm_content=p-3fa2c1d0-7731-4821-9a0b-000000000000 and 40 hours",
      ),
    ).toEqual([["number", 40]]);
    expect(values("See http://example.com/2026/10/article-1234")).toEqual([]);
  });

  it("skips loose number words, years and text without digits", () => {
    expect(values("in 4 steps, per 1 July 2026")).toEqual([]);
    expect(values("example.com")).toEqual([]);
    expect(values("Step 3 of 4")).toEqual([]);
    expect(values("eight percent")).toEqual([]);
  });

  it("reports other notations as unclear, so they need a fact too", () => {
    // Comma decimals and dots as thousands separators are not English notation, but they are numbers.
    expect(values("€ 12,50 per hour")).toEqual([["unclear", "12,50"]]);
    expect(values("12,50 euro")).toEqual([["unclear", "12,50"]]);
    expect(values("2,5% more")).toEqual([["unclear", "2,5"]]);
    expect(values("8,33 %")).toEqual([["unclear", "8,33"]]);
    expect(values("10.000 euro")).toEqual([["unclear", "10.000"]]);
    // Thousands that are not groups of three digits.
    expect(values("code 1,23,456")).toEqual([["unclear", "1,23,456"]]);
    // English notation next to it is still read normally.
    expect(values("1,250 users and 12.5% growth, € 12,50 per seat")).toEqual([
      ["unclear", "12,50"],
      ["percent", 12.5],
      ["number", 1250],
    ]);
    // A version number or a date is not a claim.
    expect(values("version 1.2.3")).toEqual([]);
    expect(values("on 01.10.2026")).toEqual([]);
  });

  it("needs a fact for a number in another notation", () => {
    expect(uncoveredNumbers("Only € 12,50 per seat", []).map((g) => g.text)).toEqual(["12,50"]);
    expect(uncoveredNumbers("Only € 12,50 per seat", [{ text: "Seat price € 12.50" }]).map((g) => g.text)).toEqual([
      "12,50",
    ]);
    expect(uncoveredNumbers("Only € 12,50 per seat", [{ text: "Seat price 12,50" }])).toEqual([]);
  });

  it("compares by value, not by notation", () => {
    const facts = [{ text: "Example: subscription € 12.50" }];
    expect(uncoveredNumbers("12.50 per hour", facts)).toEqual([]);
    expect(uncoveredNumbers("€ 12.50 and 8.4%", facts).map((g) => g.value)).toEqual([8.4]);
  });
});

describe("contrast", () => {
  it("calculates the WCAG ratio, in both directions", () => {
    expect(contrastRatio("#000000", "#ffffff")).toBe(21);
    expect(contrastRatio("#ffffff", "#000000")).toBe(21);
    expect(contrastRatio("#777777", "#777777")).toBe(1);
    // White on #767676 is the well-known limit of 4.5:1.
    expect(contrastRatio("#ffffff", "#767676")).toBeGreaterThanOrEqual(4.5);
    expect(contrastRatio("#ffffff", "#777777")).toBeLessThan(4.5);
  });

  it("gets the threshold on every ground of the brand", () => {
    const brand = brandFromDisk();
    for (const ground of Object.keys(brand.grounds)) {
      const c = contrastOn(brand, ground)!;
      expect(c.ratio, ground).toBeGreaterThanOrEqual(c.threshold);
    }
    expect(contrastOn(brand, "unknown")).toBeNull();
  });
});

describe("brand-check", () => {
  const statement = template("statement")!;
  const carousel = template("carousel")!;
  const settings = { channels: ["linkedin"], bannedWords: DEFAULT_SETTINGS.bannedWords };
  const base = {
    template: "statement",
    formats: ["li-square"],
    content: { ground: "accent", headline: "Seen enough. *Your turn has come.*", text: "A post full of appointments." },
    caption: { linkedin: "A post you can explain. https://example.com/?utm_source=linkedin" },
    altText: "Text on accent: Seen enough.",
    facts: [] as string[],
  };
  const codes = (r: ReturnType<typeof runCheck>) => r.findings.filter((b) => b.level !== "ok").map((b) => b.code);

  it("gives a clean statement without errors or attention points", () => {
    const r = runCheck({
      post: base,
      template: statement,
      settings,
      facts: [],
      today: "2026-10-01",
      brand: brandFromDisk(),
    });
    expect(codes(r)).toEqual([]);
    expect(r.errors).toBe(0);
    expect(r.findings.some((b) => b.level === "ok" && b.code === "contrast")).toBe(true);
  });

  it("requires exactly one coloured phrase, and fills in a missing headline with the default", () => {
    expect(
      codes(
        runCheck({
          post: { ...base, content: { ...base.content, headline: "Without emphasis" } },
          template: statement,
          settings,
          facts: [],
          today: "2026-10-01",
        }),
      ),
    ).toContain("emphasis");
    const two = runCheck({
      post: { ...base, content: { ...base.content, headline: "*One* and *two*" } },
      template: statement,
      settings,
      today: "2026-10-01",
    });
    expect(two.findings.find((b) => b.code === "emphasis")!.text).toMatch(/now 2/);
    expect(
      codes(
        runCheck({
          post: { ...base, content: { ...base.content, headline: "  " } },
          template: statement,
          settings,
          today: "2026-10-01",
        }),
      ),
    ).toContain("required");
  });

  it("reports fields that are too long, exclamation marks and banned words, but not in words that happen to contain them", () => {
    const r = runCheck({
      post: {
        ...base,
        content: { ...base.content, text: "You are guaranteed to be ready!".padEnd(170, ".") },
      },
      template: statement,
      settings,
      today: "2026-10-01",
    });
    expect(codes(r)).toEqual(expect.arrayContaining(["too-long", "exclamation", "banned-word"]));
    expect(containsWord("100% certain", "100%")).toBe(true);
    expect(containsWord("the bestseller", "best")).toBe(false);
  });

  it("checks the caption per active channel and the alt text", () => {
    const r = runCheck({
      post: { ...base, caption: {}, altText: "" },
      template: statement,
      settings: { ...settings, channels: ["linkedin", "x"] },
      today: "2026-10-01",
    });
    expect(r.findings.filter((b) => b.code === "caption-empty")).toHaveLength(2);
    expect(codes(r)).toContain("alt-text");
  });

  it("requires every number to be in a linked, active and unexpired fact", () => {
    const fact = {
      id: "f-1",
      text: "Example: subscription € 12.50",
      status: "active",
      validFrom: null,
      validUntil: "2026-12-31",
    };
    const post = {
      ...base,
      content: { ...base.content, text: "A price of € 12.50 per month, 8.4% discount." },
      facts: ["f-1"],
    };
    const r = runCheck({ post, template: statement, settings, facts: [fact], today: "2026-10-01" });
    const numbers = r.findings.filter((b) => b.code === "number-without-fact");
    expect(numbers).toHaveLength(1);
    expect(numbers[0].text).toContain("8.4%");
    const expired = runCheck({ post, template: statement, settings, facts: [fact], today: "2027-01-01" });
    expect(codes(expired)).toContain("fact-unusable");
    expect(codes(runCheck({ post, template: statement, settings, facts: [], today: "2026-10-01" }))).toContain(
      "fact-missing",
    );
    // If the fact bank could not be loaded, the numbers check has not been done.
    // That is an error (the check fails closed), not a silent skip that opens the gate
    // as "0 errors".
    const without = runCheck({ post, template: statement, settings, facts: null, today: "2026-10-01" });
    expect(codes(without)).toContain("facts-unknown");
    expect(without.errors).toBeGreaterThan(0);
  });

  it("uses the same rule for facts as the server", () => {
    const cases = [
      { status: "active", validFrom: null, validUntil: null },
      { status: "active", validFrom: "2027-01-01", validUntil: null },
      { status: "active", validFrom: null, validUntil: "2026-09-30" },
      { status: "draft", validFrom: null, validUntil: null },
      { status: "withdrawn", validFrom: null, validUntil: null },
    ];
    for (const f of cases) {
      expect(factUsable({ id: "f", text: "", ...f }, "2026-10-01"), JSON.stringify(f)).toBe(
        !factUnusable(f as never, "2026-10-01"),
      );
    }
  });

  it("checks the number of slides and the cover of a carousel", () => {
    const slides = carousel.defaultSlides!.map((d) => ({ kind: d.kind, content: { ...d.content } }));
    const post = { ...base, template: "carousel", formats: ["li-carousel"], content: {}, slides };
    expect(codes(runCheck({ post, template: carousel, settings, today: "2026-10-01" }))).not.toContain(
      "too-few-slides",
    );
    expect(codes(runCheck({ post, template: carousel, settings, today: "2026-10-01" }))).not.toContain("no-cover");
    expect(
      codes(
        runCheck({
          post: { ...post, slides: slides.slice(0, 1) },
          template: carousel,
          settings,
          today: "2026-10-01",
        }),
      ),
    ).toContain("too-few-slides");
    expect(
      codes(
        runCheck({
          post: { ...post, slides: slides.slice(1) },
          template: carousel,
          settings,
          today: "2026-10-01",
        }),
      ),
    ).toContain("no-cover");
  });

  it("turns measured overflow into errors with the format attached", () => {
    const r = runCheck({
      post: base,
      template: statement,
      settings,
      today: "2026-10-01",
      overflow: [
        { format: "story", field: "the headline", kind: "safe-zone", reason: "controls at the top" },
        { format: "li-portrait", field: "the text", kind: "outside-image" },
        { format: "li-carousel", slide: 1, field: "item 1", kind: "overlap", with: "item 2" },
      ],
    });
    const snippets = r.findings.filter((b) => b.code === "overflow").map((b) => b.text);
    expect(snippets).toEqual([
      "Story: the headline is in the zone of the controls at the top",
      "LinkedIn portrait: the text runs outside the image",
      "LinkedIn carousel (PDF), slide 2: item 1 overlaps item 2",
    ]);
  });

  it("sorts errors before attention points and those before confirmations", () => {
    const r = runCheck({
      post: { ...base, altText: "", content: { ...base.content, headline: "no emphasis" } },
      template: statement,
      settings,
      today: "2026-10-01",
    });
    const levels = r.findings.map((b) => b.level);
    expect(levels).toEqual(
      [...levels].sort((a, b) => ["error", "attention", "ok"].indexOf(a) - ["error", "attention", "ok"].indexOf(b)),
    );
  });

  it("gives the texts with their place and a title without asterisks", () => {
    const t = textsOf(base, statement);
    expect(t.map((x) => x.where)).toEqual(expect.arrayContaining(["Headline", "Text", "Caption LinkedIn", "Alt-text"]));
    expect(titleFrom(base, statement)).toBe("Seen enough. Your turn has come.");
  });
});
