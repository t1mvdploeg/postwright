// SVG logos: made safe before they are stored, and recoloured for the logo variants. An SVG
// that is opened directly counts as a page, so one with a script, a foreignObject or a link to
// something outside the file is refused. There is no rewriting beyond stripping what is
// harmless but noisy (an XML prolog, a DOCTYPE without declarations, comments).

export type SvgResult = { ok: true; svg: string } | { ok: false; reason: string };

const MAX_SVG_BYTES = 1_000_000;
const fail = (reason: string): SvgResult => ({ ok: false, reason });
const INSIDE = /^(#|data:image\/(png|jpeg|webp|gif);base64,)/i;

const DANGEROUS: [RegExp, string][] = [
  // The element name may carry a namespace prefix (`<s:script>`).
  [/<([\w.-]+:)?script\b/i, "it contains a script"],
  [/<([\w.-]+:)?foreignObject\b/i, "it contains a foreignObject"],
  [/<([\w.-]+:)?(iframe|embed|object)\b/i, "it contains embedded content"],
  // A character reference decodes to any character, so it can hide `javascript:` in `to` or `values`.
  [/\s[\w:.-]+\s*=\s*(["'])(?:(?!\1)[^])*&#/i, "it contains a character reference (&#...) in an attribute"],
  // A CSS escape (`@\69mport`) hides a rule from the check above.
  [/<([\w.-]+:)?style\b[^>]*>(?:(?!<\/)[^])*\\/i, "it contains a CSS escape in a style"],
  [/[\s"'/]on[a-z]+\s*=/i, "it contains an event handler"],
  [/javascript:/i, "it contains a javascript: link"],
  [/@import/i, "it contains an @import rule"],
];

export function sanitiseSvg(input: string): SvgResult {
  if (input.length > MAX_SVG_BYTES) return fail("it is larger than 1 MB");
  const svg = input
    .replace(/^﻿/, "")
    .replace(/<\?xml[\s\S]*?\?>/g, "")
    .replace(/<!--[\s\S]*?-->/g, "")
    .replace(/<!DOCTYPE[^>[]*>/gi, "")
    .trim();
  if (/<!DOCTYPE|<!ENTITY/i.test(svg)) return fail("it has a DOCTYPE with declarations");
  if (!/^<svg[\s>]/i.test(svg) || !/<\/svg>$/i.test(svg)) return fail("this is not an SVG file");
  for (const [pattern, reason] of DANGEROUS) if (pattern.test(svg)) return fail(reason);
  for (const m of svg.matchAll(/(?:xlink:)?href\s*=\s*(["'])(.*?)\1/gi)) {
    if (!INSIDE.test(m[2].trim())) return fail("it links to something outside the file");
  }
  for (const m of svg.matchAll(/url\(\s*(["']?)(.*?)\1\s*\)/gi)) {
    if (!INSIDE.test(m[2].trim())) return fail("it links to something outside the file");
  }
  return { ok: true, svg };
}

/**
 * Every fill, stroke, stop and text colour becomes `hex`; `none` and `transparent` stay. The
 * root gets a fill of its own so that paths without one are recoloured too.
 */
export function recolourSvg(svg: string, hex: string): string {
  const paint = (v: string) => (/^\s*(none|transparent)\s*$/i.test(v) ? v : hex);
  const out = svg
    .replace(
      /(?<![\w-])(fill|stroke|stop-color|color)\s*=\s*(["'])(.*?)\2/gi,
      (_m, k, q, v) => `${k}=${q}${paint(v)}${q}`,
    )
    .replace(/(?<![\w-])(fill|stroke|stop-color|color)\s*:\s*([^;"'}]+)/gi, (_m, k, v) => `${k}:${paint(v)}`);
  return out.replace(/<svg\b([^>]*)>/i, (m, attrs: string) =>
    /\sfill\s*=/.test(attrs) ? m : `<svg${attrs} fill="${hex}">`,
  );
}
