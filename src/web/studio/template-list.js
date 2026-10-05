// Templates: the layouts a post starts from. The nine built-in ones and the project's own, made
// from its old posts. Own templates can be renamed and deleted; new ones come from the form
// and the proposal below it.
import { confirmDialog, el, notice, textDialog } from "/ui.js";
import { allTemplates } from "/studio/templates.js";
import { observeThumbnails, templateCard } from "/studio/template-card.js";
import { createBlock } from "/studio/template-create.js";
import { proposalBlock } from "/studio/template-proposal.js";

export async function show(container, ctx) {
  let observer = null;
  const gallery = el("div");

  /** The templates changed: fetch them again, register them and draw the lists. */
  async function changed() {
    await ctx.reloadTemplates();
    await draw();
  }

  async function rename(s) {
    const name = await textDialog("Rename template", "Name", { confirmText: "Rename", maxLength: 40, value: s.name });
    if (!name) return;
    try {
      await ctx.api(`/api/templates/${s.id}`, { method: "PUT", body: { name } });
      await changed();
    } catch (e) {
      notice(e.message, "error");
    }
  }

  async function remove(id, name) {
    const ok = await confirmDialog(`"${name}" is deleted. Posts that use it have to be changed or deleted first.`, {
      title: "Delete this template?",
      confirmText: "Delete",
      dangerous: true,
    });
    if (!ok) return;
    try {
      await ctx.api(`/api/templates/${id}`, { method: "DELETE" });
      await changed();
    } catch (e) {
      notice(e.message, "error");
    }
  }

  const useLink = (s) =>
    el("a", {
      class: "button",
      href: `#editor/new/${s.id}`,
      text: `Use ${s.name}`,
      "aria-label": `New post with template ${s.name}`,
    });

  async function draw() {
    const { skipped } = await ctx.api("/api/templates");
    if (!ctx.valid()) return;
    observer?.disconnect();
    const own = allTemplates().filter((s) => s.own);
    const builtIn = allTemplates().filter((s) => !s.own);
    const ownCards = own.map((s) =>
      templateCard(s, [
        useLink(s),
        el("button", {
          type: "button",
          class: "secondary",
          text: "Rename",
          "aria-label": `Rename ${s.name}`,
          onclick: () => rename(s),
        }),
        el("button", {
          type: "button",
          class: "secondary",
          text: "Delete",
          "aria-label": `Delete ${s.name}`,
          onclick: () => remove(s.id, s.name),
        }),
      ]),
    );
    const builtInCards = builtIn.map((s) => templateCard(s, [useLink(s)]));
    gallery.replaceChildren(
      ...[
        el("h2", { class: "studio-section-title", text: "Your templates" }),
        own.length
          ? el("div", { class: "studio-gallery" }, ownCards)
          : el("p", { class: "help-text", text: "You have no templates of your own yet. Make one above." }),
        skipped.length
          ? el("div", {}, [
              el("h3", { text: "Files that could not be used" }),
              el(
                "ul",
                { class: "studio-input-list" },
                skipped.map((f) =>
                  el("li", {}, [
                    el("span", { text: `${f.file}: ${f.problem}` }),
                    el("button", {
                      type: "button",
                      class: "secondary small",
                      text: "Delete",
                      "aria-label": `Delete ${f.file}`,
                      onclick: () => remove(f.file.replace(/\.json$/, ""), f.file),
                    }),
                  ]),
                ),
              ),
            ])
          : null,
        el("h2", { class: "studio-section-title", text: "Built-in templates" }),
        el("div", { class: "studio-gallery" }, builtInCards),
      ].filter(Boolean),
    );
    observer = observeThumbnails([...ownCards, ...builtInCards], ctx.brand);
  }

  const proposal = proposalBlock(ctx, { onChange: draw });
  const create = createBlock(ctx, { onProposal: proposal.refresh, hasProposal: proposal.pending });
  container.replaceChildren(create, proposal.element, gallery);
  await draw();
  return { leave: () => observer?.disconnect() };
}
