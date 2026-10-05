// The calendar export (RFC 5545). Every scheduled post becomes a
// fifteen-minute appointment with a reminder beforehand. The UID is fixed per post, so
// importing again updates the appointment instead of duplicating it. A post that is no
// longer scheduled (back to draft or archived) is included as STATUS:CANCELLED with a
// higher SEQUENCE, so that importing again removes the appointment from the calendar. A
// deleted post leaves nothing behind to cancel. Times go into the calendar as UTC ("…Z");
// the calendar app converts them to the reader's time zone itself.

const enc = new TextEncoder();

/** Escaping per RFC 5545 §3.3.11: backslash, semicolon, comma and line breaks. */
export function icsText(t) {
  return String(t ?? "")
    .replace(/\\/g, "\\\\")
    .replace(/;/g, "\\;")
    .replace(/,/g, "\\,")
    .replace(/\r?\n/g, "\\n");
}

/**
 * Folds a line at 75 octets (RFC 5545 §3.1): continuation lines start with one space.
 * Never in the middle of a UTF-8 character, so counting is per character, in bytes.
 */
export function fold(line) {
  const off = [];
  let current = "";
  let bytes = 0;
  const limit = () => (off.length === 0 ? 75 : 74);
  for (const render of line) {
    const n = enc.encode(render).length;
    if (bytes + n > limit()) {
      off.push(current);
      current = "";
      bytes = 0;
    }
    current += render;
    bytes += n;
  }
  off.push(current);
  return off.map((r, i) => (i === 0 ? r : ` ${r}`)).join("\r\n");
}

/** A moment as a UTC timestamp: 20261006T063000Z. */
export function icsTime(moment) {
  const d = new Date(moment);
  if (Number.isNaN(d.getTime())) throw new Error(`Invalid moment: ${moment}`);
  return d
    .toISOString()
    .replace(/[-:]/g, "")
    .replace(/\.\d{3}/, "");
}

/**
 * @param {Array<{ id: string, title: string, scheduled: string, status?: string, caption?: Record<string, string>, headline?: string }>} posts
 * @param {{ baseUrl: string, brandName: string, now?: Date }} options
 * @returns {string}
 */
export function createIcs(posts, { baseUrl, brandName, now = new Date() }) {
  const lines = [
    "BEGIN:VCALENDAR",
    "VERSION:2.0",
    "PRODID:-//Postwright//Postwright//EN",
    "CALSCALE:GREGORIAN",
    "METHOD:PUBLISH",
    `X-WR-CALNAME:${icsText(`Marketing ${brandName}`)}`,
  ];
  const stamp = icsTime(now);
  for (const p of posts) {
    if (!p.scheduled) continue;
    const begin = new Date(p.scheduled);
    const end = new Date(begin.getTime() + 15 * 60 * 1000);
    const text = Object.values(p.caption ?? {}).find((t) => t && t.trim()) ?? "";
    const description = [
      text.length > 300 ? `${text.slice(0, 300)}…` : text,
      `Open in the studio: ${baseUrl}/#editor/${p.id}`,
    ]
      .filter(Boolean)
      .join("\n\n");
    const withdrawn = p.status === "draft" || p.status === "archived";
    lines.push(
      "BEGIN:VEVENT",
      `UID:${p.id}@postwright.local`,
      `SEQUENCE:${withdrawn ? 1 : 0}`,
      ...(withdrawn ? ["STATUS:CANCELLED"] : []),
      `DTSTAMP:${stamp}`,
      `DTSTART:${icsTime(begin)}`,
      `DTEND:${icsTime(end)}`,
      `SUMMARY:${icsText(`Post: ${p.title}`)}`,
      `DESCRIPTION:${icsText(description)}`,
      `URL:${baseUrl}/#editor/${p.id}`,
      ...(withdrawn
        ? []
        : [
            "BEGIN:VALARM",
            "ACTION:DISPLAY",
            `DESCRIPTION:${icsText(`Post today: ${p.title}`)}`,
            "TRIGGER:-PT15M",
            "END:VALARM",
          ]),
      "END:VEVENT",
    );
  }
  lines.push("END:VCALENDAR");
  return lines.map(fold).join("\r\n") + "\r\n";
}
