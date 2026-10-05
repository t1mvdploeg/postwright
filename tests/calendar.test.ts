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

  it("is rescheduled to another day with the same clock time, also across midnight and a month boundary", () => {
    const evening = "2026-10-30T23:30:00+00:00";
    const moved = rescheduleToDay(evening, "2026-11-02")!;
    expect(moved).toBe("2026-11-02T23:30:00+00:00");
    expect(dayOf(evening)).toBe("2026-10-30");
    expect(dayOf(moved)).toBe("2026-11-02");
    expect(nextMonth(2026, 11, 1)).toEqual({ year: 2027, month: 0 });
    expect(nextMonth(2026, 0, -1)).toEqual({ year: 2025, month: 11 });
  });
});

describe("upcomingWeeks", () => {
  it("starts at the Monday of this week and runs across a month boundary", () => {
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
  it("counts Monday to Friday, also across a month boundary and the new year", () => {
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
  it("adds days to dates, across a month boundary and the year boundary", () => {
    expect(plusDays("2026-10-24", 2)).toBe("2026-10-26");
    expect(plusDays("2026-12-31", 1)).toBe("2027-01-01");
    expect(plusDays("2026-03-01", -1)).toBe("2026-02-28");
  });

  // `calendar.js` re-exports these two from the DOM-free `web/date.js` (split off so that
  // other screens do not have to load the whole studio module graph): literally the same
  // function, no second implementation.
  it("are literally the functions from web/date.js", async () => {
    const date = await import("../src/web/date.js");
    expect(realDate).toBe(date.realDate);
    expect(plusDays).toBe(date.plusDays);
  });
});

// "Last publication" on the Overview counts in local calendar days.
describe("daysAgo", () => {
  it("yesterday 23.00 counts as yesterday at 08.00, not as today", () => {
    expect(daysAgo("2026-09-23T23:00:00Z", new Date("2026-09-24T08:00:00Z"))).toBe(1);
    expect(daysAgo("2026-09-24T06:30:00Z", new Date("2026-09-24T21:00:00Z"))).toBe(0);
    // A day boundary: 23:59 and 00:01 are different days, 00:00 and 23:59 are the same day.
    expect(daysAgo("2026-09-23T23:59:00Z", new Date("2026-09-24T00:01:00Z"))).toBe(1);
    expect(daysAgo("2026-09-24T00:00:00Z", new Date("2026-09-24T23:59:00Z"))).toBe(0);
  });
  it("counts in whole days across a month boundary", () => {
    expect(daysAgo("2026-10-24T10:00:00Z", new Date("2026-10-26T10:00:00Z"))).toBe(2);
    expect(daysAgo("2026-09-01T10:00:00Z", new Date("2026-09-24T10:00:00Z"))).toBe(23);
    expect(daysAgo("2026-09-28T10:00:00Z", new Date("2026-10-02T10:00:00Z"))).toBe(4);
  });
});
