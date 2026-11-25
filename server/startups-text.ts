// I nomi e le descrizioni delle organizzazioni che aprono durante il gioco.
import type { NodeKind } from "../shared/types.ts";

export type StartupKind = { kind: NodeKind; sub: string[]; words: string[]; tails: string[]; blurb: string[]; files: [string, number, number, string][] };

export const STARTUP_KINDS: StartupKind[] = [
  {
    kind: "corp",
    sub: ["software house", "agenzia di grafica", "consulenza informatica", "piccola azienda"],
    words: ["Neon", "Pixel", "Byte", "Vettore", "Onda", "Circuito", "Quarzo", "Silicio", "Fenice", "Prisma"],
    tails: ["Software", "Sistemi", "Digitale", "e Soci", "Lab", "Studio", "Informatica"],
    blurb: ["Tre scrivanie, un modem nuovo e molto entusiasmo.", "Appena aperta: il firewall è ancora quello di prova.", "Fondata da chi è stato lasciato a casa altrove, e se lo ricorda."],
    files: [
      ["piano_industriale.doc", 3, 0, "Il piano per i primi tre anni. Ottimista, con i grafici."],
      ["clienti.dbf", 2, 0, "I primi clienti, con i recapiti e quanto pagano."],
      ["prototipo_src.zip", 6, 1, "Il codice del prodotto che deve ancora uscire."],
    ],
  },
  {
    kind: "shop",
    sub: ["negozio di elettronica", "videonoleggio", "sala giochi", "negozio di dischi"],
    words: ["Bit", "Lampo", "Stella", "Joystick", "Turbo", "Vinile", "Floppy", "Cassetta", "Arcade"],
    tails: ["Shop", "Point", "Center", "Mania", "Store", "e Co."],
    blurb: ["Una cassa collegata in rete da una settimana. Nessuno ha cambiato la password.", "Apertura con gli sconti: la sera la cassa è piena."],
    files: [
      ["inventario.xls", 2, 0, "Cosa c'è in magazzino, e cosa manca."],
      ["fornitori.txt", 1, 0, "Chi vende cosa, e a che prezzo."],
    ],
  },
  {
    kind: "lab",
    sub: ["laboratorio indipendente", "startup biotech"],
    words: ["Gene", "Cellula", "Nucleo", "Elica", "Spora", "Proteo"],
    tails: ["Labs", "Ricerche", "Biotech", "Istituto"],
    blurb: ["Ricercatori che se ne sono andati portandosi gli appunti.", "Pochi soldi, idee costose, e un brevetto in arrivo."],
    files: [
      ["quaderno_di_laboratorio.pdf", 4, 1, "Gli esperimenti dell'ultimo mese, con i risultati veri."],
      ["domanda_di_brevetto.doc", 3, 2, "Non ancora depositata. Vale molto finché non lo è."],
    ],
  },
  {
    kind: "news",
    sub: ["radio libera", "giornale indipendente", "agenzia di stampa"],
    words: ["Radio", "Voce", "Eco", "Antenna", "Frequenza", "Segnale"],
    tails: ["Libera", "Indipendente", "Notizie", "Press", "Onda Corta"],
    blurb: ["Notizie che gli altri non danno, da uno scantinato con due microfoni.", "Una redazione di quattro persone e un archivio di fonti che vale più dello stabile."],
    files: [
      ["fonti_anonime.txt", 2, 1, "Nomi e recapiti di chi parla solo a patto di restare anonimo."],
      ["inchiesta_in_corso.doc", 4, 0, "Il pezzo che esce lunedì. Qualcuno pagherebbe perché non uscisse."],
    ],
  },
  {
    kind: "telco",
    sub: ["provider internet", "centro servizi telematici"],
    words: ["Rete", "Linea", "Ponte", "Nodo", "Cavo", "Portante"],
    tails: ["Net", "Telematica", "Connessioni", "Online", "Dial"],
    blurb: ["Duecento abbonati, un armadio di modem e un tecnico solo.", "Promettono 28.8 a tutti. Hanno sedici linee."],
    files: [
      ["abbonati.dbf", 3, 0, "Nomi, indirizzi e numeri di carta degli abbonati."],
      ["password_router.txt", 1, 1, "Le password degli apparati. Sì, in un file di testo."],
    ],
  },
  {
    kind: "med",
    sub: ["poliambulatorio", "studio medico associato"],
    words: ["Salus", "Vita", "Aurora", "Sole", "Ippocrate", "Fenice"],
    tails: ["Medica", "Salute", "Centro", "Clinica", "Servizi"],
    blurb: ["Cartelle cliniche nuove di zecca su un computer nuovo di zecca, con la password del fornitore.", "Medici fuoriusciti da un ospedale più grande, con i pazienti al seguito."],
    files: [
      ["cartelle_pazienti.dbf", 4, 1, "Le cartelle dei pazienti, anamnesi comprese."],
      ["convenzioni.xls", 1, 0, "Con chi hanno la convenzione, e quanto incassano."],
    ],
  },
];
