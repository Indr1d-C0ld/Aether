// Dev-log: le novità del gioco, dalla più recente. Lo leggono la pagina d'ingresso e il deck.
// REGOLA DI CASA: ogni modifica che un giocatore può notare aggiunge una voce in cima, con la data
// e una riga per cosa. Scrivere per chi gioca, non per chi programma.

export type DevEntry = { v: string; date: string; title: string; tags: string[]; items: string[] };

export const DEVLOG: DevEntry[] = [
  {
    v: "0.8.0",
    date: "2026-11-25",
    title: "Barriere biometriche: voce, impronta, retina",
    tags: ["biometria", "minigiochi", "missioni", "gadget"],
    items: [
      "Sulle banche più blindate, sulle basi militari e su metà delle reti interne la password di root non basta più: l'accesso admin vuole anche la voce, l'impronta o la retina dell'amministratore. Sulla mappa lo dice un'etichetta «biometria».",
      "Il campione si ruba altrove. La voce: entri da impiegato, chiami l'amministratore dal centralino e registri. L'impronta: è sulla scheda del badge, all'ufficio del personale. La retina: sta in una cartella clinica, in qualunque ospedale.",
      "L'oscilloscopio, il quarto minigioco: davanti al lettore hai la traccia registrata e la tua, e quattro manopole (frequenza, ampiezza, fase, armonica) per sovrapporle. Tre letture: ogni respinta fa avanzare il trace, alla terza il lettore si blocca.",
      "Una volta admin puoi impiantare i tuoi modelli nel lettore: per 24 ore quella barriera ti apre da sola. I campioni invece durano 7 giorni.",
      "Per i blu: ri-registrare il personale. Campioni rubati e modelli impiantati smettono di valere, e chi li aveva riceve la notizia per posta.",
      "3 gadget nuovi: registratore a microcassette, dito di gelatina, lente a specchio. Fabbricano il campione sul posto, davanti alla barriera giusta.",
      "4 operazioni nuove: «Il mio nome è il mio passaporto», «Occhio per occhio», «La serratura sono io», e per i blu «Tutti in fila per la foto». I contratti sui sistemi con barriera pagano il 25% in più.",
      "20 traguardi nuovi: 492 in tutto.",
    ],
  },
  {
    v: "0.7.0",
    date: "2026-11-25",
    title: "I toni della Blue Box: il terzo minigioco",
    tags: ["minigiochi", "war dialer", "phreaking"],
    items: [
      "Mentre il War Dialer compone, sulla mappa compare «Blue Box · fischia nella cornetta»: un fischio a 2600 Hz e la linea è tua.",
      "Il centralino suona una sequenza di toni (quelli veri dei telefoni a tastiera) e tu la ripeti sul tastierino. Tre giri: quattro toni, poi cinque, poi sei.",
      "Se li azzecchi tutti la scansione si chiude subito, il centralino ti passa 2 nodi in più e sale la probabilità che risponda qualcosa che non è in nessun elenco.",
      "Un tono sbagliato e l'operatore ti addebita 300 CR di interurbana; la scansione va avanti come sempre. Finché stai componendo, la linea ti aspetta.",
      "È facoltativa, come gli altri minigiochi. 4 traguardi nuovi: 472 in tutto.",
    ],
  },
  {
    v: "0.6.0",
    date: "2026-11-25",
    title: "I rotori del Decrypter: il secondo minigioco",
    tags: ["minigiochi", "decrypter", "traguardi"],
    items: [
      "Sui file cifrati, sotto «Decifra», ora c'è «Rotori»: la chiave è una fila di 3, 4 o 5 rotori da girare a colpi di freccia. A ogni prova il sistema dice quanti sono allineati e quanti simboli sono giusti ma sul rotore sbagliato.",
      "Trovata la chiave, il file è in chiaro subito, senza aspettare la barra. Se ti avanzano almeno 2 prove il sistema la prende per buona e il trace si ferma dieci secondi.",
      "«A mano»: con i rotori puoi decifrare un file di un livello sopra il tuo Decrypter. Hai una prova in meno, e se le finisci la chiave viene ruotata e il trace fa un balzo in avanti.",
      "Sono facoltativi: la barra funziona come prima, e puoi lanciarla e girare i rotori mentre corre.",
      "12 traguardi nuovi per chi decifra a mano: 468 in tutto.",
    ],
  },
  {
    v: "0.5.0",
    date: "2026-11-25",
    title: "La griglia del firewall: il primo minigioco",
    tags: ["minigiochi", "firewall", "traguardi"],
    items: [
      "Accanto ad «Abbatti» ora c'è «Griglia»: la tabella delle regole del firewall, con qualche regola lasciata aperta da trovare. Ogni sonda a vuoto dice a quante caselle sta la falla più vicina.",
      "Trovate tutte le falle, il firewall cade subito, senza aspettare la barra. Se ti avanzano almeno 2 sonde la breccia è pulita: nel log non resta nemmeno una riga da cancellare.",
      "«A mano»: con la griglia puoi aprire un firewall di un livello sopra il tuo Firewall Bypass. Hai una sonda in meno, e se le finisci il firewall ricarica le regole e il trace fa un balzo in avanti.",
      "È facoltativa: la barra funziona come prima, e puoi lanciarla e giocare la griglia mentre corre.",
      "12 traguardi nuovi per chi apre i firewall a mano: 456 in tutto.",
    ],
  },
  {
    v: "0.4.0",
    date: "2026-11-24",
    title: "Dentro i sistemi: sottosistemi, posta interna, reti nascoste",
    tags: ["sottosistemi", "posta", "missioni", "mondo"],
    items: [
      "Ogni organizzazione ora ha delle stanze: posta interna, centralino, telecamere, contabilità, ufficio del personale, rete interna. Ognuna ha le sue azioni e chiede un livello di accesso.",
      "Tre livelli invece di uno: impiegato, operatore, admin. Non serve più forzare per forza la password di root: con nome e anno di nascita di un dipendente entri da impiegato, e la password dell'operatore gira nella posta.",
      "Posta interna: le caselle del personale, diverse per ogni sistema e rinnovate ogni settimana. Dentro ci sono indirizzi da annotare, mezze password, allegati compromettenti che il ricettatore paga bene, e parecchie chiacchiere d'ufficio.",
      "Telecamere da mettere in loop per fermare il trace, fatture da stornare, libri mastri da copiare, rubriche da sfogliare, badge da stamparsi per rientrare il giorno dopo dalla porta principale.",
      "Reti interne: 66 macchine che da fuori non rispondono, dietro le aziende, le banche e i laboratori più protetti. Ci si arriva solo mappando la rete da admin, e la finestra dura 15 minuti. Il bottino migliore sta lì.",
      "Per i blu: rivedere i nastri per ricostruire righe sparite dal log, revocare i badge sospetti, mettere in allerta il personale.",
      "8 operazioni nuove: «Sono dell'assistenza», «C'è posta per te», «Gola profonda», «Dietro lo specchio», «Undici uomini e un nastro»…",
      "48 traguardi nuovi: 444 in tutto.",
    ],
  },
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
