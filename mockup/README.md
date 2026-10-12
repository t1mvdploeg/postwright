# Postwright studio interface study

Open `index.html` directly in a browser. No server, build, installation, CDN or remote assets are needed for the mockup. Choose Overview, Editor or Planner in the navigation; the colour selector starts with the system preference. On a phone, the Editor has Content, Preview and Review panels with arrow-key navigation.

The sample workspace contains two drafts and one scheduled steps post. Dates and state are fixed illustrative content. Native disclosure controls reveal the draft fact issue, alt text, export options and short explanations. Fields are read-only and Save/export actions are disabled; the real app supplies that behavior. Foundation screens are context only. The artwork is a static interpretation of the sample templates, rather than the real export renderer.

[The report](REPORT.md) covers the ten weaknesses, screen decisions, integration and verification limits. [Screenshot evidence](screens/README.md) separates copied repository references from the blocked capture matrix. No new screenshots or browser visual approval are claimed.

From the repository root:

```sh
node mockup/verify.mjs
node mockup/interaction-check.mjs
mkdir -p mockup/.tmp
TMPDIR="$PWD/mockup/.tmp" npm test -- --config mockup/test.config.mjs --configLoader runner --cache=false --attachmentsDir mockup/.tmp/attachments
```

The last command reuses the existing test configuration and confines temporary data, caches and attachments to this folder. It introduces no test dependencies and changes no application files. Google Chrome was unavailable in the sandbox, so the existing browser tests were skipped.

The screenshot script in `capture.mjs` is provided for an environment with browser access; its instructions are in `screens/README.md`. It has not completed here.
