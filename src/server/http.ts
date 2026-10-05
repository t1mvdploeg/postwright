import { createServer, type IncomingMessage, type ServerResponse } from "node:http";
import { mkdir, readFile } from "node:fs/promises";
import { extname, isAbsolute, join, relative, sep } from "node:path";
import { fileURLToPath } from "node:url";

/** An error with an HTTP status and a message the user may see. */
export class ApiError extends Error {
  status: number;
  constructor(status: number, message: string) {
    super(message);
    this.status = status;
  }
}

/**
 * What a route may know about the request. Deliberately NOT `IncomingMessage`/
 * `ServerResponse`: a route reads the body via `read`/`readJson` and returns a response
 * instead of writing it out itself.
 */
export interface Ctx {
  params: Record<string, string>;
  url: URL;
  /** Raw body; more than `maxBytes` (default 1 MB) gives a 413. */
  read(maxBytes?: number): Promise<Buffer>;
  readJson<T>(): Promise<T>;
  header(name: string): string | undefined;
}

/** A response that is not a JSON object (file, text) or needs a status other than 200. */
export interface Reply {
  status?: number;
  contentType?: string;
  body: Buffer | string | unknown;
  headers?: Record<string, string>;
}

const REPLY = Symbol.for("postwright.reply");

/** Marks a `Reply` so that the server can tell it apart from plain JSON data. */
export function response(a: Reply): Reply {
  return Object.assign({}, a, { [REPLY]: true }) as Reply;
}

function isReply(x: unknown): x is Reply {
  return typeof x === "object" && x !== null && (x as Record<symbol, unknown>)[REPLY] === true;
}

/**
 * `rawBody`: this route does not receive JSON, so the content-type requirement
 * (application/json) does not apply.
 */
export interface Route {
  method: string;
  path: string;
  pattern: RegExp;
  handler: (c: Ctx) => Promise<unknown> | unknown;
  rawBody?: boolean;
}

export function route(
  method: string,
  path: string,
  handler: Route["handler"],
  options: { rawBody?: boolean } = {},
): Route {
  const pattern = new RegExp("^" + path.replace(/\./g, "\\.").replace(/:(\w+)/g, "(?<$1>[^/]+)") + "$");
  return { method, path, pattern, handler, rawBody: options.rawBody };
}

export interface ServerOptions {
  dataDir: string;
  port?: number;
  webDir?: string;
  routes: Route[];
  /** A URL prefix that comes from a different folder than `webDir`; it is checked first. */
  static?: { prefix: string; dir: () => string }[];
}

const MAX_BODY = 1_000_000;
/**
 * This many bytes above the limit are still read and discarded (without storing) before
 * the connection is closed.
 */
const OUTPUT_BYTES = 8 * 1024 * 1024;
const DEFAULT_WEBDIR = fileURLToPath(new URL("../web", import.meta.url));
const CSP =
  "default-src 'self'; img-src 'self' data: blob:; font-src 'self' data:; frame-src 'self'; style-src 'self' 'unsafe-inline'; " +
  "frame-ancestors 'self'; base-uri 'none'; form-action 'self'; object-src 'none'";
/**
 * An SVG that is opened directly (and so counts as a page) must not run script; as an
 * `<img>` or via `<use>` this does not apply.
 */
const SVG_CSP = "default-src 'none'; style-src 'unsafe-inline'; sandbox";
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

function send(
  res: ServerResponse,
  status: number,
  type: string,
  body: Buffer | string,
  extra: Record<string, string> = {},
) {
  const headers: Record<string, string> = { "content-type": type, "x-content-type-options": "nosniff", ...extra };
  if (type.startsWith("text/html")) {
    headers["content-security-policy"] = CSP;
    headers["x-frame-options"] = "SAMEORIGIN";
  } else if (type.startsWith("image/svg+xml")) headers["content-security-policy"] ??= SVG_CSP;
  res.writeHead(status, headers);
  res.end(body);
}

function sendJson(res: ServerResponse, status: number, data: unknown) {
  send(res, status, "application/json; charset=utf-8", JSON.stringify(data ?? null), { "cache-control": "no-store" });
}

function createCtx(req: IncomingMessage, url: URL, params: Record<string, string>): Ctx {
  const read = (maxBytes = MAX_BODY) =>
    new Promise<Buffer>((resolve, error) => {
      const blocks: Buffer[] = [];
      let total = 0;
      // A request that already declares in its header that it is too large is not stored.
      let rejected = Number(req.headers["content-length"]) > maxBytes;
      if (rejected) error(new ApiError(413, "Request too large"));
      req.on("data", (block: Buffer) => {
        total += block.length;
        if (!rejected && total <= maxBytes) return void blocks.push(block);
        if (!rejected) {
          rejected = true;
          blocks.length = 0;
          error(new ApiError(413, "Request too large"));
        }
        // Read on for a moment without storing, so that the 413 reaches the client (which is still
        // writing); anyone who carries on after that has the connection closed on them.
        if (total > maxBytes + OUTPUT_BYTES) req.destroy();
      });
      req.on("end", () => resolve(Buffer.concat(blocks)));
      req.on("error", error);
    });
  return {
    params,
    url,
    read,
    async readJson<T>() {
      try {
        return JSON.parse((await read()).toString("utf8")) as T;
      } catch (e) {
        if (e instanceof ApiError) throw e;
        throw new ApiError(400, "Invalid JSON");
      }
    },
    header: (name) => {
      const h = req.headers[name.toLowerCase()];
      return Array.isArray(h) ? h.join(", ") : h;
    },
  };
}

async function api(req: IncomingMessage, res: ServerResponse, url: URL, routes: Route[]) {
  let chosen: Route | undefined;
  let params: Record<string, string> = {};
  for (const r of routes) {
    if (r.method !== req.method) continue;
    const m = r.pattern.exec(url.pathname);
    if (!m) continue;
    try {
      params = Object.fromEntries(Object.entries(m.groups ?? {}).map(([k, v]) => [k, decodeURIComponent(v)]));
    } catch {
      return sendJson(res, 400, { error: "Invalid path" });
    }
    chosen = r;
    break;
  }
  if (!chosen) return sendJson(res, 404, { error: "Not found" });
  try {
    if (
      (req.method === "POST" || req.method === "PUT") &&
      !chosen.rawBody &&
      !/^application\/json\b/i.test(req.headers["content-type"] ?? "")
    ) {
      throw new ApiError(415, "Content-Type must be application/json");
    }
    const off = await chosen.handler(createCtx(req, url, params));
    if (!isReply(off)) return sendJson(res, 200, off);
    const status = off.status ?? 200;
    const { body } = off;
    if (Buffer.isBuffer(body) || typeof body === "string")
      return send(res, status, off.contentType ?? "application/octet-stream", body, off.headers);
    return send(
      res,
      status,
      off.contentType ?? "application/json; charset=utf-8",
      JSON.stringify(body ?? null),
      off.headers,
    );
  } catch (error) {
    if (error instanceof ApiError) return sendJson(res, error.status, { error: error.message });
    // The route pattern, not the filled-in URL: that can contain an id or query string.
    console.error(`${chosen.method} ${chosen.path}:`, error);
    return sendJson(res, 500, { error: "Internal error" });
  }
}

async function file(req: IncomingMessage, res: ServerResponse, name: string, dir: string, index = false) {
  const notFound = () => send(res, 404, "text/plain; charset=utf-8", "Not found");
  if (req.method !== "GET" && req.method !== "HEAD") return notFound();
  try {
    name = decodeURIComponent(name);
  } catch {
    return notFound();
  }
  if (name.includes("\0")) return notFound();
  const p = join(dir, index && name === "/" ? "index.html" : name);
  const rel = relative(dir, p);
  if (rel === ".." || rel.startsWith(`..${sep}`) || isAbsolute(rel)) return notFound();
  try {
    send(res, 200, TYPES[extname(p).toLowerCase()] ?? "application/octet-stream", await readFile(p));
  } catch {
    notFound();
  }
}

function errors(res: ServerResponse, error: unknown) {
  console.error(error);
  if (!res.headersSent) sendJson(res, 500, { error: "Internal error" });
  else res.destroy();
}

export async function startServer(o: ServerOptions): Promise<{ url: string; close(): Promise<void> }> {
  await mkdir(o.dataDir, { recursive: true });
  const webDir = o.webDir ?? DEFAULT_WEBDIR;
  const server = createServer((req, res) => {
    // No synchronous error in the handling may end the process.
    try {
      // Only requests that come from the app's own page: this keeps DNS rebinding and
      // cross-site requests from another website out.
      const { port } = server.address() as { port: number };
      const allowed = [`127.0.0.1:${port}`, `localhost:${port}`];
      const origin = req.headers.origin;
      if (
        !allowed.includes(req.headers.host ?? "") ||
        (origin !== undefined && !allowed.some((h) => origin === `http://${h}`))
      ) {
        return sendJson(res, 403, { error: "Forbidden" });
      }
      // Only a path: `//` and `//host/path` are not paths and are not silently read as a URL
      // with a different host.
      const goal = req.url ?? "/";
      let url: URL;
      try {
        if (!goal.startsWith("/") || goal.startsWith("//")) throw new Error("no path");
        url = new URL(goal, `http://127.0.0.1:${port}`);
      } catch {
        return sendJson(res, 400, { error: "Invalid request" });
      }
      const custom = o.static?.find((x) => url.pathname.startsWith(x.prefix));
      const resolve = url.pathname.startsWith("/api/")
        ? api(req, res, url, o.routes)
        : custom
          ? file(req, res, url.pathname.slice(custom.prefix.length), custom.dir())
          : file(req, res, url.pathname, webDir, true);
      resolve.catch((error) => errors(res, error));
    } catch (error) {
      errors(res, error);
    }
  });
  await new Promise<void>((resolve, error) => {
    server.once("error", error);
    server.listen(o.port ?? 0, "127.0.0.1", () => {
      server.off("error", error);
      resolve();
    });
  });
  const { port } = server.address() as { port: number };
  return {
    url: `http://127.0.0.1:${port}`,
    close: () =>
      new Promise<void>((resolve) => {
        server.close(() => resolve());
        server.closeAllConnections();
      }),
  };
}
