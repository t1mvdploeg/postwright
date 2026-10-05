// Type declaration next to ui.js (plain browser ESM, no build step); only what the tests
// use.
export function debounce<A extends unknown[]>(fn: (...a: A) => void, ms: number): (...a: A) => void;
