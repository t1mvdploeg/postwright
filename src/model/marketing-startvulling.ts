// De voorbeeldinhoud voor een nieuwe gebruiker: feiten en teksten over Postwright zelf, en drie
// voorbeeldposts. De route `POST /api/startvulling` voegt ze toe; wat er al staat, blijft zoals het is.
// Feiten komen als concept binnen: de gebruiker loopt ze na en zet ze op actief.
import { SJABLONEN } from "../web/marketing/sjablonen.js";
import type { FeitInvoer, TekstInvoer } from "./marketing-schema.js";

export type Startfeit = Pick<FeitInvoer, "tekst" | "soort" | "bron">;

const site = (verwijzing: string) => ({ soort: "site" as const, verwijzing });

export const STARTFEITEN: Startfeit[] = [
  { soort: "product", tekst: `Postwright ships with ${SJABLONEN.length} post templates.`, bron: site("README.md") },
  { soort: "product", tekst: "Postwright exports PNG, PDF and ZIP in the browser.", bron: site("README.md") },
  { soort: "product", tekst: "Postwright runs on your own computer. There is no account.", bron: site("README.md") },
  { soort: "product", tekst: "Postwright is open source under the MIT licence.", bron: site("LICENSE") },
  {
    soort: "product",
    tekst: "Every post is checked against your brand kit before it can be scheduled.",
    bron: site("README.md"),
  },
];

export const STARTTEKSTEN: TekstInvoer[] = [
  { soort: "afsluiter", naam: "Call to action", tekst: "Try it yourself: two commands and you are making posts." },
  { soort: "afsluiter", naam: "Sign-off", tekst: "Made with Postwright." },
];

/**
 * Een voorbeeldpost. `feit`: de tekst van een startfeit waar de post aan gekoppeld wordt.
 * `inDagen`: over zoveel dagen ingepland; anders een concept.
 */
export interface Startpost {
  titel: string;
  sjabloon: string;
  inhoud: Record<string, string>;
  posttekst: string;
  altTekst: string;
  feit?: string;
  inDagen?: number;
}

export const STARTPOSTS: Startpost[] = [
  {
    titel: "Example: no account needed",
    sjabloon: "stelling",
    inhoud: {
      ondergrond: "blauw",
      kop: "Your posts. *Your computer.*",
      tekst: "Postwright runs locally. There is no account.",
      voetLinks: "Try it yourself",
      voetRechts: "Postwright",
      motief: "aan",
    },
    posttekst: "Postwright runs on your own computer. There is no account.",
    altTekst: "Statement: Your posts. Your computer.",
  },
  {
    titel: "Example: templates out of the box",
    sjabloon: "cijfer",
    inhoud: {
      ondergrond: "inkt",
      getal: String(SJABLONEN.length),
      eenheid: "post templates",
      kop: "Ready to use, *out of the box.*",
      bron: "Source: README",
    },
    posttekst: STARTFEITEN[0].tekst,
    altTekst: `The number ${SJABLONEN.length}: post templates that ship with Postwright.`,
    feit: STARTFEITEN[0].tekst,
  },
  {
    titel: "Example: from idea to scheduled post",
    sjabloon: "werkroute",
    inhoud: {
      kop: "From idea to *scheduled post.*",
      stap1: "Pick a template",
      stap1Tekst: "Start from a statement, a number or a route.",
      stap2: "Write your post",
      stap2Tekst: "Fill in the fields and add a post text per channel.",
      stap3: "Check against your brand kit",
      stap3Tekst: "The brand check runs before you can schedule.",
      stap4: "",
      stap4Tekst: "",
    },
    posttekst: "From idea to scheduled post in three steps.",
    altTekst: "Three steps: pick a template, write your post, check it against your brand kit.",
    inDagen: 7,
  },
];
