# Multi-slide posts: design

## Goal

Every image post can have several slides, and each slide picks its own template: slide 1 a Statement, slide 2 a Statistic, slide 3 a Question. The result is posted as an Instagram carousel (one PNG per slide) or a LinkedIn document post (a PDF). A post with one slide works exactly as today. The Carousel template, with its cover, step and closing slides and the step chain, stays as it is and cannot be mixed with other templates.

## Data shape

Slide 1 stays where it is: `post.template` and `post.content`. The extra slides go in a new list:

```ts
type Post = {
  // … unchanged fields …
  template: string;   // slide 1
  content: Record<string, string>;  // slide 1
  slides: { kind: string; content: Content }[];   // carousel only, unchanged
  moreSlides: { template: string; content: Content }[];  // NEW: slides 2..n of an image post
};
```

- `PostInputSchema` (`src/server/schema.ts`) gets `moreSlides: z.array(MoreSlideSchema).max(19).default([])`, with `MoreSlideSchema` strict: `template` matches `TEMPLATE_ID`, `content` is `Content`. Twenty slides in total, Instagram's maximum.
- The server rejects a post with `kind: "carousel"` and a non-empty `moreSlides`.
- No migration. Old post files lack `moreSlides`, and every reader treats a missing list as `[]`. The two places that crash today on a missing `slides` (`mediaUsage` in `store.ts`, `post-cards.js`) get the same `?? []`.
- `contentDiffers` (`routes.ts`) also compares `moreSlides`, so an edited extra slide drops a stale brand check. `mediaUsage` counts media in `moreSlides`.

## One helper for "the images of a post"

`imagesOf(post)` in `src/web/studio/recipe.js` returns, per slide, the arguments `buildImage` needs except format, brand and media:

- image post: `[{ template: post.template, content: post.content }, ...post.moreSlides]`, each with its `slide` index;
- carousel: one entry per carousel slide, `{ template: post.template, slides: post.slides, slide: i }`.

Export, brand check, overflow measurement, the feed preview and thumbnails go through `imagesOf` instead of branching on `s.kind === "carousel"` themselves. `buildImage` itself does not change.

## Formats

A post can only have formats that every slide's template has. `sharedFormats(templateIds)` (in `recipe.js`) returns the intersection.

- Editor: a format checkbox that not all slides share is disabled, with the note "not in every slide's template".
- "Add slide" offers only templates that have all of the post's chosen formats, and no carousel templates.
- `toInput` keeps only shared formats; if none are left it refuses with a message instead of saving.

## Editor

Internally the editor works on one list of slides, `state.pages = [{ template, content }]`, and `toInput` splits it back into `template` / `content` and `moreSlides`. That way moving a slide to position 1 just works.

- The slide list that carousels have now (`renderSlides`, `editor.js`) also appears for image posts: select, move, duplicate, delete, and **Add slide** with a template choice instead of a slide-kind choice. With one slide, the list shows a single **Add slide** button and nothing else.
- Fields, preview, format tabs, overflow and writing help work on the chosen slide; `currentFields()` uses that slide's template.
- **Convert** converts the chosen slide to another template (the existing `convert`), offering only templates with the post's formats.
- The automatic title and the alt text come from slide 1, as now.
- The slide navigation under the preview ("← Previous slide / Slide 2 of 4 / Next slide →") also works for image posts with more than one slide.
- Writing help reads the chosen slide's content. This also fixes the existing bug where it reads the empty `post.content` of a carousel (`writing-help-ui.js`).
- A slide whose own template has been deleted shows in the list as "Template missing" with only a Delete button; its fields say the same. Export and the brand check refuse until it is removed. The editor never throws on it.

## Export

- The ZIP holds one PNG per format per slide, named by `fileName` with the existing `_slide-NN` suffix (only when the post has more than one image), plus `caption.txt` and `recipe.json`.
- For an image post with more than one slide and at least one LinkedIn format (`li-square`, `li-portrait`), the ZIP also gets one PDF of the slides in the first such format, named `<base>_document.pdf`. The carousel keeps its own PDF in `li-carousel`. `pdf.js` and `zip.js` do not change.
- "This slide as PNG" exports the chosen slide in the chosen format, as for carousels now.

## Brand check, numbers, overflow

- `brand-check.js` runs its checks over every slide from `imagesOf`, using each slide's own template fields. A finding on a slide other than the first names it: "Slide 3: …". The slide-count rules (too few slides, no cover) stay for carousels only.
- Number checks see the texts of every slide.
- `measureAll` measures every format × every slide.

## Library, overview, planning

- The thumbnail is slide 1 in the first format, as now; a post with more slides shows "N slides" beside it in the library and overview.
- The template filter and the results per template look at slide 1.
- Planning and the calendar show no images and do not change.

## Out of scope on purpose

- AI ideas still become a one-slide post. The idea planner does not plan slides.
- Mixing in a carousel template (built-in or own) as a slide.
- Slide numbers ("1/4") or a step chain across templates.
- One PDF per LinkedIn format; one is enough to post.

## Testing

- `imagesOf`: an image post without `moreSlides` (old file), one with three slides of different templates, a carousel.
- `sharedFormats` and `toInput`: formats outside the intersection are dropped; no shared format left gives an error.
- Schema: `moreSlides` defaults to `[]`, max 19, rejected on a carousel post; an old post file without `slides` or `moreSlides` loads, lists and counts media without crashing.
- `contentDiffers` drops the check when only `moreSlides` changes.
- Export enumeration: names and count of PNGs for 3 slides × 2 formats, and the PDF only with a LinkedIn format.
- Brand check: a finding on slide 3 is reported as "Slide 3: …".
- Browser (existing playwright-core setup): make a post with three slides of different templates, move one, save, reopen; and a slide whose own template is gone does not break the editor.
- Afterwards: look at the editor in the browser, on desktop and phone width.
