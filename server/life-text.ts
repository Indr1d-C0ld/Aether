// La popolazione virtuale del Reticolo: chi sono, dove vivono, a che ora sono svegli, e cosa dicono.
// I testi hanno dei segnaposto che il mondo riempie al momento: {org} un'organizzazione vera, {city} la città
// di chi parla, {ora} la sua ora locale, {virus} un ceppo in giro, {chi} un altro habitué, {relay} un relay.
import type { DayPart } from "../shared/clock.ts";

export type Persona = {
  handle: string;
  city: string;
  x: number; // posizione sulla mappa: da qui il fuso
  wake: number; // ora locale in cui si collega
  sleep: number; // ora locale in cui stacca (può scavalcare la mezzanotte)
  side: "red" | "blue" | "any";
  bbs: string[];
  about: string;
};

/** Trenta persone. Non sono bot: hanno un fuso, un lavoro di giorno e un'ora in cui la madre stacca il telefono. */
export const PERSONAS: Persona[] = [
  { handle: "Ohm", city: "Bologna", x: 170, wake: 21, sleep: 3, side: "any", bbs: ["sottosuolo", "falken"], about: "tecnico radio, risponde sempre con una guida" },
  { handle: "Mantis", city: "Torino", x: 167, wake: 18, sleep: 1, side: "red", bbs: ["sottosuolo", "corvo"], about: "studente fuori corso, bolletta a tre zeri" },
  { handle: "Nyx_77", city: "Napoli", x: 173, wake: 22, sleep: 5, side: "red", bbs: ["sottosuolo", "corvo"], about: "modem a 2400, pazienza infinita" },
  { handle: "Kestrel", city: "Trieste", x: 172, wake: 19, sleep: 2, side: "any", bbs: ["sottosuolo", "falken"], about: "colleziona numeri che non sono sugli elenchi" },
  { handle: "Halberd", city: "Roma", x: 171, wake: 7, sleep: 17, side: "blue", bbs: ["sottosuolo", "torre"], about: "turno di giorno in una sala operativa" },
  { handle: "Vex", city: "Genova", x: 168, wake: 23, sleep: 6, side: "red", bbs: ["corvo"], about: "non scrive mai prima di mezzanotte" },
  { handle: "Corax", city: "Milano", x: 168, wake: 20, sleep: 2, side: "red", bbs: ["corvo"], about: "sysop del Nido" },
  { handle: "Sentinel", city: "Roma", x: 171, wake: 6, sleep: 22, side: "blue", bbs: ["torre"], about: "sysop della Torre, dorme poco" },
  { handle: "Lord Carrier", city: "Firenze", x: 170, wake: 17, sleep: 1, side: "any", bbs: ["sottosuolo"], about: "sysop del Sottosuolo" },
  { handle: "Tsuki", city: "Chiba", x: 284, wake: 20, sleep: 4, side: "red", bbs: ["sottosuolo", "corvo"], about: "scrive quando in Europa è ora di pranzo" },
  { handle: "Ratchet", city: "San Francisco", x: 51, wake: 19, sleep: 3, side: "any", bbs: ["sottosuolo", "falken"], about: "saldatore sempre caldo, deck fatto in casa" },
  { handle: "Blackbird", city: "New York", x: 94, wake: 21, sleep: 4, side: "red", bbs: ["sottosuolo", "corvo"], about: "telefona dalle cabine della stazione" },
  { handle: "Ferro", city: "Berlino", x: 172, wake: 16, sleep: 0, side: "any", bbs: ["sottosuolo"], about: "ha visto cadere un muro e non si fida di nessuna rete" },
  { handle: "Zaira", city: "Lagos", x: 163, wake: 19, sleep: 1, side: "red", bbs: ["sottosuolo", "corvo"], about: "la linea cade ogni venti minuti, lei no" },
  { handle: "Quanta", city: "San Paolo", x: 119, wake: 20, sleep: 3, side: "any", bbs: ["sottosuolo"], about: "scrive macro per mestiere, virus per hobby (dice)" },
  { handle: "Dorian", city: "Londra", x: 160, wake: 8, sleep: 18, side: "blue", bbs: ["sottosuolo", "torre"], about: "analista, firma tutto con l'ora esatta" },
  { handle: "Mirtillo", city: "Padova", x: 171, wake: 14, sleep: 20, side: "any", bbs: ["sottosuolo"], about: "tredici anni, il modem è del padre" },
  { handle: "Sibilla", city: "Palermo", x: 172, wake: 22, sleep: 4, side: "any", bbs: ["sottosuolo", "falken"], about: "risponde alle domande con altre domande" },
  { handle: "Grendel", city: "Mosca", x: 193, wake: 18, sleep: 2, side: "red", bbs: ["corvo"], about: "parla poco, e mai di dove" },
  { handle: "Wren", city: "Sydney", x: 294, wake: 19, sleep: 1, side: "blue", bbs: ["torre", "sottosuolo"], about: "copre il buco di notte dell'Europa" },
  { handle: "Baud", city: "Cagliari", x: 168, wake: 21, sleep: 2, side: "any", bbs: ["sottosuolo"], about: "pesa tutto in baud, anche le persone" },
  { handle: "Lince", city: "Bolzano", x: 170, wake: 6, sleep: 9, side: "blue", bbs: ["torre"], about: "si collega solo prima di andare al lavoro" },
  { handle: "Tarlo", city: "Bari", x: 175, wake: 0, sleep: 7, side: "red", bbs: ["corvo", "sottosuolo"], about: "insonne dichiarato" },
  { handle: "Oxide", city: "Detroit", x: 86, wake: 22, sleep: 5, side: "red", bbs: ["corvo"], about: "fabbrica chiusa, modem acceso" },
  { handle: "Marlene", city: "Vienna", x: 175, wake: 9, sleep: 13, side: "any", bbs: ["sottosuolo"], about: "si collega dall'ufficio, quando il capo è in riunione" },
  { handle: "Pixel", city: "Rimini", x: 171, wake: 15, sleep: 23, side: "any", bbs: ["sottosuolo"], about: "disegna le insegne ANSI di mezza scena" },
  { handle: "Kowalski", city: "Varsavia", x: 179, wake: 19, sleep: 1, side: "blue", bbs: ["torre"], about: "ex centralinista, riconosce una centrale dal clic" },
  { handle: "Nonna_Papera", city: "Perugia", x: 171, wake: 10, sleep: 12, side: "any", bbs: ["sottosuolo"], about: "nessuno sa chi sia; scrive solo a metà mattina" },
  { handle: "Yuki", city: "Osaka", x: 280, wake: 22, sleep: 5, side: "any", bbs: ["sottosuolo", "falken"], about: "gioca a scacchi per corrispondenza con una macchina" },
  { handle: "Brasa", city: "Buenos Aires", x: 108, wake: 21, sleep: 4, side: "red", bbs: ["corvo", "sottosuolo"], about: "racconta ogni colpo come una partita di calcio" },
];

/** Chiacchiere in chat, per fascia oraria di chi parla. */
export const CHAT_BY_PART: Record<DayPart, string[]> = {
  notte: [
    "sono le {ora} e sono ancora qui. domani ho il compito di fisica.",
    "a quest'ora le banche dormono e i log si scrivono da soli",
    "mia madre ha alzato la cornetta in corridoio. ho perso mezz'ora di download.",
    "/me fa il caffè numero quattro",
    "{org} di notte ha il turno ridotto, lo sanno anche i sassi",
    "qualcuno sveglio da {city}? o sono l'ultimo",
    "le tre di notte sono l'unico momento in cui il 14.4 va davvero a 14.4",
    "ho appena visto l'alba dalla parte sbagliata",
    "silenzio in canale. o dormite tutti o siete tutti dentro qualcosa.",
    "a {city} piove. ottimo: nessuno esce, nessuno stacca il telefono.",
    "il trace di notte è più lento, ma lo sono anch'io",
    "/me controlla che il Log Deleter abbia finito. ha finito. ricontrolla.",
  ],
  alba: [
    "vado a dormire. chi resta spenga la luce.",
    "tra un'ora aprono gli uffici a {city}. chi deve finire, finisca.",
    "buongiorno a chi si sveglia, buonanotte a me",
    "il sysop di {org} arriva sempre alle sette e mezza. sempre.",
    "/me spegne il monitor e guarda il soffitto",
    "ho la sveglia fra quaranta minuti. ne è valsa la pena? sì.",
    "prima chiamata della giornata: tutto libero, tutto veloce",
    "gli uccellini. odio gli uccellini.",
  ],
  mattina: [
    "sono in ufficio, parlo piano. cioè scrivo piano.",
    "a quest'ora al centralino di {org} risponde una persona vera. occhio.",
    "il capo è in riunione fino alle undici: ho un'ora",
    "di mattina con le credenziali di un impiegato non ti guarda nessuno. di notte sì.",
    "/me finge di lavorare a un foglio di calcolo",
    "ho chiamato il BBS dal telefono della scuola. non lo rifarò.",
    "qualcuno sa se {org} ha cambiato la password dell'operatore lunedì?",
    "caffè, cornetto, e una portante che non cade. giornata buona.",
    "i blu di mattina sono svegli e riposati. statevene buoni.",
  ],
  pranzo: [
    "pausa pranzo: a {city} non c'è nessuno alle scrivanie",
    "fra l'una e le due è il momento buono. i monitor li guarda la macchinetta del caffè.",
    "/me mangia un panino sulla tastiera",
    "ho provato a registrare la voce del sysop di {org}: è a pranzo, risponde la segreteria",
    "torno alle due. se cade la linea non è colpa mia",
    "tutti in mensa. i terminali restano accesi e loggati. quanta fiducia nel prossimo.",
  ],
  pomeriggio: [
    "pomeriggio morto. nemmeno un netsplit.",
    "alle sei chiudono gli uffici a {city}: chi vuole la voce dell'amministratore si sbrighi",
    "uscito da scuola, modem acceso. cosa mi sono perso?",
    "{chi} mi deve ancora un dischetto. lo scrivo qui così resta agli atti.",
    "/me aspetta le sei come tutti",
    "ho letto il thread sui relay nel Sottosuolo. {chi} ha ragione, purtroppo.",
    "il venerdì pomeriggio in ufficio non c'è già più nessuno. segnatevelo.",
    "qualcuno ha provato la griglia del firewall a mano su un L3? chiedo per un amico",
  ],
  sera: [
    "le casse dei negozi a quest'ora sono piene. dico per dire.",
    "ora di punta: metà Italia sta chiamando lo stesso BBS",
    "occupato. occupato. occupato. odio le sette di sera.",
    "/me aspetta che scatti la tariffa serale",
    "dopo le dieci costa meno. dopo le dieci ci siamo tutti.",
    "cena, poi si lavora. quello vero.",
    "stasera c'è il film coi pattini in tv. lo guardate anche voi, vero?",
    "a {city} hanno appena chiuso. via libera fra un'ora.",
    "{chi} è entrato adesso su ReticoloNet: la serata comincia",
    "chi viene nel Sottosuolo? c'è una discussione che sta degenerando bene",
  ],
};

/** Chiacchiere che dipendono da quello che sta succedendo. */
export const CHAT_VIRUS = [
  "occhio che gira «{virus}». l'ho visto su tre sistemi oggi.",
  "«{virus}» mi ha mangiato un pomeriggio. aggiornate le firme.",
  "chi ha scritto «{virus}»? non per denunciarlo. per stringergli la mano.",
  "ho scaricato un warez dal Sottosuolo e adesso il modem chiama da solo. non dite niente.",
  "regola numero uno: scansiona prima di installare. regola numero due: vedi la numero uno.",
];
export const CHAT_WEEKEND = [
  "sabato: uffici chiusi fino a lunedì. due giorni di pace.",
  "nel fine settimana nessuno apre le pratiche. le indagini aspettano lunedì.",
  "domenica sera, bolletta alle stelle, zero rimpianti",
  "/me ha tutto il fine settimana e nessuna intenzione di uscire",
];

/** Notizie d'agenzia. {org} e {city} vengono da un nodo vero, con la sua ora. */
export const NEWS_BY_PART: Record<DayPart, string[]> = {
  notte: [
    "{city}, ore {ora}: {org} segnala «attività anomala» sui propri sistemi. Nessuno risponde al telefono fino a domattina.",
    "Notte tranquilla a {city}. I tecnici di {org}: «Quando è tranquilla ci preoccupiamo».",
    "{city}: la centrale telefonica registra un picco di chiamate verso numeri che non esistono.",
    "{org}, turno di notte dimezzato per tagli al personale. Il sindacato protesta, gli hacker ringraziano.",
    "Blackout di sette minuti in un quartiere di {city}. La compagnia elettrica: «Un topo».",
  ],
  alba: [
    "{city} si sveglia. {org} riapre alle otto; i sistemi, dice un tecnico, «non hanno mai chiuso occhio».",
    "Prima pagina a {city}: «Chi sono i ragazzi del modem?». Risponde un sociologo che non ne ha mai visto uno.",
    "{org} annuncia per oggi il cambio di tutte le password. Di nuovo.",
  ],
  mattina: [
    "{city}, ore {ora}: {org} apre regolarmente. In coda agli sportelli si parla del virus della settimana.",
    "{org} assume esperti di sicurezza. Requisiti: cinque anni di esperienza in un campo che ne ha tre.",
    "Convegno a {city} sulla «criminalità informatica». In sala nessun computer.",
    "{org}: nuovo lettore biometrico all'ingresso della sala macchine. Il direttore: «Adesso siamo al sicuro».",
    "Borsa di {city} in apertura: salgono i produttori di modem, scendono le compagnie telefoniche.",
    "Il ministero raccomanda di non aprire programmi ricevuti su dischetto da sconosciuti. Né da conoscenti.",
  ],
  pranzo: [
    "{city}, pausa pranzo: a {org} i terminali restano accesi. Lo dice un ex dipendente, che preferisce l'anonimato.",
    "Sondaggio: il 61% degli impiegati di {city} usa come password il nome di un familiare. Il 20% «password».",
  ],
  pomeriggio: [
    "{org} smentisce l'intrusione di stanotte. «Era manutenzione programmata», dice il portavoce, senza guardare nessuno.",
    "A {city} sequestrati quattordici modem e una collezione di dischetti. Il ragazzo: «Erano giochi».",
    "La Guardia del Reticolo: «Risaliamo sempre all'origine». Poi, a microfoni spenti: «Quasi sempre».",
    "{org} chiude alle diciotto. Per le urgenze c'è una segreteria telefonica.",
    "Bollette: da gennaio la tariffa serale scatta alle 22. Insorgono i genitori di mezza {city}.",
  ],
  sera: [
    "{city}, ore {ora}: linee intasate. La compagnia telefonica: «Non capiamo cosa facciano tutti dopo cena».",
    "{org} ha chiuso. In sala macchine resta una guardia giurata e un televisore.",
    "Stasera in tv un film su un ragazzo che entra in un computer militare. I militari: «Fantascienza».",
    "Chiusura dei negozi a {city}: incassi in crescita. I registratori di cassa sono collegati in rete da quest'anno.",
    "Un BBS di {city} supera i mille utenti. Il sysop: «Ho dovuto mettere una seconda linea. Mia madre non è contenta».",
  ],
};
export const NEWS_VIRUS = [
  "Il virus «{virus}» è stato segnalato a {city}. {org}: «Stiamo valutando».",
  "Allarme «{virus}»: gli esperti consigliano di aggiornare l'antivirus. Chi non ne ha uno, di comprarlo.",
  "«{virus}», identificati i primi sistemi colpiti. Nessuno sa chi l'abbia scritto; qualcuno, in certe bacheche, se ne vanta.",
];

/** Discussioni che gli habitué aprono sui BBS. [area, titolo, testo] */
export const THREADS: [string, string, string][] = [
  ["generale", "Che modem avete?", "Faccio un censimento. Io un 14.4 esterno con le lucine, che è metà del motivo per cui l'ho comprato.\nDite marca, velocità e quante volte al giorno cade la linea."],
  ["generale", "La prima volta che siete entrati", "Non il colpo più grosso: il primo. Il mio è stato il computer della biblioteca. Password: «biblioteca».\nNon ho toccato niente. Ho guardato per un'ora e sono uscito. Non ho dormito."],
  ["generale", "Genitori e bollette, il thread definitivo", "Raccolgo scuse. «È un errore della centrale» non funziona più dalla terza bolletta.\nCosa dite voi a casa?"],
  ["generale", "A {city} sono le {ora} e non dormo", "Fuori è buio, il modem è caldo, e ho finito le cose da leggere.\nQualcuno ha un file di testo nuovo? Qualsiasi cosa. Anche le istruzioni di una lavatrice."],
  ["generale", "Film: classifica onesta", "1. Quello col computer che vuole giocare.\n2. Quello coi pattini.\n3. Quello dove lui ha un cavo dietro la testa e trasporta dati.\nIl resto è rumore. Smentitemi."],
  ["generale", "Chi è Nonna_Papera?", "Scrive solo a metà mattina, sa tutto di centrali telefoniche, non risponde in privato.\nIpotesi: una centralinista in pensione. Ipotesi due: tre persone. Ipotesi tre: il sysop che si annoia."],
  ["generale", "Il fine settimana degli uffici", "Dal venerdì sera al lunedì mattina nessuno apre una pratica. Lo sapete, sì?\nNon dico altro."],
  ["generale", "Ho conosciuto uno dei blu", "Dal vivo, a un mercatino di elettronica. Simpatico. Mi ha detto che legge questa bacheca tutte le mattine col caffè.\nCiao, se stai leggendo. Il caffè è buono?"],
  ["tecnica", "Fusi orari: lavorate dove è notte", "Sulla mappa adesso si vede la fascia d'ombra. Dove è buio la sorveglianza cala, e gli uffici non aprono le pratiche fino al mattino.\nIo seguo la notte: Asia nel nostro pomeriggio, Europa la sera, America all'alba. Non si dorme, ma rende."],
  ["tecnica", "Di giorno con il badge, di notte col Breaker", "Regola che mi sono fatto: in orario d'ufficio entro con le credenziali di un impiegato, e nessuno alza la testa.\nFuori orario un impiegato che si collega è una notizia: allora tanto vale forzare e correre."],
  ["tecnica", "Pausa pranzo", "Tra le 12:30 e le 14, ora loro, chi guarda i monitor è a mangiare. Il trace parte lo stesso, ma più pigro.\nIn compenso al centralino non risponde nessuno: se vi serve una voce, non è il momento."],
  ["tecnica", "Quanto dura davvero una firma", "Ho l'antivirus da una settimana e non l'ho mai aggiornato. Ieri ha detto «pulito» a un programma che non lo era.\nLe firme invecchiano di un punto al giorno. Aggiornatele dal BBS: è gratis mentre siete collegati."],
  ["tecnica", "Polimorfico o rootkit?", "Per una creatura che deve durare: il rootkit si vede meno, il polimorfico sopravvive alla firma.\nIo metto il rootkit sui sistemi grossi e il polimorfico su quello che si replica. Voi?"],
  ["tecnica", "Le casse dei negozi", "Alla chiusura c'è dentro l'incasso della giornata. Al mattino il fondo cassa e basta.\nNon serve una laurea."],
  ["tecnica", "Oscilloscopio: il trucco della fase", "Prima la frequenza (conti le creste), poi l'ampiezza, e solo alla fine la fase.\nL'armonica guardatela sui picchi: se sono a punta, è alta."],
  ["phreaking", "Tariffa serale", "Dalle 22 costa la metà. Dalle 22 ci siamo tutti, e il BBS è occupato.\nSoluzione: chiamare alle 6 del mattino. Nessuno ha mai detto che fosse una bella vita."],
  ["phreaking", "Il sesto tono", "Con la Blue Box arrivo sempre al terzo giro e sbaglio il sesto tono. Sempre il sesto.\nQualcuno ha un metodo? Io li canto, ma stono."],
  ["phreaking", "Cabine che funzionano ancora", "Stazione centrale, binario 9, quella a sinistra. Non chiedetemi come lo so.\nAggiungete le vostre. Niente indirizzi di casa."],
  ["phreaking", "Di notte risponde più roba", "Ho lanciato il War Dialer sull'Asia quando là era notte fonda: ha risposto un numero in più del solito.\nDi notte restano accesi i modem che di giorno qualcuno spegne. Fax, BBS casalinghi, roba dimenticata."],
  ["compravendita", "CERCO modulo «Bootkit»", "Pago bene, o scambio con un «Cifratore» che non uso.\nNiente perditempo, niente blu in incognito."],
  ["compravendita", "VENDO dischetto di avvio pulito", "Protetto da scrittura, mai usato su macchine infette (lo so che è il suo scopo, ma avete capito).\nSi tratta in query su ReticoloNet."],
  ["compravendita", "SCAMBIO exploit con ore di sonno", "Ho tre 0-day Firewall e non dormo da martedì.\nScherzo. Li vendo e basta."],
  ["colpi", "La cassa alle 19:55", "Negozio di dischi, cinque minuti prima della chiusura. C'era dentro tutto il sabato.\nNiente di tecnico: bastava guardare l'orologio."],
  ["colpi", "Ho seguito la notte per ventiquattr'ore", "Sei regioni, sei colpi, tutti dove era buio. Alla fine ero più stanco io dei loro monitor.\nNon lo rifarò. Fino a sabato."],
  ["colpi", "Un RAT che rende da tre giorni", "L'ho messo in un ufficio che di notte chiude. Innesco «turno di notte»: di giorno non esiste, la sera si sveglia e mi apre la porta.\nNessuno l'ha ancora visto."],
  ["soffiate", "I blu fanno i turni col fuso", "Hanno gente in Australia che copre la nostra notte. Se pensate che alle quattro non guardi nessuno, vi sbagliate di otto ore."],
  ["soffiate", "{org}: hanno cambiato tutto", "Password dell'operatore nuova da lunedì, e hanno ri-registrato il personale. Chi aveva un campione lo butti."],
  ["turni", "Chi copre stanotte?", "Io fino alle due. Dopo servirebbe qualcuno dall'altra parte del mondo.\nI rossi lavorano dove è buio: seguite l'ombra sulla mappa e saprete dove guardare."],
  ["turni", "Lunedì mattina", "Ogni lunedì alle otto si aprono tutte insieme le pratiche del fine settimana. È il momento peggiore per loro e il migliore per noi.\nSiate svegli."],
  ["indicatori", "Login di un impiegato alle 3:12", "Stesso nome, stessa password, ma alle tre di notte. Nessuno lavora alle tre di notte, in quell'ufficio.\nGuardate gli orari prima delle righe."],
  ["indicatori", "«AV quarantine: suspicious object»", "Se la vedete in un log vuol dire che l'antivirus residente ha preso qualcosa da solo. Bene.\nSe non la vedete e la CPU scalda, vuol dire che non l'ha presa. Scansionate voi."],
  ["laboratorio", "Ho giocato cento partite a tris", "Novantasette pari, tre perse (errori miei). Nessuna vinta.\nPoi il sistema ha scritto una frase, e ho spento."],
  ["laboratorio", "A che ora risponde meglio", "Questo numero ha la portante instabile di giorno e pulita di notte. Come se di giorno qualcuno lo stesse usando."],
];

/** Risposte a una discussione, per umore. Gli habitué le pescano a caso. */
export const REPLIES = [
  "Confermo. Provato ieri sera, è andata esattamente così.",
  "Dipende dall'ora. Di giorno è un'altra storia.",
  "Bella domanda. Non lo so, ma leggo con interesse.",
  "A {city} funziona diverso: qui chiudono alle cinque.",
  "L'avevo scritto anch'io sei mesi fa e nessuno mi aveva creduto.",
  "Non sono d'accordo su niente, ma è scritto bene.",
  "Prova di notte, la loro. Guarda l'ombra sulla mappa.",
  "Sì, ma poi aggiorna le firme, che se no è tutto inutile.",
  "Io aspetterei lunedì mattina. O venerdì sera, a seconda di cosa devi fare.",
  "Questa me la segno.",
  "Occhio: {chi} dice il contrario nell'altra discussione.",
  "Sono le {ora}, dovrei dormire, e invece sono qui a darti ragione.",
  "Mia madre ha appena staccato la spina del modem. Riprendo da dove ero rima",
  "Grazie. Finalmente uno che scrive le cose con i numeri.",
  "Dalle mie parti lo chiamiamo «fare il turno di notte al contrario».",
  "Il sysop di {org} legge questa bacheca, lo sapete vero?",
  "Funziona. Ma una volta sola: poi cambiano tutto.",
  "Ho provato. Trace al novanta per cento, sudore freddo, zero rimpianti.",
  "Leggete il galateo in area file prima di rispondere in maiuscolo.",
  "Stessa cosa capitata a {chi}. Chiedi a lui.",
  "Non di domenica. Di domenica non c'è nessuno nemmeno a rispondere al telefono.",
  "Bello. Ora scrivi come hai cancellato il log, che è la parte che interessa.",
  "Io uso sempre quattro relay e non ho mai avuto un problema. (Toccando ferro.)",
  "L'ho letto col caffè. Buongiorno a tutti dal lato sbagliato della barricata.",
  "Posso aggiungere che in pausa pranzo al centralino non risponde nessuno.",
  "+1",
  "Mi avete convinto: compro l'antivirus.",
  "Confermo dall'Asia: qui è già domani, e funziona ancora.",
];

/** Frasi lasciate sul muro. */
export const WALL = [
  "NO CARRIER",
  "+++ATH0",
  "chi dorme non piglia portanti",
  "le {ora} a {city}: buonanotte al secchio",
  "RTFM",
  "scansiona prima di installare",
  "il mio crimine è la curiosità",
  "hack the planet (dopo le 22, che costa meno)",
  "greets a {chi}",
  "2400 baud e non sentirli",
  "ho visto l'alba dal lato sbagliato",
  "la mamma è la più grande minaccia alla continuità del servizio",
  "USER: guest · PASS: guest · funziona più spesso di quanto credete",
  "meno maiuscole, più upload",
  "lunedì mattina aprono le pratiche. buona fortuna a tutti.",
  "un saluto dal turno di notte",
  "segui l'ombra",
  "ho perso tre ore a tris con una macchina",
  "qui {chi}: sono vivo, ho solo cambiato modem",
  "il sysop ha sempre ragione (art. 1)",
  "se il sysop ha torto, vedi art. 1",
  "ATDT e speranza",
];

/** Posta interna in più: scadenze, turni, orari. Si aggiunge alle chiacchiere d'ufficio che c'erano già. */
export const MAIL_TIMES: [string, string][] = [
  ["Turno di notte", "Da questa settimana di notte resta una persona sola. Se suona qualcosa, il numero del reperibile è sul post-it. Quello giallo. No, l'altro giallo."],
  ["Chiusura venerdì", "Venerdì si chiude alle 17. Chi resta dopo si arrangi con l'allarme: il codice è sempre quello."],
  ["Backup", "Il backup parte alle 2 di notte e fino alle 4 il sistema è lento. Non è un guasto. Smettete di chiamarmi alle 2 di notte."],
  ["Consegna entro le 18", "Il cliente vuole i file entro le 18 di oggi, ora nostra. Chi li ha? Chi li ha visti? Qualcuno li ha mai avuti?"],
  ["Riunione del lunedì", "Lunedì alle 8:30, sala grande. All'ordine del giorno: tutto quello che è successo nel fine settimana mentre non c'eravamo."],
  ["Pausa pranzo", "Si ricorda che la pausa pranzo è dalle 12:30 alle 14 e che i terminali vanno bloccati. Ieri ne ho trovati undici accesi. Undici."],
  ["Chi era collegato stanotte?", "Dal log risulta un accesso alle 3:12 con l'utenza della contabilità. La contabilità giura che dormiva. Indaghiamo o facciamo finta di niente?"],
  ["Antivirus scaduto", "Le firme dell'antivirus sono ferme a tre settimane fa. Qualcuno doveva aggiornarle. Quel qualcuno ero io. Provvedo."],
  ["Dischetto trovato nel parcheggio", "Qualcuno ha trovato un dischetto con scritto «STIPENDI 1996» e l'ha infilato nel PC dell'ingresso per vedere cos'era. Adesso il PC dell'ingresso suona una canzoncina."],
  ["Segreteria telefonica", "Fuori orario risponde la segreteria. Chi l'ha registrata dicendo anche il numero interno della sala macchine è pregato di rifarla."],
  ["Ferie", "Sono via fino al 15. Per le urgenze c'è il collega, che non sa niente. Per le urgenze vere, richiamate il 16."],
  ["Nuovo lettore all'ingresso", "Da domani in sala macchine si entra con l'impronta. Passate in ufficio del personale per la registrazione. Portate il pollice."],
  ["Straordinari", "Chi resta dopo le 22 lo segni sul registro. Il custode ha chiamato la polizia due volte questo mese per «luci accese e rumori di tastiera»."],
  ["Fuso orario", "La sede di Chiba apre quando noi andiamo a dormire. Se serve qualcosa da loro, scrivete entro le 16 o aspettate domani."],
  ["Modem acceso di notte", "Il modem dell'amministrazione resta acceso tutta la notte «per i fax». Risponde a chiunque chiami. Lo spegniamo o aspettiamo che succeda qualcosa?"],
  ["Scadenza trimestrale", "Chiusura dei conti entro venerdì. La contabilità lavora fino a tardi tutta la settimana: non spegnete i server alle 20 come al solito."],
];
