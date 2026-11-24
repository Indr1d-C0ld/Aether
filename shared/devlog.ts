// Dev-log: le novità del gioco, dalla più recente. Lo leggono la pagina d'ingresso e il deck.
// REGOLA DI CASA: ogni modifica che un giocatore può notare aggiunge una voce in cima, con la data
// e una riga per cosa. Scrivere per chi gioca, non per chi programma.

export type DevEntry = { v: string; date: string; title: string; tags: string[]; items: string[] };

export const DEVLOG: DevEntry[] = [
  {
    v: "0.3.0",
    date: "2026-11-24",
    title: "ReticoloNet, crew, duelli e un mondo molto più grande",
    tags: ["IRC", "missioni", "bottino", "mondo", "ranghi"],
    items: [
      "ReticoloNet: una rete IRC come nel 1996, dentro il deck. Canali pubblici, di cellula e segreti, query private, operatori, bot con le voci di corridoio, netsplit, e un bot XDCC che regala un pacchetto al giorno.",
      "Dalla chat si gioca: /paga per mandare crediti, /dcc send per passare file, exploit, chip e gadget, /sfida per un duello, /crew per la squadra.",
      "Crew: fino a 12 handle della stessa cellula, con canale privato, cassa comune e classifica.",
      "Duelli: stessa posta, stesso bersaglio a sorte, dieci minuti. Chi buca per primo prende il piatto.",
      "32 operazioni a tappe ispirate ai classici: «Yippee-ki-yay», «Too many secrets», «Free Kevin», «Il cinque del nove», «Semafori verdi»… con obiettivi da spuntare, raffiche e colpi a tempo. Anche per i blu: ispezioni, honeynet, reti di sensori.",
      "Worm: un nuovo strumento rosso. Lo pianti in un sistema e rende spiccioli ogni 45 secondi, finché un blu col Patch Kit non lo schiaccia. La tua botnet.",
      "Gadget: oggetti che non si consumano e si ricaricano (Blue Box, Walkman, Tastiera Model M, Macchina Esper…). Più 14 exploit nuovi e due nuovi tipi di chip.",
      "8 pezzi leggendari nuovi, nascosti in 13 nodi segreti: una villa in orbita, una fabbrica di giocattoli con troppe guardie, un computer che ha imparato una canzone a Urbana…",
      "Il Reticolo passa da 320 a oltre 520 nodi: BBS, sale LAN, zaibatsu, arcologie, centrali nucleari, radio pirata, silos. Chi ha visto i film giusti riconoscerà qualche insegna.",
      "Ranghi da 12 a 20, livelli da 1 a 99, sette specializzazioni che crescono con quello che fai davvero, fino a 6 slot per i chip.",
      "68 traguardi nuovi: 396 in tutto.",
    ],
  },
  {
    v: "0.2.0",
    date: "2026-11-18",
    title: "Carriera, traguardi e sala di controllo",
    tags: ["traguardi", "statistiche"],
    items: [
      "Scheda Carriera: statistiche personali e 328 traguardi in quattro gradi (bronzo, argento, oro, platino).",
      "Sala di controllo per l'amministrazione: regolazioni del mondo, moderazione, messaggi, manutenzione.",
      "Avvisi dell'amministrazione in cima al deck e nella posta.",
    ],
  },
  {
    v: "0.1.2",
    date: "2026-11-18",
    title: "In linea su Balthasar",
    tags: ["server"],
    items: ["Il gioco è pubblico: si entra dal browser, anche dal telefono.", "Protezioni contro chi prova le password a raffica e contro le iscrizioni in massa."],
  },
  {
    v: "0.1.1",
    date: "2026-11-18",
    title: "Regia da film e mondo aperto ribilanciato",
    tags: ["cinema", "bilanciamento"],
    items: [
      "Tutto il cinema da hacker: la password che cede un carattere alla volta, il muro di porte del firewall, le foto tessera sfogliate a raffica, ACCESS GRANTED a tutto schermo.",
      "Notte, blackout e allerta ora cambiano la velocità del trace invece di togliere difese.",
      "Tetti ai bonifici rubati, al ricettatore e alle casse dei negozi: il gioco libero rende, ma non più dei contratti.",
      "La rete si chiama Reticolo.",
    ],
  },
  {
    v: "0.1.0",
    date: "2026-11-17",
    title: "Prima versione",
    tags: ["lancio"],
    items: [
      "Rimbalzi sui relay, trace, log come catena di prove, rossi contro blu.",
      "Un mondo di 320 nodi che reagiscono secondo quello che sono, 23 tipi di contratto, 100 cittadini con una vita negli archivi.",
      "Mercato nero, taglie, gateway attaccabili, bottino con rarità, fama, giustizia e carcere.",
      "Planisfero in cinque stili, grafica in pixel art, musica ed effetti sintetizzati come su una scheda FM.",
    ],
  },
];

export const VERSION = DEVLOG[0]!.v;
