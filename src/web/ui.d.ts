// Type declaration next to ui.js (plain browser ESM, no build step); only what the tests
// use.
export function debounce<A extends unknown[]>(fn: (...a: A) => void, ms: number): (...a: A) => void;
export function api(path: string, options?: { method?: string; body?: unknown; signal?: AbortSignal }): Promise<any>;
export function activeProject(): string | null;
export function setActiveProject(slug: string): void;
export function projectHeaders(): Record<string, string>;
