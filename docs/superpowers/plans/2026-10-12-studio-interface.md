# The studio in the mockup's design: implementation plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Overview, Editor and Planner take the look and layout of the mockup on `codex/mockup`, without losing anything the app does today.

**Architecture:** Restyle in place. The existing modules in `src/web/` keep their logic, ids and class names; markup is regrouped per screen and `studio.css` takes the mockup's palette and proportions. New logic is small and pure, so it can be tested without a browser: the colour choice (`theme.js`), field groups (`field-groups.js`) and the days of a week (`agendaDays` in `calendar.js`).

**Tech stack:** Plain ES modules and CSS in `src/web/`, no build step. Vitest; three suites drive the installed Chrome through `playwright-core`.

**Spec:** `docs/superpowers/specs/2026-10-12-studio-interface-design.md`. Read it first.

**Reference:** the mockup lives in the sibling work copy `../Postwright-codex-mockup/mockup/`. `index.html`: Overview lines 179–480, Editor 481–837, Planner 838–1027. `studio.css` has no section comments: grep it for the class names used in those lines. Screenshots per screen, width and mode are in `screens/` (`mockup-<screen>-<light|dark>-<1440|390>.png`). Copy proportions, spacing and type sizes from there; do not copy its class names or its sample texts.

## Global constraints

- Only `src/web/`, `tests/`, `DESIGN.md`, `README.md`, `assets/` and `docs/` change. No change to the server or the API.
- No id or class name that a test uses is renamed: `#field-title`, `#field-headline`, `#field-altText`, `#field-convert`, `#editor-tab-fields`, `#editor-tab-preview`, `#editor-tab-caption`, `#editor-panel-*`, `.studio-editor`, `.studio-editor-bar`, `.studio-editor-tabs`, `.studio-fields`, `.studio-fact-list`, `.studio-preview`, `.studio-preview-iframe`, `.studio-save-status`, `.studio-slide-list`, `.post-menu`, `#studio-nav`, `#studio-menu`, `#studio-sidebar`, `#studio-main`, `#studio-content`, `#notices`.
- Every `field-<id>` keeps its id: the brand check focuses fields by it.
- Token names in `studio.css` stay; values change. Every pair of text and ground keeps WCAG AA (4.5:1).
- The artwork's colours are never taken from interface tokens.
- Interface text is English. Comments match the density and tone of the file they are in.
- Commits: one per task, on the branch `interface`, author as configured, no `Co-Authored-By` line. Nothing is pushed.
- After every task: `npm test`, `npm run typecheck`, `npm run format:check`. A browser suite that prints "skipped: Google Chrome could not be started" has not passed; fix Chrome first.
- The local server already runs on port 4173 from this folder. Use it; do not start a second one.

## Review focus

1. A brand-check finding whose field sits in a closed disclosure (Formats, Facts, link, alt text): "Go to" must open the disclosure and focus the field. Test in Task 3.
2. A post that relies on an unusable fact but is not among the three on the desk must still be reported. Test in Task 2.
3. Browser storage that throws (private window) or holds a value that is not `light` or `dark`: the studio loads in System mode. Test in Task 1.
4. A title of 120 characters in the editor header on a phone: it wraps and nothing scrolls sideways. Test in Task 3.
5. A week that holds only a moment or an idea, and a post dated outside the week it is grouped under: the day grouping shows the first and ignores the second. Test in Task 4.

---

### Task 1: Palette, colour choice, shell

**Files:**
- Modify: `src/web/studio.css` (tokens lines 13–230, building blocks 231–643, shell 644–849, project picker 2525–2600)
- Modify: `src/web/index.html`, `src/web/studio.js`, `src/web/studio/settings.js`
- Create: `src/web/theme-boot.js`, `src/web/studio/theme.js`
- Test: `tests/theme.test.ts`
- Modify: `DESIGN.md`

**Interfaces:**
- Produces: `theme.js` exports `readTheme(store)`, `applyTheme(choice, root)`, `chooseTheme(choice, root, store)`. CSS: `:root[data-theme]` sets `color-scheme`; every colour token is a `light-dark()` value.

- [ ] **Step 1: Write the failing test** `tests/theme.test.ts`

```ts
import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { applyTheme, chooseTheme, readTheme } from "../src/web/studio/theme.js";
import { contrastRatio } from "../src/web/studio/color.js";

const store = (value: string | null) => ({ getItem: () => value, setItem: () => {}, removeItem: () => {} });
const blocked = {
  getItem: () => {
    throw new Error("blocked");
  },
  setItem: () => {
    throw new Error("blocked");
  },
  removeItem: () => {
    throw new Error("blocked");
  },
};
const root = () => ({ dataset: {} as Record<string, string> });

describe("colour choice", () => {
  it("reads light and dark, and treats anything else as System", () => {
    expect(readTheme(store("dark"))).toBe("dark");
    expect(readTheme(store("light"))).toBe("light");
    expect(readTheme(store("blue"))).toBe("system");
    expect(readTheme(store(null))).toBe("system");
  });
  it("falls back to System when storage is blocked", () => {
    expect(readTheme(blocked)).toBe("system");
    const r = root();
    expect(() => chooseTheme("dark", r, blocked)).not.toThrow();
    expect(r.dataset.theme).toBe("dark");
  });
  it("sets data-theme, and System removes it", () => {
    const r = root();
    applyTheme("dark", r);
    expect(r.dataset.theme).toBe("dark");
    applyTheme("system", r);
    expect("theme" in r.dataset).toBe(false);
  });
});

describe("interface palette", () => {
  const css = readFileSync(new URL("../src/web/studio.css", import.meta.url), "utf8");
  const token = (name: string) => {
    const m = new RegExp(`--${name}:\\s*light-dark\\((#[0-9a-f]{6}),\\s*(#[0-9a-f]{6})\\)`).exec(css);
    if (!m) throw new Error(`--${name} is not a light-dark() pair of hex colours`);
    return { light: m[1], dark: m[2] };
  };
  const pairs = [
    ["text", "background"],
    ["text", "card"],
    ["text-muted", "background"],
    ["text-muted", "sidebar"],
    ["text-muted", "card"],
    ["accent", "background"],
    ["accent", "accent-soft"],
    ["on-accent", "accent-fill"],
  ];
  for (const [text, ground] of pairs)
    for (const mode of ["light", "dark"] as const)
      it(`${text} on ${ground} reaches 4.5:1 (${mode})`, () => {
        expect(contrastRatio(token(text)[mode], token(ground)[mode])).toBeGreaterThanOrEqual(4.5);
      });
});
```

- [ ] **Step 2: Run it and see it fail**

Run: `npx vitest run tests/theme.test.ts`
Expected: FAIL, `theme.js` does not exist.

- [ ] **Step 3: Write `src/web/studio/theme.js`**

```js
// The colour choice: System (follow the computer), Light or Dark. Kept in this browser, like the
// pinned project. /theme-boot.js applies it before the first paint; this module is for Settings.
export const THEME_KEY = "postwright.theme";

/** The stored choice; "system" when nothing usable is stored or storage is blocked. */
export function readTheme(store = localStorage) {
  try {
    const t = store.getItem(THEME_KEY);
    return t === "light" || t === "dark" ? t : "system";
  } catch {
    return "system";
  }
}

export function applyTheme(choice, root = document.documentElement) {
  if (choice === "light" || choice === "dark") root.dataset.theme = choice;
  else delete root.dataset.theme;
}

/** Applies the choice and remembers it. A browser that blocks storage just forgets it. */
export function chooseTheme(choice, root = document.documentElement, store = localStorage) {
  applyTheme(choice, root);
  try {
    if (choice === "light" || choice === "dark") store.setItem(THEME_KEY, choice);
    else store.removeItem(THEME_KEY);
  } catch {
    // System is used next time.
  }
}
```

- [ ] **Step 4: Write `src/web/theme-boot.js`** and load it in `index.html` with `<script src="/theme-boot.js"></script>` directly above the stylesheet link. Check that the server serves the new file (`curl -sI localhost:4173/theme-boot.js` gives 200 and a JavaScript type); if static files are listed somewhere in `src/server/http.ts`, add it there.

```js
// Applies the stored colour choice before the first paint. A classic script on purpose: a module
// runs after the page is drawn, and the content security policy allows no inline script.
// Keep the key and the values the same as in /studio/theme.js.
try {
  const t = localStorage.getItem("postwright.theme");
  if (t === "light" || t === "dark") document.documentElement.dataset.theme = t;
} catch {
  // Blocked storage: the computer's setting applies.
}
```

- [ ] **Step 5: Move the tokens to `light-dark()`**

In `studio.css`, give every colour token in `:root` the form `--name: light-dark(<light>, <dark>);`, taking the dark value from the block under `@media (prefers-color-scheme: dark)` (line 105), then delete that block. A shadow keeps its offsets with the colour inside: `0 10px 28px light-dark(rgba(…), rgba(…))`. A value in the dark block that is not a colour moves to a rule under both `:root[data-theme="dark"]` and `@media (prefers-color-scheme: dark) { :root:not([data-theme="light"]) }`. Then add:

```css
:root[data-theme="light"] {
  color-scheme: light;
}
:root[data-theme="dark"] {
  color-scheme: dark;
}
```

New values (light, dark):

| Token | Light | Dark |
| --- | --- | --- |
| `--background` | `#f8f7f3` | `#211f1a` |
| `--card` | `#fffefa` | `#28251f` |
| `--sidebar` | `#efeee7` | `#1b1915` |
| `--stage`, `--artwork-ground` | `#eeede6` | `#302d25` |
| `--ink`, `--text` | `#292b27` | `#f0eee6` |
| `--text-muted` | `#64675e` | `#b8b2a5` |
| `--edge-strong` | `#dedfd5` | `#444035` |
| `--accent` | `#ad3f2b` | `#f09a80` |
| `--accent-hover` | `#91321f` | `#ffb39d` |
| `--accent-soft` | `#f6e7df` | `#362b24` |
| `--accent-fill` | `#ad3f2b` | keep today's dark value |
| `--accent-fill-hover` | `#91321f` | keep today's dark value |
| `--olive` | `#46533e` | `#c1cbb2` |
| `--olive-soft` | `#e8ece1` | `#30372a` |

Every other token keeps both of its values; change one only where it now looks off against the new grounds. The comment above the old dark block moves to the top of `:root`, reworded for `light-dark()`.

- [ ] **Step 6: Run the test**

Run: `npx vitest run tests/theme.test.ts`
Expected: PASS. If a contrast pair fails, adjust that token until it passes; do not loosen the test.

- [ ] **Step 7: The colour choice in Settings**

In `settings.js`, add a row to the sheet with the existing `row(title, line, children)` helper, placed last: title "Appearance", line "Light, dark, or the same as your computer. Kept in this browser.", and a `fieldset.studio-choice` with three radios (System, Light, Dark) built like the other `studio-choice` fieldsets in that file. The checked one is `readTheme()`; `change` calls `chooseTheme(value)`. It applies at once and needs no Save.

- [ ] **Step 8: The shell**

- `index.html`: remove the `<img>` from `.project-picker`; keep the label and `#studio-project`. Add `<p class="app-local">Made on your computer.</p>` to the sidebar.
- `studio.js`: delete `SCREEN_HEADING` and its use, so the Overview's heading is "Overview". Ledes: overview "Your posts on the desk. A little room for what comes next.", planning "A plan for your posts. Room for your next idea." In `renderNav`, place `.app-local` above the Settings link (move the element into `.nav-bottom`, or leave it in `index.html` and order it with CSS).
- `studio.css`, shell section: masthead, navigation and toolbar to the mockup's proportions (sidebar width, logo and name size, link height, the clay wash `--accent-soft` with `--accent` text on the current link). The project picker loses its card frame: a small muted label and the select as plain text with its chevron. Buttons, fields, badges and cards in the building blocks section take the mockup's radius, border and padding.
- Leave "New post", the breadcrumb, the Menu button and the overlay as they are.

- [ ] **Step 9: Look at it**

Open `http://localhost:4173/#overview` and `#settings` at 1440 and 390 wide. Switch Appearance to Dark, Light and System: the page follows at once, and after a reload it opens in the chosen mode without a flash. Compare the sidebar with `mockup-overview-light-1440.png` and `mockup-overview-dark-1440.png`.

- [ ] **Step 10: `DESIGN.md`**: replace the palette values with the new ones and add one line on the Appearance choice.

- [ ] **Step 11: All checks, then commit**

```bash
npm test && npm run typecheck && npm run format:check
git add -A && git commit -m "Studio: the mockup's palette, a colour choice in Settings, a quieter shell"
```

---

### Task 2: Overview and post cards

**Files:**
- Modify: `src/web/studio/overview.js`, `src/web/studio/post-cards.js`
- Modify: `src/web/studio.css` (post cards 2620–2717, overview 2718–2866)
- Test: `tests/overview-desk.test.ts`
- Create: `src/web/studio/desk.js`

**Interfaces:**
- Consumes: `factUsable(fact, today)` from `/studio/brand-check.js` (as `library.js` lines 31–32 use it), `template(id)` from `/studio/templates.js`, `format(key)` from `/studio/formats.js`.
- Produces: `desk.js` exports `factProblems(posts, facts, today)` → `Set` of post ids, and `deskOf(posts, n)` → the `n` most recently updated posts that are not archived. `statusBadge(status, detail = null)` in `post-cards.js`.

- [ ] **Step 1: Write the failing test** `tests/overview-desk.test.ts`

```ts
import { describe, expect, it } from "vitest";
import { deskOf, factProblems } from "../src/web/studio/desk.js";

const post = (id: string, over: object = {}) => ({ id, status: "draft", updated: `2026-10-0${id}`, facts: [], ...over });
const active = { id: "f1", status: "active" };

describe("the desk", () => {
  it("takes the most recently updated posts and leaves the archive out", () => {
    const posts = [post("1"), post("2"), post("3", { status: "archived" }), post("4"), post("5")];
    expect(deskOf(posts, 3).map((p) => p.id)).toEqual(["5", "4", "2"]);
  });
  it("names every post with a fact that is gone or unusable, also off the desk", () => {
    const posts = [post("1", { facts: ["f1"] }), post("2", { facts: ["gone"] }), post("3", { facts: ["f2"] })];
    const facts = [active, { id: "f2", status: "withdrawn" }];
    expect([...factProblems(posts, facts, "2026-10-12")].sort()).toEqual(["2", "3"]);
  });
  it("leaves archived posts out of the fact problems", () => {
    const posts = [post("1", { facts: ["gone"], status: "archived" })];
    expect(factProblems(posts, [], "2026-10-12").size).toBe(0);
  });
});
```

Before running, open `src/web/studio/brand-check.js` and check what `factUsable` reads from a fact; give `active` and the withdrawn fact the fields it needs so the first is usable and the second is not.

- [ ] **Step 2: Run it and see it fail**

Run: `npx vitest run tests/overview-desk.test.ts`
Expected: FAIL, `desk.js` does not exist.

- [ ] **Step 3: Write `src/web/studio/desk.js`**

```js
// Which posts lie on the desk, and which rely on a fact that can no longer be used. Shared by
// the overview and the planner.
import { factUsable } from "./brand-check.js";

/** The `n` posts worked on most recently; the archive is left out. */
export function deskOf(posts, n) {
  return posts
    .filter((p) => p.status !== "archived")
    .sort((a, b) => b.updated.localeCompare(a.updated))
    .slice(0, n);
}

/** The ids of the posts, archive left out, with a fact that has expired, been withdrawn or been deleted. */
export function factProblems(posts, facts, today) {
  const usable = new Set(facts.filter((f) => factUsable(f, today)).map((f) => f.id));
  return new Set(
    posts.filter((p) => p.status !== "archived" && p.facts.some((id) => !usable.has(id))).map((p) => p.id),
  );
}
```

If `brand-check.js` imports with a leading slash (`"/ui.js"`) and Vitest cannot load it, check how `tests/brand-check.test.ts` imports it and follow that.

- [ ] **Step 4: Run the test**

Run: `npx vitest run tests/overview-desk.test.ts`
Expected: PASS.

- [ ] **Step 5: Post cards**

In `post-cards.js`: `statusBadge(status, detail = null)` shows `` `${STATUS[status]} · ${detail}` `` when `detail` is given. `postCard` passes nothing new; callers give `meta`, `warning` and the badge detail. Add an option `detail` to `postCard`'s options and pass it to `statusBadge`. CSS: the artwork fills the card (no inner frame or padding around it), the title wraps to two lines (`-webkit-line-clamp: 2` instead of the single-line clip), the meta line is muted.

- [ ] **Step 6: The Overview**

In `overview.js`:

- `DESK = 3`; build the desk with `deskOf(posts, DESK)`. Load `/api/facts` in the same `Promise.all` (`.catch(() => ({ facts: [] }))`, as `library.js` does) and `/api/snippets`.
- Above the dashboard a row `.studio-overview-top`: the long date on the left, on the right "`n` drafts" and "`n` scheduled" (counted from `posts`). The lede no longer carries the date: delete the `ctx.setLede` call.
- Each desk card: `meta` is `` `${template(p.template)?.name ?? p.template} · ${format(p.formats[0])?.name ?? p.formats[0]}` ``; a scheduled post gets `detail: readableDate(localToday(new Date(p.scheduled)))`; a post in `factProblems(...)` gets `warning`: a link "Review linked fact" to `#editor/${p.id}` with the alert icon.
- The fact signal across the page goes. If `factProblems` holds posts that are not on the desk, show one quiet line under the desk: "`n` more post(s) rely on a fact that is no longer usable." with the link "See which" to `#library/fact`. The overdue signal stays as it is.
- The desk grid has three columns (`.studio-desk`), two at tablet width, one on a phone.
- Week panel: the heading becomes "The week ahead". Keep the week strip. Under it: when today has posts, the "Today" list as now. When nothing goes out from today to Sunday: a block "A little breathing room." with "No posts planned this week." and, when a later post exists, "Your next post is on Monday, 19 October." (weekday, day, month of that post), then the link "Look at your plan". Then "Next on the calendar": the next three scheduled posts, each a link to its editor with a date tile (day number over the short month), the full title (it may wrap), and "Monday · 09:00 · LinkedIn square" (weekday, time, format name). With nothing scheduled: "Nothing scheduled yet."
- Below the rule, two rows. First row: "Built on your brand" with three links (templates → `#templates` with the count `allTemplates().length`, facts to review → `#facts` with the count of facts whose status is draft, snippets → `#snippets`) and the uploaded-images row under them; and the results block, whose empty state reads "Once a post is published, add its figures in the studio. Your results will appear here." Second row, quieter: Rhythm and Moments, unchanged.

- [ ] **Step 7: Look at it**

`http://localhost:4173/#overview` at 1440 and 390, light and dark, next to `mockup-overview-*.png`. Check with no posts (a new project: the empty desk and "Add sample content" still work) and with the sample content.

- [ ] **Step 8: All checks, then commit**

```bash
npm test && npm run typecheck && npm run format:check
git add -A && git commit -m "Overview: three posts on the desk, fact warnings on the card, a dated week panel"
```

**Natural stopping point: the owner can look at the Overview here.**

---

### Task 3: Editor

**Files:**
- Create: `src/web/studio/field-groups.js`
- Modify: `src/web/studio/fields-ui.js`, `src/web/studio/editor.js` (layout 180–446, `renderFields` 473, `renderCheck` 984, `goTo` 1027, `renderFacts` 1045, `buildStatus` 1325), `src/web/studio.css` (editor 1330–2150)
- Test: `tests/field-groups.test.ts`, `tests/mobile.test.ts`

**Interfaces:**
- Produces: `groupFields(fields)` → `{ number: string | null, fields: Field[] }[]`. `buildFields` returns one element per group or lone field.

- [ ] **Step 1: Write the failing test** `tests/field-groups.test.ts`

```ts
import { describe, expect, it } from "vitest";
import { groupFields } from "../src/web/studio/field-groups.js";

const ids = (fields: string[]) => groupFields(fields.map((id) => ({ id }))).map((g) => [g.number, g.fields.map((f) => f.id)]);

describe("field groups", () => {
  it("joins neighbouring fields that end in the same number", () => {
    expect(ids(["headline", "step1", "step1Text", "step2", "step2Text"])).toEqual([
      [null, ["headline"]],
      ["1", ["step1", "step1Text"]],
      ["2", ["step2", "step2Text"]],
    ]);
  });
  it("keeps fields without a number apart, each on its own", () => {
    expect(ids(["headline", "text", "source"])).toEqual([
      [null, ["headline"]],
      [null, ["text"]],
      [null, ["source"]],
    ]);
  });
  it("does not join the same number when another field sits between", () => {
    expect(ids(["step1", "note", "step1Text"])).toEqual([
      ["1", ["step1"]],
      [null, ["note"]],
      ["1", ["step1Text"]],
    ]);
  });
});
```

- [ ] **Step 2: Run it and see it fail**

Run: `npx vitest run tests/field-groups.test.ts`
Expected: FAIL, `field-groups.js` does not exist.

- [ ] **Step 3: Write `src/web/studio/field-groups.js`**

```js
// Fields that belong together, such as a step and its explanation ("step2", "step2Text"): the
// number their ids end in says so. Only neighbours are joined, so the order of the template stays.
export function groupFields(fields) {
  const groups = [];
  for (const f of fields) {
    const number = /(\d+)[A-Za-z]*$/.exec(f.id)?.[1] ?? null;
    const last = groups.at(-1);
    if (number !== null && last?.number === number) last.fields.push(f);
    else groups.push({ number, fields: [f] });
  }
  return groups;
}
```

- [ ] **Step 4: Run the test**

Run: `npx vitest run tests/field-groups.test.ts`
Expected: PASS.

- [ ] **Step 5: Groups and the Optional tag in `fields-ui.js`**

- Rename the body of `buildFields`' `map` callback to an inner `one(v)`. `buildFields` then returns `groupFields(fields).map(...)`: a group of one field gives `one(field)`; a larger group gives `el("fieldset", { class: "studio-field-group" }, [legend, ...group.fields.map(one)])`. The legend holds the number in a small box and a `<span>` with the current value of the group's first field; an `input` listener on that field keeps the span in step.
- In the text branch, the label becomes `el("label", { for: id }, [v.label, v.required ? null : el("span", { class: "studio-optional", text: "Optional" })])`. The suffix " (optional)" goes. `grep -rn "(optional)" tests src/web` and update whatever relied on it.
- CSS: the group as in the mockup's Content column (a numbered heading with a hairline to its right, the fields under it).

- [ ] **Step 6: The editor's header**

In `editor.js`:

- Take `titleField` out of `leftColumn` and put it in `.studio-editor-head`, after the back link, with a label that has the class `visual-hidden` ("Title (studio only)") and the class `studio-title-field` on the input. Style it as the page heading: large, no border until hover or focus.
- Under it a line `.studio-editor-meta`: the status badge (a second element beside `statusChip`; `statusChip` stays in the bar for phones) and a text "Steps · 1 slide · LinkedIn square" (template name, number of slides, the first format's name), refreshed in `renderAll`. A scheduled post shows "Scheduled · 19 Oct".
- `.studio-editor-bar` with the save status and Save stays on the right of the header, and stays the sticky bottom bar on phones.
- The shell's heading is hidden on this screen but stays in the document for screen readers: in `studio.css`, `.app-content:has(.studio-editor-head) .page-heading` gets the same declarations as `.visual-hidden`. The template gallery (`#editor` without a post) has no `.studio-editor-head` and keeps its heading.

- [ ] **Step 7: The three columns**

- **Content** (`leftColumn`): `el("h2", { text: "Content" })`, `slideHolder`, `fieldsHolder`, then `el("details", { class: "studio-post-details" }, [el("summary", { text: "Post details" }), helpPanel?.element ?? null, formatChoice, the campaign field, factsHolder])`. In `renderFacts`, after building, set `open` on that `details` when the picker holds a `.studio-warning`.
- **Artwork** (`centerColumn`): `el("h2", { text: "Artwork" })`, `viewGroup`, `formatTabs`, `previewFrame`, `feedHolder`, `slideNav`, a line `.studio-format-line` with the format name and "1200 × 1200 px" (set in `renderPreview` from `currentImage()`), then `el("details", { class: "studio-export" }, [el("summary", {}, [icon("download"), "Export options"]), zoneToggle, exportButtons])`, then `exportStatus` outside the disclosure so its message is always seen. If the sprite has no download icon, add the mockup's `i-download` path to `src/web/icons.svg`.
- **Review** (`rightColumn`):
  - `renderCheck`: the passed items are listed directly after the open ones; remove the `details` with "`n` items OK" and its comment.
  - Caption card: `captionHolder` as it is, then `el("details", { class: "studio-caption-extra" }, [summary, the link field, the alt text field])`. The summary reads "Alt text included" or "No alt text yet", updated on `altField`'s `input`.
  - Status card: in `buildStatus`, the heading is "Planned for" for a scheduled post and "Status" otherwise (the `h2` is created where the card is assembled: make it a variable so `buildStatus` can set its text). A scheduled post shows a date tile (day number over the short month, as on the Overview), "Monday, 19 October" and "09:00 · LinkedIn square", and a link "View in planner" to `#planning`. The date and time field with Schedule or Reschedule, and "Ready to post", stay directly visible. Convert, Back to draft, Archive, Duplicate and Delete move into `el("details", { class: "post-menu" }, [el("summary", { text: "More" }), el("div", { class: "post-menu-list" }, [...])])`, the structure `library.js` line 171 uses. Under the card a muted line: "Export the post, then upload it yourself. The planner keeps track of when it is due."
- Every rule about when a post may be scheduled, and what an action does, stays exactly as in `buildStatus` today; only where the controls sit changes.

- [ ] **Step 8: "Go to" opens what is closed**

In `goTo`, before focusing `fieldTarget`, and before focusing the caption textarea:

```js
// A field inside a closed disclosure cannot take focus: open what it sits in first.
for (let d = fieldTarget?.closest("details"); d; d = d.parentElement?.closest("details")) d.open = true;
```

- [ ] **Step 9: Phone tabs**

In `TABS`, change only the labels: `["fields", "Content", …]`, `["preview", "Preview", …]`, `["caption", "Review", …]`. Ids, order and the tab that opens first stay. Update the `aria-label` of `rightColumn` to "Review".

- [ ] **Step 10: Browser tests** in `tests/mobile.test.ts`

Read the file's helpers first and write these three in its style (it opens a page per test at a given width and uses `postId`). Add:

1. *"Go to" opens a closed disclosure (1440).* Open `#editor/<id>` of the sample post whose brand check has a finding with a "Go to" button for a field inside "Post details" (the sample statistic post: its number has no active fact). Close the disclosure with `page.evaluate(() => document.querySelector(".studio-post-details").removeAttribute("open"))`, click that finding's `.studio-go-to`, and expect `.studio-post-details` to have the attribute `open` and `document.activeElement` to be inside it.
2. *A long title does not push the phone sideways (375).* Fill `#field-title` with 120 characters (`"Long title ".repeat(11).slice(0, 120)`) and expect `document.documentElement.scrollWidth <= window.innerWidth`.
3. In the existing tablet test that looks at `.studio-fact-list`, open `.studio-post-details` first if the list is no longer visible.

Run: `npx vitest run tests/mobile.test.ts tests/slides-browser.test.ts tests/own-template-browser.test.ts`
Expected: PASS, with no "skipped" line.

- [ ] **Step 11: CSS and a look**

Editor section of `studio.css`: three columns in the mockup's proportions (narrow Content, wide Artwork on the canvas ground, Review as a rail with hairlines between its parts instead of boxed cards), the header, the disclosures. Tablet (two columns) and phone (tabs) rules keep working. Look at `#editor/<id>` at 1440, 820 and 390, light and dark, next to `mockup-editor-*.png`: a single-image post, a post with several slides, a carousel, a new post from `#editor`, and a post with a brand-check error.

- [ ] **Step 12: All checks, then commit**

```bash
npm test && npm run typecheck && npm run format:check
git add -A && git commit -m "Editor: a compact header, grouped fields and a review rail"
```

---

### Task 4: Planner

**Files:**
- Modify: `src/web/studio/calendar.js`, `src/web/studio/planning.js`, `src/web/studio.css` (planner rules: grep `studio-planner`, `studio-plan-`, `studio-month`, `studio-period`, `studio-campaigns`)
- Test: `tests/calendar.test.ts`

**Interfaces:**
- Consumes: `deskOf`, `factProblems` from `/studio/desk.js` (Task 2); `drawArtwork` from `/studio/post-cards.js`; `plusDays` from `/studio/calendar.js`.
- Produces: `agendaDays(monday, rows)` in `calendar.js` → seven `{ date, rows }`.

- [ ] **Step 1: Write the failing test**, added to `tests/calendar.test.ts`

```ts
describe("agendaDays", () => {
  const row = (sort: string) => ({ sort });
  it("gives the seven days of the week, each with its rows in order", () => {
    const days = agendaDays("2026-10-19", [row("2026-10-19 1 b"), row("2026-10-21 2 idea"), row("2026-10-19 0 a")]);
    expect(days.map((d) => d.date)).toEqual([
      "2026-10-19",
      "2026-10-20",
      "2026-10-21",
      "2026-10-22",
      "2026-10-23",
      "2026-10-24",
      "2026-10-25",
    ]);
    expect(days[0].rows.map((r) => r.sort)).toEqual(["2026-10-19 0 a", "2026-10-19 1 b"]);
    expect(days[2].rows).toHaveLength(1);
    expect(days[1].rows).toEqual([]);
  });
  it("shows a week that holds only a moment", () => {
    expect(agendaDays("2026-10-19", [row("2026-10-23 0 moment")])[4].rows).toHaveLength(1);
  });
  it("leaves out a row dated outside the week", () => {
    const days = agendaDays("2026-10-19", [row("2026-10-26 1 next week")]);
    expect(days.every((d) => d.rows.length === 0)).toBe(true);
  });
});
```

Add `agendaDays` to the file's import from `../src/web/studio/calendar.js`.

- [ ] **Step 2: Run it and see it fail**

Run: `npx vitest run tests/calendar.test.ts`
Expected: FAIL, `agendaDays` is not exported.

- [ ] **Step 3: Add `agendaDays` to `calendar.js`**

```js
/**
 * The seven days of the week that starts on `monday`, each with the rows that fall on it. A row
 * carries a `sort` key that starts with its date (YYYY-MM-DD); within a day the rows keep that order.
 */
export function agendaDays(monday, rows) {
  return Array.from({ length: 7 }, (_, i) => {
    const date = plusDays(monday, i);
    return {
      date,
      rows: rows.filter((r) => r.sort.startsWith(date)).sort((a, b) => a.sort.localeCompare(b.sort)),
    };
  });
}
```

- [ ] **Step 4: Run the test**

Run: `npx vitest run tests/calendar.test.ts`
Expected: PASS.

- [ ] **Step 5: From table rows to agenda items**

In `planning.js`:

- `row(p)`, `ideaRow(i)` and `momentRow(m, day)` return `el("div", { class: "studio-agenda-item" }, […])` instead of a `tr`: a time (posts: `HH:MM` of `p.scheduled` or of the publication; ideas and moments none), for a post its thumbnail (`el("div", { class: "studio-artwork", "aria-hidden": "true" }, [thumbnail])` with `thumbnail.dataset.id = p.id`, the structure `drawArtwork` looks for), a body with the status badge, the title link and the line that is the `table-subtext` today, and the actions. For a post, `rescheduleField(p)` moves into `el("details", { class: "studio-item-more" }, [el("summary", { text: "Reschedule" }), rescheduleField(p)])`. The buttons of ideas and moments stay visible. Keep every handler as it is.
- `table(title, rows, { sub, below })` becomes `block(title, items, { sub, below })` with the same section and heading and `el("div", { class: "studio-agenda-list" }, items)` in place of the table. It serves "Open ideas from earlier", "Overdue" and "Published, past 30 days". Remove the `thead` it built.
- In `renderList`, the week loop builds, per week: the heading "19–25 October" (day of the Monday, an en dash, day and month of the Sunday; when the months differ, "26 October – 1 November"), the sub line "Week 43 · 1 scheduled post" (the week number, with the year when it is not this year, and the number of posts when there is one), and:
  - a week with rows: `el("ol", { class: "studio-week-agenda" }, agendaDays(w.monday, rows).map(day))`, where `day` is an `li.studio-day` with the weekday (`DAYS[i]`) over the day number, `aria-current="date"` on today, and that day's items (`r.tr` renamed `r.item`) or `el("p", { class: "help-text", text: "No post planned" })`;
  - a week that is not `filled`: one line `.studio-week-empty` with "Nothing planned" and the button "Ideas for this week" (the handler of `emptyWeek` as it is; the `emptyState` block goes). A week with only moments shows its days and this line.
- After `calendarHolder.replaceChildren(...)`, disconnect the previous observer and draw the thumbnails: `observer?.disconnect(); observer = drawArtwork(container, posts, ctx.brand);` with `let observer` at the top of `show`. `show` returns `{ leave: () => observer?.disconnect() }`.

- [ ] **Step 6: Period, side column, campaigns**

- `periodCard` becomes a `details.studio-period` whose `summary` holds the `h2` "Period and ideas"; `panel.element` goes inside it too if it only makes sense with a period (read `ideas-ui.js` to see; otherwise leave it beside the agenda). Wherever the code sets a period or focuses `fromField` (`setPeriod`, `chooseDay`, the "Ideas for this week" handler), set `periodCard.open = true` first.
- A new side column `el("aside", { class: "studio-planner-side" }, [drafts, campaigns card, note])`:
  - "Still on your desk": `deskOf(posts.filter((p) => p.status === "draft"), 4)`, each with its thumbnail, the title as a link to its editor and "Statement · Draft"; a post in `factProblems(posts, facts, today)` gets the line "Needs an active fact before it can be scheduled." in the warning colour. Load `/api/facts` in the `Promise.all` at the top, with the same `.catch` as the Overview. The count "`n` drafts" on the right of the heading; a link "All drafts" to `#library/draft` when there are more than four; "No drafts on your desk." when there are none.
  - Campaigns, in `renderCampaigns`: the empty state reads "No campaigns yet. Group related posts and give their links a shared UTM name." The form goes into `el("details", { class: "studio-campaign-form" }, [el("summary", { text: "Add campaign" }), …])`; starting to edit a campaign opens it, and Cancel or a save closes it.
  - The note: "Check before you schedule." / "Save the post with a passing brand check, then choose a future date."
- `icsButton` reads "Export calendar" and stays in `.studio-bar`.
- A closing line under the agenda: "Postwright keeps the plan. You export and upload the posts."
- `renderMonth` is not changed.

- [ ] **Step 7: CSS and a look**

`.studio-planner` becomes two columns (agenda wide, side column about 300px), one column under 900px with the side column below. Day rows as in the mockup: the weekday small and muted over a large day number, today's number in clay, a hairline between days, a post as a card on `--card`. The month view takes the new tokens. Look at `#planning` at 1440 and 390, light and dark, next to `mockup-planner-*.png`: with the sample content, with an idea added, in the month view, with a period chosen by clicking two days in the month, and while editing a campaign.

- [ ] **Step 8: All checks, then commit**

```bash
npm test && npm run typecheck && npm run format:check
git add -A && git commit -m "Planner: a week agenda per day, drafts and campaigns beside it"
```

---

### Task 5: The other screens, docs and screenshots

**Files:**
- Modify: `src/web/studio.css` (only what the pass below finds), `README.md`, `assets/screen-overview.png`, `assets/screen-editor.png`, `assets/screen-templates.png`, `assets/screen-brand-kit.png`
- Create: `docs/interface-handover.md`

- [ ] **Step 1: One pass over the other screens**

Open All posts, the template gallery (`#editor`), Brand kit, Templates, Fact bank, Snippets and Settings at 1440 and 390, light and dark. Fix what the new palette or the shared controls broke (a border that vanished, text that lost contrast, a card frame that no longer fits). No layout changes.

- [ ] **Step 2: The README screenshots**

The four `assets/screen-*.png` are 2720 × 1700 (a 1360 × 850 window at twice the density). Make them again from a studio with only the sample content, so nothing private is in them: write a throwaway script outside the repository that uses `startStudio()` from `tests/helpers/studio.ts` and `playwright-core` with `channel: "chrome"`, as `tests/mobile.test.ts` does, posts to `/api/sample-content`, and saves a screenshot of `#overview`, `#editor/<id>`, `#templates` and `#brand-kit` with `viewport: { width: 1360, height: 850 }, deviceScaleFactor: 2, colorScheme: "light"`. Look at each image before replacing the file. Update the alt texts and captions in `README.md` lines 37–42 where they no longer describe what is shown.

- [ ] **Step 3: `docs/interface-handover.md`**

Short, in the style of `docs/multi-slide-handover.md`: what changed per screen, the new modules (`theme.js`, `theme-boot.js`, `desk.js`, `field-groups.js`, `agendaDays`), what was left out of the mockup and why (the list in the spec), and what is open.

- [ ] **Step 4: All checks, then commit**

```bash
npm test && npm run typecheck && npm run format:check
git add -A && git commit -m "Interface: handover, README screenshots and fixes on the other screens"
```

- [ ] **Step 5: One review of the whole branch**

`git diff main...interface` against the spec and the Review focus list. Fix what it finds, then squash to one commit per finished piece if fix commits were added.
