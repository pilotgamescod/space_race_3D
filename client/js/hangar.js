// ════════════════════════════════════════════════════════════════════
//  HANGAR — catalogo delle navicelle
//
//  Una sola è pilotabile: le altre sono progetti previsti, con le loro
//  caratteristiche già definite. Servono a dare un orizzonte al gioco —
//  vedere cosa arriverà è metà del motivo per continuare a giocare.
//
//  Quando una nave viene costruita davvero, basta togliere `locked` e
//  collegare la sua mesh: statistiche e descrizione sono già qui.
// ════════════════════════════════════════════════════════════════════

export const SHIPS = [
  {
    id: 'lancer',
    name: 'Lancer',
    role: 'Intercettore leggero',
    desc: 'Il caccia di serie. Nessuna specializzazione, nessuna debolezza: ' +
          'accelera bene, vira meglio, e regge tre urti prima di preoccuparsi.',
    stats: { velocità: 62, agilità: 70, scafo: 60, fuoco: 55 },
    locked: false,
  },
  {
    id: 'vespa',
    name: 'Vespa',
    role: 'Ricognitore',
    desc: 'Scafo ridotto all\'osso per guadagnare spinta. Vira su sé stessa ' +
          'e sfugge a tutto, ma due colpi la mettono fuori combattimento.',
    stats: { velocità: 92, agilità: 95, scafo: 25, fuoco: 40 },
    locked: true,
  },
  {
    id: 'bastione',
    name: 'Bastione',
    role: 'Corazzata d\'assalto',
    desc: 'Piastre stratificate e quattro cannoni. Passa attraverso un campo ' +
          'di asteroidi senza rallentare. Girarla richiede pazienza.',
    stats: { velocità: 38, agilità: 25, scafo: 100, fuoco: 85 },
    locked: true,
  },
  {
    id: 'falco',
    name: 'Falco',
    role: 'Caccia da superiorità',
    desc: 'Nato per il combattimento ravvicinato. Postbruciatore a ricarica ' +
          'rapida e cannoni gemelli con cadenza doppia.',
    stats: { velocità: 78, agilità: 82, scafo: 50, fuoco: 88 },
    locked: true,
  },
  {
    id: 'nomade',
    name: 'Nomade',
    role: 'Esplorazione a lungo raggio',
    desc: 'Serbatoi maggiorati e sensori a lungo raggio: individua le rocce ' +
          'di minerale a distanza tripla. Armamento leggero.',
    stats: { velocità: 70, agilità: 45, scafo: 72, fuoco: 30 },
    locked: true,
  },
  {
    id: 'spettro',
    name: 'Spettro',
    role: 'Furtiva',
    desc: 'Rivestimento a bassa emissione: le sentinelle la individuano solo ' +
          'a distanza dimezzata. Fragile se scoperta.',
    stats: { velocità: 66, agilità: 74, scafo: 38, fuoco: 52 },
    locked: true,
  },
  {
    id: 'martello',
    name: 'Martello',
    role: 'Bombardiere',
    desc: 'Cariche a frammentazione che polverizzano i massi grandi in un ' +
          'colpo solo. Lenta, ma nessuna roccia le resiste.',
    stats: { velocità: 44, agilità: 32, scafo: 80, fuoco: 96 },
    locked: true,
  },
  {
    id: 'aurora',
    name: 'Aurora',
    role: 'Prototipo sperimentale',
    desc: 'Propulsione a curvatura instabile: scatti istantanei di duecento ' +
          'unità. Il sistema va lasciato raffreddare fra un salto e l\'altro.',
    stats: { velocità: 100, agilità: 60, scafo: 42, fuoco: 48 },
    locked: true,
  },
  {
    id: 'sciame',
    name: 'Sciame',
    role: 'Portadroni',
    desc: 'Rilascia due droni autonomi che ingaggiano le sentinelle per conto ' +
          'proprio. Difesa diretta quasi nulla.',
    stats: { velocità: 52, agilità: 40, scafo: 58, fuoco: 70 },
    locked: true,
  },
  {
    id: 'colosso',
    name: 'Colosso',
    role: 'Nave capitale',
    desc: 'Non è un caccia: è una fortezza mobile con torrette indipendenti. ' +
          'Manovra come un continente.',
    stats: { velocità: 26, agilità: 12, scafo: 100, fuoco: 100 },
    locked: true,
  },
];

export const STAT_LABELS = ['velocità', 'agilità', 'scafo', 'fuoco'];

/** Costruisce le schede del catalogo dentro il contenitore dato. */
export function renderHangar(container, selectedId, onSelect) {
  container.innerHTML = '';
  for (const s of SHIPS) {
    const card = document.createElement('div');
    card.className = 'ship' + (s.locked ? ' locked' : '') +
                     (s.id === selectedId ? ' sel' : '');

    const bars = STAT_LABELS.map(k => `
      <div class="sbar">
        <span class="sk">${k}</span>
        <span class="st"><i style="width:${s.stats[k]}%"></i></span>
      </div>`).join('');

    card.innerHTML = `
      <div class="shead">
        <span class="sname">${s.name}</span>
        ${s.locked ? '<span class="slock">in sviluppo</span>'
                   : '<span class="sok">disponibile</span>'}
      </div>
      <div class="srole">${s.role}</div>
      <div class="sdesc">${s.desc}</div>
      <div class="sstats">${bars}</div>`;

    if (!s.locked) card.addEventListener('click', () => onSelect(s.id));
    container.appendChild(card);
  }
}
