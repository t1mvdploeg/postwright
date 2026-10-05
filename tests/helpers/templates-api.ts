// A studio with the template routes, a fake model client and small helpers to call them.
import { readFileSync } from "node:fs";
import { join } from "node:path";
import type { BrandClient } from "../../src/server/ai/brand.js";
import type { AiProvider } from "../../src/server/ai/provider.js";
import { fakeClient } from "./brand-ai.js";
import { startStudio } from "./studio.js";

export async function startTemplates(
  options: {
    replies?: Parameters<typeof fakeClient>[0];
    withClient?: boolean;
    client?: BrandClient;
    provider?: AiProvider;
  } = {},
) {
  const fake = fakeClient(options.replies ?? []);
  const withClient = options.withClient ?? true;
  const s = await startStudio({
    provider: options.provider,
    brand: options.client
      ? { client: options.client, model: "claude-opus-5-5" }
      : withClient
        ? { client: fake.client, model: "claude-opus-5-5" }
        : null,
  });
  const call = async (path: string, method = "GET", body?: unknown, project?: string) => {
    const headers: Record<string, string> = project ? { "x-postwright-project": project } : {};
    if (body !== undefined) headers["content-type"] = "application/json";
    const r = await fetch(s.base + path, {
      method,
      headers,
      body: body === undefined ? undefined : JSON.stringify(body),
    });
    const text = await r.text();
    let parsed: any = null;
    try {
      parsed = text ? JSON.parse(text) : null;
    } catch {
      parsed = text;
    }
    return { status: r.status, body: parsed, headers: r.headers };
  };
  const upload = (body: Buffer | string, project?: string) =>
    fetch(`${s.base}/api/template-input/image`, {
      method: "POST",
      headers: { "content-type": "application/octet-stream", ...(project ? { "x-postwright-project": project } : {}) },
      body: typeof body === "string" ? body : new Uint8Array(body),
    });
  const usage = () =>
    readFileSync(join(s.dataDir, "ai-usage.jsonl"), "utf8")
      .trim()
      .split("\n")
      .map((l) => JSON.parse(l));
  return { ...s, ...fake, call, upload, usage };
}
