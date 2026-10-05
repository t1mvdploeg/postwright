// From an answer of the model and the material to a proposal folder that passes the check:
// grounds with enough contrast, logo variants, a font, a version and the notes.
import { existsSync, mkdirSync, mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { crc32, deflateSync } from "node:zlib";
import { describe, expect, it } from "vitest";
import { saveInputFile, saveInputText } from "../src/server/brand-input.js";
import {
  BrandProposalSchema,
  buildProposal,
  fixGrounds,
  logoVariants,
  nextVersion,
} from "../src/server/brand-build.js";
import { serialize } from "../src/server/files.js";
import { readPng, writePng } from "../src/server/png.js";
import { AI_PROPOSAL } from "./helpers/brand-ai.js";
import { font, SVG } from "./helpers/brand-files.js";

const project = () => mkdtempSync(join(tmpdir(), "pw-build-"));
const TODAY = "2026-10-05";
const read = (dir: string, ...parts: string[]) => readFileSync(join(dir, "brand-input", "proposal", ...parts));
const build = (projectDir: string, extra: Record<string, unknown> = {}) =>
  buildProposal({
    projectDir,
    slug: "acme",
    ai: AI_PROPOSAL,
    websiteRead: true,
    today: TODAY,
    currentVersion: null,
    ...extra,
  });

/** A PNG with a chosen colour type, bit depth and interlace byte, and raw (unfiltered) rows. */
function pngWith(o: {
  width: number;
  height: number;
  colour: number;
  depth: number;
  interlace?: number;
  pixels: number[];
}): Buffer {
  const chunk = (type: string, body: Buffer) => {
    const head = Buffer.alloc(8);
    head.writeUInt32BE(body.length, 0);
    head.write(type, 4, "latin1");
    const crc = Buffer.alloc(4);
    crc.writeUInt32BE(crc32(Buffer.concat([head.subarray(4), body])), 0);
    return Buffer.concat([head, body, crc]);
  };
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(o.width, 0);
  ihdr.writeUInt32BE(o.height, 4);
  ihdr[8] = o.depth;
  ihdr[9] = o.colour;
  ihdr[12] = o.interlace ?? 0;
  const raw = Buffer.from([0, ...o.pixels]); // one row, filter type 0
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk("IHDR", ihdr),
    chunk("IDAT", deflateSync(raw)),
    chunk("IEND", Buffer.alloc(0)),
  ]);
}

describe("BrandProposalSchema", () => {
  it("accepts the fixture and refuses what the brand cannot use", () => {
    expect(BrandProposalSchema.safeParse(AI_PROPOSAL).success).toBe(true);
    expect(BrandProposalSchema.safeParse({ ...AI_PROPOSAL, colors: AI_PROPOSAL.colors.slice(0, 5) }).success).toBe(
      false,
    );
    expect(
      BrandProposalSchema.safeParse({ ...AI_PROPOSAL, css: { ...AI_PROPOSAL.css, "--ink": "dark" } }).success,
    ).toBe(false);
    const { grounds: _g, ...without } = AI_PROPOSAL;
    expect(BrandProposalSchema.safeParse(without).success).toBe(false);
  });
});

describe("nextVersion", () => {
  it("counts up on the same day and restarts on another", () => {
    expect(nextVersion("acme", TODAY, null)).toBe("acme-2026-10-05-1");
    expect(nextVersion("acme", TODAY, "acme-2026-10-05-1")).toBe("acme-2026-10-05-2");
    expect(nextVersion("acme", TODAY, "acme-2026-10-04-7")).toBe("acme-2026-10-05-1");
    expect(nextVersion("acme", TODAY, "postwright-1.0")).toBe("acme-2026-10-05-1");
  });

  it("fits in the 40 characters of a post's brandVersion, also for the longest slug", () => {
    expect(nextVersion("x".repeat(41), TODAY, null).length).toBeLessThanOrEqual(40);
    expect(nextVersion("x".repeat(41), TODAY, `${"x".repeat(24)}-2026-10-05-99`).length).toBeLessThanOrEqual(40);
  });
});

describe("fixGrounds", () => {
  it("leaves a ground that passes alone", () => {
    expect(fixGrounds(AI_PROPOSAL.grounds, AI_PROPOSAL.css["--ink"])).toEqual({
      grounds: AI_PROPOSAL.grounds,
      notes: [],
    });
  });

  it("changes the text to ink or white, whichever has more contrast, and says so", () => {
    const r = fixGrounds({ ...AI_PROPOSAL.grounds, light: { background: "#FFF7F3", text: "#FFE0D0" } }, "#2B110B");
    if ("error" in r) throw new Error(r.error);
    expect(r.grounds.light).toEqual({ background: "#FFF7F3", text: "#2B110B" });
    expect(r.notes).toHaveLength(1);
    expect(r.notes[0]).toMatch(/light ground.*#FFE0D0.*#2B110B/);
    const dark = fixGrounds({ ...AI_PROPOSAL.grounds, ink: { background: "#2B110B", text: "#3A1D14" } }, "#2B110B");
    if ("error" in dark) throw new Error(dark.error);
    expect(dark.grounds.ink.text).toBe("#FFFFFF");
  });

  it("refuses a ground where neither ink nor white reaches 4.5:1", () => {
    const r = fixGrounds({ ...AI_PROPOSAL.grounds, accent: { background: "#777777", text: "#888888" } }, "#2B110B");
    expect(r).toMatchObject({ error: expect.stringContaining("accent") });
  });
});

describe("logoVariants", () => {
  it("recolours an SVG: white for white, on-ink and on-accent, ink for ink, the original for default", () => {
    const { files, logos, notes } = logoVariants({ kind: "svg", text: SVG }, "#2B110B");
    expect(notes).toEqual([]);
    expect(Object.keys(logos).sort()).toEqual([
      "default",
      "ink",
      "mark",
      "mark-on-accent",
      "mark-on-ink",
      "on-accent",
      "on-ink",
      "white",
    ]);
    expect(logos.white).toBe("logo/white.svg");
    const text = (mode: string) => files.get(logos[mode])!.toString("utf8");
    expect(text("default")).toBe(SVG);
    expect(text("white")).toContain("#FFFFFF");
    expect(text("white")).not.toContain("#d63e22");
    expect(text("ink")).toContain("#2B110B");
    for (const mode of ["on-ink", "on-accent", "mark-on-ink", "mark-on-accent"]) expect(text(mode)).toBe(text("white"));
    expect(text("mark")).toBe(SVG);
  });

  it("fills the alpha of a transparent PNG with white and ink, and keeps the original as default", () => {
    const original = writePng(2, 1, Uint8Array.from([10, 20, 30, 0, 40, 50, 60, 255]));
    const { files, logos, notes } = logoVariants({ kind: "png", data: original }, "#2B110B");
    expect(notes).toEqual([]);
    expect(files.get(logos.default)).toEqual(original);
    for (const mode of ["white", "ink", "on-ink"])
      expect(Array.from(readPng(files.get(logos[mode])!)!.alpha!)).toEqual([0, 255]);
    expect(files.get(logos["mark-on-ink"])).toEqual(files.get(logos["on-ink"]));
    expect(logos.default).toBe("logo/default.png");
  });

  it("uses the original everywhere for a PNG without transparency, and for one that cannot be read, with a note", () => {
    const opaque = writePng(1, 1, Uint8Array.from([1, 2, 3, 255]));
    const a = logoVariants({ kind: "png", data: opaque }, "#2B110B");
    expect(a.notes[0]).toMatch(/transparen/);
    for (const mode of Object.keys(a.logos)) expect(a.files.get(a.logos[mode])).toEqual(opaque);
    const odd = Buffer.concat([opaque.subarray(0, 8), Buffer.from("not really a png")]);
    const b = logoVariants({ kind: "png", data: odd }, "#2B110B");
    expect(b.notes[0]).toMatch(/could not be read/);
    for (const mode of Object.keys(b.logos)) expect(b.files.get(b.logos[mode])).toEqual(odd);
  });
});

describe("buildProposal", () => {
  it("writes a proposal that passes the check, with the brand of the answer", async () => {
    const dir = project();
    await saveInputFile(dir, "logo", Buffer.from(SVG));
    const state = await build(dir);
    expect(state).toMatchObject({
      state: "ready",
      brand: { name: "Acme", url: "https://acme.example", version: "acme-2026-10-05-1", font: { family: "Acme Sans" } },
      extras: { tone: "Warm, direct and plain.", bannedWords: ["cheap"], hashtags: "#acme" },
    });
    expect(JSON.parse(read(dir, "brand.json").toString()).colors).toHaveLength(6);
    expect(read(dir, "logo", "white.svg").toString()).toContain("#FFFFFF");
  });

  it("uses Inter with the found font name when no font was uploaded, and says so", async () => {
    const dir = project();
    await saveInputFile(dir, "logo", Buffer.from(SVG));
    const state = await build(dir);
    if (state.state !== "ready") throw new Error("not ready");
    expect(state.brand.font).toEqual({ family: "Acme Sans", files: ["fonts/inter-latin.woff2"] });
    expect(existsSync(join(dir, "brand-input", "proposal", "fonts", "OFL.txt"))).toBe(true);
    expect(state.extras.notes.some((n) => n.includes("Acme Sans") && n.includes("Inter"))).toBe(true);
    // The answer without a font name is plain Inter, with no note about it.
    const plain = await buildProposal({
      projectDir: dir,
      slug: "acme",
      ai: { ...AI_PROPOSAL, fontFamily: "" },
      websiteRead: true,
      today: TODAY,
      currentVersion: null,
    });
    if (plain.state !== "ready") throw new Error("not ready");
    expect(plain.brand.font.family).toBe("Inter");
    expect(plain.extras.notes.some((n) => n.includes("Inter"))).toBe(false);
  });

  it("uses the uploaded fonts as the font of the kit", async () => {
    const dir = project();
    await saveInputFile(dir, "logo", Buffer.from(SVG));
    const saved = await saveInputFile(dir, "font", font("woff2"));
    const state = await build(dir);
    if (state.state !== "ready") throw new Error("not ready");
    expect(state.brand.font).toEqual({ family: "Acme Sans", files: [`fonts/${saved.name}`] });
    expect(existsSync(join(dir, "brand-input", "proposal", "fonts", saved.name))).toBe(true);
    expect(existsSync(join(dir, "brand-input", "proposal", "fonts", "inter-latin.woff2"))).toBe(false);
  });

  it("corrects a ground and reports it, and refuses a ground that cannot be corrected", async () => {
    const dir = project();
    await saveInputFile(dir, "logo", Buffer.from(SVG));
    const fixed = await build(dir, {
      ai: { ...AI_PROPOSAL, grounds: { ...AI_PROPOSAL.grounds, light: { background: "#FFF7F3", text: "#FFE0D0" } } },
    });
    if (fixed.state !== "ready") throw new Error("not ready");
    expect(fixed.brand.grounds.light.text).toBe("#2B110B");
    expect(fixed.extras.notes.some((n) => n.includes("light ground"))).toBe(true);
    await expect(
      build(dir, {
        ai: { ...AI_PROPOSAL, grounds: { ...AI_PROPOSAL.grounds, accent: { background: "#777777", text: "#888888" } } },
      }),
    ).rejects.toMatchObject({ status: 422, message: expect.stringContaining("accent") });
  });

  it("takes the website of the user before the one in the answer, and falls back with a note", async () => {
    const dir = project();
    await saveInputFile(dir, "logo", Buffer.from(SVG));
    await saveInputText(dir, { website: "https://real.example", notes: "" });
    const a = await build(dir);
    if (a.state !== "ready") throw new Error("not ready");
    expect(a.brand.url).toBe("https://real.example");
    const other = project();
    await saveInputFile(other, "logo", Buffer.from(SVG));
    const b = await build(other, { ai: { ...AI_PROPOSAL, url: "not a url" } });
    if (b.state !== "ready") throw new Error("not ready");
    expect(b.brand.url).toBe("https://example.com");
    expect(b.extras.notes.some((n) => n.includes("website"))).toBe(true);
  });

  it("notes that the website could not be read, only when there is one", async () => {
    const dir = project();
    await saveInputFile(dir, "logo", Buffer.from(SVG));
    const none = await build(dir, { websiteRead: false });
    if (none.state !== "ready") throw new Error("not ready");
    expect(none.extras.notes.some((n) => /could not be read/.test(n))).toBe(false);
    await saveInputText(dir, { website: "https://acme.example", notes: "" });
    const some = await build(dir, { websiteRead: false });
    if (some.state !== "ready") throw new Error("not ready");
    expect(some.extras.notes.some((n) => /website could not be read/.test(n))).toBe(true);
  });

  it("counts the version up from the current brand", async () => {
    const dir = project();
    await saveInputFile(dir, "logo", Buffer.from(SVG));
    const state = await build(dir, { currentVersion: "acme-2026-10-05-1" });
    if (state.state !== "ready") throw new Error("not ready");
    expect(state.brand.version).toBe("acme-2026-10-05-2");
  });

  it("replaces an earlier proposal completely", async () => {
    const dir = project();
    await saveInputFile(dir, "logo", Buffer.from(SVG));
    mkdirSync(join(dir, "brand-input", "proposal"), { recursive: true });
    writeFileSync(join(dir, "brand-input", "proposal", "stale.txt"), "old");
    await build(dir);
    expect(existsSync(join(dir, "brand-input", "proposal", "stale.txt"))).toBe(false);
  });

  it("asks for a logo when there is none", async () => {
    await expect(build(project())).rejects.toMatchObject({ status: 400, message: "Add a logo first" });
  });

  it("gives a usable proposal with a notice for an interlaced, 16-bit or opaque PNG logo", async () => {
    const cases: [string, Buffer, RegExp][] = [
      [
        "interlaced",
        pngWith({ width: 1, height: 1, colour: 6, depth: 8, interlace: 1, pixels: [9, 9, 9, 0] }),
        /could not be read/,
      ],
      ["16-bit", pngWith({ width: 1, height: 1, colour: 6, depth: 16, pixels: [0, 9, 0, 9, 0, 9, 128, 0] }), /^$/],
      ["opaque", pngWith({ width: 1, height: 1, colour: 2, depth: 8, pixels: [1, 2, 3] }), /transparen/],
      [
        "truncated",
        pngWith({ width: 1, height: 1, colour: 6, depth: 8, pixels: [1, 2, 3, 0] }).subarray(0, 40),
        /could not be read/,
      ],
    ];
    for (const [label, logo, notice] of cases) {
      const dir = project();
      // A truncated file is not accepted as an upload, so it is put in place directly.
      if (label === "truncated") {
        mkdirSync(join(dir, "brand-input"), { recursive: true });
        writeFileSync(join(dir, "brand-input", "logo.png"), logo);
      } else await saveInputFile(dir, "logo", logo);
      const state = await build(dir);
      if (state.state !== "ready") throw new Error(`${label}: not ready`);
      expect(state.brand.logos.white, label).toMatch(/^logo\/white\.png$/);
      if (label === "16-bit")
        expect(
          state.extras.notes.filter((n) => /logo/i.test(n)),
          label,
        ).toEqual([]);
      else
        expect(
          state.extras.notes.some((n) => notice.test(n)),
          label,
        ).toBe(true);
    }
  });

  it("does not interleave two builds for one project, and waits for the apply lock", async () => {
    const dir = project();
    await saveInputFile(dir, "logo", Buffer.from(SVG));
    // The key of applyProposal: while it holds the lock, nothing is written.
    let release!: () => void;
    const held = serialize(`brand-apply:${dir}`, () => new Promise<void>((resolve) => (release = resolve)));
    const waiting = build(dir);
    await new Promise((r) => setTimeout(r, 50));
    expect(existsSync(join(dir, "brand-input", "proposal"))).toBe(false);
    release();
    await held;
    await waiting;
    expect(existsSync(join(dir, "brand-input", "proposal", "brand.json"))).toBe(true);

    // Two overlapping builds: both succeed, and what is left belongs to the second one alone.
    const a = build(dir, { ai: { ...AI_PROPOSAL, name: "One", tone: "One tone" } });
    const b = build(dir, { ai: { ...AI_PROPOSAL, name: "Two", tone: "Two tone" } });
    const [ra, rb] = await Promise.all([a, b]);
    expect(ra).toMatchObject({ state: "ready", brand: { name: "One" } });
    expect(rb).toMatchObject({ state: "ready", brand: { name: "Two" } });
    expect(JSON.parse(read(dir, "brand.json").toString()).name).toBe("Two");
    expect(JSON.parse(read(dir, "extras.json").toString()).tone).toBe("Two tone");
  });
});
