// Own templates: a template made from data (fields, a tree of nodes and some CSS) instead of
// code. One module for the browser and the server. `checkTemplate` is the only judge: it runs on
// every proposal, before saving, when a file is read, and again in `compileTemplate`. It refuses
// and never repairs; every message names the place and the problem. `compileTemplate` turns a
// checked file into an object shaped like a built-in `Template` (templates.d.ts).
//
// The model that proposes a template is not trusted, and neither is a file on disk. A template
// can only produce what the engine emits: elements from a fixed list with `class` and
// `data-field`, text through `c.t`, `c.e` and `c.footer`, and the slots (logo, route, image, icon).
// The CSS is limited to plain layout and the brand's own variables.
//
// This module and templates.js import each other; that is safe because neither calls the
// other while it loads, only from inside functions.
import { FORMATS } from "./formats.js";
import { countEmphasis, escapeHtml } from "./templates.js";
import { HEADLINE_SIZE, ground, groundClass, headlineClass, logoMode } from "./templates/fields.js";

export const TAGS = [
  "div",
  "section",
  "main",
  "header",
  "footer",
  "figure",
  "h1",
  "h2",
  "h3",
  "p",
  "span",
  "strong",
  "ul",
  "li",
];
export const AS_VALUES = ["rich", "plain", "footer"];
export const ICONS = ["arrow", "tick"];
export const PRESETS = ["ground", "headlineSize"];
export const SLIDE_KINDS = ["cover", "content", "closing"];
export const IMAGE_FORMATS = FORMATS.map((f) => f.key).filter(
  (k) => !["li-carousel", "li-profile", "li-company"].includes(k),
);
/** The 14 variables of every brand (the same list as `CSS_VARIABLES` in brand-proposal.ts; a test keeps them equal). */
export const BRAND_VARIABLES = [
  "--ink",
  "--accent",
  "--accent-hover",
  "--accent-light",
  "--accent-soft",
  "--accent-pale",
  "--background",
  "--white",
  "--muted",
  "--stroke",
  "--success",
  "--warning",
  "--soft-warning",
  "--error",
];
/** What `var()` may name: the brand variables, the grounds, and the ones the base CSS sets per ground and format. */
export const ALLOWED_VARIABLES = [
  ...BRAND_VARIABLES,
  "--ground-light",
  "--ground-light-text",
  "--ground-ink",
  "--ground-ink-text",
  "--ground-accent",
  "--ground-accent-text",
  "--emphasis",
  "--soft",
  "--hairline",
  "--width",
  "--height",
];
/** The CSS functions a template may use (the names as shown to the model). */
export const CSS_FUNCTIONS = [
  "var",
  "calc",
  "min",
  "max",
  "clamp",
  "color-mix",
  "translate",
  "translateX",
  "translateY",
  "scale",
  "rotate",
  "minmax",
  "repeat",
  "linear-gradient",
  "radial-gradient",
];
export const CSS_SELECTORS = [":first-child", ":last-child", ":not()", ":nth-child()", "::before", "::after"];
export const DENIED_PROPERTIES = ["font", "font-family", "animation*", "transition*"];
export const LIMITS = {
  name: 40,
  goal: 140,
  slideName: 30,
  label: 40,
  help: 160,
  fields: 12,
  options: 8,
  depth: 6,
  nodes: 60,
  classes: 6,
  literal: 80,
  css: 6000,
  rules: 80,
  file: 60_000,
  templates: 30,
  minSlides: 3,
  maxSlides: 8,
};

const FUNCTION_SET = new Set(CSS_FUNCTIONS.map((f) => f.toLowerCase()));
const VARIABLE_SET = new Set(ALLOWED_VARIABLES);
const NAMED_COLOURS = new Set(
  (
    "aliceblue antiquewhite aqua aquamarine azure beige bisque black blanchedalmond blue blueviolet brown burlywood cadetblue chartreuse chocolate coral cornflowerblue cornsilk crimson cyan darkblue darkcyan darkgoldenrod darkgray darkgreen darkgrey darkkhaki darkmagenta darkolivegreen darkorange darkorchid darkred darksalmon darkseagreen darkslateblue darkslategray darkslategrey darkturquoise darkviolet deeppink deepskyblue dimgray dimgrey dodgerblue firebrick floralwhite forestgreen fuchsia gainsboro ghostwhite gold goldenrod gray green greenyellow grey honeydew hotpink indianred indigo ivory khaki lavender lavenderblush lawngreen lemonchiffon lightblue lightcoral lightcyan lightgoldenrodyellow lightgray lightgreen lightgrey lightpink lightsalmon lightseagreen lightskyblue lightslategray lightslategrey lightsteelblue lightyellow lime limegreen linen magenta maroon mediumaquamarine mediumblue mediumorchid mediumpurple mediumseagreen mediumslateblue mediumspringgreen mediumturquoise mediumvioletred midnightblue mintcream mistyrose moccasin navajowhite navy oldlace olive olivedrab orange orangered orchid palegoldenrod palegreen paleturquoise palevioletred papayawhip peachpuff peru pink plum powderblue purple rebeccapurple red rosybrown royalblue saddlebrown salmon sandybrown seagreen seashell sienna silver skyblue slateblue slategray slategrey snow springgreen steelblue tan teal thistle tomato turquoise violet wheat white whitesmoke yellow yellowgreen " +
    "canvas canvastext linktext visitedtext activetext buttonface buttontext buttonborder field fieldtext highlight highlighttext selecteditem selecteditemtext mark marktext graytext accentcolor accentcolortext " +
    "activeborder activecaption appworkspace background buttonhighlight buttonshadow captiontext inactiveborder inactivecaption inactivecaptiontext infobackground infotext menu menutext scrollbar threeddarkshadow threedface threedhighlight threedlightshadow threedshadow window windowframe windowtext"
  ).split(" "),
);

/** Colour keywords with a vendor prefix (`-webkit-link`, `-moz-default-color`); layout keywords like `-webkit-box` stay. */
const LEGACY_COLOUR =
  /^-moz-|^-webkit-(?!box$|inline-box$|fill-available$|max-content$|min-content$|fit-content$|sticky$)/;
const ID = /^[a-z][A-Za-z0-9]{0,23}$/;
const CLASS = /^[a-z][a-z0-9-]{0,30}$/;
const TEMPLATE_ID = /^own-[0-9a-f]{8}$/;
const isObject = (v) => typeof v === "object" && v !== null && !Array.isArray(v);
const PHRASING_PARENTS = ["p", "h1", "h2", "h3", "span", "strong"];
const MAX_PROBLEMS = 30;

// ---------------------------------------------------------------------------------------------
// The CSS
// ---------------------------------------------------------------------------------------------

const OUTRIGHT = [
  [/@/, 'the character "@" is not allowed (no @import, @font-face or @media)'],
  [/\/\*/, "comments are not allowed"],
  [/\\/, "backslashes are not allowed"],
  [/</, 'the character "<" is not allowed'],
  [/#/, 'the character "#" is not allowed (no hex colours, no ids)'],
  [/\[/, 'the character "[" is not allowed (no attribute selectors)'],
  [/[^\u0009\u000a\u000d\u0020-\u007e]/, "only plain ASCII text is allowed (no control or special characters)"],
];
const SELECTOR_TOKEN = new RegExp(
  [
    String.raw`\s*([>+~])\s*`,
    String.raw`\s+`,
    String.raw`\.([a-z][a-z0-9-]{0,30})(?![A-Za-z0-9_-])`,
    String.raw`\*`,
    String.raw`([a-z][a-z0-9]*)(?![A-Za-z0-9_-])`,
    String.raw`:(?:first-child|last-child)(?![A-Za-z0-9_-])`,
    String.raw`::(?:before|after)(?![A-Za-z0-9_-])`,
    String.raw`:not\(([^()]*)\)`,
    String.raw`:nth-child\(([^()]*)\)`,
  ].join("|"),
  "y",
);
const NOT_ARGUMENT = /^(\.[a-z][a-z0-9-]{0,30}|[a-z][a-z0-9]*|:first-child|:last-child)$/;
const NTH_ARGUMENT = /^\s*(odd|even|-?\d+|-?\d*n(\s*[+-]\s*\d+)?)\s*$/;
const VALUE_TOKEN =
  /\s+|(--[a-z0-9-]+)|(-?[A-Za-z_][A-Za-z0-9_-]*)(\s*\()?|[+-]?(?:\d+\.?\d*|\.\d+)(?:%|[A-Za-z]+)?|[(),/*+-]/y;
const DENIED_PROPERTY = /^(font|font-family|(-webkit-)?animation(-[a-z-]+)?|(-webkit-)?transition(-[a-z-]+)?)$/;

/** Splits on top-level commas (not inside parentheses). */
function splitSelectors(text) {
  const parts = [];
  let depth = 0;
  let begin = 0;
  for (let i = 0; i < text.length; i++) {
    if (text[i] === "(") depth++;
    else if (text[i] === ")") depth--;
    else if (text[i] === "," && depth === 0) {
      parts.push(text.slice(begin, i));
      begin = i + 1;
    }
  }
  parts.push(text.slice(begin));
  return parts;
}

/** The problem with one selector, or null. */
function selectorProblem(selector) {
  const text = selector.trim();
  if (!text) return "the selector is empty";
  let pos = 0;
  let last = "start";
  while (pos < text.length) {
    SELECTOR_TOKEN.lastIndex = pos;
    const m = SELECTOR_TOKEN.exec(text);
    if (!m) return `"${text.slice(pos, pos + 12)}" is not allowed in a selector`;
    if (m[3] !== undefined && !TAGS.includes(m[3])) return `the tag "${m[3]}" is not allowed in a selector`;
    if (m[4] !== undefined && !NOT_ARGUMENT.test(m[4]))
      return `:not() takes one class, tag or :first-child / :last-child`;
    if (m[4] !== undefined && /^[a-z]/.test(m[4]) && !TAGS.includes(m[4]))
      return `the tag "${m[4]}" is not allowed in a selector`;
    if (m[5] !== undefined && !NTH_ARGUMENT.test(m[5]))
      return `:nth-child() takes odd, even, a number or an expression like 2n+1`;
    const combinator = m[1] !== undefined;
    if (combinator && (last === "start" || last === "combinator")) return "a combinator needs a selector on both sides";
    last = combinator ? "combinator" : "simple";
    pos = SELECTOR_TOKEN.lastIndex;
  }
  return last === "combinator" ? "a combinator needs a selector on both sides" : null;
}

/** The problem with the value of one declaration, or null. */
function valueProblem(prop, value) {
  if (/^"{2}$/.test(value)) return prop === "content" ? null : 'quotes are not allowed (only content: "")';
  if (prop === "content") return 'content may only be ""';
  if (/["']/.test(value)) return "quotes are not allowed";
  let pos = 0;
  let depth = 0;
  let previous = "";
  while (pos < value.length) {
    VALUE_TOKEN.lastIndex = pos;
    const m = VALUE_TOKEN.exec(value);
    if (!m) return `the character "${value[pos]}" is not allowed in a value`;
    pos = VALUE_TOKEN.lastIndex;
    if (/^\s+$/.test(m[0])) continue;
    if (m[1] !== undefined) {
      if (previous !== "var(") return `${m[1]} may only be used inside var()`;
      if (!VARIABLE_SET.has(m[1])) return `${m[1]} is not a brand variable (see the list of variables)`;
    } else if (m[2] !== undefined) {
      const name = m[2].toLowerCase();
      if (m[3] !== undefined) {
        if (!FUNCTION_SET.has(name)) return `${m[2]}() is not allowed`;
        depth++;
        previous = `${name}(`;
        continue;
      }
      if (NAMED_COLOURS.has(name) || LEGACY_COLOUR.test(name))
        return `the colour "${m[2]}" is not allowed (use var(--accent) and the other brand variables, or color-mix)`;
    } else if (m[0] === "(") {
      depth++;
    } else if (m[0] === ")") {
      if (--depth < 0) return "unbalanced parentheses";
    }
    previous = m[0];
  }
  if (depth !== 0) return "unbalanced parentheses";
  const mixes = (value.match(/color-mix\s*\(/gi) ?? []).length;
  const good = (value.match(/color-mix\(\s*in\s+srgb\s*,/gi) ?? []).length;
  if (mixes !== good) return "color-mix() must start with in srgb,";
  return null;
}

/** Every problem of a template's CSS. */
function cssProblems(css) {
  if (typeof css !== "string") return ["css: must be text"];
  if (css.length > LIMITS.css) return [`css: longer than ${LIMITS.css} characters`];
  const problems = [];
  for (const [pattern, text] of OUTRIGHT) if (pattern.test(css)) problems.push(`css: ${text}`);
  if (problems.length) return problems;
  const rules = [];
  let i = 0;
  while (css.slice(i).trim() !== "") {
    const open = css.indexOf("{", i);
    const close = css.indexOf("}", i);
    if (open === -1) return [...problems, 'css: text after the last rule (a "{" is missing)'];
    if (close !== -1 && close < open) return [...problems, 'css: a "}" without a matching "{"'];
    const end = css.indexOf("}", open);
    if (end === -1) return [...problems, 'css: a rule is not closed (a "}" is missing)'];
    const body = css.slice(open + 1, end);
    const selector = css.slice(i, open).trim();
    if (body.includes("{"))
      return [...problems, `css rule ${rules.length + 1} (${selector.slice(0, 40)}): nested rules are not allowed`];
    rules.push({ selector, body });
    i = end + 1;
  }
  if (rules.length > LIMITS.rules) problems.push(`css: more than ${LIMITS.rules} rules`);
  rules.forEach(({ selector, body }, n) => {
    const where = `css rule ${n + 1} (${selector.slice(0, 40)})`;
    for (const part of splitSelectors(selector)) {
      const p = selectorProblem(part);
      if (p) problems.push(`${where}: ${p}`);
    }
    for (const declaration of body.split(";")) {
      const d = declaration.trim();
      if (!d) continue;
      const colon = d.indexOf(":");
      const prop = colon > 0 ? d.slice(0, colon).trim() : "";
      if (!/^-?[a-z][a-z-]*$/.test(prop)) {
        problems.push(`${where}: "${d.slice(0, 30)}" is not a declaration`);
        continue;
      }
      if (DENIED_PROPERTY.test(prop)) {
        problems.push(`${where}: the property ${prop} is not allowed`);
        continue;
      }
      const p = valueProblem(prop, d.slice(colon + 1).trim());
      if (p) problems.push(`${where} (${prop}): ${p}`);
    }
  });
  return problems;
}

// ---------------------------------------------------------------------------------------------
// Fields and the tree
// ---------------------------------------------------------------------------------------------

function unknownKeys(o, allowed, where, problems) {
  for (const k of Object.keys(o)) if (!allowed.includes(k)) problems.push(`${where}: unknown key "${k}"`);
}

function text(v, where, min, max, problems) {
  if (typeof v !== "string" || v.trim().length < min || v.length > max) {
    problems.push(`${where}: must be text of ${min === max ? max : `${min} to ${max}`} characters`);
    return false;
  }
  return true;
}

/** One field as the engine uses it (the shape of `Field` in templates.d.ts). */
export function expandField(f) {
  if (f.preset === "ground") return ground(f.defaultValue ?? "light");
  if (f.preset === "headlineSize")
    return { ...HEADLINE_SIZE, defaultValue: f.defaultValue ?? HEADLINE_SIZE.defaultValue };
  if (f.kind === "headline") {
    return {
      ...f,
      required: true,
      emphasis: "exactly-one",
      help: "Put exactly one phrase between *asterisks*; it gets the accent colour.",
    };
  }
  if (f.kind === "media") return { ...f, defaultValue: "" };
  return { ...f };
}

const FIELD_KEYS = {
  headline: ["id", "label", "kind", "max", "defaultValue"],
  text: ["id", "label", "kind", "max", "defaultValue", "help"],
  line: ["id", "label", "kind", "max", "defaultValue", "help"],
  choice: ["id", "label", "kind", "options", "defaultValue"],
  media: ["id", "label", "kind", "required", "help"],
};

/** Checks a list of fields; returns a map from id to the expanded field. */
function checkFields(fields, where, problems) {
  const byId = new Map();
  if (!Array.isArray(fields)) {
    problems.push(`${where}: must be a list`);
    return byId;
  }
  if (fields.length > LIMITS.fields) problems.push(`${where}: more than ${LIMITS.fields} fields`);
  fields.slice(0, LIMITS.fields).forEach((f, i) => {
    const at = `${where}[${i}]`;
    if (!isObject(f)) return problems.push(`${at}: must be an object`);
    if ("preset" in f) {
      unknownKeys(f, ["preset", "defaultValue"], at, problems);
      if (!PRESETS.includes(f.preset)) return problems.push(`${at}: preset must be "ground" or "headlineSize"`);
      if (byId.has(f.preset)) return problems.push(`${at}: the field "${f.preset}" is defined twice`);
      const expanded = expandField({ preset: f.preset });
      if ("defaultValue" in f && !expanded.options.some((o) => o.value === f.defaultValue)) {
        problems.push(`${at}: defaultValue must be one of ${expanded.options.map((o) => o.value).join(", ")}`);
      }
      return byId.set(f.preset, expandField(f));
    }
    // A kind is a plain string and one of these keys: not "constructor", not an array that reads like one.
    const keys = typeof f.kind === "string" && Object.hasOwn(FIELD_KEYS, f.kind) ? FIELD_KEYS[f.kind] : null;
    if (!keys) return problems.push(`${at}: kind must be headline, text, line, choice or media`);
    unknownKeys(f, keys, at, problems);
    if (typeof f.id !== "string" || !ID.test(f.id))
      return problems.push(`${at}: id must be camelCase letters and digits, at most 24 characters`);
    if (PRESETS.includes(f.id)) return problems.push(`${at}: the id "${f.id}" is reserved for the ${f.id} preset`);
    if (f.kind === "headline" && f.id !== "headline")
      return problems.push(`${at}: the headline field must have the id "headline"`);
    if (byId.has(f.id)) return problems.push(`${at}: the field "${f.id}" is defined twice`);
    text(f.label, `${at}.label`, 1, LIMITS.label, problems);
    if ("help" in f && typeof f.help !== "string") problems.push(`${at}.help: must be text`);
    else if (typeof f.help === "string" && f.help.length > LIMITS.help)
      problems.push(`${at}.help: longer than ${LIMITS.help} characters`);
    if (f.kind === "choice") {
      const options = f.options;
      if (!Array.isArray(options) || options.length < 2 || options.length > LIMITS.options) {
        problems.push(`${at}.options: must be a list of 2 to ${LIMITS.options} options`);
      } else {
        const seen = new Set();
        options.forEach((o, n) => {
          if (!isObject(o)) return problems.push(`${at}.options[${n}]: must be an object`);
          unknownKeys(o, ["value", "text"], `${at}.options[${n}]`, problems);
          if (typeof o.value !== "string" || !CLASS.test(o.value))
            problems.push(`${at}.options[${n}].value: must be a class name (lowercase letters, digits and hyphens)`);
          else if (seen.has(o.value)) problems.push(`${at}.options[${n}].value: "${o.value}" appears twice`);
          else seen.add(o.value);
          text(o.text, `${at}.options[${n}].text`, 1, 30, problems);
        });
        if (!options.some((o) => isObject(o) && o.value === f.defaultValue))
          problems.push(`${at}.defaultValue: must be one of the options`);
      }
    } else if (f.kind === "media") {
      if ("required" in f && typeof f.required !== "boolean") problems.push(`${at}.required: must be true or false`);
    } else {
      const [low, high] = { headline: [10, 120], text: [10, 400], line: [5, 120] }[f.kind];
      if (!Number.isInteger(f.max) || f.max < low || f.max > high)
        problems.push(`${at}.max: must be a whole number from ${low} to ${high}`);
      else if (typeof f.defaultValue !== "string" || f.defaultValue.length > f.max)
        problems.push(`${at}.defaultValue: must be text of at most ${f.max} characters`);
      else if (f.kind === "headline" && countEmphasis(f.defaultValue) !== 1)
        problems.push(`${at}.defaultValue: a headline needs exactly one *emphasised* phrase`);
    }
    byId.set(f.id, expandField(f));
  });
  return byId;
}

const kindOf = (fields, id) => fields.get(id)?.kind;

/** Checks a tree of nodes against the fields it may refer to. */
function checkTree(tree, fields, where, problems) {
  if (!Array.isArray(tree) || tree.length === 0)
    return problems.push(`${where}: must be a list with at least one node`);
  let count = 0;
  const need = (at, key, id, kinds, what) => {
    if (typeof id !== "string" || !fields.has(id))
      problems.push(`${at}.${key}: "${String(id)}" is not a field of this template`);
    else if (!kinds.includes(kindOf(fields, id))) problems.push(`${at}.${key}: "${id}" is not ${what}`);
  };
  const visit = (node, depth, parent, at) => {
    count++;
    if (depth > LIMITS.depth) return problems.push(`${at}: nested deeper than ${LIMITS.depth} levels`);
    if (!isObject(node)) return problems.push(`${at}: must be an object`);
    const inPhrasing = parent && PHRASING_PARENTS.includes(parent.tag);
    if ("slot" in node) {
      if (inPhrasing && node.slot !== "icon")
        return problems.push(`${at}: a ${node.slot} slot cannot sit inside <${parent.tag}>`);
      if (parent?.tag === "ul") return problems.push(`${at}: a <ul> may only hold <li> elements`);
      if (node.slot === "logo" || node.slot === "route") return unknownKeys(node, ["slot"], at, problems);
      if (node.slot === "image") {
        unknownKeys(node, ["slot", "field"], at, problems);
        return need(at, "field", node.field, ["media"], "an image field");
      }
      if (node.slot === "icon") {
        unknownKeys(node, ["slot", "name"], at, problems);
        if (!ICONS.includes(node.name)) problems.push(`${at}.name: must be arrow or tick`);
        return;
      }
      return problems.push(`${at}.slot: must be logo, route, image or icon`);
    }
    if ("tag" in node) {
      unknownKeys(node, ["tag", "classes", "classFrom", "headlineOf", "dataField", "showIf", "children"], at, problems);
      if (!TAGS.includes(node.tag)) return problems.push(`${at}.tag: "${String(node.tag)}" is not an allowed tag`);
      if (inPhrasing && !["span", "strong"].includes(node.tag))
        problems.push(`${at}: <${node.tag}> cannot sit inside <${parent.tag}>`);
      if (parent?.tag === "ul" && node.tag !== "li") problems.push(`${at}: a <ul> may only hold <li> elements`);
      if (node.tag === "li" && parent?.tag !== "ul") problems.push(`${at}: <li> must sit directly inside a <ul>`);
      if ("classes" in node) {
        if (!Array.isArray(node.classes) || node.classes.length > LIMITS.classes)
          problems.push(`${at}.classes: must be a list of at most ${LIMITS.classes} class names`);
        else {
          node.classes.forEach((c, n) => {
            if (typeof c !== "string" || !CLASS.test(c))
              problems.push(`${at}.classes[${n}]: must be a class name (lowercase letters, digits and hyphens)`);
          });
        }
      }
      if ("classFrom" in node) need(at, "classFrom", node.classFrom, ["choice"], "a choice field");
      if ("headlineOf" in node) need(at, "headlineOf", node.headlineOf, ["headline"], "the headline field");
      if ("dataField" in node)
        need(at, "dataField", node.dataField, ["headline", "text", "line", "media"], "a text or image field");
      if ("showIf" in node)
        need(at, "showIf", node.showIf, ["headline", "text", "line", "media"], "a text or image field");
      if ("children" in node) {
        if (!Array.isArray(node.children)) problems.push(`${at}.children: must be a list`);
        else node.children.forEach((child, n) => visit(child, depth + 1, node, `${at}.children[${n}]`));
      }
      return;
    }
    if ("literal" in node) {
      unknownKeys(node, ["literal"], at, problems);
      if (parent?.tag === "ul") return problems.push(`${at}: a <ul> may only hold <li> elements`);
      return void text(node.literal, `${at}.literal`, 1, LIMITS.literal, problems);
    }
    if ("field" in node) {
      unknownKeys(node, ["field", "as"], at, problems);
      if (parent?.tag === "ul") return problems.push(`${at}: a <ul> may only hold <li> elements`);
      if (!AS_VALUES.includes(node.as)) return problems.push(`${at}.as: must be rich, plain or footer`);
      const kinds = { rich: ["headline", "text"], plain: ["headline", "text", "line"], footer: ["line"] }[node.as];
      return need(at, "field", node.field, kinds, `a ${kinds.join(" or ")} field (needed for "${node.as}")`);
    }
    problems.push(`${at}: not a valid node (it needs tag, field, literal or slot)`);
  };
  tree.forEach((node, n) => visit(node, 1, null, `${where}[${n}]`));
  if (count > LIMITS.nodes) problems.push(`${where}: more than ${LIMITS.nodes} nodes`);
}

/** Checks that a default content object fits its fields. */
function checkContent(content, fields, at, problems) {
  if (!isObject(content)) return problems.push(`${at}: must be an object`);
  for (const [id, value] of Object.entries(content)) {
    const f = fields.get(id);
    if (!f || f.kind === "media") problems.push(`${at}.${id}: not a text or choice field of this slide kind`);
    else if (typeof value !== "string") problems.push(`${at}.${id}: must be text`);
    else if (f.kind === "choice" && !f.options.some((o) => o.value === value))
      problems.push(`${at}.${id}: must be one of ${f.options.map((o) => o.value).join(", ")}`);
    else if (f.max !== undefined && value.length > f.max) problems.push(`${at}.${id}: longer than ${f.max} characters`);
    else if (f.kind === "headline" && countEmphasis(value) !== 1)
      problems.push(`${at}.${id}: a headline needs exactly one *emphasised* phrase`);
  }
}

// ---------------------------------------------------------------------------------------------
// The check
// ---------------------------------------------------------------------------------------------

/**
 * `mode`: "proposal" (no id or created, as the model or an agent writes it), "saved" (both
 * required, as in a file in the project) or "either".
 * @returns {{ ok: true, template: object } | { ok: false, problems: string[] }}
 */
export function checkTemplate(raw, { mode = "either" } = {}) {
  const problems = [];
  const refuse = () => ({
    ok: false,
    problems:
      problems.length > MAX_PROBLEMS
        ? [...problems.slice(0, MAX_PROBLEMS), `…and ${problems.length - MAX_PROBLEMS} more`]
        : problems,
  });
  if (!isObject(raw)) return { ok: false, problems: ["template: must be an object"] };
  let size = 0;
  try {
    size = JSON.stringify(raw).length;
  } catch {
    return { ok: false, problems: ["template: cannot be read as JSON"] };
  }
  if (size > LIMITS.file) return { ok: false, problems: ["template: the file is larger than 60 kB"] };
  unknownKeys(
    raw,
    ["version", "id", "created", "name", "goal", "kind", "formats", "css", "fields", "tree", "slides", "defaultSlides"],
    "template",
    problems,
  );
  if (raw.version !== 1) problems.push("version: must be 1");
  const hasId = "id" in raw;
  const hasCreated = "created" in raw;
  if (mode === "proposal" && (hasId || hasCreated))
    problems.push("id, created: a proposal must not have them; the studio makes them when you use the template");
  else if ((mode === "saved" || hasId || hasCreated) && !(hasId && hasCreated))
    problems.push("id, created: both are needed in a saved template");
  if (hasId && !(typeof raw.id === "string" && TEMPLATE_ID.test(raw.id)))
    problems.push("id: must be own- and 8 hex characters");
  if (hasCreated && !(typeof raw.created === "string" && !Number.isNaN(Date.parse(raw.created))))
    problems.push("created: must be a date and time");
  text(raw.name, "name", 1, LIMITS.name, problems);
  text(raw.goal, "goal", 1, LIMITS.goal, problems);
  if (raw.kind !== "image" && raw.kind !== "carousel") problems.push('kind: must be "image" or "carousel"');
  if (!Array.isArray(raw.formats) || raw.formats.length === 0)
    problems.push("formats: must be a list with at least one format");
  else if (raw.kind === "carousel") {
    if (raw.formats.length !== 1 || raw.formats[0] !== "li-carousel")
      problems.push('formats: a carousel uses exactly ["li-carousel"]');
  } else if (raw.kind === "image") {
    raw.formats.forEach(
      (f, n) =>
        IMAGE_FORMATS.includes(f) ||
        problems.push(`formats[${n}]: "${String(f)}" is not a format an image template can have`),
    );
    if (new Set(raw.formats).size !== raw.formats.length) problems.push("formats: a format appears twice");
  }
  problems.push(...cssProblems(raw.css));

  if (raw.kind === "image") {
    for (const k of ["slides", "defaultSlides"]) if (k in raw) problems.push(`${k}: only a carousel has them`);
    const fields = checkFields(raw.fields, "fields", problems);
    checkTree(raw.tree, fields, "tree", problems);
  } else if (raw.kind === "carousel") {
    for (const k of ["fields", "tree"])
      if (k in raw) problems.push(`${k}: a carousel has them per slide kind, in slides`);
    const kinds = new Map();
    if (
      !Array.isArray(raw.slides) ||
      raw.slides.length !== SLIDE_KINDS.length ||
      !raw.slides.every((s, n) => s?.kind === SLIDE_KINDS[n])
    ) {
      problems.push("slides: must be exactly three slide kinds, in this order: cover, content, closing");
    } else {
      raw.slides.forEach((s, n) => {
        const at = `slides.${s.kind}`;
        unknownKeys(s, ["kind", "name", "fields", "tree"], at, problems);
        text(s.name, `${at}.name`, 1, LIMITS.slideName, problems);
        const fields = checkFields(s.fields, `${at}.fields`, problems);
        checkTree(s.tree, fields, `${at}.tree`, problems);
        kinds.set(s.kind, fields);
      });
    }
    if (
      !Array.isArray(raw.defaultSlides) ||
      raw.defaultSlides.length < LIMITS.minSlides ||
      raw.defaultSlides.length > LIMITS.maxSlides
    ) {
      problems.push(`defaultSlides: must be a list of ${LIMITS.minSlides} to ${LIMITS.maxSlides} slides`);
    } else {
      raw.defaultSlides.forEach((d, n) => {
        const at = `defaultSlides[${n}]`;
        if (!isObject(d)) return problems.push(`${at}: must be an object`);
        unknownKeys(d, ["kind", "content"], at, problems);
        if (!SLIDE_KINDS.includes(d.kind)) return problems.push(`${at}.kind: must be cover, content or closing`);
        if (n === 0 && d.kind !== "cover") problems.push(`${at}.kind: the first slide must be a cover`);
        if (kinds.has(d.kind)) checkContent(d.content ?? {}, kinds.get(d.kind), `${at}.content`, problems);
      });
    }
  }
  return problems.length ? refuse() : { ok: true, template: raw };
}

// ---------------------------------------------------------------------------------------------
// The engine
// ---------------------------------------------------------------------------------------------

/** One node as HTML. Everything that comes from the user goes through `c.t`, `c.e`, `c.footer` or `escapeHtml`. */
function render(node, v, c) {
  if ("slot" in node) {
    if (node.slot === "logo") return c.logo(logoMode(v.ground));
    if (node.slot === "route") return c.route();
    if (node.slot === "icon") return c.icon(node.name);
    const source = c.media(node.field);
    return source ? `<img class="media" src="${source}" alt="">` : '<div class="media empty">Choose an image</div>';
  }
  if ("tag" in node) {
    if (node.showIf && c.empty(node.showIf)) return "";
    const classes = [
      node.headlineOf ? headlineClass(v.headlineSize ?? "automatic", v[node.headlineOf]) : "",
      ...(node.classes ?? []),
      node.classFrom ? v[node.classFrom] : "",
    ].filter(Boolean);
    const attributes =
      (classes.length ? ` class="${escapeHtml(classes.join(" "))}"` : "") +
      (node.dataField ? ` data-field="${escapeHtml(node.dataField)}"` : "");
    return `<${node.tag}${attributes}>${(node.children ?? []).map((child) => render(child, v, c)).join("")}</${node.tag}>`;
  }
  if ("literal" in node) return escapeHtml(node.literal);
  return node.as === "rich" ? c.t(node.field) : node.as === "plain" ? c.e(node.field) : c.footer(node.field);
}

const usesIcon = (nodes) => nodes.some((n) => ("slot" in n && n.slot === "icon") || usesIcon(n.children ?? []));

function renderer(tree, root) {
  const icons = usesIcon(tree);
  return (v, c) =>
    `${icons ? c.symbols : ""}<${root} class="${root === "section" ? "image slide" : "image"} ${groundClass(v.ground)}">${tree.map((n) => render(n, v, c)).join("")}</${root}>`;
}

const defaults = (fields) => Object.fromEntries(fields.map((f) => [f.id, f.defaultValue ?? ""]));

/**
 * A checked template file as the object the engine uses (the shape of `Template` in
 * templates.d.ts, plus `own: true`). Throws, naming the first problem, if the file is refused.
 */
export function compileTemplate(file) {
  const r = checkTemplate(file);
  if (!r.ok) throw new Error(`The template "${file?.name ?? "?"}" was refused: ${r.problems[0]}`);
  const base = {
    id: file.id ?? "own-proposal",
    name: file.name,
    goal: file.goal,
    kind: file.kind,
    formats: [...file.formats],
    css: file.css,
    own: true,
  };
  if (file.kind === "image") {
    return { ...base, fields: file.fields.map(expandField), html: renderer(file.tree, "div") };
  }
  const slides = file.slides.map((s) => ({
    kind: s.kind,
    name: s.name,
    counts: s.kind === "content",
    fields: s.fields.map(expandField),
    html: renderer(s.tree, "section"),
  }));
  const byKind = new Map(slides.map((s) => [s.kind, s]));
  return {
    ...base,
    fields: [],
    maxSlides: 20,
    slides,
    defaultSlides: file.defaultSlides.map((d) => ({
      kind: d.kind,
      content: { ...defaults(byKind.get(d.kind).fields), ...d.content },
    })),
  };
}
