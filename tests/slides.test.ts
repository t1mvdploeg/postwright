// The slides of a post: one list of images for every kind of post, the format rules and the
// export plan.
import { describe, it, expect } from "vitest";
import {
  MAX_SLIDES,
  changeSlideTemplate,
  fromPages,
  imageTasks,
  imagesOf,
  mediaIdsOf,
  narrowFormats,
  pagesOf,
  pdfFormat,
  sharedFormats,
  slideNumber,
  slideTemplates,
} from "../src/web/studio/slides.js";
import { newRecipe } from "../src/web/studio/recipe.js";

const MEDIA = "0123456789abcdef0123456789abcdef.png";
const three = () => ({
  kind: "image" as const,
  template: "statement",
  content: { headline: "One *two*" },
  slides: [],
  moreSlides: [
    { template: "statistic", content: { headline: "Three *four*" } },
    { template: "question", content: { headline: "Five *six*" } },
  ],
  formats: ["li-square", "ig-square"],
});

describe("pagesOf and fromPages", () => {
  it("treats a post saved before moreSlides existed as one slide", () => {
    const old = { template: "statement", content: { headline: "x" } };
    expect(pagesOf(old)).toEqual([{ template: "statement", content: { headline: "x" } }]);
    expect(imagesOf(old)).toEqual([{ template: "statement", content: { headline: "x" }, slide: 0 }]);
    expect(mediaIdsOf(old)).toEqual([]);
  });

  it("round-trips, and a slide moved to the front becomes the post's template", () => {
    const pages = pagesOf(three());
    expect(pages.map((p) => p.template)).toEqual(["statement", "statistic", "question"]);
    const [a, b, c] = pages;
    expect(fromPages([b, a, c])).toEqual({
      template: "statistic",
      content: { headline: "Three *four*" },
      moreSlides: [a, c],
    });
  });
});

describe("imagesOf", () => {
  it("gives one image per slide of an image post, each with its own template", () => {
    expect(imagesOf(three()).map((i) => [i.template, i.slide])).toEqual([
      ["statement", 0],
      ["statistic", 1],
      ["question", 2],
    ]);
  });

  it("gives a carousel one image per carousel slide, all on the carousel template", () => {
    const r = newRecipe("carousel");
    const images = imagesOf(r);
    expect(images).toHaveLength(r.slides.length);
    expect(images[2]).toMatchObject({ template: "carousel", slides: r.slides, slide: 2 });
  });
});

describe("formats", () => {
  it("shares only what every slide's template has, in the first template's order", () => {
    expect(sharedFormats(["statement", "statistic", "question"])).toEqual([
      "li-square",
      "li-portrait",
      "ig-square",
      "ig-portrait",
    ]);
    expect(sharedFormats(["statement", "own-deadbeef"])).toEqual(sharedFormats(["statement"]));
    expect(sharedFormats([])).toEqual([]);
  });

  it("offers image templates that share at least one format, never a carousel", () => {
    const ids = slideTemplates(["li-square", "story"]).map((s) => s.id);
    expect(ids).toContain("question");
    expect(ids).toContain("statement");
    expect(ids).not.toContain("carousel");
    expect(ids).not.toContain("link-preview");
  });

  it("narrows the formats when a template lacks one, and says what was dropped", () => {
    expect(narrowFormats(["li-square", "li-portrait", "story"], "question")).toEqual({
      formats: ["li-square", "li-portrait"],
      dropped: ["story"],
    });
    expect(narrowFormats(["li-square"], "statement")).toEqual({ formats: ["li-square"], dropped: [] });
  });
});

describe("changeSlideTemplate", () => {
  it("takes over the values that fit and fills the rest with defaults", () => {
    const page = changeSlideTemplate(
      { template: "statement", content: { headline: "Keep *me*", nonsense: "x" } },
      "question",
    );
    expect(page.template).toBe("question");
    expect(page.content.headline).toBe("Keep *me*");
    expect(page.content).not.toHaveProperty("nonsense");
  });

  it("throws on an unknown template", () => {
    expect(() => changeSlideTemplate({ template: "statement", content: {} }, "own-deadbeef")).toThrow(
      /Unknown template/,
    );
  });
});

describe("export plan", () => {
  it("numbers the files only when there is more than one image, and per format all slides", () => {
    const tasks = imageTasks(three());
    expect(tasks.map((t) => [t.format, t.slide])).toEqual([
      ["li-square", 1],
      ["li-square", 2],
      ["li-square", 3],
      ["ig-square", 1],
      ["ig-square", 2],
      ["ig-square", 3],
    ]);
    const one = { ...three(), moreSlides: [] };
    expect(imageTasks(one).map((t) => t.slide)).toEqual([null, null]);
    expect(slideNumber(one, 0)).toBeNull();
    expect(slideNumber(newRecipe("carousel"), 0)).toBe(1);
  });

  it("makes a PDF for a carousel, and for a multi-slide post only with a LinkedIn feed format", () => {
    expect(pdfFormat(newRecipe("carousel"))).toBe("li-carousel");
    expect(pdfFormat(three())).toBe("li-square");
    expect(pdfFormat({ ...three(), formats: ["ig-square"] })).toBeNull();
    expect(pdfFormat({ ...three(), moreSlides: [] })).toBeNull();
  });

  it("finds media ids in slide 1, carousel slides and extra slides", () => {
    const post = { ...three(), moreSlides: [{ template: "product-image", content: { image: MEDIA } }] };
    expect(mediaIdsOf(post)).toEqual([MEDIA]);
  });

  it("allows twenty slides", () => {
    expect(MAX_SLIDES).toBe(20);
  });
});
