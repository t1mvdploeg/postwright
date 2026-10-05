// Marketingstudio golf 2 — de eerste vulling van de feitenbank en de tekstenbank (taak M4.2 uit
// golf 1, toen niet uitgevoerd). Alles hier staat letterlijk op de site; tests/marketing-
// startvulling.test.ts bewaakt dat. Feiten komen als concept binnen: Tim loopt ze na en zet ze op actief.
//
// Past de site een zin aan, dan faalt die test: neem de nieuwe zin dan letterlijk over (of laat
// het feit weg). Een feit dat al in de feitenbank staat, verandert niet mee; dat loopt Tim daar na.
import { STANDAARD_MARKETING_INSTELLINGEN, type TekstInvoer } from "./marketing-schema.js";

const ENTITEITEN: Record<string, string> = { amp: "&", nbsp: " ", lt: "<", gt: ">", quot: '"', "#39": "'", euro: "€", rsquo: "’", lsquo: "‘", ndash: "–", mdash: "—" };

/** De tekst zoals een bezoeker hem leest: zonder scripts, styles en tags, entiteiten omgezet, witruimte samengevoegd. */
export function zichtbareTekst(html: string): string {
  return html
    .replace(/<(script|style)\b[\s\S]*?<\/\1>/gi, " ")
    .replace(/<[^>]+>/g, " ")
    .replace(/&(#?\w+);/g, (heel, naam: string) => ENTITEITEN[naam] ?? heel)
    .replace(/\s+/g, " ")
    .trim();
}

/** Een startfeit: nooit een cao-feit (dat verwijst naar docs/kennis of data/parameters), altijd de site als bron. */
export interface Startfeit {
  tekst: string;
  soort: "product" | "voorbeelddossier" | "bedrijf";
  bron: { soort: "site"; verwijzing: string };
}

const LANDING = "src/web/landing.html";
const OVER_ONS = "src/web/over-ons.html";
const feit = (soort: Startfeit["soort"], pagina: string, sectie: string, tekst: string): Startfeit =>
  ({ tekst, soort, bron: { soort: "site", verwijzing: `${pagina}, ${sectie}` } });

export const STARTFEITEN: Startfeit[] = [
  // Het voorbeelddossier (Noordhaven Techniek, medewerker Noor de Vries), zoals de cijfers op de landing staan.
  feit("voorbeelddossier", LANDING, "hero, voorbeeldberekening Noordhaven Techniek", "Uurtarief € 62,75 per uur, excl. btw"),
  feit("voorbeelddossier", LANDING, "hero, voorbeeldberekening Noordhaven Techniek", "Kostprijs per uur € 52,75"),
  feit("voorbeelddossier", LANDING, "hero, voorbeeldberekening Noordhaven Techniek", "Marge per uur € 10,00"),
  feit("voorbeelddossier", LANDING, "tariefdemo, stap Tarief", "Marge als deel van het tarief 15,9%"),
  feit("voorbeelddossier", LANDING, "tariefdemo, voorbeelduitvraag Noordhaven Techniek", "Arbeidsduur 40 uur per week"),
  feit("voorbeelddossier", LANDING, "tariefdemo, voorbeelduitvraag Noordhaven Techniek", "Vakantie en ADV 27 + 13 dagen"),
  feit("voorbeelddossier", LANDING, "tariefdemo, voorbeelduitvraag Noordhaven Techniek", "Pensioenbijdrage werkgever 18,6%"),
  feit("voorbeelddossier", LANDING, "loonstrookdemo, loonstrook Noor de Vries", "Bruto-uurloon € 24,50"),
  feit("voorbeelddossier", LANDING, "loonstrookdemo, bevinding vakantiebijslag",
    "Op de loonstrook staat 8,33% vakantiebijslag. Dit percentage komt overeen met de vakantietoeslag die in het opdrachtgeverdossier is vastgelegd."),

  // Wat de tool doet: vooral de antwoorden onder "Nog even helder", die het preciest zijn.
  feit("product", LANDING, "vragen, voor wie",
    "Mijntarieftool is bedoeld voor medewerkers van uitzend- en detacheringsbedrijven die arbeidsvoorwaarden van opdrachtgevers vastleggen en tarieven bepalen."),
  feit("product", LANDING, "vragen, voor wie",
    "U begint bij de uitvraag van de opdrachtgever, controleert de voorgestelde afspraken en bewaart die in een dossier."),
  feit("product", LANDING, "vragen, bestanden",
    "U kunt een uitvraag aanleveren als PDF, Word-document, Excel-bestand of tekstbestand."),
  feit("product", LANDING, "vragen, wat de tool uit een uitvraag haalt",
    "De analyse werkt langs 38 onderwerpen uit de uitvraag gelijkwaardige beloning. Dat gaat verder dan werkweek en vakantiedagen: ook ADV, overwerkpercentages, ploegentoeslagen, vaste uitkeringen, pensioenbijdrage en franchise, vergoedingen en getrapte loondoorbetaling bij ziekte komen aan bod."),
  feit("product", LANDING, "vragen, wat de tool uit een uitvraag haalt",
    "Bedragen, percentages en voorwaarden worden uit het document overgenomen."),
  feit("product", LANDING, "tariefdemo, aanleveren",
    "De AI leest de arbeidsvoorwaarden uit en zet de afspraken klaar voor uw controle."),
  feit("product", LANDING, "vragen, controle over de uitkomst",
    "Openstaande aannames op rekenende velden moeten worden afgehandeld voordat u het dossier als akkoord bewaart."),
  feit("product", LANDING, "vragen, dossier voor meer medewerkers",
    "Herkent de tool bij een nieuwe uitvraag een bestaand KVK-nummer, dan krijgt u de verschillen vóór het overschrijven te zien."),
  feit("product", LANDING, "vragen, loonstroken controleren",
    "De toets geeft controlepunten voor onder meer het minimumuurloon, vakantiebijslag, pensioencompensatie en eventuele ET-uitruil."),
  feit("product", LANDING, "vragen, loonstroken controleren",
    "Dit is een gerichte controle van loonstrookonderdelen; voor de beoordeling van het volledige arbeidsvoorwaardenpakket zijn aanvullende gegevens nodig."),
  feit("product", LANDING, "vragen, exporteren",
    "Met een ingestelde Salesforce-koppeling kunt u een bewaarde berekening naar een medewerkerrecord exporteren."),
  feit("product", OVER_ONS, "uitgangspunten, uw oordeel hoort erbij",
    "AI helpt om informatie uit documenten te halen. U beoordeelt de uitkomst, controleert aannames en bepaalt wat wordt vastgelegd."),
  feit("product", OVER_ONS, "uitgangspunten, overzicht moet verder helpen",
    "Kostprijs en marge komen samen in een tarief dat u kunt bespreken en als PDF kunt meenemen."),

  // Wie erachter zit en waarom.
  feit("bedrijf", OVER_ONS, "opening",
    "Achter iedere berekening zit iemand die aan het werk gaat. Wij maken Mijntarieftool om de afspraken daarachter begrijpelijk en overzichtelijk te maken."),
  feit("bedrijf", OVER_ONS, "ons verhaal",
    "We brengen het lezen van de uitvraag, het beoordelen van de afspraken en het berekenen van een tarief bij elkaar."),
  feit("bedrijf", OVER_ONS, "ons verhaal",
    "Onze ambitie is helder: minder tijd kwijt aan het ordenen van informatie. Meer aandacht voor de keuzes die uw kennis en ervaring vragen."),
];

export const STARTTEKSTEN: TekstInvoer[] = [
  {
    soort: "boilerplate",
    naam: "Over Mijntarieftool",
    // De uitleg onder de kop van de landing, drie zinnen achter elkaar.
    tekst: "Een uitvraag vol cao-afspraken. Tientallen parameters. Mijntarieftool brengt ze samen in een overzichtelijke berekening, van arbeidsvoorwaarden tot uurtarief.",
  },
  {
    soort: "afsluiter",
    naam: "Oproep uit het slot van de landing",
    // De zin naast de knoppen "Contact opnemen" en "Of probeer eerst de demo".
    tekst: "Benieuwd wat Mijntarieftool voor uw organisatie kan betekenen?",
  },
  { soort: "hashtags", naam: "Standaardhashtags", tekst: STANDAARD_MARKETING_INSTELLINGEN.standaardHashtags },
];
