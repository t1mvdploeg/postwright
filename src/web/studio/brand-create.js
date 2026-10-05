// "Create a brand kit": the material for a brand kit, and the two ways to turn it into a
// proposal: Generate with Claude (needs ANTHROPIC_API_KEY on the server), or a prompt to
// download for Claude Code or Codex.
import { el, notice, projectHeaders } from "/ui.js";
import { download } from "/studio/render.js";

const ROLES = [
  {
    role: "logo",
    label: "Logo (required)",
    accept: ".svg,.png,image/svg+xml,image/png",
    help: "An SVG, or a PNG with a transparent background (best on dark grounds).",
  },
  {
    role: "image",
    label: "Images (up to 8)",
    accept: "image/png,image/jpeg,image/webp",
    multiple: true,
    help: "From earlier posts, the website or the style guide. PNG, JPEG or WebP, up to 5 MB each.",
  },
  { role: "guide", label: "Brand guide (one PDF, up to 20 MB)", accept: "application/pdf,.pdf", help: "" },
  {
    role: "font",
    label: "Fonts",
    accept: ".woff2,.woff,.ttf,.otf",
    multiple: true,
    help: "Without fonts the studio uses Inter and gives it the name of the font it finds.",
  },
];

const size = (bytes) =>
  bytes >= 1048576 ? `${(bytes / 1048576).toFixed(1)} MB` : `${Math.max(1, Math.round(bytes / 1024))} kB`;

export function createBlock(ctx, { onProposal }) {
  const holder = el("section", { class: "card", id: "brand-create" });

  async function load() {
    const state = await ctx.api("/api/brand/input");
    if (ctx.valid()) render(state);
  }

  function render(state) {
    const hasLogo = state.files.some((f) => f.kind === "logo");
    const website = el("input", { type: "url", id: "brand-website", maxlength: "300", placeholder: "https://" });
    website.value = state.website;
    const notes = el("textarea", {
      id: "brand-notes",
      rows: "3",
      maxlength: "2000",
      placeholder: "For example: tone, business but warm",
    });
    notes.value = state.notes;
    const status = el("p", { role: "status", class: "help-text" });
    const failure = el("p", { class: "error-message", role: "alert", hidden: "" });
    const buttons = [];

    const saveDetails = () =>
      ctx.api("/api/brand/input", { method: "PUT", body: { website: website.value.trim(), notes: notes.value } });
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
      }
    };

    const fields = ROLES.map((r) => {
      const input = el("input", {
        type: "file",
        id: `brand-file-${r.role}`,
        accept: r.accept,
        ...(r.multiple ? { multiple: "" } : {}),
      });
      input.addEventListener("change", async () => {
        const files = [...input.files];
        await run("Uploading…", async () => {
          for (const file of files) {
            try {
              await ctx.api(`/api/brand/input/${r.role}`, { method: "POST", raw: file });
            } catch (e) {
              notice(`${file.name}: ${e.message}`, "error");
            }
          }
          await saveDetails(); // ruling Q2: keep what was typed before the list reloads
        });
        await load();
      });
      const list = el(
        "ul",
        { class: "studio-input-list" },
        state.files
          .filter((f) => f.kind === r.role)
          .map((f) =>
            el("li", {}, [
              el("span", { text: `${f.name} · ${size(f.bytes)}` }),
              el("button", {
                type: "button",
                class: "secondary small",
                text: "Remove",
                "aria-label": `Remove ${f.name}`,
                onclick: async () => {
                  await run("", async () => {
                    await saveDetails(); // ruling Q2
                    await ctx.api(`/api/brand/input/${encodeURIComponent(f.name)}`, { method: "DELETE" });
                  });
                  await load();
                },
              }),
            ]),
          ),
      );
      return el("div", { class: "field" }, [
        el("label", { for: input.id, text: r.label }),
        input,
        r.help ? el("p", { class: "help-text", text: r.help }) : null,
        list,
      ]);
    });

    const save = el("button", { type: "button", class: "secondary", text: "Save details" });
    save.addEventListener("click", () =>
      run("Saving…", async () => {
        await saveDetails();
        notice("Details saved");
      }),
    );

    const generate = el("button", { type: "button", text: "Generate with Claude" });
    generate.addEventListener("click", () =>
      run("Generating… this can take a few minutes. Keep this page open.", async () => {
        await saveDetails();
        await ctx.api("/api/brand/generate", { method: "POST", body: {} });
        notice("The brand kit proposal is ready");
        onProposal();
      }),
    );

    const prompt = el("button", { type: "button", class: "secondary", text: "Download prompt (.md)" });
    prompt.addEventListener("click", () =>
      run("", async () => {
        await saveDetails();
        const r = await fetch("/api/brand/prompt", { headers: projectHeaders() });
        if (!r.ok) throw new Error((await r.json().catch(() => null))?.error ?? "The prompt could not be made");
        const name =
          /filename="([^"]+)"/.exec(r.headers.get("content-disposition") ?? "")?.[1] ?? "brand-kit-prompt.md";
        download(await r.blob(), name, "text/markdown");
      }),
    );

    const check = el("button", { type: "button", class: "secondary", text: "Check for a proposal" });
    check.addEventListener("click", () => onProposal());

    buttons.push(save, generate, prompt);
    // Why a button is off: no logo, or no key on the server.
    if (!hasLogo)
      for (const b of [generate, prompt]) {
        b.dataset.off = "1";
        b.disabled = true;
      }
    if (!state.generate.available) {
      generate.dataset.off = "1";
      generate.disabled = true;
    }

    const why = !hasLogo
      ? "Add a logo first."
      : !state.generate.available
        ? "Generate with Claude needs ANTHROPIC_API_KEY on the server (set it and restart). Without it, download the prompt."
        : `Uses the Claude API (${state.generate.model}). A brand kit costs from a few tens of cents to about a dollar and counts towards the monthly cap.`;

    holder.replaceChildren(
      el("h2", { text: "Create a brand kit" }),
      el("p", {
        class: "help-text",
        text: "Give the studio your material and it proposes a brand kit: colours, grounds with contrast, logo variants and a font. You see the proposal before anything changes.",
      }),
      ...fields,
      el("div", { class: "field" }, [el("label", { for: "brand-website", text: "Website (optional)" }), website]),
      el("div", { class: "field" }, [el("label", { for: "brand-notes", text: "Notes (optional)" }), notes]),
      el("div", { class: "button-row" }, [generate, prompt, save]),
      el("p", { class: "help-text", text: why }),
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
