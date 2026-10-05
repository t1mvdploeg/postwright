// The studio routes under /api: recipes with version checking, status transitions that use
// the brand check as a gate, and uploads that only admit real PNG/JPEG/WebP.
import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { createPost } from "../src/server/store.js";
import { DEFAULT_SETTINGS } from "../src/server/schema.js";
import { startStudio } from "./helpers/studio.js";
import type { Post } from "../src/server/schema.js";

let base = "";
let dataDir = "";
let close: () => Promise<void>;

const API = "/api";

async function ask(
  path: string,
  options: { method?: string; body?: unknown; headers?: Record<string, string>; raw?: Buffer } = {},
) {
  const headers: Record<string, string> = { ...(options.headers ?? {}) };
  let body: BodyInit | undefined;
  if (options.raw) body = new Uint8Array(options.raw);
  else if (options.body !== undefined) {
    headers["content-type"] = "application/json";
    body = JSON.stringify(options.body);
  }
  const r = await fetch(base + path, { method: options.method ?? (body ? "POST" : "GET"), headers, body });
  const text = await r.text();
  let data: any = null;
  try {
    data = text ? JSON.parse(text) : null;
  } catch {
    data = text;
  }
  return { status: r.status, body: data, headers: r.headers };
}

const now = () => new Date().toISOString();
const GREEN = () => ({ errors: 0, attention: 0, on: now() });

function recipe(extra: Record<string, unknown> = {}) {
  return {
    title: "Statement: your turn now",
    kind: "image",
    template: "statement",
    formats: ["li-square", "li-portrait"],
    content: {
      ground: "accent",
      headline: "Seen enough. *Your turn has come.*",
      text: "A short text under the headline.",
    },
    brandVersion: "test-1.0",
    check: GREEN(),
    ...extra,
  };
}

async function newPost(extra: Record<string, unknown> = {}): Promise<Post> {
  const r = await ask(`${API}/posts`, { body: recipe(extra) });
  expect(r.status).toBe(201);
  return r.body;
}

beforeAll(async () => {
  ({ dataDir, base, close } = await startStudio());
});

afterAll(async () => {
  await close();
});

describe("posts", () => {
  it("creates a draft with version 1 and a history line, in the root folder", async () => {
    const p = await newPost();
    expect(p.id).toMatch(/^p-[0-9a-f-]{36}$/);
    expect(p).toMatchObject({ version: 1, status: "draft", scheduled: null, published: null });
    expect(p.history).toHaveLength(1);
    expect(existsSync(join(dataDir, "marketing", "posts", `${p.id}.json`))).toBe(true);
  });

  it("reads, lists without history and filters by status", async () => {
    const p = await newPost({ title: "For the list" });
    expect((await ask(`${API}/posts/${p.id}`)).body.title).toBe("For the list");
    const list = await ask(`${API}/posts?status=draft`);
    const line = list.body.posts.find((x: Post) => x.id === p.id);
    expect(line.title).toBe("For the list");
    expect(line.history).toBeUndefined();
    expect((await ask(`${API}/posts?status=published`)).body.posts.some((x: Post) => x.id === p.id)).toBe(false);
  });

  it("saves with the expected version and refuses an outdated version with 409", async () => {
    const p = await newPost();
    const r1 = await ask(`${API}/posts/${p.id}`, {
      method: "PUT",
      body: { ...recipe({ title: "First change" }), version: 1 },
    });
    expect(r1.status).toBe(200);
    expect(r1.body.version).toBe(2);
    const r2 = await ask(`${API}/posts/${p.id}`, {
      method: "PUT",
      body: { ...recipe({ title: "Old window" }), version: 1 },
    });
    expect(r2.status).toBe(409);
    expect(r2.body.error).toMatch(/another window/);
    expect((await ask(`${API}/posts/${p.id}`)).body.title).toBe("First change");
  });

  it("clears the check when the content changes without a new check, and keeps it on a new title only", async () => {
    const p = await newPost();
    const { check: _c, ...withoutCheck } = recipe();
    const title = await ask(`${API}/posts/${p.id}`, {
      method: "PUT",
      body: { ...withoutCheck, title: "Other title", version: 1 },
    });
    expect(title.body.check).not.toBeNull();
    const content = await ask(`${API}/posts/${p.id}`, {
      method: "PUT",
      body: { ...withoutCheck, content: { headline: "New *headline*" }, version: 2 },
    });
    expect(content.body.check).toBeNull();
  });

  it("refuses unknown formats, an http link, unknown fields and a campaign that does not exist", async () => {
    expect((await ask(`${API}/posts`, { body: recipe({ formats: ["poster-a0"] }) })).status).toBe(400);
    expect((await ask(`${API}/posts`, { body: recipe({ formats: ["li-square", "li-square"] }) })).status).toBe(400);
    expect((await ask(`${API}/posts`, { body: recipe({ link: "javascript:alert(1)" }) })).status).toBe(400);
    expect((await ask(`${API}/posts`, { body: recipe({ link: "http://example.com" }) })).status).toBe(400);
    expect((await ask(`${API}/posts`, { body: recipe({ secret: "x" }) })).status).toBe(400);
    expect((await ask(`${API}/posts`, { body: recipe({ content: { headline: "x".repeat(2001) } }) })).status).toBe(400);
    const r = await ask(`${API}/posts`, { body: recipe({ campaign: "c-00000000-0000-4000-8000-000000000000" }) });
    expect(r.status).toBe(400);
    expect(r.body.error).toMatch(/campaign/);
  });

  it("refuses an invalid id with 400 and an unknown id with 404", async () => {
    expect((await ask(`${API}/posts/..%2F..%2Fcompanies`)).status).toBe(400);
    expect((await ask(`${API}/posts/p-00000000-0000-4000-8000-000000000000`)).status).toBe(404);
  });

  it("duplicates as a new draft and deletes", async () => {
    const p = await newPost({ title: "Original" });
    const copy = await ask(`${API}/posts/${p.id}/duplicate`, { body: {} });
    expect(copy.status).toBe(201);
    expect(copy.body).toMatchObject({ title: "Copy of Original", status: "draft", version: 1 });
    expect(copy.body.id).not.toBe(p.id);
    expect((await ask(`${API}/posts/${copy.body.id}`, { method: "DELETE" })).status).toBe(200);
    expect((await ask(`${API}/posts/${copy.body.id}`)).status).toBe(404);
  });
});

describe("utm_content points to the post itself", () => {
  it("puts the post's own id in every studio link on create, save and duplicate", async () => {
    const link = "https://example.com/?utm_source=linkedin&utm_medium=social";
    const p = await newPost({ caption: { linkedin: `Read more at ${link}.` } });
    expect(p.caption.linkedin).toBe(`Read more at ${link}&utm_content=${p.id}.`);
    const copy = (await ask(`${API}/posts/${p.id}/duplicate`, { body: {} })).body;
    expect(copy.caption.linkedin).toContain(`utm_content=${copy.id}`);
    expect(copy.caption.linkedin).not.toContain(p.id);
    const r = await ask(`${API}/posts/${p.id}`, {
      method: "PUT",
      body: { ...recipe({ caption: { linkedin: `${link}&utm_content=p-wrong` } }), version: p.version },
    });
    expect(r.status).toBe(200);
    expect(r.body.caption.linkedin).toBe(`${link}&utm_content=${p.id}`);
  });
});

describe("status-transitions", () => {
  const FUTURE = "2099-06-01T09:30:00+02:00";

  it("schedules only with a check without errors and a moment in the future", async () => {
    const without = await newPost({ check: null });
    const r0 = await ask(`${API}/posts/${without.id}/status`, { body: { target: "scheduled", scheduled: FUTURE } });
    expect(r0.status).toBe(409);
    expect(r0.body.error).toMatch(/brand check/);

    const error = await newPost({ check: { errors: 2, attention: 0, on: now() } });
    const r1 = await ask(`${API}/posts/${error.id}/status`, { body: { target: "scheduled", scheduled: FUTURE } });
    expect(r1.status).toBe(409);
    expect(r1.body.error).toMatch(/2 errors/);

    const p = await newPost();
    expect((await ask(`${API}/posts/${p.id}/status`, { body: { target: "scheduled" } })).status).toBe(400);
    expect(
      (
        await ask(`${API}/posts/${p.id}/status`, {
          body: { target: "scheduled", scheduled: "2020-01-01T09:00:00+01:00" },
        })
      ).status,
    ).toBe(400);
    const ok = await ask(`${API}/posts/${p.id}/status`, { body: { target: "scheduled", scheduled: FUTURE } });
    expect(ok.status).toBe(200);
    expect(ok.body).toMatchObject({ status: "scheduled", scheduled: FUTURE });
    // Rescheduling is allowed: scheduled → scheduled with a new date.
    const reschedule = await ask(`${API}/posts/${p.id}/status`, {
      body: { target: "scheduled", scheduled: "2099-06-02T09:30:00+02:00" },
    });
    expect(reschedule.body.scheduled).toBe("2099-06-02T09:30:00+02:00");
    expect(reschedule.body.history.at(-1).what).toMatch(/rescheduled/);
  });

  it("refuses scheduling and publishing if a linked fact is withdrawn, expired or deleted in the meantime", async () => {
    const f = await ask(`${API}/facts`, {
      body: {
        text: "Postwright exports PNG, PDF and ZIP",
        kind: "product",
        source: { kind: "site", reference: "README.md" },
        status: "active",
      },
    });
    const p = await newPost({ facts: [f.body.id] });
    const { id: _i, created: _a, updated: _g, ...rest } = f.body;
    await ask(`${API}/facts/${f.body.id}`, { method: "PUT", body: { ...rest, status: "withdrawn" } });
    const r = await ask(`${API}/posts/${p.id}/status`, { body: { target: "scheduled", scheduled: FUTURE } });
    expect(r.status).toBe(409);
    expect(r.body.error).toMatch(/fact/);
    expect((await ask(`${API}/posts/${p.id}/status`, { body: { target: "published" } })).status).toBe(409);
    await ask(`${API}/facts/${f.body.id}`, {
      method: "PUT",
      body: { ...rest, status: "active", validUntil: "2020-01-01", validFrom: null },
    });
    expect(
      (await ask(`${API}/posts/${p.id}/status`, { body: { target: "scheduled", scheduled: FUTURE } })).status,
    ).toBe(409);
    await ask(`${API}/facts/${f.body.id}`, { method: "PUT", body: { ...rest, status: "active", validUntil: null } });
    expect(
      (await ask(`${API}/posts/${p.id}/status`, { body: { target: "scheduled", scheduled: FUTURE } })).status,
    ).toBe(200);
    // Back to draft and archiving are always possible.
    await ask(`${API}/facts/${f.body.id}`, { method: "PUT", body: { ...rest, status: "withdrawn" } });
    expect((await ask(`${API}/posts/${p.id}/status`, { body: { target: "draft" } })).status).toBe(200);
  });

  it("puts a scheduled post back to draft when it no longer passes the check after a change", async () => {
    const p = await newPost();
    const scheduled = await ask(`${API}/posts/${p.id}/status`, { body: { target: "scheduled", scheduled: FUTURE } });
    const r = await ask(`${API}/posts/${p.id}`, {
      method: "PUT",
      body: { ...recipe({ check: { errors: 1, attention: 0, on: now() } }), version: scheduled.body.version },
    });
    expect(r.body.status).toBe("draft");
    expect(r.body.history.at(-1).what).toMatch(/back to draft/);
  });

  it("publishes with an https url, archives, and gets out of the archive only via draft", async () => {
    const p = await newPost();
    expect(
      (await ask(`${API}/posts/${p.id}/status`, { body: { target: "published", url: "http://linkedin.com/x" } }))
        .status,
    ).toBe(400);
    const pub = await ask(`${API}/posts/${p.id}/status`, {
      body: { target: "published", url: "https://www.linkedin.com/feed/update/1" },
    });
    expect(pub.body.status).toBe("published");
    expect(pub.body.published.url).toBe("https://www.linkedin.com/feed/update/1");
    expect(
      (await ask(`${API}/posts/${p.id}/status`, { body: { target: "scheduled", scheduled: FUTURE } })).status,
    ).toBe(409);
    expect((await ask(`${API}/posts/${p.id}/status`, { body: { target: "published" } })).status).toBe(409);
    expect((await ask(`${API}/posts/${p.id}/status`, { body: { target: "archived" } })).status).toBe(200);
    expect(
      (await ask(`${API}/posts/${p.id}/status`, { body: { target: "scheduled", scheduled: FUTURE } })).status,
    ).toBe(409);
    const back = await ask(`${API}/posts/${p.id}/status`, { body: { target: "draft" } });
    expect(back.body).toMatchObject({
      status: "draft",
      published: { url: "https://www.linkedin.com/feed/update/1" },
    });
    expect((await ask(`${API}/posts/${p.id}`)).body.history.map((g: { what: string }) => g.what)).toEqual(
      expect.arrayContaining(["published", "archived", "back to draft"]),
    );
  });
});

describe("campaigns, snippets and facts", () => {
  it("creates campaigns with a unique UTM name and refuses deleting while a post belongs to it", async () => {
    const c = await ask(`${API}/campaigns`, {
      body: { name: "Autumn", utmCampaign: "autumn-2026", from: "2026-10-01", to: "2026-12-31" },
    });
    expect(c.status).toBe(201);
    expect((await ask(`${API}/campaigns`, { body: { name: "Duplicate", utmCampaign: "autumn-2026" } })).status).toBe(
      409,
    );
    expect(
      (
        await ask(`${API}/campaigns`, {
          body: { name: "Reversed", utmCampaign: "inverted", from: "2026-12-01", to: "2026-01-01" },
        })
      ).status,
    ).toBe(400);
    expect((await ask(`${API}/campaigns`, { body: { name: "Capitals", utmCampaign: "Autumn" } })).status).toBe(400);
    const p = await newPost({ campaign: c.body.id });
    const remove = await ask(`${API}/campaigns/${c.body.id}`, { method: "DELETE" });
    expect(remove.status).toBe(409);
    expect(remove.body.error).toMatch(/archive/);
    await ask(`${API}/posts/${p.id}`, { method: "DELETE" });
    expect((await ask(`${API}/campaigns/${c.body.id}`, { method: "DELETE" })).status).toBe(200);
  });

  it("changes and deletes snippets", async () => {
    const t = await ask(`${API}/snippets`, { body: { kind: "hashtags", name: "Default", text: "#launch" } });
    expect(t.status).toBe(201);
    const w = await ask(`${API}/snippets/${t.body.id}`, {
      method: "PUT",
      body: { kind: "hashtags", name: "Default", text: "#release" },
    });
    expect(w.body.text).toBe("#release");
    expect(w.body.created).toBe(t.body.created);
    expect(
      (
        await ask(`${API}/snippets/t-00000000-0000-4000-8000-000000000000`, {
          method: "PUT",
          body: { kind: "opening", name: "x", text: "y" },
        })
      ).status,
    ).toBe(404);
    expect((await ask(`${API}/snippets/${t.body.id}`, { method: "DELETE" })).status).toBe(200);
  });

  it("requires an https address for an external source, and refuses deleting while a post uses the fact", async () => {
    const without = await ask(`${API}/facts`, {
      body: { text: "A claim", kind: "external", source: { kind: "external", reference: "no address" } },
    });
    expect(without.status).toBe(400);
    expect(without.body.error).toMatch(/https/);
    expect(
      (
        await ask(`${API}/facts`, {
          body: { text: "A claim", kind: "old", source: { kind: "site", reference: "README.md" } },
        })
      ).status,
    ).toBe(400);
    expect(
      (
        await ask(`${API}/facts`, {
          body: { text: "A claim", kind: "external", source: { kind: "knowledge", reference: "x" } },
        })
      ).status,
    ).toBe(400);
    const f = await ask(`${API}/facts`, {
      body: {
        text: "A claim",
        kind: "external",
        source: { kind: "external", reference: "https://example.com/source" },
        validUntil: "2026-12-31",
      },
    });
    expect(f.status).toBe(201);
    expect(f.body).toMatchObject({ status: "draft", kind: "external" });
    const p = await newPost({ facts: [f.body.id] });
    const remove = await ask(`${API}/facts/${f.body.id}`, { method: "DELETE" });
    expect(remove.status).toBe(409);
    expect(remove.body.error).toMatch(/withdrawn/);
    await ask(`${API}/posts/${p.id}`, { method: "DELETE" });
  });
});

describe("settings and overview", () => {
  it("gives default settings, saves valid ones and refuses invalid ones", async () => {
    const initial = await ask(`${API}/settings`);
    expect(initial.body.channels).toEqual(["linkedin"]);
    expect(initial.body.writingHelp).toEqual({ enabled: true, capUsdPerMonth: 10 });
    const isNew = { ...initial.body, channels: ["linkedin", "instagram"], bannedWords: ["gratis"] };
    expect((await ask(`${API}/settings`, { method: "PUT", body: isNew })).status).toBe(200);
    expect((await ask(`${API}/settings`)).body.channels).toEqual(["linkedin", "instagram"]);
    expect((await ask(`${API}/settings`, { method: "PUT", body: { ...isNew, channels: ["tiktok"] } })).status).toBe(
      400,
    );
  });

  it("counts scheduled, overdue and drafts, and names the next one", async () => {
    const tomorrow = new Date(Date.now() + 24 * 3600 * 1000).toISOString().replace("Z", "+00:00");
    const p = await newPost({ title: "Tomorrow" });
    await ask(`${API}/posts/${p.id}/status`, { body: { target: "scheduled", scheduled: tomorrow } });
    // A post that was scheduled yesterday: that cannot be created via the API (date in the
    // past), so it is written directly.
    const yesterday = new Date(Date.now() - 24 * 3600 * 1000).toISOString();
    await createPost(
      { dir: dataDir },
      {
        ...(await ask(`${API}/posts/${p.id}`)).body,
        id: "p-11111111-1111-4111-8111-111111111111",
        status: "scheduled",
        scheduled: yesterday,
      },
    );
    const o = await ask(`${API}/overview`);
    expect(o.status).toBe(200);
    expect(o.body.scheduledThisWeek).toBeGreaterThanOrEqual(1);
    expect(o.body.overdue).toBeGreaterThanOrEqual(1);
    expect(o.body.drafts).toBeGreaterThanOrEqual(1);
    expect(o.body.next.some((v: Post) => v.title === "Tomorrow")).toBe(true);
    expect(o.body.next.every((v: Post) => v.history === undefined)).toBe(true);
  });
});

describe("media", () => {
  function png(width: number, height: number): Buffer {
    const b = Buffer.alloc(40);
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]).copy(b, 0);
    b.writeUInt32BE(13, 8);
    b.write("IHDR", 12, "latin1");
    b.writeUInt32BE(width, 16);
    b.writeUInt32BE(height, 20);
    return b;
  }
  function jpeg(width: number, height: number): Buffer {
    // SOI, APP0 (length 16), SOF0 with height and width.
    const app0 = Buffer.concat([Buffer.from([0xff, 0xe0, 0x00, 0x10]), Buffer.alloc(14)]);
    const sof = Buffer.from([
      0xff,
      0xc0,
      0x00,
      0x11,
      0x08,
      height >> 8,
      height & 255,
      width >> 8,
      width & 255,
      0x03,
      0,
      0,
      0,
      0,
      0,
      0,
      0,
      0,
      0,
    ]);
    return Buffer.concat([Buffer.from([0xff, 0xd8]), app0, sof]);
  }
  function webp(width: number, height: number): Buffer {
    const b = Buffer.alloc(30);
    b.write("RIFF", 0, "latin1");
    b.write("WEBP", 8, "latin1");
    b.write("VP8X", 12, "latin1");
    b.writeUIntLE(width - 1, 24, 3);
    b.writeUIntLE(height - 1, 27, 3);
    return b;
  }
  const upload = (content: Buffer, type = "application/octet-stream") =>
    ask(`${API}/media`, {
      method: "POST",
      raw: content,
      headers: { "content-type": type },
    });
  // A real, smallest PNG: 1 by 1 pixel.
  const PNG_1X1 = Buffer.from(
    "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==",
    "base64",
  );

  it("accepts PNG, JPEG and WebP, with the dimensions from the file", async () => {
    const a = await upload(png(1440, 900));
    expect(a.status).toBe(201);
    expect(a.body).toMatchObject({ width: 1440, height: 900 });
    expect(a.body.id).toMatch(/^[0-9a-f]{32}\.png$/);
    expect((await upload(jpeg(800, 600))).body).toMatchObject({ width: 800, height: 600 });
    expect((await upload(webp(640, 480))).body).toMatchObject({ width: 640, height: 480 });
    // The same file again: the same id.
    expect((await upload(png(1440, 900))).body.id).toBe(a.body.id);
    const list = await ask(`${API}/media`);
    expect(list.body.media.length).toBeGreaterThanOrEqual(3);
  });

  it("finds the dimensions in the list even when the header of a JPEG is large, without reading every file in full", async () => {
    // Two APP1 segments of almost 64 kB (like EXIF with a thumbnail) before the SOF marker.
    const app = (n: number) => Buffer.concat([Buffer.from([0xff, 0xe1, 0xff, 0xf0]), Buffer.alloc(0xffee, n)]);
    const sof = Buffer.from([0xff, 0xc0, 0x00, 0x11, 0x08, 0x02, 0x58, 0x03, 0x20, 0x03, 0, 0, 0, 0, 0, 0, 0, 0, 0]);
    const large = Buffer.concat([Buffer.from([0xff, 0xd8]), app(1), app(2), app(3), app(4), app(5), sof]);
    const a = await upload(large);
    expect(a.body).toMatchObject({ width: 800, height: 600 });
    const line = (await ask(`${API}/media`)).body.media.find((m: { id: string }) => m.id === a.body.id);
    expect(line).toMatchObject({ width: 800, height: 600, bytes: large.length });
  });

  it("refuses SVG and HTML, even if the request says it is a PNG", async () => {
    const svg = await upload(
      Buffer.from('<svg xmlns="http://www.w3.org/2000/svg"><script>alert(1)</script></svg>'),
      "image/png",
    );
    expect(svg.status).toBe(400);
    const html = await upload(Buffer.from("<!doctype html><script>alert(1)</script>"), "image/png");
    expect(html.status).toBe(400);
    expect(html.body.error).toMatch(/PNG, JPEG or WebP/);
    expect((await upload(Buffer.alloc(0), "image/png")).status).toBe(400);
    expect((await upload(png(9000, 10))).status).toBe(400);
  });

  it("refuses 5 MB + 1 byte with 413 and accepts exactly 5 MB", async () => {
    const MB5 = 5 * 1024 * 1024;
    const headline = png(10, 10);
    expect((await upload(Buffer.concat([headline, Buffer.alloc(MB5 + 1 - headline.length)]), "image/png")).status).toBe(
      413,
    );
    expect((await upload(Buffer.concat([headline, Buffer.alloc(MB5 - headline.length)]), "image/png")).status).toBe(
      201,
    );
  });

  it("saves a valid PNG of 1 by 1 and returns exactly those bytes", async () => {
    const a = await upload(PNG_1X1, "image/png");
    expect(a.status).toBe(201);
    expect(a.body).toMatchObject({ width: 1, height: 1, bytes: PNG_1X1.length });
    const r = await fetch(`${base}${API}/media/${a.body.id}`);
    expect(r.status).toBe(200);
    expect(r.headers.get("content-type")).toBe("image/png");
    expect(Buffer.from(await r.arrayBuffer()).equals(PNG_1X1)).toBe(true);
  });

  it("serves an image with the right type and a closing CSP, and gives 400/404 for a wrong id", async () => {
    const a = await upload(png(20, 20));
    const r = await fetch(`${base}${API}/media/${a.body.id}`);
    expect(r.status).toBe(200);
    expect(r.headers.get("content-type")).toBe("image/png");
    expect(r.headers.get("content-security-policy")).toMatch(/sandbox/);
    expect(Buffer.from(await r.arrayBuffer()).equals(png(20, 20))).toBe(true);
    expect((await ask(`${API}/media/..%2Fpackage.json`)).status).toBe(400);
    expect((await ask(`${API}/media/${"0".repeat(32)}.png`)).status).toBe(404);
    expect(readFileSync(join(dataDir, "marketing", "media", a.body.id)).length).toBe(40);
  });

  it("deletes an unused image and refuses an image that a post uses, even an archived one", async () => {
    const id = (await upload(png(12, 12))).body.id;
    const p = await newPost({ template: "product-image", content: { image: id, headline: "A *headline.*" } });
    await ask(`${API}/posts/${p.id}/status`, { body: { target: "archived" } });
    const list = (await ask(`${API}/media`)).body.media;
    expect(list.find((m: { id: string }) => m.id === id).used).toBe(1);
    const refused = await ask(`${API}/media/${id}`, { method: "DELETE" });
    expect(refused.status).toBe(409);
    expect(refused.body.error).toMatch(/1 post/);
    await ask(`${API}/posts/${p.id}`, { method: "DELETE" });
    expect((await ask(`${API}/media/${id}`, { method: "DELETE" })).status).toBe(200);
    expect((await ask(`${API}/media/${id}`)).status).toBe(404);
    expect((await ask(`${API}/media/${id}`, { method: "DELETE" })).status).toBe(404);
    expect((await ask(`${API}/media/no-id`, { method: "DELETE" })).status).toBe(400);
  });
});

describe("ideas", () => {
  it("saves, changes and deletes an idea; an unknown template is not allowed", async () => {
    const r = await ask(`${API}/ideas`, {
      body: { date: "2026-10-06", title: "An idea", template: "statement", headline: "A *headline.*" },
    });
    expect(r.status).toBe(201);
    expect(r.body).toMatchObject({
      id: expect.stringMatching(/^i-/),
      origin: "manual",
      post: null,
      facts: [],
      moment: null,
      note: "",
    });
    const { id, created: _a, updated: _g, ...rest } = r.body;
    const w = await ask(`${API}/ideas/${id}`, { method: "PUT", body: { ...rest, date: "2026-10-07" } });
    expect(w.body.date).toBe("2026-10-07");
    expect(
      (await ask(`${API}/ideas`, { body: { date: "2026-10-06", title: "x", template: "does-not-exist" } })).status,
    ).toBe(400);
    expect((await ask(`${API}/ideas`, { body: { date: "6-10-2026", title: "x" } })).status).toBe(400);
    expect((await ask(`${API}/ideas/${id}`, { method: "DELETE" })).status).toBe(200);
    expect((await ask(`${API}/ideas`)).body.ideas.some((i: { id: string }) => i.id === id)).toBe(false);
  });
});

describe("results", () => {
  it("only on a published post; back to draft and duplicating clear it", async () => {
    const p = await newPost();
    expect(
      (
        await ask(`${API}/posts/${p.id}/result`, {
          method: "PUT",
          body: { impressions: 10, comments: 1, clicks: 0 },
        })
      ).status,
    ).toBe(409);
    await ask(`${API}/posts/${p.id}/status`, { body: { target: "published" } });
    const r = await ask(`${API}/posts/${p.id}/result`, {
      method: "PUT",
      body: { impressions: 10, comments: null, clicks: 0 },
    });
    expect(r.status).toBe(200);
    expect(r.body.result).toMatchObject({ impressions: 10, comments: null, clicks: 0 });
    expect(
      (
        await ask(`${API}/posts/${p.id}/result`, {
          method: "PUT",
          body: { impressions: -1, comments: null, clicks: null },
        })
      ).status,
    ).toBe(400);
    expect(
      (
        await ask(`${API}/posts/${p.id}/result`, {
          method: "PUT",
          body: { impressions: 1.5, comments: null, clicks: null },
        })
      ).status,
    ).toBe(400);
    const copy = (await ask(`${API}/posts/${p.id}/duplicate`, { body: {} })).body;
    expect(copy.result ?? null).toBeNull();
    const back = await ask(`${API}/posts/${p.id}/status`, { body: { target: "draft" } });
    expect(back.body.result).toBeNull();
  });

  it("keeps publication and result on archiving and restoring", async () => {
    const p = await newPost();
    await ask(`${API}/posts/${p.id}/status`, { body: { target: "published" } });
    await ask(`${API}/posts/${p.id}/result`, {
      method: "PUT",
      body: { impressions: 1200, comments: 14, clicks: 37 },
    });
    await ask(`${API}/posts/${p.id}/status`, { body: { target: "archived" } });
    const back = await ask(`${API}/posts/${p.id}/status`, { body: { target: "draft" } });
    expect(back.body.result).toMatchObject({ impressions: 1200, comments: 14, clicks: 37 });
    expect(back.body.published).not.toBeNull();
  });
});

describe("overview: rhythm, moments and results", () => {
  it("gives last publication, empty weeks, open ideas, moments and results", async () => {
    const o = (await ask(`${API}/overview`)).body;
    expect(o).toHaveProperty("lastPublished");
    expect(Array.isArray(o.emptyWeeks) && o.emptyWeeks.length <= 4).toBe(true);
    for (const w of o.emptyWeeks)
      expect(w).toMatchObject({ monday: expect.stringMatching(/^\d{4}-\d{2}-\d{2}$/), sunday: expect.any(String) });
    expect(typeof o.openIdeas).toBe("number");
    expect(Array.isArray(o.moments) && o.moments.length <= 5).toBe(true);
    expect(Array.isArray(o.results)).toBe(true);
  });

  it("counts open ideas: without a post (also from the past) and with a post deleted in the meantime; not an idea with an existing post", async () => {
    // Delta against a first measurement: the server is shared with other tests, so the
    // absolute count is not fixed.
    const before = (await ask(`${API}/overview`)).body.openIdeas;
    const future = "2099-01-01";
    expect((await ask(`${API}/ideas`, { body: { date: future, title: "Without post" } })).status).toBe(201);
    // An open idea from last month does not get lost: it counts.
    expect((await ask(`${API}/ideas`, { body: { date: "2020-01-06", title: "Left behind" } })).status).toBe(201);
    const withExistingPost = await newPost();
    expect(
      (
        await ask(`${API}/ideas`, {
          body: { date: future, title: "With existing post", post: withExistingPost.id },
        })
      ).status,
    ).toBe(201);
    const toDelete = await newPost();
    expect(
      (await ask(`${API}/ideas`, { body: { date: future, title: "With deleted post", post: toDelete.id } })).status,
    ).toBe(201);
    expect((await ask(`${API}/posts/${toDelete.id}`, { method: "DELETE" })).status).toBe(200);
    const after = (await ask(`${API}/overview`)).body.openIdeas;
    expect(after - before).toBe(3);
  });

  it("still names an archived post as the last publication", async () => {
    const p = await newPost({ title: "Published and then archived" });
    const published = (await ask(`${API}/posts/${p.id}/status`, { body: { target: "published" } })).body;
    expect((await ask(`${API}/posts/${p.id}/status`, { body: { target: "archived" } })).status).toBe(200);
    expect((await ask(`${API}/overview`)).body.lastPublished).toBe(published.published.on);
  });
});

describe("stored settings that do not look right", () => {
  /** A fresh studio, with `content` as the settings file (null: no file). */
  async function withFile(content: string | null) {
    const studio = await startStudio();
    if (content !== null) {
      mkdirSync(join(studio.dataDir, "marketing"), { recursive: true });
      writeFileSync(join(studio.dataDir, "marketing", "settings.json"), content);
    }
    const r = await fetch(`${studio.base}${API}/settings`);
    const text = await r.text();
    await studio.close();
    return { status: r.status, body: JSON.parse(text) };
  }

  it("gives the default without a file", async () => {
    const r = await withFile(null);
    expect(r.status).toBe(200);
    expect(r.body).toEqual(DEFAULT_SETTINGS);
  });

  it("fills a partly completed file per part: AI off stays off, with the default cap", async () => {
    const r = await withFile('{"writingHelp":{"enabled":false}}');
    expect(r.status).toBe(200);
    expect(r.body.writingHelp).toEqual({ enabled: false, capUsdPerMonth: 10 });
    expect(r.body.channels).toEqual(DEFAULT_SETTINGS.channels);
    const custom = await withFile('{"bannedWords":["gratis"]}');
    expect(custom.body.bannedWords).toEqual(["gratis"]);
    expect(custom.body.writingHelp).toEqual({ enabled: true, capUsdPerMonth: 10 });
  });

  it.each([
    ["a wrong type", '{"writingHelp":{"enabled":"no"}}', /writingHelp\.enabled/],
    ["an unknown field", '{"writingHelp":{"enabled":false,"extra":1}}', /writingHelp/],
    ["a part that is not an object", '{"writingHelp":"off"}', /writingHelp/],
    ["not JSON", "{this is not json", /settings\.json/],
    ["a list instead of an object", "[]", /settings\.json/],
    ["null", "null", /settings\.json/],
  ])("gives a 500 for %s that names the file, never the default", async (_name, content, field) => {
    const r = await withFile(content);
    expect(r.status).toBe(500);
    expect(r.body.error).toContain("marketing/settings.json");
    expect(r.body.error).toMatch(field);
    expect(r.body).not.toHaveProperty("writingHelp");
  });
});

describe("brand and saved posts", () => {
  it("returns a post with an old brandVersion unchanged after the brand in data/brand got another version", async () => {
    const studio = await startStudio();
    try {
      const create = await fetch(`${studio.base}${API}/posts`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(recipe({ brandVersion: "old-1.0" })),
      });
      expect(create.status).toBe(201);
      const post = await create.json();
      const builtIn = JSON.parse(readFileSync(new URL("../src/web/brand/brand.json", import.meta.url), "utf8"));
      mkdirSync(join(studio.dataDir, "brand"), { recursive: true });
      writeFileSync(join(studio.dataDir, "brand", "brand.json"), JSON.stringify({ ...builtIn, version: "new-2.0" }));
      expect((await (await fetch(`${studio.base}/api/brand`)).json()).version).toBe("new-2.0");
      const r = await fetch(`${studio.base}${API}/posts/${post.id}`);
      expect(r.status).toBe(200);
      expect(await r.json()).toMatchObject({ id: post.id, brandVersion: "old-1.0", title: post.title });
    } finally {
      await studio.close();
    }
  });
});
