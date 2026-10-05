import { mkdtempSync, mkdirSync, writeFileSync, existsSync, rmSync } from "node:fs";
import { request } from "node:http";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { spawnSync } from "node:child_process";
import { afterEach, expect, test, vi } from "vitest";
import { ApiError, response, route, startServer } from "../src/server/http.js";
import { raw } from "./helpers/raw.js";

let close: (() => Promise<void>) | undefined;
const folders: string[] = [];
afterEach(async () => {
  await close?.();
  close = undefined;
  while (folders.length) rmSync(folders.pop()!, { recursive: true, force: true });
});

/**
 * Every test gets its own folder; `web/` is the web folder and `SECRET` sits directly next
 * to it, out of reach.
 */
const SECRET = "this-should-not-come-out";
async function start(dataDir?: string, port = 0) {
  const root = mkdtempSync(join(tmpdir(), "pw-"));
  folders.push(root);
  dataDir ??= join(root, "data");
  const web = join(root, "web");
  mkdirSync(web);
  writeFileSync(join(root, "secret.txt"), SECRET);
  writeFileSync(join(web, "index.html"), "<h1>studio</h1>");
  writeFileSync(join(web, "picture.svg"), "<svg xmlns='http://www.w3.org/2000/svg'><script>1</script></svg>");
  mkdirSync(join(web, "sub"));
  writeFileSync(join(web, "sub", "a.js"), "export const a = 1;");
  const s = await startServer({
    dataDir,
    port,
    webDir: web,
    routes: [
      route("GET", "/api/thing/:id", (c) => ({ id: c.params.id })),
      route("POST", "/api/echo", async (c) => c.readJson()),
      route("POST", "/api/raw", async (c) => ({ bytes: (await c.read()).length }), { rawBody: true }),
      route("GET", "/api/broken", () => {
        throw new ApiError(409, "Busy");
      }),
      route("GET", "/api/crash", () => {
        throw new Error("secret detail");
      }),
      route("GET", "/api/raw", () => response({ contentType: "text/plain", body: "hoi" })),
    ],
  });
  close = s.close;
  return { ...s, dataDir };
}

test("creates the data folder on first start", async () => {
  const { dataDir } = await start();
  expect(existsSync(dataDir)).toBe(true);
});
test("serves index.html at / with a CSP", async () => {
  const { url } = await start();
  const r = await fetch(url + "/");
  expect(await r.text()).toContain("studio");
  expect(r.headers.get("content-security-policy")).toContain("default-src 'self'");
});
test("serves static modules with the right type", async () => {
  const { url } = await start();
  expect((await fetch(url + "/sub/a.js")).headers.get("content-type")).toContain("javascript");
});
test("gives 404 for a path outside the web folder, even if the file really exists", async () => {
  const { url } = await start();
  // The file sits directly next to the web folder; without the guard, `/..%2fsecret.txt`
  // would give it.
  for (const path of [
    "/..%2fsecret.txt",
    "/..%2Fsecret.txt",
    "/sub/..%2f..%2fsecret.txt",
    "/%2e%2e%2fsecret.txt",
    "/..%5csecret.txt",
    "/../secret.txt",
    "/%252e%252e%252fsecret.txt",
    "/..%2fsecret.txt%00.png",
  ]) {
    const r = await raw(url, { path });
    expect(r.status, path).toBe(404);
    expect(r.text, path).not.toContain(SECRET);
  }
  expect((await raw(url, { path: "/sub/a.js" })).status).toBe(200);
});
test("fills in path parameters", async () => {
  const { url } = await start();
  expect(await (await fetch(url + "/api/thing/42")).json()).toEqual({ id: "42" });
});
test("unknown api route gives 404 as JSON", async () => {
  const { url } = await start();
  const r = await fetch(url + "/api/does-not-exist");
  expect(r.status).toBe(404);
  expect(await r.json()).toHaveProperty("error");
});
test("ApiError becomes status and message; another error leaks no details", async () => {
  const log = vi.spyOn(console, "error").mockImplementation(() => {});
  try {
    const { url } = await start();
    const a = await fetch(url + "/api/broken");
    expect(a.status).toBe(409);
    expect((await a.json()).error).toBe("Busy");
    const b = await fetch(url + "/api/crash");
    expect(b.status).toBe(500);
    expect(JSON.stringify(await b.json())).not.toContain("secret");
    expect(log).toHaveBeenCalledTimes(1);
  } finally {
    log.mockRestore();
  }
});
test("POST without json type gives 415, invalid json 400, too large 413", async () => {
  const { url } = await start();
  const post = (body: string, type = "application/json") =>
    fetch(url + "/api/echo", { method: "POST", headers: { "content-type": type }, body });
  expect((await post("{}", "text/plain")).status).toBe(415);
  expect((await post("{no")).status).toBe(400);
  expect((await post(JSON.stringify({ x: "a".repeat(1_100_000) }))).status).toBe(413);
  expect(await (await post('{"ok":true}')).json()).toEqual({ ok: true });
});
test("Host and Origin: only the own page gets through", async () => {
  const { url } = await start();
  const port = new URL(url).port;
  const custom = [`127.0.0.1:${port}`, `localhost:${port}`];
  const cases: Array<[string, string, string | undefined, number]> = [
    // [name, Host, Origin, expected status]
    ["127.0.0.1 without Origin", custom[0], undefined, 200],
    ["localhost without Origin", custom[1], undefined, 200],
    ["127.0.0.1 with own Origin", custom[0], `http://${custom[0]}`, 200],
    ["localhost with own Origin", custom[1], `http://${custom[1]}`, 200],
    ["foreign Host", "evil.example", undefined, 403],
    ["Host without port", "127.0.0.1", undefined, 403],
    ["Host with wrong port", "127.0.0.1:1", undefined, 403],
    ["Host in capitals", `LOCALHOST:${port}`, undefined, 403],
    ["localhost with a trailing dot", `localhost.:${port}`, undefined, 403],
    ["IPv6-Host", `[::1]:${port}`, undefined, 403],
    ["foreign Origin", custom[0], "https://evil.example", 403],
    ["Origin: null", custom[0], "null", 403],
    ["https Origin of the own address", custom[0], `https://${custom[0]}`, 403],
    ["Origin with wrong port", custom[0], "http://127.0.0.1:1", 403],
    ["IPv6-Origin", custom[0], `http://[::1]:${port}`, 403],
    ["Origin with a path", custom[0], `http://${custom[0]}/`, 403],
  ];
  for (const [name, host, origin, expected] of cases) {
    const headers: Record<string, string> = { host };
    if (origin !== undefined) headers.origin = origin;
    const r = await raw(url, { path: "/api/thing/1", headers });
    expect(r.status, name).toBe(expected);
    if (expected === 403) expect(r.text, name).not.toContain('"id"');
  }
});
test("an unparseable request target gives 400 and the server keeps running", async () => {
  const { url } = await start();
  for (const path of ["//", "//evil.example/x", "//:"]) {
    expect((await raw(url, { path })).status, path).toBe(400);
  }
  expect((await fetch(url + "/api/thing/ok")).status).toBe(200);
});
test("the security headers are on HTML: no framing, no base or form elsewhere", async () => {
  const { url } = await start();
  const r = await fetch(url + "/");
  const csp = r.headers.get("content-security-policy") ?? "";
  for (const part of ["frame-ancestors 'self'", "base-uri 'none'", "form-action 'self'", "object-src 'none'"])
    expect(csp).toContain(part);
  expect(r.headers.get("x-frame-options")).toBe("SAMEORIGIN");
});
test("an SVG gets a CSP that excludes scripts and navigation, and nosniff", async () => {
  const { url } = await start();
  const r = await fetch(url + "/picture.svg");
  expect(r.headers.get("content-type")).toBe("image/svg+xml");
  expect(r.headers.get("content-security-policy")).toBe("default-src 'none'; style-src 'unsafe-inline'; sandbox");
  expect(r.headers.get("x-content-type-options")).toBe("nosniff");
});
test("a body that is already too large in the header gets 413 without being read", async () => {
  const { url } = await start();
  const r = await raw(url, {
    path: "/api/raw",
    method: "POST",
    headers: { "content-length": "5000000", "content-type": "application/octet-stream" },
    // Only two bytes arrive; without a header check the server would keep waiting for the rest.
    body: "ab",
  });
  expect(r.status).toBe(413);
});
test("a body without Content-Length that passes the limit is aborted and not read to the end", async () => {
  const { url } = await start();
  const { hostname, port } = new URL(url);
  const block = Buffer.alloc(64 * 1024, 97);
  const LIMIT_TOTAL = 200 * 1024 * 1024;
  let written = 0;
  const replyStatus = await new Promise<number | string>((resolve) => {
    const r = request({
      host: hostname,
      port,
      path: "/api/raw",
      method: "POST",
      headers: { "content-type": "application/octet-stream" }, // chunked
    });
    let done = false;
    const end = (x: number | string) => {
      if (done) return;
      done = true;
      r.destroy();
      resolve(x);
    };
    r.on("response", (res) => {
      res.resume();
      end(res.statusCode ?? 0);
    });
    r.on("error", (e) => end(`error: ${(e as NodeJS.ErrnoException).code}`));
    const write = () => {
      while (!done && written < LIMIT_TOTAL) {
        written += block.length;
        if (!r.write(block)) return void r.once("drain", write);
      }
      if (!done) r.end();
    };
    write();
  });
  expect(replyStatus).toBe(413);
  expect(written).toBeLessThan(LIMIT_TOTAL);
});
test("PORT=abc gives one line and exit code 1, no stack trace", () => {
  const data = mkdtempSync(join(tmpdir(), "pw-port-"));
  folders.push(data);
  for (const port of ["abc", "70000", "-1", "80.5", ""]) {
    const r = spawnSync(process.execPath, ["--import", "tsx", "src/server/start.ts"], {
      env: { ...process.env, PORT: port, POSTWRIGHT_DATA_DIR: join(data, "data") },
      encoding: "utf8",
      timeout: 20_000,
    });
    expect(r.status, port).toBe(1);
    const lines = r.stderr.trim().split("\n");
    expect(lines, port).toHaveLength(1);
    expect(lines[0], port).toMatch(/^PORT must be a whole number between 0 and 65535/);
    expect(r.stderr, port).not.toContain(" at ");
  }
});
test("a non-JSON response keeps its type", async () => {
  const { url } = await start();
  const r = await fetch(url + "/api/raw");
  expect(r.headers.get("content-type")).toContain("text/plain");
  expect(await r.text()).toBe("hoi");
});
test("a busy port rejects with EADDRINUSE", async () => {
  const first = await start();
  const port = Number(new URL(first.url).port);
  await expect(start(undefined, port)).rejects.toMatchObject({ code: "EADDRINUSE" });
});
