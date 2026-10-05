// A request over node:http instead of fetch: fetch normalises the path (`..`, `%2e%2e`) and
// does not let the Host header be overridden, and then a test of the guard checks nothing
// any more.
import { request } from "node:http";
import type { IncomingHttpHeaders } from "node:http";

export interface RawReply {
  status: number;
  headers: IncomingHttpHeaders;
  text: string;
}

export function raw(
  url: string,
  o: { path: string; method?: string; headers?: Record<string, string>; body?: string } = { path: "/" },
): Promise<RawReply> {
  const { hostname, port } = new URL(url);
  return new Promise((resolve, error) => {
    const r = request({ host: hostname, port, path: o.path, method: o.method ?? "GET", headers: o.headers }, (res) => {
      const blocks: Buffer[] = [];
      res.on("data", (b: Buffer) => blocks.push(b));
      res.on("end", () =>
        resolve({ status: res.statusCode ?? 0, headers: res.headers, text: Buffer.concat(blocks).toString("utf8") }),
      );
    });
    r.on("error", error);
    r.end(o.body);
  });
}
