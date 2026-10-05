// Marketing studio: Library: all posts (recipes), with filters. A thumbnail is only
// rendered when its row comes into view; a recipe is small, an image is not.
import { confirmDialog, el, emptyState, notice } from "/ui.js";
import { TEMPLATES, buildImage, template as templateOf } from "/studio/templates.js";
import { showPreview } from "/studio/render.js";
import { loadMedia } from "/studio/brand.js";
import { factUsable } from "/studio/brand-check.js";
import { readableMoment, localToday } from "/studio/recipe.js";
import { CHANNELS, channelsOf } from "/studio/formats.js";

const STATUS = { draft: "Draft", scheduled: "Scheduled", published: "Published", archived: "Archived" };
const PER_PAGE = 24;

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

  const beginFilter = ctx.share[0] ?? "active";
  const status = el(
    "select",
    { id: "filter-status" },
    [
      ["active", "Everything except the archive"],
      ["draft", "Draft"],
      ["scheduled", "Scheduled"],
      ["published", "Published"],
      ["archived", "Archived"],
      ["fact", "With an unusable fact"],
      ["all", "All"],
    ].map(([w, t]) => el("option", { value: w, text: t, ...(w === beginFilter ? { selected: "" } : {}) })),
  );
  const campaign = el("select", { id: "filter-campaign" }, [
    el("option", { value: "", text: "All campaigns" }),
    ...campaigns.map((c) => el("option", { value: c.id, text: c.name })),
  ]);
  const channel = el("select", { id: "filter-channel" }, [
    el("option", { value: "", text: "All channels" }),
    ...Object.entries(CHANNELS).map(([k, name]) => el("option", { value: k, text: name })),
  ]);
  const templateFilter = el("select", { id: "filter-template" }, [
    el("option", { value: "", text: "All templates" }),
    ...TEMPLATES.map((s) => el("option", { value: s.id, text: s.name })),
  ]);
  const search = el("input", { type: "search", id: "filter-search", placeholder: "Search by title" });
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
      const isNew = await ctx.api(`/api/posts/${p.id}/status`, { method: "POST", body: { target } });
      Object.assign(p, isNew);
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
    const rows = list.slice(0, visible).map((p) => {
      const s = templateOf(p.template);
      const mini = el("div", { class: "studio-thumbnail small", "aria-hidden": "true" });
      mini.dataset.id = p.id;
      const moment =
        p.status === "scheduled"
          ? readableMoment(p.scheduled)
          : p.status === "published"
            ? readableMoment(p.published?.on)
            : "–";
      return el("tr", {}, [
        el("td", { class: "studio-cell-mini" }, [mini]),
        el("td", {}, [
          el("a", { href: `#editor/${p.id}`, text: p.title }),
          withProblem(p) && p.status !== "archived"
            ? el("span", { class: "badge badge-warning", text: "Fact not usable" })
            : null,
          el("span", {
            class: "table-subtext",
            text: `${s?.name ?? p.template}${p.campaign ? ` · ${campaignName.get(p.campaign) ?? "campaign"}` : ""}`,
          }),
        ]),
        el("td", {}, [el("span", { class: `badge studio-badge-${p.status}`, text: STATUS[p.status] })]),
        el("td", { text: moment }),
        el("td", { text: new Date(p.updated).toLocaleDateString("en-GB") }),
        el("td", {}, [
          el("div", { class: "row-actions" }, [
            el("button", { type: "button", class: "secondary small", text: "Duplicate", onclick: () => duplicate(p) }),
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
      ]);
    });
    tableHolder.replaceChildren(
      el("div", { class: "table-scroll" }, [
        el("table", { class: "list studio-library" }, [
          el("caption", { class: "visual-hidden", text: "Posts in the studio" }),
          el("thead", {}, [
            el(
              "tr",
              {},
              ["Image", "Title", "Status", "Scheduled or published", "Updated", "Actions"].map((t) =>
                el("th", { scope: "col", text: t }),
              ),
            ),
          ]),
          el("tbody", {}, rows),
        ]),
      ]),
    );
    more.hidden = list.length <= visible;
    const byId = new Map(posts.map((p) => [p.id, p]));
    observer = new IntersectionObserver(
      (lines) => {
        for (const r of lines) {
          if (!r.isIntersecting) continue;
          observer.unobserve(r.target);
          const p = byId.get(r.target.dataset.id);
          void (async () => {
            try {
              const ids = [p.content, ...p.slides.map((d) => d.content)].flatMap((i) => Object.values(i ?? {}));
              const media = await loadMedia(ids);
              const image = buildImage({
                template: p.template,
                content: p.content,
                slides: p.slides,
                slide: 0,
                format: p.formats[0],
                brand: ctx.brand,
                media,
              });
              showPreview(r.target, image, { maxHeight: 64 });
            } catch {
              r.target.textContent = "–";
            }
          })();
        }
      },
      { rootMargin: "100px" },
    );
    for (const m of tableHolder.querySelectorAll(".studio-thumbnail")) observer.observe(m);
  }

  for (const f of [status, campaign, channel, templateFilter])
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
    el("div", { class: "card" }, [
      el("div", { class: "studio-filters" }, [
        el("div", { class: "field" }, [el("label", { for: "filter-status", text: "Status" }), status]),
        el("div", { class: "field" }, [el("label", { for: "filter-campaign", text: "Campaign" }), campaign]),
        el("div", { class: "field" }, [el("label", { for: "filter-channel", text: "Channel" }), channel]),
        el("div", { class: "field" }, [el("label", { for: "filter-template", text: "Template" }), templateFilter]),
        el("div", { class: "field" }, [el("label", { for: "filter-search", text: "Search" }), search]),
      ]),
      tableHolder,
      more,
    ]),
  );
  render();
  return { leave: () => observer?.disconnect() };
}
