// Marketingstudio — renderen in de browser:
// voorbeeld in een sandbox-iframe, export via SVG-foreignObject → canvas → PNG/JPEG. Beide krijgen
// exact dezelfde HTML en CSS uit `bouwBeeld`.

/** Het beeld als los HTML-document, voor een iframe. */
export function documentHtml(beeld) {
  return `<!doctype html><html lang="nl"><head><meta charset="utf-8"><style>${beeld.css}</style></head><body style="margin:0;overflow:hidden">${beeld.html}</body></html>`;
}

/**
 * Het beeld als SVG met een foreignObject. De markup moet XML zijn (een SVG-afbeelding wordt als
 * XML gelezen), dus het HTML-fragment gaat door DOMParser en XMLSerializer; de CSS staat in een
 * CDATA-blok zodat `>` en `&` erin niets breken.
 */
export function naarSvg(beeld) {
  const doc = new DOMParser().parseFromString(`<!doctype html><html><body>${beeld.html}</body></html>`, "text/html");
  const xml = new XMLSerializer();
  const inhoud = [...doc.body.childNodes].map((n) => xml.serializeToString(n)).join("");
  const css = beeld.css.replaceAll("]]>", "]]]]><![CDATA[>");
  const { breedte: b, hoogte: h } = beeld;
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${b}" height="${h}" viewBox="0 0 ${b} ${h}">`
    + `<foreignObject x="0" y="0" width="${b}" height="${h}">`
    + `<div xmlns="http://www.w3.org/1999/xhtml" style="width:${b}px;height:${h}px;overflow:hidden"><style><![CDATA[${css}]]></style>${inhoud}</div>`
    + "</foreignObject></svg>";
}

export class ExportFout extends Error {}

/** Het beeld op een canvas van de echte maat (of `schaal` keer zo groot). */
export async function naarCanvas(beeld, schaal = 1) {
  const img = new Image();
  img.src = `data:image/svg+xml;charset=utf-8,${encodeURIComponent(naarSvg(beeld))}`;
  try { await img.decode(); } catch { throw new ExportFout("Het beeld kon niet worden opgebouwd. Probeer het opnieuw, of gebruik Chrome, Edge of Firefox."); }
  const c = document.createElement("canvas");
  c.width = Math.round(beeld.breedte * schaal);
  c.height = Math.round(beeld.hoogte * schaal);
  const ctx = c.getContext("2d");
  ctx.drawImage(img, 0, 0, c.width, c.height);
  // Safari tekent een ingebed lettertype soms pas bij de tweede keer; tweemaal tekenen kost weinig.
  await new Promise((ok) => setTimeout(ok, 30));
  ctx.clearRect(0, 0, c.width, c.height);
  ctx.drawImage(img, 0, 0, c.width, c.height);
  return c;
}

/**
 * Het beeld als PNG- of JPEG-blob. Een browser die het canvas na een foreignObject als "vervuild"
 * markeert (oudere Safari), weigert hier; dat wordt een leesbare melding in plaats van een stille fout.
 */
export async function naarBlob(beeld, type = "image/png", kwaliteit = 0.92) {
  const c = await naarCanvas(beeld);
  if (type === "image/jpeg") {
    // JPEG kent geen transparantie: eerst een witte ondergrond, dan het beeld erop.
    const wit = document.createElement("canvas");
    wit.width = c.width; wit.height = c.height;
    const ctx = wit.getContext("2d");
    ctx.fillStyle = "#fff";
    ctx.fillRect(0, 0, wit.width, wit.height);
    ctx.drawImage(c, 0, 0);
    return canvasNaarBlob(wit, type, kwaliteit);
  }
  return canvasNaarBlob(c, type, kwaliteit);
}

function canvasNaarBlob(c, type, kwaliteit) {
  return new Promise((ok, nee) => {
    try {
      c.toBlob((blob) => (blob ? ok(blob) : nee(new ExportFout("Exporteren lukte niet in deze browser. Gebruik Chrome, Edge of Firefox."))), type, kwaliteit);
    } catch {
      nee(new ExportFout("Exporteren lukt niet in deze browser. Gebruik Chrome, Edge of Firefox."));
    }
  });
}

/** Een blob of bytes als download met een bestandsnaam. */
export function download(inhoud, naam, type = "application/octet-stream") {
  const blob = inhoud instanceof Blob ? inhoud : new Blob([inhoud], { type });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = naam;
  document.body.append(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 10_000);
}

/**
 * Toont een beeld in `houder`, geschaald tot de breedte (en hooguit `maxHoogte`) van de houder. Het
 * iframe heeft `sandbox="allow-same-origin"` zonder `allow-scripts`: er draait nooit script in het
 * beeld, en de studio kan het beeld wel meten (overloop.js). Dat is de veilige combinatie; alleen
 * beide samen zou het iframe uit zijn sandbox laten breken.
 */
export function toonVoorbeeld(houder, beeld, { maxHoogte = 640, label = "" } = {}) {
  let iframe = houder.querySelector("iframe");
  if (!iframe) {
    iframe = document.createElement("iframe");
    iframe.setAttribute("sandbox", "allow-same-origin");
    iframe.setAttribute("tabindex", "-1");
    iframe.setAttribute("aria-hidden", "true");
    iframe.className = "studio-voorbeeld-iframe";
    houder.append(iframe);
  }
  const beschikbaar = Math.max(120, houder.clientWidth || 480);
  const schaal = Math.min(beschikbaar / beeld.breedte, maxHoogte / beeld.hoogte, 1);
  iframe.style.width = `${beeld.breedte}px`;
  iframe.style.height = `${beeld.hoogte}px`;
  iframe.style.transform = `scale(${schaal})`;
  houder.style.height = `${Math.round(beeld.hoogte * schaal)}px`;
  houder.style.setProperty("--schaal", String(schaal));
  houder.setAttribute("role", "img");
  if (label) houder.setAttribute("aria-label", label);
  const html = documentHtml(beeld);
  if (iframe.srcdoc !== html) iframe.srcdoc = html;
  return schaal;
}
