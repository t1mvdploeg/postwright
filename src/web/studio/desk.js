// Which posts lie on the desk, and which rely on a fact that can no longer be used. Shared by
// the overview and the planner.
import { factUsable } from "./brand-check.js";

/**
 * The `n` posts worked on most recently; the archive is left out.
 * @template {{ status: string, updated: string }} P
 * @param {P[]} posts
 * @param {number} n
 * @returns {P[]}
 */
export function deskOf(posts, n) {
  return posts
    .filter((p) => p.status !== "archived")
    .sort((a, b) => b.updated.localeCompare(a.updated))
    .slice(0, n);
}

/**
 * The ids of the posts, archive left out, with a fact that is a draft, expired, withdrawn or deleted.
 * @param {Array<{ id: string, status: string, facts: string[] }>} posts
 * @param {Array<{ id: string, status: string, validUntil?: string | null }>} facts
 * @param {string} today YYYY-MM-DD
 * @returns {Set<string>}
 */
export function factProblems(posts, facts, today) {
  const usable = new Set(facts.filter((f) => factUsable(f, today)).map((f) => f.id));
  return new Set(
    posts.filter((p) => p.status !== "archived" && p.facts.some((id) => !usable.has(id))).map((p) => p.id),
  );
}
