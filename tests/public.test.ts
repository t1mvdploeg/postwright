// Postwright is public: every tracked file is checked for things that must not be published.
import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { expect, test } from "vitest";

const root = join(import.meta.dirname, "..");
const BINARY = /\.(png|jpg|webp|woff2|ico|pdf)$/;
const files = execFileSync("git", ["ls-files"], { cwd: root, encoding: "utf8" })
  .trim()
  .split("\n")
  .filter((f) => !BINARY.test(f));
const read = (f: string) => readFileSync(join(root, f), "utf8");

const RULES: [string, RegExp][] = [
  ["a path on someone's computer", /(\/Users\/|\/home\/|[A-Z]:\\Users\\)[\w.-]+/],
  [
    "an e-mail address",
    /[\w.+-]+@(?!users\.noreply\.github\.com|example\.(com|org)|postwright\.local)[\w-]+\.[a-z]{2,}/i,
  ],
  ["something that looks like an API key", /sk-(?!(ant-)?test-)(ant-)?[A-Za-z0-9_-]{20,}/],
  ["Dutch left over from the port", /\b(het|een|voor|niet|naar|wordt|deze|geen|zijn|zodat)\b/i],
];

test.each(files.filter((f) => f !== "package-lock.json" && f !== "tests/public.test.ts"))(
  "%s contains nothing private",
  (f) => {
    const hits = RULES.filter(([, re]) => re.test(read(f))).map(([name]) => name);
    expect(hits).toEqual([]);
  },
);

test("the data folder and env files are not tracked", () => {
  expect(files.filter((f) => f.startsWith("data/") || f.startsWith(".env"))).toEqual([]);
});
