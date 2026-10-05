// The editor screen: the template gallery and the editor. On the left
// the fields, in the middle the preview per format, on the right the brand check, the
// caption and the status. On Save the recipe goes to the server, together with the outcome
// of the check over exactly that content.
import { confirmDialog, debounce, el, emptyState, notice, fieldError } from "/ui.js";
import {
  TEMPLATES,
  buildImage,
  template as templateOf,
  defaultContent,
  fieldsOf,
  withoutEmphasis,
} from "/studio/templates.js";
import { CHANNELS, format as formatOf } from "/studio/formats.js";
import { showPreview } from "/studio/render.js";
import { measureOverflow, removeMeasureFrames } from "/studio/overflow.js";
import { runCheck } from "/studio/brand-check.js";
import { CHANNEL_RULES, lengthFor, splitAtFold, addUtm } from "/studio/caption.js";
import { loadMedia } from "/studio/brand.js";
import { buildFields } from "/studio/fields-ui.js";
import { exportPdf, exportPng, exportZip } from "/studio/export-ui.js";
import {
  readableMoment,
  withOffset,
  toInput,
  toLocal,
  newRecipe,
  localToday,
  moveSlide,
  convert,
} from "/studio/recipe.js";
import { writingHelpPanel } from "/studio/writing-help-ui.js";
import { KINDS as SNIPPET_KINDS } from "/studio/snippets.js";
import { STATUSES as FACT_STATUSES } from "/studio/facts.js";

const STATUS_LABELS = {
  draft: "Draft",
  scheduled: "Scheduled",
  published: "Published",
  archived: "Archived",
};

export async function show(container, ctx) {
  const [first, second] = ctx.share;
  if (!first) return showGallery(container, ctx);
  if (first === "new") {
    if (!templateOf(second)) {
      ctx.navigate("#editor");
      return undefined;
    }
    return showEditor(container, ctx, {
      ...newRecipe(second, { enabledFormats: ctx.settings.formats, brandVersion: ctx.brand.version }),
      status: "draft",
    });
  }
  const post = await ctx.api(`/api/posts/${encodeURIComponent(first)}`);
  if (!ctx.valid()) return undefined;
  return showEditor(container, ctx, post);
}

// ---------------------------------------------------------------------------------------------
// Gallery
// ---------------------------------------------------------------------------------------------

function showGallery(container, ctx) {
  ctx.setTitle("Editor");
  const cards = TEMPLATES.map((s) => {
    const f = s.formats[0];
    const holder = el("div", { class: "studio-thumbnail", "aria-hidden": "true" });
    const card = el("article", { class: "studio-template-card" }, [
      holder,
      el("div", { class: "studio-template-card-text" }, [
        el("h2", { text: s.name }),
        el("p", { text: s.goal }),
        el("p", { class: "studio-format-list", text: s.formats.map((x) => formatOf(x).name).join(" · ") }),
      ]),
      el("a", {
        class: "button",
        href: `#editor/new/${s.id}`,
        text: `Use ${s.name}`,
        "aria-label": `New post with template ${s.name}`,
      }),
    ]);
    // Render thumbnails only when they come into view: twelve full images at once is heavy.
    card.dataset.template = s.id;
    card.dataset.format = f;
    return card;
  });
  container.replaceChildren(
    el("section", { class: "page-intro" }, [
      el("div", {}, [
        el("p", { class: "intro-label", text: "Choose a template" }),
        el("p", {
          text: "Every template comes from the brand kit. You fill in the text; layout, colours and logo follow the brand. You open an existing post from the Library.",
        }),
      ]),
    ]),
    el("div", { class: "studio-gallery" }, cards),
  );
  const observer = new IntersectionObserver(
    (lines) => {
      for (const r of lines) {
        if (!r.isIntersecting) continue;
        observer.unobserve(r.target);
        const s = templateOf(r.target.dataset.template);
        const image = buildImage({
          template: s.id,
          content: defaultContent(s),
          format: r.target.dataset.format,
          brand: ctx.brand,
        });
        showPreview(r.target.querySelector(".studio-thumbnail"), image, { maxHeight: 220 });
      }
    },
    { rootMargin: "200px" },
  );
  for (const k of cards) observer.observe(k);
  return { leave: () => observer.disconnect() };
}

// ---------------------------------------------------------------------------------------------
// Editor
// ---------------------------------------------------------------------------------------------

async function showEditor(container, ctx, begin) {
  const s = templateOf(begin.template);
  if (!s) throw new Error(`This recipe uses an unknown template (${begin.template})`);
  const state = {
    post: structuredClone(begin),
    format: begin.formats[0],
    view: "image",
    slide: 0,
    overflow: [],
    report: { findings: [], errors: 0, attention: 0 },
    // A new post that nobody has touched is nothing to lose.
    unsaved: false,
    titleManual: Boolean(begin.id),
    channel: ctx.settings.channels[0] ?? "linkedin",
    media: {},
    facts: null,
    campaigns: [],
    snippets: [],
    mediaList: [],
    measurement: Promise.resolve(),
    busy: false,
  };
  ctx.setTitle(begin.id ? begin.title : `New: ${s.name}`);

  // Sources the editor needs alongside the post; none of them is indispensable.
  const [facts, campaigns, snippets, mediaList] = await Promise.all([
    ctx
      .api("/api/facts")
      .then((r) => r.facts)
      .catch(() => null),
    ctx
      .api("/api/campaigns")
      .then((r) => r.campaigns)
      .catch(() => []),
    ctx
      .api("/api/snippets")
      .then((r) => r.snippets)
      .catch(() => []),
    ctx
      .api("/api/media")
      .then((r) => r.media)
      .catch(() => []),
  ]);
  if (!ctx.valid()) return undefined;
  Object.assign(state, { facts, campaigns, snippets, mediaList });

  const slides = () => state.post.slides ?? [];
  const currentContent = () => (s.kind === "carousel" ? (slides()[state.slide]?.content ?? {}) : state.post.content);
  const currentFields = () => (s.kind === "carousel" ? fieldsOf(s, slides()[state.slide]?.kind) : s.fields);
  const campaignName = () => state.campaigns.find((c) => c.id === state.post.campaign)?.utmCampaign ?? "";

  // ---------------- build ----------------
  const saveButton = el("button", { type: "button", text: "Save" });
  const saveStatus = el("span", { class: "studio-save-status", role: "status" });
  const exportStatus = el("p", { class: "help-text studio-export-status", role: "status", "aria-live": "polite" });
  const fieldsHolder = el("div", { class: "studio-fields" });
  const slideHolder = el("div", { class: "studio-slides" });
  const formatTabs = el("div", { class: "studio-tabs", role: "tablist", "aria-label": "Preview format" });
  const preview = el("div", { class: "studio-preview" });
  const zoneLayer = el("div", { class: "studio-zones", "aria-hidden": "true" });
  const previewFrame = el("div", { class: "studio-preview-frame" }, [preview, zoneLayer]);
  const slideNav = el("div", { class: "studio-slide-nav" });
  const checkList = el("ul", { class: "studio-check", "aria-label": "Brand check result" });
  const checkHeadline = el("h2", { text: "Brand check" });
  const captionHolder = el("div", { class: "studio-caption" });
  const statusHolder = el("div", { class: "studio-status" });
  const showZones = el("input", { type: "checkbox", id: "studio-show-zones" });
  const zoneToggle = el("label", { class: "studio-radio studio-zone-toggle" }, [
    showZones,
    el("span", { text: "Show safe zones" }),
  ]);
  const imageButton = el("button", { type: "button", class: "secondary", "aria-pressed": "true", text: "Image" });
  const feedButton = el("button", { type: "button", class: "secondary", "aria-pressed": "false", text: "In the feed" });
  const viewGroup = el("div", { class: "studio-view", role: "group", "aria-label": "Preview view" }, [
    imageButton,
    feedButton,
  ]);
  const feedHolder = el("div", { class: "studio-feed-holder" });

  const titleField = el("input", { id: "field-title", type: "text", maxlength: "120", value: state.post.title });
  titleField.addEventListener("input", () => {
    state.post.title = titleField.value;
    state.titleManual = true;
    changed(false);
  });

  const formatChoice = el("fieldset", { class: "studio-choice", id: "field-formats" }, [
    el("legend", { text: "Formats" }),
    el(
      "div",
      { class: "studio-choice-options" },
      s.formats.map((f) => {
        const control = el("input", {
          type: "checkbox",
          value: f,
          ...(state.post.formats.includes(f) ? { checked: "" } : {}),
        });
        control.addEventListener("change", () => {
          const chosen = new Set(state.post.formats);
          if (control.checked) chosen.add(f);
          else chosen.delete(f);
          state.post.formats = s.formats.filter((x) => chosen.has(x));
          if (!state.post.formats.includes(state.format)) state.format = state.post.formats[0] ?? s.formats[0];
          renderTabs();
          changed();
        });
        const off = !ctx.settings.formats.includes(f);
        return el("label", { class: "studio-radio" }, [
          control,
          el("span", { text: `${formatOf(f).name}${off ? " (off in Settings)" : ""}` }),
        ]);
      }),
    ),
  ]);

  const campaignChoice = el("select", { id: "field-campaign" }, [
    el("option", { value: "", text: "No campaign" }),
    ...state.campaigns
      .filter((c) => !c.archived || c.id === state.post.campaign)
      .map((c) =>
        el("option", { value: c.id, text: c.name, ...(c.id === state.post.campaign ? { selected: "" } : {}) }),
      ),
  ]);
  campaignChoice.addEventListener("change", () => {
    state.post.campaign = campaignChoice.value || null;
    changed(false);
  });

  const factsHolder = el("div", { class: "studio-fact-picker", id: "field-facts" });

  const linkField = el("input", {
    id: "field-link",
    type: "url",
    value: state.post.link ?? "",
    placeholder: ctx.brand.url,
  });
  linkField.addEventListener("input", () => {
    state.post.link = linkField.value;
    changed(false);
  });
  const altField = el("textarea", { id: "field-altText", rows: "3", maxlength: "1500" });
  altField.value = state.post.altText ?? "";
  altField.addEventListener("input", () => {
    state.post.altText = altField.value;
    changed(false);
  });
  const altFromImage = el("button", {
    type: "button",
    class: "secondary small",
    text: "Copy the text from the image",
  });
  altFromImage.addEventListener("click", () => {
    const i = s.kind === "carousel" ? (slides()[0]?.content ?? {}) : state.post.content;
    altField.value = [s.name, withoutEmphasis(i.headline ?? ""), withoutEmphasis(i.text ?? "")]
      .filter(Boolean)
      .join(". ")
      .replace(/\.\./g, ".");
    altField.dispatchEvent(new Event("input"));
  });

  const helpPanel = ctx.settings.writingHelp?.enabled
    ? writingHelpPanel({
        ctx,
        template: s,
        currentFields: () => currentFields(),
        currentPost: () => state.post,
        currentChannel: () => state.channel,
        apply: (fields) => {
          const goal = currentContent();
          for (const [k, v] of Object.entries(fields))
            if (k in goal || currentFields().some((x) => x.id === k)) goal[k] = v;
          renderFields();
          changed();
        },
        setCaption: (text) => {
          state.post.caption = { ...state.post.caption, [state.channel]: text };
          renderCaption();
          changed(false);
        },
        setAlt: (text) => {
          altField.value = text;
          altField.dispatchEvent(new Event("input"));
        },
      })
    : null;

  const exportButtons = el("div", { class: "button-row studio-export-buttons" }, [
    el("button", {
      type: "button",
      class: "secondary",
      text: s.kind === "carousel" ? "This slide as PNG" : "This format as PNG",
      onclick: () => exportAs("png"),
    }),
    el("button", { type: "button", class: "secondary", text: "Everything as ZIP", onclick: () => exportAs("zip") }),
    s.kind === "carousel"
      ? el("button", { type: "button", class: "secondary", text: "PDF for LinkedIn", onclick: () => exportAs("pdf") })
      : null,
  ]);

  const leftColumn = el("section", { class: "studio-column card", "aria-label": "Content" }, [
    el("div", { class: "field" }, [el("label", { for: "field-title", text: "Title (studio only)" }), titleField]),
    s.kind === "carousel" ? slideHolder : null,
    fieldsHolder,
    helpPanel?.element ?? null,
    formatChoice,
    el("div", { class: "field" }, [el("label", { for: "field-campaign", text: "Campaign" }), campaignChoice]),
    factsHolder,
  ]);
  const centerColumn = el("section", { class: "studio-column studio-center", "aria-label": "Preview" }, [
    viewGroup,
    formatTabs,
    previewFrame,
    feedHolder,
    slideNav,
    zoneToggle,
    exportButtons,
    exportStatus,
  ]);
  const rightColumn = el("section", { class: "studio-column", "aria-label": "Check, text and status" }, [
    el("div", { class: "card" }, [checkHeadline, checkList]),
    el("div", { class: "card" }, [
      el("h2", { text: "Caption" }),
      captionHolder,
      el("div", { class: "field" }, [
        el("label", { for: "field-link", text: "Link for the post" }),
        linkField,
        el("p", { class: "help-text", text: "With Insert link, it ends up in the caption with UTM." }),
      ]),
      el("div", { class: "field" }, [
        el("label", { for: "field-altText", text: "Alt text of the image" }),
        altField,
        altFromImage,
      ]),
    ]),
    el("div", { class: "card" }, [el("h2", { text: "Status" }), statusHolder]),
  ]);

  container.replaceChildren(
    el("div", { class: "studio-editor-bar" }, [
      el("a", { href: "#library", class: "studio-back", text: "← Library" }),
      saveStatus,
      saveButton,
    ]),
    el("div", { class: "studio-editor" }, [leftColumn, centerColumn, rightColumn]),
  );
  showZones.addEventListener("change", () => {
    zoneLayer.hidden = !showZones.checked;
    renderZones();
  });
  zoneLayer.hidden = true;
  feedHolder.hidden = true;
  imageButton.addEventListener("click", () => setView("image"));
  feedButton.addEventListener("click", () => setView("feed"));
  saveButton.addEventListener("click", () => {
    void save();
  });

  // ---------------- render ----------------
  function renderFields() {
    fieldsHolder.replaceChildren(
      ...buildFields(currentFields(), currentContent(), {
        media: state.mediaList,
        change: (id, value) => {
          // Always the content of right now: after Save or a status change, the server's response
          // replaces state.post, and an object held on to here would then be read by nobody
          // (otherwise everything was silently lost after the first save).
          currentContent()[id] = value;
          // An illustration change or media choice changes which fields matter; rebuild.
          if (!state.titleManual && id === "headline" && (s.kind !== "carousel" || state.slide === 0)) {
            state.post.title = withoutEmphasis(value).trim().slice(0, 120);
            titleField.value = state.post.title;
          }
          // A different image chosen: load it as a data URI first, otherwise the preview renders the
          // empty spot.
          if (currentFields().find((v) => v.id === id)?.kind === "media") {
            void loadImages().then(() => {
              if (ctx.valid()) {
                renderPreview();
                measure();
              }
            });
          }
          changed();
        },
        onUpload: (fieldId) => {
          void upload(fieldId);
        },
      }),
    );
  }

  function renderSlides() {
    if (s.kind !== "carousel") return;
    const list = el(
      "ol",
      { class: "studio-slide-list", "aria-label": "Slides" },
      slides().map((d, i) => {
        const kind = s.slides.find((x) => x.kind === d.kind);
        const name = `${kind?.name ?? d.kind}${d.content?.headline ? `: ${withoutEmphasis(d.content.headline)}` : ""}`;
        const choose = el("button", {
          type: "button",
          class: `button-plain studio-slide${i === state.slide ? " active" : ""}`,
          "aria-current": i === state.slide ? "true" : "false",
          title: name,
          text: `${i + 1}. ${name}`,
        });
        choose.addEventListener("click", () => {
          state.slide = i;
          renderAll();
        });
        return el("li", {}, [choose]);
      }),
    );
    // The actions apply to the chosen slide; four buttons per row do not fit in a narrow
    // column.
    const i = state.slide;
    const button = (text, action, off = false) =>
      el("button", {
        type: "button",
        class: "secondary small",
        text: text,
        ...(off ? { disabled: "" } : {}),
        onclick: action,
      });
    const actions = el("div", { class: "studio-slide-actions", role: "group", "aria-label": `Slide ${i + 1}` }, [
      button(
        "↑ Up",
        () => {
          state.slide = moveSlide(slides(), i, -1);
          renderAll();
          changed();
        },
        i === 0,
      ),
      button(
        "↓ Down",
        () => {
          state.slide = moveSlide(slides(), i, 1);
          renderAll();
          changed();
        },
        i === slides().length - 1,
      ),
      button(
        "Duplicate",
        () => {
          slides().splice(i + 1, 0, structuredClone(slides()[i]));
          state.slide = i + 1;
          renderAll();
          changed();
        },
        slides().length >= (s.maxSlides ?? 20),
      ),
      button(
        "Delete",
        () => {
          slides().splice(i, 1);
          state.slide = Math.min(state.slide, slides().length - 1);
          renderAll();
          changed();
        },
        slides().length <= 1,
      ),
    ]);
    const kindChoice = el(
      "select",
      { id: "new-slide", "aria-label": "Kind of new slide" },
      s.slides.map((d) => el("option", { value: d.kind, text: d.name })),
    );
    const add = el("button", {
      type: "button",
      class: "secondary small",
      text: "Add slide",
      ...(slides().length >= (s.maxSlides ?? 20) ? { disabled: "" } : {}),
    });
    add.addEventListener("click", () => {
      const kind = kindChoice.value;
      const position = kind === "slot" ? slides().length : Math.min(state.slide + 1, slides().length);
      slides().splice(position, 0, { kind, content: defaultContent(s, kind) });
      state.slide = position;
      renderAll();
      changed();
    });
    slideHolder.replaceChildren(
      el("h2", { text: "Slides" }),
      list,
      actions,
      el("div", { class: "studio-slide-add" }, [kindChoice, add]),
    );
  }

  function renderTabs() {
    const formats = state.post.formats.length ? state.post.formats : [s.formats[0]];
    formatTabs.replaceChildren(
      ...formats.map((f, i) => {
        const active = f === state.format;
        const tab = el("button", {
          type: "button",
          role: "tab",
          id: `tab-${f}`,
          class: `studio-tab${active ? " active" : ""}`,
          "aria-selected": String(active),
          tabindex: active ? "0" : "-1",
          text: formatOf(f).name,
        });
        tab.addEventListener("click", () => {
          state.format = f;
          renderTabs();
          renderPreview();
        });
        tab.addEventListener("keydown", (e) => {
          if (e.key !== "ArrowRight" && e.key !== "ArrowLeft") return;
          e.preventDefault();
          const next = formats[(i + (e.key === "ArrowRight" ? 1 : formats.length - 1)) % formats.length];
          state.format = next;
          renderTabs();
          renderPreview();
          formatTabs.querySelector(`#tab-${next}`)?.focus();
        });
        return tab;
      }),
    );
  }

  function currentImage() {
    return buildImage({
      template: s.id,
      content: state.post.content,
      slides: state.post.slides,
      slide: state.slide,
      format: state.format,
      brand: ctx.brand,
      media: state.media,
    });
  }

  function renderPreview() {
    if (state.view === "feed") {
      renderFeed();
      return;
    }
    let image;
    try {
      image = currentImage();
    } catch (e) {
      notice(e.message, "error");
      return;
    }
    const i = currentContent();
    const label = `Preview ${formatOf(state.format).name}${s.kind === "carousel" ? `, slide ${state.slide + 1}` : ""}: ${[withoutEmphasis(i.headline ?? ""), withoutEmphasis(i.text ?? "")].filter(Boolean).join(" ")}`;
    showPreview(preview, image, { maxHeight: 560, label });
    renderZones();
    if (s.kind === "carousel") {
      slideNav.replaceChildren(
        el("button", {
          type: "button",
          class: "secondary small",
          text: "← Previous slide",
          ...(state.slide === 0 ? { disabled: "" } : {}),
          onclick: () => {
            state.slide -= 1;
            renderAll();
          },
        }),
        el("span", { text: `Slide ${state.slide + 1} of ${slides().length}` }),
        el("button", {
          type: "button",
          class: "secondary small",
          text: "Next slide →",
          ...(state.slide >= slides().length - 1 ? { disabled: "" } : {}),
          onclick: () => {
            state.slide += 1;
            renderAll();
          },
        }),
      );
    }
  }

  // "Feed preview": an approximation of the post as it appears in a timeline, with the
  // caption of the chosen channel up to the fold. No platform logos or house style.
  function renderFeed() {
    const channel = state.channel;
    const { above, below } = splitAtFold(channel, state.post.caption?.[channel] ?? "");
    const imageHolder = el("div", { class: "studio-preview studio-feed-image" });
    feedHolder.replaceChildren(
      el(
        "article",
        {
          class: "studio-feed",
          "aria-label": `Approximate view of the post in the timeline of ${CHANNEL_RULES[channel].name}`,
        },
        [
          el("header", { class: "studio-feed-headline" }, [
            el("img", { src: ctx.brand.logos.mark, alt: "" }),
            el("div", {}, [el("b", { text: ctx.brand.name }), el("span", { text: "just now" })]),
          ]),
          el("p", { class: "studio-feed-text" }, [
            above.trimEnd() || "(No caption for this channel yet.)",
            below ? el("span", { class: "studio-feed-more", text: " … more" }) : null,
          ]),
          imageHolder,
          s.kind === "carousel"
            ? el("p", { class: "studio-feed-below", text: `Document · ${slides().length} pages` })
            : null,
        ],
      ),
      el("p", { class: "help-text", text: "Approximation: every platform shows it slightly differently." }),
    );
    const f = state.post.formats.find((x) => formatOf(x).channel === channel) ?? state.format;
    try {
      showPreview(
        imageHolder,
        buildImage({
          template: s.id,
          content: state.post.content,
          slides: state.post.slides,
          slide: 0,
          format: f,
          brand: ctx.brand,
          media: state.media,
        }),
        { maxHeight: 640 },
      );
    } catch (e) {
      notice(e.message, "error");
    }
  }

  function setView(w) {
    state.view = w;
    imageButton.setAttribute("aria-pressed", String(w === "image"));
    feedButton.setAttribute("aria-pressed", String(w === "feed"));
    formatTabs.hidden = w === "feed";
    previewFrame.hidden = w === "feed";
    slideNav.hidden = w === "feed";
    zoneToggle.hidden = w === "feed";
    feedHolder.hidden = w !== "feed";
    renderPreview();
  }

  function renderZones() {
    if (zoneLayer.hidden) return;
    const f = formatOf(state.format);
    const scale = Number(preview.style.getPropertyValue("--scale")) || 1;
    zoneLayer.style.width = `${f.width * scale}px`;
    zoneLayer.style.height = `${f.height * scale}px`;
    zoneLayer.replaceChildren(
      ...f.safeZones.map((z) =>
        el("span", {
          class: "studio-zone",
          style: `left:${z.x * scale}px;top:${z.y * scale}px;width:${z.width * scale}px;height:${z.height * scale}px`,
          title: z.reason,
        }),
      ),
    );
    if (!f.safeZones.length)
      zoneLayer.replaceChildren(el("span", { class: "studio-zone-none", text: "This format has no safe zones" }));
  }

  function currentCheck() {
    state.report = runCheck({
      post: state.post,
      template: s,
      settings: ctx.settings,
      facts: state.facts,
      today: localToday(),
      brandVersion: ctx.brand.version,
      brand: ctx.brand,
      overflow: state.overflow,
    });
    return state.report;
  }

  function renderCheck() {
    const u = currentCheck();
    checkHeadline.textContent = u.errors
      ? `Brand check: ${u.errors} error${u.errors === 1 ? "" : "s"}`
      : u.attention
        ? `Brand check: ${u.attention} to watch`
        : "Brand check: OK";
    const line = (b) => {
      const render = b.level === "error" ? "Error" : b.level === "attention" ? "Attention" : "OK";
      const text = el("span", { text: b.text });
      const content = [el("b", { class: `studio-level level-${b.level}`, text: render }), text];
      if (b.field || b.channel) {
        const go = el("button", {
          type: "button",
          class: "button-plain studio-go-to",
          text: "Go to",
          "aria-label": `Go to: ${b.text}`,
        });
        go.addEventListener("click", () => goTo(b));
        content.push(go);
      }
      return el("li", { class: `level-${b.level}` }, content);
    };
    // What is in order is collapsed: the panel is about what still has to happen.
    const open = u.findings.filter((b) => b.level !== "ok");
    const ok = u.findings.filter((b) => b.level === "ok");
    checkList.replaceChildren(
      ...open.map(line),
      ...(ok.length
        ? [
            el("li", { class: "studio-check-ok" }, [
              el("details", {}, [
                el("summary", { text: `${ok.length} item${ok.length === 1 ? "" : "s"} OK` }),
                el("ul", { class: "studio-check" }, ok.map(line)),
              ]),
            ]),
          ]
        : []),
    );
  }

  function goTo(b) {
    if (b.channel) {
      state.channel = b.channel;
      renderCaption();
      renderStatus({ keep: true });
      feedRetry();
      captionHolder.querySelector("textarea")?.focus();
      return;
    }
    if (b.slide !== null && b.slide !== undefined && b.slide !== state.slide) {
      state.slide = b.slide;
      renderAll();
    }
    const goal = document.getElementById(`field-${b.field}`);
    (goal?.matches("fieldset") ? goal.querySelector("input") : goal)?.focus();
  }

  function renderFacts() {
    if (state.facts === null) {
      factsHolder.replaceChildren(el("p", { class: "help-text", text: "The fact bank could not be loaded." }));
      return;
    }
    const search = el("input", {
      type: "search",
      id: "fact-search",
      placeholder: "Search for a fact",
      "aria-label": "Search for a fact",
    });
    const list = el("div", { class: "studio-fact-list" });
    const today = localToday();
    const fill = () => {
      const q = search.value.trim().toLowerCase();
      const visible = state.facts.filter(
        (f) => state.post.facts.includes(f.id) || !q || f.text.toLowerCase().includes(q),
      );
      list.replaceChildren(
        ...visible.slice(0, 40).map((f) => {
          const control = el("input", {
            type: "checkbox",
            value: f.id,
            ...(state.post.facts.includes(f.id) ? { checked: "" } : {}),
          });
          control.addEventListener("change", () => {
            state.post.facts = control.checked
              ? [...new Set([...state.post.facts, f.id])]
              : state.post.facts.filter((x) => x !== f.id);
            changed(false);
          });
          const expired = f.validUntil && f.validUntil < today;
          const mode = f.status !== "active" ? FACT_STATUSES[f.status] : expired ? "Expired" : "";
          return el("label", { class: "studio-radio" }, [
            control,
            el("span", { text: f.text }),
            mode ? el("span", { class: "badge badge-warning", text: mode }) : null,
          ]);
        }),
      );
      if (!state.facts.length)
        list.replaceChildren(
          el("p", { class: "help-text" }, [
            "No facts yet. Without an active fact the brand check rejects every number and the post cannot be scheduled. Open the ",
            el("a", { href: "#facts", text: "Fact bank" }),
            ", add the sample content and set the facts to active.",
          ]),
        );
      else if (!state.facts.some((f) => f.status === "active"))
        list.prepend(
          el("p", { class: "studio-warning" }, [
            "There is no active fact yet: the brand check rejects every number. Review the draft facts in the ",
            el("a", { href: "#facts", text: "Fact bank" }),
            " and set them to active.",
          ]),
        );
    };
    search.addEventListener("input", fill);
    fill();
    factsHolder.replaceChildren(
      el("div", { class: "studio-field-headline" }, [
        el("span", { class: "label", text: "Facts for this post" }),
        el("a", { href: "#facts", text: "Fact bank" }),
      ]),
      el("p", {
        class: "help-text",
        text: "Every number in the image or caption must appear in a linked, active fact.",
      }),
      search,
      list,
    );
  }

  function renderCaption() {
    const channels = ctx.settings.channels.length ? ctx.settings.channels : ["linkedin"];
    if (!channels.includes(state.channel)) state.channel = channels[0];
    const channel = state.channel;
    const lines = CHANNEL_RULES[channel];
    const tabs = el(
      "div",
      { class: "studio-tabs", role: "tablist", "aria-label": "Channel" },
      channels.map((k) => {
        const t = el("button", {
          type: "button",
          role: "tab",
          class: `studio-tab${k === channel ? " active" : ""}`,
          "aria-selected": String(k === channel),
          text: CHANNELS[k],
        });
        t.addEventListener("click", () => {
          state.channel = k;
          renderCaption();
          renderStatus({ keep: true });
          feedRetry();
        });
        return t;
      }),
    );
    const field = el("textarea", { id: "field-caption", rows: "8", "aria-label": `Caption for ${lines.name}` });
    field.value = state.post.caption?.[channel] ?? "";
    const counter = el("p", { class: "studio-counter" });
    const fold = el("p", { class: "help-text studio-fold" });
    const set = () => {
      const n = lengthFor(channel, field.value);
      counter.textContent = `${n} / ${lines.maxCharacters} characters${channel === "x" ? " (a link counts as 23)" : ""}`;
      counter.classList.toggle("too-many", n > lines.maxCharacters);
      const { above, below } = splitAtFold(channel, field.value);
      fold.textContent = lines.fold && below ? `Visible before "show more" (approximately): "${above.trim()}…"` : "";
    };
    field.addEventListener("input", () => {
      state.post.caption = { ...state.post.caption, [channel]: field.value };
      set();
      changed(false);
      feedRetry();
    });
    set();
    const insert = (text) => {
      const { selectionStart: a, selectionEnd: b, value } = field;
      const before = value.slice(0, a);
      const separator = before && !/\s$/.test(before) ? "\n\n" : "";
      field.value = `${before}${separator}${text}${value.slice(b)}`;
      field.dispatchEvent(new Event("input"));
      field.focus();
    };
    const linkButton = el("button", { type: "button", class: "secondary small", text: "Insert link" });
    linkButton.addEventListener("click", () => {
      const link = addUtm(state.post.link, {
        source: ctx.settings.utm.source?.[channel] ?? channel,
        medium: ctx.settings.utm.medium,
        campaign: campaignName(),
        content: state.post.id ?? "",
      });
      if (!link) {
        fieldError(linkField, "First enter a link that starts with https://.");
        linkField.focus();
        return;
      }
      fieldError(linkField, "");
      insert(link);
    });
    const tagButton = el("button", { type: "button", class: "secondary small", text: "Default hashtags" });
    tagButton.addEventListener("click", () => insert(ctx.settings.defaultHashtags));
    const fromBank = el("select", { "aria-label": "Insert text from the snippet bank" }, [
      el("option", { value: "", text: "From the snippet bank…" }),
      ...state.snippets.map((t) =>
        el("option", { value: t.id, text: `${SNIPPET_KINDS[t.kind] ?? t.kind}: ${t.name}` }),
      ),
    ]);
    fromBank.addEventListener("change", () => {
      const t = state.snippets.find((x) => x.id === fromBank.value);
      if (t) insert(t.text);
      fromBank.value = "";
    });
    const copyButton = el("button", { type: "button", class: "secondary small", text: "Copy text" });
    copyButton.addEventListener("click", async () => {
      try {
        await navigator.clipboard.writeText(field.value);
        notice("Caption copied");
      } catch {
        field.select();
        notice("Copying failed; the text is selected", "error");
      }
    });
    captionHolder.replaceChildren(
      tabs,
      field,
      counter,
      fold,
      el("div", { class: "button-row" }, [linkButton, tagButton, fromBank, copyButton]),
    );
  }

  /** "Convert": a new draft post in a different template; the original stays. */
  function convertField() {
    const choice = el(
      "select",
      { id: "field-convert" },
      TEMPLATES.filter((x) => x.id !== s.id).map((x) => el("option", { value: x.id, text: x.name })),
    );
    const button = el("button", { type: "button", class: "secondary", text: "Convert" });
    button.addEventListener("click", async () => {
      try {
        const goal = templateOf(choice.value);
        const created = await ctx.api("/api/posts", {
          method: "POST",
          body: toInput(
            convert(state.post, goal.id, { enabledFormats: ctx.settings.formats, brandVersion: ctx.brand.version }),
            goal,
            null,
          ),
        });
        notice(`New post as ${goal.name} created; the original is unchanged`);
        ctx.navigate(`#editor/${created.id}`);
      } catch (e) {
        notice(e.message, "error");
      }
    });
    return el("div", { class: "field" }, [
      el("label", { for: "field-convert", text: "Convert to another template" }),
      el("div", { class: "studio-media-row" }, [choice, button]),
    ]);
  }

  /** "Results": only for a published post, each field empty or a whole number ≥ 0. */
  function resultField(p) {
    const impressions = el("input", { type: "number", id: "field-result-impressions", min: "0", step: "1" });
    const comments = el("input", { type: "number", id: "field-result-comments", min: "0", step: "1" });
    const clicks = el("input", { type: "number", id: "field-result-clicks", min: "0", step: "1" });
    const fill = (field, w) => {
      if (typeof w === "number") field.value = String(w);
    };
    fill(impressions, p.result?.impressions);
    fill(comments, p.result?.comments);
    fill(clicks, p.result?.clicks);
    const saveResultButton = el("button", { type: "button", text: "Save result" });
    saveResultButton.addEventListener("click", async () => {
      const number = (field) => (field.value.trim() === "" ? null : Number(field.value));
      const values = { impressions: number(impressions), comments: number(comments), clicks: number(clicks) };
      for (const [field, w] of [
        [impressions, values.impressions],
        [comments, values.comments],
        [clicks, values.clicks],
      ]) {
        if (w !== null && (!Number.isInteger(w) || w < 0)) {
          fieldError(field, "A whole number of 0 or more.");
          field.focus();
          return;
        }
        fieldError(field, "");
      }
      // As with a status change, save the unsaved content first: the response below replaces
      // state.post with the server copy and would otherwise silently discard that content. The
      // figures were already read above, so the status panel being rebuilt by that save does not
      // affect them.
      if (state.unsaved && !(await save())) return;
      try {
        const p2 = await ctx.api(`/api/posts/${state.post.id}/result`, { method: "PUT", body: values });
        state.post = { ...state.post, ...p2 };
        renderStatus();
        renderSaveStatus();
        notice("Result saved");
      } catch (e) {
        notice(e.message, "error");
      }
    });
    return el("fieldset", { class: "studio-choice", id: "field-result" }, [
      el("legend", { text: "Result" }),
      el("div", { class: "field-row" }, [
        el("div", { class: "field" }, [
          el("label", { for: "field-result-impressions", text: "Impressions" }),
          impressions,
        ]),
        el("div", { class: "field" }, [el("label", { for: "field-result-comments", text: "Comments" }), comments]),
        el("div", { class: "field" }, [el("label", { for: "field-result-clicks", text: "Clicks" }), clicks]),
      ]),
      p.result ? el("p", { class: "help-text", text: `Updated on ${readableMoment(p.result.on)}` }) : null,
      saveResultButton,
    ]);
  }

  /**
   * Rebuild the status panel. With `keep` (a channel change: only the texts under "Ready to
   * post" change) whatever was already typed stays, such as a schedule date, the post's link
   * or the result figures, and "Ready to post" stays open if it was open. After a status
   * change or save it does not: then the panel belongs to the post's new state.
   */
  function renderStatus({ keep = false } = {}) {
    const typed = keep ? [...statusHolder.querySelectorAll("input[id], select[id]")].map((x) => [x.id, x.value]) : [];
    const doneOpen = keep && Boolean(statusHolder.querySelector("details.studio-done")?.open);
    buildStatus();
    for (const [id, value] of typed) {
      const x = statusHolder.querySelector(`#${CSS.escape(id)}`);
      if (x) x.value = value;
    }
    const doneSection = statusHolder.querySelector("details.studio-done");
    if (doneOpen && doneSection) doneSection.open = true;
  }

  function buildStatus() {
    const p = state.post;
    const lines = [
      el("p", {}, [
        el("span", {
          class: `badge studio-badge-${p.status ?? "draft"}`,
          text: STATUS_LABELS[p.status ?? "draft"],
        }),
      ]),
    ];
    if (!p.id) {
      lines.push(el("p", { class: "help-text", text: "Not saved yet. Save the post so you can schedule it." }));
      statusHolder.replaceChildren(...lines, el("div", { class: "studio-status-actions" }, [convertField()]));
      return;
    }
    if (p.status === "scheduled") lines.push(el("p", { text: `Scheduled: ${readableMoment(p.scheduled)}` }));
    if (p.status === "published") {
      lines.push(
        el("p", {}, [
          `Published: ${readableMoment(p.published?.on)}`,
          p.published?.url
            ? el("a", {
                href: p.published.url,
                target: "_blank",
                rel: "noopener noreferrer",
                text: " · view the post",
              })
            : null,
        ]),
      );
      lines.push(resultField(p));
    }
    const actions = [convertField()];
    if (p.status === "draft" || p.status === "scheduled") {
      const moment = el("input", {
        type: "datetime-local",
        id: "field-scheduled",
        value: p.scheduled ? toLocal(p.scheduled) : "",
      });
      const plan = el("button", { type: "button", text: p.status === "scheduled" ? "Reschedule" : "Schedule" });
      plan.addEventListener("click", async () => {
        const iso = withOffset(moment.value);
        if (!iso) {
          fieldError(moment, "Choose a date and time.");
          moment.focus();
          return;
        }
        fieldError(moment, "");
        await setStatus({ target: "scheduled", scheduled: iso });
      });
      actions.push(
        el("div", { class: "field" }, [
          el("label", { for: "field-scheduled", text: "Date and time of posting" }),
          moment,
        ]),
        plan,
      );
    }
    if (p.status === "scheduled" || p.status === "draft") {
      const r = CHANNEL_RULES[state.channel];
      const url = el("input", { type: "url", id: "field-publication-url", placeholder: "https://…" });
      const pub = el("button", { type: "button", class: "secondary", text: "Mark as published" });
      pub.addEventListener("click", () =>
        setStatus({ target: "published", ...(url.value.trim() ? { url: url.value.trim() } : {}) }),
      );
      actions.push(
        el("details", { class: "block studio-done" }, [
          el("summary", { text: "Ready to post" }),
          el("div", { class: "block-content" }, [
            el("ol", { class: "studio-checklist" }, [
              el("li", {}, [
                el("button", {
                  type: "button",
                  class: "secondary small",
                  text: "Download the images (ZIP)",
                  onclick: () => exportAs("zip"),
                }),
              ]),
              el("li", {}, [
                el("button", {
                  type: "button",
                  class: "secondary small",
                  text: `Copy the caption for ${r.name}`,
                  onclick: async () => {
                    try {
                      await navigator.clipboard.writeText(state.post.caption?.[state.channel] ?? "");
                      notice("Caption copied");
                    } catch {
                      notice("Copying failed", "error");
                    }
                  },
                }),
              ]),
              el("li", {}, [
                el("a", { href: r.place, target: "_blank", rel: "noopener noreferrer", text: `Open ${r.name}` }),
              ]),
              el("li", {}, [
                el("label", { for: "field-publication-url", text: "Paste the link to the post (optional)" }),
                url,
                pub,
              ]),
            ]),
          ]),
        ]),
      );
    }
    if (p.status !== "draft")
      actions.push(
        el("button", {
          type: "button",
          class: "secondary",
          text: "Back to draft",
          onclick: () => setStatus({ target: "draft" }),
        }),
      );
    if (p.status !== "archived")
      actions.push(
        el("button", {
          type: "button",
          class: "secondary",
          text: "Archive",
          onclick: () => setStatus({ target: "archived" }),
        }),
      );
    actions.push(
      el("button", { type: "button", class: "secondary", text: "Duplicate", onclick: duplicate }),
      el("button", { type: "button", class: "secondary danger", text: "Delete", onclick: erase }),
    );
    statusHolder.replaceChildren(...lines, el("div", { class: "studio-status-actions" }, actions));
  }

  function renderSaveStatus() {
    saveStatus.textContent = state.unsaved
      ? "Not saved"
      : !state.post.id
        ? "Not saved yet"
        : `Saved at ${new Date(state.post.updated).toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit" })}`;
    saveStatus.classList.toggle("unsaved", state.unsaved);
  }

  function renderAll() {
    renderSlides();
    renderFields();
    renderTabs();
    renderPreview();
    renderCheck();
  }

  // ---------------- behaviour ----------------
  const measure = debounce(() => {
    state.measurement = measureAll();
  }, 500);
  const renderDeferred = debounce(() => {
    renderPreview();
    renderCheck();
    renderSlides();
  }, 120);
  const feedRetry = debounce(() => {
    if (state.view === "feed") renderFeed();
  }, 150);

  async function measureAll() {
    const list = s.kind === "carousel" ? slides().map((_, i) => i) : [0];
    const names = {};
    const off = [];
    for (const f of state.post.formats) {
      for (const slide of list) {
        const fields = s.kind === "carousel" ? fieldsOf(s, slides()[slide]?.kind) : s.fields;
        for (const v of fields) names[v.id] = `the ${v.label.toLowerCase()}`;
        try {
          const image = buildImage({
            template: s.id,
            content: state.post.content,
            slides: state.post.slides,
            slide,
            format: f,
            brand: ctx.brand,
            media: state.media,
          });
          off.push(
            ...(await measureOverflow(image, formatOf(f), { slide: s.kind === "carousel" ? slide : null, names })),
          );
        } catch {
          /* an image that cannot be built is already reported by renderPreview */
        }
      }
    }
    if (!ctx.valid()) return;
    state.overflow = off;
    renderCheck();
  }

  function changed(image = true) {
    state.unsaved = true;
    renderSaveStatus();
    if (image) {
      renderDeferred();
      measure();
    } else renderCheck();
  }

  async function loadImages() {
    const ids = [state.post.content ?? {}, ...slides().map((d) => d.content ?? {})].flatMap((i) => Object.values(i));
    state.media = { ...state.media, ...(await loadMedia(ids)) };
  }

  async function upload(fieldId) {
    const file = el("input", { type: "file", accept: "image/png,image/jpeg,image/webp" });
    file.addEventListener("change", async () => {
      const f = file.files?.[0];
      if (!f) return;
      try {
        const r = await fetch("/api/media", {
          method: "POST",
          headers: { "content-type": f.type || "application/octet-stream" },
          body: f,
        });
        const data = await r.json().catch(() => ({}));
        if (!r.ok) throw new Error(data.error ?? `Upload failed (${r.status})`);
        state.mediaList = [data, ...state.mediaList.filter((m) => m.id !== data.id)];
        currentContent()[fieldId] = data.id;
        await loadImages();
        renderFields();
        changed();
        notice("Image uploaded");
      } catch (e) {
        notice(e.message, "error");
      }
    });
    file.click();
  }

  async function save() {
    if (state.busy) return false;
    if (state.post.link && !addUtm(state.post.link, {})) {
      fieldError(linkField, "A link must start with https://.");
      linkField.focus();
      return false;
    }
    fieldError(linkField, "");
    state.busy = true;
    saveButton.disabled = true;
    try {
      // The check has to cover the latest content, including the overflow measurement.
      await measureAll();
      const u = currentCheck();
      const input = toInput(state.post, s, { errors: u.errors, attention: u.attention, on: new Date().toISOString() });
      const isNew = !state.post.id;
      const previousStatus = state.post.status;
      const response = isNew
        ? await ctx.api("/api/posts", { method: "POST", body: input })
        : await ctx.api(`/api/posts/${state.post.id}`, {
            method: "PUT",
            body: { ...input, version: state.post.version },
          });
      if (!ctx.valid()) return false;
      // The server sets utm_content to the post's own id; for a new post or a link inserted
      // before the first save, the returned text then differs from what was here.
      const differentText = JSON.stringify(response.caption ?? {}) !== JSON.stringify(input.caption);
      state.post = { ...state.post, ...response };
      state.unsaved = false;
      state.titleManual = true;
      if (isNew) ctx.replaceAddress(`#editor/${response.id}`);
      ctx.setTitle(response.title);
      renderSaveStatus();
      renderStatus();
      // The feed too: it shows the same caption (outside feed mode feedRetry does nothing).
      if (differentText) {
        renderCaption();
        feedRetry();
      }
      if (response.status === "draft" && previousStatus === "scheduled")
        notice("The post is back to draft: the check still found an error", "error");
      else notice("Saved");
      return true;
    } catch (e) {
      notice(e.message, "error");
      return false;
    } finally {
      state.busy = false;
      saveButton.disabled = false;
    }
  }

  async function setStatus(transition) {
    if (state.unsaved && !(await save())) return;
    try {
      const p = await ctx.api(`/api/posts/${state.post.id}/status`, { method: "POST", body: transition });
      state.post = { ...state.post, ...p };
      renderStatus();
      renderSaveStatus();
      notice(`Status: ${STATUS_LABELS[p.status].toLowerCase()}`);
    } catch (e) {
      notice(e.message, "error");
    }
  }

  async function duplicate() {
    if (state.unsaved && !(await save())) return;
    try {
      const copy = await ctx.api(`/api/posts/${state.post.id}/duplicate`, { method: "POST", body: {} });
      ctx.navigate(`#editor/${copy.id}`);
    } catch (e) {
      notice(e.message, "error");
    }
  }

  async function erase() {
    if (
      !(await confirmDialog(`The post "${state.post.title}" will be deleted permanently. The recipe will be gone.`, {
        title: "Delete post?",
        confirmText: "Delete",
        dangerous: true,
      }))
    )
      return;
    try {
      await ctx.api(`/api/posts/${state.post.id}`, { method: "DELETE" });
      state.unsaved = false;
      ctx.navigate("#library");
    } catch (e) {
      notice(e.message, "error");
    }
  }

  async function exportAs(kind) {
    if (state.busy) return;
    const u = currentCheck();
    if (
      u.errors &&
      !(await confirmDialog(
        `The brand check still found ${u.errors} error${u.errors === 1 ? "" : "s"}. Export anyway?`,
        { title: "Export with errors?", confirmText: "Export anyway" },
      ))
    )
      return;
    state.busy = true;
    for (const k of exportButtons.querySelectorAll("button")) k.disabled = true;
    const progress = (i, n) => {
      exportStatus.textContent = `Working: image ${i} of ${n}…`;
    };
    try {
      exportStatus.textContent = "Exporting…";
      if (kind === "png") await exportPng(state.post, s, ctx.brand, state.format, state.slide, campaignName());
      else if (kind === "zip") await exportZip(state.post, s, ctx.brand, campaignName(), progress);
      else await exportPdf(state.post, s, ctx.brand, campaignName(), progress);
      exportStatus.textContent = "Done; the download has started.";
    } catch (e) {
      exportStatus.textContent = "";
      notice(e.message, "error");
    } finally {
      state.busy = false;
      for (const k of exportButtons.querySelectorAll("button")) k.disabled = false;
    }
  }

  // ---------------- start ----------------
  await loadImages();
  if (!ctx.valid()) return undefined;
  renderAll();
  renderFacts();
  renderCaption();
  renderStatus();
  renderSaveStatus();
  measure();
  const rescale = new ResizeObserver(debounce(() => renderPreview(), 100));
  rescale.observe(previewFrame);

  return {
    hasUnsaved: () => state.unsaved,
    leave: () => {
      rescale.disconnect();
      removeMeasureFrames();
    },
  };
}
