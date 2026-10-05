// "Make a template": the material for an own template (screenshots of old posts, pasted texts, a
// brief, the kind and the formats), and the two ways to turn it into a proposal: Generate with
// Claude (without an API key on the server it gives a fixed sample), or a prompt to download for
// Claude Code or Codex.
import { confirmDialog, el, icon, notice, projectHeaders } from "/ui.js";
import { download } from "/studio/render.js";
import { format as formatOf } from "/studio/formats.js";
import { IMAGE_FORMATS } from "/studio/own-template.js";

const MAX_IMAGES = 6;
const EMPTY = "Add a screenshot, the text of an old post or a short brief first.";
const size = (bytes) =>
  bytes >= 1048576 ? `${(bytes / 1048576).toFixed(1)} MB` : `${Math.max(1, Math.round(bytes / 1024))} kB`;

/**
 * `onProposal()` runs when a proposal may have changed; `hasProposal()` says whether one is waiting
 * (a new one replaces it, which the user is told).
 */
export function createBlock(ctx, { onProposal, hasProposal }) {
  const holder = el("section", { class: "card", id: "template-create" });

  async function load() {
    const state = await ctx.api("/api/template-input");
    if (ctx.valid()) render(state);
  }

  function render(state) {
    const texts = el("textarea", {
      id: "template-texts",
      rows: "6",
      maxlength: "8000",
      placeholder: "Paste the text of an old post. Separate posts with a line that holds only ---",
    });
    texts.value = state.texts;
    const brief = el("textarea", {
      id: "template-brief",
      rows: "3",
      maxlength: "600",
      placeholder: "For example: short statements with one bold phrase, for customer quotes",
    });
    brief.value = state.brief;
    const kind = el("select", { id: "template-kind" }, [
      el("option", { value: "image", text: "A single image" }),
      el("option", { value: "carousel", text: "A carousel (cover, steps and closing slide)" }),
    ]);
    kind.value = state.kind;
    const formatBoxes = IMAGE_FORMATS.map((key) =>
      el("label", { class: "studio-radio" }, [
        el("input", {
          type: "checkbox",
          name: "format",
          value: key,
          ...(state.formats.includes(key) ? { checked: "" } : {}),
        }),
        formatOf(key).name,
      ]),
    );
    const formatHolder = el("fieldset", { class: "studio-choice" });
    const syncFormats = () => {
      formatHolder.replaceChildren(
        el("legend", { text: "Formats" }),
        ...(kind.value === "carousel"
          ? [
              el("p", {
                class: "help-text",
                text: `${formatOf("li-carousel").name}: a carousel always uses this one format.`,
              }),
            ]
          : [el("div", { class: "studio-choice-options columns" }, formatBoxes)]),
      );
    };
    syncFormats();
    kind.addEventListener("change", () => {
      syncFormats();
      refreshButtons();
    });

    const status = el("p", { role: "status", class: "help-text" });
    const failure = el("p", { class: "error-message", role: "alert", hidden: "" });
    const why = el("p", { class: "help-text" });
    const buttons = [];

    const details = () => ({
      texts: texts.value,
      brief: brief.value.trim(),
      kind: kind.value,
      formats:
        kind.value === "carousel"
          ? ["li-carousel"]
          : formatBoxes
              .map((b) => b.querySelector("input"))
              .filter((i) => i.checked)
              .map((i) => i.value),
    });
    const saveDetails = () => {
      const d = details();
      if (!d.formats.length) throw new Error("Choose at least one format");
      return ctx.api("/api/template-input", { method: "PUT", body: d });
    };
    const hasMaterial = () => state.images.length > 0 || texts.value.trim() !== "" || brief.value.trim() !== "";
    const busy = (on, text = "") => {
      for (const b of buttons) b.disabled = on || b.dataset.off === "1";
      status.textContent = text;
    };
    const run = async (text, work) => {
      failure.hidden = true;
      busy(true, text);
      try {
        await work();
      } catch (e) {
        failure.textContent = e.message;
        failure.hidden = false;
        notice(e.message, "error");
      } finally {
        busy(false);
        refreshButtons();
      }
    };

    const upload = el("input", {
      type: "file",
      id: "template-file",
      accept: "image/png,image/jpeg,image/webp",
      multiple: "",
    });
    const chosen = el("span", { class: "upload-name", text: "Choose screenshots" });
    upload.addEventListener("change", async () => {
      const files = [...upload.files];
      if (files.length) chosen.textContent = files.map((f) => f.name).join(", ");
      await run("Uploading…", async () => {
        for (const file of files) {
          try {
            await ctx.api("/api/template-input/image", { method: "POST", raw: file });
          } catch (e) {
            notice(`${file.name}: ${e.message}`, "error");
          }
        }
        await saveDetails().catch(() => undefined); // keep what was typed before the list reloads
      });
      await load();
    });
    const images = el(
      "ul",
      { class: "studio-input-list" },
      state.images.map((f) =>
        el("li", {}, [
          el("span", { text: `${f.name} · ${size(f.bytes)}` }),
          el("button", {
            type: "button",
            class: "secondary small",
            text: "Remove",
            "aria-label": `Remove ${f.name}`,
            onclick: async () => {
              await run("", async () => {
                await saveDetails().catch(() => undefined);
                await ctx.api(`/api/template-input/${encodeURIComponent(f.name)}`, { method: "DELETE" });
              });
              await load();
            },
          }),
        ]),
      ),
    );

    const save = el("button", { type: "button", class: "secondary", text: "Save details" });
    save.addEventListener("click", () =>
      run("Saving…", async () => {
        await saveDetails();
        notice("Details saved");
      }),
    );

    const generate = el("button", { type: "button", text: "Generate with Claude" });
    generate.addEventListener("click", async () => {
      if (
        hasProposal() &&
        !(await confirmDialog("A new proposal replaces the one you have not used yet.", {
          title: "Replace the proposal?",
          confirmText: "Replace it",
        }))
      )
        return;
      await run(
        state.generate.available ? "Generating… this can take a minute. Keep this page open." : "Making the sample…",
        async () => {
          await saveDetails();
          await ctx.api("/api/template-generate", { method: "POST", body: {} });
          notice(state.generate.available ? "The template proposal is ready" : "The sample template is ready");
          onProposal();
        },
      );
    });

    const prompt = el("button", { type: "button", class: "secondary", text: "Download prompt (.md)" });
    prompt.addEventListener("click", () =>
      run("", async () => {
        await saveDetails();
        const r = await fetch("/api/template-prompt", { headers: projectHeaders() });
        if (!r.ok) throw new Error((await r.json().catch(() => null))?.error ?? "The prompt could not be made");
        const name = /filename="([^"]+)"/.exec(r.headers.get("content-disposition") ?? "")?.[1] ?? "template-prompt.md";
        download(await r.blob(), name, "text/markdown");
      }),
    );

    const check = el("button", { type: "button", class: "secondary", text: "Check for a proposal" });
    check.addEventListener("click", () => onProposal());

    buttons.push(save, generate, prompt);
    // Why a button is off: nothing to work from yet.
    function refreshButtons() {
      const off = !hasMaterial();
      for (const b of [generate, prompt]) {
        b.dataset.off = off ? "1" : "";
        b.disabled = off;
      }
      why.textContent = off
        ? EMPTY
        : state.generate.available
          ? `Uses the Claude API (${state.generate.model}). A template costs roughly 10 to 50 cents and counts towards the monthly cap.`
          : "Generate with Claude needs ANTHROPIC_API_KEY on the server. Without it you get a fixed sample template, to try the screen; download the prompt for a real proposal.";
    }
    for (const input of [texts, brief]) input.addEventListener("input", refreshButtons);
    refreshButtons();

    const profileEmpty = !Object.values(ctx.settings.profile ?? {}).some((v) => String(v ?? "").trim());
    holder.replaceChildren(
      el("h2", { text: "Make a template" }),
      el("p", {
        class: "help-text",
        text: "Give the studio your old posts and it proposes a template in your brand: layout, fields, and sample content. You see the proposal in every format before anything is saved.",
      }),
      el("div", { class: "field" }, [
        el("label", { class: "upload" }, [
          `Screenshots of old posts (up to ${MAX_IMAGES})`,
          el("span", { class: "upload-tile" }, [upload, icon("plus"), chosen]),
        ]),
        el("p", { class: "help-text", text: "PNG, JPEG or WebP, up to 3 MB each." }),
        images,
      ]),
      el("div", { class: "field" }, [
        el("label", { for: "template-texts", text: "Texts of old posts (optional)" }),
        texts,
      ]),
      el("div", { class: "field" }, [el("label", { for: "template-brief", text: "Brief (optional)" }), brief]),
      el("div", { class: "field" }, [el("label", { for: "template-kind", text: "What kind of post" }), kind]),
      formatHolder,
      profileEmpty
        ? el("p", { class: "help-text" }, [
            "Your company profile in ",
            el("a", { href: "#settings", text: "Settings" }),
            " is empty, so the sample content will be generic.",
          ])
        : null,
      el("div", { class: "button-row" }, [generate, prompt, save]),
      why,
      el("p", {
        class: "help-text",
        text: "With the prompt: run it in Claude Code or Codex from the Postwright folder, then check for a proposal here (or reload the page).",
      }),
      el("div", { class: "button-row" }, [check]),
      status,
      failure,
    );
  }

  load().catch((e) => notice(e.message, "error"));
  return holder;
}
