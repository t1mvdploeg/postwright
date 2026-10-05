// Rendering in the browser:
// preview in a sandboxed iframe, export via SVG foreignObject → canvas → PNG/JPEG. Both
// get exactly the same HTML and CSS from `buildImage`.

/** The image as a standalone HTML document, for an iframe. */
export function documentHtml(image) {
  return `<!doctype html><html lang="en"><head><meta charset="utf-8"><style>${image.css}</style></head><body style="margin:0;overflow:hidden">${image.html}</body></html>`;
}

/**
 * The image as an SVG with a foreignObject. The markup must be XML (an SVG image is read
 * as XML), so the HTML fragment goes through DOMParser and XMLSerializer; the CSS sits in
 * a CDATA block so that `>` and `&` in it break nothing.
 */
export function toSvg(image) {
  const doc = new DOMParser().parseFromString(`<!doctype html><html><body>${image.html}</body></html>`, "text/html");
  const xml = new XMLSerializer();
  const content = [...doc.body.childNodes].map((n) => xml.serializeToString(n)).join("");
  const css = image.css.replaceAll("]]>", "]]]]><![CDATA[>");
  const { width: b, height: h } = image;
  return (
    `<svg xmlns="http://www.w3.org/2000/svg" width="${b}" height="${h}" viewBox="0 0 ${b} ${h}">` +
    `<foreignObject x="0" y="0" width="${b}" height="${h}">` +
    `<div xmlns="http://www.w3.org/1999/xhtml" style="width:${b}px;height:${h}px;overflow:hidden"><style><![CDATA[${css}]]></style>${content}</div>` +
    "</foreignObject></svg>"
  );
}

export class ExportError extends Error {}

/** The image on a canvas of the real size (or `scale` times as large). */
export async function toCanvas(image, scale = 1) {
  const img = new Image();
  img.src = `data:image/svg+xml;charset=utf-8,${encodeURIComponent(toSvg(image))}`;
  try {
    await img.decode();
  } catch {
    throw new ExportError("The image could not be built. Try again, or use Chrome, Edge or Firefox.");
  }
  const c = document.createElement("canvas");
  c.width = Math.round(image.width * scale);
  c.height = Math.round(image.height * scale);
  const ctx = c.getContext("2d");
  ctx.drawImage(img, 0, 0, c.width, c.height);
  // Safari sometimes renders an embedded font only the second time; rendering twice costs
  // little.
  await new Promise((ok) => setTimeout(ok, 30));
  ctx.clearRect(0, 0, c.width, c.height);
  ctx.drawImage(img, 0, 0, c.width, c.height);
  return c;
}

/**
 * The image as a PNG or JPEG blob. A browser that marks the canvas as "tainted" after a
 * foreignObject (older Safari) refuses here; that becomes a readable message instead of a
 * silent failure.
 */
export async function renderToBlob(image, type = "image/png", quality = 0.92) {
  const c = await toCanvas(image);
  if (type === "image/jpeg") {
    // JPEG has no transparency: a white ground first, then the image on top.
    const white = document.createElement("canvas");
    white.width = c.width;
    white.height = c.height;
    const ctx = white.getContext("2d");
    ctx.fillStyle = "#fff";
    ctx.fillRect(0, 0, white.width, white.height);
    ctx.drawImage(c, 0, 0);
    return canvasToBlob(white, type, quality);
  }
  return canvasToBlob(c, type, quality);
}

function canvasToBlob(c, type, quality) {
  return new Promise((ok, no) => {
    try {
      c.toBlob(
        (blob) =>
          blob ? ok(blob) : no(new ExportError("Export did not work in this browser. Use Chrome, Edge or Firefox.")),
        type,
        quality,
      );
    } catch {
      no(new ExportError("Exporting does not work in this browser. Use Chrome, Edge or Firefox."));
    }
  });
}

/** A blob or bytes as a download with a file name. */
export function download(content, name, type = "application/octet-stream") {
  const blob = content instanceof Blob ? content : new Blob([content], { type });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = name;
  document.body.append(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 10_000);
}

/**
 * Shows an image in `holder`, scaled to the width (and at most `maxHeight`) of the holder.
 * The iframe has `sandbox="allow-same-origin"` without `allow-scripts`: no script ever
 * runs in the image, and the studio can still measure the image (overflow.js). That is the
 * safe combination; only both together would let the iframe break out of its sandbox.
 */
export function showPreview(holder, image, { maxHeight = 640, label = "" } = {}) {
  let iframe = holder.querySelector("iframe");
  if (!iframe) {
    iframe = document.createElement("iframe");
    iframe.setAttribute("sandbox", "allow-same-origin");
    iframe.setAttribute("tabindex", "-1");
    iframe.setAttribute("aria-hidden", "true");
    iframe.className = "studio-preview-iframe";
    holder.append(iframe);
  }
  const available = Math.max(120, holder.clientWidth || 480);
  const scale = Math.min(available / image.width, maxHeight / image.height, 1);
  iframe.style.width = `${image.width}px`;
  iframe.style.height = `${image.height}px`;
  iframe.style.transform = `scale(${scale})`;
  holder.style.height = `${Math.round(image.height * scale)}px`;
  holder.style.setProperty("--scale", String(scale));
  holder.setAttribute("role", "img");
  if (label) holder.setAttribute("aria-label", label);
  const html = documentHtml(image);
  if (iframe.srcdoc !== html) iframe.srcdoc = html;
  return scale;
}
