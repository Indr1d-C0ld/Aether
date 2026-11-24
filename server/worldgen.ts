// Genera il grosso del mondo: circa 270 nodi oltre a quelli scritti a mano in content.ts.
// Deterministico (stesso seme, stesso mondo). Ogni tipo di nodo ha nomi, difese, file e archivi suoi;
// i cittadini hanno un datore di lavoro e spesso un PC di casa, e ogni organizzazione ha un amministratore
// di sistema che a casa tiene gli appunti con la password dell'ufficio.

import type { NodeKind } from "../shared/types.ts";
import { project, type RelayClass } from "../shared/rules.ts";
import { DICTIONARY, type SeedFile, type SeedNode, type SeedRecord } from "./content.ts";
import { PEOPLE, type Person } from "./people.ts";

function rng(seed: number) {
  let s = seed >>> 0;
  return () => {
    s = (s + 0x6d2b79f5) >>> 0;
    let t = s;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export const WORLD_CITIES: [string, number, number][] = [
  ["New York", -74, 40.7], ["Los Angeles", -118.2, 34], ["Chicago", -87.6, 41.9], ["Toronto", -79.4, 43.7], ["Città del Messico", -99.1, 19.4],
  ["Miami", -80.2, 25.8], ["Vancouver", -123.1, 49.3], ["Houston", -95.4, 29.8], ["Denver", -105, 39.7], ["Montréal", -73.6, 45.5],
  ["Atlanta", -84.4, 33.7], ["L'Avana", -82.4, 23.1], ["Bogotá", -74.1, 4.7], ["Lima", -77, -12], ["San Paolo", -46.6, -23.5],
  ["Buenos Aires", -58.4, -34.6], ["Santiago", -70.7, -33.4], ["Caracas", -66.9, 10.5], ["Rio de Janeiro", -43.2, -22.9], ["Manaus", -60, -3.1],
  ["Londra", -0.1, 51.5], ["Parigi", 2.3, 48.9], ["Berlino", 13.4, 52.5], ["Madrid", -3.7, 40.4], ["Roma", 12.5, 41.9],
  ["Milano", 9.2, 45.5], ["Amsterdam", 4.9, 52.4], ["Varsavia", 21, 52.2], ["Stoccolma", 18, 59.3], ["Atene", 23.7, 38],
  ["Vienna", 16.4, 48.2], ["Kiev", 30.5, 50.5], ["Mosca", 37.6, 55.8], ["Lisbona", -9.1, 38.7], ["Dublino", -6.3, 53.3],
  ["Helsinki", 24.9, 60.2], ["Bucarest", 26.1, 44.4], ["Istanbul", 29, 41],
  ["Il Cairo", 31.2, 30], ["Lagos", 3.4, 6.5], ["Nairobi", 36.8, -1.3], ["Johannesburg", 28, -26.2], ["Dakar", -17.4, 14.7],
  ["Kinshasa", 15.3, -4.3], ["Addis Abeba", 38.7, 9], ["Casablanca", -7.6, 33.6], ["Accra", -0.2, 5.6], ["Luanda", 13.2, -8.8],
  ["Teheran", 51.4, 35.7], ["Dubai", 55.3, 25.2], ["Riad", 46.7, 24.7], ["Mumbai", 72.9, 19.1], ["Delhi", 77.2, 28.6],
  ["Karachi", 67, 24.9], ["Dacca", 90.4, 23.8], ["Bangkok", 100.5, 13.8], ["Singapore", 103.8, 1.4], ["Giacarta", 106.8, -6.2],
  ["Manila", 121, 14.6], ["Hong Kong", 114.2, 22.3], ["Shanghai", 121.5, 31.2], ["Pechino", 116.4, 39.9], ["Seul", 126.9, 37.6],
  ["Tokyo", 139.7, 35.7], ["Osaka", 135.5, 34.7], ["Novosibirsk", 82.9, 55], ["Almaty", 76.9, 43.2], ["Tashkent", 69.3, 41.3],
  ["Sydney", 151.2, -33.9], ["Melbourne", 145, -37.8], ["Perth", 115.9, -32], ["Auckland", 174.8, -36.9], ["Brisbane", 153, -27.5],
];

const WORDS = ["Kestrel", "Obsidian", "Argent", "Tessera", "Novum", "Halberd", "Corvid", "Vantage", "Onyx", "Sirocco", "Borealis", "Cinder", "Lumina", "Axiom", "Praxis", "Zephyr", "Monolith", "Quanta", "Solace", "Ember", "Nimbus", "Paragon", "Vertex", "Hollow", "Meridian", "Castor", "Indigo", "Rubicon", "Tantalus", "Umbra"];
const SURNAMES = ["Varga", "Okafor", "Lindqvist", "Tanaka", "Haddad", "Reyes", "Novak", "Moreau", "Kapoor", "Mensah", "Dahl", "Salazar", "Petrov", "Chen", "Conti", "Nasser"];

type FileT = [name: string, sizeMin: number, sizeMax: number, encMax: number, valMin: number, valMax: number, preview: string];
type KindSpec = {
  count: number;
  subs: { sub: string; org: (c: string, w: string, s: string) => string; tag: string }[];
  sec: [number, number, number, number, number, number]; // proxy min/max, firewall min/max, monitor min/max
  pw: "person" | "dict" | "dict2" | "pattern" | "strong";
  files: FileT[];
};

const SPECS: Partial<Record<NodeKind, KindSpec>> = {
  shop: {
    count: 44,
    sec: [0, 0, 0, 1, 0, 1],
    pw: "dict",
    subs: [
      { sub: "banco dei pegni", tag: "PEGNI", org: (c) => `Banco dei Pegni di ${c}` },
      { sub: "videonoleggio", tag: "VIDEO", org: (c, w) => `Videonoleggio ${w}` },
      { sub: "sala giochi", tag: "ARCADE", org: (c, w) => `Sala Giochi ${w}` },
      { sub: "hotel", tag: "HOTEL", org: (c, w) => `Hotel ${w} ${c}` },
      { sub: "casinò", tag: "CASINO", org: (c, w) => `Casinò ${w}` },
      { sub: "agenzia di viaggi", tag: "VIAGGI", org: (c, w) => `${w} Viaggi` },
      { sub: "internet café", tag: "CAFE", org: (c, w) => `Internet Café ${w}` },
      { sub: "negozio di dischi", tag: "DISCHI", org: (c, w) => `${w} Dischi` },
      { sub: "concessionaria", tag: "AUTO", org: (c, s) => `Concessionaria ${s}` },
      { sub: "grande magazzino", tag: "EMPORIO", org: (c, w) => `Emporio ${w} di ${c}` },
      { sub: "pizzeria a domicilio", tag: "PIZZA", org: (c, w) => `Pizza ${w} Express` },
    ],
    files: [
      ["clienti.db", 2, 5, 0, 1, 3, "Anagrafica dei clienti, con indirizzi e numeri di telefono."],
      ["cassa_giornaliera.xls", 1, 2, 0, 1, 2, "Incassi del giorno. Qualcuno arrotonda sempre per difetto."],
      ["carte_fedelta.dat", 2, 4, 1, 2, 4, "Numeri delle carte fedeltà e relativi punti."],
      ["turni_personale.txt", 1, 1, 0, 1, 1, "Chi apre, chi chiude, chi è sempre in ritardo."],
      ["fornitori_in_nero.xls", 1, 3, 1, 3, 5, "La seconda contabilità, quella che il commercialista non vede."],
    ],
  },
  corp: {
    count: 40,
    sec: [1, 2, 1, 3, 2, 4],
    pw: "pattern",
    subs: [
      { sub: "logistica", tag: "LOG", org: (c, w) => `${w} Logistics` },
      { sub: "energia", tag: "NRG", org: (c, w) => `${w} Energy` },
      { sub: "aerospazio", tag: "AERO", org: (c, w) => `${w} Aerospace` },
      { sub: "assicurazioni", tag: "INS", org: (c, w) => `${w} Assicurazioni` },
      { sub: "studio legale", tag: "LEX", org: (c, w, s) => `Studio ${s} & Associati` },
      { sub: "estrazione mineraria", tag: "MIN", org: (c, w) => `${w} Mining` },
      { sub: "robotica", tag: "BOT", org: (c, w) => `${w} Robotics` },
      { sub: "software", tag: "SOFT", org: (c, w) => `${w} Systems` },
      { sub: "armamenti", tag: "ARM", org: (c, w) => `${w} Defense` },
    ],
    files: [
      ["piano_industriale.doc", 3, 6, 2, 4, 7, "Il piano triennale: tagli, acquisizioni, e una riga cancellata a penna."],
      ["stipendi.xls", 2, 4, 1, 2, 4, "Retribuzioni di tutti, dirigenti compresi."],
      ["contratti_riservati.pdf", 4, 8, 3, 5, 9, "Clausole che i clienti non dovrebbero leggere insieme."],
      ["email_direzione.mbx", 3, 7, 2, 4, 8, "Tre mesi di posta del consiglio di amministrazione."],
      ["brevetto_in_attesa.cad", 5, 9, 2, 5, 8, "Disegni tecnici di qualcosa che non è ancora sul mercato."],
      ["audit_interno.doc", 2, 4, 1, 3, 6, "Quello che l'ispezione ha trovato. Non è stato trasmesso a nessuno."],
    ],
  },
  gov: {
    count: 20,
    sec: [1, 1, 1, 2, 2, 3],
    pw: "dict2",
    subs: [
      { sub: "ufficio delle imposte", tag: "FISCO", org: (c) => `Ufficio delle Imposte di ${c}` },
      { sub: "dogana", tag: "DOGANA", org: (c) => `Dogana di ${c}` },
      { sub: "catasto", tag: "CATASTO", org: (c) => `Catasto di ${c}` },
      { sub: "motorizzazione", tag: "MOTOR", org: (c) => `Motorizzazione di ${c}` },
      { sub: "ufficio elettorale", tag: "VOTO", org: (c) => `Ufficio Elettorale di ${c}` },
      { sub: "camera di commercio", tag: "CCIAA", org: (c) => `Camera di Commercio di ${c}` },
    ],
    files: [
      ["accertamenti_in_corso.db", 4, 8, 2, 4, 7, "Elenco dei contribuenti sotto verifica, con gli importi contestati."],
      ["protocollo_riservato.doc", 2, 4, 1, 3, 5, "Corrispondenza interna che non passa dal protocollo ufficiale."],
      ["liste_elettorali.db", 5, 9, 1, 3, 6, "Liste aggiornate, con le variazioni dell'ultimo mese."],
      ["sequestri_doganali.xls", 2, 5, 2, 4, 7, "Cosa è stato fermato al confine, e cosa è stato lasciato passare."],
    ],
  },
  law: {
    count: 10,
    sec: [2, 2, 2, 2, 3, 4],
    pw: "strong",
    subs: [
      { sub: "questura", tag: "QUEST", org: (c) => `Questura di ${c}` },
      { sub: "tribunale", tag: "TRIB", org: (c) => `Tribunale di ${c}` },
      { sub: "carcere", tag: "CARC", org: (c) => `Casa Circondariale di ${c}` },
    ],
    files: [
      ["intercettazioni.wav", 5, 9, 3, 6, 9, "Ore di telefonate trascritte a metà."],
      ["fascicoli_aperti.db", 4, 7, 2, 5, 8, "Indagini in corso, con i nomi dei sospettati."],
      ["turni_di_guardia.txt", 1, 2, 0, 2, 4, "Chi sorveglia cosa, e quando non lo sorveglia nessuno."],
    ],
  },
  edu: {
    count: 12,
    sec: [0, 1, 1, 1, 1, 2],
    pw: "dict",
    subs: [
      { sub: "università", tag: "UNI", org: (c) => `Università di ${c}` },
      { sub: "istituto tecnico", tag: "ITIS", org: (c) => `Istituto Tecnico di ${c}` },
      { sub: "biblioteca", tag: "BIBLIO", org: (c) => `Biblioteca Civica di ${c}` },
    ],
    files: [
      ["compiti_in_classe.pdf", 1, 3, 0, 1, 3, "Le prove della settimana prossima."],
      ["ricerca_dipartimento.doc", 3, 6, 1, 3, 5, "Bozza di un articolo non ancora pubblicato."],
      ["prestiti_scaduti.db", 1, 2, 0, 1, 2, "Chi non ha mai riportato quel libro."],
    ],
  },
  lab: {
    count: 14,
    sec: [1, 2, 2, 2, 3, 3],
    pw: "pattern",
    subs: [
      { sub: "biotecnologie", tag: "BIO", org: (c, w) => `${w} Biotech` },
      { sub: "ricerca sui materiali", tag: "MAT", org: (c, w, s) => `Istituto ${s}` },
      { sub: "intelligenza artificiale", tag: "AI", org: (c, w) => `${w} Cognitive` },
      { sub: "fisica applicata", tag: "PHY", org: (c, w) => `Laboratori ${w}` },
    ],
    files: [
      ["dati_sperimentali.dat", 6, 9, 2, 5, 8, "Misure grezze di un esperimento che non doveva riuscire."],
      ["protocollo_7.doc", 3, 5, 3, 6, 9, "Procedure di un test mai autorizzato dal comitato etico."],
      ["modello_addestrato.bin", 7, 9, 2, 6, 9, "Pesi di una rete neurale. Qualcuno pagherebbe per non doverla riaddestrare."],
      ["richiesta_fondi.pdf", 2, 3, 1, 2, 4, "Promesse fatte ai finanziatori."],
    ],
  },
  med: {
    count: 16,
    sec: [1, 1, 1, 1, 2, 2],
    pw: "dict2",
    subs: [
      { sub: "ospedale", tag: "OSP", org: (c, w, s) => `Ospedale ${s} di ${c}` },
      { sub: "clinica privata", tag: "CLIN", org: (c, w, s) => `Clinica ${s}` },
      { sub: "farmacia", tag: "FARMA", org: (c) => `Farmacia Centrale di ${c}` },
    ],
    files: [
      ["cartelle_cliniche.db", 5, 9, 2, 5, 8, "Diagnosi, terapie, e i nomi di chi le riceve."],
      ["scorte_farmaci.xls", 1, 3, 0, 2, 4, "Giacenze di magazzino. Gli oppiacei non tornano mai."],
      ["turni_reparto.txt", 1, 1, 0, 1, 2, "Chi è di notte in corsia."],
      ["sperimentazione.doc", 3, 6, 2, 5, 8, "Risultati provvisori di un farmaco non approvato."],
    ],
  },
  news: {
    count: 10,
    sec: [0, 1, 1, 1, 1, 2],
    pw: "dict",
    subs: [
      { sub: "quotidiano", tag: "NEWS", org: (c) => `${c} Herald` },
      { sub: "radio", tag: "RADIO", org: (c, w) => `Radio ${w}` },
      { sub: "televisione locale", tag: "TV", org: (c) => `TV ${c} 24` },
    ],
    files: [
      ["inchiesta_non_pubblicata.txt", 2, 4, 1, 4, 7, "Un pezzo fermo in redazione da settimane. Qualcuno ha telefonato al direttore."],
      ["fonti.enc", 1, 2, 2, 5, 8, "I nomi di chi parla ai giornalisti."],
      ["palinsesto.xls", 1, 1, 0, 1, 2, "Cosa va in onda, e cosa è stato tagliato."],
    ],
  },
  util: {
    count: 14,
    sec: [1, 2, 2, 2, 3, 3],
    pw: "pattern",
    subs: [
      { sub: "rete elettrica", tag: "GRID", org: (c) => `Rete Elettrica di ${c}` },
      { sub: "acquedotto", tag: "ACQUA", org: (c) => `Acquedotto di ${c}` },
      { sub: "controllo del traffico", tag: "TRAFF", org: (c) => `Controllo Traffico di ${c}` },
      { sub: "aeroporto", tag: "AIR", org: (c) => `Aeroporto di ${c}` },
      { sub: "porto", tag: "PORTO", org: (c) => `Autorità Portuale di ${c}` },
    ],
    files: [
      ["schema_rete.cad", 4, 8, 2, 4, 7, "La mappa di tutto quello che può spegnersi."],
      ["manutenzioni.xls", 1, 3, 0, 2, 3, "Guasti segnalati e mai riparati."],
      ["telecamere.idx", 3, 6, 1, 3, 6, "Dove guardano, e dove no."],
      ["manifesti_di_carico.db", 3, 6, 1, 3, 6, "Cosa arriva, da dove, per chi."],
    ],
  },
  telco: {
    count: 10,
    sec: [2, 2, 2, 2, 3, 3],
    pw: "pattern",
    subs: [
      { sub: "compagnia telefonica", tag: "TEL", org: (c, w) => `${w}Tel` },
      { sub: "provider", tag: "NET", org: (c, w) => `${w} Net` },
    ],
    files: [
      ["tabulati_mese.db", 6, 9, 2, 5, 8, "Chi ha chiamato chi, per quanto, da dove."],
      ["utenze_riservate.xls", 1, 3, 3, 6, 9, "I numeri che non compaiono negli elenchi."],
      ["guasti_centrale.txt", 1, 1, 0, 1, 2, "Interruzioni di servizio e relative scuse."],
    ],
  },
  bank: {
    count: 12,
    sec: [2, 3, 2, 3, 3, 5],
    pw: "strong",
    subs: [
      { sub: "banca commerciale", tag: "BANK", org: (c) => `Banca Mercantile di ${c}` },
      { sub: "cassa di risparmio", tag: "CASSA", org: (c) => `Cassa di Risparmio di ${c}` },
      { sub: "banca d'affari", tag: "TRUST", org: (c, w, s) => `${s} & ${w} Trust` },
      { sub: "cambiavalute", tag: "FX", org: (c, w) => `${w} Exchange` },
    ],
    files: [
      ["conti_cifrati.enc", 4, 8, 3, 7, 10, "Titolari che preferiscono un numero a un nome."],
      ["bonifici_sospetti.xls", 2, 4, 2, 5, 8, "Le segnalazioni che l'ufficio antiriciclaggio non ha inoltrato."],
      ["chiavi_sportelli.key", 1, 2, 3, 6, 9, "Chiavi di cifratura dei bancomat della zona."],
    ],
  },
};

const HOME_FILES: FileT[] = [
  ["diario.txt", 1, 1, 0, 1, 2, "Pensieri che non erano per te."],
  ["foto_vacanze.zip", 2, 4, 0, 1, 2, "Un mare qualunque, un'estate qualunque."],
  ["dichiarazione_redditi.pdf", 1, 2, 0, 2, 4, "Quello che ha detto al fisco."],
  ["lettere.doc", 1, 1, 0, 1, 3, "Corrispondenza privata."],
];

function strongPassword(r: () => number) {
  const abc = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
  const part = (n: number) => Array.from({ length: n }, () => abc[Math.floor(r() * abc.length)]).join("");
  return `${part(3)}-${part(4)}-${part(4)}`;
}

// ------------------------------------------------------------ espansione del mondo
type Sub = { sub: string; org: (c: string, w: string, s: string) => string; tag: string };
/** tributes: insegne fisse [nome, che cos'è, sigla], usate una volta sola ciascuna. */
type ExtraSpec = { count: number; subs: Sub[]; tributes: [string, string, string][] };

const EXTRA: Partial<Record<NodeKind, ExtraSpec>> = {
  shop: {
    count: 34,
    subs: [
      { sub: "BBS amatoriale", tag: "BBS", org: (c, w) => `${w} BBS` },
      { sub: "negozio di computer", tag: "COMP", org: (c, w) => `${w} Computer` },
      { sub: "sala LAN", tag: "LAN", org: (c, w) => `LAN Party ${w}` },
      { sub: "karaoke", tag: "KARA", org: (c, w) => `Karaoke ${w}` },
      { sub: "studio di tatuaggi", tag: "INK", org: (c, w) => `${w} Tattoo` },
      { sub: "clinica di cyberware", tag: "RIPPER", org: (c, s) => `Bisturi ${s}` },
      { sub: "fumetteria", tag: "COMIX", org: (c, w) => `Fumetteria ${w}` },
      { sub: "love hotel", tag: "LOVE", org: (c, w) => `Hotel ${w} (a ore)` },
      { sub: "noodle bar", tag: "NOODLE", org: (c, w) => `Noodle ${w}` },
    ],
    tributes: [
      ["Flynn's Arcade", "sala giochi", "FLYNN"], ["Bar Chatsubo", "bar per espatriati", "CHAT"], ["The Gentleman Loser", "bar di cowboy della console", "LOSER"], ["Cyberdelia", "locale notturno", "CYBER"],
      ["Cosa Nostra Pizza", "pizzeria a domicilio (30 minuti o è gratis)", "CNP"], ["The Black Sun", "locale virtuale", "BLKSUN"], ["Videodrome Video", "videonoleggio", "VDROME"], ["Taffey Lewis · Quarto Settore", "locale notturno", "TAFFEY"],
      ["Chinatown Noodle di Howie Lee", "noodle bar", "HOWIE"], ["Babbage's Software", "negozio di computer", "BABB"], ["Hotel Coffin Cheap", "albergo a capsule", "COFFIN"], ["L0pht Heavy Industries", "soffitta piena di hardware", "L0PHT"],
    ],
  },
  corp: {
    count: 34,
    subs: [
      { sub: "zaibatsu", tag: "ZAI", org: (c, w) => `${w} Zaibatsu` },
      { sub: "cibernetica", tag: "CYB", org: (c, w) => `${w} Cybernetics` },
      { sub: "sicurezza privata", tag: "SEC", org: (c, w) => `${w} Security` },
      { sub: "orbitale", tag: "ORB", org: (c, w) => `${w} Orbital` },
      { sub: "intrattenimento", tag: "FUN", org: (c, w) => `${w} Interactive` },
      { sub: "arcologia", tag: "ARCO", org: (c, w) => `Arcologia ${w} di ${c}` },
      { sub: "nanotecnologie", tag: "NANO", org: (c, w) => `${w} Nanotech` },
    ],
    tributes: [
      ["Tyrell Corporation", "replicanti («più umano dell'umano»)", "TYRELL"], ["Weyland-Yutani", "costruiamo mondi migliori", "WEYYUT"], ["Omni Consumer Products", "conglomerato", "OCP"], ["Hosaka", "zaibatsu", "HOSAKA"],
      ["Maas Biolabs", "biotecnologie", "MAAS"], ["Zorin Industries", "microchip", "ZORIN"], ["Nakatomi Trading", "import-export", "NAKA"], ["Initech", "software gestionale", "INITECH"],
      ["E Corp", "conglomerato", "ECORP"], ["Yoyodyne Propulsion", "aerospazio", "YOYO"], ["Rekall", "ricordi su misura", "REKALL"], ["InGen", "bioingegneria", "INGEN"],
      ["Soylent", "alimentare", "SOYL"], ["Zorg Industries", "armamenti", "ZORG"], ["Uplink Corporation", "agenzia di agenti freelance", "UPLINK"], ["Arasaka", "sicurezza e finanza", "SAKA"], ["Militech", "armamenti", "MILI"],
    ],
  },
  gov: {
    count: 12,
    subs: [
      { sub: "archivio di stato", tag: "ARCH", org: (c) => `Archivio di Stato di ${c}` },
      { sub: "ufficio brevetti", tag: "BREV", org: (c) => `Ufficio Brevetti di ${c}` },
      { sub: "protezione civile", tag: "PROT", org: (c) => `Protezione Civile di ${c}` },
      { sub: "consolato", tag: "CONS", org: (c) => `Consolato Generale a ${c}` },
    ],
    tributes: [["Ministero dell'Informazione · Recupero Informazioni", "ministero", "BRAZIL"], ["Autorità di Turing", "registro delle intelligenze artificiali", "TURING"], ["Ufficio Colonie Extramondo", "ufficio emigrazione", "OFFW"]],
  },
  edu: {
    count: 12,
    subs: [
      { sub: "liceo", tag: "LICEO", org: (c, w) => `Liceo ${w} di ${c}` },
      { sub: "accademia", tag: "ACC", org: (c, w) => `Accademia ${w}` },
      { sub: "biblioteca digitale", tag: "LIB", org: (c) => `Biblioteca Digitale di ${c}` },
    ],
    tributes: [["Miskatonic University", "ateneo", "MISK"], ["MIT · Tech Model Railroad Club", "circolo studentesco", "TMRC"], ["Liceo Stanton", "liceo", "STANTON"], ["Liceo Seattle Sud (prof. Lightman)", "liceo", "SEAHS"], ["Chaos Computer Club", "associazione", "CCC"]],
  },
  med: {
    count: 12,
    subs: [
      { sub: "clinica neurale", tag: "NEURO", org: (c, w) => `Clinica Neurale ${w}` },
      { sub: "criobanca", tag: "CRYO", org: (c, w) => `Criobanca ${w}` },
      { sub: "banca degli organi", tag: "ORG", org: (c, w) => `${w} Organi` },
    ],
    tributes: [["Clinica Nera di Chiba", "chirurgia non autorizzata", "CHIBA"], ["Ospedale Generale di Raccoon", "ospedale", "RACC"], ["Spider · Clinica dei Lo-Tek", "ambulatorio clandestino", "LOTEK"]],
  },
  util: {
    count: 14,
    subs: [
      { sub: "centrale nucleare", tag: "NUKE", org: (c) => `Centrale Nucleare di ${c}` },
      { sub: "diga", tag: "DIGA", org: (c, w) => `Diga ${w}` },
      { sub: "controllo del traffico", tag: "TRAF", org: (c) => `Controllo del Traffico di ${c}` },
      { sub: "metropolitana", tag: "METRO", org: (c) => `Metropolitana di ${c}` },
      { sub: "controllo del clima", tag: "CLIMA", org: (c, w) => `${w} Weather Control` },
    ],
    tributes: [["Centrale Nucleare di Springfield, settore 7G", "centrale nucleare", "7G"], ["Controllo Semafori di Torino", "controllo del traffico", "MINI"], ["Aeroporto Dulles · Torre", "controllo aereo", "DULLES"]],
  },
  telco: {
    count: 12,
    subs: [
      { sub: "operatore satellitare", tag: "SAT", org: (c, w) => `${w} Satcom` },
      { sub: "provider internet", tag: "ISP", org: (c, w) => `${w} Online` },
      { sub: "centrale di commutazione", tag: "ESS", org: (c) => `Centrale di Commutazione di ${c}` },
      { sub: "cercapersone", tag: "PAGE", org: (c, w) => `${w} Paging` },
    ],
    tributes: [["Ma Bell · Lunga Distanza", "compagnia telefonica", "BELL"], ["Pacific Bell · COSMOS", "compagnia telefonica", "COSMOS"], ["The WELL", "comunità in linea", "WELL"], ["Netcom", "provider internet", "NETCOM"]],
  },
  lab: {
    count: 12,
    subs: [
      { sub: "intelligenza artificiale", tag: "AI", org: (c, w) => `${w} Cognition` },
      { sub: "acceleratore di particelle", tag: "LHC", org: (c, w) => `Anello ${w}` },
      { sub: "realtà virtuale", tag: "VR", org: (c, w) => `${w} Virtual` },
    ],
    tributes: [["Black Mesa", "ricerca sui materiali anomali", "BMESA"], ["Aperture Science", "laboratori di arricchimento", "APERT"], ["Xerox PARC", "ricerca", "PARC"], ["Lawrence Berkeley Lab (errore di 75 centesimi)", "laboratorio nazionale", "LBL"]],
  },
  bank: {
    count: 12,
    subs: [
      { sub: "borsa valori", tag: "BORSA", org: (c) => `Borsa Valori di ${c}` },
      { sub: "casa d'aste", tag: "ASTA", org: (c, s) => `Casa d'Aste ${s}` },
      { sub: "banca privata", tag: "PRIV", org: (c, s) => `Banca Privata ${s} & Figli` },
    ],
    tributes: [["Banca di Berna (conto 21-06-1947)", "banca privata", "BERNA"], ["Citibank · Cash Manager", "banca d'affari", "CITI"], ["Gringott e Associati", "banca privata", "GRING"]],
  },
  news: {
    count: 10,
    subs: [
      { sub: "radio pirata", tag: "RADIO", org: (c, w) => `Radio ${w} Libera` },
      { sub: "rivista underground", tag: "ZINE", org: (c, w) => `${w} Zine` },
      { sub: "agenzia di stampa", tag: "WIRE", org: (c, w) => `Agenzia ${w}` },
    ],
    tributes: [["2600 · Il trimestrale degli hacker", "rivista underground", "2600"], ["Phrack", "rivista underground", "PHRACK"], ["Mondo 2000", "rivista", "MONDO"], ["Hack/Phreak Radio «Hard Harry»", "radio pirata", "HARRY"]],
  },
  law: {
    count: 10,
    subs: [
      { sub: "tribunale", tag: "TRIB", org: (c) => `Tribunale di ${c}` },
      { sub: "agenzia investigativa", tag: "INV", org: (c, s) => `Investigazioni ${s}` },
      { sub: "polizia postale", tag: "POST", org: (c) => `Polizia Postale di ${c}` },
    ],
    tributes: [["Precrimine", "prevenzione", "PRECR"], ["Unità Blade Runner", "polizia", "RUNNER"], ["Servizi Segreti · Operazione Sundevil", "task force", "SUNDVL"], ["Giudici di Mega-City Uno", "tribunale", "DREDD"]],
  },
  mil: {
    count: 8,
    subs: [
      { sub: "base radar", tag: "RADAR", org: (c, w) => `Stazione Radar ${w}` },
      { sub: "silo", tag: "SILO", org: (c, w) => `Silo ${w}` },
      { sub: "arsenale", tag: "ARSEN", org: (c, w) => `Arsenale ${w}` },
    ],
    tributes: [["Dipartimento Difesa · Linea WOPR di riserva", "comando strategico", "WOPR2"], ["Area 51 · Hangar 18", "base aerea", "A51"]],
  },
};

/** I siti militari non c'erano nel primo giro: difese alte, password forti. */
const MIL_SPEC: KindSpec = {
  count: 0,
  sec: [2, 3, 2, 3, 4, 5],
  pw: "strong",
  subs: [],
  files: [
    ["ordini_di_volo.dat", 3, 6, 3, 6, 10, "Rotte, orari e carichi. Alcune righe hanno solo un codice al posto della destinazione."],
    ["codici_di_lancio.enc", 2, 3, 3, 9, 12, "Otto zeri. Per anni sono stati davvero otto zeri."],
    ["telemetria_test.bin", 5, 9, 2, 5, 9, "Un collaudo andato storto, e la versione per la stampa."],
    ["inventario_arsenale.xls", 3, 5, 2, 5, 8, "Tutto quello che c'è, e una colonna «mancante» più lunga del previsto."],
  ],
};

/** File che compaiono solo nei nodi dell'espansione: voci di corridoio e strizzate d'occhio. */
const EGG_FILES: FileT[] = [
  ["manifesto.txt", 1, 1, 0, 2, 4, "«Questo è il nostro mondo adesso… il mondo dell'elettrone e dello switch. Il mio crimine è la curiosità.» — The Mentor, 8 gennaio 1986."],
  ["phreak_boxes.txt", 1, 2, 0, 2, 4, "Blue box: 2600 Hz. Red box: i toni delle monete. Black box: chiamate in arrivo gratis. Non provare a casa."],
  ["jargon.txt", 2, 3, 0, 1, 3, "foo, bar, baz, quux. E «kludge», che si pronuncia come vuoi finché funziona."],
  ["voci_di_corridoio.txt", 1, 1, 0, 3, 5, "Dicono che su IRC, se chiedi al bot giusto, ti dia un numero che non è su nessun elenco."],
  ["lista_password_comuni.txt", 1, 1, 0, 3, 5, "amore · sesso · segreto · dio. E il nome del figlio del professore, per chi sa di chi parlo."],
  ["cassetta_demo.mod", 2, 4, 0, 1, 3, "Quattro canali, 31 campioni, un intro da cracktro. Saluti a tutti i gruppi della scena."],
  ["ghiaccio_nero.dat", 4, 8, 3, 6, 10, "Contromisure di livello militare. Chi le ha scritte non voleva solo tenerti fuori."],
  ["progetto_riservato.cad", 4, 8, 2, 5, 9, "Un progetto che non compare a bilancio. Sul frontespizio: «solo per gli occhi del consiglio»."],
  ["lacrime_nella_pioggia.txt", 1, 1, 0, 3, 5, "«Ho visto cose che voi umani non potreste immaginarvi…» Trascrizione di una deposizione, incompleta."],
  ["contabilita_parallela.xls", 2, 4, 2, 4, 8, "Due colonne: quella vera e quella per il fisco. Differiscono di parecchio."],
];

export type GenNode = SeedNode & { gen: true; sub: string; city: string; adminId: string | null; homeOf: string | null; inner?: string };

export type WorldGen = {
  nodes: GenNode[];
  employer: Record<string, string>; // personId → nodeId
  home: Record<string, string>; // personId → nodeId del PC di casa
  orgAccounts: { nodeId: string; bankId: string; number: string; holder: string; balance: number }[];
};

function build(): WorldGen {
  const r = rng(20391);
  const pick = <T>(a: T[]): T => a[Math.floor(r() * a.length)]!;
  const int = (a: number, b: number) => a + Math.floor(r() * (b - a + 1));
  const ips = new Set<string>();
  const ip = () => {
    for (;;) {
      const v = `${int(12, 222)}.${int(0, 254)}.${int(0, 254)}.${int(1, 253)}`;
      if (!ips.has(v)) {
        ips.add(v);
        return v;
      }
    }
  };
  const names = new Set<string>();
  const nodes: GenNode[] = [];
  const place = (city: [string, number, number]) => {
    const p = project(city[1], city[2]);
    return { x: Math.max(2, Math.min(317, p.x + int(-3, 3))), y: Math.max(2, Math.min(177, p.y + int(-3, 3))) };
  };

  for (const [kind, spec] of Object.entries(SPECS) as [NodeKind, KindSpec][]) {
    for (let i = 0; i < spec.count; i += 1) {
      const city = pick(WORLD_CITIES);
      const sub = pick(spec.subs);
      let org = "";
      for (let t = 0; t < 12 && (!org || names.has(org)); t += 1) org = sub.org(city[0], pick(WORDS), pick(SURNAMES));
      if (names.has(org)) org = `${org} ${nodes.length}`;
      names.add(org);
      const id = `g-${kind}-${i + 1}`;
      const word = pick(DICTIONARY);
      const password =
        spec.pw === "dict" ? word : spec.pw === "dict2" ? `${word}${int(10, 99)}` : spec.pw === "pattern" ? `${pick(WORDS).slice(0, 2).toUpperCase()}-${int(10, 99)}-${word}` : strongPassword(r);
      const chosen = [...spec.files].sort(() => r() - 0.5).slice(0, int(2, Math.min(4, spec.files.length)));
      const files: SeedFile[] = chosen.map((f, k) => ({
        id: `f${k + 1}`,
        name: f[0],
        size: int(f[1], f[2]),
        encryption: Math.min(f[3], int(0, f[3])),
        value: int(f[4], f[5]),
        preview: f[6],
      }));
      nodes.push({
        gen: true,
        id,
        name: `${sub.tag}-${city[0].replace(/[^A-Za-z]/g, "").slice(0, 4).toUpperCase()}${i + 1}`,
        org,
        kind,
        sub: sub.sub,
        city: city[0],
        ip: ip(),
        ...place(city),
        blurb: "",
        proxy: int(spec.sec[0], spec.sec[1]),
        firewall: int(spec.sec[2], spec.sec[3]),
        monitor: int(spec.sec[4], spec.sec[5]),
        password,
        files,
        records: [],
        adminId: null,
        homeOf: null,
      });
    }
  }

  // relay in più: il planisfero ne ha bisogno ovunque
  const classes: RelayClass[] = ["public", "public", "public", "carrier", "grey", "grey", "offshore"];
  for (let i = 0; i < 14; i += 1) {
    const city = pick(WORLD_CITIES);
    const w = pick(WORDS).toUpperCase();
    nodes.push({
      gen: true,
      id: `g-relay-${i + 1}`,
      name: `${w.slice(0, 6)}-${int(2, 99)}`,
      org: `${w.charAt(0)}${w.slice(1).toLowerCase()} Relay di ${city[0]}`,
      kind: "relay",
      sub: "relay",
      city: city[0],
      cls: pick(classes),
      ip: ip(),
      ...place(city),
      blurb: "",
      proxy: 0,
      firewall: 0,
      monitor: 1,
      password: pick(DICTIONARY),
      files: [],
      records: [],
      adminId: null,
      homeOf: null,
    });
  }

  // ogni cittadino lavora da qualche parte: il mestiere decide dove
  const byKind = (k: NodeKind) => nodes.filter((n) => n.kind === k);
  const jobKind = (job: string): NodeKind =>
    /infermier|chirurg|farmacist/.test(job) ? "med" : /avvocat|contabil|dirigent|broker|analista|programmat|tecnico/.test(job) ? "corp" : /funzionario|guardia/.test(job) ? "gov" : /giornalist/.test(job) ? "news" : /ricercat/.test(job) ? "lab" : /insegnant|student/.test(job) ? "edu" : "shop";
  const employer: Record<string, string> = {};
  for (const p of PEOPLE) {
    if (/pensionat|disoccupat/.test(p.job)) continue;
    employer[p.id] = pick(byKind(jobKind(p.job))).id;
  }
  // un amministratore di sistema per organizzazione, scelto fra i cittadini
  const orgs = nodes.filter((n) => n.kind !== "relay");
  const techs = PEOPLE.filter((p) => /tecnico|programmat|analista/.test(p.job));
  const admins = new Set<string>();
  for (const n of orgs) {
    const staff = PEOPLE.filter((p) => employer[p.id] === n.id);
    const a = staff.find((p) => /tecnico|programmat|analista/.test(p.job)) ?? (r() < 0.5 ? pick(techs) : pick(PEOPLE));
    n.adminId = a.id;
    admins.add(a.id);
  }
  // i PC di casa: tutti gli amministratori, più altri cittadini a caso
  const home: Record<string, string> = {};
  const homers = PEOPLE.filter((p) => admins.has(p.id) || r() < 0.3).slice(0, 70);
  homers.forEach((p: Person, i) => {
    const city = WORLD_CITIES.find((c) => c[0] === p.city) ?? pick(WORLD_CITIES);
    const managed = orgs.filter((n) => n.adminId === p.id);
    const files: SeedFile[] = [...HOME_FILES].sort(() => r() - 0.5).slice(0, 2).map((f, k) => ({ id: `f${k + 1}`, name: f[0], size: int(f[1], f[2]), encryption: 0, value: int(f[4], f[5]), preview: f[6] }));
    // chi amministra un sistema si appunta la password a casa: è così che cadono i sistemi veri
    managed.slice(0, 3).forEach((n, k) => {
      files.push({ id: `w${k + 1}`, name: `appunti_lavoro_${k + 1}.txt`, size: 1, encryption: 0, value: 4, preview: `Per non dimenticare — ${n.org} (${n.ip}): la password di servizio è ${n.password}. Cambiarla prima dell'ispezione!` });
    });
    const id = `g-home-${i + 1}`;
    home[p.id] = id;
    nodes.push({
      gen: true,
      id,
      name: `CASA-${p.name.split(" ").at(-1)!.toUpperCase().slice(0, 8)}`,
      org: `PC di ${p.name}`,
      kind: "home",
      sub: "PC di casa",
      city: city[0],
      ip: ip(),
      ...place(city),
      blurb: "",
      proxy: 0,
      firewall: 0,
      monitor: 0,
      // nome e anno di nascita: la password di chi non ci pensa
      password: `${p.name.split(" ")[0]!.toUpperCase().normalize("NFD").replace(/[^A-Z]/g, "")}${String(p.born).slice(2)}`,
      files,
      records: [],
      adminId: null,
      homeOf: p.id,
    });
  });

  // archivi che dipendono dal tipo di nodo
  const rec = (p: Person, fields: SeedRecord["fields"]): SeedRecord => ({ id: p.id, name: p.name, fields });
  const some = (n: number) => [...PEOPLE].sort(() => r() - 0.5).slice(0, n);
  for (const n of orgs) {
    if (n.kind === "med") {
      n.records = some(int(8, 16)).map((p) =>
        rec(p, [
          { key: "blood", label: "Gruppo sanguigno", value: pick(["0+", "0−", "A+", "A−", "B+", "AB+"]), options: [] },
          { key: "condition", label: "Condizione", value: pick(["sano", "sano", "in cura", "cronico"]), options: ["sano", "in cura", "cronico", "ricoverato", "deceduto in reparto"] },
          { key: "fit", label: "Idoneità al lavoro", value: "idoneo", options: ["idoneo", "idoneo con riserva", "non idoneo"] },
        ]),
      );
    } else if (n.kind === "gov" && n.sub === "ufficio delle imposte") {
      n.records = some(int(10, 18)).map((p) =>
        rec(p, [
          { key: "tax", label: "Posizione fiscale", value: pick(["regolare", "regolare", "sotto accertamento", "moroso"]), options: ["regolare", "sotto accertamento", "moroso", "esente"] },
          { key: "debt", label: "Debito iscritto", value: pick(["0 CR", "0 CR", "1.200 CR", "8.500 CR", "40.000 CR"]), options: ["0 CR", "1.200 CR", "8.500 CR", "40.000 CR"] },
        ]),
      );
    } else if (n.kind === "gov" && n.sub === "motorizzazione") {
      n.records = some(int(10, 16)).map((p) =>
        rec(p, [
          { key: "licence", label: "Patente", value: pick(["valida", "valida", "sospesa"]), options: ["valida", "sospesa", "revocata"] },
          { key: "points", label: "Punti", value: pick(["20", "14", "6"]), options: ["20", "14", "6", "0"] },
        ]),
      );
    } else if (n.kind === "telco") {
      n.records = some(int(14, 22)).map((p) =>
        rec(p, [
          { key: "line", label: "Linea", value: "attiva", options: ["attiva", "sospesa", "sotto intercettazione"] },
          { key: "plan", label: "Contratto", value: pick(["base", "famiglia", "affari"]), options: ["base", "famiglia", "affari"] },
        ]),
      );
    } else if (n.kind === "corp" || n.kind === "lab" || n.kind === "shop") {
      const staff = PEOPLE.filter((p) => employer[p.id] === n.id);
      n.records = staff.map((p) =>
        rec(p, [
          { key: "role", label: "Mansione", value: p.job, options: [p.job] },
          { key: "badge", label: "Accesso", value: "base", options: ["base", "riservato", "direzione", "revocato"] },
          { key: "pay", label: "Fascia retributiva", value: pick(["C", "B", "B", "A"]), options: ["C", "B", "A", "dirigente"] },
        ]),
      );
    }
  }

  // le organizzazioni tengono i soldi nelle banche generate
  const banks = byKind("bank");
  const orgAccounts = orgs
    .filter((n) => ["corp", "shop", "lab", "news", "med", "util", "telco"].includes(n.kind))
    .map((n) => ({
      nodeId: n.id,
      bankId: pick(banks).id,
      number: `${int(40, 69)}-${int(100000, 999999)}`,
      holder: n.org,
      balance: n.kind === "shop" ? int(2000, 30000) : int(30000, 400000),
    }));

  // ---- Espansione: un secondo giro con un seme suo, così il mondo di prima resta identico nodo per nodo.
  // Tipi nuovi di luogo e, qua e là, un'insegna che chi ha visto i film giusti riconosce.
  {
    const r2 = rng(77031);
    const pk = <T>(a: T[]): T => a[Math.floor(r2() * a.length)]!;
    const n2 = (a: number, b: number) => a + Math.floor(r2() * (b - a + 1));
    const ip2 = () => {
      for (;;) {
        const v = `${n2(12, 222)}.${n2(0, 254)}.${n2(0, 254)}.${n2(1, 253)}`;
        if (!ips.has(v)) {
          ips.add(v);
          return v;
        }
      }
    };
    for (const [kind, ex] of Object.entries(EXTRA) as [NodeKind, ExtraSpec][]) {
      const spec = SPECS[kind] ?? MIL_SPEC;
      const tributes = [...ex.tributes];
      for (let i = 0; i < ex.count; i += 1) {
        const city = pk(WORLD_CITIES);
        const tribute = i < tributes.length ? tributes[i]! : null;
        const sub = tribute ? { sub: tribute[1], tag: tribute[2], org: () => tribute[0] } : pk([...ex.subs, ...spec.subs]);
        let org = "";
        for (let t = 0; t < 12 && (!org || names.has(org)); t += 1) org = sub.org(city[0], pk(WORDS), pk(SURNAMES));
        if (names.has(org)) org = `${org} ${nodes.length}`;
        names.add(org);
        const word = pk(DICTIONARY);
        const password = spec.pw === "dict" ? word : spec.pw === "dict2" ? `${word}${n2(10, 99)}` : spec.pw === "pattern" ? `${pk(WORDS).slice(0, 2).toUpperCase()}-${n2(10, 99)}-${word}` : strongPassword(r2);
        const pool = [...spec.files, ...EGG_FILES];
        const chosen = pool.sort(() => r2() - 0.5).slice(0, n2(2, 4));
        const p = project(city[1], city[2]);
        nodes.push({
          gen: true,
          id: `x-${kind}-${i + 1}`,
          name: `${sub.tag}-${city[0].replace(/[^A-Za-z]/g, "").slice(0, 4).toUpperCase()}${i + 1}X`,
          org,
          kind,
          sub: sub.sub,
          city: city[0],
          ip: ip2(),
          x: Math.max(2, Math.min(317, p.x + n2(-3, 3))),
          y: Math.max(2, Math.min(177, p.y + n2(-3, 3))),
          blurb: "",
          proxy: n2(spec.sec[0], spec.sec[1]),
          firewall: n2(spec.sec[2], spec.sec[3]),
          monitor: n2(spec.sec[4], spec.sec[5]),
          password,
          files: chosen.map((f, k) => ({ id: `f${k + 1}`, name: f[0], size: n2(f[1], f[2]), encryption: Math.min(f[3], n2(0, f[3])), value: n2(f[4], f[5]), preview: f[6] })),
          records: [],
          adminId: pk(PEOPLE).id,
          homeOf: null,
        });
      }
    }
    const classes2: RelayClass[] = ["public", "public", "carrier", "grey", "grey", "offshore", "sat"];
    const RELAY_NAMES = ["CHATSUBO", "FREESIDE", "ZIONHUB", "KOWLOON", "TANNHAUSER", "OFFWORLD", "SPRAWL", "NIGHTCITY", "BAMA", "TYCHO", "MIDGAR", "NEOTOKYO"];
    RELAY_NAMES.forEach((w, i) => {
      const city = pk(WORLD_CITIES);
      const p = project(city[1], city[2]);
      nodes.push({ gen: true, id: `x-relay-${i + 1}`, name: `${w}-${n2(2, 99)}`, org: `Relay ${w.charAt(0)}${w.slice(1).toLowerCase()} di ${city[0]}`, kind: "relay", sub: "relay", city: city[0], cls: pk(classes2), ip: ip2(), x: Math.max(2, Math.min(317, p.x + n2(-3, 3))), y: Math.max(2, Math.min(177, p.y + n2(-3, 3))), blurb: "", proxy: 0, firewall: 0, monitor: 1, password: pk(DICTIONARY), files: [], records: [], adminId: null, homeOf: null });
    });
  }

  // ---- Reti interne: dietro i sistemi più protetti c'è una macchina che da fuori non risponde.
  // Si raggiunge solo passando dal nodo «davanti», dopo averne mappato la rete da admin.
  {
    const r3 = rng(50817);
    const k3 = (a: number, b: number) => a + Math.floor(r3() * (b - a + 1));
    const INNER_NAME: Partial<Record<NodeKind, string[]>> = {
      corp: ["Caveau dati", "Sala del consiglio", "Archivio riservato", "Laboratorio prototipi"],
      bank: ["Caveau", "Sala cambi", "Conti cifrati"],
      lab: ["Camera bianca", "Progetto riservato", "Banca dei campioni"],
      mil: ["Sala operativa", "Deposito codici", "Rete classificata"],
    };
    const INNER_FILES: FileT[] = [
      ["progetto_nero.cad", 6, 10, 3, 10, 12, "Quello che l'azienda nega di avere mai disegnato."],
      ["libro_nero.xls", 3, 6, 3, 9, 12, "I pagamenti che non passano dalla contabilità: nomi, date, cifre."],
      ["chiavi_maestre.key", 2, 3, 3, 10, 12, "Le chiavi con cui si firmano tutte le altre."],
      ["verbali_secretati.doc", 4, 7, 2, 9, 11, "Le riunioni di cui non esiste convocazione."],
      ["dossier_personale.db", 5, 8, 3, 9, 12, "Quello che sanno dei propri dipendenti. E dei concorrenti."],
      ["campioni_fase3.dat", 6, 9, 3, 10, 12, "Risultati che il comitato etico non ha mai visto."],
    ];
    for (const parent of [...nodes]) {
      const names = INNER_NAME[parent.kind];
      if (!names || parent.proxy + parent.firewall + parent.monitor < 6 || r3() > 0.6) continue;
      const files = [...INNER_FILES].sort(() => r3() - 0.5).slice(0, 3).map((f, k) => ({ id: `f${k + 1}`, name: f[0], size: k3(f[1], f[2]), encryption: k3(2, f[3]), value: k3(f[4], f[5]), preview: f[6] }));
      nodes.push({
        gen: true,
        id: `i-${parent.id}`,
        name: `${parent.name}-INT`,
        org: `${names[Math.floor(r3() * names.length)]!} · ${parent.org}`,
        kind: parent.kind,
        sub: "rete interna",
        city: parent.city,
        ip: `10.${k3(0, 254)}.${k3(0, 254)}.${k3(1, 253)}`,
        x: parent.x,
        y: parent.y,
        blurb: "",
        proxy: Math.min(3, parent.proxy + 1),
        firewall: Math.min(3, parent.firewall + 1),
        monitor: parent.monitor,
        password: strongPassword(r3),
        files,
        records: [],
        adminId: parent.adminId,
        homeOf: null,
        inner: parent.id,
      });
    }
  }

  for (const n of nodes) {
    const admin = n.adminId ? PEOPLE.find((p) => p.id === n.adminId) : null;
    n.blurb =
      n.kind === "home"
        ? "Un computer di casa. Nessuno lo sorveglia, e qualcuno ci tiene cose che non dovrebbe."
        : n.kind === "relay"
          ? `Relay a ${n.city}.`
          : n.inner
            ? "Non risponde alle chiamate dall'esterno: ci si arriva solo dalla rete interna."
            : `${n.sub.charAt(0).toUpperCase()}${n.sub.slice(1)} a ${n.city}.${admin ? ` Amministratore di sistema: ${admin.name}.` : ""}`;
  }
  return { nodes, employer, home, orgAccounts };
}

export const WORLD: WorldGen = build();
