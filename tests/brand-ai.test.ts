// The call to Claude for a brand kit, with a fake client: no request leaves the computer.
import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { BRAND_MODEL, brandRequest, generateBrand, type BrandMaterial } from "../src/server/ai/brand.js";
import { chooseBrandClient } from "../src/server/ai/choose.js";
import { AiError } from "../src/server/ai/provider.js";
import { AI_PROPOSAL, answer, fakeClient, fetchFailed, fetchedPage, message } from "./helpers/brand-ai.js";
import { SVG } from "./helpers/brand-files.js";

const example = readFileSync("src/web/brand/brand.json", "utf8");
const material = (extra: Partial<BrandMaterial> = {}): BrandMaterial => ({
  logo: { kind: "svg", text: SVG },
  images: [],
  guide: null,
  website: "",
  notes: "",
  ...extra,
});

describe("brandRequest", () => {
  it("sends an SVG logo as text and a PNG logo as an image block", () => {
    const svg = JSON.stringify(brandRequest(material(), BRAND_MODEL, example).messages);
    expect(svg).toContain("<svg xmlns=");
    expect(svg).not.toContain('"type":"image"');
    const png = brandRequest(material({ logo: { kind: "png", data: Buffer.from("PNGDATA") } }), BRAND_MODEL, example);
    const blocks = png.messages[0].content as Array<{ type: string; source?: { media_type: string; data: string } }>;
    const image = blocks.find((b) => b.type === "image")!;
    expect(image.source).toEqual({
      type: "base64",
      media_type: "image/png",
      data: Buffer.from("PNGDATA").toString("base64"),
    });
  });

  it("replaces base64 payloads in an SVG logo with a placeholder, so one logo cannot cost more than the reserve", () => {
    const payload = "A".repeat(200_000);
    const svg = `<svg xmlns="http://www.w3.org/2000/svg"><image href="data:image/png;base64,${payload}"/><image href='data:image/jpeg;base64,${payload}=='/><path d="M0 0h1v1z"/></svg>`;
    const sent = JSON.stringify(
      brandRequest(material({ logo: { kind: "svg", text: svg } }), BRAND_MODEL, example).messages,
    );
    expect(sent).not.toContain("AAAAAAAAAA");
    expect(sent).toContain("data:image/png;base64,[removed]");
    expect(sent).toContain("data:image/jpeg;base64,[removed]");
    expect(sent).toContain('<path d=\\"M0 0h1v1z\\"/>');
    expect(sent.length).toBeLessThan(20_000);
  });

  it("sends images as image blocks and the guide as a PDF document block", () => {
    const r = brandRequest(
      material({
        images: [
          { mediaType: "image/jpeg", data: Buffer.from("J") },
          { mediaType: "image/webp", data: Buffer.from("W") },
        ],
        guide: Buffer.from("%PDF-1.4"),
      }),
      BRAND_MODEL,
      example,
    );
    const blocks = r.messages[0].content as Array<{ type: string; source?: { media_type: string } }>;
    expect(blocks.filter((b) => b.type === "image").map((b) => b.source!.media_type)).toEqual([
      "image/jpeg",
      "image/webp",
    ]);
    const doc = blocks.find((b) => b.type === "document")!;
    expect(doc.source).toEqual({
      type: "base64",
      media_type: "application/pdf",
      data: Buffer.from("%PDF-1.4").toString("base64"),
    });
  });

  it("offers the web fetch tool only with a website, and names the address in the text", () => {
    const without = brandRequest(material(), BRAND_MODEL, example);
    expect("tools" in without).toBe(false);
    const withSite = brandRequest(
      material({ website: "https://acme.example", notes: "tone: warm" }),
      BRAND_MODEL,
      example,
    );
    expect(withSite.tools).toEqual([{ type: "web_fetch_20260209", name: "web_fetch", max_uses: 3 }]);
    const text = JSON.stringify(withSite.messages);
    expect(text).toContain("https://acme.example");
    expect(text).toContain("tone: warm");
  });

  it("asks for adaptive thinking, high effort, structured output, a fallback, caching, and no citations", () => {
    const r = brandRequest(material(), BRAND_MODEL, example) as unknown as Record<string, any>;
    expect(r.model).toBe("claude-opus-5-5");
    expect(r.thinking).toEqual({ type: "adaptive" });
    expect(r.output_config.effort).toBe("high");
    expect(r.output_config.format.type).toBe("json_schema");
    expect(r.fallbacks).toBe("default");
    expect(r.betas).toContain("server-side-fallback-2026-07-01");
    expect(r.max_tokens).toBeGreaterThanOrEqual(16_000);
    // Top-level caching, so that a continuation after a paused turn reads the input from the cache.
    expect(r.cache_control).toEqual({ type: "ephemeral" });
    expect(JSON.stringify(r.messages)).not.toContain("citations");
  });

  it("sends the cache setting on every request of a paused turn", async () => {
    const paused = message({ stop: "pause_turn" });
    const { client, calls } = fakeClient([paused, answer()]);
    await generateBrand(client, BRAND_MODEL, material(), example);
    expect(calls.map((c) => (c as unknown as Record<string, unknown>).cache_control)).toEqual([
      { type: "ephemeral" },
      { type: "ephemeral" },
    ]);
  });

  it("shows the model the brand of Postwright as the example", () => {
    expect(JSON.stringify(brandRequest(material(), BRAND_MODEL, example))).toContain("Postwright");
  });
});

describe("generateBrand", () => {
  it("turns a valid answer into a proposal and reports model and usage", async () => {
    const { client, calls } = fakeClient([answer()]);
    const r = await generateBrand(client, BRAND_MODEL, material(), example);
    expect(r.proposal).toEqual(AI_PROPOSAL);
    expect(r.model).toBe("claude-opus-5-5");
    expect(r.usage).toEqual({ input: 100_000, output: 10_000, cacheRead: 0, cacheWrite: 0 });
    expect(r.websiteRead).toBe(false);
    expect(calls).toHaveLength(1);
  });

  it("continues a paused turn without a new user message and adds up the usage", async () => {
    const paused = message({
      stop: "pause_turn",
      blocks: [
        { type: "server_tool_use", id: "t1", name: "web_fetch", input: { url: "https://acme.example" } },
        fetchedPage,
      ],
    });
    const { client, calls } = fakeClient([paused, paused, answer()]);
    const r = await generateBrand(client, BRAND_MODEL, material({ website: "https://acme.example" }), example);
    expect(calls).toHaveLength(3);
    expect(calls[1].messages).toHaveLength(2);
    expect(calls[1].messages[1]).toMatchObject({ role: "assistant", content: paused.content });
    expect(calls[2].messages).toHaveLength(3);
    expect(r.usage.input).toBe(300_000);
    expect(r.usage.output).toBe(30_000);
    expect(r.websiteRead).toBe(true);
  });

  it("gives up after three continuations with the cost of all turns", async () => {
    const paused = message({ stop: "pause_turn" });
    const { client, calls } = fakeClient([paused, paused, paused, paused, answer()]);
    const error = await generateBrand(client, BRAND_MODEL, material(), example).catch((e) => e);
    expect(error).toBeInstanceOf(AiError);
    expect(error.message).toMatch(/did not finish/);
    expect(error.usage.input).toBe(400_000);
    expect(calls).toHaveLength(4);
  });

  it("knows whether the website was read", async () => {
    const failed = fakeClient([message({ blocks: [fetchFailed], text: JSON.stringify(AI_PROPOSAL) })]);
    expect(
      (await generateBrand(failed.client, BRAND_MODEL, material({ website: "https://acme.example" }), example))
        .websiteRead,
    ).toBe(false);
    const read = fakeClient([message({ blocks: [fetchedPage], text: JSON.stringify(AI_PROPOSAL) })]);
    expect(
      (await generateBrand(read.client, BRAND_MODEL, material({ website: "https://acme.example" }), example))
        .websiteRead,
    ).toBe(true);
  });

  it("makes a refusal and a cut-off answer readable errors that keep the usage", async () => {
    const refused = await generateBrand(
      fakeClient([message({ stop: "refusal" })]).client,
      BRAND_MODEL,
      material(),
      example,
    ).catch((e) => e);
    expect(refused).toBeInstanceOf(AiError);
    expect(refused.message).toMatch(/declined/);
    expect(refused.usage.input).toBe(100_000);
    const cut = await generateBrand(
      fakeClient([message({ stop: "max_tokens", text: "{" })]).client,
      BRAND_MODEL,
      material(),
      example,
    ).catch((e) => e);
    expect(cut.message).toMatch(/cut off/);
  });

  it("names the field of an answer that does not fit, and refuses text that is not JSON", async () => {
    const bad = { ...AI_PROPOSAL, colors: AI_PROPOSAL.colors.map((c, i) => (i === 0 ? { ...c, hex: "red" } : c)) };
    const schema = await generateBrand(fakeClient([answer(bad)]).client, BRAND_MODEL, material(), example).catch(
      (e) => e,
    );
    expect(schema.message).toContain("colors.0.hex");
    expect(schema.usage.input).toBe(100_000);
    const text = await generateBrand(
      fakeClient([message({ text: "Sure, here is your brand kit!" })]).client,
      BRAND_MODEL,
      material(),
      example,
    ).catch((e) => e);
    expect(text.message).toMatch(/valid JSON/);
  });

  it("wraps an API or network error as an AiError", async () => {
    const error = await generateBrand(
      fakeClient([new Error("connection reset")]).client,
      BRAND_MODEL,
      material(),
      example,
    ).catch((e) => e);
    expect(error).toBeInstanceOf(AiError);
    expect(error.message).toBe("connection reset");
  });
});

describe("chooseBrandClient", () => {
  it("is null without a key and has the default model with one", () => {
    expect(chooseBrandClient({})).toBeNull();
    expect(chooseBrandClient({ ANTHROPIC_API_KEY: "  " })).toBeNull();
    expect(chooseBrandClient({ ANTHROPIC_API_KEY: "sk-test-123" })?.model).toBe("claude-opus-5-5");
    expect(
      chooseBrandClient({ ANTHROPIC_API_KEY: "sk-test-123", POSTWRIGHT_BRAND_MODEL: "claude-fable-5-1" })?.model,
    ).toBe("claude-fable-5-1");
  });
});
