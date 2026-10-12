# The studio in the mockup's design: design

## Goal

The Overview, the Editor and the Planner take the look and the layout of the standalone mockup on the branch `codex/mockup` (`mockup/index.html`, `mockup/studio.css`, screenshots in `mockup/screens/`). Nothing the app can do today disappears. Saving, the brand check, scheduling, export and the API stay as they are; this is a change to `src/web/` only.

## Approach

Restyle in place. The mockup is the reference, and none of its files is copied in whole: it has its own class names and fixed sample content, and six other screens (All posts, Brand kit, Templates, Fact bank, Snippets, Settings) depend on today's `studio.css`. The ids and class names the tests use stay (`#field-title`, `#editor-tab-*`, `.studio-editor-bar`, `.studio-fields`, `.studio-preview`, `.post-menu`, `#studio-nav`, `#studio-menu` and the rest).

The `mockup/` folder stays on `codex/mockup` and is not merged.

## Colours and colour mode

- The token names in `studio.css` stay. Their values move to the mockup's palette, light and dark: paper, surface, side, canvas, ink, muted, line, clay, olive. Tokens derived from these are adjusted only where the look or the contrast asks for it. Every pair of text and ground keeps WCAG AA.
- The artwork's own colours stay apart from the interface tokens, as today.
- New: a choice **System / Light / Dark** in Settings. It is kept in `localStorage`, like the pinned project, and sets `data-theme` on `<html>`. System is the default and means no attribute. Each colour token holds its light and its dark value with `light-dark()`, so the choice only has to set `color-scheme` on the root.
- The choice is applied before the first paint, by a small classic script file in the `<head>` (the content security policy does not allow an inline script).

## Shell

- A larger masthead with the logo and the name, once.
- The project picker stays a working `<select>`, drawn quietly: a label "Project" and the name, no frame and no second logo.
- The navigation keeps every entry, with "All posts" and "Settings". The current entry gets the clay wash of the mockup.
- "New post" stays in the top right. A line "Made on your computer." sits at the bottom of the sidebar.

## Overview

- A compact heading "Overview" with one line under it, then a row with the date on the left and the numbers of drafts and scheduled posts on the right. The slogan goes.
- The desk has three columns. The artwork fills its card, the title may wrap over two lines, and under it come "Template · format" and the status. A scheduled post shows its date in the status ("Scheduled · 19 Oct").
- The warning about a fact moves from the banner across the page to the card of the post it is about ("Review linked fact", leading to that post). The banner goes.
- The week panel keeps the week strip. An empty week says so and names the date of the next post. "Next on the calendar" shows a date tile, the full title, and weekday, time and channel.
- Below the rule: "Built on your brand" (templates, facts to review, snippets, each a link) and the results, with their empty state. Rhythm, Moments and the uploaded images stay, in a quieter row under those.

## Editor

- The shell's page heading is hidden here. A compact header holds the link back, the title, the status with "Template · slides · channel", the save status and Save. The title is the `#field-title` input drawn as the heading, so the title is no longer shown twice.
- **Content column.** The template row with the slide list, "Add slide" and "Change template" works as today. Fields whose keys end in the same number form a group with a numbered heading. "(optional)" in a label becomes a tag "Optional" on the right. Counters stay. Writing help, Formats, Campaign and Facts move into a disclosure "Post details" under the fields; it opens by itself when it holds a warning.
- **Artwork column.** A heading "Artwork", the tabs Image / In the feed and the format tabs, the preview on the canvas ground, and under it the format name and its size in pixels. Safe zones and the PNG and ZIP buttons sit in a disclosure "Export options".
- **Review column.** The brand check lists its items open, passed and failed alike. Then the caption with its channel tabs, counter and tools; the link and the alt text sit in a disclosure that shows whether they are filled in. Then "Planned for": a date tile, the date and time field, Schedule or Reschedule, "Ready to post" and a link to the planner. Convert, Back to draft, Archive, Duplicate and Delete sit in a "More" menu (`.post-menu`, as in All posts).
- **Phone.** The three tabs stay in their order and open on the fields, as today. Their labels become Content, Preview and Review.

## Planner

- The heading, and in the bar above the agenda the views on the left and "Export calendar" (the existing `.ics` export) on the right.
- **List view** becomes a week agenda. Each week has a heading with its dates and what is in it. A week with a post or an idea shows its seven days; a post is a card with its thumbnail, status, title and "Template · format", and its date field and Reschedule sit in a disclosure on the card. An empty week is one line with "Ideas for this week".
- **Month view** keeps working as it does and takes the new look.
- "Period and ideas", with the notice about the API key, becomes a disclosure above the views.
- **Side column**: "Still on your desk" (the drafts, with a thumbnail and a fact warning where one applies), Campaigns (the list or its empty state, the form in a disclosure "Add campaign") and a note "Check before you schedule". On a phone this column comes below the agenda.
- A closing line: "Postwright keeps the plan. You export and upload the posts."

## The other screens

All posts, Brand kit, Templates, Fact bank, Snippets and Settings take the new colours, the shell and the shared controls (buttons, fields, badges, cards). Their layout does not change. Each is looked at in the browser for breakage.

## Left out of the mockup

- The fixed date and the sample texts.
- The button "Open editor": "New post" does that.
- The numbers behind "Planner" and "Templates" in the navigation: the shell would have to load the posts and templates on every screen.
- The colour choice in the toolbar: it lives in Settings.
- The line "Standalone mockup · Sample content" and the link to the design notes.

## Rules that must keep holding

- Scheduling needs a saved brand check with zero errors and a time in the future.
- Editing a scheduled post into a failed check returns it to draft.
- Saving stays explicit. Publication stays manual.
- A tab chosen on the phone moves focus to its panel, as today.

## Testing and checking

- `npm test`, `npm run typecheck` and `npm run format:check` pass, including the three browser suites (`mobile`, `own-template-browser`, `slides-browser`) and the leak test in `tests/public.test.ts`. A browser suite that is skipped because Chrome did not start does not count as passed.
- One new test: the stored colour choice sets `data-theme`, and System removes it.
- Browser tests are adjusted where an element moves; an id that a test uses is not renamed.
- In the browser, on the project's own port: Overview, Editor and Planner at 1440 and 390 pixels wide, light and dark, next to the mockup's screenshots; then one pass over the other six screens.
- `DESIGN.md` gets the new palette. The screenshots in the README (`assets/screen-overview.png`, `assets/screen-editor.png`) are made again. A short `docs/interface-handover.md` says what changed and what is still open.

## Order of work

1. Tokens, shared controls, shell, colour mode in Settings.
2. Overview and the post cards. First point at which the result can be looked at.
3. Editor, with its phone tabs.
4. Planner.
5. Docs and screenshots, then one review of the whole.
