// Settings: which channels and formats are on, the UTM default, the list
// of banned words, default hashtags, the AI help (writing help and ideas) with its mode and
// monthly cap, and the management of uploaded images.
import { confirmDialog, el, notice } from "/ui.js";
import { FORMATS, CHANNELS } from "/studio/formats.js";
import { getAiMode } from "/studio/writing-help-ui.js";
import { loadMedia } from "/studio/brand.js";

export async function show(container, ctx) {
  const [i, { media: mediaList }, ai] = await Promise.all([ctx.reloadSettings(), ctx.api("/api/media"), getAiMode()]);
  if (!ctx.valid()) return;
  let media = mediaList;
  // An <img src> sends no project header, so the thumbnails are fetched and shown as data URIs.
  const thumbs = await loadMedia(
    media.map((m) => m.id),
    160,
  );
  if (!ctx.valid()) return;

  const channels = Object.entries(CHANNELS).map(([k, name]) =>
    el("label", { class: "studio-radio" }, [
      el("input", { type: "checkbox", name: "channel", value: k, ...(i.channels.includes(k) ? { checked: "" } : {}) }),
      el("span", { text: name }),
    ]),
  );
  const formats = FORMATS.map((f) =>
    el("label", { class: "studio-radio" }, [
      el("input", {
        type: "checkbox",
        name: "format",
        value: f.key,
        ...(i.formats.includes(f.key) ? { checked: "" } : {}),
      }),
      el("span", { text: `${f.name} (${f.width}×${f.height})` }),
    ]),
  );
  const medium = el("input", { type: "text", id: "utm-medium", value: i.utm.medium, maxlength: "50" });
  const sources = Object.entries(CHANNELS).map(([k, name]) =>
    el("div", { class: "field" }, [
      el("label", { for: `utm-source-${k}`, text: `utm_source for ${name}` }),
      el("input", { type: "text", id: `utm-source-${k}`, value: i.utm.source?.[k] ?? k, maxlength: "50" }),
    ]),
  );
  const tone = el("textarea", { id: "tone", rows: "3", maxlength: "1500" });
  tone.value = i.tone ?? "";
  const profile = i.profile ?? {};
  const profileInput = (id, label, max, rows, help) => {
    const input = el(rows ? "textarea" : "input", {
      id: `profile-${id}`,
      maxlength: String(max),
      ...(rows ? { rows } : { type: "text" }),
    });
    input.value = profile[id] ?? "";
    return el("div", { class: "field" }, [
      el("label", { for: `profile-${id}`, text: label }),
      input,
      help ? el("p", { class: "help-text", text: help }) : null,
    ]);
  };
  const profileFields = [
    profileInput("description", "What the company does", 600, "3"),
    profileInput("sector", "Sector", 100, null, "For example: staffing, fashion retail, accounting."),
    profileInput("offer", "Products and services", 600, "3"),
    profileInput("audience", "Who the customers are", 400, "2"),
    profileInput("region", "Where it works", 200),
    profileInput("website", "Website", 200),
  ];
  const banned = el("textarea", { id: "banned-words", rows: "6" });
  banned.value = i.bannedWords.join("\n");
  const hashtags = el("input", {
    type: "text",
    id: "default-hashtags",
    value: i.defaultHashtags,
    maxlength: "300",
  });
  const helpEnabled = el("input", {
    type: "checkbox",
    id: "writing-help-enabled",
    ...(i.writingHelp.enabled ? { checked: "" } : {}),
  });
  const cap = el("input", {
    type: "number",
    id: "writing-help-cap",
    min: "0",
    max: "1000",
    step: "0.5",
    value: String(i.writingHelp.capUsdPerMonth),
  });
  const save = el("button", { type: "button", text: "Save settings" });

  save.addEventListener("click", async () => {
    const body = {
      channels: [...container.querySelectorAll('input[name="channel"]:checked')].map((x) => x.value),
      formats: [...container.querySelectorAll('input[name="format"]:checked')].map((x) => x.value),
      utm: {
        medium: medium.value.trim(),
        source: Object.fromEntries(
          Object.keys(CHANNELS)
            .map((k) => [k, container.querySelector(`#utm-source-${k}`).value.trim()])
            .filter(([, v]) => v),
        ),
      },
      tone: tone.value.trim(),
      profile: Object.fromEntries(
        ["description", "sector", "offer", "audience", "region", "website"].map((k) => [
          k,
          container.querySelector(`#profile-${k}`).value.trim(),
        ]),
      ),
      bannedWords: banned.value
        .split("\n")
        .map((w) => w.trim())
        .filter(Boolean),
      defaultHashtags: hashtags.value.trim(),
      writingHelp: { enabled: helpEnabled.checked, capUsdPerMonth: Number(cap.value) || 0 },
    };
    save.disabled = true; // no duplicate request on a double click
    try {
      await ctx.api("/api/settings", { method: "PUT", body });
      await ctx.reloadSettings();
      notice("Settings saved");
    } catch (e) {
      notice(e.message, "error");
    } finally {
      save.disabled = false;
    }
  });

  const mediaHolder = el("div");
  function renderMedia() {
    if (!media.length) {
      mediaHolder.replaceChildren(el("p", { class: "help-text", text: "No uploaded images yet." }));
      return;
    }
    mediaHolder.replaceChildren(
      el("div", { class: "table-scroll" }, [
        el("table", { class: "list" }, [
          el("thead", {}, [
            el(
              "tr",
              {},
              ["Image", "Size", "Used in", ""].map((t) => el("th", { scope: "col", text: t })),
            ),
          ]),
          el(
            "tbody",
            {},
            media.map((m) =>
              el("tr", {}, [
                el("td", {}, [
                  el("img", {
                    class: "studio-media-mini",
                    src: thumbs[m.id] ?? "",
                    alt: "",
                    loading: "lazy",
                  }),
                ]),
                el("td", {
                  text: `${m.width ?? "?"}×${m.height ?? "?"} px · ${(m.bytes / 1048576).toFixed(1)} MB`,
                }),
                el("td", {
                  text: m.used > 0 ? `${m.used} post${m.used === 1 ? "" : "s"}` : "Not used",
                }),
                el("td", {}, [
                  el("button", {
                    type: "button",
                    class: "secondary small danger",
                    text: "Delete",
                    "aria-label": `Delete image ${m.id}`,
                    ...(m.used > 0 ? { disabled: "", title: "In use; remove it from the post first" } : {}),
                    onclick: async () => {
                      if (
                        !(await confirmDialog("This image will be deleted permanently.", {
                          title: "Delete image?",
                          confirmText: "Delete",
                          dangerous: true,
                        }))
                      )
                        return;
                      try {
                        await ctx.api(`/api/media/${encodeURIComponent(m.id)}`, { method: "DELETE" });
                        media = media.filter((x) => x.id !== m.id);
                        renderMedia();
                        notice("Image deleted");
                      } catch (e) {
                        notice(e.message, "error");
                      }
                    },
                  }),
                ]),
              ]),
            ),
          ),
        ]),
      ]),
    );
  }
  renderMedia();

  /** One row of the settings sheet: the title and a line on the left, the fields on the right. */
  const row = (title, line, children) =>
    el("section", {}, [
      el("div", { class: "sheet-label" }, [el("h2", { text: title }), line ? el("p", { text: line }) : null]),
      ...children.filter(Boolean),
    ]);

  container.replaceChildren(
    el("div", { class: "sheet" }, [
      row("Channels and formats", "Which channels get a caption, and the formats a new post starts with.", [
        el("fieldset", { class: "studio-choice" }, [
          el("legend", { text: "Channels with a caption" }),
          el("div", { class: "studio-choice-options" }, channels),
        ]),
        el("fieldset", { class: "studio-choice" }, [
          el("legend", { text: "Formats a new post gets by default" }),
          el("div", { class: "studio-choice-options columns" }, formats),
        ]),
      ]),
      row(
        "Links (UTM)",
        "Every link the studio inserts gets utm_source, utm_medium, utm_campaign (from the campaign) and utm_content (the post id).",
        [
          el("div", { class: "field" }, [el("label", { for: "utm-medium", text: "utm_medium" }), medium]),
          el("div", { class: "field-row" }, sources),
        ],
      ),
      row(
        "Company profile",
        "The planner and writing help use this to suggest posts that fit your business. It is background only: numbers still come from your facts.",
        profileFields,
      ),
      row("Tone and words", "A little guidance for every caption, and the words the brand check watches for.", [
        el("div", { class: "field" }, [
          el("label", { for: "tone", text: "Tone of voice" }),
          tone,
          el("p", {
            class: "help-text",
            text: "A few sentences. A brand kit you create fills this in; nothing reads it automatically yet.",
          }),
        ]),
        el("div", { class: "field" }, [
          el("label", { for: "banned-words", text: "Banned words, one per line" }),
          banned,
          el("p", {
            class: "help-text",
            text: "Promises the tool cannot keep. The brand check reports them as attention points.",
          }),
        ]),
        el("div", { class: "field" }, [el("label", { for: "default-hashtags", text: "Default hashtags" }), hashtags]),
      ]),
      row(
        "Writing assistance",
        "Suggests text from linked facts, and ideas for a period in the planner. Real answers cost API money; usage is in ai-usage.jsonl in the data folder. One monthly cap for both.",
        [
          el("p", {
            role: "status",
            class: "studio-mode",
            text:
              ai?.mode === "live"
                ? `Real answers from ${ai.model}`
                : ai?.mode === "sample"
                  ? "Sample mode"
                  : "Mode cannot be determined",
          }),
          ai?.mode === "sample"
            ? el("p", { class: "help-text", text: "Set ANTHROPIC_API_KEY and restart to get real suggestions." })
            : null,
          el("label", { class: "studio-radio" }, [helpEnabled, el("span", { text: "AI help on" })]),
          el("div", { class: "field studio-narrow-field" }, [
            el("label", { for: "writing-help-cap", text: "Monthly cap in dollars (real answers only)" }),
            cap,
          ]),
        ],
      ),
    ]),
    el("div", { class: "button-row studio-sheet-actions" }, [save]),
    el("div", { class: "sheet" }, [
      row(
        "Uploaded images",
        "An image that is still in a post (archived too) cannot be deleted here; remove it from there first.",
        [mediaHolder],
      ),
    ]),
  );
}
