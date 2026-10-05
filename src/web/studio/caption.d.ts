// Type declaration next to caption.js (plain browser ESM, no build step).
export interface ChannelRules {
  name: string;
  maxCharacters: number;
  fold: number | null;
  maxHashtags: number | null;
  linkCounts?: number;
  place: string;
}
export interface Finding {
  level: "error" | "attention" | "ok";
  code: string;
  text: string;
  channel?: string;
  field?: string | null;
  slide?: number | null;
}
export const CHANNEL_RULES: Record<string, ChannelRules>;
export function countCharacters(text: unknown): number;
export function lengthFor(channel: string, text: unknown): number;
export function splitAtFold(channel: string, text: unknown): { above: string; below: string };
export function hashtags(text: unknown): { list: string[]; duplicate: string[]; truncated: string[] };
export function addUtm(
  link: unknown,
  utm?: { source?: string; medium?: string; campaign?: string; content?: string },
): string | null;
export function setUtmContent(text: unknown, id: string): string;
export function linksWithoutUtm(text: unknown): string[];
export function checkCaption(channel: string, text: unknown): Finding[];
