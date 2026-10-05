// Route A: the call to Claude for a template, with a fake client (no request leaves the
// computer), and POST /api/template-generate: booking, the cap and the reserve, a refused answer,
// and the fixed sample without an API key.
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { BASE_CLASSES, guideText } from "../src/server/template-guide.js";
import { BRAND_MODEL } from "../src/server/ai/brand.js";
import {
  TEMPLATE_RESERVE_USD,
  generateTemplate,
  templateRequest,
  type TemplateMaterial,
} from "../src/server/ai/template.js";
import { AiError } from "../src/server/ai/provider.js";
import { costUsd, book } from "../src/server/ai/usage.js";
import { ALLOWED_VARIABLES, CSS_FUNCTIONS, TAGS } from "../src/web/studio/own-template.js";
import { brandFromDisk } from "./helpers/brand.js";
import { fakeClient, message } from "./helpers/brand-ai.js";
import { SVG, pngHeader, webpHeader } from "./helpers/brand-files.js";
import { answerOf, exampleTemplate, templateReply, carouselExample } from "./helpers/template.js";
import { startTemplates } from "./helpers/templates-api.js";

const brandJson = JSON.parse(readFileSync("src/web/brand/brand.json", "utf8"));
const material = (extra: Partial<TemplateMaterial> = {}): TemplateMaterial => ({
  kind: "image",
  formats: ["li-square", "story"],
  texts: ["We just shipped a new feature.", "Our team is growing."],
  brief: "Short statements with one bold phrase",
  brand: brandJson,
  profile: { description: "A planner for temp agencies", audience: "HR managers" },
  tone: "Warm and direct.",
  bannedWords: ["cheap"],
  images: [
    { mediaType: "image/png", data: Buffer.from("ONE") },
    { mediaType: "image/webp", data: Buffer.from("TWO") },
  ],
  logo: { kind: "svg", text: SVG },
  ...extra,
});

describe("templateRequest", () => {
  it("labels the screenshots as old posts, in order, and sends the texts and the brief", () => {
    const r = templateRequest(material(), BRAND_MODEL);
    const blocks = r.messages[0].content as Array<{
      type: string;
      text?: string;
      source?: { data: string; media_type: string };
    }>;
    expect(
      blocks
        .filter((b) => b.type === "text")
        .slice(0, 2)
        .map((b) => b.text),
    ).toEqual(["Old post 1:", "Old post 2:"]);
    expect(blocks.filter((b) => b.type === "image").map((b) => [b.source!.media_type, b.source!.data])).toEqual([
      ["image/png", Buffer.from("ONE").toString("base64")],
      ["image/webp", Buffer.from("TWO").toString("base64")],
    ]);
    const text = blocks.at(-1)!.text!;
    expect(text).toContain("We just shipped a new feature.");
    expect(text).toContain("Our team is growing.");
    expect(text).toContain("Short statements with one bold phrase");
    expect(text).toContain("LinkedIn square (1200x1200), Story");
    expect(text).toContain("single image");
    expect(text).toContain("A planner for temp agencies");
    expect(text).toContain("Warm and direct.");
    expect(text).toContain("cheap");
    expect(text).toContain(brandJson.name);
    expect(text).toContain("<svg xmlns=");
  });

  it("sends a PNG logo as an image block, says when there is no logo or no material, and asks for a carousel", () => {
    const png = templateRequest(material({ logo: { kind: "png", data: Buffer.from("LOGO") } }), BRAND_MODEL);
    const blocks = png.messages[0].content as Array<{ type: string; text?: string }>;
    expect(blocks.some((b) => b.text === "The logo of the brand (PNG):")).toBe(true);
    expect(blocks.filter((b) => b.type === "image")).toHaveLength(3);
    const none = JSON.stringify(
      templateRequest(
        material({ logo: null, images: [], texts: [], brief: "", profile: null, tone: "", bannedWords: [] }),
        BRAND_MODEL,
      ).messages,
    );
    expect(none).toContain("No texts of old posts were given.");
    expect(none).toContain("There is no brief.");
    expect(none).toContain("the company profile is empty");
    expect(
      JSON.stringify(templateRequest(material({ kind: "carousel", formats: ["li-carousel"] }), BRAND_MODEL).messages),
    ).toContain("carousel (a document post of several slides)");
  });

  it("asks for adaptive thinking, medium effort, structured output, 24,000 tokens, and no tools", () => {
    const r = templateRequest(material(), BRAND_MODEL) as unknown as Record<string, any>;
    expect(r.model).toBe("claude-opus-5-5");
    expect(r.thinking).toEqual({ type: "adaptive" });
    expect(r.output_config.effort).toBe("medium");
    expect(r.output_config.format.type).toBe("json_schema");
    expect(r.max_tokens).toBe(24_000);
    expect("tools" in r).toBe(false);
    expect("betas" in r).toBe(false);
  });

  it("lists every allowed tag, variable and function, the base classes and the worked example", () => {
    const text = guideText({ ...material(), brand: brandFromDisk() as any });
    for (const t of TAGS) expect(text).toContain(`\`${t}\``);
    for (const v of ALLOWED_VARIABLES) expect(text).toContain(`\`${v}\``);
    for (const f of CSS_FUNCTIONS) expect(text).toContain(`\`${f}\``);
    for (const [name] of BASE_CLASSES) expect(text).toContain(`\`${name}\``);
    expect(text).toContain(JSON.stringify(exampleTemplate().fields[1].label));
  });

  it("only names base classes that the base CSS has (the engine itself makes .media)", () => {
    const css = readFileSync("src/web/studio/template-css.js", "utf8");
    for (const [name] of BASE_CLASSES.filter(([n]) => n !== ".media")) expect(css, name).toContain(name);
  });

  it("stays under the reserve of $1 even for the most it can send and receive", () => {
    // Six screenshots (about 1,600 tokens each), an SVG logo of 100,000 characters (about 35,000
    // tokens), 8,000 characters of texts, and a prompt of about 10,000 tokens, plus the full 24,000 out.
    expect(costUsd(BRAND_MODEL, { input: 70_000, output: 24_000, cacheRead: 0, cacheWrite: 0 })).toBeLessThan(
      TEMPLATE_RESERVE_USD,
    );
  });
});

describe("generateTemplate", () => {
  it("returns the checked proposal, the notes and the usage of one call", async () => {
    const { client, calls } = fakeClient([templateReply()]);
    const r = await generateTemplate(client, BRAND_MODEL, material());
    // The formats are the user's choice, not the model's.
    expect(r.proposal).toEqual({ ...exampleTemplate(), formats: ["li-square", "story"] });
    expect(r.notes).toEqual(["Based on the statements."]);
    expect(r.usage).toEqual({ input: 100_000, output: 10_000, cacheRead: 0, cacheWrite: 0 });
    expect(r.model).toBe("claude-opus-5-5");
    expect(calls).toHaveLength(1);
  });

  it("builds a carousel from a carousel answer, with the formats of the user", async () => {
    const { client } = fakeClient([templateReply(carouselExample())]);
    const r = await generateTemplate(client, BRAND_MODEL, material({ kind: "carousel", formats: ["li-carousel"] }));
    expect(r.proposal).toMatchObject({ kind: "carousel", formats: ["li-carousel"] });
  });

  async function refused(reply: ReturnType<typeof message> | Error, m = material()) {
    const { client, calls } = fakeClient([reply]);
    const error = await generateTemplate(client, BRAND_MODEL, m).then(
      () => null,
      (e) => e,
    );
    expect(error).toBeInstanceOf(AiError);
    expect(calls).toHaveLength(1); // no automatic retry
    return error as AiError;
  }

  it.each<[string, () => ReturnType<typeof message>, RegExp]>([
    ["a refusal", () => message({ stop: "refusal" }), /declined/],
    ["an answer that was cut off", () => message({ stop: "max_tokens" }), /cut off/],
    ["text that is not JSON", () => message({ text: "Here is your template!" }), /valid JSON/],
    [
      "a missing key",
      () => message({ text: JSON.stringify({ template: { name: "x" }, notes: [] }) }),
      /does not fit the schema/,
    ],
    [
      "an extra key in a node",
      () => {
        const a = answerOf(exampleTemplate());
        a.template.tree[2].onclick = "x()";
        return message({ text: JSON.stringify(a) });
      },
      /does not fit the schema/,
    ],
    [
      "css that is not allowed",
      () => templateReply({ ...exampleTemplate(), css: ".a { background: url(x); }" }),
      /refused \(1 problem\): css rule 1 \(\.a\) \(background\): url\(\) is not allowed/,
    ],
    [
      "a reference to a field that does not exist",
      () => {
        const t = exampleTemplate();
        t.tree[2].children[0].dataField = "nope";
        return templateReply(t);
      },
      /dataField: "nope" is not a field/,
    ],
  ])("refuses %s, and carries the tokens it cost", async (_name, reply, expected) => {
    const e = await refused(reply());
    expect(e.message).toMatch(expected);
    expect(e.usage).toEqual({ input: 100_000, output: 10_000, cacheRead: 0, cacheWrite: 0 });
    expect(e.usage).toEqual({ input: 100_000, output: 10_000, cacheRead: 0, cacheWrite: 0 });
  });

  it("does not repair: a headline without emphasis is a refusal, not a fix", async () => {
    const t = exampleTemplate();
    t.fields[1].defaultValue = "No emphasis here";
    expect((await refused(templateReply(t))).message).toMatch(/exactly one \*emphasised\* phrase/);
  });

  it("passes on a failure of the connection without usage", async () => {
    const e = await refused(new Error("socket hang up"));
    expect(e.message).toBe("socket hang up");
    expect(e.usage).toBeUndefined();
  });
});

const studios: Array<{ close: () => Promise<void> }> = [];
afterEach(async () => {
  while (studios.length) await studios.pop()!.close();
});
async function start(options: Parameters<typeof startTemplates>[0] = {}) {
  const s = await startTemplates(options);
  studios.push(s);
  return s;
}
const input = { texts: "A post\n---\nAnother post", brief: "Quotes", kind: "image", formats: ["li-square"] };
const proposalFile = (dir: string) => join(dir, "template-input", "proposal", "template.json");

describe("POST /api/template-generate", () => {
  it("needs some material, before anything else", async () => {
    const withKey = await start({ replies: [templateReply()] });
    const r = await withKey.call("/api/template-generate", "POST", {});
    expect(r).toMatchObject({
      status: 400,
      body: { error: "Add a screenshot, the text of an old post or a short brief first" },
    });
    expect(withKey.calls).toHaveLength(0);
    const noKey = await start({ withClient: false });
    expect((await noKey.call("/api/template-generate", "POST", {})).status).toBe(400);
  });

  it("makes a proposal, books $0.60 under template:<project>, and shows what was sent", async () => {
    const { call, upload, calls, usage, projectDir } = await start({ replies: [templateReply()] });
    await upload(webpHeader(3, 3));
    await call("/api/template-input", "PUT", input);
    const r = await call("/api/template-generate", "POST", {});
    expect(r.status).toBe(200);
    expect(r.body).toMatchObject({
      state: "ready",
      sample: false,
      notes: ["Based on the statements."],
      template: { name: "Statement", kind: "image" },
    });
    expect(JSON.parse(readFileSync(proposalFile(projectDir), "utf8"))).toEqual({
      ...exampleTemplate(),
      formats: ["li-square"],
    });
    const sent = JSON.stringify(calls[0].messages);
    expect(sent).toContain("Old post 1:");
    expect(sent).toContain("Quotes");
    expect(sent).toContain("Another post");
    expect(usage()).toMatchObject([{ task: "template:postwright", model: "claude-opus-5-5", usd: 0.6, ok: true }]);
    // Nothing is applied until the user says so.
    expect((await call("/api/templates")).body.templates).toEqual([]);
  });

  it("replaces a pending proposal with the new one", async () => {
    const second = { ...exampleTemplate(), name: "Second" };
    const { call, upload } = await start({ replies: [templateReply(), templateReply(second)] });
    await upload(pngHeader(4, 4));
    await call("/api/template-generate", "POST", {});
    const r = await call("/api/template-generate", "POST", {});
    expect(r.body.template.name).toBe("Second");
  });

  it("books a refused answer with its tokens, answers 502 with the reason, and keeps the pending proposal", async () => {
    const bad = templateReply({ ...exampleTemplate(), css: ".a { color: red; }" });
    const { call, usage, projectDir } = await start({ replies: [templateReply(), bad] });
    await call("/api/template-input", "PUT", input);
    await call("/api/template-generate", "POST", {});
    const r = await call("/api/template-generate", "POST", {});
    expect(r.status).toBe(502);
    expect(r.body.error).toMatch(
      /Template generation did not give a usable answer: The template was refused.*colour "red"/,
    );
    expect(usage()).toMatchObject([
      { ok: true, usd: 0.6 },
      { ok: false, usd: 0.6, task: "template:postwright" },
    ]);
    expect(JSON.parse(readFileSync(proposalFile(projectDir), "utf8")).name).toBe("Statement");
  });

  it("books a failure of the connection at zero, and a refusal of the model with its tokens", async () => {
    const { call, usage } = await start({ replies: [new Error("socket hang up"), message({ stop: "refusal" })] });
    await call("/api/template-input", "PUT", input);
    expect((await call("/api/template-generate", "POST", {})).status).toBe(502);
    expect((await call("/api/template-generate", "POST", {})).body.error).toMatch(/declined/);
    expect(usage().map((l) => [l.ok, l.usd])).toEqual([
      [false, 0],
      [false, 0.6],
    ]);
  });

  it("refuses without a call when the reserve of $1 does not fit under the cap, also with room left in the month", async () => {
    const { call, calls, dataDir } = await start({ replies: [templateReply()] });
    await call("/api/template-input", "PUT", input);
    const settings = (await call("/api/settings")).body;
    const cap = (usd: number) =>
      call("/api/settings", "PUT", { ...settings, writingHelp: { ...settings.writingHelp, capUsdPerMonth: usd } });
    await cap(1);
    const r = await call("/api/template-generate", "POST", {});
    expect(r.status).toBe(429);
    expect(r.body.error).toMatch(/up to \$1;/);
    await cap(10);
    await book(dataDir, { timestamp: new Date().toISOString(), model: "m", task: "x", usd: 9.5, ok: true });
    expect((await call("/api/template-generate", "POST", {})).status).toBe(429);
    expect(calls).toHaveLength(0);
  });

  it("runs one call at a time", async () => {
    let running = 0;
    let peak = 0;
    const slow = {
      stream: () => ({
        finalMessage: async () => {
          peak = Math.max(peak, ++running);
          await new Promise((ok) => setTimeout(ok, 40));
          running--;
          return templateReply();
        },
      }),
    };
    const { call } = await start({ client: slow });
    await call("/api/template-input", "PUT", input);
    const both = await Promise.all([
      call("/api/template-generate", "POST", {}),
      call("/api/template-generate", "POST", {}),
    ]);
    expect(both.map((r) => r.status)).toEqual([200, 200]);
    expect(peak).toBe(1);
  });

  it("keeps the proposal of one project out of another", async () => {
    const { call } = await start({ replies: [templateReply()] });
    await call("/api/projects", "POST", { name: "Beta" });
    await call("/api/template-input", "PUT", input);
    await call("/api/template-generate", "POST", {});
    // The route for reading proposals is added with the proposal routes; here the files tell.
    expect((await call("/api/template-input", "GET", undefined, "beta")).body.texts).toBe("");
  });
});

describe("without an API key", () => {
  it("returns the fixed sample template, marked as made without a model, and books nothing", async () => {
    const { call, dataDir, projectDir } = await start({ withClient: false });
    await call("/api/template-input", "PUT", { ...input, formats: ["story", "li-square"] });
    const r = await call("/api/template-generate", "POST", {});
    expect(r.status).toBe(200);
    expect(r.body).toMatchObject({
      state: "ready",
      sample: true,
      template: { name: "Sample template", kind: "image", formats: ["story", "li-square"] },
    });
    expect(r.body.notes[0]).toMatch(/Made without a model/);
    expect(existsSync(join(dataDir, "ai-usage.jsonl"))).toBe(false);
    expect(existsSync(proposalFile(projectDir))).toBe(true);
  });

  it("makes a sample carousel when a carousel is asked for", async () => {
    const { call } = await start({ withClient: false });
    await call("/api/template-input", "PUT", { ...input, kind: "carousel", formats: ["li-carousel"] });
    const r = await call("/api/template-generate", "POST", {});
    expect(r.body.template).toMatchObject({ kind: "carousel", formats: ["li-carousel"], name: "Sample template" });
    expect(r.body.template.slides.map((s: any) => s.kind)).toEqual(["cover", "content", "closing"]);
  });
});
