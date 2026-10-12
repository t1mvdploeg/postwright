export type LinkAction = "stay" | "external" | "refuse";

/**
 * What the window does with a link: its own studio stays in the window, another site goes
 * to the system browser, and every other scheme is refused.
 */
export function linkAction(url: string, origin: string): LinkAction {
  let target: URL;
  try {
    target = new URL(url);
  } catch {
    return "refuse";
  }
  if (target.origin === origin) return "stay";
  return target.protocol === "https:" || target.protocol === "http:" ? "external" : "refuse";
}
