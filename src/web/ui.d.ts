// Typedeclaratie naast ui.js (platte browser-ESM, geen build-stap); alleen wat de tests gebruiken.
export function debounce<A extends unknown[]>(fn: (...a: A) => void, ms: number): (...a: A) => void;
