// The input fields of a template (or slide kind) as a form. Every field
// gets a fixed id (`field-<id>`), so that the brand check can set focus on it with one
// click.
import { el } from "/ui.js";
import { emphasiseSelection } from "/studio/templates.js";

/** A counter "12 / 90" that turns red above the maximum. */
function counter(field, input) {
  const t = el("span", { class: "studio-counter", "aria-live": "off" });
  const set = () => {
    const n = input.value.length;
    t.textContent = field.max ? `${n} / ${field.max}` : `${n}`;
    t.classList.toggle("too-many", Boolean(field.max && n > field.max));
  };
  set();
  input.addEventListener("input", set);
  return t;
}

/**
 * Builds the fields. `values` is the current content, `change(id, value)` is called on
 * every input. `media` is the list of uploaded images for a media field, `onUpload` opens
 * the upload.
 */
export function buildFields(fields, values, { change, media = [], onUpload }) {
  return fields.map((v) => {
    const id = `field-${v.id}`;
    const value = values[v.id] ?? v.defaultValue ?? "";
    const helpId = v.help ? `${id}-help` : null;
    const help = v.help ? el("p", { id: helpId, class: "help-text", text: v.help }) : null;

    if (v.kind === "choice") {
      if (v.options.length <= 4) {
        const name = `choice-${v.id}-${Math.random().toString(36).slice(2, 7)}`;
        return el("fieldset", { class: "studio-choice", id }, [
          el("legend", { text: v.label }),
          el(
            "div",
            { class: "studio-choice-options" },
            v.options.map((o) => {
              const radio = el("input", {
                type: "radio",
                name: name,
                value: o.value,
                ...(o.value === value ? { checked: "" } : {}),
              });
              radio.addEventListener("change", () => {
                if (radio.checked) change(v.id, o.value);
              });
              return el("label", { class: "studio-radio" }, [radio, el("span", { text: o.text })]);
            }),
          ),
          help,
        ]);
      }
      const select = el(
        "select",
        { id },
        v.options.map((o) =>
          el("option", { value: o.value, text: o.text, ...(o.value === value ? { selected: "" } : {}) }),
        ),
      );
      select.addEventListener("change", () => change(v.id, select.value));
      return el("div", { class: "field" }, [el("label", { for: id, text: v.label }), select, help]);
    }

    if (v.kind === "media") {
      const select = el("select", { id, ...(helpId ? { "aria-describedby": helpId } : {}) }, [
        el("option", { value: "", text: "No image chosen" }),
        ...media.map((m) =>
          el("option", {
            value: m.id,
            text: `${m.width ?? "?"}×${m.height ?? "?"} · ${Math.round(m.bytes / 1024)} kB · ${m.id.slice(0, 8)}`,
            ...(m.id === value ? { selected: "" } : {}),
          }),
        ),
      ]);
      select.addEventListener("change", () => change(v.id, select.value));
      const button = el("button", {
        type: "button",
        class: "secondary small",
        text: "New screenshot…",
        onclick: () => onUpload?.(v.id),
      });
      return el("div", { class: "field" }, [
        el("label", { for: id, text: v.label }),
        el("div", { class: "studio-media-row" }, [select, button]),
        help,
      ]);
    }

    const moreLines = v.kind === "headline" || v.kind === "text";
    const input = moreLines
      ? el("textarea", {
          id,
          rows: v.kind === "headline" ? "2" : "3",
          ...(helpId ? { "aria-describedby": helpId } : {}),
        })
      : el("input", { id, type: "text", ...(helpId ? { "aria-describedby": helpId } : {}) });
    input.value = value;
    input.addEventListener("input", () => change(v.id, input.value));
    const headline = el("div", { class: "studio-field-headline" }, [
      el("label", { for: id, text: `${v.label}${v.required ? "" : " (optional)"}` }),
      counter(v, input),
    ]);
    const children = [headline, input, help];
    if (v.emphasis === "exactly-one") {
      // The emphasis button puts asterisks around the selection: faster than typing, and without
      // typos.
      const button = el("button", {
        type: "button",
        class: "secondary small studio-emphasis-button",
        text: "Selection as emphasis",
      });
      button.addEventListener("click", () => {
        const result = emphasiseSelection(input.value, input.selectionStart, input.selectionEnd);
        input.focus();
        if (!result) return;
        input.value = result.text;
        input.setSelectionRange(result.begin, result.end);
        input.dispatchEvent(new Event("input"));
      });
      children.push(el("div", { class: "studio-emphasis" }, [button]));
    }
    return el("div", { class: "field" }, children);
  });
}
