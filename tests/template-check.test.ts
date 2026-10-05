// `checkTemplate`: the judge of every own template. It refuses and never repairs, and each
// message names the place and the problem. The attacks are the ones a model (or a file on
// disk) could bring: markup, script, remote loads, colours outside the brand.
import { describe, expect, it } from "vitest";
import {
  ALLOWED_VARIABLES,
  BRAND_VARIABLES,
  CSS_FUNCTIONS,
  IMAGE_FORMATS,
  TAGS,
  checkTemplate,
} from "../src/web/studio/own-template.js";
import { CSS_VARIABLES } from "../src/server/brand-proposal.js";
import { FORMAT_KEYS } from "../src/server/schema.js";
import { carouselExample, exampleTemplate, saved } from "./helpers/template.js";

function problems(raw: unknown, mode: "proposal" | "saved" | "either" = "proposal"): string[] {
  const r = checkTemplate(raw, { mode });
  return r.ok ? [] : r.problems;
}
const withCss = (css: string) => ({ ...exampleTemplate(), css });
const withTree = (tree: unknown) => ({ ...exampleTemplate(), tree });
const withFields = (fields: unknown) => ({ ...exampleTemplate(), fields });

describe("the example", () => {
  it("is a valid proposal and a valid saved template, and an image and a carousel both pass", () => {
    expect(problems(exampleTemplate())).toEqual([]);
    expect(problems(saved(exampleTemplate()), "saved")).toEqual([]);
    expect(problems(carouselExample())).toEqual([]);
  });

  it("lists its brand variables like the brand kit does, and knows only formats the studio has", () => {
    expect([...BRAND_VARIABLES]).toEqual([...CSS_VARIABLES]);
    expect(ALLOWED_VARIABLES).toHaveLength(BRAND_VARIABLES.length + 11);
    for (const f of IMAGE_FORMATS) expect(FORMAT_KEYS).toContain(f);
    expect(IMAGE_FORMATS).not.toContain("li-carousel");
    expect(IMAGE_FORMATS).not.toContain("li-profile");
    expect(IMAGE_FORMATS).not.toContain("li-company");
  });
});

describe("css that is refused outright", () => {
  const cases: Array<[string, string, RegExp]> = [
    ["url(", ".a { background: url(x); }", /rule 1 \(\.a\).*url\(\) is not allowed/],
    ["URL(", ".a { background: URL(x); }", /URL\(\) is not allowed/],
    ["url (", ".a { background: url (x); }", /url\(\) is not allowed/],
    ["a url with an escape", ".a { background: u\\72l(x); }", /backslashes/],
    ["image-set(", ".a { background: image-set(x 1x); }", /image-set\(\) is not allowed/],
    ["src(", ".a { background: src(x); }", /src\(\) is not allowed/],
    ["attr(", ".a { width: attr(x); }", /attr\(\) is not allowed/],
    ["expression(", ".a { width: expression(alert(1)); }", /expression\(\) is not allowed/],
    ["@import", "@import 'x.css';", /"@"/],
    ["@font-face", "@font-face { font-family: x; }", /"@"/],
    ["@media", "@media print { .a { color: var(--ink); } }", /"@"/],
    ["a comment", ".a { } /* x */", /comments/],
    ["a closing style tag", ".a { } </style><script>", /"<"/],
    ["an id selector", "#a { margin: 0; }", /"#"/],
    ["an attribute selector", '.a[href^="x"] { margin: 0; }', /"\["/],
    ["a control character", ".a { margin: 0;\u0001 }", /plain ASCII/],
    ["a hex colour", ".a { color: #fff; }", /"#"/],
    ["rgb()", ".a { color: rgb(0 0 0); }", /rgb\(\) is not allowed/],
    ["hsl()", ".a { color: hsl(10 10% 10%); }", /hsl\(\) is not allowed/],
    ["oklch()", ".a { color: oklch(0.5 0.1 10); }", /oklch\(\) is not allowed/],
    ["color()", ".a { color: color(srgb 1 0 0); }", /color\(\) is not allowed/],
    ["a named colour", ".a { color: red; }", /colour "red" is not allowed/],
    ["a system colour", ".a { color: Canvas; }", /colour "Canvas" is not allowed/],
    ["a named colour in a fallback", ".a { color: var(--ink, red); }", /colour "red"/],
    ["a colour space other than srgb", ".a { color: color-mix(in oklch, var(--ink), transparent); }", /in srgb/],
    ["a variable that is not the brand's", ".a { color: var(--brand-pink); }", /--brand-pink is not a brand variable/],
    ["a variable outside var()", ".a { color: --ink; }", /only be used inside var\(\)/],
    ["font-family", ".a { font-family: Arial; }", /font-family is not allowed/],
    ["font", ".a { font: 12px Arial; }", /font is not allowed/],
    ["animation", ".a { animation: spin 1s; }", /animation is not allowed/],
    ["animation-name", ".a { animation-name: spin; }", /animation-name is not allowed/],
    ["transition", ".a { transition: all 1s; }", /transition is not allowed/],
    ["quotes", '.a::before { content: "x"; }', /content may only be/],
    ["a quote in a value", ".a { margin: 'x'; }", /quotes/],
    ["!important", ".a { margin: 0 !important; }", /"!"/],
    ["a non-ASCII character", ".a { margin: 0\u2028; }", /plain ASCII/],
    ["a tag that is not allowed", "table { margin: 0; }", /tag "table"/],
    ["a pseudo class that is not allowed", ".a:hover { margin: 0; }", /":hover"/],
    ["a nested rule", ".a { .b { margin: 0; } }", /nested rules/],
    ["a missing brace", ".a { margin: 0;", /not closed/],
    ["text after the last rule", ".a { margin: 0; } .b", /text after the last rule/],
    ["a custom property", ".a { --x: 1; }", /"--x: 1" is not a declaration|not allowed/],
    ["a leading combinator", "> .a { margin: 0; }", /combinator/],
  ];
  it.each(cases)("%s", (_name, css, expected) => {
    const found = problems(withCss(css));
    expect(found.length).toBeGreaterThan(0);
    expect(found.join("\n")).toMatch(expected);
  });

  it("names the rule and the property", () => {
    expect(problems(withCss(".a { margin: 0; }\n.hero { background: url(x); }"))).toEqual([
      "css rule 2 (.hero) (background): url() is not allowed",
    ]);
  });

  it("refuses too long a stylesheet and too many rules", () => {
    expect(problems(withCss(`.a { margin: ${"0 ".repeat(3001)}; }`))).toEqual(["css: longer than 6000 characters"]);
    expect(problems(withCss(".a { margin: 0; }\n".repeat(81)))).toEqual(["css: more than 80 rules"]);
  });
});

describe("css that is allowed", () => {
  it("accepts layout, brand variables, calc, gradients, transforms and a shadow made with color-mix", () => {
    const css = [
      ".card { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 2rem; padding: 4rem 6rem; }",
      ".card > .a + .b ~ .c, li:nth-child(2n+1):not(.x), h2:first-child::after { margin: -2rem auto; width: calc(100% - 2rem); }",
      ".badge { background: var(--accent-soft); color: var(--ink); border: .2rem solid var(--hairline); border-radius: 1rem; }",
      ".paper { box-shadow: 0 2rem 4rem color-mix(in srgb, var(--ink) 25%, transparent); transform: translateX(-2rem) rotate(-2deg) scale(1.1); }",
      ".bar { background: linear-gradient(to right, var(--accent), transparent); height: clamp(2rem, 4vw, 6rem); }",
      '.dot::before { content: ""; width: 1.4rem; height: 1.4rem; background: currentcolor; }',
      ".tall { height: var(--height); max-width: 48ch; aspect-ratio: 16 / 9; -webkit-line-clamp: 3; }",
    ].join("\n");
    expect(problems(withCss(css))).toEqual([]);
  });
});

describe("the tree", () => {
  const section = (extra: object) => withTree([{ tag: "div", ...extra }]);

  it.each<[string, unknown, RegExp]>([
    ["script", withTree([{ tag: "script", children: [] }]), /tree\[0\]\.tag: "script" is not an allowed tag/],
    ["iframe", withTree([{ tag: "iframe" }]), /"iframe" is not an allowed tag/],
    ["a link", withTree([{ tag: "a" }]), /"a" is not an allowed tag/],
    ["an onclick key", section({ onclick: "x()" }), /unknown key "onclick"/],
    ["a style key", section({ style: "color: red" }), /unknown key "style"/],
    ["an href key", section({ href: "x" }), /unknown key "href"/],
    ["a class with a space", section({ classes: ["a b"] }), /classes\[0\]/],
    ["a class with a quote", section({ classes: ['a"x'] }), /classes\[0\]/],
    ["seven classes", section({ classes: ["a", "b", "c", "d", "e", "f", "g"] }), /at most 6/],
    ["a classFrom that is not a field", section({ classFrom: "nope" }), /classFrom: "nope" is not a field/],
    ["a classFrom on a text field", section({ classFrom: "text" }), /classFrom: "text" is not a choice field/],
    ["a headlineOf on a text field", section({ headlineOf: "text" }), /headlineOf: "text" is not the headline field/],
    ["a dataField on a choice", section({ dataField: "ground" }), /dataField: "ground" is not a text or image field/],
    ["a showIf that is missing", section({ showIf: "gone" }), /showIf: "gone" is not a field/],
    [
      "rich on a line",
      withTree([{ field: "footerLeft", as: "rich" }]),
      /field: "footerLeft" is not a headline or text field/,
    ],
    ["footer on a text", withTree([{ field: "text", as: "footer" }]), /field: "text" is not a line field/],
    ["an unknown as", withTree([{ field: "text", as: "html" }]), /as: must be rich, plain or footer/],
    [
      "an image slot on a text field",
      withTree([{ slot: "image", field: "text" }]),
      /field: "text" is not an image field/,
    ],
    ["an unknown slot", withTree([{ slot: "script" }]), /slot: must be logo, route, image or icon/],
    ["an unknown icon", withTree([{ slot: "icon", name: "skull" }]), /name: must be arrow or tick/],
    [
      "a literal that is too long",
      withTree([{ literal: "x".repeat(81) }]),
      /literal: must be text of 1 to 80 characters/,
    ],
    ["a node that is nothing", withTree([{ foo: 1 }]), /not a valid node/],
    ["an empty tree", withTree([]), /tree: must be a list with at least one node/],
    ["a block inside a paragraph", withTree([{ tag: "p", children: [{ tag: "div" }] }]), /<div> cannot sit inside <p>/],
    [
      "a logo inside a heading",
      withTree([{ tag: "h1", children: [{ slot: "logo" }] }]),
      /logo slot cannot sit inside <h1>/,
    ],
    ["a list item outside a list", withTree([{ tag: "li" }]), /<li> must sit directly inside a <ul>/],
    ["a div inside a list", withTree([{ tag: "ul", children: [{ tag: "div" }] }]), /<ul> may only hold <li>/],
  ])("refuses %s", (_name, raw, expected) => {
    expect(problems(raw).join("\n")).toMatch(expected);
  });

  it("refuses a tree nested deeper than six levels and one with more than 60 nodes", () => {
    let node: any = { tag: "span" };
    for (let i = 0; i < 6; i++) node = { tag: "div", children: [node] };
    expect(problems(withTree([node])).join("\n")).toMatch(/nested deeper than 6 levels/);
    const many = Array.from({ length: 61 }, () => ({ tag: "div" }));
    expect(problems(withTree(many)).join("\n")).toMatch(/more than 60 nodes/);
  });

  it("accepts a list, an icon in a span, and six levels", () => {
    const tree = [
      {
        tag: "ul",
        children: [
          { tag: "li", children: [{ tag: "span", children: [{ slot: "icon", name: "tick" }, { literal: "x" }] }] },
        ],
      },
      {
        tag: "div",
        children: [
          {
            tag: "div",
            children: [
              { tag: "div", children: [{ tag: "div", children: [{ tag: "div", children: [{ tag: "span" }] }] }] },
            ],
          },
        ],
      },
    ];
    expect(problems(withTree(tree))).toEqual([]);
  });
});

describe("the fields", () => {
  const field = (extra: object) => ({
    id: "extra",
    label: "Extra",
    kind: "line",
    max: 40,
    defaultValue: "x",
    ...extra,
  });
  const plus = (f: object) => withFields([...exampleTemplate().fields, f]);

  it.each<[string, unknown, RegExp]>([
    ["a duplicate id", plus(field({ id: "text" })), /"text" is defined twice/],
    ["a reserved id", plus(field({ id: "ground" })), /reserved for the ground preset/],
    ["an id with a dash", plus(field({ id: "a-b" })), /camelCase/],
    ["an unknown key", plus(field({ onclick: "x" })), /unknown key "onclick"/],
    ["an unknown kind", plus(field({ kind: "html" })), /kind must be/],
    [
      "a headline with another id",
      plus(field({ id: "title", kind: "headline", max: 50, defaultValue: "A *b*" })),
      /id "headline"/,
    ],
    [
      "a default over the max",
      plus(field({ max: 5, defaultValue: "toolong" })),
      /defaultValue: must be text of at most 5/,
    ],
    [
      "a headline without emphasis",
      withFields([{ id: "headline", label: "H", kind: "headline", max: 50, defaultValue: "No emphasis" }]),
      /exactly one \*emphasised\* phrase/,
    ],
    [
      "a headline with two emphases",
      withFields([{ id: "headline", label: "H", kind: "headline", max: 50, defaultValue: "*A* and *b*" }]),
      /exactly one/,
    ],
    [
      "a choice value that is not a class name",
      plus(
        field({
          id: "mood",
          kind: "choice",
          options: [
            { value: "a b", text: "A" },
            { value: "b", text: "B" },
          ],
          defaultValue: "b",
          max: undefined,
        }),
      ),
      /options\[0\]\.value/,
    ],
    [
      "a choice default outside its options",
      plus(
        field({
          id: "mood",
          kind: "choice",
          options: [
            { value: "a", text: "A" },
            { value: "b", text: "B" },
          ],
          defaultValue: "c",
          max: undefined,
        }),
      ),
      /defaultValue: must be one of the options/,
    ],
    [
      "thirteen fields",
      withFields(Array.from({ length: 13 }, (_, i) => field({ id: `f${i}` }))),
      /more than 12 fields/,
    ],
    ["an unknown preset", plus({ preset: "font" }), /preset must be/],
    [
      "a preset default outside its options",
      withFields([{ preset: "ground", defaultValue: "pink" }]),
      /defaultValue must be one of/,
    ],
  ])("refuses %s", (_name, raw, expected) => {
    expect(problems(raw).join("\n")).toMatch(expected);
  });
});

describe("the file", () => {
  it("refuses unknown keys, a wrong version, and the wrong kind of formats", () => {
    expect(problems({ ...exampleTemplate(), onload: "x" })).toEqual(['template: unknown key "onload"']);
    expect(problems({ ...exampleTemplate(), version: 2 })).toEqual(["version: must be 1"]);
    expect(problems({ ...exampleTemplate(), formats: ["li-carousel"] }).join()).toMatch(/formats\[0\]/);
    expect(problems({ ...exampleTemplate(), formats: ["li-profile"] }).join()).toMatch(/formats\[0\]/);
    expect(problems({ ...exampleTemplate(), formats: [] }).join()).toMatch(/at least one format/);
    expect(problems({ ...carouselExample(), formats: ["li-square"] }).join()).toMatch(/exactly \["li-carousel"\]/);
  });

  it("refuses text that is too long or empty", () => {
    expect(problems({ ...exampleTemplate(), name: "x".repeat(41) }).join()).toMatch(/name: must be text of 1 to 40/);
    expect(problems({ ...exampleTemplate(), name: "  " }).join()).toMatch(/name/);
    expect(problems({ ...exampleTemplate(), goal: "x".repeat(141) }).join()).toMatch(/goal/);
  });

  it("makes ids the server's business: a proposal must not carry one, a saved file must", () => {
    expect(problems(saved(exampleTemplate()))[0]).toMatch(/must not have them/);
    expect(problems(exampleTemplate(), "saved")[0]).toMatch(/both are needed/);
    expect(problems(saved(exampleTemplate(), "p-123"), "saved").join()).toMatch(/id: must be own- and 8 hex/);
    expect(problems(saved(exampleTemplate(), "own-0123ABCD"), "saved").join()).toMatch(/id: must be own-/);
    expect(problems({ ...exampleTemplate(), id: "own-0123abcd" }, "either").join()).toMatch(/both are needed/);
  });

  it("refuses a file over 60 kB and values that are not objects", () => {
    expect(problems({ ...exampleTemplate(), goal: "x".repeat(70_000) })).toEqual([
      "template: the file is larger than 60 kB",
    ]);
    for (const raw of [null, undefined, 5, "x", [], [exampleTemplate()]])
      expect(problems(raw)).toEqual(["template: must be an object"]);
  });

  it("lists at most 30 problems", () => {
    const tree = Array.from({ length: 50 }, () => ({ tag: "script" }));
    const found = problems(withTree(tree));
    expect(found).toHaveLength(31);
    expect(found[30]).toMatch(/^…and \d+ more$/);
  });

  it("does not mutate what it checks and never throws on odd input", () => {
    const t = exampleTemplate();
    const before = JSON.stringify(t);
    checkTemplate(t);
    expect(JSON.stringify(t)).toBe(before);
    const odd: any = exampleTemplate();
    odd.tree = [null, 5, "x", [], { tag: null }, { slot: 3 }, { field: {}, as: [] }];
    odd.fields = [null, 5, "x", { preset: {} }, { kind: {} }];
    expect(() => checkTemplate(odd)).not.toThrow();
    const circular: any = {};
    circular.self = circular;
    expect(problems(circular)).toEqual(["template: cannot be read as JSON"]);
  });
});

describe("the carousel", () => {
  it("needs the three slide kinds in order and three to eight default slides", () => {
    const c = carouselExample();
    expect(problems({ ...c, slides: c.slides.slice(0, 2) }).join()).toMatch(/exactly three slide kinds/);
    expect(problems({ ...c, slides: [c.slides[1], c.slides[0], c.slides[2]] }).join()).toMatch(/in this order/);
    expect(problems({ ...c, defaultSlides: c.defaultSlides.slice(0, 2) }).join()).toMatch(/3 to 8 slides/);
    expect(
      problems({ ...c, defaultSlides: [...c.defaultSlides, ...c.defaultSlides, ...c.defaultSlides] }).join(),
    ).toMatch(/3 to 8 slides/);
    expect(problems({ ...c, defaultSlides: [c.defaultSlides[1], ...c.defaultSlides] }).join()).toMatch(
      /first slide must be a cover/,
    );
  });

  it("refuses default content that does not fit the fields of its slide kind", () => {
    const c = carouselExample();
    c.defaultSlides[1].content = { nope: "x", ground: "pink", headline: "No emphasis" };
    const found = problems(c).join("\n");
    expect(found).toMatch(/defaultSlides\[1\]\.content\.nope/);
    expect(found).toMatch(/content\.ground: must be one of/);
    expect(found).toMatch(/content\.headline: a headline needs exactly one/);
  });

  it("refuses top-level fields and tree, and an image template with slides", () => {
    expect(problems({ ...carouselExample(), tree: [] }).join()).toMatch(/tree: a carousel has them per slide kind/);
    expect(problems({ ...exampleTemplate(), slides: [] }).join()).toMatch(/slides: only a carousel has them/);
  });

  it("names the slide kind in the place of a problem", () => {
    const c = carouselExample();
    c.slides[1].tree = [{ tag: "script" }];
    expect(problems(c)).toEqual(['slides.content.tree[0].tag: "script" is not an allowed tag']);
  });
});

describe("the lists of allowed things", () => {
  it("only knows tags and functions that the rules above rely on", () => {
    expect(TAGS).toHaveLength(14);
    expect(CSS_FUNCTIONS).toContain("color-mix");
    expect(CSS_FUNCTIONS).not.toContain("url");
  });
});
