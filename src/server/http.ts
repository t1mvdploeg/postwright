import { createServer, type IncomingMessage, type ServerResponse } from "node:http";
import { mkdir, readFile } from "node:fs/promises";
import { extname, isAbsolute, join, relative, sep } from "node:path";
import { fileURLToPath } from "node:url";

/** Een fout met een HTTP-status en een bericht dat de gebruiker mag zien. */
export class ApiFout extends Error {
  status: number;
  constructor(status: number, bericht: string) {
    super(bericht);
    this.status = status;
  }
}

/**
 * Wat een route van de aanvraag mag weten. Bewust géén `IncomingMessage`/`ServerResponse`: een
 * route leest de body via `lees`/`leesJson` en geeft een antwoord terug in plaats van het zelf
 * weg te schrijven.
 */
export interface Ctx {
  params: Record<string, string>;
  url: URL;
  /** Ruwe body; meer dan `maxBytes` (standaard 1 MB) geeft een 413. */
  lees(maxBytes?: number): Promise<Buffer>;
  leesJson<T>(): Promise<T>;
  header(naam: string): string | undefined;
}

/** Een antwoord dat geen JSON-object is (bestand, tekst) of een andere status dan 200 nodig heeft. */
export interface Antwoord {
  status?: number;
  contentType?: string;
  body: Buffer | string | unknown;
  headers?: Record<string, string>;
}

const ANTWOORD = Symbol.for("postwright.antwoord");

/** Markeert een `Antwoord` zodat de server het onderscheidt van gewone JSON-data. */
export function antwoord(a: Antwoord): Antwoord {
  return Object.assign({}, a, { [ANTWOORD]: true }) as Antwoord;
}

function isAntwoord(x: unknown): x is Antwoord {
  return typeof x === "object" && x !== null && (x as Record<symbol, unknown>)[ANTWOORD] === true;
}

/** `ruweBody`: deze route ontvangt geen JSON, dus de content-type-eis (application/json) geldt niet. */
export interface Route {
  methode: string;
  pad: string;
  patroon: RegExp;
  handler: (c: Ctx) => Promise<unknown> | unknown;
  ruweBody?: boolean;
}

export function route(
  methode: string,
  pad: string,
  handler: Route["handler"],
  opties: { ruweBody?: boolean } = {},
): Route {
  const patroon = new RegExp("^" + pad.replace(/\./g, "\\.").replace(/:(\w+)/g, "(?<$1>[^/]+)") + "$");
  return { methode, pad, patroon, handler, ruweBody: opties.ruweBody };
}

export interface ServerOpties {
  dataDir: string;
  poort?: number;
  webDir?: string;
  routes: Route[];
}

const MAX_BODY = 1_000_000;
const STANDAARD_WEBDIR = fileURLToPath(new URL("../web", import.meta.url));
const CSP =
  "default-src 'self'; img-src 'self' data: blob:; font-src 'self' data:; frame-src 'self'; style-src 'self' 'unsafe-inline'";
const TYPES: Record<string, string> = {
  ".html": "text/html; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".svg": "image/svg+xml",
  ".json": "application/json; charset=utf-8",
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".webp": "image/webp",
  ".woff2": "font/woff2",
  ".ico": "image/x-icon",
};

function stuur(
  res: ServerResponse,
  status: number,
  type: string,
  body: Buffer | string,
  extra: Record<string, string> = {},
) {
  const headers: Record<string, string> = { "content-type": type, "x-content-type-options": "nosniff", ...extra };
  if (type.startsWith("text/html")) headers["content-security-policy"] = CSP;
  res.writeHead(status, headers);
  res.end(body);
}

function stuurJson(res: ServerResponse, status: number, data: unknown) {
  stuur(res, status, "application/json; charset=utf-8", JSON.stringify(data ?? null), { "cache-control": "no-store" });
}

function maakCtx(req: IncomingMessage, url: URL, params: Record<string, string>): Ctx {
  const lees = async (maxBytes = MAX_BODY) => {
    const blokken: Buffer[] = [];
    let totaal = 0;
    // Bij te veel bytes lezen we de rest weg zonder te bewaren, zodat het antwoord de client bereikt.
    for await (const blok of req) {
      totaal += (blok as Buffer).length;
      if (totaal <= maxBytes) blokken.push(blok as Buffer);
    }
    if (totaal > maxBytes) throw new ApiFout(413, "Verzoek te groot");
    return Buffer.concat(blokken);
  };
  return {
    params,
    url,
    lees,
    async leesJson<T>() {
      try {
        return JSON.parse((await lees()).toString("utf8")) as T;
      } catch (e) {
        if (e instanceof ApiFout) throw e;
        throw new ApiFout(400, "Ongeldige JSON");
      }
    },
    header: (naam) => {
      const h = req.headers[naam.toLowerCase()];
      return Array.isArray(h) ? h.join(", ") : h;
    },
  };
}

async function api(req: IncomingMessage, res: ServerResponse, url: URL, routes: Route[]) {
  let gekozen: Route | undefined;
  let params: Record<string, string> = {};
  for (const r of routes) {
    if (r.methode !== req.method) continue;
    const m = r.patroon.exec(url.pathname);
    if (!m) continue;
    try {
      params = Object.fromEntries(Object.entries(m.groups ?? {}).map(([k, v]) => [k, decodeURIComponent(v)]));
    } catch {
      return stuurJson(res, 400, { fout: "Ongeldig pad" });
    }
    gekozen = r;
    break;
  }
  if (!gekozen) return stuurJson(res, 404, { fout: "Niet gevonden" });
  try {
    if (
      (req.method === "POST" || req.method === "PUT") &&
      !gekozen.ruweBody &&
      !/^application\/json\b/i.test(req.headers["content-type"] ?? "")
    ) {
      throw new ApiFout(415, "Content-Type moet application/json zijn");
    }
    const uit = await gekozen.handler(maakCtx(req, url, params));
    if (!isAntwoord(uit)) return stuurJson(res, 200, uit);
    const status = uit.status ?? 200;
    const { body } = uit;
    if (Buffer.isBuffer(body) || typeof body === "string")
      return stuur(res, status, uit.contentType ?? "application/octet-stream", body, uit.headers);
    return stuur(
      res,
      status,
      uit.contentType ?? "application/json; charset=utf-8",
      JSON.stringify(body ?? null),
      uit.headers,
    );
  } catch (fout) {
    if (fout instanceof ApiFout) return stuurJson(res, fout.status, { fout: fout.message });
    // Het routepatroon, niet de ingevulde URL: die kan een id of querystring bevatten.
    console.error(`${gekozen.methode} ${gekozen.pad}:`, fout);
    return stuurJson(res, 500, { fout: "Interne fout" });
  }
}

async function statisch(req: IncomingMessage, res: ServerResponse, url: URL, webDir: string) {
  const nietGevonden = () => stuur(res, 404, "text/plain; charset=utf-8", "Niet gevonden");
  if (req.method !== "GET" && req.method !== "HEAD") return nietGevonden();
  let naam: string;
  try {
    naam = decodeURIComponent(url.pathname);
  } catch {
    return nietGevonden();
  }
  if (naam.includes("\0")) return nietGevonden();
  const p = join(webDir, naam === "/" ? "index.html" : naam);
  const rel = relative(webDir, p);
  if (rel === ".." || rel.startsWith(`..${sep}`) || isAbsolute(rel)) return nietGevonden();
  try {
    stuur(res, 200, TYPES[extname(p).toLowerCase()] ?? "application/octet-stream", await readFile(p));
  } catch {
    nietGevonden();
  }
}

export async function startServer(o: ServerOpties): Promise<{ url: string; sluit(): Promise<void> }> {
  await mkdir(o.dataDir, { recursive: true });
  const webDir = o.webDir ?? STANDAARD_WEBDIR;
  const server = createServer((req, res) => {
    // Alleen verzoeken die vanaf de eigen pagina komen: dat houdt DNS-rebinding en
    // cross-site verzoeken van een andere website buiten de deur.
    const { port } = server.address() as { port: number };
    const toegestaan = [`127.0.0.1:${port}`, `localhost:${port}`];
    const origin = req.headers.origin;
    if (
      !toegestaan.includes(req.headers.host ?? "") ||
      (origin !== undefined && !toegestaan.some((h) => origin === `http://${h}`))
    ) {
      return stuurJson(res, 403, { fout: "Verboden" });
    }
    const url = new URL(req.url ?? "/", `http://127.0.0.1:${port}`);
    const klaar = url.pathname.startsWith("/api/") ? api(req, res, url, o.routes) : statisch(req, res, url, webDir);
    klaar.catch((fout) => {
      console.error(fout);
      if (!res.headersSent) stuurJson(res, 500, { fout: "Interne fout" });
    });
  });
  await new Promise<void>((klaar, fout) => {
    server.once("error", fout);
    server.listen(o.poort ?? 0, "127.0.0.1", () => {
      server.off("error", fout);
      klaar();
    });
  });
  const { port } = server.address() as { port: number };
  return {
    url: `http://127.0.0.1:${port}`,
    sluit: () =>
      new Promise<void>((klaar) => {
        server.close(() => klaar());
        server.closeAllConnections();
      }),
  };
}
