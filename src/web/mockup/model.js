// The illustrative planning week follows the sample content, not the device clock.
export function weekDates(offset = 0) {
  return Array.from({ length: 7 }, (_, day) =>
    new Date(Date.UTC(2026, 9, 5 + offset * 7 + day, 12)).toISOString().slice(0, 10),
  );
}
