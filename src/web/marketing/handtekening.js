// Marketingstudio — de e-mailhandtekening uit de kit (e-mailhandtekening.html), met eigen naam en
// gegevens. Tabel en inline stijlen zijn bewust ouderwets: zo blijft de opmaak in elk mailprogramma
// overeind. Het logo moet online staan (Gmail en Outlook op het web halen het op); de studio host
// het op /marketing/merk/logo/mijntarieftool-logo-e-mail.png. Puur, dus getest.
import { escapeHtml } from "./sjablonen.js";

/** Alleen cijfers en een plus vooraan, voor een tel:-link. */
export function telefoonLink(nummer) {
  const schoon = String(nummer ?? "").replace(/[^\d+]/g, "");
  return schoon.replace(/(?!^)\+/g, "");
}

export function handtekeningHtml({ naam = "", functie = "", telefoon = "", email = "", logoUrl }) {
  const e = escapeHtml;
  const geldigeMail = /^[^\s@<>"']+@[^\s@<>"']+\.[^\s@<>"']+$/.test(email) ? email : "";
  const contact = [
    telefoon.trim() ? `<a href="tel:${e(telefoonLink(telefoon))}" style="color:#5a6b84;text-decoration:none;">${e(telefoon.trim())}</a>` : "",
    geldigeMail ? `<a href="mailto:${e(geldigeMail)}" style="color:#5a6b84;text-decoration:none;">${e(geldigeMail)}</a>` : "",
    '<a href="https://mijntarieftool.nl" style="color:#245cf0;text-decoration:none;font-weight:600;">mijntarieftool.nl</a>',
  ].filter(Boolean).join("\n      &nbsp;·&nbsp; ");
  return `<table role="presentation" cellpadding="0" cellspacing="0" border="0" style="border-collapse:collapse;font-family:Geist,Helvetica,Arial,sans-serif;color:#10243e;">
  <tr>
    <td style="padding:0 0 14px 0;">
      <div style="font-size:15px;line-height:22px;font-weight:600;letter-spacing:-0.01em;">${e(naam.trim() || "Voornaam Achternaam")}</div>
      ${functie.trim() ? `<div style="font-size:13px;line-height:20px;color:#5a6b84;">${e(functie.trim())}</div>` : ""}
    </td>
  </tr>
  <tr>
    <td style="padding:14px 0 12px 0;border-top:1px solid #dde6f4;">
      <img src="${e(logoUrl)}" width="150" height="29" alt="Mijntarieftool" style="display:block;border:0;width:150px;height:auto;">
    </td>
  </tr>
  <tr>
    <td style="font-size:13px;line-height:20px;color:#5a6b84;">
      ${contact}
    </td>
  </tr>
  <tr>
    <td style="padding-top:6px;font-size:12px;line-height:18px;color:#5a6b84;">Gelijkwaardige beloning, helder berekend.</td>
  </tr>
</table>`;
}
