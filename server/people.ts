// La popolazione del Reticolo: 100 cittadini generati in modo deterministico (stesso seme, stesse persone).
// Compaiono in anagrafe, casellario, università e banche; le foto tessera sono in client/public/art/people/.

export type Person = {
  id: string; // p001…
  name: string;
  sex: "m" | "f";
  born: number;
  city: string;
  job: string;
  lid: string; // ID Reticolo, il codice che identifica una persona
  bank: "orsini-bank" | "meridia-credit";
  account: string;
  balance: number;
  uni: "halcyon-uni" | "karsk-poly" | null;
  course: string;
  degree: string;
  grade: string;
  crime: string;
  status: string;
  civil: string;
  clearance: string;
  look: string; // descrizione per la foto tessera (PixelLab)
};

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

const GROUPS = [
  {
    look: "mediterranean",
    m: ["Dario", "Leo", "Matteo", "Nico", "Tomas", "Rafael", "Elio", "Sandro"],
    f: ["Marta", "Giulia", "Ines", "Chiara", "Elena", "Livia", "Sara", "Bianca"],
    last: ["Fenn", "Varga", "Moreau", "Duarte", "Conti", "Serra", "Rinaldi", "Brandt", "Costa", "Leone"],
  },
  {
    look: "slavic",
    m: ["Ivo", "Milan", "Pavel", "Dmitri", "Jan", "Luka"],
    f: ["Anya", "Mila", "Nadia", "Katya", "Vesna", "Irina"],
    last: ["Petrov", "Ilic", "Strand", "Novak", "Kovac", "Zielinski", "Markov", "Horvat"],
  },
  {
    look: "nordic",
    m: ["Erik", "Lars", "Sven", "Aksel", "Nils"],
    f: ["Hana", "Freja", "Astrid", "Liv", "Signe"],
    last: ["Lindqvist", "Halvorsen", "Quell", "Berg", "Nyström", "Dahl", "Roux"],
  },
  {
    look: "west african",
    m: ["Sol", "Kwame", "Tunde", "Ade", "Kofi"],
    f: ["Amara", "Zola", "Nia", "Efua", "Imani"],
    last: ["Okafor", "Abara", "Mensah", "Diallo", "Adeyemi", "Kone", "Bello"],
  },
  {
    look: "east asian",
    m: ["Joon", "Kenji", "Wei", "Haru", "Minh"],
    f: ["Mei", "Yuna", "Sora", "Lin", "Aiko"],
    last: ["Park", "Tanaka", "Chen", "Nakamura", "Tran", "Liu", "Sato"],
  },
  {
    look: "south asian",
    m: ["Arjun", "Ravi", "Imran", "Dev", "Kiran"],
    f: ["Priya", "Anika", "Leela", "Sana", "Divya"],
    last: ["Rao", "Kapoor", "Hossain", "Mehta", "Perera", "Iyer"],
  },
  {
    look: "middle eastern",
    m: ["Yusuf", "Omar", "Karim", "Samir", "Tarek"],
    f: ["Layla", "Noor", "Yasmin", "Dalia", "Rania"],
    last: ["Kale", "Haddad", "Nasser", "Farouk", "Demir", "Aziz"],
  },
  {
    look: "latin american",
    m: ["Mateo", "Diego", "Joaquin", "Emilio", "Bruno"],
    f: ["Camila", "Lucia", "Valeria", "Paloma", "Renata"],
    last: ["Reyes", "Quintero", "Salazar", "Vidal", "Montoya", "Arce"],
  },
];

export const CITIES = ["Meridia", "Karsk", "Vesper", "Orsini", "Halcyon", "Nordlys"];
const JOBS = [
  "infermiera", "tecnico di rete", "avvocato", "tassista", "ricercatore", "giornalista", "broker", "magazziniere", "insegnante", "chirurgo",
  "programmatore", "guardia giurata", "barista", "architetto", "pilota di droni", "contabile", "meccanico", "funzionario pubblico", "musicista", "studente",
  "operaio", "dirigente", "farmacista", "cuoco", "corriere", "disoccupato", "pensionato", "analista dati", "elettricista", "commessa",
];
export const COURSES = ["Ingegneria Neurale", "Crittografia", "Robotica", "Economia", "Sistemi Embedded", "Reti", "Biotecnologie", "Diritto Digitale", "Fisica", "Medicina"];
export const DEGREES = ["nessuno", "laurea", "master", "dottorato"];
export const GRADES = ["18", "21", "24", "26", "28", "30", "30L"];
export const CRIMES = ["nessuno", "frode informatica", "furto aggravato", "contrabbando", "intrusione", "omicidio colposo", "evasione fiscale"];
export const STATUSES = ["libero", "ricercato", "libertà vigilata", "detenuto"];
export const CIVIL = ["in vita", "deceduto", "irreperibile"];
export const CLEARANCES = ["nessuno", "civile", "riservato", "segreto"];

const HAIR_COLOR = ["black", "dark brown", "brown", "blonde", "red", "grey", "white", "dyed blue", "dyed pink", "dyed green"];
const HAIR_M = ["short hair", "buzz cut", "bald head", "slicked back hair", "curly hair", "long hair", "mohawk", "receding hairline"];
const HAIR_F = ["long straight hair", "bob haircut", "curly hair", "ponytail", "short pixie cut", "braids", "shaved side hairstyle", "bun"];
const EXTRA = [
  "wearing glasses", "", "", "with a beard", "with a mustache", "with earrings", "", "wearing a headscarf", "with a small cybernetic eye implant", "with a face tattoo",
  "wearing a cap", "", "with freckles", "with a scar on the cheek", "wearing round sunglasses", "", "with a neck tattoo", "wearing a tie", "", "with a nose piercing",
];
const CLOTHES = ["suit jacket", "hoodie", "work uniform", "leather jacket", "turtleneck", "lab coat", "plain t-shirt", "denim jacket", "formal shirt", "raincoat"];
const BG = ["pale blue", "light grey", "beige", "pale green", "white"];

function build(): Person[] {
  const r = rng(2039);
  const pick = <T>(a: T[]): T => a[Math.floor(r() * a.length)]!;
  const people: Person[] = [];
  const names = new Set<string>();
  const lids = new Set<string>();
  while (people.length < 100) {
    const g = pick(GROUPS);
    const sex: "m" | "f" = r() < 0.5 ? "m" : "f";
    // un cognome su cinque viene da un altro gruppo: il Reticolo è mescolato
    const name = `${pick(sex === "m" ? g.m : g.f)} ${r() < 0.2 ? pick(pick(GROUPS).last) : pick(g.last)}`;
    if (names.has(name)) continue;
    names.add(name);
    const born = 1962 + Math.floor(r() * 58); // 19-77 anni nel 2039
    const age = 2039 - born;
    let lid = "";
    do lid = `LX-${100 + Math.floor(r() * 900)}-${1000 + Math.floor(r() * 9000)}`;
    while (lids.has(lid));
    lids.add(lid);
    const rich = r() < 0.22;
    const hasUni = age < 30 ? r() < 0.75 : r() < 0.5;
    const uni = hasUni ? (r() < 0.55 ? "halcyon-uni" : "karsk-poly") : null;
    const degree = uni ? (age < 24 ? "nessuno" : pick(DEGREES.slice(1))) : "nessuno";
    const crime = r() < 0.24 ? pick(CRIMES.slice(1)) : "nessuno";
    const hairColor = age > 62 ? pick(["grey", "white", "grey"]) : pick(HAIR_COLOR);
    const hair = pick(sex === "m" ? HAIR_M : HAIR_F);
    const extra = pick(EXTRA);
    const extraOk = sex === "f" && /beard|mustache/.test(extra) ? "" : sex === "m" && /headscarf/.test(extra) ? "" : extra;
    const ageWord = age < 26 ? "young" : age < 45 ? "adult" : age < 62 ? "middle-aged" : "elderly";
    people.push({
      id: `p${String(people.length + 1).padStart(3, "0")}`,
      name,
      sex,
      born,
      city: pick(CITIES),
      job: age > 68 ? "pensionato" : age < 23 && uni ? "studente" : pick(JOBS),
      lid,
      bank: rich ? "orsini-bank" : "meridia-credit",
      account: `${rich ? "77" : "31"}-${100000 + Math.floor(r() * 900000)}`,
      balance: rich ? 20000 + Math.floor(r() * 180000) : 300 + Math.floor(r() * 14000),
      uni,
      course: uni ? pick(COURSES) : "",
      degree,
      grade: uni ? pick(GRADES) : "",
      crime,
      status: crime === "nessuno" ? "libero" : pick(STATUSES),
      civil: "in vita",
      clearance: r() < 0.7 ? "nessuno" : pick(CLEARANCES.slice(1)),
      look: `${ageWord} ${g.look} ${sex === "m" ? "man" : "woman"}, ${hair === "bald head" ? hair : `${hairColor} ${hair}`}${extraOk ? `, ${extraOk}` : ""}, ${pick(CLOTHES)}, ${pick(BG)} background`,
    });
  }
  return people;
}

export const PEOPLE: Person[] = build();
export const personById = new Map(PEOPLE.map((p) => [p.id, p]));
