# Postwright studio interface: handover

Merged into `main` and pushed as one commit (12 October 2026).

Spec: `docs/superpowers/specs/2026-10-12-studio-interface-design.md`. Plan: `docs/superpowers/plans/2026-10-12-studio-interface.md`. The design comes from the standalone mockup on the branch `codex/mockup`, which is not merged.

## What is in it

- **Palette and colour mode**: the tokens in `src/web/studio.css` hold their light and dark value with `light-dark()`. Settings has a choice Appearance (System, Light, Dark), kept in the browser. `src/web/theme-boot.js` applies it before the first paint; `src/web/studio/theme.js` is what Settings calls.
- **Shell**: one masthead, the project picker without a frame, "Made on your computer." above Settings. Every screen and "New post" stayed.
- **Overview**: a compact heading, the date with the number of drafts and scheduled posts, three posts on the desk with "Template · format" and a fact warning on the card, a week panel that names the next post with its date. Below: Built on your brand and the results, then Rhythm and Moments.
- **Editor**: the title is the heading and is no longer shown twice. Fields that end in the same number form a numbered group (`src/web/studio/field-groups.js`). Writing help, Formats, Campaign and Facts sit in "Post details", safe zones and the export buttons in "Export options", the link and alt text in a disclosure under the caption, and Convert, Back to draft, Archive, Duplicate and Delete under "More". "Go to" in the brand check opens whatever disclosure its field sits in. The phone tabs read Content, Preview and Review.
- **Planner**: the list is a week agenda with a row per day (`agendaDays` in `src/web/studio/calendar.js`); an empty week is one line. Beside it: the drafts still on the desk, the campaigns with their form in a disclosure, and a note on what scheduling needs. "Period and ideas" is a disclosure. The month view works as before.
- **Shared**: `src/web/studio/desk.js` (`deskOf`, `factProblems`) and `dateTile` in `post-cards.js`.
- **README**: the four screenshots in `assets/` were made again from the sample content.

## Left out of the mockup

- The numbers behind "Planner" and "Templates" in the navigation: the shell would have to load the posts and templates on every screen.
- The button "Open editor" ("New post" does that) and the colour choice in the toolbar (it is in Settings).
- The mockup's fixed date and sample texts.

## Checked

- Full suite green, with the three browser suites running in the installed Chrome.
- Every screen looked at with only the sample content, at 1440 and 390 pixels wide, light and dark, next to the mockup's screenshots.
- One review of the whole branch. Its findings are fixed, and each has a browser test in `tests/mobile.test.ts`: the "More" menu clear of the Save bar, the month view on a phone, dates in the Overdue block, the campaign actions inside the side column, and "Insert link" opening its disclosure.

## Open

1. "Post details" opens by itself as long as the fact picker shows a warning. With only draft facts, as in the sample content, that is always.
2. A preview that is limited by the height of the window sits on the left of its frame instead of in the middle. That was already so before this branch.
3. The title in the editor's header is one line: a long title is cut off on a phone until you put the cursor in it.
