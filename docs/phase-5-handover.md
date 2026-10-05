# Postwright phase 5: handover

Branch `fase-5`, merged into `main` and pushed on 5 October 2026.

## What is in it

- **Company profile** per project, at the top of Settings: what the company does, sector, products and services, audience, region and website. Stored in the project's `marketing/settings.json` (`settings.profile`, `CompanyProfileSchema` in `src/server/schema.ts`). The idea planner and writing help get it as context. It is not a source of numbers: the number checks still accept only facts and moments. With AI help on and an empty profile, the ideas form points to Settings.
- **Ctrl/Cmd+S** saves in the editor only (`isSaveShortcut` in `src/web/ui.js`).
- **Mockup removed**: `src/web/mockup/`, the mockup images and their test. The local branch `mockup-archief` keeps a copy. DESIGN.md and PRODUCT.md now describe the studio.
- **Dark mode** following the system setting, as tokens in `studio.css`. Posts, previews and exports keep the brand's colours.
- **Phone and tablet**: the menu is `inert` while closed, Escape closes it and focus moves correctly; no shadow edge; planner and fact bank rows become cards; post actions in a "⋯" menu; the week comes first in the planner; upload tiles in the brand kit; a shorter breadcrumb. The editor has Fields / Preview / Caption tabs on phones, a two-column layout on tablets and a fixed bar with Save, brand check and status.
- **Mobile check test** `tests/mobile.test.ts` with `playwright-core` and the installed Chrome (GitHub's runner has it). Without Chrome it skips locally and fails in CI.
- **AI-made templates** (spec `docs/superpowers/specs/2026-10-05-ai-templates-design.md`, plan `docs/superpowers/plans/2026-10-05-ai-templates.md`). A template is data in `data/projects/<slug>/templates/own-<8 hex>.json`; `src/web/studio/own-template.js` has the only judge (`checkTemplate`) and the engine (`compileTemplate`). Route A is `POST /api/template-generate` (one Opus call through `runPaid`, reserve $1, booked as `template:<slug>`; without a key it returns the fixed sample), route B is `GET /api/template-prompt` plus `npm run template:check -- <project>`. Material lives in `template-input/`, a waiting proposal in `template-input/proposal/` (`template.json`, optional `extras.json` with notes and the sample flag). The Templates screen is under "Your foundation".

## Open

1. The real-key trial from phase 4 (costs money).
2. The tablet editor's sticky preview has an inner scroll on short screens; not tried on a short screen.
3. iOS safe area: the bottom bar uses `env(safe-area-inset-bottom)`, which only works once `viewport-fit=cover` is in the viewport meta tag.
4. The profile is not filled in automatically when a brand kit is made from a website; it could be.
5. The planner does not search the web. Live search (Claude's web search tool) would cost extra per call; not built.
6. The paid call of route A has only been tried against a fake client: the real cost (estimated at 10 to 50 cents) and whether structured output accepts the depth-6 schema are unmeasured. If it refuses the schema, fall back to JSON in a normal reply, checked by the same `checkTemplate`.
7. Out of scope on purpose: editing a template's tree or CSS in the studio, sharing templates between projects, banner formats, fonts or images inside a template, animation, a carousel step-chain slot, web search while generating.
