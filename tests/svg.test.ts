import { describe, expect, it } from "vitest";
import { recolourSvg, sanitiseSvg } from "../src/server/svg.js";
import { SVG } from "./helpers/brand-files.js";

describe("sanitiseSvg", () => {
  it("accepts a plain SVG as it is", () => {
    expect(sanitiseSvg(SVG)).toEqual({ ok: true, svg: SVG });
  });

  it("strips the XML prolog, a DOCTYPE without declarations and comments", () => {
    const wrapped =
      '﻿<?xml version="1.0" encoding="UTF-8"?>\n<!-- made with a tool -->\n' +
      '<!DOCTYPE svg PUBLIC "-//W3C//DTD SVG 1.1//EN" "http://www.w3.org/Graphics/SVG/1.1/DTD/svg11.dtd">\n' +
      SVG;
    expect(sanitiseSvg(wrapped)).toEqual({ ok: true, svg: SVG });
  });

  it("allows an internal link and an embedded PNG", () => {
    const svg =
      '<svg xmlns="http://www.w3.org/2000/svg"><defs><path id="a" d="M0 0"/></defs><use href="#a"/>' +
      '<image href="data:image/png;base64,AAAA"/><rect fill="url(#g)"/></svg>';
    expect(sanitiseSvg(svg).ok).toBe(true);
  });

  it.each([
    ["a script", '<svg xmlns="http://www.w3.org/2000/svg"><script>alert(1)</script></svg>', /script/],
    ["an event handler", '<svg xmlns="http://www.w3.org/2000/svg" onload="alert(1)"></svg>', /event handler/],
    [
      "a foreignObject",
      '<svg xmlns="http://www.w3.org/2000/svg"><foreignObject><p>x</p></foreignObject></svg>',
      /foreignObject/,
    ],
    [
      "an iframe",
      '<svg xmlns="http://www.w3.org/2000/svg"><iframe src="https://x.example"></iframe></svg>',
      /embedded/,
    ],
    [
      "a javascript link",
      '<svg xmlns="http://www.w3.org/2000/svg"><a href="javascript:alert(1)"><path/></a></svg>',
      /javascript/,
    ],
    [
      "an external image",
      '<svg xmlns="http://www.w3.org/2000/svg"><image href="https://x.example/a.png"/></svg>',
      /outside/,
    ],
    [
      "an external xlink",
      '<svg xmlns="http://www.w3.org/2000/svg" xmlns:xlink="http://www.w3.org/1999/xlink"><use xlink:href="https://x.example/a.svg#b"/></svg>',
      /outside/,
    ],
    [
      "an external url()",
      '<svg xmlns="http://www.w3.org/2000/svg"><rect fill="url(https://x.example/a.svg#b)"/></svg>',
      /outside/,
    ],
    [
      "an @import",
      '<svg xmlns="http://www.w3.org/2000/svg"><style>@import url("https://x.example/a.css");</style></svg>',
      /@import|outside/,
    ],
    [
      "an entity declaration",
      '<!DOCTYPE svg [<!ENTITY x "y">]><svg xmlns="http://www.w3.org/2000/svg"/>',
      /DOCTYPE|declarations/,
    ],
    [
      "a script with a namespace prefix",
      '<svg xmlns="http://www.w3.org/2000/svg" xmlns:s="http://www.w3.org/2000/svg"><s:script>alert(1)</s:script></svg>',
      /script/,
    ],
    [
      "a foreignObject with a namespace prefix",
      '<svg xmlns="http://www.w3.org/2000/svg"><svg:foreignObject><p>x</p></svg:foreignObject></svg>',
      /foreignObject/,
    ],
    [
      "an iframe with a namespace prefix",
      '<svg xmlns="http://www.w3.org/2000/svg"><h:iframe src="x"></h:iframe></svg>',
      /embedded/,
    ],
    [
      "an entity-encoded javascript: link in a set",
      '<svg xmlns="http://www.w3.org/2000/svg"><a><set attributeName="href" to="&#106;avascript:alert(1)"/></a></svg>',
      /character reference/,
    ],
    [
      "an entity-encoded value in an animate",
      '<svg xmlns="http://www.w3.org/2000/svg"><a><animate attributeName="href" values="&#x6a;avascript:alert(1)"/></a></svg>',
      /character reference/,
    ],
    [
      "a CSS-escaped @import",
      '<svg xmlns="http://www.w3.org/2000/svg"><style>@\\69mport "https://x.example/a.css";</style></svg>',
      /escape/,
    ],
    ["an HTML page", "<html><body><script>alert(1)</script></body></html>", /not an SVG/],
    ["plain text", "hello", /not an SVG/],
  ])("rejects %s", (_name, input, reason) => {
    const r = sanitiseSvg(input);
    expect(r.ok).toBe(false);
    expect(r.ok ? "" : r.reason).toMatch(reason);
  });

  it("keeps a character reference in text, which cannot carry a link", () => {
    const svg = '<svg xmlns="http://www.w3.org/2000/svg"><text>&#169; Acme</text></svg>';
    expect(sanitiseSvg(svg).ok).toBe(true);
  });

  it("rejects an SVG larger than 1 MB", () => {
    const big = `<svg xmlns="http://www.w3.org/2000/svg"><!-- ${"x".repeat(1_000_001)} --></svg>`;
    expect(sanitiseSvg(big).ok).toBe(false);
  });
});

describe("recolourSvg", () => {
  const svg =
    '<svg xmlns="http://www.w3.org/2000/svg"><path d="M0 0" fill="#D63E22" stroke="#000"/><rect fill="none"/>' +
    "<style>.a{fill:red;stroke-width:2;background-color:blue}</style>" +
    '<circle style="fill:rgb(1,2,3);opacity:.5"/><linearGradient><stop stop-color="#abcdef"/></linearGradient>' +
    '<g><path d="M1 1"/></g></svg>';

  it("replaces every fill, stroke and stop colour and keeps none", () => {
    const out = recolourSvg(svg, "#FFFFFF");
    expect(out).not.toMatch(/D63E22|#000|red|rgb\(1|abcdef/i);
    expect(out).toContain('fill="#FFFFFF" stroke="#FFFFFF"');
    expect(out).toContain('<rect fill="none"/>');
    expect(out).toContain(".a{fill:#FFFFFF;stroke-width:2;background-color:blue}");
    expect(out).toContain("fill:#FFFFFF;opacity:.5");
    expect(out).toContain('stop-color="#FFFFFF"');
  });

  it("gives the root a fill so that paths without one are recoloured too, and keeps a root fill that is none", () => {
    expect(recolourSvg(svg, "#2B110B")).toMatch(/^<svg xmlns="http:\/\/www.w3.org\/2000\/svg" fill="#2B110B">/);
    const outline = '<svg fill="none" viewBox="0 0 1 1"><path stroke="#123456" d="M0 0"/></svg>';
    expect(recolourSvg(outline, "#FFFFFF")).toBe(
      '<svg fill="none" viewBox="0 0 1 1"><path stroke="#FFFFFF" d="M0 0"/></svg>',
    );
  });
});
