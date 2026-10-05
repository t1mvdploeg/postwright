// Marketing studio: Snippets: reusable pieces for the caption (opening lines, closers,
// hashtag sets, the fixed "about us" text). Insertable in the editor with one choice.
import { confirmDialog, el, emptyState, notice } from "/ui.js";

const KINDS = {
  opening: "Opening lines",
  closer: "Closers with a call to action",
  hashtags: "Hashtag sets",
  boilerplate: "Fixed snippets",
};

export async function show(container, ctx) {
  let { snippets } = await ctx.api("/api/snippets");
  if (!ctx.valid()) return;
  const formHolder = el("div");
  const listHolder = el("div");

  function form(existing = null) {
    const kind = el(
      "select",
      { id: "text-kind" },
      Object.entries(KINDS).map(([w, t]) =>
        el("option", { value: w, text: t, ...(existing?.kind === w ? { selected: "" } : {}) }),
      ),
    );
    const name = el("input", { type: "text", id: "text-name", maxlength: "80", value: existing?.name ?? "" });
    const text = el("textarea", { id: "text-content", rows: "4", maxlength: "3000" });
    text.value = existing?.text ?? "";
    const save = el("button", { type: "button", text: existing ? "Save changes" : "Add snippet" });
    save.addEventListener("click", async () => {
      const body = { kind: kind.value, name: name.value, text: text.value };
      save.disabled = true; // no duplicate request on a double click
      try {
        const t = existing
          ? await ctx.api(`/api/snippets/${existing.id}`, { method: "PUT", body })
          : await ctx.api("/api/snippets", { method: "POST", body });
        snippets = existing ? snippets.map((x) => (x.id === t.id ? t : x)) : [...snippets, t];
        formHolder.replaceChildren(newButton());
        renderList();
        notice("Snippet saved");
      } catch (e) {
        notice(e.message, "error");
      } finally {
        save.disabled = false;
      }
    });
    formHolder.replaceChildren(
      el("div", { class: "card studio-form" }, [
        el("h2", { text: existing ? "Edit snippet" : "New snippet" }),
        el("div", { class: "field-row" }, [
          el("div", { class: "field" }, [el("label", { for: "text-kind", text: "Kind" }), kind]),
          el("div", { class: "field" }, [el("label", { for: "text-name", text: "Name (only for yourself)" }), name]),
        ]),
        el("div", { class: "field" }, [el("label", { for: "text-content", text: "Text" }), text]),
        el("div", { class: "button-row" }, [
          save,
          el("button", {
            type: "button",
            class: "secondary",
            text: "Cancel",
            onclick: () => formHolder.replaceChildren(newButton()),
          }),
        ]),
      ]),
    );
    name.focus();
  }

  function newButton() {
    return el("div", { class: "button-row" }, [
      el("button", { type: "button", text: "New snippet", onclick: () => form() }),
      el("button", { type: "button", class: "secondary", text: "Add sample content", onclick: sampleContent }),
    ]);
  }

  /** Add sample facts, snippets and posts; whatever is already there stays. */
  async function sampleContent() {
    try {
      const r = await ctx.api("/api/sample-content", { method: "POST", body: {} });
      notice(
        r.facts || r.snippets || r.posts
          ? // The draft part only if facts were added: with 0 facts there is nothing to review.
            `${r.facts} fact${r.facts === 1 ? "" : "s"}, ${r.snippets} snippet${r.snippets === 1 ? "" : "s"} and ${r.posts} post${r.posts === 1 ? "" : "s"} added.${r.facts ? ` ${r.facts === 1 ? "The fact is" : "The facts are"} in draft: review ${r.facts === 1 ? "it" : "them"} and set ${r.facts === 1 ? "it" : "them"} to active.` : ""}`
          : "The sample content was already there",
      );
      ({ snippets } = await ctx.api("/api/snippets"));
      renderList();
    } catch (e) {
      notice(e.message, "error");
    }
  }

  function renderList() {
    if (!snippets.length) {
      const empty = emptyState(
        "No snippets yet",
        "Store fixed pieces, such as your default hashtags or a closing sentence.",
      );
      empty.append(
        el("button", { type: "button", class: "secondary", text: "Add sample content", onclick: sampleContent }),
      );
      listHolder.replaceChildren(el("div", { class: "card" }, [empty]));
      return;
    }
    listHolder.replaceChildren(
      ...Object.entries(KINDS)
        .filter(([kind]) => snippets.some((t) => t.kind === kind))
        .map(([kind, title]) => {
          const list = snippets.filter((t) => t.kind === kind);
          return el("section", { class: "card" }, [
            el("h2", { text: title }),
            ...list.map((t) =>
              el("div", { class: "studio-text-line" }, [
                el("div", {}, [el("b", { text: t.name }), el("p", { class: "studio-variant-text", text: t.text })]),
                el("div", { class: "row-actions" }, [
                  el("button", {
                    type: "button",
                    class: "secondary small",
                    text: "Edit",
                    onclick: () => form(t),
                  }),
                  el("button", {
                    type: "button",
                    class: "secondary small danger",
                    text: "Delete",
                    onclick: async () => {
                      if (
                        !(await confirmDialog(`The snippet "${t.name}" will be deleted.`, {
                          title: "Delete snippet?",
                          confirmText: "Delete",
                          dangerous: true,
                        }))
                      )
                        return;
                      try {
                        await ctx.api(`/api/snippets/${t.id}`, { method: "DELETE" });
                        snippets = snippets.filter((x) => x.id !== t.id);
                        renderList();
                      } catch (e) {
                        notice(e.message, "error");
                      }
                    },
                  }),
                ]),
              ]),
            ),
          ]);
        }),
    );
  }

  formHolder.replaceChildren(newButton());
  container.replaceChildren(formHolder, listHolder);
  renderList();
}
