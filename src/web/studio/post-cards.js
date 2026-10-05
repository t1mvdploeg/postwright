// Posts as cards: the artwork first, then the title and the status. Used by the overview (the
// desk) and the library. An artwork is only drawn when its card comes into view; a recipe is
// small, an image is not.
import { el } from "/ui.js";
import { buildImage } from "/studio/templates.js";
import { showPreview } from "/studio/render.js";
import { loadMedia } from "/studio/brand.js";
import { imagesOf, mediaIdsOf } from "/studio/slides.js";

export const STATUS = { draft: "Draft", scheduled: "Scheduled", published: "Published", archived: "Archived" };

export function statusBadge(status) {
  return el("span", { class: `badge studio-badge-${status}`, text: STATUS[status] });
}

/**
 * One post as a card. `meta` is the line under the title (or null), `side` sits right of the
 * status, `warning` on its own line under it and `extra` (buttons) at the bottom.
 */
export function postCard(p, { meta = null, side = null, warning = null, extra = null } = {}) {
  const art = el("div", { class: "studio-thumbnail" });
  art.dataset.id = p.id;
  const count = imagesOf(p).length;
  return el("article", { class: "studio-post-card" }, [
    el("a", { href: `#editor/${p.id}`, class: "studio-post-link" }, [
      el("div", { class: "studio-artwork", "aria-hidden": "true" }, [art]),
      el("h3", { text: p.title }),
    ]),
    meta ? el("p", { class: "studio-post-meta", text: meta }) : null,
    el("div", { class: "studio-post-status" }, [
      statusBadge(p.status),
      count > 1 ? el("span", { class: "badge", text: `${count} slides` }) : null,
      side,
    ]),
    warning ? el("p", { class: "studio-post-warning" }, [warning]) : null,
    extra,
  ]);
}

/**
 * Draws the artwork of every card in `root` once it comes into view, in the first format of
 * its post. Returns the observer, to disconnect when the screen is left or redrawn.
 */
export function drawArtwork(root, posts, brand) {
  const byId = new Map(posts.map((p) => [p.id, p]));
  const observer = new IntersectionObserver(
    (entries) => {
      for (const entry of entries) {
        if (!entry.isIntersecting) continue;
        observer.unobserve(entry.target);
        const holder = entry.target;
        const p = byId.get(holder.dataset.id);
        void (async () => {
          try {
            const media = await loadMedia(mediaIdsOf(p));
            const image = buildImage({ ...imagesOf(p)[0], format: p.formats[0], brand, media });
            // The artwork fits the square box: a portrait or a banner keeps its shape, centred.
            const side = holder.parentElement.clientWidth;
            const scale = showPreview(holder, image, { maxHeight: side });
            holder.style.width = `${Math.round(image.width * scale)}px`;
          } catch {
            holder.textContent = "–";
          }
        })();
      }
    },
    { rootMargin: "100px" },
  );
  for (const m of root.querySelectorAll(".studio-artwork .studio-thumbnail")) observer.observe(m);
  return observer;
}
