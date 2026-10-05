// Een aanvraag over node:http in plaats van fetch: fetch normaliseert het pad (`..`, `%2e%2e`) en laat de
// Host-kop niet overschrijven, en dan toetst een test van de bewaking niets meer.
import { request } from "node:http";
import type { IncomingHttpHeaders } from "node:http";

export interface RuwAntwoord {
  status: number;
  headers: IncomingHttpHeaders;
  tekst: string;
}

export function ruw(
  url: string,
  o: { pad: string; methode?: string; headers?: Record<string, string>; body?: string } = { pad: "/" },
): Promise<RuwAntwoord> {
  const { hostname, port } = new URL(url);
  return new Promise((klaar, fout) => {
    const r = request({ host: hostname, port, path: o.pad, method: o.methode ?? "GET", headers: o.headers }, (res) => {
      const blokken: Buffer[] = [];
      res.on("data", (b: Buffer) => blokken.push(b));
      res.on("end", () =>
        klaar({ status: res.statusCode ?? 0, headers: res.headers, tekst: Buffer.concat(blokken).toString("utf8") }),
      );
    });
    r.on("error", fout);
    r.end(o.body);
  });
}
