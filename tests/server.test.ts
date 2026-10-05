import { mkdtempSync, mkdirSync, writeFileSync, existsSync, rmSync } from "node:fs";
import { request } from "node:http";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { spawnSync } from "node:child_process";
import { afterEach, expect, test, vi } from "vitest";
import { ApiFout, antwoord, route, startServer } from "../src/server/http.js";
import { ruw } from "./helpers/ruw.js";

let sluit: (() => Promise<void>) | undefined;
const mappen: string[] = [];
afterEach(async () => {
  await sluit?.();
  sluit = undefined;
  while (mappen.length) rmSync(mappen.pop()!, { recursive: true, force: true });
});

/** Elke test krijgt een eigen map; `web/` is de webmap en `GEHEIM` staat er direct naast, buiten bereik. */
const GEHEIM = "dit-hoort-er-niet-uit-te-komen";
async function start(dataDir?: string, poort = 0) {
  const wortel = mkdtempSync(join(tmpdir(), "pw-"));
  mappen.push(wortel);
  dataDir ??= join(wortel, "data");
  const web = join(wortel, "web");
  mkdirSync(web);
  writeFileSync(join(wortel, "secret.txt"), GEHEIM);
  writeFileSync(join(web, "index.html"), "<h1>studio</h1>");
  writeFileSync(join(web, "plaatje.svg"), "<svg xmlns='http://www.w3.org/2000/svg'><script>1</script></svg>");
  mkdirSync(join(web, "sub"));
  writeFileSync(join(web, "sub", "a.js"), "export const a = 1;");
  const s = await startServer({
    dataDir,
    poort,
    webDir: web,
    routes: [
      route("GET", "/api/ding/:id", (c) => ({ id: c.params.id })),
      route("POST", "/api/echo", async (c) => c.leesJson()),
      route("POST", "/api/ruw", async (c) => ({ bytes: (await c.lees()).length }), { ruweBody: true }),
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
test("geeft 404 op een pad buiten de webmap, ook als het bestand echt bestaat", async () => {
  const { url } = await start();
  // Het bestand staat direct naast de webmap; zonder de bewaking zou `/..%2fsecret.txt` het geven.
  for (const pad of [
    "/..%2fsecret.txt",
    "/..%2Fsecret.txt",
    "/sub/..%2f..%2fsecret.txt",
    "/%2e%2e%2fsecret.txt",
    "/..%5csecret.txt",
    "/../secret.txt",
    "/%252e%252e%252fsecret.txt",
    "/..%2fsecret.txt%00.png",
  ]) {
    const r = await ruw(url, { pad });
    expect(r.status, pad).toBe(404);
    expect(r.tekst, pad).not.toContain(GEHEIM);
  }
  expect((await ruw(url, { pad: "/sub/a.js" })).status).toBe(200);
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
test("Host en Origin: alleen de eigen pagina komt erdoor", async () => {
  const { url } = await start();
  const poort = new URL(url).port;
  const eigen = [`127.0.0.1:${poort}`, `localhost:${poort}`];
  const gevallen: Array<[string, string, string | undefined, number]> = [
    // [naam, Host, Origin, verwachte status]
    ["127.0.0.1 zonder Origin", eigen[0], undefined, 200],
    ["localhost zonder Origin", eigen[1], undefined, 200],
    ["127.0.0.1 met eigen Origin", eigen[0], `http://${eigen[0]}`, 200],
    ["localhost met eigen Origin", eigen[1], `http://${eigen[1]}`, 200],
    ["vreemde Host", "kwaad.example", undefined, 403],
    ["Host zonder poort", "127.0.0.1", undefined, 403],
    ["Host met verkeerde poort", "127.0.0.1:1", undefined, 403],
    ["Host in hoofdletters", `LOCALHOST:${poort}`, undefined, 403],
    ["localhost met punt erachter", `localhost.:${poort}`, undefined, 403],
    ["IPv6-Host", `[::1]:${poort}`, undefined, 403],
    ["vreemde Origin", eigen[0], "https://kwaad.example", 403],
    ["Origin: null", eigen[0], "null", 403],
    ["https-Origin van het eigen adres", eigen[0], `https://${eigen[0]}`, 403],
    ["Origin met verkeerde poort", eigen[0], "http://127.0.0.1:1", 403],
    ["IPv6-Origin", eigen[0], `http://[::1]:${poort}`, 403],
    ["Origin met pad erachter", eigen[0], `http://${eigen[0]}/`, 403],
  ];
  for (const [naam, host, origin, verwacht] of gevallen) {
    const headers: Record<string, string> = { host };
    if (origin !== undefined) headers.origin = origin;
    const r = await ruw(url, { pad: "/api/ding/1", headers });
    expect(r.status, naam).toBe(verwacht);
    if (verwacht === 403) expect(r.tekst, naam).not.toContain('"id"');
  }
});
test("een niet-parseerbaar verzoekdoel geeft 400 en de server blijft draaien", async () => {
  const { url } = await start();
  for (const pad of ["//", "//kwaad.example/x", "//:"]) {
    expect((await ruw(url, { pad })).status, pad).toBe(400);
  }
  expect((await fetch(url + "/api/ding/ok")).status).toBe(200);
});
test("de beveiligingskoppen staan op HTML: geen inlijsten, geen base of form naar elders", async () => {
  const { url } = await start();
  const r = await fetch(url + "/");
  const csp = r.headers.get("content-security-policy") ?? "";
  for (const deel of ["frame-ancestors 'self'", "base-uri 'none'", "form-action 'self'", "object-src 'none'"])
    expect(csp).toContain(deel);
  expect(r.headers.get("x-frame-options")).toBe("SAMEORIGIN");
});
test("een SVG krijgt een CSP die scripts en navigatie uitsluit, en nosniff", async () => {
  const { url } = await start();
  const r = await fetch(url + "/plaatje.svg");
  expect(r.headers.get("content-type")).toBe("image/svg+xml");
  expect(r.headers.get("content-security-policy")).toBe("default-src 'none'; style-src 'unsafe-inline'; sandbox");
  expect(r.headers.get("x-content-type-options")).toBe("nosniff");
});
test("een body die al in de kop te groot is, krijgt 413 zonder dat hij wordt gelezen", async () => {
  const { url } = await start();
  const r = await ruw(url, {
    pad: "/api/ruw",
    methode: "POST",
    headers: { "content-length": "5000000", "content-type": "application/octet-stream" },
    // Er komen maar twee bytes; zonder kopcontrole zou de server op de rest blijven wachten.
    body: "ab",
  });
  expect(r.status).toBe(413);
});
test("een body zonder Content-Length die de grens passeert, wordt afgebroken en niet tot het eind gelezen", async () => {
  const { url } = await start();
  const { hostname, port } = new URL(url);
  const blok = Buffer.alloc(64 * 1024, 97);
  const GRENS_TOTAAL = 200 * 1024 * 1024;
  let geschreven = 0;
  const antwoordStatus = await new Promise<number | string>((klaar) => {
    const r = request({
      host: hostname,
      port,
      path: "/api/ruw",
      method: "POST",
      headers: { "content-type": "application/octet-stream" }, // chunked
    });
    let gedaan = false;
    const einde = (x: number | string) => {
      if (gedaan) return;
      gedaan = true;
      r.destroy();
      klaar(x);
    };
    r.on("response", (res) => {
      res.resume();
      einde(res.statusCode ?? 0);
    });
    r.on("error", (e) => einde(`fout: ${(e as NodeJS.ErrnoException).code}`));
    const schrijf = () => {
      while (!gedaan && geschreven < GRENS_TOTAAL) {
        geschreven += blok.length;
        if (!r.write(blok)) return void r.once("drain", schrijf);
      }
      if (!gedaan) r.end();
    };
    schrijf();
  });
  expect(antwoordStatus).toBe(413);
  expect(geschreven).toBeLessThan(GRENS_TOTAAL);
});
test("PORT=abc geeft één regel en afsluitcode 1, geen stacktrace", () => {
  const data = mkdtempSync(join(tmpdir(), "pw-port-"));
  mappen.push(data);
  for (const poort of ["abc", "70000", "-1", "80.5", ""]) {
    const r = spawnSync(process.execPath, ["--import", "tsx", "src/server/start.ts"], {
      env: { ...process.env, PORT: poort, POSTWRIGHT_DATA_DIR: join(data, "data") },
      encoding: "utf8",
      timeout: 20_000,
    });
    expect(r.status, poort).toBe(1);
    const regels = r.stderr.trim().split("\n");
    expect(regels, poort).toHaveLength(1);
    expect(regels[0], poort).toMatch(/^PORT must be a whole number between 0 and 65535/);
    expect(r.stderr, poort).not.toContain(" at ");
  }
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
