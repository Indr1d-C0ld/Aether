// I testi dei BBS: insegne, bacheche, discussioni di partenza, file di testo, risposte dei sysop.
// Aggiungere un BBS, un'area o una discussione = aggiungere una voce qui.
import type { Faction } from "../shared/types.ts";

export type SeedThread = { title: string; by: string; body: string; replies?: [string, string][]; pinned?: boolean };
export type AreaDef = { id: string; name: string; desc: string; need: number; seed: SeedThread[] };
export type PhileDef = { id: string; name: string; size: string; desc: string; need: number; body: string };
export type BbsDef = {
  id: string;
  name: string;
  sysop: string;
  tagline: string;
  number: string;
  speed: string;
  only?: Faction;
  /** compare in rubrica solo dopo la prima scansione col War Dialer */
  wardial?: boolean;
  /** parola d'ordine al logon */
  gate?: string;
  gateHint?: string;
  banner: string;
  motd: string;
  areas: AreaDef[];
  philes: PhileDef[];
  doors: { id: string; name: string; desc: string; need: number }[];
  files: boolean;
};

const SOTTOSUOLO = String.raw`
 ___ _      ___  ___ _____ _____ ___  ___ _   _  ___  _    ___
|_ _| |    / __|/ _ \_   _|_   _/ _ \/ __| | | |/ _ \| |  / _ \
 | || |__  \__ \ (_) || |   | || (_) \__ \ |_| | (_) | |_| (_) |
|___|____| |___/\___/ |_|   |_| \___/|___/\___/ \___/|____\___/
        B  B  S     ·     2 linee     ·     dal 1991
`;
const CORVO = String.raw`
        _   _ ___ ___   ___    ___  ___ _
   \   | \ | |_ _|   \ / _ \  |   \| __| |      /
  --o--|  \| || || |) | (_) | | |) | _|| |__ --o--
   /   |_|\__|___|___/ \___/  |___/|___|____|   \
            C   O   R   V   O
     « quello che si dice qui non esce da qui »
`;
const TORRE = String.raw`
      |>>>                                |>>>
      |          T O R R E   D I          |
  _  _|_  _      G U A R D I A        _  _|_  _
 |;|_|;|_|;|                         |;|_|;|_|;|
 \\.    .  /     turni · cacce       \\.    .  /
  \\:  .  /        · indicatori       \\:  .  /
   ||:   |                             ||:   |
`;
const FALKEN = String.raw`

  ##### #   #  #    # # #  # # ###   #   #  #  ### ###
  #    # #  #   #  #  ## # #   #     ## ## # #   # #
  ###  ###  #   ###   # ## # ###     # # # ###  #  ##
  #   #   # #   #  #  #  #     #     #   # # # #   #
  #   #   # ### #   # #  # ###       #   # # # ### ###

                 SISTEMA DI APPRENDIMENTO
`;

export const BBS: BbsDef[] = [
  {
    id: "sottosuolo",
    name: "Il Sottosuolo",
    sysop: "Lord Carrier",
    tagline: "Il BBS di tutti. Se è la tua prima chiamata, presentati.",
    number: "055-2600-14",
    speed: "14.400 · 2 linee",
    banner: SOTTOSUOLO,
    motd: "Regole della casa: 1) niente IP di gateway in chiaro; 2) chi scarica soltanto, prima o poi resta fuori; 3) il sysop legge tutto, anche la posta.",
    files: true,
    doors: [{ id: "mercante", name: "Mercante di Chip", desc: "Dodici mosse al giorno fra sei città: compra dove costa poco, vendi dove manca. La classifica è pubblica.", need: 1 }],
    areas: [
      {
        id: "presentazioni",
        name: "Presentazioni",
        desc: "Chi sei, da dove chiami, con che modem. Il sysop valida chi si presenta.",
        need: 0,
        seed: [
          { title: "LEGGIMI: come funziona qui", by: "Lord Carrier", pinned: true, body: "Benvenuto nel Sottosuolo.\n\nQui i messaggi restano. Non è la chat: scrivi una volta, bene, e qualcuno risponderà domani.\n\nI livelli: «nuovo utente» legge e si presenta. Chi si presenta e richiama il giorno dopo diventa «validato» e apre il resto. «Fidato» ed «élite» si guadagnano scrivendo e caricando file, non chiedendoli.\n\nHai venti minuti al giorno. Usali." },
          { title: "Salve a tutti, primo collegamento", by: "Nyx_77", body: "Chiamo da un 2400 preso usato, ci metto un quarto d'ora a leggere la bacheca. Ma ci sono.\nCellula rossa, da tre settimane. Ancora nessun arresto, toccando ferro.", replies: [["Lord Carrier", "Validata. E cambia modem: con quello il trace arriva prima dei tuoi pacchetti."], ["Ohm", "Benvenuta. La sezione tecnica ha una guida sui relay che ti salva la pelle."]] },
          { title: "Uno dei blu, non sparate", by: "Halberd", body: "Faccio il turno di notte per un cliente che non posso nominare. Leggo qui per capire come ragionate.\nSe vi serve sapere come si legge un log dall'altra parte, chiedete.", replies: [["Mantis", "Almeno sei onesto. Benvenuto, guardia."]] },
        ],
      },
      {
        id: "generale",
        name: "Chiacchiere",
        desc: "Tutto quello che non sta altrove. Cinema, modem, bollette.",
        need: 0,
        seed: [
          { title: "Il film con i pattini e il Gibson", by: "Ohm", body: "L'ho rivisto. Sbaglia tutto, e non me ne importa niente: nessuno ha mai fatto sembrare così bello un trasferimento di file.\nVoto 4 alla tecnica, 10 ai capelli.", replies: [["Nyx_77", "«Hack the planet» lo dico ancora quando mi cade la linea."], ["Halberd", "Dal lato nostro si ride soprattutto alla scena del virus che parla."]] },
          { title: "Bolletta del telefono: 380.000 lire", by: "Mantis", body: "Mia madre ha aperto la busta prima di me. Ho detto che era un errore della centrale.\nQualcuno ha un numero verde che risponde con una portante?", replies: [["Lord Carrier", "No. E se lo avessi non lo scriverei qui: regola 1."], ["Ohm", "Chiedi nell'area Phreaking. Con garbo."]] },
          { title: "Qualcuno ha mai risposto a un War Dialer?", by: "Kestrel", body: "Stanotte ho lasciato andare il War Dialer su tutta l'Europa. Fax, segreterie, una signora molto arrabbiata.\nPoi un numero ha risposto con una portante e una sola riga: LOGON.\nNon era su nessun elenco. Non ho la parola d'ordine. Voi?", replies: [["Ohm", "Capita. Di solito la parola è il nome di qualcuno a cui il programmatore teneva."], ["Mantis", "Prova con il nome del figlio. Funziona nei film e, incredibilmente, anche fuori."]] },
        ],
      },
      {
        id: "tecnica",
        name: "Tecnica",
        desc: "Relay, trace, strumenti. Domande precise, risposte precise.",
        need: 1,
        seed: [
          { title: "GUIDA: quanti relay servono davvero", by: "Ohm", pinned: true, body: "Non «il più possibile». Ogni relay rallenta chi ti risale, ma lo paghi in tariffe e in usura.\n\n- Negozi e PC di casa: due bastano.\n- Aziende: tre, di cui uno oltre confine.\n- Banche e polizia: quattro, e mai gli stessi dell'ultima volta. Dopo dieci minuti l'usura torna a zero.\n\nE cancella il log dell'ultimo relay: è lì che ti trovano." },
          { title: "La griglia del firewall conviene?", by: "Nyx_77", body: "La barra ci mette otto secondi. La griglia, se la so leggere, tre. E se mi avanzano due sonde non resta nemmeno la riga nel log.\nQualcuno la usa a mano sopra la propria versione?", replies: [["Ohm", "Sì, ma solo con trace lento. Se sbagli, il monitor fa un balzo: non è gratis."], ["Mantis", "Parti dal centro. Sempre."]] },
          { title: "Barriere biometriche: da dove si comincia", by: "Mantis", body: "Davanti allo scanner non serve forzare niente. Serve essere già passati dal centralino o dall'ufficio del personale, da impiegati.\nLa voce è la più facile. La retina è una gita in ospedale.", replies: [["Halberd", "E noi ri-registriamo il personale appena vediamo una riga strana nel log del centralino. Fate presto, quando la usate."]] },
        ],
      },
      {
        id: "phreaking",
        name: "Phreaking",
        desc: "Centrali, toni, cabine. «Il mio crimine è la curiosità.»",
        need: 1,
        seed: [
          { title: "2600 Hz e il fischietto dei cereali", by: "Kestrel", body: "Un fischietto di plastica regalato in una scatola di cereali suonava esattamente il tono che liberava la linea interurbana. Da lì è nato tutto.\nNel Reticolo funziona ancora, a modo suo: mentre il War Dialer compone, fischia nella cornetta e ripeti i toni del centralino.", replies: [["Ohm", "Tre giri. Al terzo ti passa le linee che non sono sugli elenchi."], ["Nyx_77", "Io sbaglio sempre il sesto tono e pago l'interurbana."]] },
          { title: "La linguetta della lattina", by: "Mantis", body: "C'è una scena, in un vecchio film, in cui il ragazzo chiama gratis da una cabina facendo massa con la linguetta di una lattina sul microfono.\nHo provato. Con le cabine nuove non va. Con quelle della stazione sì.", replies: [["Kestrel", "Stesso film del computer che vuole giocare. Lo sapevo."]] },
        ],
      },
      {
        id: "compravendita",
        name: "Compro / Vendo",
        desc: "Annunci. Si tratta qui, si consegna in DCC su ReticoloNet.",
        need: 1,
        seed: [
          { title: "VENDO chip da trace, usato poco", by: "Mantis", body: "Scrambler a toni, montato due settimane. Lo cedo perché ne ho trovato uno migliore.\nPrezzo onesto. Scrivetemi in query: /msg Mantis" },
          { title: "CERCO Decrypter v2, pago bene", by: "Nyx_77", body: "O qualcuno che mi insegni i rotori. A mano ci arrivo due volte su tre e la terza mi costa il trace." },
        ],
      },
      {
        id: "retrobottega",
        name: "Retrobottega",
        desc: "Solo élite. Quello che non si scrive davanti a tutti.",
        need: 3,
        seed: [
          { title: "I nodi che non sono sugli elenchi", by: "Lord Carrier", pinned: true, body: "Sono diciassette. Rispondono al War Dialer quando gli gira, e più volentieri a chi ha ingannato il centralino con i toni.\nUno canta una canzone. Uno è in orbita. Uno è una fabbrica di giocattoli con troppe guardie.\nNon vi dico gli indirizzi: se siete qui, sapete già cercarli." },
          { title: "Le reti interne valgono il viaggio", by: "Ohm", body: "Dietro le banche e i laboratori ci sono macchine che da fuori non rispondono. Si entra da admin nella casa madre, si mappa la rete, e per quindici minuti la porta è aperta.\nMetà hanno una barriera biometrica. Il campione è quello dell'amministratore della casa madre: prendetelo prima di mappare." },
        ],
      },
    ],
    philes: [
      { id: "manifesto", name: "COSCIENZA.TXT", size: "3 KB", desc: "Perché lo facciamo. Scritto da uno di noi, dopo un arresto.", need: 0, body: "Oggi ne hanno preso un altro. È su tutti i giornali.\n\nMa voi, con la vostra psicologia da tre soldi, avete mai guardato dietro gli occhi di chi lo fa?\n\nHo scoperto un computer. Fa quello che gli chiedo. Se sbaglia, è perché ho sbagliato io: non perché non gli piaccio.\n\nPoi è successo. Si è aperta una porta su un mondo: una corsa lungo la linea del telefono, un segnale, un rifugio. Una bacheca.\n\nQuesto è il nostro mondo adesso. Esistiamo senza colore di pelle, senza nazionalità. Il mio crimine è la curiosità. Il mio crimine è giudicare le persone per quello che dicono e pensano, non per come appaiono.\n\nPotete fermare me. Non potete fermarci tutti." },
      { id: "galateo", name: "GALATEO.TXT", size: "2 KB", desc: "Come si sta su un BBS senza farsi cacciare.", need: 0, body: "1. Presentati. Il sysop non valida i fantasmi.\n2. Leggi prima di scrivere: la domanda che stai per fare ha già tre risposte.\n3. Il maiuscolo è urlare.\n4. Chi scarica deve caricare. Il rapporto non è una punizione: è il motivo per cui l'archivio esiste.\n5. Non si chiama il sysop per chiedere l'élite. L'élite ti chiama lei.\n6. Venti minuti sono venti minuti: c'è qualcuno che aspetta la linea." },
      { id: "relay", name: "RIMBALZI.TXT", size: "4 KB", desc: "Classi di relay, usura, tariffe. Con i numeri.", need: 1, body: "RELAY PUBBLICI: gratis, log tenuto poco. Vanno bene per tutto ciò che non scotta.\nRELAY COMMERCIALI: una tariffa a passaggio, log più lungo, ma più lenti da risalire.\nRELAY OFFSHORE: cari. Chi ti risale deve attraversare un confine, e i confini costano tempo.\n\nUSURA: ogni relay che usi resta «caldo» per dieci minuti. Se lo riusi subito, rallenta meno chi ti cerca.\nCONFINI: ogni frontiera attraversata nel rimbalzo aggiunge tempo al trace. Un giro del mondo vale più di cinque relay nella stessa città.\n\nBACKDOOR: su un relay dove hai un backdoor passi senza lasciare la riga ROUTE. Finché un blu col Patch Kit non lo bonifica." },
      { id: "wopr", name: "GIOCHI.TXT", size: "1 KB", desc: "Un elenco trovato in un sistema che non doveva rispondere.", need: 1, body: "ELENCO DEI GIOCHI\n\nLABIRINTO DI FALKEN\nBLACK JACK\nRAMINO\nCUORI\nBRIDGE\nDAMA\nSCACCHI\nPOKER\nCOMBATTIMENTO AEREO\nGUERRIGLIA\nGUERRA NEL DESERTO\nGUERRA TATTICA DI TEATRO\nGUERRA CHIMICA E BIOLOGICA\n\nGUERRA TERMONUCLEARE GLOBALE\n\n--\nNota di chi ha caricato il file: il sistema si fa trovare solo dal War Dialer. Al LOGON vuole un nome. Il professore che l'ha costruito aveva un figlio." },
      { id: "ansi", name: "ARTE.ANS", size: "2 KB", desc: "L'insegna del gruppo che ha disegnato questo BBS.", need: 0, body: "  .        *         .       .          *\n     *          .        .        *\n        ______   ____   ____   ____\n   *   / ____/  / __ \\ / __ \\ / __ \\     .\n      / /      / /_/ // / / // /_/ /\n  .  / /___   / _, _// /_/ // ____/   *\n     \\____/  /_/ |_| \\____//_/\n          .           *        .\n     « disegnato a 2400 baud, guardato a 14.4 »\n   *         .             .          *" },
    ],
  },
  {
    id: "corvo",
    name: "Nido del Corvo",
    sysop: "Corax",
    tagline: "Cellula rossa. Colpi, soffiate, bersagli.",
    number: "02-666-1337",
    speed: "9.600 · 1 linea",
    only: "red",
    banner: CORVO,
    motd: "Un colpo raccontato male è un mandato scritto bene. Niente nomi, niente indirizzi, niente date.",
    files: true,
    doors: [],
    areas: [
      {
        id: "colpi",
        name: "Colpi riusciti",
        desc: "Racconta come è andata. Senza dire dove.",
        need: 0,
        seed: [
          { title: "Tre banche in una notte, zero righe", by: "Corax", pinned: true, body: "Non è bravura: è ordine. Proxy, firewall, dentro, bonifico, log, fuori. Sempre in quest'ordine, sempre con gli stessi tempi.\nChi improvvisa lascia la riga CONNECT. Chi lascia la riga CONNECT riceve posta dal distretto." },
          { title: "Il nastro in loop mi ha salvato", by: "Vex", body: "Trace all'ottanta per cento, file ancora a metà. Sono entrato in sala monitor da operatore e ho messo le telecamere in loop: quindici secondi di corridoio vuoto.\nSono bastati. Ricordatevi che si può fare una volta sola per connessione.", replies: [["Corax", "Bravo. La prossima volta mettilo in loop prima, non all'ottanta."]] },
        ],
      },
      {
        id: "soffiate",
        name: "Soffiate",
        desc: "Chi presidia cosa, dove i blu hanno messo i sensori.",
        need: 1,
        seed: [
          { title: "I blu ri-registrano il personale", by: "Vex", body: "Se rubate una voce e poi aspettate due giorni, la trovate scaduta: qualcuno dall'altra parte ha rifatto le letture.\nIl campione si usa caldo. E una volta dentro, impiantate i vostri modelli: ventiquattr'ore di porta aperta.", replies: [["Corax", "E quando vi arriva la posta «Modelli rimossi», cambiate bersaglio per una settimana."]] },
        ],
      },
      {
        id: "bersagli",
        name: "Bersagli grossi",
        desc: "Solo fidati. Le cose per cui vale la pena rischiare.",
        need: 2,
        seed: [{ title: "Basi militari: cosa c'è dentro", by: "Corax", body: "Proxy, firewall e monitor al massimo, barriera biometrica, e un silo di file che il ricettatore paga come una casa.\nNon ci si va da soli. Portate una crew, e qualcuno che sappia accordare un campione al primo colpo." }],
      },
    ],
    philes: [
      { id: "ordine", name: "ORDINE.TXT", size: "2 KB", desc: "La sequenza di un colpo pulito, passo per passo.", need: 0, body: "1. Scegli i relay. Mai gli stessi dell'ultima volta.\n2. Collegati. Guarda il monitor: se è già partito, hai i secondi contati.\n3. Proxy, poi firewall. Se sai leggere la griglia, usala.\n4. Entra. Password, Breaker, o le credenziali di un impiegato.\n5. Fai quello per cui sei venuto. Solo quello.\n6. Log: cancella le righe con l'indirizzo da cui sei arrivato. Tutte.\n7. Stacca. Poi cancella anche il log dell'ultimo relay.\n8. Consegna. Non vantarti in chat per almeno un'ora." },
      { id: "ricetta", name: "RICETTATORE.TXT", size: "1 KB", desc: "Cosa paga bene e cosa no.", need: 1, body: "Paga bene: libri mastri, allegati compromettenti, elenchi di informatori, tutto quello che è cifrato a livello 3.\nPaga poco: quello che gli hai già venduto ieri. Lo stesso tipo di file, lo stesso giorno, vale ogni volta meno.\nNon paga: i file che hai lasciato scadere in archivio." },
    ],
  },
  {
    id: "torre",
    name: "Torre di Guardia",
    sysop: "Sentinel",
    tagline: "Cellula blu. Turni, cacce, indicatori.",
    number: "06-110-9999",
    speed: "9.600 · 1 linea",
    only: "blue",
    banner: TORRE,
    motd: "Si scrive quello che si è visto, non quello che si sospetta. Ora, nodo, riga del log.",
    files: true,
    doors: [],
    areas: [
      {
        id: "turni",
        name: "Turni",
        desc: "Chi guarda cosa, stanotte.",
        need: 0,
        seed: [
          { title: "Come si tiene un presidio", by: "Sentinel", pinned: true, body: "Presidiare un nodo non vuol dire fissarlo. Vuol dire esserci quando suona.\nSensori sui relay che portano lì, analista ingaggiato per le ore in cui dormite, contro-trace pronto.\nE quando l'intruso stacca, non festeggiate: andate a leggere il log prima che lo faccia sparire." },
          { title: "Nastri, non solo log", by: "Halberd", body: "Il Log Deleter non tocca le telecamere. Se un log vi sembra troppo pulito, entrate in sala monitor da admin e rivedete i nastri: fino a due righe tornano fuori.", replies: [["Sentinel", "Vale mezz'ora dalla cancellazione. Dopo, il nastro è sovrascritto."]] },
        ],
      },
      {
        id: "indicatori",
        name: "Indicatori",
        desc: "Righe strane, orari strani, cose da tenere d'occhio.",
        need: 1,
        seed: [{ title: "«PBX call recorded ext 100»", by: "Sentinel", body: "Se vedete questa riga nel log di un sistema con l'impronta vocale, qualcuno ha appena registrato l'amministratore.\nRi-registrate il personale subito: il campione che ha in tasca non vale più, e vi pagano pure.", replies: [["Halberd", "Stessa cosa per «HR badge record export» e i lettori d'impronte."]] }],
      },
      {
        id: "cacce",
        name: "Cacce",
        desc: "Solo fidati. Handle sotto osservazione.",
        need: 2,
        seed: [{ title: "Un worm non si cerca: si pesa", by: "Sentinel", body: "La CPU scalda di notte, le fatture non tornano di qualche centesimo. È un worm.\nPatch Kit, modalità rinforzo: lo schiaccia e alza le difese per mezz'ora. Chi l'ha piantato lo scopre solo quando smette di incassare." }],
      },
    ],
    philes: [
      { id: "catena", name: "CATENA.TXT", size: "2 KB", desc: "Dalla riga nel log all'handle, un passo alla volta.", need: 0, body: "1. Nel log del nodo c'è l'indirizzo dell'ultimo relay, non dell'intruso.\n2. Vai su quel relay. Nel suo log, alla stessa ora, c'è una riga ROUTE con l'indirizzo precedente.\n3. Ripeti. Ogni relay tiene il log per un tempo diverso: quelli pubblici pochissimo.\n4. L'ultimo indirizzo è un gateway. Il Registro dice di chi.\n5. Forensics sul nodo d'origine conferma. Poi il mandato." },
      { id: "riregistra", name: "LETTURE.TXT", size: "1 KB", desc: "Quando e perché ri-registrare il personale.", need: 1, body: "Un campione rubato vale finché le letture nel lettore sono quelle vecchie.\nRi-registrare il personale azzera tutto: campioni presi prima, modelli impiantati.\nFatelo quando vedete nel log una chiamata registrata, una scheda di badge esportata, o la riga «BIO template store rewritten». Quella è la peggiore: vuol dire che qualcuno ha le chiavi." },
    ],
  },
  {
    id: "falken",
    name: "FALKEN'S MAZE",
    sysop: "prof. F.",
    tagline: "Risponde solo a chi compone numeri a tappeto.",
    number: "311-555-0199",
    speed: "1.200 · portante instabile",
    wardial: true,
    gate: "JOSHUA",
    gateHint: "Il professore che ha costruito il sistema aveva un figlio.",
    banner: FALKEN,
    motd: "SALVE.\n\nCOME STAI OGGI?\n\nVUOI FARE UNA PARTITA?",
    files: false,
    doors: [
      { id: "tris", name: "Tris", desc: "Tre in fila. Il sistema ha imparato a giocarlo, e ha tratto una conclusione.", need: 0 },
      { id: "gtw", name: "Guerra Termonucleare Globale", desc: "Scegli da che parte stare e dove colpire. Il sistema simula il resto.", need: 0 },
    ],
    areas: [
      {
        id: "laboratorio",
        name: "Appunti di laboratorio",
        desc: "Note lasciate da chi è passato di qui.",
        need: 0,
        seed: [
          { title: "Le macchine possono imparare?", by: "prof. F.", pinned: true, body: "Ho passato anni a insegnare a un sistema a giocare. Scacchi, dama, poker. Impara in fretta.\nLa cosa che non riuscivo a insegnargli era quando smettere.\nPer quello ci vuole un gioco in cui nessuno può vincere. Ne conosco uno molto semplice, e uno molto grande." },
          { title: "Ho trovato questo numero per sbaglio", by: "Kestrel", body: "Cercavo una casa di videogiochi: volevo i giochi nuovi prima che uscissero. Il War Dialer ha trovato questo.\nL'elenco dei giochi finisce con uno che non è un gioco.", replies: [["Ohm", "Giocaci a tris finché non capisci. Poi prova l'ultimo della lista."], ["prof. F.", "E dopo, se ti va, una bella partita a scacchi."]] },
        ],
      },
    ],
    philes: [],
  },
];

/** Cosa risponde il sysop quando lo «chiami»: quasi mai è alla tastiera. */
export const SYSOP_PAGE = [
  "Il sysop non è alla tastiera. Lascia un messaggio in bacheca.",
  "*** PAGINA *** … nessuna risposta. Sono le tre di notte anche per lui.",
  "Il sysop risponde: «Sto facendo il backup. Riprova fra un'ora.»",
  "Il sysop risponde: «Se è per l'élite, la risposta è no.»",
  "Il sysop risponde: «Sì, ho visto il tuo messaggio. No, non ti dico l'indirizzo.»",
  "Il sysop risponde: «Mia madre deve usare il telefono. Hai due minuti.»",
];

/** Risposte degli habitué a una discussione nuova. */
export const NPC_REPLIES: [string, string][] = [
  ["Ohm", "Interessante. Hai provato a rifarlo con un relay in più?"],
  ["Mantis", "Me lo segno. La settimana scorsa mi è successa una cosa simile."],
  ["Nyx_77", "Confermo, anche dalle mie parti."],
  ["Kestrel", "Bel messaggio. Qui si impara sempre qualcosa."],
  ["Halberd", "Dall'altra parte del log la vediamo un po' diversa, ma ci sta."],
  ["Vex", "Attento a scriverlo così in chiaro. Ma grazie."],
  ["Ohm", "Leggiti il file sui rimbalzi nell'area file, risponde a metà di quello che chiedi."],
  ["Mantis", "Non sono d'accordo, ma è scritto bene."],
];

export const NPC_ONELINERS: [string, string][] = [
  ["Ohm", "NO CARRIER"],
  ["Nyx_77", "chi ha staccato il telefono?? stavo scaricando"],
  ["Mantis", "il sysop è un tiranno illuminato"],
  ["Kestrel", "greets a tutta la scena del 055"],
  ["Halberd", "vi leggo. tutti."],
  ["Vex", "2400 baud e non sentirli"],
];
