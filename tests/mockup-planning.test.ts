import { expect, test } from "vitest";
import { weekDates } from "../src/web/mockup/model.js";

test("planner weeks keep seven consecutive dates across month and year boundaries", () => {
  expect(weekDates(-1)[0]).toBe("2026-09-28");
  expect(weekDates(0)).toEqual([
    "2026-10-05",
    "2026-10-06",
    "2026-10-07",
    "2026-10-08",
    "2026-10-09",
    "2026-10-10",
    "2026-10-11",
  ]);
  const yearBoundary = weekDates(12);
  expect(yearBoundary[0]).toBe("2026-12-28");
  expect(yearBoundary[6]).toBe("2027-01-03");
});
