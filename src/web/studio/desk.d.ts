/** The `n` posts worked on most recently; the archive is left out. */
export function deskOf<P extends { status: string; updated: string }>(posts: P[], n: number): P[];
/** The ids of the posts, archive left out, with a fact that is a draft, expired, withdrawn or deleted. */
export function factProblems(
  posts: Array<{ id: string; status: string; facts: string[] }>,
  facts: Array<{ id: string; status: string; validUntil?: string | null }>,
  today: string,
): Set<string>;
