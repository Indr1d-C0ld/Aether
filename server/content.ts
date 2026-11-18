// Contenuto iniziale del mondo "Reticolo 2039". Mappa su griglia 320×180.

import type { Faction, NodeKind } from "../shared/types.ts";
import { project, type RelayClass } from "../shared/rules.ts";

export type SeedFile = { id: string; name: string; size: number; encryption: number; preview: string; value: number; cache?: string };
export type SeedRecord = { id: string; name: string; fields: { key: string; label: string; value: string; options: string[] }[] };

export type SeedNode = {
  id: string;
  name: string;
  org: string;
  kind: NodeKind;
  ip: string;
  x: number;
  y: number;
  blurb: string;
  proxy: number;
  firewall: number;
  monitor: number;
  password: string;
  files: SeedFile[];
  records: SeedRecord[];
  hidden?: boolean; // non è sulla mappa: lo scopre il War Dialer
  cls?: RelayClass; // solo relay
  gen?: boolean; // generato da worldgen.ts
  sub?: string; // che cos'è, in due parole
  city?: string;
  adminId?: string | null; // il cittadino che lo amministra
  homeOf?: string | null; // PC di casa di questo cittadino
};

export const DICTIONARY = [
  "ECHO", "GLASS", "KILN", "PALE", "NORTH", "HELIX", "CIVIC", "ORTHO", "LUMEN", "MARKET",
  "VESPER", "SABLE", "COBALT", "RUNNER", "ORCHID", "TUNDRA", "MAGNET", "QUARTZ", "SIGNAL", "HALO",
  "JOSHUA", "GOD", "LOVE", "SECRET", "CIPHER", "PILGRIM", "LANTERN", "MERIDIAN", "FALCON", "GARNET", "OSPREY", "ZENITH", "TEMPEST", "VELVET",
];

const f = (id: string, name: string, size: number, encryption: number, value: number, preview: string): SeedFile => ({
  id,
  name,
  size,
  encryption,
  value,
  preview,
});

const grades = ["18", "21", "24", "26", "28", "30", "30L"];
const student = (id: string, name: string, course: string, grade: string): SeedRecord => ({
  id,
  name,
  fields: [
    { key: "course", label: "Corso", value: course, options: [course] },
    { key: "grade", label: "Voto finale", value: grade, options: grades },
    { key: "status", label: "Stato", value: "iscritto", options: ["iscritto", "laureato", "sospeso", "espulso"] },
  ],
});

const crime = (id: string, name: string, record: string, status: string): SeedRecord => ({
  id,
  name,
  fields: [
    { key: "record", label: "Precedenti", value: record, options: ["nessuno", "frode informatica", "furto aggravato", "contrabbando", "intrusione", "omicidio colposo"] },
    { key: "status", label: "Stato", value: status, options: ["libero", "ricercato", "libertà vigilata", "detenuto"] },
  ],
});

const citizen = (id: string, name: string, residence: string, clearance: string): SeedRecord => ({
  id,
  name,
  fields: [
    { key: "residence", label: "Residenza", value: residence, options: ["Meridia", "Karsk", "Vesper", "Orsini", "Halcyon", "Nordlys", "fuori registro"] },
    { key: "clearance", label: "Nulla osta", value: clearance, options: ["nessuno", "civile", "riservato", "segreto"] },
  ],
});

export const SEED_NODES: SeedNode[] = [
  // ---- Relay pubblici (accesso guest, monitor basso) ----
  relay("r-sable", "SABLE//01", "Sable Exchange", "61.14.200.3", 34, 46, "Hub pubblico della costa ovest. Log a rotazione lenta.", "PALE"),
  relay("r-kiln", "KILN//PX", "Kiln Public Access", "92.7.33.120", 82, 30, "Vecchio PAS universitario, mai dismesso.", "KILN"),
  relay("r-osprey", "OSPREY-7", "Osprey Carrier", "140.2.88.17", 128, 62, "Carrier commerciale, molto trafficato.", "OSPREY"),
  relay("r-tundra", "TUNDRA.NET", "Tundra Backbone", "203.40.5.66", 196, 24, "Dorsale del nord. Fredda e lenta a rispondere.", "TUNDRA"),
  relay("r-garnet", "GARNET:9", "Garnet Mesh", "77.190.4.9", 248, 52, "Mesh comunitaria del distretto Karsk.", "GARNET"),
  relay("r-halo", "HALO/RELAY", "Halo Orbital Uplink", "11.0.222.5", 290, 92, "Ponte satellitare. Ottimo per sparire.", "HALO"),
  relay("r-velvet", "VELVET-3", "Velvet Underground Net", "188.61.9.240", 222, 128, "Rete grigia, ospita più di quanto dichiara.", "VELVET"),
  relay("r-quartz", "QUARTZ-B", "Quartz Municipal", "45.88.120.31", 150, 146, "Relay municipale di Meridia.", "QUARTZ"),
  relay("r-lantern", "LANTERN", "Lantern Free Node", "5.120.66.201", 70, 120, "Nodo libero mantenuto da volontari anonimi.", "LANTERN"),
  relay("r-echo", "ECHO//SOUTH", "Echo Southern", "160.33.71.8", 104, 164, "Ultimo hop prima del mare.", "ECHO"),
  {
    id: "registry",
    name: "REGISTRO DEL RETICOLO",
    org: "Autorità di Registro del Reticolo",
    kind: "registry",
    ip: "1.1.1.10",
    x: 170,
    y: 84,
    blurb: "Anagrafe pubblica degli indirizzi. Interrogabile a pagamento da chiunque.",
    proxy: 0,
    firewall: 0,
    monitor: 0,
    password: "ZXQ-REGISTRY-ROOT",
    files: [],
    records: [],
  },
  // ---- Bersagli ----
  {
    id: "halcyon-uni",
    name: "HALCYON-UNI",
    org: "Università di Halcyon",
    kind: "edu",
    ip: "130.21.4.55",
    x: 58,
    y: 76,
    blurb: "Ateneo storico. Sicurezza da manuale del 2031.",
    proxy: 0,
    firewall: 1,
    monitor: 1,
    password: "ORTHO",
    files: [
      f("syllabus", "syllabus.dat", 2, 0, 1, "Calendario esami del semestre. Nessun valore, solo la prova che sei entrato."),
      f("thesis", "tesi_ilic_neuro.doc", 6, 1, 3, "Tesi di dottorato su interfacce neurali a bassa latenza."),
      f("grants", "fondi_ricerca.xls", 4, 1, 4, "Bilancio dei finanziamenti privati alla ricerca."),
    ],
    records: [
      student("s1", "Marta Ilic", "Ingegneria Neurale", "24"),
      student("s2", "Tomas Brandt", "Crittografia", "21"),
      student("s3", "Ines Okafor", "Robotica", "28"),
      student("s4", "Leo Varga", "Economia", "18"),
    ],
  },
  {
    id: "karsk-poly",
    name: "KARSK-POLY",
    org: "Politecnico di Karsk",
    kind: "edu",
    ip: "130.88.19.2",
    x: 236,
    y: 36,
    blurb: "Ingegneri e hacker in giacca. Sanno di essere un bersaglio.",
    proxy: 1,
    firewall: 1,
    monitor: 2,
    password: "FALCON",
    files: [
      f("exam", "esame_crypto_2039.pdf", 3, 1, 3, "Testo d'esame di crittografia avanzata, versione non pubblicata."),
      f("lab", "lab_quantum_notes.txt", 5, 2, 5, "Appunti di laboratorio su campionamento quantistico."),
    ],
    records: [
      student("k1", "Anya Petrov", "Sistemi Embedded", "26"),
      student("k2", "Joon Park", "Crittografia", "24"),
      student("k3", "Rafael Duarte", "Reti", "21"),
    ],
  },
  {
    id: "meridia-pd",
    name: "MERIDIA-PD",
    org: "Polizia Federale di Meridia",
    kind: "law",
    ip: "10.200.1.1",
    x: 168,
    y: 136,
    blurb: "Casellario giudiziario federale. Monitor feroce.",
    proxy: 2,
    firewall: 2,
    monitor: 4,
    password: "K7R-NOVA-21",
    files: [
      f("informants", "informatori_2039.enc", 8, 3, 9, "Elenco informatori attivi. Vale una fortuna, o una condanna."),
      f("ops", "operazione_vetro.doc", 5, 2, 6, "Piano operativo contro il contrabbando di chip."),
    ],
    records: [
      crime("c1", "Dario Fenn", "frode informatica", "libertà vigilata"),
      crime("c2", "Sol Abara", "furto aggravato", "ricercato"),
      crime("c3", "Mila Roux", "nessuno", "libero"),
      crime("c4", "Yusuf Kale", "contrabbando", "detenuto"),
    ],
  },
  {
    id: "vesper-civic",
    name: "VESPER-CIVIC",
    org: "Archivio Civico di Vesper",
    kind: "gov",
    ip: "10.40.8.12",
    x: 24,
    y: 104,
    blurb: "Anagrafe e nulla osta della costa ovest.",
    proxy: 1,
    firewall: 1,
    monitor: 2,
    password: "CIVIC",
    files: [f("census", "censimento_39.db", 9, 1, 4, "Censimento cittadino con dati biometrici.")],
    records: [
      citizen("v1", "Hana Moreau", "Vesper", "civile"),
      citizen("v2", "Ivo Strand", "Karsk", "nessuno"),
      citizen("v3", "Nadia Quell", "Orsini", "riservato"),
    ],
  },
  {
    id: "orsini-bank",
    name: "ORSINI-KREDITT",
    org: "Banca Orsini Kreditt",
    kind: "bank",
    ip: "88.1.0.77",
    x: 190,
    y: 70,
    blurb: "La banca dei cartelli e dei ministri. Sicurezza di primo livello.",
    proxy: 3,
    firewall: 3,
    monitor: 5,
    password: "Q9-ORS-ZENITH-4",
    files: [
      f("ledger", "libro_mastro_ombra.enc", 10, 3, 10, "Contabilità parallela dei conti cifrati."),
      f("keys", "chiavi_caveau.key", 2, 3, 8, "Chiavi rotanti del caveau digitale."),
    ],
    records: [],
  },
  {
    id: "ion-court",
    name: "ION-COURT",
    org: "Ion Court Holdings",
    kind: "corp",
    ip: "72.15.66.30",
    x: 112,
    y: 36,
    blurb: "Conglomerato di logistica e sicurezza privata.",
    proxy: 1,
    firewall: 2,
    monitor: 2,
    password: "MAGNET",
    files: [
      f("merger", "fusione_cobalt.doc", 4, 1, 5, "Bozza della fusione ostile con Cobalt Dynamics."),
      f("payroll", "stipendi_dirigenza.xls", 3, 0, 2, "Retribuzioni del consiglio di amministrazione."),
      f("contracts", "appalti_meridia.pdf", 6, 2, 6, "Appalti di sicurezza con la polizia di Meridia."),
    ],
    records: [],
  },
  {
    id: "cobalt-dyn",
    name: "COBALT-DYN",
    org: "Cobalt Dynamics",
    kind: "corp",
    ip: "72.80.1.144",
    x: 270,
    y: 70,
    blurb: "Produttore di impianti cibernetici. Paranoici per contratto.",
    proxy: 2,
    firewall: 2,
    monitor: 3,
    password: "CB-77-MIRROR",
    files: [
      f("proto", "prototipo_occhio_v4.cad", 9, 2, 8, "Progetto CAD dell'impianto oculare di quarta generazione."),
      f("recall", "richiamo_impianti.memo", 2, 1, 4, "Memo interno su un difetto non dichiarato."),
    ],
    records: [],
  },
  {
    id: "helix-lab",
    name: "HELIX-BIOLAB",
    org: "Helix Biolab",
    kind: "lab",
    ip: "151.9.40.3",
    x: 60,
    y: 150,
    blurb: "Biotecnologie, brevetti e segreti che non dovrebbero esistere.",
    proxy: 1,
    firewall: 2,
    monitor: 3,
    password: "ORCHID",
    files: [
      f("trial", "trial_clinico_7b.dat", 7, 2, 7, "Dati grezzi di un trial clinico chiuso in fretta."),
      f("patent", "brevetto_helix.pdf", 4, 1, 5, "Brevetto in attesa di deposito."),
    ],
    records: [],
  },
  {
    id: "lumen-news",
    name: "LUMEN-NEWS",
    org: "Lumen Newsroom",
    kind: "news",
    ip: "98.44.2.19",
    x: 140,
    y: 104,
    blurb: "Testata indipendente. Fonti protette, almeno sulla carta.",
    proxy: 0,
    firewall: 1,
    monitor: 1,
    password: "SIGNAL",
    files: [
      f("scoop", "inchiesta_orsini.txt", 3, 1, 5, "Inchiesta inedita sui conti della Orsini Kreditt."),
      f("sources", "fonti_riservate.enc", 2, 2, 7, "Contatti delle fonti anonime della redazione."),
    ],
    records: [],
  },
  {
    id: "pale-market",
    name: "PALE-MARKET",
    org: "Pale Market Exchange",
    kind: "market",
    ip: "66.6.13.13",
    x: 290,
    y: 140,
    blurb: "Borsa merci notturna. Si dice ci passino gli zero-day.",
    proxy: 1,
    firewall: 1,
    monitor: 2,
    password: "VELVET",
    files: [
      f("zeroday", "lista_0day_nov.txt", 2, 2, 7, "Listino degli exploit in vendita questo mese."),
      f("buyers", "acquirenti.db", 5, 1, 4, "Anagrafica degli acquirenti abituali."),
    ],
    records: [],
  },
  {
    id: "nord-transit",
    name: "NORD-TRANSIT",
    org: "Nordlys Transit Authority",
    kind: "transit",
    ip: "31.7.70.7",
    x: 160,
    y: 16,
    blurb: "Controllo di metro, maglev e semafori del nord.",
    proxy: 1,
    firewall: 1,
    monitor: 2,
    password: "MERIDIAN",
    files: [
      f("sched", "orari_maglev.cfg", 2, 0, 2, "Configurazione orari delle linee maglev."),
      f("cams", "indice_telecamere.db", 6, 1, 5, "Indice delle telecamere del sistema di trasporto."),
    ],
    records: [],
  },
  {
    id: "meridia-credit",
    name: "MERIDIA-CREDIT",
    org: "Credito Cooperativo di Meridia",
    kind: "bank",
    ip: "88.40.12.200",
    x: 204,
    y: 152,
    blurb: "La banca della gente comune: stipendi, mutui, pensioni. Sicurezza onesta, niente di più.",
    proxy: 1,
    firewall: 2,
    monitor: 3,
    password: "TEMPEST",
    files: [f("mutui", "mutui_insoluti.db", 5, 1, 4, "Elenco dei mutui in sofferenza, con nomi e indirizzi.")],
    records: [],
  },
  // ---- Nodi nascosti: non sono sulla mappa, li trova il War Dialer ----
  {
    id: "crystal-palace",
    name: "CRYSTAL-PALACE",
    org: "Comando Difesa Strategica",
    kind: "mil",
    ip: "6.6.19.83",
    x: 296,
    y: 26,
    blurb: "«SALVE, PROFESSOR FALKEN. FACCIAMO UNA PARTITA?»",
    proxy: 3,
    firewall: 3,
    monitor: 5,
    password: "JOSHUA",
    hidden: true,
    files: [
      f("gtw", "guerra_termonucleare_globale.sim", 8, 3, 12, "Simulazione completa. Ogni scenario finisce allo stesso modo: VINCITORE: NESSUNO."),
      f("tris", "tris.sim", 1, 0, 2, "Zero vincitori su 1.024 partite. STRANO GIOCO. L'UNICA MOSSA VINCENTE È NON GIOCARE."),
      { ...f("core", "nucleo_apprendimento.pkg", 2, 3, 12, "Pacchetto sigillato. Qualcosa, dentro, sta ancora imparando."), cache: "joshua" },
    ],
    records: [],
  },
  {
    id: "gibson",
    name: "GIBSON",
    org: "Ellingson Mineral",
    kind: "corp",
    ip: "17.5.19.95",
    x: 30,
    y: 18,
    blurb: "Il supercomputer di una compagnia petrolifera. Le quattro password più usate: amore, sesso, segreto, e…",
    proxy: 3,
    firewall: 3,
    monitor: 4,
    password: "GOD",
    hidden: true,
    files: [
      f("garbage", "garbage.dat", 6, 2, 11, "Sembra spazzatura. È il registro di un verme che ruba pochi centesimi da ogni transazione."),
      f("davinci", "da_vinci.vir", 3, 3, 10, "Virus dimostrativo: rovescia le petroliere. Un diversivo, più che una minaccia."),
      { ...f("deck", "deck_1988.pkg", 2, 2, 12, "Pacchetto sigillato, con un'etichetta: «proprietà di Z.C.»."), cache: "zerocool" },
    ],
    records: [],
  },
  {
    id: "pharmakom",
    name: "PHARMAKOM-V",
    org: "Pharmakom Industries",
    kind: "lab",
    ip: "20.21.5.26",
    x: 262,
    y: 112,
    blurb: "Caveau dati di una farmaceutica. Quello che custodisce pesa più di quanto una testa possa portare.",
    proxy: 3,
    firewall: 3,
    monitor: 4,
    password: "PK-320-NAS-CURE",
    hidden: true,
    files: [
      f("cure", "cura_nas.dat", 48, 3, 12, "320 GQ compressi in 48: i risultati completi della cura per la sindrome da attenuazione nervosa."),
      { ...f("implant", "impianto_mnemonico.pkg", 2, 3, 12, "Pacchetto sigillato. Raddoppiatore di capacità, e poi raddoppiatore ancora."), cache: "johnny" },
    ],
    records: [],
  },
  {
    id: "vsi",
    name: "VSI-LAB",
    org: "Virtual Space Industries",
    kind: "lab",
    ip: "22.19.9.92",
    x: 100,
    y: 84,
    blurb: "Ricerca sulla realtà virtuale per conto di qualcuno che non compare nei bilanci.",
    proxy: 2,
    firewall: 3,
    monitor: 4,
    password: "PROGETTO5-ANGELO",
    hidden: true,
    files: [
      f("p5", "progetto_5.vr", 9, 3, 11, "Protocollo sperimentale: stimolazione neurale in ambiente virtuale. Soggetto: un giardiniere."),
      f("neuro", "jobe_s.neuro", 5, 2, 9, "Tracciati neurali del soggetto. La curva di apprendimento esce dal grafico."),
      { ...f("cortex", "cortex_mainframe.pkg", 2, 3, 12, "Pacchetto sigillato. Qualcuno ha provato a caricarsi qui dentro."), cache: "jobe" },
    ],
    records: [],
  },
  // ---- Relay aggiunti col planisfero ----
  relay("r-kaiju", "KAIJU-NET", "Kaiju Public Net", "133.9.40.12", 0, 0, "Nodo pubblico di Tokyo, sempre affollato.", "LUMEN"),
  relay("r-coral", "CORAL//9", "Coral Community Mesh", "101.0.77.9", 0, 0, "Mesh di quartiere a Sydney. Lontano da tutto.", "NORTH"),
  relay("r-monsoon", "MONSOON", "Monsoon Telecom", "117.20.3.3", 0, 0, "Carrier di Mumbai: enorme, ordinato, schedato.", "MARKET"),
  relay("r-frost", "FROST", "Frost Data Haven", "82.221.9.14", 0, 0, "Rete grigia a Reykjavík, raffreddata dal clima.", "HELIX"),
  relay("r-tortuga", "TORTUGA", "Tortuga Offshore", "190.80.1.66", 0, 0, "Server alle Cayman. Nessuna rogatoria è mai tornata indietro.", "PILGRIM"),
  relay("r-vanta", "VANTA", "Vanta Offshore", "197.5.5.40", 0, 0, "Un container alle Seychelles con un'antenna sopra.", "VESPER"),
  relay("r-zenith", "ZENITH-SAT", "Zenith Orbital", "11.0.222.9", 0, 0, "Secondo ponte satellitare, sopra l'Oceano Indiano.", "ZENITH"),
];

function relay(id: string, name: string, org: string, ip: string, x: number, y: number, blurb: string, password: string): SeedNode {
  return {
    id,
    name,
    org,
    kind: "relay",
    ip,
    x,
    y,
    blurb,
    proxy: 0,
    firewall: 0,
    monitor: 1,
    password,
    files: [],
    records: [],
  };
}

export type GhostSeed = { id: string; handle: string; faction: Faction; xp: number; credits: number; heat: number; ip: string; skill: number };

export const GHOSTS: GhostSeed[] = [
  { id: "npc:nyx", handle: "NYX", faction: "red", xp: 2480, credits: 18400, heat: 22, ip: "203.9.77.41", skill: 0.7 },
  { id: "npc:kite", handle: "KITE", faction: "red", xp: 1320, credits: 9100, heat: 36, ip: "84.120.3.250", skill: 0.45 },
  { id: "npc:vesper", handle: "MOTH", faction: "red", xp: 5100, credits: 27300, heat: 48, ip: "41.66.201.8", skill: 0.85 },
  { id: "npc:razor", handle: "RAZOR", faction: "red", xp: 640, credits: 4200, heat: 12, ip: "190.4.18.77", skill: 0.3 },
  { id: "npc:sable", handle: "WARDEN-SABLE", faction: "blue", xp: 3600, credits: 15200, heat: 0, ip: "10.8.0.3", skill: 0.75 },
  { id: "npc:iris", handle: "IRIS", faction: "blue", xp: 1900, credits: 8800, heat: 0, ip: "10.8.4.19", skill: 0.55 },
  { id: "npc:hound", handle: "HOUND", faction: "blue", xp: 880, credits: 5100, heat: 0, ip: "10.9.1.77", skill: 0.35 },
];

export const CLIENTS_RED = ["un cliente anonimo", "un broker di Pale Market", "un ex dipendente", "una cellula di Karsk", "un sindacato di Meridia", "un concorrente"];
export const CLIENTS_BLUE = ["il SOC di Orsini", "un'assicurazione", "il CERT del Reticolo", "l'ufficio legale del cliente", "un consorzio di sicurezza"];

// ------------------------------------------------------------ planisfero

/** Dove stanno i nodi sul planisfero: [longitudine, latitudine]. */
const GEO: Record<string, [number, number]> = {
  "r-sable": [-74, 40.7], // New York
  "r-kiln": [-0.1, 51.5], // Londra
  "r-osprey": [-87.6, 41.9], // Chicago
  "r-tundra": [82.9, 55], // Novosibirsk
  "r-garnet": [76.9, 43.2], // Almaty
  "r-halo": [-150, 12], // in orbita sul Pacifico
  "r-velvet": [114.2, 22.3], // Hong Kong
  "r-quartz": [-46.6, -23.5], // San Paolo
  "r-lantern": [3.4, 6.5], // Lagos
  "r-echo": [18.4, -33.9], // Città del Capo
  "r-kaiju": [139.7, 35.7], // Tokyo
  "r-coral": [151.2, -33.9], // Sydney
  "r-monsoon": [72.9, 19.1], // Mumbai
  "r-frost": [-21.9, 64.1], // Reykjavík
  "r-tortuga": [-81.2, 19.3], // Cayman
  "r-vanta": [55.5, -4.6], // Seychelles
  "r-zenith": [78, -22], // in orbita sull'Oceano Indiano
  registry: [55.3, 25.2], // Dubai
  "halcyon-uni": [-122.4, 37.8], // San Francisco
  "karsk-poly": [60.6, 56.8], // Ekaterinburg
  "meridia-pd": [-47.9, -15.8], // Brasilia
  "meridia-credit": [-43.2, -22.9], // Rio
  "vesper-civic": [-9.1, 38.7], // Lisbona
  "orsini-bank": [8.5, 47.4], // Zurigo
  "ion-court": [-79.4, 43.7], // Toronto
  "cobalt-dyn": [126.9, 37.6], // Seul
  "helix-lab": [28, -26.2], // Johannesburg
  "lumen-news": [29, 41], // Istanbul
  "pale-market": [103.8, 1.4], // Singapore
  "nord-transit": [10.7, 59.9], // Oslo
  "crystal-palace": [-104.8, 38.7], // Cheyenne Mountain
  gibson: [-122.3, 47.6], // Seattle
  pharmakom: [116.4, 39.9], // Pechino
  vsi: [-112, 33.4], // Phoenix
};

const RELAY_CLS: Record<string, RelayClass> = {
  "r-sable": "carrier",
  "r-osprey": "carrier",
  "r-monsoon": "carrier",
  "r-garnet": "grey",
  "r-velvet": "grey",
  "r-frost": "grey",
  "r-tortuga": "offshore",
  "r-vanta": "offshore",
  "r-halo": "sat",
  "r-zenith": "sat",
};

for (const n of SEED_NODES) {
  const g = GEO[n.id];
  if (g) Object.assign(n, project(g[0], g[1]));
  if (n.kind === "relay") n.cls = RELAY_CLS[n.id] ?? "public";
}
