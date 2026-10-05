# Postwright multi-slide posts: handover

Branch `meerdere-slides`. Not merged into `main` and not pushed yet (5 October 2026).

Spec: `docs/superpowers/specs/2026-10-05-multi-slide-posts-design.md`.

## What is in it

- **One list of images per post**: `src/web/studio/slides.js` has `imagesOf`, `sharedFormats`, `slideTemplates`, `narrowFormats`, `changeSlideTemplate`, `imageTasks` and `pdfFormat`. Export, brand check, overflow measurement, the feed preview and thumbnails go through it instead of branching on carousel themselves.
- **Data**: slide 1 stays in `post.template` and `post.content`; slides 2 to 20 are `moreSlides` in `PostInputSchema` (`src/server/schema.ts`, max 19, rejected on a carousel post). No migration: a missing `moreSlides` or `slides` reads as `[]`.
- **Editor**: the slide list is also there for image posts, with Add slide, Change template, move, duplicate and delete. Fields, preview, overflow and writing help work on the chosen slide.
- **Formats**: a post only has formats that every slide's template has. Choosing a template that drops a format narrows the post and shows a notice. Saving refuses when no shared format is left.
- **Brand check**: runs per slide with that slide's own template; findings read "Slide 3: ...". A slide whose template is gone gives a `missing-template` error and shows as "Template missing" in the editor, with only Delete.
- **Export**: one PNG per slide per format in the ZIP. A post with more than one slide and a LinkedIn format (square or portrait) also gets `<base>_document.pdf`.
- **Library and overview**: post cards show an "N slides" badge.
- **Tests**: `tests/slides.test.ts` and `tests/slides-browser.test.ts` (playwright-core with the installed Chrome, like `tests/mobile.test.ts`).

## Checked

- Full suite green: 50 files, 1026 tests.
- Browser pass with a playwright script against a copy of the data: add, move and change template, save and reload; ZIP contents; phone width of 390 px without horizontal scroll; library badge; no console errors.

## Open

1. Merge into `main` and push; needs the owner's go-ahead.
2. The automatic title does not follow when another slide is moved to position 1.
3. A loaded post with a format that not every slide shares shows that format as a checked, disabled box.
4. The format checkboxes are not redrawn after a save; this only shows when the server narrowed the formats.
5. The missing-template brand-check finding has no field, so "Go to" only switches slide.
6. Out of scope on purpose: AI ideas still become a one-slide post; a carousel template (built in or own) as a slide; slide numbers ("1/4") or a step chain across templates; one PDF per LinkedIn format (one is enough to post).
