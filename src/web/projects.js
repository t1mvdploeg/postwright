// Which project the studio opens: the one this browser remembers, or the first one.

/**
 * @param {{ slug: string, name: string }[]} projects the projects the server knows
 * @param {string | null} remembered the slug from `activeProject()`
 * @returns {string} a slug that exists in `projects`
 */
export function pickProject(projects, remembered) {
  return projects.some((p) => p.slug === remembered) ? remembered : projects[0].slug;
}
