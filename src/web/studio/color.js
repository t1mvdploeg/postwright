// Contrast per WCAG 2.1. The colour pairs per ground are in the brand
// (`brand.grounds`), not here. Self-contained: the browser does not load server modules.

function luminance(hex) {
  const part = (i) => {
    const v = parseInt(hex.slice(1 + i * 2, 3 + i * 2), 16) / 255;
    return v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4;
  };
  return 0.2126 * part(0) + 0.7152 * part(1) + 0.0722 * part(2);
}

/**
 * Contrast ratio between two hex colours (#rrggbb); 1 = equal, 21 = black on white.
 * Rounded to 0.01.
 */
export function contrastRatio(a, b) {
  const la = luminance(a);
  const lb = luminance(b);
  return Math.round(((Math.max(la, lb) + 0.05) / (Math.min(la, lb) + 0.05)) * 100) / 100;
}

/** The threshold for text on a ground: WCAG 1.4.3, body text 4.5:1. */
export const THRESHOLD = 4.5;

/**
 * The contrast of the text on a ground of the brand, with the threshold included; null for
 * an unknown ground.
 */
export function contrastOn(brand, ground) {
  const g = brand.grounds[ground];
  return g ? { ratio: contrastRatio(g.text, g.background), threshold: THRESHOLD } : null;
}
