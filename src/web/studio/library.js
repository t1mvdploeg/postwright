// Library: all posts (recipes) as cards, with the status as tabs and further filters next to
// the search.
import { confirmDialog, el, emptyState, icon, notice } from "/ui.js";
import { allTemplates, template as templateOf, templateLabel } from "/studio/templates.js";
import { factUsable } from "/studio/brand-check.js";
import { readableMoment, localToday } from "/studio/recipe.js";
import { CHANNELS, FORMATS, channelsOf } from "/studio/formats.js";

const FORMAT_NAME = new Map(FORMATS.map((f) => [f.key, f.name]));
import { drawArtwork, postCard } from "/studio/post-cards.js";

const PER_PAGE = 24;
const STATUS_TABS = [
  ["active", "All posts"],
  ["draft", "Draft"],
  ["scheduled", "Scheduled"],
  ["published", "Published"],
  ["archived", "Archived"],
  ["fact", "Unusable fact"],
  ["all", "Everything"],
];

export async function show(container, ctx) {
  const [{ posts }, { campaigns }, factsResponse] = await Promise.all([
    ctx.api("/api/posts"),
    ctx.api("/api/campaigns"),
    ctx.api("/api/facts").catch(() => ({ facts: [] })),
  ]);
  if (!ctx.valid()) return undefined;
  const today = localToday();
  const usable = new Set(factsResponse.facts.filter((f) => factUsable(f, today)).map((f) => f.id));
  const withProblem = (p) => p.facts.some((id) => !usable.has(id));

  // The status filter is a row of tabs; `status.value` is the chosen one.
  const status = { value: STATUS_TABS.some(([w]) => w === ctx.parts[0]) ? ctx.parts[0] : "active" };
  const tabs = el(
    "div",
    { class: "studio-tabs-row", role: "group", "aria-label": "Status" },
    STATUS_TABS.map(([w, t]) =>
      el("button", {
        type: "button",
        class: "studio-filter-tab",
        "data-value": w,
        "aria-pressed": String(w === status.value),
        text: t,
        onclick: () => {
          status.value = w;
          for (const b of tabs.children) b.setAttribute("aria-pressed", String(b.dataset.value === w));
          visible = PER_PAGE;
          render();
        },
      }),
    ),
  );
  const campaign = el("select", { id: "filter-campaign", class: "small", "aria-label": "Campaign" }, [
    el("option", { value: "", text: "All campaigns" }),
    ...campaigns.map((c) => el("option", { value: c.id, text: c.name })),
  ]);
  const channel = el("select", { id: "filter-channel", class: "small", "aria-label": "Channel" }, [
    el("option", { value: "", text: "All channels" }),
    ...Object.entries(CHANNELS).map(([k, name]) => el("option", { value: k, text: name })),
  ]);
  const templateFilter = el("select", { id: "filter-template", class: "small", "aria-label": "Template" }, [
    el("option", { value: "", text: "All templates" }),
    ...allTemplates().map((s) => el("option", { value: s.id, text: templateLabel(s) })),
  ]);
  const search = el("input", {
    type: "search",
    id: "filter-search",
    placeholder: "Search your posts…",
    "aria-label": "Search by title",
  });
  const tableHolder = el("div");
  const more = el("button", { type: "button", class: "secondary", text: "Show more", hidden: "" });
  let visible = PER_PAGE;
  let observer = null;

  function filtered() {
    const q = search.value.trim().toLowerCase();
    return posts.filter((p) => {
      if (status.value === "active" && p.status === "archived") return false;
      if (["draft", "scheduled", "published", "archived"].includes(status.value) && p.status !== status.value)
        return false;
      if (status.value === "fact" && !(withProblem(p) && p.status !== "archived")) return false;
      if (campaign.value && p.campaign !== campaign.value) return false;
      if (channel.value && !channelsOf(p).includes(channel.value)) return false;
      if (templateFilter.value && p.template !== templateFilter.value) return false;
      return !q || p.title.toLowerCase().includes(q);
    });
  }

  async function setStatus(p, target) {
    try {
      const updated = await ctx.api(`/api/posts/${p.id}/status`, { method: "POST", body: { target } });
      Object.assign(p, updated);
      render();
    } catch (e) {
      notice(e.message, "error");
    }
  }

  async function duplicate(p) {
    try {
      const copy = await ctx.api(`/api/posts/${p.id}/duplicate`, { method: "POST", body: {} });
      ctx.navigate(`#editor/${copy.id}`);
    } catch (e) {
      notice(e.message, "error");
    }
  }

  async function erase(p) {
    if (
      !(await confirmDialog(`The post "${p.title}" will be deleted permanently.`, {
        title: "Delete post?",
        confirmText: "Delete",
        dangerous: true,
      }))
    )
      return;
    try {
      await ctx.api(`/api/posts/${p.id}`, { method: "DELETE" });
      posts.splice(posts.indexOf(p), 1);
      render();
    } catch (e) {
      notice(e.message, "error");
    }
  }

  function render() {
    observer?.disconnect();
    const list = filtered();
    if (!posts.length) {
      tableHolder.replaceChildren(
        emptyState("No posts yet", "Choose a template from the brand kit and make your first post.", {
          text: "New post",
          href: "#editor",
        }),
      );
      more.hidden = true;
      return;
    }
    if (!list.length) {
      tableHolder.replaceChildren(emptyState("No posts match these filters", "Adjust the filters to see more."));
      more.hidden = true;
      return;
    }
    const campaignName = new Map(campaigns.map((c) => [c.id, c.name]));
    const cards = list.slice(0, visible).map((p) => {
      const s = templateOf(p.template);
      const moment =
        p.status === "scheduled"
          ? readableMoment(p.scheduled)
          : p.status === "published"
            ? readableMoment(p.published?.on)
            : null;
      const meta = [
        s?.name ?? p.template,
        FORMAT_NAME.get(p.formats[0]),
        p.campaign ? (campaignName.get(p.campaign) ?? "campaign") : null,
      ]
        .filter(Boolean)
        .join(" · ");
      return postCard(p, {
        meta,
        side: el("span", { class: "studio-post-when", text: moment ?? "" }),
        warning:
          withProblem(p) && p.status !== "archived"
            ? el("span", { class: "badge badge-warning", text: "Fact not usable" })
            : null,
        extra: el("div", { class: "studio-post-actions" }, [
          el("details", { class: "post-menu" }, [
            el("summary", { "aria-label": `More actions for ${p.title}`, text: "⋯" }),
            el("div", { class: "post-menu-list" }, [
              el("button", {
                type: "button",
                class: "secondary small",
                text: "Duplicate",
                onclick: () => duplicate(p),
              }),
              p.status === "archived"
                ? el("button", {
                    type: "button",
                    class: "secondary small",
                    text: "Restore",
                    onclick: () => setStatus(p, "draft"),
                  })
                : el("button", {
                    type: "button",
                    class: "secondary small",
                    text: "Archive",
                    onclick: () => setStatus(p, "archived"),
                  }),
              el("button", {
                type: "button",
                class: "secondary small danger",
                text: "Delete",
                "aria-label": `Delete ${p.title}`,
                onclick: () => erase(p),
              }),
            ]),
          ]),
        ]),
      });
    });
    tableHolder.replaceChildren(el("div", { class: "studio-post-grid", "aria-label": "Posts in the studio" }, cards));
    more.hidden = list.length <= visible;
    observer = drawArtwork(tableHolder, posts, ctx.brand);
  }

  for (const f of [campaign, channel, templateFilter])
    f.addEventListener("change", () => {
      visible = PER_PAGE;
      render();
    });
  search.addEventListener("input", () => {
    visible = PER_PAGE;
    render();
  });
  more.addEventListener("click", () => {
    visible += PER_PAGE;
    render();
  });

  container.replaceChildren(
    el("div", { class: "studio-filter-bar" }, [
      tabs,
      el("div", { class: "studio-filter-tools" }, [
        campaign,
        channel,
        templateFilter,
        el("label", { class: "studio-search" }, [icon("search"), search]),
      ]),
    ]),
    tableHolder,
    el("div", { class: "button-row studio-more" }, [more]),
  );
  render();

  // The "more actions" menus (a native <details> on a phone): a click elsewhere closes them, and
  // Escape closes the open one and puts focus back on its button.
  const openMenus = () => container.querySelectorAll(".post-menu[open]");
  const onClick = (e) => {
    for (const menu of openMenus()) if (!menu.contains(e.target) || e.target.closest("button")) menu.open = false;
  };
  const onKey = (e) => {
    if (e.key !== "Escape") return;
    for (const menu of openMenus()) {
      menu.open = false;
      menu.querySelector("summary").focus();
    }
  };
  document.addEventListener("click", onClick);
  document.addEventListener("keydown", onKey);
  return {
    leave: () => {
      observer?.disconnect();
      document.removeEventListener("click", onClick);
      document.removeEventListener("keydown", onKey);
    },
  };
}
