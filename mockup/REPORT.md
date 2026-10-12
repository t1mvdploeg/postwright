# Postwright studio mockup

The standalone concept covers Overview, Editor and Planner. Its sample workspace is fixed to 12 October 2026: two draft posts and one steps post scheduled for 19 October at 09:00. The copy comes from the repository's sample content; the scheduled time is an illustrative fixed value. No performance figures, accounts, team features or automatic publication are introduced.

## 1. Ten weak points and their answers

The desktop observations below come from the repository's existing Overview and Editor screenshots, supported by the current source. A live inspection was blocked. The current app's appearance in dark mode and at 390px is **not sure**.

| #   | Weak point and evidence                                                                                                                                                                                                            | Answer in the mockup                                                                                                                                 |
| --- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------- |
| 1   | The large, generic Overview slogan commands more attention than the posts and next task. Visible in the Overview reference.                                                                                                        | A compact Overview heading, a useful date and a short description bring the creative desk forward.                                                   |
| 2   | The logo and project identity repeat in the sidebar masthead, project picker and breadcrumb. Visible in both references.                                                                                                           | One clear masthead and a quieter project control reduce repetition and give navigation a stronger hierarchy.                                         |
| 3   | Three sample posts occupy a desk designed for four columns, leaving an unused track and substantial blank space. Visible in the Overview reference; `studio.css` specifies four desktop tracks.                                    | An intentional three-post grid gives each artwork room and aligns the desk with the agenda.                                                          |
| 4   | Titles are clipped to similar-looking “Example: …” fragments. Visible on two desk cards; `post-cards.js` and `studio.css` enforce single-line clipping.                                                                            | Descriptive titles can wrap across two lines, making each post identifiable without opening it.                                                      |
| 5   | The broad fact warning does not identify the affected post or explain the precise review task. Visible in the Overview reference. The linked sample statistic fact starts as a draft.                                              | A local fact-review message on the statistic card names the issue and points toward reviewing its source.                                            |
| 6   | The upcoming agenda shows a time without the future post's date, while clipping its title. Visible in the Overview reference and constructed in `overview.js`.                                                                     | A dated upcoming item presents the full post title, time and scheduled state together.                                                               |
| 7   | The empty results area and storage zeros receive substantial space beside useful work. Visible in the Overview reference.                                                                                                          | A compact manual-results empty state explains when figures become available. Useful draft and schedule context takes priority.                       |
| 8   | The Editor repeats a long post title in the large page heading and again in the studio-title input, pushing the working area down. Visible in the Editor reference.                                                                | A compact post header groups the title, draft or scheduled state and Save action.                                                                    |
| 9   | Artwork fields form a long stack with little distinction between the headline, individual steps and optional configuration. Visible in the Editor reference and built in `editor.js` / `fields-ui.js`.                             | Named content groups and paired step fields make the structure easier to scan. Artwork settings sit apart from writing.                              |
| 10  | Brand check, caption and scheduling are spread down the review column; the check initially exposes little detail. Visible check/caption layout in the Editor reference; scheduling's position is source evidence from `editor.js`. | A purposeful review rail puts check details, caption and schedule context together. Phone tabs provide direct access to Preview, Content and Review. |

## 2. Decisions per screen

### Overview

Three generous artwork cards form the main desk, with readable titles and a fact issue attached to the relevant draft. A dated agenda and compact workspace context explain what is ready, what needs attention and what is next. The results empty state explicitly describes manually entered figures.

### Editor

A compact header introduces the scheduled steps post. Grouped content fields sit beside a central artwork surface and a review rail for checks, caption and scheduling. On a phone, Preview, Content and Review become directly selectable panels so the artwork stays easy to reach.

### Planner

The week of 19–25 October is presented as a dated agenda, including the steps post on Monday at 09:00. Two drafts remain visible as work to prepare, and the campaign empty state stays compact. A manual-publication note makes the export-and-upload workflow explicit.

All three screens preserve the logo, local Inter font, warm paper and clay accent. Dark interface surfaces leave the artwork's brand colours intact. Static screen navigation, colour-mode selection and responsive panel selection are the intended mockup interactions; saving, brand checking, scheduling and export require the real app's existing implementation.

## 3. Bringing the design into the app

**CSS work:** `src/web/studio.css` can carry the shared tokens, typography, spacing, shell proportions, card framing, status labels, form controls, dark surfaces and responsive grids. The artwork's own colour variables should remain separate from interface tokens.

**JavaScript and markup work:**

- `src/web/studio/overview.js`: reorder the desk, agenda and secondary information; add a date to upcoming items; give fact issues more specific context.
- `src/web/studio/post-cards.js`: change card title and issue presentation, retaining links to the real post.
- `src/web/studio/editor.js` and `src/web/studio/fields-ui.js`: group content fields, build the compact post header, reorganize the review rail and adapt the mobile panels. Preserve explicit saving and accessible panel focus behavior.
- `src/web/studio/planning.js`: reshape the weekly agenda, draft context and campaign empty state while retaining list/month views, date fields, ideas and calendar export.
- `src/web/studio.js` and `src/web/index.html`: apply shell/navigation changes and add a manual colour-mode override that defaults to the system preference.

The existing check, save, export and API logic can continue to do the product work. Scheduling must still require a saved check with zero errors and a future time. Publication stays manual, and editing a scheduled post into a failed check must still return it to draft.

Start with shared CSS tokens and controls, then the Overview structure, then the Editor and its phone behavior. This gives the owner a small, reviewable first change before moving more complex editor groups.

## 4. Verification and limits

- Read `README.md`, `PRODUCT.md` and `DESIGN.md`, then inspected the relevant sample-content, Overview, Editor, Planner and styling source.
- Visually inspected the two committed desktop references: [Overview reference](screens/current-reference-overview.png) and [Editor reference](screens/current-reference-editor.png). These are copied repository images, not newly captured browser screenshots.
- The current app server started on port 4199. Chrome launched from the shell aborted; the browser tool denied access to localhost because its permission was unavailable.
- No new browser screenshots were captured. Live current-app light/dark comparisons at 1440px and 390px, and visual verification of each mockup screen at those sizes, are **not sure**.
- Browser checks of keyboard navigation, focus, system dark mode, reduced motion and phone overflow remain blocked. Source-level provisions do not establish that the screens look right in a browser.
- The existing `npm test` suite exited successfully: **980 passed, 46 skipped** across **47 passed and 3 skipped test files**. The three browser suites were skipped because Chrome could not start; these are not successful browser checks. The original test configuration was reused through an isolation wrapper, with temporary files and caches under `mockup/`.
- `node mockup/verify.mjs` checks local asset references, unique IDs, label/ARIA targets, required CSS provisions and private-data patterns in the new untracked files. The repository leak test only scans tracked files, so this additional check covers the mockup itself.
- `node mockup/interaction-check.mjs` checks routing, the skip link, tab arrow/End behavior and colour-mode reset in a small DOM harness. A review found and fixed a skip-link routing issue. This is a logic check, not a browser accessibility audit.
- Interface labels and metadata were raised to a minimum of 12px, and the pale-on-clay text was replaced with paper text. Small lettering remains only inside scaled, labelled artwork thumbnails. Local Inter is retained as specified by the brief.
- Follow-up hook triage moved the Steps artwork body from `30cqw` to `24cqw` to improve its bottom clearance. The remaining padding warnings are source-confirmed false positives: artwork uses explicit `7cqw` insets, and responsive zero-padding panel states remove their borders. Exceptions for this markup padding rule and the intentional Inter face are recorded in `mockup/.impeccable/config.json`, with portable comments in the standalone files because a root-level scan does not load the nested config. No app-level detector configuration was changed.
- Static palette calculations put the checked body, secondary, clay and button text pairs above 4.5:1 in both modes; the paper-on-clay artwork text is 4.53:1. These calculations do not replace rendered contrast inspection.
- The independent reviewer confirmed the skip-link fix and the read-only capture-script fix. Its verdict covers those two source changes only, not visual quality.
- No existing tracked file was changed. All deliverable files, copied assets and reference images are under `mockup/`. The app server was stopped and its temporary sample-data directory removed.
