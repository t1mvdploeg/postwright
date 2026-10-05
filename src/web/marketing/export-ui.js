// Marketingstudio — exporteren: één PNG, alle formaten als ZIP, en een carrousel als PDF. Alles in
// de browser: geen upload, geen bodylimiet, en wat je downloadt is wat het voorbeeld liet zien.
import { bouwBeeld, aantalBeelden } from "/marketing/sjablonen.js";
import { bestandsnaam, formaat as formaatVan, slugVan, KANALEN } from "/marketing/formaten.js";
import { download, naarBlob } from "/marketing/render.js";
import { maakZip } from "/marketing/zip.js";
import { maakPdf } from "/marketing/pdf.js";
import { laadMedia } from "/marketing/merk.js";

async function bytes(blob) {
  return new Uint8Array(await blob.arrayBuffer());
}

function mediaIds(post) {
  const alle = [post.inhoud ?? {}, ...(post.dias ?? []).map((d) => d.inhoud ?? {})];
  return alle.flatMap((i) => Object.values(i)).filter((v) => /^[0-9a-f]{32}\.(png|jpg|webp)$/.test(v));
}

/** De posttekst per kanaal als leesbaar tekstbestand, voor in de ZIP. */
export function posttekstBestand(post) {
  const delen = Object.entries(post.posttekst ?? {})
    .filter(([, t]) => t?.trim())
    .map(([k, t]) => `== ${KANALEN[k] ?? k} ==\n${t.trim()}\n`);
  if (post.altTekst?.trim()) delen.push(`== Alt-tekst ==\n${post.altTekst.trim()}\n`);
  return delen.join("\n") || "(Nog geen posttekst.)\n";
}

/**
 * Alle beelden van een post: per formaat, en bij een carrousel per dia.
 * @param {(stap: number, totaal: number) => void} voortgang
 */
export async function alleBeelden(post, s, merk, voortgang = () => {}) {
  const media = await laadMedia(mediaIds(post));
  const taken = post.formaten.flatMap((f) =>
    Array.from({ length: aantalBeelden(s, post.dias ?? []) }, (_, dia) => ({ f, dia })),
  );
  const uit = [];
  for (const [i, t] of taken.entries()) {
    voortgang(i + 1, taken.length);
    const beeld = bouwBeeld({
      sjabloon: s.id,
      inhoud: post.inhoud,
      dias: post.dias,
      dia: t.dia,
      formaat: t.f,
      merk,
      media,
    });
    uit.push({ ...t, beeld });
  }
  return uit;
}

/** Het begin van de naam van een zip of pdf: `<merk>_<campagne>_<post>`; lege delen vallen weg. */
const basisNaam = (merk, campagne, titel, terugval) =>
  [slugVan(merk.naam), slugVan(campagne), slugVan(titel) || terugval].filter(Boolean).join("_");

export async function exporteerPng(post, s, merk, sleutel, dia, campagne) {
  const media = await laadMedia(mediaIds(post));
  const beeld = bouwBeeld({ sjabloon: s.id, inhoud: post.inhoud, dias: post.dias, dia, formaat: sleutel, merk, media });
  const naam = bestandsnaam({
    merk: merk.naam,
    campagne,
    post: post.titel,
    formaat: sleutel,
    dia: s.soort === "carrousel" ? dia + 1 : null,
  });
  download(await naarBlob(beeld), naam, "image/png");
}

export async function exporteerZip(post, s, merk, campagne, voortgang) {
  const beelden = await alleBeelden(post, s, merk, () => {});
  const bestanden = [];
  for (const [i, b] of beelden.entries()) {
    voortgang?.(i + 1, beelden.length);
    bestanden.push({
      naam: bestandsnaam({
        merk: merk.naam,
        campagne,
        post: post.titel,
        formaat: b.f,
        dia: s.soort === "carrousel" ? b.dia + 1 : null,
      }),
      bytes: await bytes(await naarBlob(b.beeld)),
    });
  }
  if (s.soort === "carrousel") {
    const pdf = await carrouselPdf(post, s, merk, () => {});
    bestanden.push({ naam: `${basisNaam(merk, campagne, post.titel, "carrousel")}_carrousel.pdf`, bytes: pdf });
  }
  bestanden.push({ naam: "posttekst.txt", bytes: posttekstBestand(post) });
  const { geschiedenis: _weg, ...recept } = post;
  bestanden.push({ naam: "recept.json", bytes: `${JSON.stringify(recept, null, 2)}\n` });
  const naam = `${basisNaam(merk, campagne, post.titel, "post")}.zip`;
  download(maakZip(bestanden), naam, "application/zip");
}

async function carrouselPdf(post, s, merk, voortgang) {
  const media = await laadMedia(mediaIds(post));
  const f = formaatVan("li-carrousel");
  const paginas = [];
  const aantal = aantalBeelden(s, post.dias ?? []);
  for (let dia = 0; dia < aantal; dia++) {
    voortgang(dia + 1, aantal);
    const beeld = bouwBeeld({ sjabloon: s.id, dias: post.dias, dia, formaat: "li-carrousel", merk, media });
    paginas.push({
      jpeg: await bytes(await naarBlob(beeld, "image/jpeg", 0.92)),
      breedte: f.breedte,
      hoogte: f.hoogte,
    });
  }
  return maakPdf(paginas, { titel: post.titel });
}

export async function exporteerPdf(post, s, merk, campagne, voortgang) {
  const pdf = await carrouselPdf(post, s, merk, voortgang);
  download(pdf, `${basisNaam(merk, campagne, post.titel, "carrousel")}_carrousel.pdf`, "application/pdf");
}
