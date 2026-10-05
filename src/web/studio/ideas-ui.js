// The idea planner in Planning: the idea panel (view an idea, edit it,
// delete it or make a post of it) and the AI suggestions over a period. Planning
// (planning.js) keeps track of the lists and the period and passes them in via hooks.
//
// All AI text goes into the page via `el(..., { text })` or as child text, never as HTML.
// Suggestions only become ideas after a tick and "Add to planner"; nothing is stored
// automatically.
import { confirmDialog, el, notice, fieldError } from "/ui.js";
import { TEMPLATES, template as templateOf, withoutEmphasis } from "/studio/templates.js";
import { ideaToRecipe, toInput } from "/studio/recipe.js";
import { getAiMode, sampleBar, sampleLabel } from "/studio/writing-help-ui.js";

const SHORT = new Intl.DateTimeFormat("en-GB", { weekday: "short", day: "numeric", month: "short", timeZone: "UTC" });
const LONG = new Intl.DateTimeFormat("en-GB", {
  weekday: "long",
  day: "numeric",
  month: "long",
  year: "numeric",
  timeZone: "UTC",
});
/**
 * The route's 404 text for moment → fact when the moment does not (or no longer) exist
 * (routes.ts; tests/moments.test.ts pins it down).
 */
const UNKNOWN_MOMENT = "Unknown moment";

/** YYYY-MM-DD short and readable: "Tue 6 Oct". */
export function shortDay(d) {
  return SHORT.format(new Date(`${d}T12:00:00Z`));
}

/** YYYY-MM-DD in full: "Tuesday 6 October 2026". */
export function longDay(d) {
  return LONG.format(new Date(`${d}T12:00:00Z`));
}

/**
 * The campaign dropdown: "No campaign" plus the non-archived ones, and the current value
 * if it is archived.
 */
export function fillCampaigns(select, campaigns, value) {
  const visible = campaigns.filter((c) => !c.archived || c.id === value);
  select.replaceChildren(
    el("option", { value: "", text: "No campaign" }),
    ...visible.map((c) => el("option", { value: c.id, text: c.archived ? `${c.name} (archived)` : c.name })),
  );
  select.value = visible.some((c) => c.id === value) ? value : "";
}

function field(id, label, input, help = null) {
  return el("div", { class: "field" }, [el("label", { for: id, text: label }), input, help]);
}

/**
 * The idea panel. `state()` returns the current lists of the planning
 * ({ posts, campaigns, moments }); `saved(idea)` and `deleted(id)` update them and render
 * again. `fallback()` is the element that gets focus if the element that opened the panel
 * no longer exists after closing.
 *
 * Focus: opening puts it on the title, closing returns it to the opener. If the planning
 * re-renders in the meantime (after saving or rescheduling), the panel looks up the new
 * opener by its `data-focus` key.
 */
export function ideaPanel({ ctx, state, saved, deleted, fallback }) {
  let idea = null;
  let opener = null;
  let openerKey = null;
  let busy = false;
  /**
   * The form values on opening (or after saving or rescheduling): whatever deviates from
   * them is not saved.
   */
  let begin = null;

  const headline = el("h2", { text: "Idea" });
  const date = el("input", { type: "date", id: "idea-date", required: "" });
  const title = el("input", { type: "text", id: "idea-title", maxlength: "120", required: "" });
  const note = el("textarea", { id: "idea-note", rows: "3", maxlength: "1000" });
  const template = el("select", { id: "idea-template" }, [
    el("option", { value: "", text: "No template yet" }),
    ...TEMPLATES.map((s) => el("option", { value: s.id, text: s.name })),
  ]);
  const headlineField = el("input", {
    type: "text",
    id: "idea-headline",
    maxlength: "200",
    "aria-describedby": "idea-headline-help",
  });
  const campaign = el("select", { id: "idea-campaign" });
  const info = el("div", { class: "studio-idea-info" });
  const saveButton = el("button", { type: "button", text: "Save" });
  const createButton = el("button", { type: "button", class: "secondary", text: "Create post" });
  const openButton = el("button", { type: "button", class: "secondary", text: "Open post" });
  const deleteButton = el("button", { type: "button", class: "secondary danger", text: "Delete" });
  const closeButton = el("button", { type: "button", class: "secondary", text: "Close" });
  const buttons = [saveButton, createButton, openButton, deleteButton, closeButton];

  const element = el("section", { class: "card studio-idea-panel", role: "region", "aria-label": "Idea", hidden: "" }, [
    headline,
    el("div", { class: "field-row" }, [
      field("idea-date", "Date", date),
      field("idea-template", "Template", template),
      field("idea-campaign", "Campaign", campaign),
    ]),
    field("idea-title", "Title", title),
    field("idea-note", "Note (optional)", note),
    field(
      "idea-headline",
      "Suggestion for the headline (optional)",
      headlineField,
      el("p", { class: "help-text", id: "idea-headline-help", text: "Put one phrase between *asterisks*" }),
    ),
    info,
    el("div", { class: "button-row" }, buttons),
  ]);

  const used = () => Boolean(idea?.post && state().posts.some((p) => p.id === idea.post));

  function input() {
    return {
      date: date.value,
      title: title.value.trim(),
      note: note.value.trim(),
      template: template.value || null,
      headline: headlineField.value.trim(),
      facts: [...(idea.facts ?? [])],
      moment: idea.moment ?? null,
      campaign: campaign.value || null,
      origin: idea.origin ?? "manual",
      post: idea.post ?? null,
    };
  }

  const form = () => ({
    date: date.value,
    title: title.value.trim(),
    note: note.value.trim(),
    template: template.value,
    headline: headlineField.value.trim(),
    campaign: campaign.value,
  });

  /** Whether something has been typed or chosen in the open panel that has not been saved yet. */
  function unsaved() {
    if (!idea || element.hidden || !begin) return false;
    const now = form();
    return Object.keys(now).some((k) => now[k] !== begin[k]);
  }

  /** Whether the form differs from the saved idea; a new idea is always "changed". */
  function updated() {
    if (!idea.id) return true;
    const now = input();
    return ["date", "title", "note", "template", "headline", "campaign"].some(
      (k) => (now[k] ?? "") !== (idea[k] ?? ""),
    );
  }

  function runCheck() {
    const errors = [];
    if (!/^\d{4}-\d{2}-\d{2}$/.test(date.value)) {
      fieldError(date, "Choose a date.");
      errors.push(date);
    }
    if (!title.value.trim()) {
      fieldError(title, "Give the idea a title.");
      errors.push(title);
    }
    errors[0]?.focus();
    return !errors.length;
  }

  async function save() {
    if (!runCheck()) return null;
    const body = input();
    const response = idea.id
      ? await ctx.api(`/api/ideas/${idea.id}`, { method: "PUT", body })
      : await ctx.api("/api/ideas", { method: "POST", body });
    idea = { ...response };
    begin = form();
    saved(response);
    return response;
  }

  /**
   * From idea to draft post: first the fact for the moment, then the post, then the post id
   * on the idea.
   */
  async function createPost(i) {
    let facts = [...i.facts];
    if (i.moment) {
      try {
        const f = await ctx.api(`/api/moments/${encodeURIComponent(i.moment)}/fact`, { method: "POST", body: {} });
        // The moment fact goes first: an idea carries at most ten facts, and when the idea is
        // updated below, an AI fact drops off, not this one.
        facts = [f.id, ...facts.filter((x) => x !== f.id)];
      } catch (e) {
        // If the moment no longer exists, continue without that fact and without a notice. Every
        // other error (a withdrawn fact, a full fact bank, no connection) is reported: the post is
        // then missing a fact.
        if (e.message !== UNKNOWN_MOMENT)
          notice(`The post is created without the fact for the moment: ${e.message}`, "error");
      }
    }
    const currentCampaign = state().campaigns.some((c) => c.id === i.campaign && !c.archived) ? i.campaign : null;
    const s = templateOf(i.template);
    const recipe = ideaToRecipe(
      { ...i, facts, campaign: currentCampaign },
      { enabledFormats: ctx.settings.formats, brandVersion: ctx.brand.version },
    );
    const post = await ctx.api("/api/posts", { method: "POST", body: toInput(recipe, s, null) });
    const { id, created: _a, updated: _g, ...rest } = i;
    try {
      // An idea carries at most ten facts (server schema); the post gets all of them.
      await ctx.api(`/api/ideas/${id}`, {
        method: "PUT",
        body: { ...rest, facts: facts.slice(0, 10), post: post.id },
      });
    } catch (e) {
      // The post already exists. Show it as used anyway: clicking "Create post" again gave a
      // second, separate post.
      state().posts.push(post);
      if (idea?.id === id) {
        idea.post = post.id;
        renderInfo();
      }
      notice(
        `The post was created, but not linked to the idea: ${e.message}. You can find it in the Library.`,
        "error",
      );
    }
    ctx.navigate(`#editor/${post.id}`);
  }

  /**
   * Runs a button action with all buttons off, and reports an error. A disabled button loses
   * focus; if focus ends up nowhere afterwards (and the panel is still open), it goes back to
   * the button.
   */
  async function withButtonsOff(action) {
    if (busy) return;
    busy = true;
    const button = document.activeElement;
    for (const k of buttons) k.disabled = true;
    try {
      await action();
    } catch (e) {
      notice(e.message, "error");
    } finally {
      busy = false;
      for (const k of buttons) k.disabled = false;
      const lost = !document.activeElement || document.activeElement === document.body;
      if (lost && !element.hidden && button instanceof HTMLElement && button.isConnected) button.focus();
    }
  }

  function renderInfo() {
    const m = idea.moment ? state().moments.find((x) => x.key === idea.moment) : null;
    const n = idea.facts?.length ?? 0;
    info.replaceChildren(
      ...[
        idea.moment ? `Moment: ${m ? `${m.title} (${shortDay(m.date)})` : idea.moment}` : null,
        n ? `${n} fact${n === 1 ? " linked" : "s linked"}` : "No linked facts",
        idea.origin === "ai" ? "Suggested by the AI help" : null,
        used() ? "A post has already been made from this idea." : null,
      ]
        .filter(Boolean)
        .map((t) => el("p", { class: "help-text", text: t })),
    );
    headline.textContent = idea.id ? "Idea" : "New idea";
    createButton.hidden = used();
    openButton.hidden = !used();
    deleteButton.hidden = !idea.id;
  }

  /**
   * Open an idea in the panel. Not during a running action (save, create post, delete): that
   * acts on the idea that is currently open. If there is something unsaved in the panel,
   * first ask whether that may go; clicking the same idea again just leaves what was typed
   * in place.
   */
  async function open(newIdea, source = null) {
    if (busy) return;
    const from = source ?? (document.activeElement instanceof HTMLElement ? document.activeElement : null);
    if (unsaved()) {
      if (idea.id && idea.id === newIdea.id) {
        title.focus();
        return;
      }
      const remove = await confirmDialog(
        "The idea that is open now has changes that are not saved yet. Those changes will be lost if you open another idea.",
        {
          title: "Discard changes?",
          confirmText: "Discard and open",
          dangerous: true,
        },
      );
      if (!remove || busy) return;
    }
    idea = {
      facts: [],
      moment: null,
      campaign: null,
      origin: "manual",
      post: null,
      template: null,
      headline: "",
      note: "",
      ...newIdea,
    };
    opener = from;
    openerKey = opener?.dataset?.focus ?? null;
    for (const v of [date, title, note, template, headlineField, campaign]) fieldError(v, "");
    date.value = idea.date ?? "";
    title.value = idea.title ?? "";
    note.value = idea.note ?? "";
    template.value = idea.template && templateOf(idea.template) ? idea.template : "";
    headlineField.value = idea.headline ?? "";
    fillCampaigns(campaign, state().campaigns, idea.campaign);
    begin = form();
    renderInfo();
    element.hidden = false;
    title.focus();
  }

  function close() {
    element.hidden = true;
    const same = openerKey ? document.querySelector(`[data-focus="${CSS.escape(openerKey)}"]`) : null;
    const focusTarget = opener?.isConnected ? opener : (same ?? fallback());
    idea = null;
    begin = null;
    opener = null;
    openerKey = null;
    focusTarget?.focus();
  }

  saveButton.addEventListener("click", () =>
    withButtonsOff(async () => {
      if (await save()) {
        notice("Idea saved");
        close();
      }
    }),
  );
  createButton.addEventListener("click", () =>
    withButtonsOff(async () => {
      if (!template.value) {
        fieldError(template, "Choose a template first.");
        template.focus();
        return;
      }
      const i = updated() ? await save() : idea;
      if (i) await createPost(i);
    }),
  );
  openButton.addEventListener("click", () => ctx.navigate(`#editor/${idea.post}`));
  deleteButton.addEventListener("click", async () => {
    if (!idea?.id || busy) return;
    if (
      !(await confirmDialog(`Idea "${idea.title}" will be deleted.`, {
        title: "Delete idea?",
        confirmText: "Delete",
        dangerous: true,
      }))
    )
      return;
    const id = idea.id;
    await withButtonsOff(async () => {
      await ctx.api(`/api/ideas/${id}`, { method: "DELETE" });
      deleted(id);
      notice("Idea deleted");
      close();
    });
  });
  closeButton.addEventListener("click", close);
  element.addEventListener("keydown", (e) => {
    if (e.key === "Escape" && !element.hidden && !busy) {
      e.preventDefault();
      close();
    }
  });

  return {
    element,
    open,
    /**
     * An idea was rescheduled outside the panel (drag): adopt the new date, leave the rest of
     * the form alone.
     */
    updated(response) {
      if (!idea || idea.id !== response.id) return;
      idea = { ...response };
      date.value = response.date;
      // The new date is saved; the rest of what was typed remains unsaved.
      if (begin) begin.date = response.date;
      fieldError(date, "");
    },
    /**
     * The idea changed outside the panel (e.g. the lists were reloaded): update info and
     * buttons.
     */
    refresh() {
      if (idea) renderInfo();
    },
  };
}

/**
 * The AI suggestions over a period. `request()` returns the body for the server, or null
 * if something is still missing (the planning then sets the field error itself).
 * `momentTitle(key)` returns the name of a moment; `afterSave()` reloads the ideas and
 * renders the planning.
 *
 * Returns the buttons (`question`, `cancel`), the help line when the AI help is off
 * (`off`), the hint to add a company profile when it is empty (`hint`) and the block with the outcome (`element`) separately, so that the planning puts
 * them in the period panel.
 */
export function suggestionsPanel({ ctx, request, momentTitle, afterSave }) {
  const enabled = Boolean(ctx.settings.writingHelp?.enabled);
  const ask = el("button", { type: "button", text: "Get idea suggestions", ...(enabled ? {} : { disabled: "" }) });
  const cancel = el("button", { type: "button", class: "secondary", text: "Cancel", hidden: "" });
  const off = enabled
    ? null
    : el("p", { class: "help-text" }, [
        "The AI help is off. ",
        el("a", { href: "#settings", text: "Turn it on under Settings" }),
        ".",
      ]);
  const hasProfile = Object.values(ctx.settings.profile ?? {}).some((v) => String(v).trim());
  const hint =
    enabled && !hasProfile
      ? el("p", { class: "help-text" }, [
          el("a", { href: "#settings", text: "Add a company profile in Settings" }),
          " for ideas that fit your sector.",
        ])
      : null;
  const mode = el("p", { class: "help-text", role: "status", "aria-live": "polite" });
  const list = el("div", { class: "studio-variants" });
  const bar = el("div");
  getAiMode().then((a) => {
    if (a?.mode === "sample") bar.replaceChildren(sampleBar());
  });
  let sampleResponse = false;
  const set = el("button", { type: "button", text: "Place 0 in the planner" });
  const remove = el("button", { type: "button", class: "secondary", text: "Discard" });
  const actions = el("div", { class: "button-row", hidden: "" }, [set, remove]);
  let abort = null;
  let suggestions = [];
  let campaignFromRequest = null;
  /** For unique ids of the warnings, across multiple requests. */
  let sequenceNumber = 0;

  function updateCount() {
    const n = suggestions.filter((x) => x.tick.checked).length;
    set.textContent = `Place ${n} in the planner`;
    set.disabled = !n;
  }

  function renderList() {
    list.replaceChildren(...suggestions.map((x) => x.article));
    actions.hidden = !suggestions.length;
    updateCount();
  }

  function suggestion(v) {
    const uncovered = v.uncovered ?? [];
    // The warning belongs to the tick: a screen reader reads it out when it is ticked.
    const warning = uncovered.length ? `suggestion-uncovered-${++sequenceNumber}` : null;
    const tick = el("input", { type: "checkbox", ...(warning ? { "aria-describedby": warning } : {}) });
    tick.checked = !uncovered.length;
    tick.addEventListener("change", updateCount);
    const s = v.template ? templateOf(v.template) : null;
    const article = el("article", { class: "studio-variant" }, [
      el("label", { class: "studio-radio studio-suggestion-title" }, [
        tick,
        el("b", { text: `${shortDay(v.date)} · ${v.title}` }),
        sampleResponse ? sampleLabel() : null,
      ]),
      v.note ? el("p", { text: v.note }) : null,
      el("p", { class: "help-text", text: s ? `Template: ${s.name}` : "No template yet" }),
      v.headline ? el("p", {}, [el("b", { text: "Headline: " }), withoutEmphasis(v.headline)]) : null,
      v.moment ? el("p", { class: "help-text", text: `Moment: ${momentTitle(v.moment)}` }) : null,
      warning
        ? el("p", {
            class: "studio-warning",
            id: warning,
            text: `Contains a number without a source: ${uncovered.join(", ")}. Check this before you use it.`,
          })
        : null,
    ]);
    return { v, tick, article };
  }

  function empty() {
    suggestions = [];
    renderList();
  }

  ask.addEventListener("click", async () => {
    const body = request();
    if (!body) return;
    abort = new AbortController();
    ask.disabled = true;
    cancel.hidden = false;
    cancel.focus();
    mode.textContent = "The AI is thinking…";
    empty();
    try {
      // Cancelling aborts the fetch with an AbortError, and that is not an error message.
      const data = await ctx.api("/api/ideas/suggest", { method: "POST", body, signal: abort.signal });
      campaignFromRequest = body.campaign;
      sampleResponse = data?.sample === true;
      suggestions = (data?.suggestions ?? []).map(suggestion);
      renderList();
      const n = suggestions.length;
      const from = data?.from && data.from !== body.from ? `, from today (${shortDay(data.from)})` : "";
      mode.textContent = n ? `${n} suggestion${n === 1 ? "" : "s"}${from}` : "No usable suggestion received.";
    } catch (e) {
      mode.textContent = e.name === "AbortError" ? "Stopped." : "";
      if (e.name !== "AbortError") notice(e.message, "error");
    } finally {
      const hadFocus = document.activeElement === cancel;
      ask.disabled = false;
      cancel.hidden = true;
      abort = null;
      if (hadFocus) (suggestions[0]?.tick ?? ask).focus();
    }
  });
  cancel.addEventListener("click", () => abort?.abort());

  set.addEventListener("click", async () => {
    const chosen = suggestions.filter((x) => x.tick.checked);
    if (!chosen.length) return;
    for (const k of [set, remove, ask]) k.disabled = true;
    let saved = 0;
    try {
      // One after another, so that on an error it is known exactly what did get saved.
      for (const x of chosen) {
        const { date, title, note, template, headline, facts, moment } = x.v;
        await ctx.api("/api/ideas", {
          method: "POST",
          body: {
            date,
            title,
            note,
            template,
            headline,
            facts,
            moment,
            campaign: campaignFromRequest,
            origin: "ai",
            post: null,
          },
        });
        saved++;
        suggestions = suggestions.filter((y) => y !== x);
      }
    } catch (e) {
      notice(`${saved} of the ${chosen.length} ideas saved; the rest is still in the list. ${e.message}`, "error");
    }
    const all = saved === chosen.length;
    if (all) {
      suggestions = [];
      mode.textContent = "";
    } else {
      // The status line still showed the count from before saving.
      const n = suggestions.length;
      mode.textContent = `Remaining: ${n} suggestion${n === 1 ? "" : "s"} in the list`;
    }
    for (const k of [set, remove]) k.disabled = false;
    ask.disabled = !enabled;
    renderList();
    if (saved) {
      try {
        await afterSave();
      } catch (e) {
        notice(e.message, "error");
      }
    }
    if (all) {
      notice(`${saved} idea${saved === 1 ? "" : "s"} placed in the planner`);
      ask.focus();
    } else set.focus();
  });
  remove.addEventListener("click", () => {
    empty();
    mode.textContent = "";
    ask.focus();
  });

  return { ask, cancel, off, hint, element: el("div", { class: "studio-suggestions" }, [mode, bar, list, actions]) };
}
