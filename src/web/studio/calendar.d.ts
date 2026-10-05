// Type declaration next to calendar.js (plain browser ESM, no build step).
export function monthGrid(year: number, month: number): Array<Array<{ date: string; inMonth: boolean }>>;
export function isoWeek(date: string): { year: number; week: number };
export function dayOf(iso: string): string;
export function realDate(d: string): boolean;
export function plusDays(date: string, n: number): string;
export function daysAgo(iso: string, now?: Date): number;
export function rescheduleToDay(iso: string, newDay: string): string | null;
export function nextMonth(year: number, month: number, step: number): { year: number; month: number };
export function upcomingWeeks(
  today: string,
  n: number,
): Array<{ year: number; week: number; monday: string; sunday: string }>;
export function choosePeriod(
  current: { from: string | null; to: string | null },
  date: string,
  options?: { extend?: boolean },
): { from: string | null; to: string | null };
export function defaultCount(from: string, to: string): number;
export function workdayCount(from: string, to: string): number;
