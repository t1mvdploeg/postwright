// Results per template, for the Overview and as direction for the ideas.
import type { Post } from "./schema.js";

export interface ResultEntry {
  template: string;
  posts: number;
  impressions: number;
  comments: number;
  clicks: number;
}

/**
 * Per template, the published posts with a result, published on or after `from`
 * (YYYY-MM-DD), summed up; an empty field counts as 0. Most posts first. An archived post
 * counts as long as it has a publication and a result: archiving leaves both in place.
 * Deliberate limitation: compares on the UTC date of publication; at most one day of
 * difference at the edge.
 */
export function resultsPerTemplate(posts: Post[], from: string): ResultEntry[] {
  const byTemplate = new Map<string, ResultEntry>();
  for (const p of posts) {
    if (p.status !== "published" && p.status !== "archived") continue;
    if (!p.result || !p.published || p.published.on.slice(0, 10) < from) continue;
    const r = byTemplate.get(p.template) ?? { template: p.template, posts: 0, impressions: 0, comments: 0, clicks: 0 };
    r.posts += 1;
    r.impressions += p.result.impressions ?? 0;
    r.comments += p.result.comments ?? 0;
    r.clicks += p.result.clicks ?? 0;
    byTemplate.set(p.template, r);
  }
  return [...byTemplate.values()].sort((a, b) => b.posts - a.posts || a.template.localeCompare(b.template));
}
