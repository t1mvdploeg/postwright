// Type declaration next to formats.js (plain browser ESM, no build step), so that the
// tests can import the module type-safely.

export type FormatKey =
  | "li-square"
  | "li-portrait"
  | "li-carousel"
  | "li-link"
  | "li-profile"
  | "li-company"
  | "ig-square"
  | "ig-portrait"
  | "story"
  | "wide";
export type Channel = "linkedin" | "instagram" | "x" | "facebook";
export type Shape = "banner" | "landscape" | "square" | "portrait" | "story";

export interface Rectangle {
  x: number;
  y: number;
  width: number;
  height: number;
}
export interface SafeZone extends Rectangle {
  reason: string;
}

export interface Format {
  key: FormatKey;
  name: string;
  channel: Channel;
  width: number;
  height: number;
  safeZones: SafeZone[];
  carousel?: boolean;
}

export const CHANNELS: Record<Channel, string>;
export const FORMATS: Format[];
export function format(key: string): Format;
export function shapeOf(f: Pick<Format, "width" | "height">): Shape;
export function slugOf(text: unknown, max?: number): string;
export function fileName(o: {
  brand?: string;
  campaign?: string;
  post?: string;
  format: string;
  slide?: number | null;
  extension?: string;
}): string;
export function overlaps(a: Rectangle, b: Rectangle, tolerance?: number): boolean;
export function channelsOf(post: { formats?: string[]; caption?: Record<string, string> }): string[];
