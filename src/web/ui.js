// The studio's helper functions: one place for the connection to the server, building
// elements and the shared building blocks (notice, dialog, field error, empty state,
// icon). Plain browser ESM without a build step; the file also loads in a bare Node
// environment (tests), so everything that touches the DOM sits in a function or behind a
// `typeof document` check.

const PROJECT_KEY = "postwright-project";

/** The project the studio works in (a slug), as remembered in this browser; null if none was chosen yet. */
export function activeProject() {
  try {
    return localStorage.getItem(PROJECT_KEY);
  } catch {
    return null;
  }
}

// The project this page was opened for. `activeProject()` is what the browser remembers for
// the next load and can change under us (another tab, a cancelled switch), so the calls of
// one page keep to the project it showed from the start.
let pinned = null;

/** Fixes the project of this page: from now on its calls carry this slug, whatever is remembered. */
export function pinProject(slug) {
  pinned = slug;
}

/** Remembers the project. A browser that blocks storage just forgets it; that is not an error. */
export function setActiveProject(slug) {
  try {
    localStorage.setItem(PROJECT_KEY, slug);
  } catch {
    // The first project is used next time.
  }
}

/**
 * The header that tells the server which project a call is about. Every call carries it:
 * `api()` does so itself, and a plain `fetch` has to add it.
 */
export function projectHeaders() {
  const slug = pinned ?? activeProject();
  return slug ? { "x-postwright-project": slug } : {};
}

/**
 * Every screen talks to the server through this one function. An error comes back as an
 * `Error` with the server's message (`error`), the HTTP status in `.status` and the raw
 * content in `.data`.
 */
export async function api(path, options = {}) {
  const init = {
    method: options.method ?? "GET",
    headers: { "content-type": "application/json", ...projectHeaders() },
  };
  if (options.raw) {
    init.body = options.raw;
    init.headers["content-type"] = options.raw.type || "application/octet-stream";
  } else if (options.body !== undefined) init.body = JSON.stringify(options.body);
  if (options.signal) init.signal = options.signal;
  // A network error (TypeError; an AbortError stays as it is) or a gateway error without a
  // JSON response gets a readable message instead of the bare "Failed to fetch"/"Error 502".
  const NO_CONNECTION = "No connection to the server; try again.";
  const r = await fetch(path, init).catch((e) => {
    throw e instanceof TypeError ? new Error(NO_CONNECTION) : e;
  });
  const text = await r.text();
  let data = null;
  try {
    data = text ? JSON.parse(text) : null;
  } catch {
    data = null;
  }
  if (!r.ok)
    throw Object.assign(
      new Error(data?.error ?? ([502, 503, 504].includes(r.status) ? NO_CONNECTION : `Error ${r.status}`)),
      { status: r.status, data },
    );
  return data;
}

const FIELD_SELECTOR = "input:not([type=hidden]), select, textarea";
let labelCounter = 0;

/**
 * Links every `<label>` without `for` (and without a field inside) to its field, so that a
 * screen reader reads out the label and a click on the label puts the cursor in the field.
 * The field is the next sibling element, or otherwise the only field in the parent.
 * Labels and fields that are already linked are left alone.
 * @param {ParentNode} root
 */
function linkLabels(root) {
  for (const label of root.querySelectorAll("label:not([for])")) {
    if (label.querySelector(FIELD_SELECTOR)) continue;
    let field = label.nextElementSibling;
    if (!field || !field.matches(FIELD_SELECTOR)) {
      const fields = label.parentElement ? label.parentElement.querySelectorAll(FIELD_SELECTOR) : [];
      field = fields.length === 1 ? fields[0] : null;
    }
    if (!field) continue;
    if (!field.id) field.id = `field-${++labelCounter}`;
    label.htmlFor = field.id;
  }
}

export function el(tag, attrs = {}, children = []) {
  const e = document.createElement(tag);
  for (const [k, v] of Object.entries(attrs)) {
    if (k === "class") e.className = v;
    else if (k === "text") e.textContent = v;
    else if (k.startsWith("on")) e.addEventListener(k.slice(2), v);
    else if (v !== null && v !== undefined) e.setAttribute(k, v);
  }
  for (const kind of [].concat(children)) if (kind !== null && kind !== undefined) e.append(kind);
  return e;
}

/**
 * An icon from `/icons.svg`. Always decorative (`aria-hidden`): the text next to it carries
 * the meaning. Stroke and colour come from `.icon` in studio.css (currentColor).
 * @param {string} name symbol id in /icons.svg
 * @param {string} [className] extra class next to `icon`
 */
export function icon(name, className = "") {
  const ns = "http://www.w3.org/2000/svg";
  const svg = document.createElementNS(ns, "svg");
  svg.setAttribute("class", className ? `icon ${className}` : "icon");
  svg.setAttribute("aria-hidden", "true");
  svg.setAttribute("focusable", "false");
  const use = document.createElementNS(ns, "use");
  use.setAttribute("href", `/icons.svg#${name}`);
  svg.append(use);
  return svg;
}

/**
 * Empty state: one fixed shape for "nothing here yet", with an optional
 * `action` = `{ text, href }` as a direct link to the place where you create the first
 * record.
 */
export function emptyState(title, text, action) {
  return el("div", { class: "empty-state" }, [
    el("b", { text: title }),
    el("p", { text: text }),
    action ? el("a", { class: "button-link", href: action.href, text: action.text }) : null,
  ]);
}

/**
 * Toast. The box is a live region, so that a screen reader reads out the notice without
 * focus jumping: `polite` for ordinary notices, `assertive` for errors. The close button is
 * there for anyone who wants to dismiss a notice before its five seconds are up.
 */
const NOTICE_ICON = { info: "info", ok: "tick", error: "attention", warning: "attention" };
export function notice(text, kind = "info") {
  let control = document.getElementById("notices");
  if (!control) {
    control = el("div", { id: "notices", role: "status", "aria-live": "polite" });
    document.body.prepend(control);
  }
  control.setAttribute("aria-live", kind === "error" ? "assertive" : "polite");
  const m = el("div", { class: `notice ${kind}` }, [
    icon(NOTICE_ICON[kind] ?? "info"),
    el("span", { text: text }),
    el(
      "button",
      { type: "button", class: "button-plain notice-close", "aria-label": "Close notice", onclick: () => m.remove() },
      [icon("cross")],
    ),
  ]);
  control.append(m);
  setTimeout(() => m.remove(), 5000);
}

/**
 * Adds `id` to a space-separated `aria-describedby` value without adding it twice;
 * `withoutDescription` removes exactly that one id again.
 */
function withDescription(existing, id) {
  const tokens = (existing ?? "").split(" ").filter(Boolean);
  return tokens.includes(id) ? tokens.join(" ") : [...tokens, id].join(" ");
}
function withoutDescription(existing, id) {
  return (existing ?? "")
    .split(" ")
    .filter((d) => d && d !== id)
    .join(" ");
}

/**
 * An error message attached to the field that stays until it is resolved, instead of a
 * toast that disappears after five seconds. `field` needs an `id`; an empty `text` clears
 * the error again. If an element `<id>-error` already exists, it is reused.
 *
 * In a `.field` that already has three children (label, input, help text) there is no room
 * for a fourth: the grid of `.field-row` passes on exactly three rows. The error then
 * hides the help text temporarily and takes over its row; the help text returns as soon as
 * the error is resolved.
 */
const hiddenHelpTexts = new WeakMap();
export function fieldError(field, text) {
  const errorId = `${field.id}-error`;
  let errorEl = document.getElementById(errorId);
  const holder = field.closest(".field") ?? field.parentElement ?? field;
  if (!text) {
    if (errorEl) errorEl.hidden = true;
    const helpText = hiddenHelpTexts.get(holder);
    if (helpText) {
      helpText.hidden = false;
      hiddenHelpTexts.delete(holder);
    }
    field.removeAttribute("aria-invalid");
    if (field.hasAttribute("aria-describedby")) {
      const rest = withoutDescription(field.getAttribute("aria-describedby"), errorId);
      if (rest) field.setAttribute("aria-describedby", rest);
      else field.removeAttribute("aria-describedby");
    }
    return;
  }
  if (!errorEl) {
    errorEl = el("p", { id: errorId, class: "error-message field-error", role: "alert" });
    if (holder.classList.contains("field") && holder.children.length >= 3) {
      const helpText = holder.children[2];
      helpText.hidden = true;
      hiddenHelpTexts.set(holder, helpText);
      holder.insertBefore(errorEl, helpText.nextSibling);
    } else {
      holder.append(errorEl);
    }
  }
  errorEl.textContent = text;
  errorEl.hidden = false;
  // aria-invalid and the auto-clear listener belong to a value-carrying form field; on a
  // button (e.g. a general save error attached to the save button) aria-invalid means
  // nothing and an input event never fires — such a listener would register again on every
  // failed attempt without ever being cleaned up.
  const formField = ["INPUT", "SELECT", "TEXTAREA"].includes(field.tagName);
  if (formField) field.setAttribute("aria-invalid", "true");
  field.setAttribute("aria-describedby", withDescription(field.getAttribute("aria-describedby"), errorId));
  if (formField) field.addEventListener("input", () => fieldError(field, ""), { once: true });
}

/**
 * Modal dialog based on the native `<dialog>` element: that takes care of focus trapping,
 * Escape and the backdrop itself. `buildContent` receives the form and returns the value
 * that belongs to "confirm" (`false` keeps the dialog open); closing via Escape, cancel or
 * the backdrop yields `null`.
 */
function dialog({ title, confirmText = "Confirm", cancelText = "Cancel", dangerous = false, buildContent }) {
  return new Promise((resolve) => {
    const form = el("form", { method: "dialog", class: "dialog-form" });
    const readValue = buildContent(form) ?? (() => true);

    // cancelText: null leaves out the cancel button (for a dialog that only shows something).
    const cancel = cancelText === null ? null : el("button", { type: "button", class: "secondary", text: cancelText });
    const confirm = el("button", { type: "submit", class: dangerous ? "secondary danger" : "", text: confirmText });
    form.append(el("div", { class: "dialog-buttons" }, [cancel, confirm].filter(Boolean)));

    const d = el("dialog", { class: "dialog" }, [el("h2", { text: title }), form]);
    document.body.append(d);

    // Closing always goes through `finish`: the `close` event is not reliable everywhere, and a
    // dialog that never settles its promise leaves the caller hanging forever.
    let finished = false;
    const finish = (value) => {
      if (finished) return;
      finished = true;
      if (d.open) d.close();
      d.remove();
      resolve(value);
    };

    cancel?.addEventListener("click", () => finish(null));
    form.addEventListener("submit", (e) => {
      e.preventDefault();
      const value = readValue();
      // `false` means "input not valid"; the dialog then stays open.
      if (value === false) return;
      finish(value);
    });
    // Clicking outside the dialog (on the ::backdrop) closes it, just like Escape.
    d.addEventListener("click", (e) => {
      if (e.target === d) finish(null);
    });
    d.addEventListener("cancel", () => finish(null));
    d.addEventListener("close", () => finish(null));

    d.showModal();
  });
}

/** Yes/no question. Returns `true` on confirm, `false` on cancel or Escape. */
export async function confirmDialog(question, options = {}) {
  const confirmed = await dialog({
    title: options.title ?? "Are you sure?",
    confirmText: options.confirmText ?? "Yes, continue",
    dangerous: options.dangerous ?? false,
    buildContent: (form) => {
      form.prepend(el("p", { text: question }));
      return () => true;
    },
  });
  return confirmed === true;
}

/** Asks for one line of text. Returns the trimmed text, or `null` on cancel or Escape. */
export async function textDialog(title, label, options = {}) {
  return dialog({
    title,
    confirmText: options.confirmText ?? "Create",
    buildContent: (form) => {
      const input = el("input", { type: "text", id: "dialog-text", maxlength: String(options.maxLength ?? 60) });
      form.prepend(el("div", { class: "field" }, [el("label", { for: "dialog-text", text: label }), input]));
      queueMicrotask(() => input.focus());
      // An empty name keeps the dialog open.
      return () => input.value.trim() || false;
    },
  });
}

export function debounce(fn, ms) {
  let t;
  return (...a) => {
    clearTimeout(t);
    t = setTimeout(() => fn(...a), ms);
  };
}

/**
 * A scroll container that can only be moved with the mouse hides its right-hand side from
 * a keyboard user. A tabindex solves that, but a nameless tab stop is a problem of its
 * own; so first a name, only then a tab stop. The name comes from its own aria-label, the
 * table's <caption>, or the nearest heading above it. If that yields nothing, the
 * container stays as it was.
 */
function derivedTableLabel(control) {
  const custom = control.getAttribute("aria-label");
  if (custom?.trim()) return custom.trim();
  if (control.getAttribute("aria-labelledby")) return null; // already named via another element
  const caption = control.querySelector("table > caption");
  if (caption?.textContent?.trim()) return caption.textContent.trim();
  const HEADLINES = "h1, h2, h3, h4, h5, h6, summary";
  for (let node = control.previousElementSibling; node; node = node.previousElementSibling) {
    const headline = node.matches?.(HEADLINES) ? node : node.querySelector?.(HEADLINES);
    const text = headline?.textContent?.trim();
    if (text) return text;
  }
  const parent = control.parentElement?.closest(".card, details.block, section, .app-content");
  const headline = parent?.querySelector(HEADLINES);
  return headline?.textContent?.trim() || null;
}

/**
 * Sets (or removes) the tab stop and the region role of a scroll container. What this
 * function added itself, it also removes itself (`data-region-derived`); an aria-label or
 * role that the page set itself is left untouched.
 */
function setTableScrollTabstop(control, narrow) {
  if (!narrow) {
    control.removeAttribute("tabindex");
    const previouslySet = control.dataset.regionDerived ?? "";
    if (previouslySet.includes("role")) control.removeAttribute("role");
    if (previouslySet.includes("label")) control.removeAttribute("aria-label");
    delete control.dataset.regionDerived;
    return;
  }
  const alreadyNamed = control.hasAttribute("aria-label") || control.hasAttribute("aria-labelledby");
  const name = alreadyNamed ? true : derivedTableLabel(control);
  if (!name) {
    control.removeAttribute("tabindex");
    return;
  }
  const set = [];
  if (!alreadyNamed) {
    control.setAttribute("aria-label", name);
    set.push("label");
  }
  if (!control.hasAttribute("role")) {
    control.setAttribute("role", "region");
    set.push("role");
  }
  if (set.length) control.dataset.regionDerived = set.join("+");
  control.setAttribute("tabindex", "0");
}

// Browser only: in a bare Node environment document and ResizeObserver do not exist.
if (typeof document !== "undefined" && typeof ResizeObserver !== "undefined") {
  // With zoom or long page titles the toolbar can run over several lines. Measure its real
  // height, so that anchors and table headings always stay below it.
  const toolbar = document.querySelector(".app-toolbar");
  if (toolbar) {
    new ResizeObserver(() => {
      const height = toolbar.getBoundingClientRect().height;
      if (height > 0) toolbar.closest(".app-shell").style.setProperty("--headline-height", `${height}px`);
    }).observe(toolbar);
  }
  // `.table-scroll` only gets overflow-x when it has too little room (`.narrow`, see
  // studio.css), otherwise the sticky column header breaks. "Too little room" is the actual
  // width, not that of the window.
  const TABLE_SCROLL_BREAKPOINT = 900;
  const tableScrollObserver = new ResizeObserver((items) => {
    for (const item of items) {
      const narrow = item.contentRect.width <= TABLE_SCROLL_BREAKPOINT;
      item.target.classList.toggle("narrow", narrow);
      setTableScrollTabstop(item.target, narrow);
    }
  });
  // Every screen builds its tables and fields only after loading (fetch + el()). A
  // MutationObserver on <body> sees every `.table-scroll` and every label as soon as it
  // appears, and unregisters removed tables again so that nothing lingers.
  new MutationObserver((mutations) => {
    for (const m of mutations) {
      for (const node of m.addedNodes) {
        if (node.nodeType !== Node.ELEMENT_NODE) continue;
        if (node.matches(".table-scroll")) tableScrollObserver.observe(node);
        node.querySelectorAll?.(".table-scroll").forEach((e) => tableScrollObserver.observe(e));
        linkLabels(node.parentNode ?? node);
      }
      for (const node of m.removedNodes) {
        if (node.nodeType !== Node.ELEMENT_NODE) continue;
        if (node.matches(".table-scroll")) tableScrollObserver.unobserve(node);
        node.querySelectorAll?.(".table-scroll").forEach((e) => tableScrollObserver.unobserve(e));
      }
    }
  }).observe(document.body, { childList: true, subtree: true });
  document.querySelectorAll(".table-scroll").forEach((e) => tableScrollObserver.observe(e));
  linkLabels(document);
}

/** True for Ctrl+S or Cmd+S, without Shift or Alt. */
export function isSaveShortcut(e) {
  return (e.ctrlKey || e.metaKey) && !e.shiftKey && !e.altKey && e.key.toLowerCase() === "s";
}
