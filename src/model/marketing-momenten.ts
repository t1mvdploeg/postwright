// De kalender van de studio: een vaste lijst jaarlijkse dagen als aanleiding voor een post, plus de
// eigen momenten die de gebruiker zelf in `<datamap>/marketing/momenten.json` zet.

export interface Moment {
  /** Jaarlijks: `<jaar>-<maand>-<dag>`. Eigen momenten kiezen zelf een sleutel. */
  sleutel: string;
  /** JJJJ-MM-DD. */
  datum: string;
  titel: string;
  /** Eén zin met een invalshoek voor een post. */
  zin: string;
  soort: "dag" | "eigen";
}

const JAARLIJKS: { maandDag: string; titel: string; zin: string }[] = [
  { maandDag: "01-01", titel: "New Year's Day", zin: "A fresh start: share what you are building this year." },
  { maandDag: "03-08", titel: "International Women's Day", zin: "Celebrate the women behind your work." },
  { maandDag: "04-21", titel: "World Creativity and Innovation Day", zin: "Show one idea you tried this year." },
  { maandDag: "04-22", titel: "Earth Day", zin: "Share one concrete thing you do, not a promise." },
  { maandDag: "07-17", titel: "World Emoji Day", zin: "A lighter post: your brand in three emoji." },
  { maandDag: "09-30", titel: "International Podcast Day", zin: "Recommend one episode your audience would like." },
  { maandDag: "10-10", titel: "World Mental Health Day", zin: "Share how your team keeps work sustainable." },
  { maandDag: "12-25", titel: "Christmas Day", zin: "A short thank-you to customers and partners." },
];

/**
 * De momenten in [van, tot] (JJJJ-MM-DD, beide inbegrepen): de jaarlijkse dagen van elk jaar dat het
 * bereik raakt, plus de eigen momenten, op datum en dan op sleutel gesorteerd.
 */
export function alleMomenten(van: string, tot: string, eigen: Moment[] = []): Moment[] {
  const lijst: Moment[] = [...eigen];
  for (let jaar = Number(van.slice(0, 4)); jaar <= Number(tot.slice(0, 4)); jaar++) {
    for (const { maandDag, titel, zin } of JAARLIJKS) {
      lijst.push({ sleutel: `${jaar}-${maandDag}`, datum: `${jaar}-${maandDag}`, titel, zin, soort: "dag" });
    }
  }
  return lijst
    .filter((m) => m.datum >= van && m.datum <= tot)
    .sort((a, b) => a.datum.localeCompare(b.datum) || a.sleutel.localeCompare(b.sleutel));
}

// Eén versie voor server en browser; hier her-geëxporteerd omdat de routes en tests hem hier halen.
export { plusDagen } from "../web/marketing/kalender.js";
