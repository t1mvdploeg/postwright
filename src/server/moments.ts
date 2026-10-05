// The studio's calendar: a fixed list of annual days that give a reason to post, plus the
// user's own moments, which they put in `<data folder>/marketing/moments.json`.

export interface Moment {
  /** Annual: `<year>-<month>-<day>`. Custom moments choose their own key. */
  key: string;
  /** YYYY-MM-DD. */
  date: string;
  title: string;
  /** One sentence with an angle for a post. */
  sentence: string;
  kind: "day" | "custom";
}

const YEARLY: { monthDay: string; title: string; sentence: string }[] = [
  { monthDay: "01-01", title: "New Year's Day", sentence: "A fresh start: share what you are building this year." },
  { monthDay: "03-08", title: "International Women's Day", sentence: "Celebrate the women behind your work." },
  { monthDay: "04-21", title: "World Creativity and Innovation Day", sentence: "Show one idea you tried this year." },
  { monthDay: "04-22", title: "Earth Day", sentence: "Share one concrete thing you do, not a promise." },
  { monthDay: "07-17", title: "World Emoji Day", sentence: "A lighter post: your brand in three emoji." },
  {
    monthDay: "09-30",
    title: "International Podcast Day",
    sentence: "Recommend one episode your audience would like.",
  },
  { monthDay: "10-10", title: "World Mental Health Day", sentence: "Share how your team keeps work sustainable." },
  { monthDay: "12-25", title: "Christmas Day", sentence: "A short thank-you to customers and partners." },
];

/**
 * The moments in [from, to] (YYYY-MM-DD, both inclusive): the annual days of every year
 * the range touches, plus the custom moments, sorted by date and then by key.
 */
export function allMoments(from: string, to: string, custom: Moment[] = []): Moment[] {
  const list: Moment[] = [...custom];
  for (let year = Number(from.slice(0, 4)); year <= Number(to.slice(0, 4)); year++) {
    for (const { monthDay, title, sentence } of YEARLY) {
      list.push({ key: `${year}-${monthDay}`, date: `${year}-${monthDay}`, title, sentence, kind: "day" });
    }
  }
  return list
    .filter((m) => m.date >= from && m.date <= to)
    .sort((a, b) => a.date.localeCompare(b.date) || a.key.localeCompare(b.key));
}
