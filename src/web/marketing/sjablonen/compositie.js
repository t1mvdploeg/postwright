// De tariefcompositie van de heldsectie (bron, berekening, controle), zoals uitkomst.html,
// og-afbeelding.html en dia 5 van de carrousel in de kit hem gebruiken. De bedragen zijn die van
// het voorbeelddossier (Noordhaven Techniek); elk sjabloon dat dit toont heeft `voorbeelddata`.

export function compositie(c) {
  return `<div class="compositie" aria-label="Voorbeeldberekening: van uitvraag naar uurtarief">
      <span class="cirkel"></span><span class="ring"></span>
      <div class="papier bronblad">
        <div class="bronblad-kop">${c.icoon("document")}Uitvraag Noordhaven.pdf</div>
        <span class="documentlijn"></span><span class="documentlijn kort"></span>
        <div class="bronselectie"><span>Werkweek</span><strong>40 uur</strong>${c.icoon("vink")}</div>
      </div>
      <div class="rekenkaart rekenblad">
        <div class="rekenblad-kop"><div><span>Nieuwe berekening</span><strong>Noordhaven Techniek</strong></div><img src="${c.logoBron("merkteken")}" alt=""></div>
        <div class="rekeninhoud">
          <div class="rekenregels"><div><span>Kostprijs per uur</span><strong class="bedrag">€ 52,75</strong></div><div><span>Marge per uur</span><strong class="bedrag">€ 10,00</strong></div><p>${c.icoon("vink")}De opbouw in beeld</p></div>
          <div class="uitkomst"><span>Uurtarief</span><strong class="bedrag">€ 62,75</strong><span>per uur, excl. btw</span><div class="kostenbalk"><i></i><i></i></div><div class="kostenlegenda"><span>Kostprijs</span><span>Marge</span></div></div>
        </div>
        <div class="rekenvoet"><span>Van afspraak naar inzicht</span>${c.icoon("pijl")}</div>
      </div>
      <div class="label"><span class="vinkrondje">${c.icoon("vink")}</span><div><strong>U heeft het laatste woord.</strong><small>Bronnen en aannames gecontroleerd</small></div></div>
    </div>`;
}
