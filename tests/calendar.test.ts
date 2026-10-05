// Marketing studio: month grid, week numbers, rescheduling.
import { describe, it, expect } from "vitest";
import {
  workdayCount,
  daysAgo,
  dayOf,
  realDate,
  isoWeek,
  choosePeriod,
  upcomingWeeks,
  monthGrid,
  plusDays,
  defaultCount,
  rescheduleToDay,
  nextMonth,
} from "../src/web/studio/calendar.js";

describe("calendar", () => {
  it("builds a month from Monday to Sunday with padded days", () => {
    const october = monthGrid(2026, 9);
    expect(october[0][0]).toEqual({ date: "2026-09-28", inMonth: false });
    expect(october[0][3]).toEqual({ date: "2026-10-01", inMonth: true });
    expect(october.at(-1)!.at(-1)!.date).toBe("2026-11-01");
    expect(october.every((w) => w.length === 7)).toBe(true);
    // February 2027 starts on a Monday and has exactly four weeks.
    expect(monthGrid(2027, 1)).toHaveLength(4);
  });

  it("calculates ISO weeks, also around the new year", () => {
    expect(isoWeek("2026-10-06")).toEqual({ year: 2026, week: 41 });
    expect(isoWeek("2027-01-01")).toEqual({ year: 2026, week: 53 });
    expect(isoWeek("2027-01-04")).toEqual({ year: 2027, week: 1 });
  });

  it("is rescheduled to another day with the same clock time, also across the change to winter time", () => {
    const summer = "2026-10-23T08:30:00+02:00";
    const winter = rescheduleToDay(summer, "2026-10-27")!;
    expect(winter).toBe("2026-10-27T08:30:00+01:00");
    expect(dayOf(winter)).toBe("2026-10-27");
    expect(nextMonth(2026, 11, 1)).toEqual({ year: 2027, month: 0 });
    expect(nextMonth(2026, 0, -1)).toEqual({ year: 2025, month: 11 });
  });
});

describe("upcomingWeeks", () => {
  it("starts at the Monday of this week and runs across winter time", () => {
    expect(upcomingWeeks("2026-10-21", 2)).toEqual([
      { year: 2026, week: 43, monday: "2026-10-19", sunday: "2026-10-25" },
      { year: 2026, week: 44, monday: "2026-10-26", sunday: "2026-11-01" },
    ]);
  });
  it("knows week 53 of 2026 and a Sunday as today", () => {
    expect(upcomingWeeks("2026-12-30", 2).map((w) => [w.year, w.week, w.monday])).toEqual([
      [2026, 53, "2026-12-28"],
      [2027, 1, "2027-01-04"],
    ]);
    expect(upcomingWeeks("2026-10-25", 1)[0].monday).toBe("2026-10-19");
  });
});

describe("choosePeriod", () => {
  const empty = { from: null, to: null };
  it("first click start, second click end, also in reverse order", () => {
    const een = choosePeriod(empty, "2026-10-14");
    expect(een).toEqual({ from: "2026-10-14", to: null });
    expect(choosePeriod(een, "2026-10-20")).toEqual({ from: "2026-10-14", to: "2026-10-20" });
    expect(choosePeriod(een, "2026-10-02")).toEqual({ from: "2026-10-02", to: "2026-10-14" });
  });
  it("a click on a whole period starts over; shift extends, also across a month boundary", () => {
    const integer = { from: "2026-10-14", to: "2026-10-20" };
    expect(choosePeriod(integer, "2026-10-16")).toEqual({ from: "2026-10-16", to: null });
    expect(choosePeriod(integer, "2026-11-03", { extend: true })).toEqual({ from: "2026-10-14", to: "2026-11-03" });
    expect(choosePeriod(integer, "2026-10-01", { extend: true })).toEqual({ from: "2026-10-01", to: "2026-10-20" });
    expect(choosePeriod(integer, "2026-10-16", { extend: true })).toEqual(integer);
    expect(choosePeriod(empty, "2026-10-16", { extend: true })).toEqual({ from: "2026-10-16", to: null });
  });
});

describe("defaultCount", () => {
  it("two per week, at least one, at most twenty", () => {
    expect(defaultCount("2026-10-05", "2026-10-11")).toBe(2);
    expect(defaultCount("2026-10-05", "2026-10-05")).toBe(1);
    expect(defaultCount("2026-10-05", "2026-11-01")).toBe(8);
    expect(defaultCount("2026-10-01", "2026-12-31")).toBe(20);
  });
});

describe("workdayCount", () => {
  it("counts Monday to Friday, also across winter time and the new year", () => {
    expect(workdayCount("2026-10-05", "2026-10-11")).toBe(5);
    expect(workdayCount("2026-10-10", "2026-10-11")).toBe(0);
    expect(workdayCount("2026-10-14", "2026-10-14")).toBe(1);
    expect(workdayCount("2026-10-23", "2026-10-27")).toBe(3);
    expect(workdayCount("2026-12-28", "2027-01-08")).toBe(10);
    expect(workdayCount("2026-10-20", "2026-10-14")).toBe(0);
  });
});

// One version of the date helpers for server and browser (final review, A9).
describe("realDate and plusDays", () => {
  it("lets only existing calendar dates through", () => {
    expect(realDate("2026-02-28")).toBe(true);
    expect(realDate("2028-02-29")).toBe(true);
    expect(realDate("2026-02-29")).toBe(false);
    expect(realDate("2026-02-30")).toBe(false);
    expect(realDate("2026-13-01")).toBe(false);
    expect(realDate("2026-10-00")).toBe(false);
    expect(realDate("6-10-2026")).toBe(false);
  });
  it("adds days to dates, across winter time and the year boundary", () => {
    expect(plusDays("2026-10-24", 2)).toBe("2026-10-26");
    expect(plusDays("2026-12-31", 1)).toBe("2027-01-01");
    expect(plusDays("2026-03-01", -1)).toBe("2026-02-28");
  });

  // Final review B3, round 2, fix 8: `calendar.js` now re-exports these two from the new,
  // DOM-free `web/date.js` (split off so that the Invoicing screens and `company.js` do not
  // have to load the whole marketing studio module graph) — literally the same function, no
  // second implementation.
  it("are literally the functions from web/date.js", async () => {
    const date = await import("../src/web/date.js");
    expect(realDate).toBe(date.realDate);
    expect(plusDays).toBe(date.plusDays);
  });
});

// "Last publication" on the Overview counts in calendar days in the Netherlands (final
// review, A8).
describe("daysAgo", () => {
  it("yesterday 23.00 counts as yesterday at 08.00, not as today", () => {
    // 23 September 23:00 summer time is 21:00 UTC; 24 September 08:00 is 06:00 UTC.
    expect(daysAgo("2026-09-23T21:00:00Z", new Date("2026-09-24T06:00:00Z"))).toBe(1);
    expect(daysAgo("2026-09-24T06:30:00Z", new Date("2026-09-24T21:00:00Z"))).toBe(0);
    // Midnight in the Netherlands is 22:00 UTC: 23:30 UTC on the 23rd is already the 24th.
    expect(daysAgo("2026-09-23T22:30:00Z", new Date("2026-09-24T06:00:00Z"))).toBe(0);
  });
  it("counts across the change to winter time in whole days", () => {
    expect(daysAgo("2026-10-24T10:00:00Z", new Date("2026-10-26T10:00:00Z"))).toBe(2);
    expect(daysAgo("2026-09-01T10:00:00Z", new Date("2026-09-24T10:00:00Z"))).toBe(23);
  });
});
