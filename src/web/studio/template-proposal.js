// The proposal of an own template as the user sees it before anything is saved: name, goal and
// notes, the sample content in every chosen format (every slide, for a carousel), what the brand
// check and the overflow measurement find, and the buttons that keep or discard it.
import { confirmDialog, el, notice } from "/ui.js";
import { buildImage, defaultContent, fieldsOf } from "/studio/templates.js";
import { compileTemplate } from "/studio/own-template.js";
import { format as formatOf } from "/studio/formats.js";
import { showPreview } from "/studio/render.js";
import { measureOverflow, removeMeasureFrames } from "/studio/overflow.js";
import { runCheck } from "/studio/brand-check.js";

/** The findings of the brand check that say something about a template (the rest is about a post). */
const CODES = ["too-long", "emphasis", "contrast", "overflow", "banned-word", "exclamation"];
const LEVEL = { error: "Problem", attention: "Look at", ok: "Fine" };

/** The sample content of a compiled proposal, as the editor would start a post. */
function sampleOf(s) {
  return s.kind === "carousel" ? { content: {}, slides: s.defaultSlides } : { content: defaultContent(s), slides: [] };
}

/** `[{ format, slide }]`: every image of the proposal. */
function imagesOf(s) {
  const slides = s.kind === "carousel" ? s.defaultSlides.map((_, i) => i) : [null];
  return s.formats.flatMap((format) => slides.map((slide) => ({ format, slide })));
}

function preview(ctx, s, { format, slide }, caption) {
  const sample = sampleOf(s);
  const image = buildImage({
    template: s,
    content: sample.content,
    slides: sample.slides,
    slide: slide ?? 0,
    format,
    brand: ctx.brand,
  });
  const box = el("div", { class: "studio-preview" });
  // The preview scales to the width of its box, so it needs to be on the page first.
  requestAnimationFrame(() => {
    const scale = showPreview(box, image, { maxHeight: 240, label: caption });
    box.style.width = `${Math.round(image.width * scale)}px`;
  });
  return el("figure", { class: "studio-file" }, [box, el("figcaption", { text: caption })]);
}

/** The findings for one proposal: brand check plus overflow, measured in the real layout. */
async function findingsOf(ctx, s) {
  const sample = sampleOf(s);
  const names = {};
  const overflow = [];
  for (const { format, slide } of imagesOf(s)) {
    const fields = s.kind === "carousel" ? fieldsOf(s, sample.slides[slide].kind) : s.fields;
    for (const v of fields) names[v.id] = `${/\d$/.test(v.label) ? "" : "the "}${v.label.toLowerCase()}`;
    try {
      const image = buildImage({
        template: s,
        content: sample.content,
        slides: sample.slides,
        slide: slide ?? 0,
        format,
        brand: ctx.brand,
      });
      overflow.push(...(await measureOverflow(image, formatOf(format), { slide, names })));
    } catch {
      /* an image that cannot be built is shown as an empty preview */
    }
  }
  removeMeasureFrames();
  const post = { template: s.id, formats: s.formats, ...sample, caption: {}, altText: "", link: "", facts: [] };
  const report = runCheck({
    post,
    template: s,
    settings: { channels: [], bannedWords: ctx.settings.bannedWords },
    facts: [],
    today: new Date().toISOString().slice(0, 10),
    brand: ctx.brand,
    overflow,
  });
  return report.findings.filter((f) => CODES.includes(f.code));
}

/** `onChange()` runs after the proposal was kept or discarded (the list of templates changed). */
export function proposalBlock(ctx, { onChange }) {
  const holder = el("section", { class: "card", id: "template-proposal", hidden: "" });
  let pending = false;

  async function discard() {
    const ok = await confirmDialog("The proposal is removed; nothing else changes.", {
      title: "Discard this proposal?",
      confirmText: "Discard",
      dangerous: true,
    });
    if (!ok) return;
    try {
      await ctx.api("/api/template-proposal", { method: "DELETE" });
      await refresh();
    } catch (e) {
      notice(e.message, "error");
    }
  }

  async function keep(thenStartPost, buttons) {
    for (const b of buttons) b.disabled = true;
    try {
      const file = await ctx.api("/api/template-proposal/apply", { method: "POST", body: {} });
      // The editor only knows a template once it is registered.
      await ctx.reloadTemplates();
      notice(`The template "${file.name}" is saved`);
      if (thenStartPost) ctx.navigate(`#editor/new/${file.id}`);
      else {
        await refresh();
        onChange();
      }
    } catch (e) {
      notice(e.message, "error");
      for (const b of buttons) b.disabled = false;
    }
  }

  async function refresh() {
    let result;
    try {
      result = await ctx.api("/api/template-proposal");
    } catch (e) {
      notice(e.message, "error");
      return;
    }
    if (!ctx.valid()) return;
    pending = result.state !== "none";
    if (result.state === "none") {
      holder.hidden = true;
      return;
    }
    holder.hidden = false;
    const discardButton = el("button", { type: "button", class: "secondary", text: "Discard" });
    discardButton.addEventListener("click", discard);
    if (result.state === "invalid") {
      holder.replaceChildren(
        el("h2", { text: "Proposal" }),
        el("p", { class: "studio-warning", text: "This proposal cannot be used:" }),
        el(
          "ul",
          { class: "studio-lines" },
          result.problems.map((p) => el("li", { text: p })),
        ),
        el("p", {
          class: "help-text",
          text: "Fix the file and check again, make a new proposal, or discard this one.",
        }),
        el("div", { class: "button-row" }, [discardButton]),
      );
      return;
    }
    let s;
    try {
      s = compileTemplate(result.template);
    } catch (e) {
      notice(e.message, "error");
      return;
    }
    const use = el("button", { type: "button", text: "Use this template" });
    const useAndStart = el("button", { type: "button", class: "secondary", text: "Use and start a post" });
    const buttons = [use, useAndStart];
    use.addEventListener("click", () => keep(false, buttons));
    useAndStart.addEventListener("click", () => keep(true, buttons));
    const findings = el("div", {}, [el("p", { class: "help-text", role: "status", text: "Checking the layout…" })]);
    const previews = imagesOf(s).map((i) => {
      const f = formatOf(i.format);
      return preview(
        ctx,
        s,
        i,
        i.slide === null
          ? f.name
          : `${f.name}, slide ${i.slide + 1} (${s.slides.find((k) => k.kind === s.defaultSlides[i.slide].kind).name})`,
      );
    });
    holder.replaceChildren(
      el("h2", { text: `Proposal: ${s.name}` }),
      result.sample ? el("span", { class: "badge badge-draft", text: "Sample, made without a model" }) : null,
      el("p", { class: "help-text", text: `${s.goal} Nothing is saved yet.` }),
      result.notes.length
        ? el("div", {}, [
            el("h3", { text: "Good to know" }),
            el(
              "ul",
              { class: "studio-lines" },
              result.notes.map((n) => el("li", { text: n })),
            ),
          ])
        : null,
      el("h3", { text: "Sample content in every format" }),
      el("div", { class: "studio-proposal-posts" }, previews),
      el("h3", { text: "Brand check" }),
      findings,
      el("div", { class: "button-row" }, [use, useAndStart, discardButton]),
    );
    findingsOf(ctx, s)
      .then((list) => {
        if (!ctx.valid() || !holder.contains(findings)) return;
        const bad = list.filter((f) => f.level !== "ok");
        findings.replaceChildren(
          bad.length
            ? el("p", { class: "studio-warning", text: "The check found something. You can still use the template." })
            : el("p", { class: "help-text", text: "Nothing to fix." }),
          el(
            "ul",
            { class: "studio-lines" },
            list.map((f) => el("li", { text: `${LEVEL[f.level]}: ${f.text}` })),
          ),
        );
      })
      .catch((e) =>
        findings.replaceChildren(el("p", { class: "studio-warning", text: `The check failed: ${e.message}` })),
      );
  }

  refresh();
  return { element: holder, refresh, pending: () => pending };
}
