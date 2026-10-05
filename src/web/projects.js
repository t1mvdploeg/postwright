// Which project the studio opens: the one this browser remembers, or the first one.

/**
 * @param {{ slug: string, name: string }[]} projects the projects the server knows
 * @param {string | null} remembered the slug from `activeProject()`
 * @returns {string | null} a slug that exists in `projects`; null when there is no project at all
 */
export function pickProject(projects, remembered) {
  return projects.find((p) => p.slug === remembered)?.slug ?? projects[0]?.slug ?? null;
}
