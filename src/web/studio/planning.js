// Planner: scheduled and published posts, ideas and moments as an agenda per week and day
// (default, also on a phone) or as a month, the drafts and campaigns beside it and the calendar
// export (.ics). Rescheduling is always possible with a date field; dragging in the month view
// is an extra, never the only way.
//
// Choosing a period (click a start and an end day in the month, or use the two date
// fields, which show the same choice), having ideas suggested for it or adding one
// yourself. The idea panel and the suggestions are in ideas-ui.js.
import { confirmDialog, el, notice, fieldError } from "/ui.js";
import { download } from "/studio/render.js";
import { createIcs } from "/studio/ics.js";
import {
  workdayCount,
  dayOf,
  choosePeriod,
  upcomingWeeks,
  monthGrid,
  plusDays,
  defaultCount,
  rescheduleToDay,
  nextMonth,
  agendaDays,
} from "/studio/calendar.js";
import { deskOf, factProblems } from "/studio/desk.js";
import { drawArtwork, statusBadge } from "/studio/post-cards.js";
import { readableMoment, withOffset, toLocal, localToday } from "/studio/recipe.js";
import { template as templateOf } from "/studio/templates.js";
import { format } from "/studio/formats.js";
import { CHANNEL_RULES } from "/studio/caption.js";
import { ideaPanel, shortDay, longDay, suggestionsPanel, fillCampaigns } from "/studio/ideas-ui.js";

const MONTHS = [
  "January",
  "February",
  "March",
  "April",
  "May",
  "June",
  "July",
  "August",
  "September",
  "October",
  "November",
  "December",
];
const DAYS = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];

export async function show(container, ctx) {
  const begin = localToday();
  let [{ posts }, { campaigns }, { ideas }, moments, { facts }] = await Promise.all([
    ctx.api("/api/posts"),
    ctx.api("/api/campaigns"),
    ctx.api("/api/ideas"),
    // The moments are an extra: if they fail to load, the planning simply works without them.
    ctx.api(`/api/moments?from=${plusDays(begin, -31)}&to=${plusDays(begin, 365)}`).then(
      (r) => r?.moments ?? [],
      () => [],
    ),
    ctx.api("/api/facts").catch(() => ({ facts: null })),
  ]);
  if (!ctx.valid()) return undefined;
  /** The observer that draws the thumbnails of the agenda; replaced at every redraw. */
  let observer;
  const now = new Date();
  let view = "list";
  let { year, month } = { year: now.getFullYear(), month: now.getMonth() };
  /** The chosen period; independent of the month shown, so paging keeps it. */
  let period = { from: null, to: null };

  const calendarHolder = el("div");
  const campaignHolder = el("div");
  const listButton = el("button", { type: "button", class: "secondary", "aria-pressed": "true", text: "List" });
  const monthButton = el("button", { type: "button", class: "secondary", "aria-pressed": "false", text: "Month" });
  const icsButton = el("button", { type: "button", class: "secondary", text: "Export calendar" });

  const moment = (p) => (p.status === "scheduled" ? p.scheduled : p.status === "published" ? p.published?.on : null);
  /**
   * An idea is used if its post (still) exists; if that has been deleted, the idea counts as
   * open again.
   */
  const used = (i) => Boolean(i.post && posts.some((p) => p.id === i.post));

  // ---------------- period ----------------
  const channels = ctx.settings.channels?.length ? ctx.settings.channels : ["linkedin"];
  const fromField = el("input", { type: "date", id: "period-from" });
  const toField = el("input", { type: "date", id: "period-to" });
  const periodStatus = el("p", { class: "help-text", role: "status", "aria-live": "polite" });
  const deleteButton = el("button", { type: "button", class: "secondary", text: "Clear selection" });
  const addButton = el("button", { type: "button", class: "secondary", text: "Add idea" });
  const fieldCount = el("input", {
    type: "number",
    id: "period-count",
    min: "1",
    max: "20",
    step: "1",
    inputmode: "numeric",
  });
  const channelField = el(
    "select",
    { id: "period-channel" },
    channels.map((k) => el("option", { value: k, text: CHANNEL_RULES[k]?.name ?? k })),
  );
  const campaignField = el("select", { id: "period-campaign" });
  const wishField = el("textarea", {
    id: "period-wish",
    rows: "2",
    maxlength: "1000",
    placeholder: "For example: more about the brand check; for designers and marketers.",
  });
  /**
   * The count follows the period (two per week) until you change it yourself; a new period
   * resets it.
   */
  let countFor = null;

  const panel = ideaPanel({
    ctx,
    state: () => ({ posts, campaigns, moments }),
    saved: (idea) => {
      ideas = ideas.some((i) => i.id === idea.id) ? ideas.map((i) => (i.id === idea.id ? idea : i)) : [...ideas, idea];
      render();
    },
    deleted: (id) => {
      ideas = ideas.filter((i) => i.id !== id);
      render();
    },
    fallback: () => {
      periodCard.open = true;
      return addButton;
    },
  });

  const help = suggestionsPanel({
    ctx,
    request: () => {
      if (!period.from || !period.to) return null;
      const count = Number(fieldCount.value);
      if (!Number.isInteger(count) || count < 1 || count > 20) {
        fieldError(fieldCount, "Choose a number from 1 to 20.");
        fieldCount.focus();
        return null;
      }
      fieldError(fieldCount, "");
      return {
        from: period.from,
        to: period.to,
        count,
        channel: channelField.value,
        note: wishField.value,
        campaign: campaignField.value || null,
      };
    },
    momentTitle: (key) => moments.find((m) => m.key === key)?.title ?? key,
    afterSave: async () => {
      ({ ideas } = await ctx.api("/api/ideas"));
      render();
    },
  });

  const periodForm = el("div", { hidden: "" }, [
    el("div", { class: "field-row" }, [
      el("div", { class: "field" }, [el("label", { for: "period-count", text: "Number of ideas" }), fieldCount]),
      el("div", { class: "field" }, [el("label", { for: "period-channel", text: "Channel" }), channelField]),
      el("div", { class: "field" }, [el("label", { for: "period-campaign", text: "Campaign" }), campaignField]),
    ]),
    el("div", { class: "field" }, [el("label", { for: "period-wish", text: "Wish (optional)" }), wishField]),
    el("div", { class: "button-row" }, [help.ask, help.cancel]),
    help.off,
    help.hint,
  ]);

  const periodCard = el("details", { class: "card studio-period" }, [
    el("summary", {}, [el("h2", { text: "Period and ideas" })]),
    el("div", { class: "field-row" }, [
      el("div", { class: "field" }, [el("label", { for: "period-from", text: "From" }), fromField]),
      el("div", { class: "field" }, [el("label", { for: "period-to", text: "Up to and including" }), toField]),
    ]),
    periodStatus,
    el("div", { class: "button-row" }, [addButton, deleteButton]),
    periodForm,
    help.element,
  ]);

  /**
   * Sets the fields and the line below the dates equal to `period`, without rebuilding the
   * fields (focus stays).
   */
  function renderPeriod() {
    const { from, to } = period;
    for (const [field, value] of [
      [fromField, from ?? ""],
      [toField, to ?? ""],
    ]) {
      if (field.value !== value) {
        field.value = value;
        fieldError(field, "");
      }
    }
    const complete = Boolean(from && to);
    const n = complete ? workdayCount(from, to) : 0;
    const mode = complete
      ? `${n} workday${n === 1 ? "" : "s"}`
      : from
        ? "Click the end day, or enter the end date."
        : "Click a start and an end day in the month, or enter the dates.";
    if (periodStatus.textContent !== mode) periodStatus.textContent = mode;
    deleteButton.disabled = !from && !to;
    periodForm.hidden = !complete;
    const key = complete ? `${from}..${to}` : null;
    if (complete && key !== countFor) {
      fieldCount.value = String(defaultCount(from, to));
      fieldError(fieldCount, "");
    }
    countFor = key;
    fillCampaigns(campaignField, campaigns, campaignField.value);
  }

  /** A date field changed: the period follows, unless the end falls before the start. */
  function periodFromFields(source) {
    fieldError(fromField, "");
    fieldError(toField, "");
    const from = fromField.value || null;
    const to = toField.value || null;
    if (from && to && to < from) {
      fieldError(
        source,
        source === toField ? "The end date is before the start date." : "The start date is after the end date.",
      );
      return;
    }
    period = { from, to };
    render();
  }
  fromField.addEventListener("change", () => periodFromFields(fromField));
  toField.addEventListener("change", () => periodFromFields(toField));

  /**
   * A period from outside the fields (click in the month, an empty week, Clear selection): an
   * old field error no longer applies then.
   */
  function setPeriod(updated) {
    periodCard.open = true;
    period = updated;
    fieldError(fromField, "");
    fieldError(toField, "");
    render();
  }
  deleteButton.addEventListener("click", () => {
    setPeriod({ from: null, to: null });
    fromField.focus();
  });
  addButton.addEventListener("click", () => panel.open({ date: period.from ?? localToday(), title: "" }, addButton));

  /**
   * A day in the month was clicked. After the re-render the same day is under the mouse
   * again (the period panel above can grow or shrink) and it gets focus back.
   */
  function chooseDay(date, extend) {
    const search = () => calendarHolder.querySelector(`[data-date="${date}"]`);
    const before = search()?.getBoundingClientRect().top;
    setPeriod(choosePeriod(period, date, { extend }));
    const button = search();
    if (!button) return;
    if (before !== undefined) window.scrollBy(0, button.getBoundingClientRect().top - before);
    button.focus({ preventScroll: true });
  }

  /** An idea to another day (drag); the whole idea goes along, because a PUT replaces it. */
  async function rescheduleIdea(i, date) {
    try {
      const { id, created: _a, updated: _g, ...rest } = i;
      const updated = await ctx.api(`/api/ideas/${id}`, { method: "PUT", body: { ...rest, date } });
      ideas = ideas.map((x) => (x.id === id ? updated : x));
      panel.updated(updated);
      notice(`Idea rescheduled to ${shortDay(date)}`);
      render();
    } catch (e) {
      notice(e.message, "error");
    }
  }

  /**
   * Turn a moment into a draft fact. New or already existing gets the same notice; a
   * withdrawn fact gives 409 and that error message.
   */
  async function createFact(m) {
    try {
      await ctx.api(`/api/moments/${encodeURIComponent(m.key)}/fact`, { method: "POST", body: {} });
      notice("The fact for this moment is in the Fact bank; set it to active there if it is still a draft.");
    } catch (e) {
      notice(e.message, "error");
    }
  }

  /** A new idea for a moment, on the day of the row (not in the past). */
  function ideaForMoment(m, day, button) {
    const today = localToday();
    panel.open(
      {
        date: day < today ? today : day,
        title: m.title,
        note: m.sentence,
        template: null,
        headline: "",
        facts: [],
        moment: m.key,
        campaign: null,
        origin: "manual",
        post: null,
      },
      button,
    );
  }

  async function reschedule(p, iso) {
    try {
      const updated = await ctx.api(`/api/posts/${p.id}/status`, {
        method: "POST",
        body: { target: "scheduled", scheduled: iso },
      });
      Object.assign(p, updated);
      notice(`Rescheduled to ${readableMoment(iso)}`);
      render();
    } catch (e) {
      notice(e.message, "error");
    }
  }

  function rescheduleField(p) {
    const input = el("input", {
      type: "datetime-local",
      id: `reschedule-${p.id}`,
      value: toLocal(p.scheduled),
      "aria-label": `New moment for ${p.title}`,
    });
    const button = el("button", { type: "button", class: "secondary small", text: "Reschedule" });
    button.addEventListener("click", () => {
      const iso = withOffset(input.value);
      if (!iso) {
        fieldError(input, "Choose a date and time.");
        return;
      }
      fieldError(input, "");
      void reschedule(p, iso);
    });
    return el("span", { class: "studio-reschedule" }, [input, button]);
  }

  const clock = (iso) => new Date(iso).toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit" });

  /** A post, idea or moment in the agenda: an optional time and thumbnail, the text, the actions. */
  function item({ time = null, post = null, body, actions = null }) {
    let art = null;
    if (post) {
      const thumbnail = el("div", { class: "studio-thumbnail" });
      thumbnail.dataset.id = post.id;
      art = el("div", { class: "studio-artwork", "aria-hidden": "true" }, [thumbnail]);
    }
    return el("div", { class: "studio-plan-item" }, [
      time ? el("span", { class: "studio-plan-time", text: time }) : null,
      art,
      el("div", { class: "studio-plan-body" }, body),
      actions,
    ]);
  }

  function row(p, { dated = false } = {}) {
    const campaign = p.campaign ? campaigns.find((c) => c.id === p.campaign)?.name : null;
    return item({
      time: dated ? readableMoment(moment(p)) : clock(moment(p)),
      post: p,
      body: [
        statusBadge(p.status),
        el("a", { href: `#editor/${p.id}`, class: "studio-plan-title", text: p.title }),
        el("span", {
          class: "table-subtext",
          text: [templateOf(p.template)?.name ?? p.template, format(p.formats[0])?.name ?? p.formats[0], campaign]
            .filter(Boolean)
            .join(" · "),
        }),
      ],
      actions:
        p.status === "scheduled"
          ? el("details", { class: "studio-item-more" }, [el("summary", { text: "Reschedule" }), rescheduleField(p)])
          : p.published?.url
            ? el("a", {
                href: p.published.url,
                target: "_blank",
                rel: "noopener noreferrer",
                text: "View the post",
              })
            : null,
    });
  }

  /** A block with heading and agenda items; `sub` is a line under the heading. */
  function block(title, items, { sub = null } = {}) {
    return el("section", { class: "studio-plan-block" }, [
      el("h2", { text: title }),
      sub ? el("p", { class: "help-text studio-plan-block-sub", text: sub }) : null,
      el("div", { class: "studio-plan-list" }, items),
    ]);
  }

  function ideaRow(i, { dated = false } = {}) {
    const button = el("button", {
      type: "button",
      class: "secondary small",
      "data-focus": `idea-${i.id}`,
      "aria-label": `Open: ${i.title}`,
      text: "Open",
    });
    button.addEventListener("click", () => panel.open(i, button));
    return item({
      time: dated ? shortDay(i.date) : null,
      body: [
        el("span", { class: "badge studio-badge-idea", text: "Idea" }),
        el("span", { class: "studio-plan-title", text: i.title }),
        used(i) ? el("span", { class: "table-subtext", text: "Post made" }) : null,
      ],
      actions: button,
    });
  }

  function momentRow(m, day) {
    const factButton = el("button", {
      type: "button",
      class: "secondary small",
      "aria-label": `Create fact: ${m.title}`,
      text: "Create fact",
    });
    const ideaButton = el("button", {
      type: "button",
      class: "secondary small",
      "data-focus": `moment-${m.key}-${day}`,
      "aria-label": `Idea on this day: ${m.title}`,
      text: "Idea on this day",
    });
    factButton.addEventListener("click", () => createFact(m));
    ideaButton.addEventListener("click", () => ideaForMoment(m, day, ideaButton));
    return item({
      body: [
        el("span", { class: "badge", text: "Moment" }),
        el("span", { class: "studio-plan-title", text: m.title }),
        el("span", { class: "table-subtext", text: m.sentence }),
      ],
      actions: el("div", { class: "row-actions" }, [factButton, ideaButton]),
    });
  }

  /** The line for a week without posts or ideas, with the button that chooses the week as the period. */
  function emptyWeek(w) {
    const button = el("button", { type: "button", class: "secondary", text: "Ideas for this week" });
    button.addEventListener("click", () => {
      const today = localToday();
      setPeriod({ from: w.monday < today ? today : w.monday, to: w.sunday });
      fromField.focus();
    });
    return el("div", { class: "studio-week-empty" }, [el("span", { text: "Nothing planned" }), button]);
  }

  /** "19–25 October", or "26 October – 1 November" when the week crosses a month. */
  function weekRange(w) {
    const part = (d) => `${Number(d.slice(8))} ${MONTHS[Number(d.slice(5, 7)) - 1]}`;
    const [from, to] = [part(w.monday), part(w.sunday)];
    return w.monday.slice(5, 7) === w.sunday.slice(5, 7) ? `${Number(w.monday.slice(8))}–${to}` : `${from} – ${to}`;
  }

  function renderList() {
    const t = Date.now();
    const today = localToday();
    const scheduled = posts
      .filter((p) => p.status === "scheduled")
      .sort((a, b) => new Date(a.scheduled) - new Date(b.scheduled));
    const overdue = scheduled.filter((p) => new Date(p.scheduled).getTime() < t);
    const upcoming = scheduled.filter((p) => new Date(p.scheduled).getTime() >= t);
    const recent = posts
      .filter((p) => p.status === "published" && p.published && t - new Date(p.published.on).getTime() < 30 * 86400000)
      .sort((a, b) => new Date(b.published.on) - new Date(a.published.on));
    const blocks = [];
    // The next six weeks always, plus later weeks in which a scheduled post or an idea sits.
    const weeks = new Map(upcomingWeeks(today, 6).map((w) => [w.monday, { w, rows: [], filled: false, posts: 0 }]));
    const first = upcomingWeeks(today, 1)[0].monday;
    // Open ideas from before this week would otherwise get lost: at the top, with the same row
    // and buttons as in the weeks. The Overview counts them too. Used ideas from the past stay
    // out.
    const earlier = ideas
      .filter((i) => i.date < first && !used(i))
      .sort((a, b) => a.date.localeCompare(b.date) || a.title.localeCompare(b.title));
    if (earlier.length) {
      blocks.push(
        block(
          "Open ideas from earlier",
          earlier.map((i) => ideaRow(i, { dated: true })),
          {
            sub: "Not picked up yet. Open an idea to give it a new date, make a post from it or delete it.",
          },
        ),
      );
    }
    if (overdue.length)
      blocks.push(
        block(
          "Overdue: scheduled but not yet marked as published",
          overdue.map((p) => row(p, { dated: true })),
        ),
      );

    const weekOf = (day) => {
      const w = upcomingWeeks(day, 1)[0];
      if (!weeks.has(w.monday)) weeks.set(w.monday, { w, rows: [], filled: false, posts: 0 });
      return weeks.get(w.monday);
    };
    // Sort per day: first moments, then posts (by time), then ideas.
    for (const p of upcoming) {
      const b = weekOf(dayOf(p.scheduled));
      b.filled = true;
      b.posts++;
      b.rows.push({ sort: `${dayOf(p.scheduled)} 1 ${new Date(p.scheduled).toISOString()}`, item: row(p) });
    }
    for (const i of ideas.filter((x) => x.date >= first)) {
      const b = weekOf(i.date);
      b.filled = true;
      b.rows.push({ sort: `${i.date} 2 ${i.title}`, item: ideaRow(i) });
    }
    for (const m of moments) {
      if (m.date < first) continue;
      const b = weeks.get(upcomingWeeks(m.date, 1)[0].monday);
      if (b) b.rows.push({ sort: `${m.date} 0 ${m.title}`, item: momentRow(m, m.date) });
    }
    for (const { w, rows, filled, posts: count } of [...weeks.values()].sort((x, y) =>
      x.w.monday.localeCompare(y.w.monday),
    )) {
      const parts = [
        `Week ${w.week}${w.year !== now.getFullYear() ? `, ${w.year}` : ""}`,
        count ? `${count} scheduled post${count === 1 ? "" : "s"}` : null,
      ];
      blocks.push(
        el("section", { class: "studio-plan-block studio-week" }, [
          el("h2", { text: weekRange(w) }),
          el("p", { class: "help-text studio-plan-block-sub", text: parts.filter(Boolean).join(" · ") }),
          rows.length
            ? el(
                "ol",
                { class: "studio-week-agenda" },
                agendaDays(w.monday, rows).map((d, i) =>
                  el("li", { class: "studio-plan-day", ...(d.date === today ? { "aria-current": "date" } : {}) }, [
                    el("div", { class: "studio-plan-date" }, [
                      el("span", { text: DAYS[i] }),
                      el("strong", { text: String(Number(d.date.slice(8))) }),
                    ]),
                    el(
                      "div",
                      { class: "studio-plan-items" },
                      d.rows.length
                        ? d.rows.map((r) => r.item)
                        : [el("p", { class: "help-text", text: "No post planned" })],
                    ),
                  ]),
                ),
              )
            : null,
          filled ? null : emptyWeek(w),
        ]),
      );
    }
    if (recent.length)
      blocks.push(
        block(
          "Published, past 30 days",
          recent.map((p) => row(p, { dated: true })),
        ),
      );
    calendarHolder.replaceChildren(...blocks);
    observer?.disconnect();
    observer = drawArtwork(calendarHolder, posts, ctx.brand);
  }

  function renderMonth() {
    observer?.disconnect();
    const today = localToday();
    const perDay = new Map();
    const at = (map, day, x) => {
      if (!map.has(day)) map.set(day, []);
      map.get(day).push(x);
    };
    for (const p of posts) {
      const m = moment(p);
      if (!m || (p.status !== "scheduled" && p.status !== "published")) continue;
      at(perDay, dayOf(m), p);
    }
    const momentsOn = new Map();
    for (const m of moments) at(momentsOn, m.date, m);
    const ideasOn = new Map();
    for (const i of ideas) at(ideasOn, i.date, i);
    const weeks = monthGrid(year, month);
    const cell = ({ date, inMonth }) => {
      const list = (perDay.get(date) ?? []).sort((a, b) => new Date(moment(a)) - new Date(moment(b)));
      const inPeriod = Boolean(period.from && date >= period.from && date <= (period.to ?? period.from));
      const dayButton = el("button", {
        type: "button",
        class: "studio-day-number studio-day-picker",
        "data-date": date,
        "aria-pressed": String(inPeriod),
        "aria-label": `${longDay(date)}, ${inPeriod ? "in the period" : "add to the period"}`,
        text: String(Number(date.slice(8))),
      });
      // Shift-click would otherwise select text in the table; chooseDay sets the focus itself.
      dayButton.addEventListener("mousedown", (e) => {
        if (e.shiftKey) e.preventDefault();
      });
      dayButton.addEventListener("click", (e) => chooseDay(date, e.shiftKey));
      const td = el(
        "td",
        {
          class: `studio-day${inMonth ? "" : " outside"}${date === today ? " today" : ""}${inPeriod ? " chosen" : ""}`,
        },
        [
          dayButton,
          ...list.map((p) => {
            const a = el("a", {
              href: `#editor/${p.id}`,
              class: `studio-chip studio-badge-${p.status}`,
              text: `${new Date(moment(p)).toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit" })} ${p.title}`,
            });
            if (p.status === "scheduled") {
              a.draggable = true;
              a.addEventListener("dragstart", (e) => {
                e.dataTransfer.setData("text/plain", p.id);
                e.dataTransfer.effectAllowed = "move";
              });
            }
            return a;
          }),
          ...(momentsOn.get(date) ?? []).map((m) =>
            el("span", { class: "studio-moment", title: m.sentence, text: m.title }),
          ),
          ...(ideasOn.get(date) ?? []).map((i) => {
            const alreadyUsed = used(i);
            const button = el("button", {
              type: "button",
              class: `studio-chip studio-idea${alreadyUsed ? " used" : ""}`,
              "data-focus": `idea-${i.id}`,
              title: i.title,
              text: `Idea: ${i.title}`,
              ...(alreadyUsed ? { "aria-label": `Idea: ${i.title} (post made)` } : {}),
            });
            button.addEventListener("click", () => panel.open(i, button));
            button.draggable = true;
            button.addEventListener("dragstart", (e) => {
              e.dataTransfer.setData("text/plain", i.id);
              e.dataTransfer.effectAllowed = "move";
            });
            return button;
          }),
        ],
      );
      td.addEventListener("dragover", (e) => {
        e.preventDefault();
        td.classList.add("drag-target");
      });
      td.addEventListener("dragleave", () => td.classList.remove("drag-target"));
      td.addEventListener("drop", (e) => {
        e.preventDefault();
        td.classList.remove("drag-target");
        const id = e.dataTransfer.getData("text/plain");
        // The id prefix says what is being dragged: p- is a post, i- an idea.
        if (id.startsWith("i-")) {
          const i = ideas.find((x) => x.id === id);
          if (!i || i.date === date) return;
          if (date < localToday()) {
            notice("An idea cannot go to a day in the past", "error");
            return;
          }
          void rescheduleIdea(i, date);
          return;
        }
        const p = posts.find((x) => x.id === id);
        if (!p || p.status !== "scheduled" || dayOf(p.scheduled) === date) return;
        const iso = rescheduleToDay(p.scheduled, date);
        if (iso && new Date(iso).getTime() > Date.now()) void reschedule(p, iso);
        else notice("A post cannot go to a moment in the past", "error");
      });
      return td;
    };
    const previous = el("button", { type: "button", class: "secondary small", text: "← Previous month" });
    const next = el("button", { type: "button", class: "secondary small", text: "Next month →" });
    previous.addEventListener("click", () => {
      ({ year, month } = nextMonth(year, month, -1));
      render();
    });
    next.addEventListener("click", () => {
      ({ year, month } = nextMonth(year, month, 1));
      render();
    });
    calendarHolder.replaceChildren(
      el("div", { class: "studio-month-headline" }, [previous, el("h2", { text: `${MONTHS[month]} ${year}` }), next]),
      el("p", {
        class: "help-text",
        text: "Click a start and an end day to choose the period; shift-click extends it, even after browsing. Drag a scheduled post or an idea to another day; with a post the time stays the same. With the keyboard you use the date fields: in the period, in the idea panel and in the list view.",
      }),
      el("div", { class: "table-scroll" }, [
        el("table", { class: "studio-month" }, [
          el("caption", { class: "visual-hidden", text: `Posts, ideas and moments in ${MONTHS[month]} ${year}` }),
          el("thead", {}, [
            el(
              "tr",
              {},
              DAYS.map((d) => el("th", { scope: "col", text: d })),
            ),
          ]),
          el(
            "tbody",
            {},
            weeks.map((w) => el("tr", {}, w.map(cell))),
          ),
        ]),
      ]),
    );
  }

  function render() {
    listButton.setAttribute("aria-pressed", String(view === "list"));
    monthButton.setAttribute("aria-pressed", String(view === "month"));
    renderPeriod();
    if (view === "list") renderList();
    else renderMonth();
    panel.refresh();
  }

  listButton.addEventListener("click", () => {
    view = "list";
    render();
  });
  monthButton.addEventListener("click", () => {
    view = "month";
    render();
  });
  icsButton.addEventListener("click", () => {
    const future = (p) => p.scheduled && new Date(p.scheduled).getTime() > Date.now();
    const scheduled = posts.filter((p) => p.status === "scheduled" && future(p));
    if (!scheduled.length) {
      notice("No posts are scheduled in the future", "error");
      return;
    }
    // Posts moved back to draft with a future moment are included as cancelled, so that an
    // earlier export gets cleaned up.
    const withdrawn = posts.filter((p) => (p.status === "draft" || p.status === "archived") && future(p));
    download(
      createIcs([...scheduled, ...withdrawn], { baseUrl: location.origin, brandName: ctx.brand.name }),
      "postwright.ics",
      "text/calendar;charset=utf-8",
    );
    notice(`${scheduled.length} event${scheduled.length === 1 ? "" : "s"} in the calendar export`);
  });

  // ---------------- campaigns ----------------
  function renderCampaigns() {
    const name = el("input", { type: "text", id: "campaign-name", maxlength: "80" });
    const utm = el("input", { type: "text", id: "campaign-utm", maxlength: "50", placeholder: "autumn-2026" });
    const from = el("input", { type: "date", id: "campaign-from" });
    const to = el("input", { type: "date", id: "campaign-to" });
    const goal = el("input", { type: "text", id: "campaign-goal", maxlength: "300" });
    let edited = null;
    name.addEventListener("input", () => {
      if (!edited && !utm.dataset.self)
        utm.value = name.value
          .toLowerCase()
          .normalize("NFKD")
          .replace(/[̀-ͯ]/g, "")
          .replace(/[^a-z0-9]+/g, "-")
          .replace(/^-|-$/g, "")
          .slice(0, 50);
    });
    utm.addEventListener("input", () => {
      utm.dataset.self = "1";
    });
    const save = el("button", { type: "button", text: "Add campaign" });
    const cancel = el("button", { type: "button", class: "secondary", text: "Cancel", hidden: "" });
    const form = el("details", { class: "studio-campaign-form" });
    const empty = () => {
      form.open = false;
      edited = null;
      for (const v of [name, utm, from, to, goal]) v.value = "";
      delete utm.dataset.self;
      save.textContent = "Add campaign";
      cancel.hidden = true;
    };
    cancel.addEventListener("click", empty);
    save.addEventListener("click", async () => {
      const body = {
        name: name.value,
        utmCampaign: utm.value,
        goal: goal.value,
        from: from.value || null,
        to: to.value || null,
        archived: edited?.archived ?? false,
      };
      save.disabled = true; // no duplicate request on a double click
      try {
        const c = edited
          ? await ctx.api(`/api/campaigns/${edited.id}`, { method: "PUT", body })
          : await ctx.api("/api/campaigns", { method: "POST", body });
        campaigns = edited ? campaigns.map((x) => (x.id === c.id ? c : x)) : [...campaigns, c];
        empty();
        renderCampaigns();
        notice("Campaign saved");
      } catch (e) {
        notice(e.message, "error");
      } finally {
        save.disabled = false;
      }
    });
    const rows = campaigns.map((c) =>
      el("tr", {}, [
        el("td", { class: "card-title" }, [
          el("b", { text: c.name }),
          c.goal ? el("span", { class: "table-subtext", text: c.goal }) : null,
        ]),
        el("td", { text: c.utmCampaign, "data-label": "UTM name" }),
        el("td", { text: [c.from, c.to].filter(Boolean).join(" – ") || "–", "data-label": "Period" }),
        el("td", { text: String(posts.filter((p) => p.campaign === c.id).length), "data-label": "Posts" }),
        el("td", {}, [
          el("div", { class: "row-actions" }, [
            el("button", {
              type: "button",
              class: "secondary small",
              text: "Edit",
              onclick: () => {
                edited = c;
                name.value = c.name;
                utm.value = c.utmCampaign;
                utm.dataset.self = "1";
                from.value = c.from ?? "";
                to.value = c.to ?? "";
                goal.value = c.goal ?? "";
                save.textContent = "Save changes";
                cancel.hidden = false;
                form.open = true;
                name.focus();
              },
            }),
            el("button", {
              type: "button",
              class: "secondary small",
              text: c.archived ? "Restore" : "Archive",
              onclick: async () => {
                try {
                  const { id: _i, created: _a, updated: _g, ...rest } = c;
                  const updated = await ctx.api(`/api/campaigns/${c.id}`, {
                    method: "PUT",
                    body: { ...rest, archived: !c.archived },
                  });
                  campaigns = campaigns.map((x) => (x.id === c.id ? updated : x));
                  renderCampaigns();
                } catch (e) {
                  notice(e.message, "error");
                }
              },
            }),
            el("button", {
              type: "button",
              class: "secondary small danger",
              text: "Delete",
              onclick: async () => {
                if (
                  !(await confirmDialog(`Campaign "${c.name}" will be deleted.`, {
                    title: "Delete campaign?",
                    confirmText: "Delete",
                    dangerous: true,
                  }))
                )
                  return;
                try {
                  await ctx.api(`/api/campaigns/${c.id}`, { method: "DELETE" });
                  campaigns = campaigns.filter((x) => x.id !== c.id);
                  renderCampaigns();
                } catch (e) {
                  notice(e.message, "error");
                }
              },
            }),
          ]),
        ]),
      ]),
    );
    form.replaceChildren(
      el("summary", { text: "Add campaign" }),
      el("div", { class: "field-row" }, [
        el("div", { class: "field" }, [el("label", { for: "campaign-name", text: "Name" }), name]),
        el("div", { class: "field" }, [el("label", { for: "campaign-utm", text: "UTM campaign name" }), utm]),
        el("div", { class: "field" }, [el("label", { for: "campaign-from", text: "From" }), from]),
        el("div", { class: "field" }, [el("label", { for: "campaign-to", text: "Up to and including" }), to]),
      ]),
      el("div", { class: "field" }, [el("label", { for: "campaign-goal", text: "Goal (optional)" }), goal]),
      el("div", { class: "button-row" }, [save, cancel]),
    );
    campaignHolder.replaceChildren(
      el("h2", { text: "Campaigns" }),
      campaigns.length
        ? el("div", { class: "table-scroll" }, [
            el("table", { class: "list cards" }, [
              el("thead", {}, [
                el(
                  "tr",
                  {},
                  ["Campaign", "UTM name", "Period", "Posts", ""].map((t) => el("th", { scope: "col", text: t })),
                ),
              ]),
              el("tbody", {}, rows),
            ]),
          ])
        : el("p", {
            class: "help-text",
            text: "No campaigns yet. Group related posts and give their links a shared UTM name.",
          }),
      form,
    );
    // The campaign dropdown for the period follows the list above.
    renderPeriod();
  }

  // ---------------- drafts ----------------
  const problems = facts ? factProblems(posts, facts, localToday()) : new Set();
  const drafts = posts.filter((p) => p.status === "draft");
  const draftItems = deskOf(drafts, 4).map((p) => {
    const thumbnail = el("div", { class: "studio-thumbnail" });
    thumbnail.dataset.id = p.id;
    return el("li", { class: "studio-draft" }, [
      el("div", { class: "studio-artwork", "aria-hidden": "true" }, [thumbnail]),
      el("div", {}, [
        el("a", { href: `#editor/${p.id}`, class: "studio-plan-title", text: p.title }),
        el("span", { class: "table-subtext", text: `${templateOf(p.template)?.name ?? p.template} · Draft` }),
        problems.has(p.id)
          ? el("span", { class: "studio-draft-warning", text: "Needs an active fact before it can be scheduled." })
          : null,
      ]),
    ]);
  });
  const draftCard = el("section", { class: "studio-side-block studio-drafts" }, [
    el("div", { class: "studio-side-head" }, [
      el("h2", { text: "Still on your desk" }),
      drafts.length
        ? el("span", { class: "help-text", text: `${drafts.length} draft${drafts.length === 1 ? "" : "s"}` })
        : null,
    ]),
    draftItems.length
      ? el("ul", { class: "studio-draft-list" }, draftItems)
      : el("p", { class: "help-text", text: "No drafts on your desk." }),
    drafts.length > 4 ? el("a", { href: "#library/draft", text: "All drafts" }) : null,
  ]);
  const thumbnails = drawArtwork(draftCard, posts, ctx.brand);

  // On a phone the week comes first, then the period form, then the side column (CSS `order`).
  container.replaceChildren(
    el("div", { class: "studio-planner" }, [
      el("div", { class: "studio-planner-main" }, [
        periodCard,
        panel.element,
        el("div", { class: "card studio-plan-card" }, [
          el("div", { class: "studio-bar" }, [
            el("div", { class: "button-row", role: "group", "aria-label": "View" }, [listButton, monthButton]),
            icsButton,
          ]),
          calendarHolder,
          el("p", {
            class: "help-text studio-plan-closing",
            text: "Postwright keeps the plan. You export and upload the posts.",
          }),
        ]),
      ]),
      el("aside", { class: "studio-planner-side" }, [
        draftCard,
        el("div", { class: "card studio-campaigns-card" }, [campaignHolder]),
        el("div", { class: "studio-note" }, [
          el("strong", { text: "Check before you schedule." }),
          el("p", { text: "Save the post with a passing brand check, then choose a future date." }),
        ]),
      ]),
    ]),
  );
  render();
  renderCampaigns();
  return {
    leave: () => {
      observer?.disconnect();
      thumbnails.disconnect();
    },
  };
}
