// Marketing studio: the template engine: escaping, emphasis, rem to pixels, and every
// template in every format. The injection tests run over every field of every template
// (and every slide kind), so that a new template that puts raw input in the markup
// somewhere goes red here immediately.
import { describe, it, expect } from "vitest";
import {
  TEMPLATES,
  buildImage,
  escapeHtml,
  withEmphasis,
  emphasiseSelection,
  remToPx,
  template,
  defaultContent,
  countEmphasis,
  fieldsOf,
  withoutEmphasis,
  type Slide,
  type Template,
  type Field,
} from "../src/web/studio/templates.js";
import { FORMATS } from "../src/web/studio/formats.js";
import { brandFromDisk } from "./helpers/brand.js";

const brand = brandFromDisk();
const EVIL = `<img src=x onerror=alert(1)></style><script>alert(1)</script>"'&`;

/** All (template, slide kind | null) pairs, with their fields. */
function allFieldSets(): Array<{ s: Template; slide: string | null; fields: Field[] }> {
  return TEMPLATES.flatMap((s): Array<{ s: Template; slide: string | null; fields: Field[] }> =>
    s.kind === "carousel"
      ? (s.slides ?? []).map((d) => ({ s, slide: d.kind, fields: d.fields }))
      : [{ s, slide: null, fields: s.fields }],
  );
}

function build(s: Template, slide: string | null, content: Record<string, string>, format = s.formats[0]) {
  return slide
    ? buildImage({ template: s.id, slides: [{ kind: slide, content }], slide: 0, format, brand })
    : buildImage({ template: s.id, content, format, brand });
}

describe("helpers", () => {
  it("escapes all five characters", () => {
    expect(escapeHtml(`<a href="x" title='y'>&</a>`)).toBe(
      "&lt;a href=&quot;x&quot; title=&#39;y&#39;&gt;&amp;&lt;/a&gt;",
    );
    expect(escapeHtml(null)).toBe("");
  });

  it("turns *phrase* into emphasis, but leaves loose stars and stars with spaces alone", () => {
    expect(withEmphasis("Behind every post a *clear story.*")).toBe("Behind every post a <em>clear story.</em>");
    expect(withEmphasis("Costs € 5* per month")).toBe("Costs € 5* per month");
    expect(withEmphasis("3 * 4 * 5")).toBe("3 * 4 * 5");
    expect(withEmphasis("*<b>*")).toBe("<em>&lt;b&gt;</em>");
    expect(withEmphasis("Understand first.\nThen calculate.")).toBe("Understand first.<br>Then calculate.");
    expect(countEmphasis("*one* and *two*")).toBe(2);
    expect(countEmphasis("none")).toBe(0);
    expect(countEmphasis("€ 5*")).toBe(0);
    expect(withoutEmphasis("Your turn *has come.*")).toBe("Your turn has come.");
  });

  it("turns a selection into emphasis without eating the spaces around it", () => {
    const t = "Your turn has come.";
    // A double-click on Windows selects a word including the space after it.
    expect(emphasiseSelection(t, 10, 14)).toEqual({ text: "Your turn *has* come.", begin: 10, end: 15 });
    expect(emphasiseSelection(t, 9, 13)!.text).toBe("Your turn *has* come.");
    // An existing emphasis moves: exactly one remains.
    expect(emphasiseSelection("*Your* turn has come.", 12, 15)!.text).toBe("Your turn *has* come.");
    expect(emphasiseSelection(t, 3, 3)).toBeNull();
    expect(emphasiseSelection(t, 9, 10)).toBeNull();
  });

  it("converts rem to pixels at one 108th of the width", () => {
    expect(remToPx("padding: 8rem; margin: -.5rem 1.25rem;", 1080)).toBe("padding: 80px; margin: -5px 12.5px;");
    expect(remToPx("font-size: 10.4rem", 1200)).toBe("font-size: 115.556px");
    expect(remToPx("width: 2em; --x: 3", 1080)).toBe("width: 2em; --x: 3");
  });
});

describe("template-descriptions", () => {
  const formatKeys = new Set(FORMATS.map((f) => f.key));

  it("knows nine general templates", () => {
    expect(TEMPLATES.map((s) => s.id)).toEqual([
      "statement",
      "question",
      "steps",
      "product-image",
      "statistic",
      "carousel",
      "link-preview",
      "profile-banner",
      "company-cover",
    ]);
    expect(TEMPLATES.some((s) => "sample-data" in s)).toBe(false);
  });

  it("names the real number of templates in the default text of the statistic", () => {
    expect(defaultContent(template("statistic")!).number).toBe(String(TEMPLATES.length));
  });

  it("have valid ids, known formats and fields the server accepts", () => {
    expect(new Set(TEMPLATES.map((s) => s.id)).size).toBe(TEMPLATES.length);
    for (const s of TEMPLATES) {
      expect(s.id).toMatch(/^[a-z][a-z0-9-]{1,40}$/);
      expect(s.formats.length, s.id).toBeGreaterThan(0);
      for (const f of s.formats) expect(formatKeys.has(f), `${s.id}: ${f}`).toBe(true);
    }
    for (const { s, slide, fields } of allFieldSets()) {
      expect(new Set(fields.map((v) => v.id)).size, `${s.id}/${slide}`).toBe(fields.length);
      for (const v of fields) {
        expect(v.id, `${s.id}/${slide}`).toMatch(/^[a-zA-Z][a-zA-Z0-9]{0,40}$/);
        expect(["headline", "text", "line", "choice", "media"]).toContain(v.kind);
        expect(v.label, v.id).toBeTruthy();
        if (v.kind === "choice")
          expect(
            v.options!.map((o) => o.value),
            `${s.id}.${v.id}`,
          ).toContain(v.defaultValue);
        if (v.max !== undefined && v.defaultValue)
          expect(v.defaultValue.length, `${s.id}.${v.id}`).toBeLessThanOrEqual(v.max);
        if (v.emphasis === "exactly-one") expect(countEmphasis(v.defaultValue), `${s.id}.${v.id}`).toBe(1);
      }
    }
  });

  it("gives the default content of a template and of a slide kind", () => {
    expect(defaultContent(template("statement")!).ground).toBe("accent");
    expect(defaultContent(template("carousel")!, "cover").ground).toBe("ink");
    expect(fieldsOf(template("carousel")!, "step").some((v) => v.id === "illustration")).toBe(true);
  });
});

describe("question", () => {
  it("is question and answer without a fixed illustration card", () => {
    const { html } = buildImage({ template: "question", content: {}, format: "li-square", brand });
    expect(html).toContain('data-field="headline"');
    expect(html).toContain('data-field="text"');
    expect(html).not.toMatch(/paper|<figure|class="row"|status/);
  });
});

describe("buildImage", () => {
  it("builds every template in every format, with the dimensions of the format and without external sources", () => {
    for (const s of TEMPLATES) {
      for (const f of s.formats) {
        const b = buildImage({ template: s.id, content: {}, format: f, brand });
        const format = FORMATS.find((x) => x.key === f)!;
        expect(b.width, `${s.id}/${f}`).toBe(format.width);
        expect(b.height).toBe(format.height);
        expect(b.html).toContain(`--width:${format.width}px`);
        expect(b.html).toMatch(/class="brand shape-/);
        for (const [, source] of b.html.matchAll(/\ssrc="([^"]*)"/g))
          expect(source.startsWith("data:"), `${s.id}: ${source.slice(0, 40)}`).toBe(true);
        expect(b.html).not.toMatch(/<script|\son\w+=|javascript:/i);
        expect(b.css).not.toMatch(/url\(\s*["']?https?:/);
        expect(b.css).not.toMatch(/\d(rem)\b/);
        expect(b.css).not.toMatch(/100v[wh]/);
      }
    }
  });

  it("is deterministic", () => {
    const a = buildImage({
      template: "statement",
      content: { headline: "A *headline*" },
      format: "li-portrait",
      brand,
    });
    const b = buildImage({
      template: "statement",
      content: { headline: "A *headline*" },
      format: "li-portrait",
      brand,
    });
    expect(a).toEqual(b);
  });

  it("escapes malicious input in every field of every template and every slide kind", () => {
    for (const { s, slide, fields } of allFieldSets()) {
      for (const v of fields) {
        const b = build(s, slide, { [v.id]: EVIL });
        const position = `${s.id}${slide ? `/${slide}` : ""}.${v.id}`;
        expect(b.html, position).not.toContain("<img src=x");
        expect(b.html, position).not.toContain("<script");
        expect(b.html, position).not.toContain("</style>");
        // Only as an attribute of a real tag is it dangerous; as escaped text (&lt;img … onerror=)
        // it is not.
        expect(b.html, position).not.toMatch(/<[^>]*\sonerror=/);
      }
    }
  });

  it("lets a choice field only be one of its options", () => {
    const b = buildImage({
      template: "statement",
      content: { ground: 'x" onclick="evil' },
      format: "li-square",
      brand,
    });
    expect(b.html).toContain('class="image ground-accent"');
    expect(b.html).not.toContain("onclick");
  });

  it("puts the logo that belongs to the ground", () => {
    const light = buildImage({ template: "statement", content: { ground: "light" }, format: "li-square", brand });
    const ink = buildImage({ template: "statement", content: { ground: "ink" }, format: "li-square", brand });
    expect(light.html).toContain(brand.logos.default);
    expect(ink.html).toContain(brand.logos["on-ink"]);
    expect(ink.html).toContain("ground-ink");
  });

  it("puts no fixed amounts or sample label in the image in any template", () => {
    for (const s of TEMPLATES) {
      for (const f of s.formats) {
        const { html } = buildImage({ template: s.id, content: {}, format: f, brand });
        expect(html, `${s.id}/${f}`).not.toContain("€");
        expect(html, `${s.id}/${f}`).not.toMatch(/>\s*sample/i);
      }
    }
    for (const slide of template("carousel")!.defaultSlides!.keys()) {
      const { html } = buildImage({ template: "carousel", slides: [], slide, format: "li-carousel", brand });
      expect(html, `slide ${slide + 1}`).not.toContain("€");
    }
  });

  it("chooses the headline size automatically by length, and leaves an explicit choice alone", () => {
    const short = buildImage({
      template: "statement",
      content: { headline: "Short and *powerful.*" },
      format: "li-square",
      brand,
    });
    const lang = buildImage({
      template: "statement",
      content: { headline: "From first idea to *well-prepared post.*" },
      format: "li-square",
      brand,
    });
    const chosen = buildImage({
      template: "statement",
      content: { headline: "Short and *powerful.*", headlineSize: "small" },
      format: "li-square",
      brand,
    });
    expect(short.html).toContain('class="headline"');
    expect(lang.html).toContain('class="headline medium"');
    expect(chosen.html).toContain('class="headline small"');
  });

  it("shows a media field only as a data URI that the studio supplies itself, never as a free URL", () => {
    const id = `${"a".repeat(32)}.png`;
    const withValue = buildImage({
      template: "product-image",
      content: { image: id },
      format: "li-square",
      brand,
      media: { [id]: "data:image/png;base64,AAAA" },
    });
    expect(withValue.html).toContain('src="data:image/png;base64,AAAA"');
    const free = buildImage({
      template: "product-image",
      content: { image: "https://evil.io/x.png" },
      format: "li-square",
      brand,
    });
    expect(free.html).not.toContain("evil.io");
    expect(free.html).toContain("Choose a screenshot");
  });

  it("refuses an unknown template and a format the template does not know", () => {
    expect(() => buildImage({ template: "poster", format: "li-square", brand })).toThrow(/Unknown template/);
    expect(() => buildImage({ template: "link-preview", format: "story", brand })).toThrow(/has no format/);
  });
});

describe("carousel", () => {
  const s = template("carousel")!;

  it("knows only the illustrations checklist and none", () => {
    const choice = fieldsOf(s, "step").find((v) => v.id === "illustration")!;
    expect(choice.options!.map((o) => o.value)).toEqual(["checklist", "none"]);
  });

  it("renders the six default slides, with a step chain on the four steps", () => {
    expect(s.defaultSlides).toHaveLength(6);
    for (let i = 0; i < 6; i++) {
      const b = buildImage({ template: "carousel", slides: [], slide: i, format: "li-carousel", brand });
      expect(b.width).toBe(1080);
      const step = s.defaultSlides![i].kind === "step";
      expect(b.html.includes('class="step-chain"'), `slide ${i + 1}`).toBe(step);
      if (step) expect(b.html).toContain(`aria-label="Step ${i} of 4"`);
    }
  });

  it("counts only step slides in the chain, even with a cover and closing between them", () => {
    const slides: Slide[] = [
      { kind: "cover", content: {} },
      { kind: "step", content: { illustration: "none" } },
      { kind: "step", content: { illustration: "checklist" } },
      { kind: "slot", content: {} },
    ];
    const second = buildImage({ template: "carousel", slides, slide: 2, format: "li-carousel", brand });
    expect(second.html).toContain('aria-label="Step 2 of 2"');
    expect(second.html).toContain('class="paper checklist"');
    const first = buildImage({ template: "carousel", slides, slide: 1, format: "li-carousel", brand });
    expect(first.html).toContain('class="space"');
  });

  it("refuses an unknown slide kind", () => {
    expect(() =>
      buildImage({ template: "carousel", slides: [{ kind: "poster", content: {} }], format: "li-carousel", brand }),
    ).toThrow(/slide kind/);
  });
});
