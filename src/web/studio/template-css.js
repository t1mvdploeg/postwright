// Marketing studio: the base layout of all templates. An image sits here in a foreignObject
// or a scaled iframe instead of in a browser window of its own, therefore:
//  - no `html { font-size: calc(100vw / 108) }`: `buildImage` converts every rem to pixels
//    (width ÷ 108), because in a foreignObject the root is the <svg> element;
//  - `.image` gets the size of the format (`--width`/`--height`) instead of 100vw/100vh;
//  - a story recognises the image by the shape class `.shape-story`, not by a media query.
// The colours and the font come from the active brand (see `brandCss` in templates.js).
export const BASE_CSS = `/* Sjablonen voor sociale media. Eén rem is 10px op een canvas van 1080 breed en schaalt mee met de breedte,
   zodat één bron zowel 1200×1200 als 1080×1350 oplevert. */
body { margin: 0; }
.image {
  --emphasis: var(--accent);
  --soft: var(--muted);
  --hairline: var(--stroke);
  box-sizing: border-box;
  position: relative;
  isolation: isolate;
  display: flex;
  flex-direction: column;
  width: var(--width);
  height: var(--height);
  padding: 8rem;
  overflow: hidden;
  background: var(--ground-light);
  color: var(--ground-light-text);
}
*, *::before, *::after { box-sizing: border-box; }
h1, h2, h3, p, ol, ul, dl, dd { margin: 0; }
svg { display: block; }
.symbols { position: absolute; width: 0; height: 0; }

/* Drie ondergronden, per beeld één; het accent van de kop volgt de ondergrond. De kleuren komen uit het merk (gronden). */
.ground-ink { background: var(--ground-ink); color: var(--ground-ink-text); --emphasis: var(--accent-light); --soft: var(--accent-pale); --hairline: color-mix(in srgb, var(--accent-pale) 22%, var(--ground-ink)); }
.ground-accent { background: var(--ground-accent); color: var(--ground-accent-text); --emphasis: var(--accent-pale); --soft: var(--ground-accent-text); --hairline: color-mix(in srgb, var(--ground-accent-text) 32%, var(--ground-accent)); }

.logo { display: block; align-self: flex-start; height: 4.6rem; width: auto; }
.icon { width: 2.4rem; height: 2.4rem; fill: none; stroke: currentColor; stroke-width: 1.7; stroke-linecap: round; stroke-linejoin: round; flex-shrink: 0; }

.headline { font-size: 10.4rem; font-weight: 550; line-height: 1.03; letter-spacing: -.04em; text-wrap: balance; }
.headline em { font-style: normal; color: var(--emphasis); }
.headline.medium { font-size: 8.4rem; line-height: 1.06; }
.headline.small { font-size: 6.6rem; line-height: 1.08; }
.text { font-size: 3rem; line-height: 1.45; color: var(--soft); max-width: 32ch; text-wrap: pretty; }

.footer { display: flex; align-items: center; justify-content: space-between; gap: 3rem; padding-top: 3rem; border-top: .2rem solid var(--hairline); font-size: 2.3rem; color: var(--soft); }
.footer strong { font-weight: 550; color: inherit; }
.headline-row { display: flex; align-items: center; justify-content: space-between; gap: 3rem; }

/* Motief: de zigzag van de W uit het logo, als lijn op grote schaal (merk/motieven/route.svg). */
.route { position: absolute; z-index: -1; width: 132rem; top: -16.75rem; left: -13.5rem; fill: none; stroke: var(--route, var(--accent-soft)); stroke-width: 2.25; stroke-linecap: round; stroke-linejoin: round; }
.ground-ink .route { --route: color-mix(in srgb, var(--accent-light) 9%, var(--ground-ink)); }
.ground-accent .route { --route: color-mix(in srgb, var(--ground-accent-text) 9%, var(--ground-accent)); }

/* Motief: een haarlijnring, zoals de profielachtergrond hem gebruikt. */
.ring { position: absolute; z-index: -1; aspect-ratio: 1; border-radius: 50%; border: .2rem solid color-mix(in srgb, var(--accent) 18%, transparent); }
.ground-ink .ring { border-color: var(--hairline); }
.ground-accent .ring { border-color: var(--hairline); }

/* Papieren lagen: vlak gedraaid, nooit perspectief; lange zachte schaduw die onder het papier blijft. */
.paper { background: var(--white); color: var(--ink); border-radius: 1.8rem; box-shadow: 0 2.5rem 5.7rem -2.5rem rgb(43 17 11 / .24); }
.amount { font-variant-numeric: tabular-nums; letter-spacing: -.035em; white-space: nowrap; }

/* De keten: open knooppunten, een lijn, het laatste knooppunt gevuld. */
.chain { display: flex; align-items: center; gap: 1.6rem; font-size: 2.2rem; color: var(--soft); }
.chain > span, .chain > strong { display: inline-flex; align-items: center; gap: 1.2rem; white-space: nowrap; }
.chain > span::before, .chain > strong::before { content: ""; width: 1.4rem; height: 1.4rem; border: .22rem solid var(--emphasis); border-radius: 50%; }
.chain > strong { font-weight: 550; color: inherit; }
.chain > strong::before { background: var(--emphasis); }
.chain > i { flex: 1; min-width: 3rem; height: .2rem; background: var(--hairline); }

/* Werkroute: genummerde stappen die een lijn verbindt; de volgorde draagt betekenis. */
.steps { list-style: none; padding: 0; }
.steps li { position: relative; display: flex; gap: 3.2rem; align-items: flex-start; padding-block: 2.6rem; }
.steps li + li { border-top: .15rem solid var(--hairline); }
.steps li:not(:last-child)::before { content: ""; position: absolute; left: 2.8rem; top: 9.2rem; bottom: -2.6rem; width: .15rem; background: color-mix(in srgb, var(--accent-light) 45%, var(--ink)); }
.route-number { display: grid; place-items: center; width: 5.7rem; height: 5.7rem; flex-shrink: 0; border: .15rem solid color-mix(in srgb, var(--accent-light) 45%, var(--ink)); border-radius: 50%; color: var(--accent-light); font-size: 2rem; font-variant-numeric: tabular-nums; }
.steps h2 { padding-top: .8rem; font-size: 3.2rem; font-weight: 550; letter-spacing: -.02em; line-height: 1.3; }
.steps p { margin-top: .8rem; max-width: 40ch; font-size: 2.4rem; line-height: 1.5; color: var(--soft); }

/* Verticaal verhaal (9:16): 250px vrij boven en onder voor de bediening van het platform. */
.shape-story .image { padding-block: 25rem; }

/* Welke stap in een carrousel: vier (of drie) knooppunten, de huidige gevuld. LinkedIn telt zelf de pagina's. */
.step-chain { display: flex; align-items: center; gap: .8rem; }
.step-chain i { width: 1.5rem; height: 1.5rem; border: .22rem solid var(--emphasis); border-radius: 50%; }
.step-chain i.now { background: var(--emphasis); }
.step-chain b { width: 3.2rem; height: .2rem; background: var(--hairline); }
.image:not(.ground-ink):not(.ground-accent) .step-chain b { background: var(--accent-pale); }

/* Een lijst met vinkjes in een vel, voor wat de gebruiker zelf doet. */
.checklist { padding: 1.4rem 3.6rem; }
.checklist li { display: flex; align-items: center; gap: 2rem; padding-block: 2.6rem; border-top: .15rem solid var(--stroke); font-size: 2.8rem; font-weight: 550; letter-spacing: -.015em; list-style: none; }
.checklist li:first-child { border-top: 0; }
.checklist .icon { width: 3rem; height: 3rem; color: var(--accent); stroke-width: 2; }
`;
