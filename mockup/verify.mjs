import assert from "node:assert/strict";
import { readFile, readdir, stat } from "node:fs/promises";
import { fileURLToPath } from "node:url";

const root = new URL(".", import.meta.url);
const html = await readFile(new URL("index.html", root), "utf8");
const css = await readFile(new URL("studio.css", root), "utf8");
const ids = [...html.matchAll(/\bid="([^"]+)"/g)].map((match) => match[1]);
assert.equal(new Set(ids).size, ids.length, "Duplicate HTML IDs");
for (const match of html.matchAll(
  /\b(?:for|aria-controls|aria-labelledby)="([^"]+)"/g,
)) {
  for (const id of match[1].split(/\s+/))
    assert(ids.includes(id), `Missing accessible reference: ${id}`);
}
for (const match of html.matchAll(/\b(?:src|href)="([^"]+)"/g)) {
  const reference = match[1];
  if (reference.startsWith("#")) {
    assert(
      ids.includes(reference.slice(1)),
      `Missing link target: ${reference}`,
    );
  } else {
    assert(
      !/^[a-z][a-z0-9+.-]*:/i.test(reference),
      `Remote or absolute resource: ${reference}`,
    );
    assert(
      (await stat(new URL(reference, root))).isFile(),
      `Missing asset: ${reference}`,
    );
  }
}
for (const match of css.matchAll(/url\("([^"]+)"\)/g))
  assert((await stat(new URL(match[1], root))).isFile());
assert(/prefers-color-scheme:\s*dark/.test(css));
assert(/prefers-reduced-motion:\s*reduce/.test(css));
assert(css.includes(":focus-visible"));
assert(html.includes('lang="en"'));
assert(html.includes('role="tablist"'));
assert.equal((html.match(/class="screen"/g) || []).length, 3);

const rules = [
  ["private path", new RegExp("/" + "(?:Users|home)/[\\w.-]+")],
  ["email address", /[\w.+-]+@[\w-]+\.[a-z]{2,}/i],
  ["API credential", /sk-(?!(ant-)?test-)(ant-)?[A-Za-z0-9_-]{20,}/],
];
let count = 0;
async function inspect(directory) {
  for (const item of await readdir(directory, { withFileTypes: true })) {
    if ([".tmp", ".review-data"].includes(item.name)) continue;
    const url = new URL(item.name + (item.isDirectory() ? "/" : ""), directory);
    if (item.isDirectory()) await inspect(url);
    else if (/\.(html|css|js|mjs|md|json|svg|txt)$/.test(item.name)) {
      const text = await readFile(url, "utf8");
      for (const [label, rule] of rules)
        assert(
          !rule.test(text),
          `${label} in ${fileURLToPath(url).split("/mockup/").pop()}`,
        );
      count++;
    }
  }
}
await inspect(root);
console.log(
  `Static checks passed: 3 screens, unique IDs, accessibility references, local assets, theme/focus/reduced-motion provisions and ${count} public-safe text files.`,
);
console.log(
  "These checks do not establish browser appearance or runtime accessibility.",
);
