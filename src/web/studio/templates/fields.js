// Marketing studio: shared field definitions for the templates, so that "ground" or
// "footer" have the same name, the same options and the same help text everywhere.

/** The brand's three grounds: light, ink and accent. The colours are in `brand.grounds`. */
export function ground(defaultValue = "light", allowed = ["light", "ink", "accent"]) {
  const names = { light: "Light", ink: "Ink", accent: "Accent" };
  return {
    id: "ground",
    label: "Ground",
    kind: "choice",
    defaultValue,
    options: allowed.map((w) => ({ value: w, text: names[w] })),
  };
}

/** The logo that belongs with a ground: on ink and accent the light version. */
export function logoMode(ground) {
  return ground === "ink" ? "on-ink" : ground === "accent" ? "on-accent" : "default";
}

/** The class of a ground on `.image`; light is the default and has no class. */
export function groundClass(ground) {
  return ground === "ink" ? "ground-ink" : ground === "accent" ? "ground-accent" : "";
}

export function headline(
  defaultValue,
  max = 80,
  help = "Put exactly one phrase between *asterisks*; it gets the accent colour.",
) {
  return {
    id: "headline",
    label: "Headline",
    kind: "headline",
    required: true,
    emphasis: "exactly-one",
    max,
    defaultValue,
    help,
  };
}

export function text(defaultValue, max = 160, label = "Text") {
  return { id: "text", label, kind: "text", max, defaultValue };
}

export function line(id, label, defaultValue, max = 60, extra = {}) {
  return { id, label, kind: "line", max, defaultValue, ...extra };
}

/** The size of the headline: automatic by length, short headlines large, long ones smaller. */
export const HEADLINE_SIZE = {
  id: "headlineSize",
  label: "Headline size",
  kind: "choice",
  defaultValue: "automatic",
  options: [
    { value: "automatic", text: "Automatic" },
    { value: "large", text: "Large" },
    { value: "medium", text: "Medium" },
    { value: "small", text: "Small" },
  ],
};

/** The class for a headline size; "automatic" picks by length (without the asterisks). */
export function headlineClass(size, headlineText) {
  const length = String(headlineText ?? "").replace(/\*/g, "").length;
  const g = size === "automatic" ? (length <= 34 ? "large" : length <= 60 ? "medium" : "small") : size;
  return g === "large" ? "headline" : `headline ${g}`;
}
