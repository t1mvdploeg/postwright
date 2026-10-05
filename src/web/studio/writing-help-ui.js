// The writing help panel in the editor. The server loads the facts
// itself by id and checks every suggestion for numbers that are in no fact; such a
// suggestion cannot be adopted here with a single click. Nothing is ever saved
// automatically.
import { el, notice, projectHeaders } from "/ui.js";
import { withoutEmphasis } from "/studio/templates.js";

/**
 * The AI's mode (`{ mode: "live" | "sample", model }`), or null if the server does not
 * respond.
 */
export async function getAiMode() {
  try {
    const r = await fetch("/api/ai", { headers: projectHeaders() });
    return r.ok ? await r.json() : null;
  } catch {
    return null;
  }
}

/** The fixed bar above sample answers, and the label on each suggestion. */
export function sampleBar() {
  return el("p", {
    class: "studio-warning studio-sample-bar",
    role: "status",
    text: "No API key active. These are sample answers.",
  });
}
export function sampleLabel() {
  return el("span", { class: "studio-label", text: "Sample" });
}

const TASKS = [
  ["fields", "Headline and text of the image"],
  ["caption", "Caption for the chosen channel"],
  ["alt-text", "Alt-text"],
];

/** The content already filled in on the post, for the task: only the fields the help knows. */
function currentContent(post, fields, channel) {
  const field = Object.fromEntries(
    fields.map((v) => [v.id, String(post.content?.[v.id] ?? "")]).filter(([, t]) => t.trim()),
  );
  return { fields: field, caption: post.caption?.[channel] ?? "", altText: post.altText ?? "" };
}

export function writingHelpPanel({
  ctx,
  template,
  currentFields,
  currentPost,
  currentChannel,
  apply,
  setCaption,
  setAlt,
}) {
  const task = el(
    "select",
    { id: "help-task" },
    TASKS.map(([w, t]) => el("option", { value: w, text: t })),
  );
  const note = el("textarea", {
    id: "help-note",
    rows: "3",
    maxlength: "1000",
    placeholder: "For example: for beginners, about trying it for free.",
  });
  const ask = el("button", { type: "button", text: "Ask for three suggestions" });
  const cancel = el("button", { type: "button", class: "secondary", text: "Cancel", hidden: "" });
  const mode = el("p", { class: "help-text", role: "status", "aria-live": "polite" });
  const outcome = el("div", { class: "studio-variants" });
  const bar = el("div");
  getAiMode().then((a) => {
    if (a?.mode === "sample") bar.replaceChildren(sampleBar());
  });
  let abort = null;

  function suggestion(v, i, sample) {
    const lines = [];
    const t = task.value;
    if (t === "fields")
      for (const [id, value] of Object.entries(v.fields ?? {})) {
        const field = currentFields().find((x) => x.id === id);
        lines.push(el("p", {}, [el("b", { text: `${field?.label ?? id}: ` }), withoutEmphasis(value)]));
      }
    if (t === "caption") lines.push(el("p", { class: "studio-variant-text", text: v.caption ?? "" }));
    if (t === "alt-text") lines.push(el("p", { text: v.altText ?? "" }));
    const uncovered = v.uncovered ?? [];
    if (uncovered.length)
      lines.push(
        el("p", {
          class: "studio-warning",
          text: `Contains a number that is in no linked fact: ${uncovered.join(", ")}. Cannot be used.`,
        }),
      );
    const usage = el("button", {
      type: "button",
      class: "secondary small",
      text: "Use this",
      ...(uncovered.length ? { disabled: "" } : {}),
    });
    usage.addEventListener("click", () => {
      if (t === "fields") apply(v.fields ?? {});
      else if (t === "caption") setCaption(v.caption ?? "");
      else setAlt(v.altText ?? "");
      notice("Suggestion applied; save the post to keep it");
    });
    return el("article", { class: "studio-variant" }, [
      el("h3", {}, [`Suggestion ${i + 1} `, ...(sample ? [sampleLabel()] : [])]),
      ...lines,
      usage,
    ]);
  }

  ask.addEventListener("click", async () => {
    const post = currentPost();
    abort = new AbortController();
    ask.disabled = true;
    cancel.hidden = false;
    mode.textContent = "The writing help is thinking…";
    outcome.replaceChildren();
    try {
      const fields = currentFields()
        .filter((v) => v.kind !== "choice" && v.kind !== "media")
        .map((v) => ({
          id: v.id,
          label: v.label,
          kind: v.kind,
          max: v.max ?? null,
          emphasis: v.emphasis === "exactly-one",
        }));
      const r = await fetch("/api/writing-help", {
        method: "POST",
        signal: abort.signal,
        headers: { "content-type": "application/json", ...projectHeaders() },
        body: JSON.stringify({
          task: task.value,
          template: template.name,
          fields,
          channel: currentChannel(),
          note: note.value,
          facts: post.facts ?? [],
          current: currentContent(post, fields, currentChannel()),
        }),
      });
      const data = await r.json().catch(() => ({}));
      if (!r.ok) throw new Error(data.error ?? `The writing help gave an error (${r.status})`);
      outcome.replaceChildren(...data.variants.map((v, i) => suggestion(v, i, data.sample)));
      mode.textContent = data.variants.length
        ? `${data.variants.length} suggestions.`
        : "No usable suggestion received.";
    } catch (e) {
      mode.textContent = e.name === "AbortError" ? "Stopped." : "";
      if (e.name !== "AbortError") notice(e.message, "error");
    } finally {
      ask.disabled = false;
      cancel.hidden = true;
      abort = null;
    }
  });
  cancel.addEventListener("click", () => abort?.abort());

  const element = el("details", { class: "block studio-writing-help" }, [
    el("summary", { text: "Writing help" }),
    el("div", { class: "block-content" }, [
      el("p", {
        class: "help-text",
        text: "Suggestions only from the linked, active facts, in the tone of the site. You choose; nothing is saved automatically.",
      }),
      el("div", { class: "field" }, [el("label", { for: "help-task", text: "What should it be about" }), task]),
      el("div", { class: "field" }, [el("label", { for: "help-note", text: "Note (optional)" }), note]),
      el("div", { class: "button-row" }, [ask, cancel]),
      mode,
      bar,
      outcome,
    ]),
  ]);
  return { element };
}
