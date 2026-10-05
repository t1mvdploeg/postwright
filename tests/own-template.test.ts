// The engine for own templates: a checked file becomes a template that `buildImage` draws like a
// built-in one. Escaping is tried on every field, and nothing but `class` and `data-field` can
// end up on an element of the tree.
import { describe, expect, it } from "vitest";
import { TEMPLATES, buildImage, defaultContent, fieldsOf, template } from "../src/web/studio/templates.js";
import { FORMATS } from "../src/web/studio/formats.js";
import { IMAGE_FORMATS, TAGS, compileTemplate } from "../src/web/studio/own-template.js";
import { brandFromDisk } from "./helpers/brand.js";
import { carouselExample, exampleTemplate, saved } from "./helpers/template.js";

const brand = brandFromDisk();
const EVIL = `<img src=x onerror=alert(1)></style><script>alert(1)</script>"'&`;

describe("compileTemplate", () => {
  it("turns the example into a template shaped like a built-in one", () => {
    const t = compileTemplate(saved(exampleTemplate()));
    expect(t).toMatchObject({ id: "own-0123abcd", name: "Statement", kind: "image", own: true });
    expect(t.formats).toEqual(exampleTemplate().formats);
    expect(t.fields.map((f) => f.id)).toEqual([
      "ground",
      "headline",
      "headlineSize",
      "text",
      "footerLeft",
      "footerRight",
    ]);
    expect(defaultContent(t)).toMatchObject({ ground: "accent", headlineSize: "automatic", footerRight: "" });
    const headline = t.fields.find((f) => f.id === "headline")!;
    expect(headline).toMatchObject({ kind: "headline", required: true, emphasis: "exactly-one", max: 90 });
    expect(t.fields.find((f) => f.id === "ground")!.options!.map((o) => o.value)).toEqual(["light", "ink", "accent"]);
  });

  it("gives a proposal a stand-in id, and refuses a bad file with the first problem", () => {
    expect(compileTemplate(exampleTemplate()).id).toBe("own-proposal");
    const bad = { ...exampleTemplate(), css: ".a { background: url(x); }" };
    expect(() => compileTemplate(bad)).toThrow(
      /"Statement" was refused: css rule 1 \(\.a\) \(background\): url\(\) is not allowed/,
    );
  });

  it("compiles a carousel with three slide kinds, step counting on the content kind, and full default content", () => {
    const t = compileTemplate(saved(carouselExample()));
    expect(t).toMatchObject({ kind: "carousel", formats: ["li-carousel"], maxSlides: 20, fields: [] });
    expect(t.slides!.map((s) => [s.kind, s.counts])).toEqual([
      ["cover", false],
      ["content", true],
      ["closing", false],
    ]);
    expect(fieldsOf(t, "content").some((f) => f.id === "text")).toBe(true);
    expect(t.defaultSlides).toHaveLength(4);
    expect(t.defaultSlides![1].content.text).toBe(exampleTemplate().fields[3].defaultValue);
    expect(t.defaultSlides![1].content.headline).toBe("One *step.*");
  });

  it("never takes a built-in id", () => {
    for (const s of TEMPLATES) expect(s.id.startsWith("own-")).toBe(false);
  });
});

describe("buildImage with an own template", () => {
  const own = compileTemplate(saved(exampleTemplate()));

  it("draws every format, at the size of the format, with only data sources", () => {
    expect(own.formats).toEqual(expect.arrayContaining(["li-square", "story", "wide"]));
    for (const f of own.formats) {
      const b = buildImage({ template: own, format: f, brand });
      const format = FORMATS.find((x) => x.key === f)!;
      expect([b.width, b.height]).toEqual([format.width, format.height]);
      expect(b.html).toContain("template-own-0123abcd");
      expect(b.html).toContain('data-field="headline"');
      for (const [, source] of b.html.matchAll(/\ssrc="([^"]*)"/g)) expect(source.startsWith("data:")).toBe(true);
      expect(b.css).not.toMatch(/\d(rem)\b/);
    }
    expect(IMAGE_FORMATS.length).toBeGreaterThan(5);
  });

  it("also works once registered by id, through the template object only", () => {
    expect(template("own-0123abcd")).toBeNull();
    expect(() => buildImage({ template: "own-0123abcd", format: "li-square", brand })).toThrow(/Unknown template/);
    expect(() => buildImage({ template: own, format: "li-carousel", brand })).toThrow(/has no format li-carousel/);
  });

  it("escapes malicious input in every field", () => {
    for (const f of own.fields) {
      const b = buildImage({ template: own, content: { [f.id]: EVIL }, format: "li-square", brand });
      expect(b.html, f.id).not.toContain("<img src=x");
      expect(b.html, f.id).not.toContain("<script");
      expect(b.html, f.id).not.toContain("</style>");
      expect(b.html, f.id).not.toMatch(/<[^>]*\sonerror=/);
    }
  });

  it("puts only class and data-field on the elements of the tree", () => {
    const tree = exampleTemplate().tree;
    const html = buildImage({ template: own, format: "li-square", brand }).html;
    const tags = html.match(new RegExp(`<(${TAGS.join("|")})(\\s[^>]*)?>`, "g"))!.slice(1); // the first is the wrapper
    expect(tags.length).toBeGreaterThan(4);
    for (const tag of tags) {
      const names = [...tag.matchAll(/\s([a-z-]+)=/g)].map((m) => m[1]);
      for (const n of names) expect(["class", "data-field"], tag).toContain(n);
    }
    expect(tree).toBeTruthy();
  });

  it("hides an element whose showIf field is empty, and sizes the headline by length or by choice", () => {
    expect(buildImage({ template: own, content: { text: "" }, format: "li-square", brand }).html).not.toContain(
      'data-field="text"',
    );
    const long = "A very long headline that goes on and on so that it needs a smaller size *indeed.*";
    expect(buildImage({ template: own, content: { headline: long }, format: "li-square", brand }).html).toContain(
      'class="headline small"',
    );
    expect(
      buildImage({ template: own, content: { headline: long, headlineSize: "large" }, format: "li-square", brand })
        .html,
    ).toContain('class="headline"');
  });

  it("takes the ground from the field, and the logo with it", () => {
    const light = buildImage({ template: own, content: { ground: "light" }, format: "li-square", brand }).html;
    const ink = buildImage({ template: own, content: { ground: "ink" }, format: "li-square", brand }).html;
    expect(light).toMatch(/class="image "/);
    expect(ink).toContain('class="image ground-ink"');
    expect(ink).not.toBe(light);
    expect(
      buildImage({ template: own, content: { ground: 'x" onclick="y' }, format: "li-square", brand }).html,
    ).toContain('class="image ground-accent"');
  });

  it("uses the footer field's own text, or the brand's website when it is empty", () => {
    expect(buildImage({ template: own, format: "li-square", brand }).html).toContain(
      `<strong>${brand.url.replace(/^https?:\/\//, "").replace(/\/$/, "")}</strong>`,
    );
    expect(buildImage({ template: own, content: { footerRight: "mine" }, format: "li-square", brand }).html).toContain(
      "<strong>mine</strong>",
    );
  });

  it("is deterministic", () => {
    const a = buildImage({ template: own, content: { headline: "A *b*" }, format: "li-portrait", brand });
    expect(buildImage({ template: own, content: { headline: "A *b*" }, format: "li-portrait", brand })).toEqual(a);
  });
});

describe("choice, image and icon", () => {
  const file = () => {
    const e = exampleTemplate();
    return {
      ...e,
      fields: [
        ...e.fields,
        {
          id: "mood",
          label: "Mood",
          kind: "choice",
          options: [
            { value: "calm", text: "Calm" },
            { value: "loud", text: "Loud" },
          ],
          defaultValue: "calm",
        },
        { id: "photo", label: "Photo", kind: "media", required: true },
      ],
      tree: [
        {
          tag: "div",
          classes: ["wrap"],
          classFrom: "mood",
          children: [
            { slot: "image", field: "photo" },
            { slot: "icon", name: "tick" },
          ],
        },
        ...e.tree,
      ],
    };
  };

  it("adds the chosen option as a class, and falls back to the default for a value that is not an option", () => {
    const t = compileTemplate(file());
    expect(buildImage({ template: t, content: { mood: "loud" }, format: "li-square", brand }).html).toContain(
      'class="wrap loud"',
    );
    expect(buildImage({ template: t, content: { mood: 'x" onclick="y' }, format: "li-square", brand }).html).toContain(
      'class="wrap calm"',
    );
  });

  it("shows a placeholder without an image and the image when the id is known", () => {
    const t = compileTemplate(file());
    expect(buildImage({ template: t, format: "li-square", brand }).html).toContain(
      '<div class="media empty">Choose an image</div>',
    );
    const id = "0123456789abcdef0123456789abcdef.png";
    const html = buildImage({
      template: t,
      content: { photo: id },
      media: { [id]: "data:image/png;base64,AAAA" },
      format: "li-square",
      brand,
    }).html;
    expect(html).toContain('<img class="media" src="data:image/png;base64,AAAA" alt="">');
    expect(
      buildImage({ template: t, content: { photo: "http://evil.example/x.png" }, format: "li-square", brand }).html,
    ).not.toContain("evil.example");
  });

  it("adds the icon symbols only when an icon is used", () => {
    expect(buildImage({ template: compileTemplate(file()), format: "li-square", brand }).html).toContain(
      '<svg class="symbols"',
    );
    expect(buildImage({ template: compileTemplate(exampleTemplate()), format: "li-square", brand }).html).not.toContain(
      "symbols",
    );
  });
});

describe("a carousel", () => {
  const t = compileTemplate(saved(carouselExample()));

  it("renders each slide as a section, with the slide kind's own content", () => {
    t.defaultSlides!.forEach((d, i) => {
      const b = buildImage({ template: t, slides: t.defaultSlides, slide: i, format: "li-carousel", brand });
      expect(b.html).toContain('<section class="image slide');
      expect(b.html).toContain(d.content.headline.replace(/\*(.*)\*/, "<em>$1</em>"));
      expect([b.width, b.height]).toEqual([1080, 1350]);
    });
  });

  it("escapes input on every slide kind", () => {
    for (const kind of ["cover", "content", "closing"]) {
      for (const f of fieldsOf(t, kind)) {
        const b = buildImage({
          template: t,
          slides: [{ kind, content: { [f.id]: EVIL } }],
          slide: 0,
          format: "li-carousel",
          brand,
        });
        expect(b.html, `${kind}.${f.id}`).not.toMatch(/<[^>]*\sonerror=|<script/);
      }
    }
  });

  it("counts steps for the content kind only", () => {
    const c = t as any;
    expect(c.slides.filter((s: any) => s.counts).map((s: any) => s.kind)).toEqual(["content"]);
  });
});
