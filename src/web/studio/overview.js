// Overview: the posts on the desk and a look at the week, then the rest at a glance: what has
// been left behind, a quiet note on facts that are no longer correct, the rhythm (last
// publication, empty weeks), the occasions coming up and the manual results.
import { el, emptyState, icon, notice } from "/ui.js";
import { localToday } from "/studio/recipe.js";
import { daysAgo } from "/studio/calendar.js";
import { allTemplates, template } from "/studio/templates.js";
import { format } from "/studio/formats.js";
import { deskOf, factProblems } from "/studio/desk.js";
import { dateTile, drawArtwork, postCard } from "/studio/post-cards.js";

/** How many posts lie on the desk. */
const DESK = 3;

/** YYYY-MM-DD readable, without time: "6 Oct". */
function readableDate(d) {
  return new Intl.DateTimeFormat("en-GB", { day: "numeric", month: "short", timeZone: "UTC" }).format(
    new Date(`${d}T12:00:00Z`),
  );
}

/**
 * "today", "yesterday" or "N days ago" for the last publication. In calendar days:
 * yesterday 23:00 is called "yesterday" at 08:00, not "today".
 */
function agoText(iso) {
  if (!iso) return "nothing yet";
  const n = daysAgo(iso);
  return n <= 0 ? "today" : n === 1 ? "yesterday" : `${n} days ago`;
}

const number = (n) => n.toLocaleString("en-GB");
const time = (iso) => new Intl.DateTimeFormat("en-GB", { hour: "2-digit", minute: "2-digit" }).format(new Date(iso));

/** The seven local dates (YYYY-MM-DD) of the week that holds `today`, Monday first. */
function weekOf(today) {
  const d = new Date(`${today}T12:00:00`);
  const monday = new Date(d);
  monday.setDate(d.getDate() - ((d.getDay() + 6) % 7));
  return Array.from({ length: 7 }, (_, i) => {
    const day = new Date(monday);
    day.setDate(monday.getDate() + i);
    return localToday(day);
  });
}

/** The week panel: the days with a dot where something is scheduled, then what is planned. */
function weekPanel(posts) {
  const today = localToday();
  const days = weekOf(today);
  const scheduled = posts
    .filter((p) => p.status === "scheduled" && p.scheduled)
    .map((p) => ({ ...p, day: localToday(new Date(p.scheduled)) }))
    .sort((a, b) => a.scheduled.localeCompare(b.scheduled));
  const thisWeek = scheduled.filter((p) => days.includes(p.day));
  const label = (d, i) =>
    new Intl.DateTimeFormat("en-GB", { weekday: "narrow" }).format(new Date(`${days[i]}T12:00:00`));
  const item = (p) =>
    el("a", { class: "studio-agenda-item", href: `#editor/${p.id}` }, [
      el("span", { class: "studio-agenda-time", text: time(p.scheduled) }),
      el("span", {}, [el("strong", { text: p.title }), el("small", { text: "Scheduled" })]),
    ]);
  const todays = thisWeek.filter((p) => p.day === today);
  // Today's posts have their own list above; "next" starts tomorrow.
  const upcoming = scheduled.filter((p) => p.day > today);
  const later = upcoming[0];
  const weekday = (iso, style) => new Intl.DateTimeFormat("en-GB", style).format(new Date(iso));
  const next = (p) =>
    el("a", { class: "studio-next-item", href: `#editor/${p.id}` }, [
      dateTile(p.scheduled),
      el("span", {}, [
        el("strong", { text: p.title }),
        el("small", {
          text: `${weekday(p.scheduled, { weekday: "long" })} · ${time(p.scheduled)} · ${format(p.formats[0])?.name ?? p.formats[0]}`,
        }),
      ]),
    ]);
  // Nothing from today to Sunday: say so kindly and point at the next post.
  const breathing = el("div", { class: "studio-breathing" }, [
    icon("calendar"),
    el("h3", { text: "A little breathing room." }),
    el("p", {
      text: `No posts planned this week.${later ? ` Your next post is on ${weekday(later.scheduled, { weekday: "long", day: "numeric", month: "long" })}.` : ""}`,
    }),
    el("a", { class: "text-link", href: "#planning" }, ["Look at your plan ", icon("arrow")]),
  ]);
  const first = new Date(`${days[0]}T12:00:00`);
  const last = new Date(`${days[6]}T12:00:00`);
  const range = `${first.getDate()}–${new Intl.DateTimeFormat("en-GB", { day: "numeric", month: "long" }).format(last)}`;
  return el("aside", { class: "studio-week-panel", "aria-label": "The week ahead" }, [
    el("div", { class: "section-heading" }, [
      el("div", {}, [el("h2", { text: "The week ahead" }), el("p", { class: "help-text", text: range })]),
      el("a", { class: "text-link", href: "#planning", "aria-label": "Open the planner" }, [icon("calendar")]),
    ]),
    el(
      "ol",
      { class: "studio-week-days" },
      days.map((d, i) =>
        el("li", { class: d === today ? "today" : "", "aria-current": d === today ? "date" : null }, [
          el("span", { text: label(d, i) }),
          el("strong", { text: String(Number(d.slice(8))) }),
          el("i", {
            class: thisWeek.some((p) => p.day === d) ? "has-post" : "",
            "aria-label": thisWeek.some((p) => p.day === d) ? "has a scheduled post" : null,
          }),
        ]),
      ),
    ),
    todays.length
      ? el("div", {}, [el("p", { class: "studio-agenda-label", text: "Today" }), ...todays.map(item)])
      : thisWeek.some((p) => p.day > today)
        ? null
        : breathing,
    el("p", { class: "studio-agenda-label", text: "Next on the calendar" }),
    upcoming.length
      ? el("div", {}, upcoming.slice(0, 3).map(next))
      : el("p", {
          class: "help-text studio-agenda-empty",
          text: todays.length ? "Nothing scheduled after today." : "Nothing scheduled yet.",
        }),
  ]);
}

/** A row of the "at a glance" lists: a label and a value, optionally a link. */
function row(label, value, href) {
  return el("div", { class: "status-row" }, [
    href ? el("a", { href, text: label }) : el("span", { text: label }),
    el("b", { text: String(value) }),
  ]);
}

export async function show(container, ctx) {
  const [o, { posts }, { facts }, { snippets }] = await Promise.all([
    ctx.api("/api/overview"),
    ctx.api("/api/posts"),
    ctx.api("/api/facts").catch(() => ({ facts: null })),
    ctx.api("/api/snippets").catch(() => ({ snippets: [] })),
  ]);
  if (!ctx.valid()) return undefined;
  const mb = o.media.bytes / (1024 * 1024);
  const today = localToday();

  /** The empty desk, with the button that adds sample content so a new user sees something. */
  const emptyDesk = () => {
    const empty = emptyState("Nothing on your desk yet", "Make a post, or add the sample content to look around.", {
      text: "New post",
      href: "#editor",
    });
    empty.append(
      el("button", {
        type: "button",
        class: "secondary",
        text: "Add sample content",
        onclick: async () => {
          try {
            await ctx.api("/api/sample-content", { method: "POST", body: {} });
            notice("Sample facts, snippets and posts added");
            await show(container, ctx);
          } catch (e) {
            notice(e.message, "error");
          }
        },
      }),
    );
    return empty;
  };

  // The desk: the posts worked on most recently, the archive left out.
  const desk = deskOf(posts, DESK);
  const problems = facts ? factProblems(posts, facts, today) : new Set();
  const deskGrid = el(
    "div",
    { class: "studio-post-grid studio-desk" },
    desk.map((p) =>
      postCard(p, {
        meta: `${template(p.template)?.name ?? p.template} · ${format(p.formats[0])?.name ?? p.formats[0]}`,
        detail: p.status === "scheduled" && p.scheduled ? readableDate(localToday(new Date(p.scheduled))) : null,
        warning: problems.has(p.id)
          ? el("a", { class: "studio-fact-warning", href: `#editor/${p.id}` }, [
              icon("attention"),
              "Review linked fact",
            ])
          : null,
      }),
    ),
  );
  const offDesk = [...problems].filter((id) => !desk.some((p) => p.id === id)).length;
  const count = (key) => posts.filter((p) => p.status === key).length;
  const plural = (n, one, many) => `${n} ${n === 1 ? one : many}`;

  const signals = [
    o.overdue
      ? el("div", { class: "studio-signal", role: "status" }, [
          el("b", {
            text: `${o.overdue} scheduled post${o.overdue === 1 ? " is" : "s are"} past due and not marked as published.`,
          }),
          " ",
          el("a", { href: "#planning", text: "Open the planner" }),
        ])
      : null,
  ].filter(Boolean);

  container.replaceChildren(
    ...signals,
    el("div", { class: "studio-overview-top" }, [
      el("span", {
        text: new Intl.DateTimeFormat("en-GB", {
          weekday: "long",
          day: "numeric",
          month: "long",
          year: "numeric",
        }).format(new Date(`${today}T12:00:00`)),
      }),
      el("span", {}, [
        el("b", { text: String(count("draft")) }),
        count("draft") === 1 ? " draft" : " drafts",
        el("span", { class: "studio-separator", "aria-hidden": "true", text: "/" }),
        el("b", { text: String(count("scheduled")) }),
        " scheduled",
      ]),
    ]),
    el("section", { class: "studio-dashboard" }, [
      el("div", {}, [
        el("div", { class: "section-heading" }, [
          el("h2", { text: "On your creative desk" }),
          el("a", { class: "text-link", href: "#library" }, ["View all posts ", icon("arrow")]),
        ]),
        desk.length ? deskGrid : emptyDesk(),
        offDesk
          ? el("p", { class: "help-text studio-desk-note" }, [
              `${plural(offDesk, "more post relies", "more posts rely")} on a fact that is no longer usable. `,
              el("a", { href: "#library/fact", text: "See which" }),
            ])
          : null,
      ]),
      weekPanel(posts),
    ]),
    el("section", { class: "studio-foot", "aria-label": "Brand and results" }, [
      el("div", {}, [
        el("h2", { text: "Built on your brand" }),
        row("Templates", allTemplates().length, "#templates"),
        row("Facts to review", (facts ?? []).filter((f) => f.status === "draft").length, "#facts"),
        row("Snippets", snippets.length, "#snippets"),
        row(`Uploaded images · ${o.media.count}`, `${mb.toFixed(1)} MB`, "#settings"),
        mb > 100 ? el("p", { class: "help-text", text: "Clear out old uploaded images under Settings." }) : null,
      ]),
      el("div", {}, [
        el("h2", { text: "Results, past six months" }),
        o.results.length
          ? el("div", { class: "table-scroll narrow" }, [
              el("table", { class: "list" }, [
                el("thead", {}, [
                  el("tr", {}, [
                    el("th", { text: "Template" }),
                    el("th", { class: "number", text: "Posts" }),
                    el("th", { class: "number", text: "Impressions" }),
                    el("th", { class: "number", text: "Comments" }),
                    el("th", { class: "number", text: "Clicks" }),
                  ]),
                ]),
                el(
                  "tbody",
                  {},
                  o.results.map((r) =>
                    el("tr", {}, [
                      el("td", { text: template(r.template)?.name ?? r.template }),
                      el("td", { class: "number", text: number(r.posts) }),
                      el("td", { class: "number", text: number(r.impressions) }),
                      el("td", { class: "number", text: number(r.comments) }),
                      el("td", { class: "number", text: number(r.clicks) }),
                    ]),
                  ),
                ),
              ]),
            ])
          : el("p", {
              class: "help-text",
              text: "Once a post is published, add its figures in the studio. Your results will appear here.",
            }),
      ]),
    ]),
    el("section", { class: "studio-glance", "aria-label": "At a glance" }, [
      el("div", {}, [
        el("h2", { text: "Rhythm" }),
        row("Scheduled, next 7 days", o.scheduledThisWeek, "#planning"),
        row("Drafts", o.drafts, "#library/draft"),
        row("Published, 30 days", o.published30, "#library/published"),
        row("Last publication", agoText(o.lastPublished), "#library/published"),
        row("Empty weeks of the next four", o.emptyWeeks.length, "#planning"),
        row("Open ideas", o.openIdeas, "#planning"),
      ]),
      el("div", {}, [
        el("h2", { text: "Moments coming up" }),
        o.moments.length
          ? el(
              "div",
              {},
              o.moments.map((m) =>
                el("div", { class: "status-row" }, [
                  el("span", { text: m.title }),
                  el("b", { text: readableDate(m.date) }),
                ]),
              ),
            )
          : el("p", { class: "help-text", text: "No moments in the next 60 days." }),
      ]),
    ]),
  );
  const observer = drawArtwork(deskGrid, desk, ctx.brand);
  return { leave: () => observer.disconnect() };
}
