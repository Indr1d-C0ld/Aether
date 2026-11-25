// I BBS del Reticolo: sistemi che si chiamano col modem, uno alla volta, a tempo. Bacheche di messaggi
// che restano, livelli d'utente, area file con il rapporto fra caricato e scaricato, porte con i giochi.
// Qui i tipi di quello che il server manda al client; lo stato e i testi stanno sul server.

export const BBS_LEVEL = ["nuovo utente", "validato", "fidato", "élite", "co-sysop"] as const;
/** Minuti al giorno per livello. */
export const BBS_MINUTES = [20, 35, 50, 75, 240] as const;
export const BBS_POST_MAX = 1200;
export const BBS_TITLE_MAX = 60;
export const BBS_LINE_MAX = 70;

export type BbsInfo = {
  id: string;
  name: string;
  sysop: string;
  tagline: string;
  number: string;
  speed: string;
  /** perché non puoi chiamarlo (cellula sbagliata), o null */
  locked: string | null;
  /** chiede una parola d'ordine al logon */
  gate: boolean;
  days: number; // giorni in cui hai chiamato
  level: number;
};

export type BbsArea = { id: string; name: string; desc: string; need: number; open: boolean; threads: number; fresh: number };
export type BbsDoor = { id: string; name: string; desc: string; need: number; open: boolean };
export type BbsStats = { days: number; posts: number; uploads: number; downloads: number; kb: number };

export type BbsHome = {
  info: BbsInfo;
  banner: string; // l'arte ANSI/ASCII di benvenuto
  motd: string;
  level: number;
  /** cosa manca per il livello dopo, o null */
  next: string | null;
  minutesLeft: number;
  stats: BbsStats;
  callers: { handle: string; at: number; from: string }[];
  oneliners: { handle: string; text: string }[];
  areas: BbsArea[];
  doors: BbsDoor[];
  hasFiles: boolean;
  bulletins: { title: string; body: string }[];
};

export type BbsThreadRow = { id: string; title: string; by: string; at: number; replies: number; lastBy: string; lastAt: number; fresh: boolean; pinned: boolean };
export type BbsPost = { n: number; by: string; at: number; body: string; title?: string; level: string; sig: string };
export type BbsThread = { id: string; area: string; title: string; posts: BbsPost[]; canDelete: boolean };

export type BbsFiles = {
  kb: number; // crediti file
  philes: { id: string; name: string; size: string; desc: string; need: number; open: boolean }[];
  packs: { n: number; name: string; desc: string; cost: number; taken: boolean; need: number; open: boolean }[];
  mine: { key: string; name: string; gain: number }[];
  recent: { name: string; by: string; at: number }[];
};

export type BbsUserRow = { handle: string; level: string; days: number; posts: number; uploads: number; last: number };

// ---------------------------------------------------------------- porte

export type TrisState = { board: ("X" | "O" | "")[]; over: null | "draw" | "wopr" | "you"; line: string; games: number };
export type GtwState = { stage: "side" | "targets" | "run"; side: string | null; targets: string[]; pool: string[]; log: string[]; defcon: number };
export type TradeState = {
  day: number;
  turn: number;
  turns: number;
  cash: number;
  city: number;
  cities: string[];
  cap: number;
  goods: { name: string; price: number; have: number }[];
  news: string;
  over: boolean;
  payout: number;
  best: { handle: string; score: number }[];
  today: { handle: string; score: number }[];
};
