// One template as a gallery card, for the editor's gallery and the Templates screen: a thumbnail
// that is drawn when it scrolls into view, the name (with "Your template" for an own one), the goal,
// the formats, and whatever buttons the screen puts at the bottom.
import { el } from "/ui.js";
import { format as formatOf } from "/studio/formats.js";
import { buildImage, defaultContent, template as templateOf } from "/studio/templates.js";
import { showPreview } from "/studio/render.js";

/** `actions`: elements for the foot of the card (a link, buttons). */
export function templateCard(s, actions = []) {
  const card = el("article", { class: "studio-template-card" }, [
    el("div", { class: "studio-thumbnail", "aria-hidden": "true" }),
    el("div", { class: "studio-template-card-text" }, [
      el("h2", { text: s.name }),
      s.own ? el("span", { class: "badge badge-draft", text: "Your template" }) : null,
      el("p", { text: s.goal }),
      el("p", { class: "studio-format-list", text: s.formats.map((x) => formatOf(x).name).join(" · ") }),
    ]),
    ...(actions.length ? [el("div", { class: "button-row" }, actions)] : []),
  ]);
  card.dataset.template = s.id;
  card.dataset.format = s.formats[0];
  return card;
}

/**
 * Draws the thumbnails of `cards` when they come into view: a dozen full images at once is heavy.
 * Returns the observer; call `disconnect()` when the screen is left.
 */
export function observeThumbnails(cards, brand) {
  const observer = new IntersectionObserver(
    (lines) => {
      for (const r of lines) {
        if (!r.isIntersecting) continue;
        observer.unobserve(r.target);
        const s = templateOf(r.target.dataset.template);
        if (!s) continue;
        const image = buildImage({
          template: s.id,
          content: defaultContent(s),
          format: r.target.dataset.format,
          brand,
        });
        showPreview(r.target.querySelector(".studio-thumbnail"), image, { maxHeight: 220 });
      }
    },
    { rootMargin: "200px" },
  );
  for (const card of cards) observer.observe(card);
  return observer;
}
