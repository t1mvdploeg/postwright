// Marketing studio: Overview: what is on this week, what has been left behind, and where a
// post relies on a fact that is no longer correct. Also the rhythm (last publication,
// empty weeks), the calendar of occasions and the manual results.
import { el, emptyState, notice } from "/ui.js";
import { readableMoment } from "/studio/recipe.js";
import { daysAgo } from "/studio/calendar.js";
import { template } from "/studio/templates.js";

function statCard(label, value, help, goal) {
  return el("a", { class: "stat-card", href: goal }, [
    el("span", { class: "stat-label", text: label }),
    el("strong", { text: String(value) }),
    el("span", { class: "stat-help", text: help }),
  ]);
}

/** YYYY-MM-DD readable, without time: "6 Oct". */
function readableDate(d) {
  return new Intl.DateTimeFormat("en-GB", { day: "numeric", month: "short", timeZone: "UTC" }).format(
    new Date(`${d}T12:00:00Z`),
  );
}

/**
 * "today", "yesterday" or "N days ago", for the Last publication stat card. In calendar
 * days: yesterday 23:00 is called "yesterday" at 08:00, not "today".
 */
function agoText(iso) {
  if (!iso) return { value: "–", help: "Nothing published yet" };
  const n = daysAgo(iso);
  const value = n <= 0 ? "today" : n === 1 ? "yesterday" : `${n} days ago`;
  return { value, help: "Since the last published post" };
}

const number = (n) => n.toLocaleString("en-GB");

export async function show(container, ctx) {
  const o = await ctx.api("/api/overview");
  if (!ctx.valid()) return;
  const mb = o.media.bytes / (1024 * 1024);
  /**
   * The empty state with the button that adds sample content, so that a new user sees
   * something straight away.
   */
  const emptyStateWithSample = () => {
    const empty = emptyState(
      "Nothing scheduled",
      "Make a post and schedule it; it then appears here and in the calendar export.",
      { text: "New post", href: "#editor" },
    );
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
  const lastPublication = agoText(o.lastPublished);
  container.replaceChildren(
    el("section", { class: "page-intro" }, [
      el("div", {}, [
        el("p", { class: "intro-label", text: "Marketing" }),
        el("p", {
          text: "Make posts from the brand kit, check, schedule and export them. Every number belongs to a fact with a source.",
        }),
      ]),
      el("div", { class: "button-row" }, [
        el("a", { class: "button", href: "#editor", text: "New post" }),
        el("a", { class: "button secondary-link", href: "#editor/new/carousel", text: "New carousel" }),
      ]),
    ]),
    // replaceChildren turns null into the text "null"; hence an empty list instead of null.
    ...(o.withUnusableFact
      ? [
          el("div", { class: "card studio-signal", role: "status" }, [
            el("b", {
              text: `${o.withUnusableFact} post${o.withUnusableFact === 1 ? "" : "s"} ${o.withUnusableFact === 1 ? "relies" : "rely"} on a fact that has expired, been withdrawn or been deleted.`,
            }),
            " ",
            el("a", { href: "#library/fact", text: "See which" }),
          ]),
        ]
      : []),
    el("section", { class: "stat-grid six", "aria-label": "Marketing key figures" }, [
      statCard("Scheduled, next 7 days", o.scheduledThisWeek, "Ready to post", "#planning"),
      statCard("Overdue", o.overdue, "Scheduled but not marked as published", "#planning"),
      statCard("Drafts", o.drafts, "Not scheduled yet", "#library/draft"),
      statCard("Published, 30 days", o.published30, "Marked as published", "#library/published"),
      statCard("Last publication", lastPublication.value, lastPublication.help, "#library/published"),
      statCard(
        "Empty weeks",
        o.emptyWeeks.length,
        "of the next four without a scheduled post (ideas do not count)",
        "#planning",
      ),
    ]),
    el("section", { class: "overview-grid" }, [
      el("div", { class: "card overview-main" }, [
        el("div", { class: "card-headline" }, [
          el("div", {}, [el("h2", { text: "Next posts" }), el("p", { text: "The next three scheduled posts" })]),
          el("a", { href: "#planning", text: "Planning" }),
        ]),
        o.next.length
          ? el(
              "div",
              {},
              o.next.map((p) =>
                el("div", { class: "status-row" }, [
                  el("a", { href: `#editor/${p.id}`, text: p.title }),
                  el("b", { text: readableMoment(p.scheduled) }),
                ]),
              ),
            )
          : emptyStateWithSample(),
      ]),
      el("div", { class: "overview-side" }, [
        el("div", { class: "card" }, [
          el("h2", { text: "Quick links" }),
          el("nav", { class: "jump-to", "aria-label": "Quick links" }, [
            el("a", { href: "#library", text: "All posts" }),
            el("a", { href: "#facts", text: "Fact bank" }),
            el("a", { href: "#brand-kit", text: "Brand kit" }),
            el("a", { href: "#planning", text: "Agenda-export" }),
          ]),
        ]),
        el("div", { class: "card" }, [
          el("h2", { text: "Upcoming moments" }),
          o.moments.length
            ? el(
                "div",
                {},
                o.moments.map((m) =>
                  el("div", { class: "status-row" }, [el("span", { text: `${readableDate(m.date)} · ${m.title}` })]),
                ),
              )
            : el("p", { class: "help-text", text: "No moments in the next 60 days" }),
          el("a", { href: "#planning", text: "Planning" }),
        ]),
        el("div", { class: "card" }, [
          el("h2", { text: "Ideas" }),
          el("p", { text: `${o.openIdeas} open idea${o.openIdeas === 1 ? "" : "s"}` }),
          el("a", { href: "#planning", text: "To the planner" }),
        ]),
        el("div", { class: "card" }, [
          el("h2", { text: "Results, past six months" }),
          o.results.length
            ? el("div", { class: "table-scroll" }, [
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
                text: "Fill in the figures on a published post; they appear here.",
              }),
        ]),
        el("div", { class: "card" }, [
          el("h2", { text: "Uploaded images" }),
          el("div", { class: "status-row" }, [
            el("span", { text: `${o.media.count} image${o.media.count === 1 ? "" : "s"}` }),
            el("b", {
              class: mb > 100 ? "status-attention" : "status-good",
              text: `${mb.toFixed(1).replace(".", ",")} MB`,
            }),
          ]),
          mb > 100 ? el("p", { class: "help-text", text: "Clear out old uploaded images under Settings." }) : null,
          el("a", { href: "#settings", text: "Manage images" }),
        ]),
      ]),
    ]),
  );
}
