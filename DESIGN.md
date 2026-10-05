# Postwright studio design

## Direction
A quiet working surface around loud artwork: warm paper, matte clay as the one accent, olive ink, and the social posts as the main content. The interface stays calm and predictable so the posts carry the colour. The look lives in `src/web/studio.css`; `src/web/index.html` is the shell.

## System
Inter from the local font asset (`src/web/fonts`). Colours are CSS variables at the top of `studio.css`: background #f8f7f4, sidebar #f3f3ee, ink #292b27, clay #bc452e (hover #a33825), olive #404b39, hairline edges #e7e7e0. Hairline separators, native form controls, visible focus, modest radii (7, 12 and 14px). Operational labels are compact (12-14px); large headings appear only in screen introductions. Post previews scale as artwork.

## Surface
A persistent sidebar with the project picker and two groups: Workspace (Overview, All posts, Planner, Editor) and Your foundation (Brand kit, Fact bank, Snippets), with Settings at the foot. A toolbar above the screen shows the project and the current screen. The overview is a post desk of previews showing only title and state, next to a weekly agenda. Details such as format and channel stay in the library and the editor.

## Responsive behavior
Desktop shows the navigation permanently. At 1180px and narrower the agenda moves below the desk and the desk shows three previews; at 700px and narrower previews go to two columns. At 900px and narrower the sidebar becomes a menu behind a Menu button. At 1500px and wider, the post library shows five columns. `prefers-reduced-motion` switches the entrance animations off.

## Dark mode
The studio follows the system setting (prefers-color-scheme). The dark tokens in studio.css are the same warm studio at night: brown-grey paper (#1e1c19), clay lightened to #ec7d63 for text and lines, while buttons keep the clay fill with white text. Posts, thumbnails, exports and the brand colours are drawn in the brand's own colours and never use these tokens.
