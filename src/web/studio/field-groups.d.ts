// Type declaration next to field-groups.js (plain browser ESM, no build step).
export function groupFields<T extends { id: string }>(fields: T[]): Array<{ number: string | null; fields: T[] }>;
