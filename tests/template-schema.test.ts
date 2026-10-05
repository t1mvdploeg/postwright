// The schema for the model's answer: it can be sent as an output format, an answer that fills
// every key turns into the template file, and `checkTemplate` still has the last word.
import { zodOutputFormat } from "@anthropic-ai/sdk/helpers/zod";
import { describe, expect, it } from "vitest";
import { CarouselAnswerSchema, ImageAnswerSchema, answerSchema, answerToFile } from "../src/server/template-schema.js";
import { checkTemplate } from "../src/web/studio/own-template.js";
import { answerOf, carouselExample, exampleTemplate } from "./helpers/template.js";

describe("the answer schema", () => {
  it("is a valid output format, small enough to send, for both kinds", () => {
    for (const kind of ["image", "carousel"] as const) {
      const format = zodOutputFormat(answerSchema(kind));
      expect(format.type).toBe("json_schema");
      expect(JSON.stringify(format.schema).length).toBeLessThan(60_000);
    }
  });

  it("accepts a full answer and refuses an unknown tag or a missing key", () => {
    expect(ImageAnswerSchema.safeParse(answerOf(exampleTemplate())).success).toBe(true);
    expect(CarouselAnswerSchema.safeParse(answerOf(carouselExample())).success).toBe(true);
    const bad = answerOf(exampleTemplate());
    bad.template.tree[2].tag = "script";
    expect(ImageAnswerSchema.safeParse(bad).success).toBe(false);
    const missing = answerOf(exampleTemplate());
    delete missing.template.fields[1].label;
    expect(ImageAnswerSchema.safeParse(missing).success).toBe(false);
  });

  it("refuses an extra key instead of dropping it quietly", () => {
    const extra = answerOf(exampleTemplate());
    extra.template.tree[2].onclick = "x()";
    expect(ImageAnswerSchema.safeParse(extra).success).toBe(false);
    const top = answerOf(exampleTemplate());
    top.template.slides = [];
    expect(ImageAnswerSchema.safeParse(top).success).toBe(false);
  });

  it("allows a tree six levels deep and not seven", () => {
    const deep = (levels: number): any =>
      levels === 1 ? { tag: "span" } : { tag: "div", children: [deep(levels - 1)] };
    const make = (levels: number) => {
      const a = answerOf(exampleTemplate());
      a.template.tree = [answerOf({ ...exampleTemplate(), tree: [deep(levels)] }).template.tree[0]];
      return a;
    };
    expect(ImageAnswerSchema.safeParse(make(6)).success).toBe(true);
    expect(ImageAnswerSchema.safeParse(make(7)).success).toBe(false);
  });
});

describe("answerToFile", () => {
  it("gives back the template file that the answer was made from, for an image and a carousel", () => {
    const image = exampleTemplate();
    expect(answerToFile(answerOf(image), "image", image.formats)).toEqual(image);
    const carousel = carouselExample();
    expect(answerToFile(answerOf(carousel), "carousel", ["li-carousel"])).toEqual(carousel);
  });

  it("takes kind and formats from the user, not from the model", () => {
    const file: any = answerToFile(answerOf(exampleTemplate()), "image", ["story"]);
    expect(file).toMatchObject({ version: 1, kind: "image", formats: ["story"] });
  });

  it("leaves what is wrong for checkTemplate to refuse: an empty field kind, a ref to nothing", () => {
    const a = answerOf(exampleTemplate());
    a.template.fields[1].kind = "";
    a.template.tree[2].children[0].dataField = "nope";
    const file = answerToFile(a, "image", ["li-square"]);
    const r = checkTemplate(file, { mode: "proposal" });
    expect(r.ok).toBe(false);
    expect(r.ok ? [] : r.problems.join("\n")).toMatch(/kind must be headline, text, line, choice or media/);
  });
});
