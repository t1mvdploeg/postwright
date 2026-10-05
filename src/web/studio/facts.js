// Fact bank: the claims and numbers that may be used in marketing, each
// with a source and validity. A new fact starts as a draft; only when the user has
// reviewed it and sets it to "active" does it count in the numbers check.
import { confirmDialog, el, emptyState, notice } from "/ui.js";
import { getNumbers } from "/studio/numbers.js";
import { factUsable } from "/studio/brand-check.js";
import { localToday } from "/studio/recipe.js";

const KINDS = { product: "Product", company: "Company", external: "External" };
const SOURCES = { site: "Own site or document", external: "External source (https)" };
export const STATUSES = { draft: "Draft", active: "Active", withdrawn: "Withdrawn" };

export async function show(container, ctx) {
  let [{ facts }, { posts }] = await Promise.all([ctx.api("/api/facts"), ctx.api("/api/posts")]);
  if (!ctx.valid()) return;
  const today = localToday();
  const usage = (id) => posts.filter((p) => p.facts.includes(id) && p.status !== "archived").length;

  const filterKind = el("select", { id: "fact-filter-kind" }, [
    el("option", { value: "", text: "All kinds" }),
    ...Object.entries(KINDS).map(([w, t]) => el("option", { value: w, text: t })),
  ]);
  const filterStatus = el("select", { id: "fact-filter-status" }, [
    el("option", { value: "", text: "All statuses" }),
    ...Object.entries(STATUSES).map(([w, t]) => el("option", { value: w, text: t })),
    el("option", { value: "expired", text: "Expired" }),
  ]);
  const search = el("input", { type: "search", id: "fact-search-list", placeholder: "Search the facts" });
  const listHolder = el("div");
  const formHolder = el("div");

  function form(existing = null) {
    const f = existing ?? {
      text: "",
      kind: "product",
      source: { kind: "site", reference: "" },
      validFrom: null,
      validUntil: null,
      status: "draft",
    };
    const text = el("textarea", { id: "fact-text", rows: "2", maxlength: "500" });
    text.value = f.text;
    const kind = el(
      "select",
      { id: "fact-kind" },
      Object.entries(KINDS).map(([w, t]) =>
        el("option", { value: w, text: t, ...(w === f.kind ? { selected: "" } : {}) }),
      ),
    );
    const sourceKind = el(
      "select",
      { id: "fact-source-kind" },
      Object.entries(SOURCES).map(([w, t]) =>
        el("option", { value: w, text: t, ...(w === f.source.kind ? { selected: "" } : {}) }),
      ),
    );
    const reference = el("input", {
      type: "text",
      id: "fact-reference",
      maxlength: "300",
      value: f.source.reference,
      placeholder: "README.md, section Features",
    });
    const from = el("input", { type: "date", id: "fact-from", value: f.validFrom ?? "" });
    const to = el("input", { type: "date", id: "fact-to", value: f.validUntil ?? "" });
    const status = el(
      "select",
      { id: "fact-status" },
      Object.entries(STATUSES).map(([w, t]) =>
        el("option", { value: w, text: t, ...(w === f.status ? { selected: "" } : {}) }),
      ),
    );
    const numbers = el("p", { class: "help-text", "aria-live": "polite" });
    const setNumbers = () => {
      const g = getNumbers(text.value);
      numbers.textContent = g.length
        ? `This fact covers: ${g.map((x) => x.text).join(", ")}`
        : "No numbers in this fact.";
    };
    text.addEventListener("input", setNumbers);
    setNumbers();
    const helpSource = el("p", { class: "help-text", text: "An external source is an https address." });
    const save = el("button", { type: "button", text: existing ? "Save changes" : "Add fact" });
    const cancel = el("button", { type: "button", class: "secondary", text: "Cancel" });
    cancel.addEventListener("click", () => formHolder.replaceChildren(newButton()));
    save.addEventListener("click", async () => {
      const body = {
        text: text.value,
        kind: kind.value,
        source: { kind: sourceKind.value, reference: reference.value },
        validFrom: from.value || null,
        validUntil: to.value || null,
        status: status.value,
      };
      save.disabled = true; // no duplicate request on a double click
      try {
        const off = existing
          ? await ctx.api(`/api/facts/${existing.id}`, { method: "PUT", body })
          : await ctx.api("/api/facts", { method: "POST", body });
        facts = existing ? facts.map((x) => (x.id === off.id ? off : x)) : [...facts, off];
        formHolder.replaceChildren(newButton());
        renderList();
        notice("Fact saved");
      } catch (e) {
        notice(e.message, "error");
      } finally {
        save.disabled = false;
      }
    });
    formHolder.replaceChildren(
      el("div", { class: "card studio-form" }, [
        el("h2", { text: existing ? "Edit fact" : "New fact" }),
        el("div", { class: "field" }, [
          el("label", { for: "fact-text", text: "The fact, as it may appear in marketing" }),
          text,
          numbers,
        ]),
        el("div", { class: "field-row" }, [
          el("div", { class: "field" }, [el("label", { for: "fact-kind", text: "Kind" }), kind]),
          el("div", { class: "field" }, [el("label", { for: "fact-status", text: "Status" }), status]),
          el("div", { class: "field" }, [el("label", { for: "fact-from", text: "Valid from" }), from]),
          el("div", { class: "field" }, [el("label", { for: "fact-to", text: "Valid until (inclusive)" }), to]),
        ]),
        el("div", { class: "field-row" }, [
          el("div", { class: "field" }, [el("label", { for: "fact-source-kind", text: "Source kind" }), sourceKind]),
          el("div", { class: "field" }, [el("label", { for: "fact-reference", text: "Source" }), reference]),
        ]),
        helpSource,
        el("div", { class: "button-row" }, [save, cancel]),
      ]),
    );
    text.focus();
  }

  function newButton() {
    return el("div", { class: "button-row" }, [
      el("button", { type: "button", text: "New fact", onclick: () => form() }),
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
      ({ facts } = await ctx.api("/api/facts"));
      renderList();
    } catch (e) {
      notice(e.message, "error");
    }
  }

  function renderList() {
    const q = search.value.trim().toLowerCase();
    const list = facts.filter((f) => {
      if (filterKind.value && f.kind !== filterKind.value) return false;
      const expired = f.validUntil && f.validUntil < today;
      if (filterStatus.value === "expired" ? !expired : filterStatus.value && f.status !== filterStatus.value)
        return false;
      return !q || f.text.toLowerCase().includes(q) || f.source.reference.toLowerCase().includes(q);
    });
    if (!facts.length) {
      const empty = emptyState(
        "No facts yet",
        "A fact is a claim or number that may appear in a post, with a source. Add sample content to see how it works.",
      );
      empty.append(
        el("button", { type: "button", class: "secondary", text: "Add sample content", onclick: sampleContent }),
      );
      listHolder.replaceChildren(empty);
      return;
    }
    listHolder.replaceChildren(
      el("div", { class: "table-scroll" }, [
        el("table", { class: "list" }, [
          el("thead", {}, [
            el(
              "tr",
              {},
              ["Fact", "Kind", "Source", "Valid until", "Status", "In posts", ""].map((t) =>
                el("th", { scope: "col", text: t }),
              ),
            ),
          ]),
          el(
            "tbody",
            {},
            list.map((f) => {
              const usable = factUsable(f, today);
              const expired = f.validUntil && f.validUntil < today;
              const source =
                f.source.kind === "external"
                  ? el("a", {
                      href: f.source.reference,
                      target: "_blank",
                      rel: "noopener noreferrer",
                      text: f.source.reference,
                    })
                  : f.source.reference;
              return el("tr", {}, [
                el("td", { text: f.text }),
                el("td", { text: KINDS[f.kind] }),
                el("td", {}, [source]),
                el("td", { text: f.validUntil ?? "–" }),
                el("td", {}, [
                  el("span", {
                    class: `badge ${usable ? "badge-approved" : "badge-warning"}`,
                    text: expired && f.status === "active" ? "Expired" : STATUSES[f.status],
                  }),
                ]),
                el("td", { text: String(usage(f.id)) }),
                el("td", {}, [
                  el("div", { class: "row-actions" }, [
                    el("button", {
                      type: "button",
                      class: "secondary small",
                      text: "Edit",
                      onclick: () => form(f),
                    }),
                    el("button", {
                      type: "button",
                      class: "secondary small danger",
                      text: "Delete",
                      onclick: async () => {
                        if (
                          !(await confirmDialog(`The fact "${f.text}" will be deleted.`, {
                            title: "Delete fact?",
                            confirmText: "Delete",
                            dangerous: true,
                          }))
                        )
                          return;
                        try {
                          await ctx.api(`/api/facts/${f.id}`, { method: "DELETE" });
                          facts = facts.filter((x) => x.id !== f.id);
                          renderList();
                        } catch (e) {
                          notice(e.message, "error");
                        }
                      },
                    }),
                  ]),
                ]),
              ]);
            }),
          ),
        ]),
      ]),
    );
  }

  for (const f of [filterKind, filterStatus]) f.addEventListener("change", renderList);
  search.addEventListener("input", renderList);
  formHolder.replaceChildren(newButton());
  container.replaceChildren(
    el("section", { class: "page-intro" }, [
      el("div", {}, [
        el("p", { class: "intro-label", text: "No claim without a source" }),
        el("p", {
          text: 'Every number in a post must appear in a linked, active fact. An expired or withdrawn fact blocks scheduling. The check does not recognise numbers written as words ("eight percent"); so read it through yourself as well.',
        }),
      ]),
    ]),
    formHolder,
    el("div", { class: "card" }, [
      el("div", { class: "studio-filters" }, [
        el("div", { class: "field" }, [el("label", { for: "fact-filter-kind", text: "Kind" }), filterKind]),
        el("div", { class: "field" }, [el("label", { for: "fact-filter-status", text: "Status" }), filterStatus]),
        el("div", { class: "field" }, [el("label", { for: "fact-search-list", text: "Search" }), search]),
      ]),
      listHolder,
    ]),
  );
  renderList();
}
