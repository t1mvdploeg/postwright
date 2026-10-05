// Marketingstudio — de invoervelden van een sjabloon (of diasoort) als formulier. Elk veld krijgt
// een vast id (`veld-<id>`), zodat de merkcontrole er met één klik de focus op kan zetten.
import { el } from "/app.js";
import { nadrukOmSelectie } from "/marketing/sjablonen.js";

/** Een teller "12 / 90" die rood wordt boven het maximum. */
function teller(veld, invoer) {
  const t = el("span", { class: "studio-teller", "aria-live": "off" });
  const zet = () => {
    const n = invoer.value.length;
    t.textContent = veld.max ? `${n} / ${veld.max}` : `${n}`;
    t.classList.toggle("te-veel", Boolean(veld.max && n > veld.max));
  };
  zet();
  invoer.addEventListener("input", zet);
  return t;
}

/**
 * Bouwt de velden. `waarden` is de huidige inhoud, `wijzig(id, waarde)` wordt bij elke invoer
 * aangeroepen. `media` is de lijst geüploade beelden voor een media-veld, `opUpload` opent de upload.
 */
export function bouwVelden(velden, waarden, { wijzig, media = [], opUpload }) {
  return velden.map((v) => {
    const id = `veld-${v.id}`;
    const waarde = waarden[v.id] ?? v.standaard ?? "";
    const hulpId = v.hulp ? `${id}-hulp` : null;
    const hulp = v.hulp ? el("p", { id: hulpId, class: "hulptekst", text: v.hulp }) : null;

    if (v.soort === "keuze") {
      if (v.opties.length <= 4) {
        const naam = `keuze-${v.id}-${Math.random().toString(36).slice(2, 7)}`;
        return el("fieldset", { class: "studio-keuze", id }, [
          el("legend", { text: v.label }),
          el("div", { class: "studio-keuze-opties" }, v.opties.map((o) => {
            const radio = el("input", { type: "radio", name: naam, value: o.waarde, ...(o.waarde === waarde ? { checked: "" } : {}) });
            radio.addEventListener("change", () => { if (radio.checked) wijzig(v.id, o.waarde); });
            return el("label", { class: "studio-radio" }, [radio, el("span", { text: o.tekst })]);
          })),
          hulp,
        ]);
      }
      const select = el("select", { id }, v.opties.map((o) => el("option", { value: o.waarde, text: o.tekst, ...(o.waarde === waarde ? { selected: "" } : {}) })));
      select.addEventListener("change", () => wijzig(v.id, select.value));
      return el("div", { class: "veld" }, [el("label", { for: id, text: v.label }), select, hulp]);
    }

    if (v.soort === "media") {
      const select = el("select", { id, ...(hulpId ? { "aria-describedby": hulpId } : {}) }, [
        el("option", { value: "", text: "Geen beeld gekozen" }),
        ...media.map((m) => el("option", {
          value: m.id, text: `${m.breedte ?? "?"}×${m.hoogte ?? "?"} · ${Math.round(m.bytes / 1024)} kB · ${m.id.slice(0, 8)}`,
          ...(m.id === waarde ? { selected: "" } : {}),
        })),
      ]);
      select.addEventListener("change", () => wijzig(v.id, select.value));
      const knop = el("button", { type: "button", class: "secundair klein", text: "Nieuwe schermafbeelding…", onclick: () => opUpload?.(v.id) });
      return el("div", { class: "veld" }, [el("label", { for: id, text: v.label }), el("div", { class: "studio-media-rij" }, [select, knop]), hulp]);
    }

    const meerRegels = v.soort === "kop" || v.soort === "tekst";
    const invoer = meerRegels
      ? el("textarea", { id, rows: v.soort === "kop" ? "2" : "3", ...(hulpId ? { "aria-describedby": hulpId } : {}) })
      : el("input", { id, type: "text", ...(hulpId ? { "aria-describedby": hulpId } : {}) });
    invoer.value = waarde;
    invoer.addEventListener("input", () => wijzig(v.id, invoer.value));
    const kop = el("div", { class: "studio-veldkop" }, [el("label", { for: id, text: `${v.label}${v.verplicht ? "" : " (optioneel)"}` }), teller(v, invoer)]);
    const kinderen = [kop, invoer, hulp];
    if (v.nadruk === "precies-een") {
      // De nadrukknop zet sterretjes om de selectie: sneller dan typen, en zonder tikfouten.
      const knop = el("button", { type: "button", class: "secundair klein studio-nadrukknop", text: "Selectie als nadruk" });
      knop.addEventListener("click", () => {
        const uit = nadrukOmSelectie(invoer.value, invoer.selectionStart, invoer.selectionEnd);
        invoer.focus();
        if (!uit) return;
        invoer.value = uit.tekst;
        invoer.setSelectionRange(uit.begin, uit.eind);
        invoer.dispatchEvent(new Event("input"));
      });
      kinderen.push(el("div", { class: "studio-nadruk" }, [knop]));
    }
    return el("div", { class: "veld" }, kinderen);
  });
}
