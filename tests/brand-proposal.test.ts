// The check of a brand kit proposal: one function for the studio, the server and
// `npm run brand:check`, so that a proposal from either route is judged the same way.
import { spawnSync } from "node:child_process";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { checkProposal, LOGO_MODES } from "../src/server/brand-proposal.js";
import { prepareData } from "../src/server/projects.js";
import { raw } from "./helpers/raw.js";
import { startStudio } from "./helpers/studio.js";
import { writeProposal } from "./helpers/proposal.js";

const tmp = () => mkdtempSync(join(tmpdir(), "pw-proposal-"));

describe("checkProposal", () => {
  it("says none when there is no proposal", async () => {
    expect(await checkProposal(tmp())).toEqual({ state: "none" });
  });

  it("accepts a complete proposal, with empty extras when there is no extras.json", async () => {
    const dir = tmp();
    writeProposal(dir);
    const r = await checkProposal(dir);
    expect(r).toMatchObject({
      state: "ready",
      brand: { name: "Postwright" },
      extras: { tone: "", bannedWords: [], hashtags: "", notes: [] },
    });
  });

  it("reads extras.json", async () => {
    const dir = tmp();
    const proposal = writeProposal(dir);
    const extras = { tone: "Warm.", bannedWords: ["cheap"], hashtags: "#a #b", notes: ["Font missing."] };
    writeFileSync(join(proposal, "extras.json"), JSON.stringify(extras));
    expect(await checkProposal(dir)).toMatchObject({ state: "ready", extras });
  });

  const problems = async (dir: string) => {
    const r = await checkProposal(dir);
    expect(r.state).toBe("invalid");
    return r.state === "invalid" ? r.problems : [];
  };

  it("names a logo file that is missing", async () => {
    const dir = tmp();
    writeProposal(dir, (_b, d) => rmSync(join(d, "logo", "on-ink.svg")));
    expect(await problems(dir)).toContain("brand.json: logos.on-ink: file logo/on-ink.svg not found");
  });

  it("names a logo mode that is missing from brand.json", async () => {
    const dir = tmp();
    writeProposal(dir, (b) => delete b.logos["mark-on-accent"]);
    expect(await problems(dir)).toContain("brand.json: logos.mark-on-accent: missing");
  });

  it.each(["../../../etc/passwd", "../brand.json", "/etc/passwd"])("refuses the logo path %s", async (rel) => {
    const dir = tmp();
    writeProposal(dir, (b) => (b.logos.default = rel));
    const list = await problems(dir);
    expect(list.some((p) => p.startsWith("brand.json: logos.default:"))).toBe(true);
  });

  it("refuses a logo that is an SVG with a script, or a PNG that is not one", async () => {
    const dir = tmp();
    writeProposal(dir, (b, d) => {
      writeFileSync(join(d, "logo", "white.svg"), '<svg xmlns="http://www.w3.org/2000/svg"><script>x</script></svg>');
      writeFileSync(join(d, "logo", "fake.png"), "<html></html>");
      b.logos.mark = "logo/fake.png";
    });
    const list = await problems(dir);
    expect(list.some((p) => p.startsWith("brand.json: logos.white:") && p.includes("script"))).toBe(true);
    expect(list.some((p) => p.startsWith("brand.json: logos.mark:") && p.includes("not a PNG"))).toBe(true);
  });

  it("refuses a font that is not a font, and one whose extension lies", async () => {
    const dir = tmp();
    writeProposal(dir, (_b, d) => writeFileSync(join(d, "fonts", "inter-latin.woff2"), "<html></html>"));
    expect((await problems(dir)).some((p) => p.startsWith("brand.json: font.files.0:"))).toBe(true);
  });

  it("names the ground whose contrast is below 4.5:1", async () => {
    const dir = tmp();
    writeProposal(dir, (b) => (b.grounds.light.text = b.grounds.light.background));
    expect(await problems(dir)).toContain("brand.json: grounds.light: contrast 1:1 is below 4.5:1");
  });

  it("names a missing or non-hex css variable", async () => {
    const dir = tmp();
    writeProposal(dir, (b) => {
      delete b.css["--ink"];
      b.css["--accent"] = "red";
    });
    const list = await problems(dir);
    expect(list).toContain("brand.json: css.--ink: missing");
    expect(list).toContain("brand.json: css.--accent: not a hex colour (#rrggbb)");
  });

  it("refuses a version longer than the 40 characters a post can hold", async () => {
    const dir = tmp();
    writeProposal(dir, (b) => (b.version = "v".repeat(41)));
    expect(await problems(dir)).toContain("brand.json: version: longer than 40 characters");
  });

  it("names the schema field that is wrong, and nothing else", async () => {
    const dir = tmp();
    writeProposal(dir, (b) => (b.colors = []));
    const list = await problems(dir);
    expect(list).toHaveLength(1);
    expect(list[0]).toMatch(/^brand\.json: colors: /);
  });

  it("refuses brand.json that is not JSON, and extras.json that does not fit", async () => {
    const dir = tmp();
    const proposal = writeProposal(dir);
    writeFileSync(join(proposal, "extras.json"), '{"bannedWords":"cheap"}');
    expect((await problems(dir))[0]).toMatch(/^extras\.json: bannedWords/);
    writeFileSync(join(proposal, "brand.json"), "{nope");
    expect(await problems(dir)).toEqual(["brand.json: not valid JSON"]);
  });

  it("knows the eight logo modes", () => {
    expect([...LOGO_MODES]).toEqual([
      "default",
      "on-ink",
      "on-accent",
      "ink",
      "white",
      "mark",
      "mark-on-ink",
      "mark-on-accent",
    ]);
  });
});

describe("the route and the static path", () => {
  const studios: Array<{ close: () => Promise<void> }> = [];
  afterEach(async () => {
    while (studios.length) await studios.pop()!.close();
  });

  it("shows the proposal of the project in the header, and its files", async () => {
    const s = await startStudio();
    studios.push(s);
    await fetch(s.base + "/api/projects", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ name: "Beta" }),
    });
    const get = (project?: string) =>
      fetch(s.base + "/api/brand/proposal", { headers: project ? { "x-postwright-project": project } : {} });
    expect(await (await get()).json()).toEqual({ state: "none" });
    writeProposal(s.projectDir);
    expect(await (await get()).json()).toMatchObject({ state: "ready", brand: { name: "Postwright" } });
    expect(await (await get("beta")).json()).toEqual({ state: "none" });
    const logo = await fetch(s.base + "/brand-proposal/logo/default.svg");
    expect(logo.status).toBe(200);
    expect(logo.headers.get("content-type")).toBe("image/svg+xml");
    expect(
      (await fetch(s.base + "/brand-proposal/logo/default.svg", { headers: { "x-postwright-project": "beta" } }))
        .status,
    ).toBe(404);
  });

  it("does not serve anything outside the proposal folder", async () => {
    const s = await startStudio();
    studios.push(s);
    writeProposal(s.projectDir);
    writeFileSync(join(s.projectDir, "brand-input", "input.json"), '{"website":"","notes":"private"}');
    for (const path of [
      "/brand-proposal/..%2finput.json",
      "/brand-proposal/../input.json",
      "/brand-proposal/%2e%2e%2finput.json",
    ]) {
      const r = await raw(s.base, { path });
      expect(r.status, path).toBe(404);
      expect(r.text).not.toContain("private");
    }
  });
});

describe("npm run brand:check", () => {
  const run = (dataDir: string, ...args: string[]) =>
    spawnSync(process.execPath, ["--import", "tsx", "src/server/brand-check-cli.ts", ...args], {
      env: { ...process.env, POSTWRIGHT_DATA_DIR: dataDir },
      encoding: "utf8",
    });

  async function data() {
    const dataDir = join(tmp(), "data");
    await prepareData(dataDir);
    return { dataDir, project: join(dataDir, "projects", "postwright") };
  }

  it("approves a valid proposal with exit code 0", async () => {
    const { dataDir, project } = await data();
    writeProposal(project);
    const r = run(dataDir, "postwright");
    expect(r.status).toBe(0);
    expect(r.stdout).toContain("valid");
  });

  it("names every problem with its field and exits with 1", async () => {
    const { dataDir, project } = await data();
    writeProposal(project, (b, d) => {
      rmSync(join(d, "logo", "on-ink.svg"));
      b.grounds.ink.text = b.grounds.ink.background;
    });
    const r = run(dataDir, "postwright");
    expect(r.status).toBe(1);
    expect(r.stdout).toContain("logos.on-ink");
    expect(r.stdout).toContain("grounds.ink");
  });

  it("says what is wrong when there is no proposal, no argument, or no such project", async () => {
    const { dataDir } = await data();
    expect(run(dataDir, "postwright").status).toBe(1);
    expect(run(dataDir, "postwright").stdout).toContain("No proposal found");
    expect(run(dataDir).status).toBe(2);
    expect(run(dataDir, "../x").status).toBe(2);
    const unknown = run(dataDir, "nope");
    expect(unknown.status).toBe(1);
    expect(unknown.stdout).toContain("Unknown project");
  });
});
