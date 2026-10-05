// Marketingstudio — de merkcontrole. Automatiseert de controlelijst van de kit ("Controleren
// voordat u post" in HANDLEIDING.md) plus wat de studio zelf weet: limieten per kanaal, feiten,
// alt-tekst, UTM. Puur; de overloopmeting (die een echte browser nodig heeft) komt als invoer mee.
//
// "fout" houdt een post tegen bij Gepland (de server weigert dan); "let op" houdt niets tegen;
// "ok" is een bevestiging die het paneel toont zodat je ziet wát er is nagelopen.
import { telNadruk, veldenVan, zonderNadruk } from "./sjablonen.js";
import { controleerPosttekst, KANAAL_REGELS } from "./posttekst.js";
import { ongedekteGetallen } from "./getallen.js";
import { contrastOp } from "./kleur.js";
import { diaHeeftVoorbeelddata } from "./sjablonen/carrousel.js";
import { formaat } from "./formaten.js";

const WOORDGRENS_VOOR = "(?<![\\p{L}\\p{N}])";
const WOORDGRENS_NA = "(?![\\p{L}\\p{N}])";
const JE_VORM = new RegExp(`${WOORDGRENS_VOOR}(je|jij|jou|jouw|jullie)${WOORDGRENS_NA}`, "iu");

function escapeRegex(t) { return t.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"); }

/** Of een woord of woordgroep als geheel in een tekst staat (hoofdletterongevoelig). */
export function bevatWoord(tekst, woord) {
  const w = String(woord ?? "").trim();
  if (!w) return false;
  const voor = /^[\p{L}\p{N}]/u.test(w) ? WOORDGRENS_VOOR : "";
  const na = /[\p{L}\p{N}]$/u.test(w) ? WOORDGRENS_NA : "";
  return new RegExp(`${voor}${escapeRegex(w)}${na}`, "iu").test(String(tekst ?? ""));
}

/**
 * Alle teksten van een post met hun plek: de velden (per dia bij een carrousel), de postteksten en
 * de alt-tekst. De keuzevelden en media-id's doen niet mee: dat is geen tekst die iemand leest.
 */
export function tekstenVan(post, s) {
  const uit = [];
  const velden = (lijst, inhoud, dia) => {
    for (const v of lijst) {
      if (v.soort === "keuze" || v.soort === "media") continue;
      const tekst = inhoud?.[v.id] ?? v.standaard ?? "";
      if (String(tekst).trim()) uit.push({ waar: dia === null ? v.label : `Dia ${dia + 1}, ${v.label.toLowerCase()}`, veld: v.id, dia, tekst: String(tekst) });
    }
  };
  if (s.soort === "carrousel") {
    (post.dias ?? []).forEach((d, i) => velden(veldenVan(s, d.soort), d.inhoud, i));
  } else velden(s.velden, post.inhoud, null);
  for (const [kanaal, tekst] of Object.entries(post.posttekst ?? {})) {
    if (String(tekst ?? "").trim()) uit.push({ waar: `Posttekst ${KANAAL_REGELS[kanaal]?.naam ?? kanaal}`, veld: null, dia: null, kanaal, tekst: String(tekst) });
  }
  if (String(post.altTekst ?? "").trim()) uit.push({ waar: "Alt-tekst", veld: "altTekst", dia: null, tekst: post.altTekst });
  return uit;
}

/**
 * Of een feit bruikbaar is op `vandaag` (JJJJ-MM-DD): actief en niet verlopen. Een feit dat pas
 * later ingaat ("per 1 januari stijgt het minimumloon naar …") mag wél: de aankondiging klopt nu
 * al. Zelfde regel als `feitOnbruikbaar` in src/server/api-marketing.ts.
 */
export function feitBruikbaar(f, vandaag) {
  return f.status === "actief" && (!f.geldigTot || f.geldigTot >= vandaag);
}

/**
 * @param {{
 *   post: { sjabloon: string, formaten: string[], inhoud: Record<string,string>, dias?: Array<{soort:string, inhoud:Record<string,string>}>, posttekst?: Record<string,string>, altTekst?: string, link?: string, feiten?: string[], merkVersie?: string },
 *   sjabloon: object,
 *   instellingen: { kanalen: string[], verbodenWoorden: string[] },
 *   feiten?: Array<{ id: string, tekst: string, soort?: string, status: string, geldigVan: string|null, geldigTot: string|null }> | null,
 *   vandaag: string,
 *   merkVersie?: string,
 *   merk?: { gronden } | null,   // het merk waarvan het contrast gecontroleerd wordt; zonder merk geen contrastcontrole
 *   overloop?: Array<{ formaat: string, dia?: number|null, veld: string, soort: string }>,
 * }} invoer
 * @returns {{ bevindingen: Array<{ niveau: "fout"|"let-op"|"ok", code: string, tekst: string, veld?: string|null, dia?: number|null, kanaal?: string }>, fouten: number, letOp: number }}
 */
export function controleer({ post, sjabloon: s, instellingen, feiten = null, vandaag, merkVersie = null, merk = null, overloop = [] }) {
  const b = [];
  const voeg = (niveau, code, tekst, extra = {}) => b.push({ niveau, code, tekst, ...extra });

  if (!post.formaten?.length) voeg("fout", "geen-formaat", "Kies minstens één formaat");

  // Velden: verplicht, lengte, nadruk.
  const veldsets = s.soort === "carrousel"
    ? (post.dias ?? []).map((d, i) => ({ velden: veldenVan(s, d.soort), inhoud: d.inhoud ?? {}, dia: i }))
    : [{ velden: s.velden, inhoud: post.inhoud ?? {}, dia: null }];
  let nadrukOk = true;
  for (const { velden, inhoud, dia } of veldsets) {
    const plek = (v) => (dia === null ? v.label : `Dia ${dia + 1}: ${v.label.toLowerCase()}`);
    for (const v of velden) {
      const waarde = String(inhoud[v.id] ?? v.standaard ?? "");
      if (v.verplicht && !waarde.trim()) {
        voeg("fout", "verplicht", v.soort === "media" ? `Kies een ${v.label.toLowerCase()}` : `Vul ${plek(v).toLowerCase()} in`, { veld: v.id, dia });
        continue;
      }
      if (v.max && waarde.length > v.max) voeg("fout", "te-lang", `${plek(v)} is ${waarde.length} tekens; hooguit ${v.max}`, { veld: v.id, dia });
      if (v.nadruk === "precies-een" && waarde.trim()) {
        const n = telNadruk(waarde);
        if (n !== 1) {
          nadrukOk = false;
          voeg("fout", "nadruk", n === 0
            ? `${plek(v)}: zet één frase tussen *sterretjes* voor de accentkleur`
            : `${plek(v)}: precies één gekleurde frase, nu ${n}`, { veld: v.id, dia });
        }
      }
    }
  }
  if (nadrukOk) voeg("ok", "nadruk", "Precies één gekleurde frase per kop");

  // Carrousel: aantal dia's, omslag voorop, en het voorbeelddossier benoemd.
  if (s.soort === "carrousel") {
    const dias = post.dias ?? [];
    if (dias.length < 2) voeg("fout", "te-weinig-dias", "Een carrousel heeft minstens twee dia's");
    if (dias.length > (s.maxDias ?? 20)) voeg("fout", "te-veel-dias", `Hooguit ${s.maxDias ?? 20} dia's`);
    if (dias.length && dias[0].soort !== "omslag") voeg("let-op", "geen-omslag", "De eerste dia is geen omslag");
    if (dias.some(diaHeeftVoorbeelddata)) {
      const benoemd = dias.some((d) => /voorbeeld/i.test(`${d.inhoud?.kop ?? ""} ${d.inhoud?.tekst ?? ""}`));
      if (!benoemd) voeg("fout", "voorbeelddata", "Deze carrousel toont cijfers uit het voorbeelddossier; noem dat op de omslag, bijvoorbeeld \"Een voorbeelddossier, …\"");
      else voeg("ok", "voorbeelddata", "Het voorbeelddossier wordt in de carrousel benoemd");
    }
  } else if (s.voorbeelddata) {
    voeg("ok", "voorbeelddata", "Het label Voorbeelddossier staat vast in dit sjabloon");
  }

  // Teksten: u-vorm, uitroeptekens, verboden woorden.
  const teksten = tekstenVan(post, s);
  for (const t of teksten) {
    const je = t.tekst.match(JE_VORM);
    if (je) voeg("let-op", "u-vorm", `${t.waar}: "${je[1]}". De toon van de site is de u-vorm`, { veld: t.veld, dia: t.dia, kanaal: t.kanaal });
    if (t.tekst.includes("!")) voeg("let-op", "uitroepteken", `${t.waar}: een uitroepteken. De toon is zakelijk en rustig`, { veld: t.veld, dia: t.dia, kanaal: t.kanaal });
    for (const w of instellingen.verbodenWoorden ?? []) {
      if (bevatWoord(t.tekst, w)) voeg("let-op", "verboden-woord", `${t.waar}: "${w}" staat op de lijst verboden woorden`, { veld: t.veld, dia: t.dia, kanaal: t.kanaal });
    }
  }

  // Contrast op de gekozen ondergrond(en).
  const gronden = new Set(veldsets.map((v) => v.inhoud.ondergrond ?? v.velden.find((x) => x.id === "ondergrond")?.standaard).filter(Boolean));
  for (const grond of merk ? gronden : []) {
    const c = contrastOp(merk, grond);
    if (!c) continue;
    if (c.verhouding < c.drempel) voeg("fout", "contrast", `Contrast van de tekst op ${grond} is ${c.verhouding}:1; minimaal ${c.drempel}:1`);
    else voeg("ok", "contrast", `Contrast op ${grond}: ${String(c.verhouding).replace(".", ",")}:1`);
  }

  // Posttekst per actief kanaal, link en alt-tekst.
  for (const kanaal of instellingen.kanalen ?? []) {
    for (const r of controleerPosttekst(kanaal, post.posttekst?.[kanaal])) b.push(r);
  }
  if (!String(post.altTekst ?? "").trim()) voeg("let-op", "alt-tekst", "Nog geen alt-tekst: een korte beschrijving van het beeld voor wie het niet ziet", { veld: "altTekst" });

  // Feiten: gekoppelde feiten moeten bruikbaar zijn, en elk getal moet in zo'n feit staan. Zonder
  // feitenlijst is die check niet gedaan; dan gaat de controle dicht in plaats van als "0 fouten"
  // de poort naar Gepland te openen (reviewbevinding 4).
  if (!feiten) {
    voeg("fout", "feiten-onbekend", "De feitenbank kon niet worden geladen, dus de getallen zijn niet gecontroleerd. Laad de pagina opnieuw");
  } else {
    const perId = new Map(feiten.map((f) => [f.id, f]));
    const gekoppeld = [];
    for (const id of post.feiten ?? []) {
      const f = perId.get(id);
      if (!f) { voeg("fout", "feit-weg", "Een gekoppeld feit bestaat niet meer; koppel het los"); continue; }
      if (!feitBruikbaar(f, vandaag)) {
        const reden = f.status === "concept" ? "is nog een concept" : f.status === "ingetrokken" ? "is ingetrokken" : "is verlopen";
        voeg("fout", "feit-onbruikbaar", `Het feit "${f.tekst.length > 50 ? `${f.tekst.slice(0, 47)}…` : f.tekst}" ${reden}`);
        continue;
      }
      gekoppeld.push(f);
    }
    // Cijfers uit het voorbeelddossier staan altijd met label (ontwerp: "Voorbeeldcijfers zonder label
    // 'Voorbeelddossier' → fout"). Een sjabloon met `voorbeelddata` heeft dat label vast in het beeld,
    // en een carrousel die hierboven al de voorbeelddata-fout kreeg, krijgt hem niet nog een keer.
    // Een onbruikbaar feit telt niet mee: dat staat al als "feit-onbruikbaar" in de lijst.
    if (gekoppeld.some((f) => f.soort === "voorbeelddossier") && !s.voorbeelddata
      && !b.some((x) => x.niveau === "fout" && x.code === "voorbeelddata")
      && !teksten.some((t) => /voorbeeld/i.test(t.tekst))) {
      voeg("fout", "voorbeelddossier-label", "Deze post gebruikt cijfers uit het voorbeelddossier; noem dat in het beeld of de posttekst, bijvoorbeeld \"In een voorbeelddossier …\"");
    }
    const gemeld = new Set();
    for (const t of teksten) {
      for (const g of ongedekteGetallen(t.tekst, gekoppeld)) {
        if (gemeld.has(g.waarde)) continue;
        gemeld.add(g.waarde);
        voeg("fout", "getal-zonder-feit", `${t.waar}: "${g.tekst}" staat in geen gekoppeld, actief feit`, { veld: t.veld, dia: t.dia, kanaal: t.kanaal });
      }
    }
    if (!gemeld.size && teksten.length) voeg("ok", "feiten", gekoppeld.length ? "Elk getal staat in een gekoppeld feit" : "Geen getallen die een bron nodig hebben");
  }

  // Overloop, gemeten in het echte beeld.
  for (const o of overloop) {
    const f = formaat(o.formaat);
    const waar = `${f.naam}${o.dia !== null && o.dia !== undefined ? `, dia ${o.dia + 1}` : ""}`;
    const tekst = o.soort === "veilige-zone"
      ? `${waar}: ${o.veld} staat in de zone van de ${o.reden ?? "bediening van het platform"}`
      : o.soort === "overlap"
        ? `${waar}: ${o.veld} raakt ${o.met ?? "een ander tekstblok"}`
        : `${waar}: ${o.veld} loopt buiten het beeld`;
    voeg("fout", "overloop", tekst, { veld: o.veldId ?? null, dia: o.dia ?? null });
  }

  if (merkVersie && post.merkVersie && post.merkVersie !== merkVersie) {
    voeg("let-op", "merkversie", `Gemaakt met merkversie ${post.merkVersie}; de studio gebruikt nu ${merkVersie}. Bekijk het beeld opnieuw`);
  }

  const volgorde = { fout: 0, "let-op": 1, ok: 2 };
  b.sort((x, y) => volgorde[x.niveau] - volgorde[y.niveau]);
  return { bevindingen: b, fouten: b.filter((x) => x.niveau === "fout").length, letOp: b.filter((x) => x.niveau === "let-op").length };
}

/** Een korte, leesbare titel voor een post zonder titel: de kop zonder sterretjes. */
export function titelUit(post, s) {
  const bron = s.soort === "carrousel" ? post.dias?.[0]?.inhoud?.kop : post.inhoud?.kop;
  return zonderNadruk(bron ?? s.naam).replace(/\s+/g, " ").trim().slice(0, 120) || s.naam;
}
