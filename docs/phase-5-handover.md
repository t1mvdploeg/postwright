# Postwright phase 5: handover

Branch `fase-5`, based on `main` after phase 4. Nothing is pushed or merged.

## What is in it

- **Company profile** per project, at the top of Settings: what the company does, sector, products and services, audience, region and website. Stored in the project's `marketing/settings.json` (`settings.profile`, `CompanyProfileSchema` in `src/server/schema.ts`). The idea planner and writing help get it as context. It is not a source of numbers: the number checks still accept only facts and moments. With AI help on and an empty profile, the ideas form points to Settings.
- **Ctrl/Cmd+S** saves in the editor only (`isSaveShortcut` in `src/web/ui.js`).
- **Mockup removed**: `src/web/mockup/`, the mockup images and their test. The local branch `mockup-archief` keeps a copy. DESIGN.md and PRODUCT.md now describe the studio.
- **Dark mode** following the system setting, as tokens in `studio.css`. Posts, previews and exports keep the brand's colours.
- **Phone and tablet**: the menu is `inert` while closed, Escape closes it and focus moves correctly; no shadow edge; planner and fact bank rows become cards; post actions in a "⋯" menu; the week comes first in the planner; upload tiles in the brand kit; a shorter breadcrumb. The editor has Fields / Preview / Caption tabs on phones, a two-column layout on tablets and a fixed bar with Save, brand check and status.
- **Mobile check test** `tests/mobile.test.ts` with `playwright-core` and the installed Chrome (GitHub's runner has it). Without Chrome it skips locally and fails in CI.

## Open

1. The real-key trial from phase 4 (costs money).
2. The tablet editor's sticky preview has an inner scroll on short screens; not tried on a short screen.
3. iOS safe area: the bottom bar uses `env(safe-area-inset-bottom)`, which only works once `viewport-fit=cover` is in the viewport meta tag.
4. The profile is not filled in automatically when a brand kit is made from a website; it could be.
5. The planner does not search the web. Live search (Claude's web search tool) would cost extra per call; not built.
