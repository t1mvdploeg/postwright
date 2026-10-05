import { mkdtempSync, mkdirSync, writeFileSync, existsSync } from "node:fs";
import { request } from "node:http";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, expect, test, vi } from "vitest";
import { ApiFout, antwoord, route, startServer } from "../src/server/http.js";

let sluit: (() => Promise<void>) | undefined;
afterEach(async () => {
  await sluit?.();
  sluit = undefined;
});

async function start(dataDir = join(mkdtempSync(join(tmpdir(), "pw-")), "data"), poort = 0) {
  const web = mkdtempSync(join(tmpdir(), "pw-web-"));
  writeFileSync(join(web, "index.html"), "<h1>studio</h1>");
  mkdirSync(join(web, "sub"));
  writeFileSync(join(web, "sub", "a.js"), "export const a = 1;");
  const s = await startServer({
    dataDir,
    poort,
    webDir: web,
    routes: [
      route("GET", "/api/ding/:id", (c) => ({ id: c.params.id })),
      route("POST", "/api/echo", async (c) => c.leesJson()),
      route("GET", "/api/kapot", () => {
        throw new ApiFout(409, "Bezet");
      }),
      route("GET", "/api/crash", () => {
        throw new Error("geheim detail");
      }),
      route("GET", "/api/ruw", () => antwoord({ contentType: "text/plain", body: "hoi" })),
    ],
  });
  sluit = s.sluit;
  return { ...s, dataDir };
}

test("maakt de datamap aan bij de eerste start", async () => {
  const { dataDir } = await start();
  expect(existsSync(dataDir)).toBe(true);
});
test("serveert index.html op / met een CSP", async () => {
  const { url } = await start();
  const r = await fetch(url + "/");
  expect(await r.text()).toContain("studio");
  expect(r.headers.get("content-security-policy")).toContain("default-src 'self'");
});
test("serveert statische modules met het juiste type", async () => {
  const { url } = await start();
  expect((await fetch(url + "/sub/a.js")).headers.get("content-type")).toContain("javascript");
});
test("geeft 404 op een pad buiten de webmap", async () => {
  const { url } = await start();
  expect((await fetch(url + "/..%2f..%2fpackage.json")).status).toBe(404);
});
test("vult padparameters in", async () => {
  const { url } = await start();
  expect(await (await fetch(url + "/api/ding/42")).json()).toEqual({ id: "42" });
});
test("onbekende api-route geeft 404 als JSON", async () => {
  const { url } = await start();
  const r = await fetch(url + "/api/bestaat-niet");
  expect(r.status).toBe(404);
  expect(await r.json()).toHaveProperty("fout");
});
test("ApiFout wordt status en bericht; een andere fout lekt geen details", async () => {
  const log = vi.spyOn(console, "error").mockImplementation(() => {});
  try {
    const { url } = await start();
    const a = await fetch(url + "/api/kapot");
    expect(a.status).toBe(409);
    expect((await a.json()).fout).toBe("Bezet");
    const b = await fetch(url + "/api/crash");
    expect(b.status).toBe(500);
    expect(JSON.stringify(await b.json())).not.toContain("geheim");
    expect(log).toHaveBeenCalledTimes(1);
  } finally {
    log.mockRestore();
  }
});
test("POST zonder json-type geeft 415, ongeldige json 400, te groot 413", async () => {
  const { url } = await start();
  const post = (body: string, type = "application/json") =>
    fetch(url + "/api/echo", { method: "POST", headers: { "content-type": type }, body });
  expect((await post("{}", "text/plain")).status).toBe(415);
  expect((await post("{nee")).status).toBe(400);
  expect((await post(JSON.stringify({ x: "a".repeat(1_100_000) }))).status).toBe(413);
  expect(await (await post('{"ok":true}')).json()).toEqual({ ok: true });
});
test("weigert een vreemde Origin en een vreemde Host", async () => {
  const { url } = await start();
  expect((await fetch(url + "/api/ding/1", { headers: { origin: "https://kwaad.example" } })).status).toBe(403);
  const poort = Number(new URL(url).port);
  // fetch laat de Host-kop niet overschrijven, dus hier node:http.
  const status = await new Promise<number>((klaar, fout) => {
    const r = request(
      { host: "127.0.0.1", port: poort, path: "/api/ding/1", headers: { host: "kwaad.example" } },
      (res) => {
        res.resume();
        klaar(res.statusCode ?? 0);
      },
    );
    r.on("error", fout);
    r.end();
  });
  expect(status).toBe(403);
});
test("een niet-JSON-antwoord houdt zijn type", async () => {
  const { url } = await start();
  const r = await fetch(url + "/api/ruw");
  expect(r.headers.get("content-type")).toContain("text/plain");
  expect(await r.text()).toBe("hoi");
});
test("een bezette poort verwerpt met EADDRINUSE", async () => {
  const eerste = await start();
  const poort = Number(new URL(eerste.url).port);
  await expect(start(undefined, poort)).rejects.toMatchObject({ code: "EADDRINUSE" });
});
