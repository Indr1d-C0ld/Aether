// Operazioni a obiettivi: contratti in più tappe costruiti sui cliché del cinema hacker e del cyberpunk.
// Ogni copione sceglie i suoi nodi e dichiara una lista di obiettivi; il gioco li spunta guardando le
// «gesta» del giocatore (Game.deed) da quando ha accettato. Aggiungere un copione = aggiungere una voce qui.
import type { Faction, MissionType, NodeKind, ToolId } from "../shared/types.ts";
import type { Region } from "../shared/rules.ts";

export type Objective = {
  deed: string; // es. «admin», «t:copy», «sys:blackout», «ghostexit», «alter»
  label: string;
  n: number;
  nodeId?: string;
  kind?: NodeKind;
  sub?: string;
  region?: Region;
  distinct?: "node" | "region" | "kind"; // le n volte devono differire per…
};

export type Scene = {
  id: string;
  faction: Faction;
  type: MissionType;
  title: string;
  brief: string;
  nodeId: string; // il nodo «di copertina» (per grado, mappa, requisiti)
  objectives: Objective[];
  reward: number; // in più rispetto alla base del nodo
  xp: number;
  minXp: number;
  tier?: number;
  limitMin?: number; // tempo massimo dall'accettazione
  requires?: ToolId[];
  clientNodes?: string[];
};

export type SNode = { id: string; org: string; name: string; kind: NodeKind; sub?: string; city?: string; tier: number; files: { id: string; name: string }[]; inner?: { id: string; org: string }; bio?: string };
export type SceneCtx = {
  pick<T>(xs: T[]): T;
  nodes(kind: NodeKind, minTier?: number, sub?: string): SNode[];
  any(minTier?: number): SNode[];
  client: string;
};

type Maker = (c: SceneCtx) => Scene | null;
const one = (c: SceneCtx, kind: NodeKind, minTier = 0, sub?: string) => {
  const xs = c.nodes(kind, minTier, sub);
  return xs.length ? c.pick(xs) : null;
};
const some = (c: SceneCtx, xs: SNode[], n: number) => {
  const pool = [...xs];
  const out: SNode[] = [];
  while (out.length < n && pool.length) out.push(pool.splice(Math.floor(Math.random() * pool.length), 1)[0]!);
  return out.length === n ? out : null;
};

const RED: Maker[] = [
  (c) => {
    const n = c.pick(c.any());
    return { id: "zerocool", faction: "red", type: "spree", nodeId: n.id, title: "1507 sistemi", brief: `«Nel 1988 un ragazzino ne buttò giù 1507 in un giorno.» ${c.client} non chiede tanto: cinque sistemi diversi, accesso admin su ognuno, prima che scada il contratto. Quali, lo scegli tu.`, objectives: [{ deed: "admin", n: 5, distinct: "node", label: "Diventa admin su 5 sistemi diversi" }], reward: 1800, xp: 260, minXp: 200, tier: 1 };
  },
  (c) => {
    const n = c.pick(c.any(1));
    return { id: "planet", faction: "red", type: "spree", nodeId: n.id, title: "Hack the Planet", brief: `Un collettivo vuole una dimostrazione: quattro tipi di sistema diversi violati dalla stessa mano. Una banca vale quanto una pizzeria: conta la varietà. «Hack the planet!»`, objectives: [{ deed: "admin", n: 4, distinct: "kind", label: "Diventa admin su 4 tipi di sistema diversi" }], reward: 2200, xp: 300, minXp: 550, tier: 2 };
  },
  (c) => {
    const n = c.pick(c.any(1));
    return { id: "giro", faction: "red", type: "spree", nodeId: n.id, title: "Il giro del mondo in ottanta hop", brief: `${c.client} deve far credere a qualcuno di essere dappertutto. Lascia la tua firma in tre continenti: accesso admin su un sistema in tre regioni diverse.`, objectives: [{ deed: "admin", n: 3, distinct: "region", label: "Diventa admin in 3 regioni diverse" }], reward: 2000, xp: 280, minXp: 550, tier: 2 };
  },
  (c) => {
    const corp = one(c, "corp", 2);
    if (!corp || !corp.files.length) return null;
    const f = c.pick(corp.files);
    return { id: "nakatomi", faction: "red", type: "chain", nodeId: corp.id, title: "Yippee-ki-yay", brief: `Dodici piani più su c'è un caveau, e il settimo sigillo si apre solo quando salta la corrente. Provoca un blackout da una rete elettrica, poi porta via ${f.name} da ${corp.org} mentre le telecamere sono cieche.`, objectives: [{ deed: "sys:blackout", n: 1, label: "Provoca un blackout da una rete elettrica" }, { deed: "t:copy", n: 1, nodeId: corp.id, label: `Copia un file da ${corp.org}` }], reward: 2600, xp: 320, minXp: 1100 };
  },
  (c) => {
    const bank = one(c, "bank", 2);
    if (!bank) return null;
    return { id: "sneakers", faction: "red", type: "chain", nodeId: bank.id, title: "Too many secrets", brief: `«Setec Astronomy.» Qualcuno ha una scatola nera che legge tutto, e ${c.client} vuole sapere se funziona. Intercetta una linea da una compagnia telefonica, poi entra in ${bank.org} e decifra un loro file.`, objectives: [{ deed: "sys:tap", n: 1, label: "Intercetta una linea (compagnia telefonica)" }, { deed: "admin", n: 1, nodeId: bank.id, label: `Diventa admin su ${bank.org}` }, { deed: "t:decrypt", n: 1, nodeId: bank.id, label: "Decifra lì un file" }], reward: 3000, xp: 360, minXp: 2000, requires: ["decrypt"] };
  },
  (c) => {
    const gov = one(c, "gov");
    if (!gov) return null;
    return { id: "thenet", faction: "red", type: "chain", nodeId: gov.id, title: "Mai esistita", brief: `Un'analista ha visto un dischetto che non doveva vedere. Il cliente vuole che smetta di esistere: un fascicolo ritoccato in tre archivi di tipo diverso (anagrafe, casellario, ateneo, banca). Nessuno crede a chi non risulta da nessuna parte.`, objectives: [{ deed: "alter", n: 3, distinct: "kind", label: "Altera un fascicolo in 3 archivi di tipo diverso" }], reward: 2400, xp: 300, minXp: 550, tier: 2 };
  },
  (c) => {
    const news = one(c, "news");
    if (!news) return null;
    return { id: "headroom", faction: "red", type: "stunt", nodeId: news.id, title: "Segnale pirata", brief: `Ventidue secondi di maschera di gomma sul telegiornale della sera, e nessuno ha mai saputo chi fosse. Entra in ${news.org}, pubblica un pezzo su un handle a tua scelta e sparisci senza lasciare una riga nel log.`, objectives: [{ deed: "sys:publish", n: 1, nodeId: news.id, label: `Pubblica un articolo da ${news.org}` }, { deed: "ghostexit", n: 1, nodeId: news.id, label: "Stacca senza lasciare righe nel log" }], reward: 1500, xp: 220, minXp: 200 };
  },
  (c) => {
    const jail = one(c, "law", 0, "carcere") ?? one(c, "law");
    if (!jail) return null;
    return { id: "freekevin", faction: "red", type: "chain", nodeId: jail.id, title: "Free Kevin", brief: `Lo tengono in isolamento perché, dicono, potrebbe lanciare un missile fischiando in un telefono. Entra in ${jail.org}, ritocca un fascicolo e ripulisci il log: gli adesivi gialli li stampiamo noi.`, objectives: [{ deed: "admin", n: 1, nodeId: jail.id, label: `Diventa admin su ${jail.org}` }, { deed: "alter", n: 1, nodeId: jail.id, label: "Altera lì un fascicolo" }, { deed: "t:logdel", n: 1, nodeId: jail.id, label: "Cancella le tue righe dal log" }], reward: 2200, xp: 300, minXp: 1100, requires: ["logdel"] };
  },
  (c) => {
    const u = c.nodes("util");
    if (u.length < 3) return null;
    return { id: "italianjob", faction: "red", type: "spree", nodeId: c.pick(u).id, title: "Semafori verdi", brief: `Tre Mini, quattro milioni in lingotti e un ingorgo che deve durare esattamente quanto serve. Prendi il controllo di tre reti di servizi pubblici diverse. «Dovevate solo far saltare le porte!»`, objectives: [{ deed: "admin", n: 3, kind: "util", distinct: "node", label: "Diventa admin su 3 servizi pubblici diversi" }], reward: 2300, xp: 300, minXp: 1100, tier: 2 };
  },
  (c) => {
    const bank = one(c, "bank", 2);
    if (!bank) return null;
    return { id: "fsociety", faction: "red", type: "chain", nodeId: bank.id, title: "Il cinque del nove", brief: `«Il nostro è un mondo di debiti.» Un collettivo con la maschera vuole azzerarne un pezzo: cancella tre file dagli archivi di ${bank.org} e non lasciare log da leggere. Ciao, amico.`, objectives: [{ deed: "t:delete", n: 3, nodeId: bank.id, label: `Cancella 3 file da ${bank.org}` }, { deed: "t:logdel", n: 1, nodeId: bank.id, label: "Cancella le tue righe dal log" }], reward: 3200, xp: 380, minXp: 2000, requires: ["logdel"] };
  },
  (c) => {
    const corps = c.nodes("corp", 1);
    if (corps.length < 3) return null;
    return { id: "davinci", faction: "red", type: "spree", nodeId: c.pick(corps).id, title: "Il virus Da Vinci", brief: `Un verme che screma spiccioli da ogni transazione, e un diversivo che minaccia di rovesciare le petroliere. Al cliente interessa solo il primo: pianta un worm in tre aziende diverse.`, objectives: [{ deed: "t:worm", n: 3, kind: "corp", distinct: "node", label: "Pianta un worm in 3 aziende diverse" }], reward: 2600, xp: 320, minXp: 1100, tier: 2, requires: ["worm"] };
  },
  (c) => {
    const mil = one(c, "mil");
    if (!mil) return null;
    return { id: "puppet", faction: "red", type: "stunt", nodeId: mil.id, title: "Il Burattinaio", brief: `Nella Sezione 9 dicono che non esista, che sia solo un fantasma nato nel mare dell'informazione. Dimostralo: entra da admin in ${mil.org} ed esci senza che nel log resti una tua riga.`, objectives: [{ deed: "admin", n: 1, nodeId: mil.id, label: `Diventa admin su ${mil.org}` }, { deed: "ghostexit", n: 1, nodeId: mil.id, label: "Stacca senza lasciare righe nel log" }], reward: 3600, xp: 420, minXp: 3500, requires: ["logdel"] };
  },
  (c) => {
    const corp = one(c, "corp", 1);
    if (!corp || corp.files.length < 2) return null;
    return { id: "endofline", faction: "red", type: "chain", nodeId: corp.id, title: "Fine linea", brief: `Un programmatore giura che il dirigente più pagato di ${corp.org} gli ha rubato i videogiochi, e che la prova è ancora nel sistema. Copia due file, cancellane uno per coprirti. Il Master Control non deve accorgersi di te.`, objectives: [{ deed: "t:copy", n: 2, nodeId: corp.id, label: `Copia 2 file da ${corp.org}` }, { deed: "t:delete", n: 1, nodeId: corp.id, label: "Cancellane uno" }], reward: 1700, xp: 240, minXp: 550 };
  },
  (c) => {
    const n = c.pick(c.any());
    return { id: "whiterabbit", faction: "red", type: "chain", nodeId: n.id, title: "Segui il coniglio bianco", brief: `«Svegliati.» Un messaggio sul terminale, due scansioni nel buio e poi la porta di casa di qualcuno. Lancia due volte il War Dialer, poi entra da admin in un PC privato.`, objectives: [{ deed: "wardial", n: 2, label: "Lancia 2 scansioni col War Dialer" }, { deed: "admin", n: 1, kind: "home", label: "Diventa admin su un PC di casa" }], reward: 1300, xp: 200, minXp: 0, tier: 0 };
  },
  (c) => {
    const bank = one(c, "bank", 1);
    if (!bank) return null;
    return { id: "swordfish", faction: "red", type: "stunt", nodeId: bank.id, title: "Sessanta secondi", brief: `Una pistola alla tempia e un cronometro: così si fanno i colloqui, da queste parti. Hai tre minuti da quando accetti per diventare admin su ${bank.org}. Niente scuse.`, objectives: [{ deed: "admin", n: 1, nodeId: bank.id, label: `Diventa admin su ${bank.org} entro 3 minuti` }], reward: 2400, xp: 320, minXp: 1100, limitMin: 3 };
  },
  (c) => {
    const t = one(c, "telco");
    if (!t) return null;
    return { id: "crunch", faction: "red", type: "chain", nodeId: t.id, title: "2600 hertz", brief: `Un fischietto trovato nei cereali, una scatola blu e il mondo intero a portata di cornetta. Entra in ${t.org}: devia la tua linea e intercetta quella di qualcun altro.`, objectives: [{ deed: "sys:reroute", n: 1, nodeId: t.id, label: `Devia la tua linea da ${t.org}` }, { deed: "sys:tap", n: 1, nodeId: t.id, label: "Intercetta una linea" }], reward: 1600, xp: 240, minXp: 550 };
  },
  (c) => {
    const n = c.pick(c.any());
    return { id: "mnemonic", faction: "red", type: "spree", nodeId: n.id, title: "Trecentoventi gigabyte", brief: `La testa regge ottanta, centosessanta col raddoppiatore. Il cliente ne ha caricati trecentoventi. Copia un file da quattro sistemi diversi prima che ti scoppi il cranio.`, objectives: [{ deed: "t:copy", n: 4, distinct: "node", label: "Copia un file da 4 sistemi diversi" }], reward: 1700, xp: 240, minXp: 200, tier: 1 };
  },
  (c) => {
    const t = c.nodes("telco");
    if (t.length < 2) return null;
    return { id: "lawnmower", faction: "red", type: "spree", nodeId: c.pick(t).id, title: "Squilleranno tutti i telefoni", brief: `«Sono il dio di questo posto.» Qualcuno là dentro sta cercando una linea d'uscita. Dagliene due: accesso admin su due compagnie telefoniche diverse.`, objectives: [{ deed: "admin", n: 2, kind: "telco", distinct: "node", label: "Diventa admin su 2 compagnie telefoniche" }], reward: 2400, xp: 300, minXp: 1100, tier: 2 };
  },
  (c) => {
    const edu = one(c, "edu");
    if (!edu) return null;
    return { id: "wargames", faction: "red", type: "chain", nodeId: edu.id, title: "Vogliamo giocare?", brief: `La password della segreteria è scritta su un foglietto nel cassetto: la cambiano ogni due settimane, ma sempre lì la tengono. Entra in ${edu.org} scrivendo la password a mano (niente Breaker) e ritocca un voto.`, objectives: [{ deed: "typed", n: 1, nodeId: edu.id, label: `Entra in ${edu.org} con la password scritta a mano` }, { deed: "alter", n: 1, nodeId: edu.id, label: "Altera un fascicolo" }], reward: 1200, xp: 200, minXp: 0 };
  },
  (c) => {
    const n = c.pick(c.any(1));
    return { id: "domino", faction: "red", type: "spree", nodeId: n.id, title: "Effetto domino", brief: `${c.client} ha scommesso contro due aziende e vuole vincere. Spegni due sistemi diversi prima che scada il contratto.`, objectives: [{ deed: "sys:shutdown", n: 2, distinct: "node", label: "Spegni 2 sistemi diversi" }], reward: 2400, xp: 300, minXp: 1100, tier: 2 };
  },
  (c) => {
    const r = c.nodes("relay");
    if (r.length < 3) return null;
    return { id: "cables", faction: "red", type: "spree", nodeId: c.pick(r).id, title: "La notte dei lunghi cavi", brief: `Chi controlla i relay controlla chi passa. Installa un backdoor su tre relay diversi: da domani ogni rimbalzo dei rivali sarà un regalo.`, objectives: [{ deed: "t:bdkit", n: 3, distinct: "node", label: "Installa un backdoor su 3 relay diversi" }], reward: 2000, xp: 280, minXp: 550, tier: 1, requires: ["bdkit"] };
  },
  (c) => {
    const n = c.pick(c.any());
    return { id: "neverhere", faction: "red", type: "spree", nodeId: n.id, title: "Mai stati qui", brief: `Un test d'ingresso per una cellula che non ha nome. Tre sistemi, tre accessi admin, tre uscite senza una riga nel log. Se lasci un'impronta, non ti richiamano.`, objectives: [{ deed: "ghostexit", n: 3, distinct: "node", label: "Esci pulito da 3 sistemi diversi (dopo esserci entrato da admin)" }], reward: 2100, xp: 300, minXp: 550, tier: 1, requires: ["logdel"] };
  },
  (c) => {
    const lab = one(c, "lab", 1);
    if (!lab) return null;
    return { id: "nofate", faction: "red", type: "chain", nodeId: lab.id, title: "Nessun destino", brief: `Un chip trovato in una pressa idraulica, e dieci anni di ricerca costruiti sopra. Una donna dice che finirà male per tutti. Entra in ${lab.org} e distruggi due file: il futuro non è scritto.`, objectives: [{ deed: "t:delete", n: 2, nodeId: lab.id, label: `Cancella 2 file da ${lab.org}` }], reward: 2000, xp: 280, minXp: 1100 };
  },
  (c) => {
    const gov = one(c, "gov");
    if (!gov) return null;
    return { id: "voightkampff", faction: "red", type: "chain", nodeId: gov.id, title: "Più umano dell'umano", brief: `Quattro anni di vita e nessun passato: al cliente ne serve uno. Fai tre ricerche negli archivi per trovare un'identità plausibile, poi ritocca un fascicolo in ${gov.org}.`, objectives: [{ deed: "search", n: 3, label: "Fai 3 ricerche negli archivi" }, { deed: "alter", n: 1, nodeId: gov.id, label: `Altera un fascicolo in ${gov.org}` }], reward: 1400, xp: 220, minXp: 200 };
  },
  (c) => {
    const shops = c.nodes("shop");
    if (shops.length < 3) return null;
    return { id: "robinhood", faction: "red", type: "spree", nodeId: c.pick(shops).id, title: "Spiccioli", brief: `Frazioni di centesimo, arrotondate per difetto, da tre casse diverse: nessuno se ne accorge mai. «È come in Superman III.»`, objectives: [{ deed: "sys:cash", n: 3, distinct: "node", label: "Svuota la cassa di 3 negozi diversi" }], reward: 1100, xp: 180, minXp: 0, tier: 0 };
  },
  (c) => {
    const n = c.pick(c.any(1));
    return { id: "helpdesk", faction: "red", type: "spree", nodeId: n.id, title: "Sono dell'assistenza", brief: `«Buongiorno, chiamo dai sistemi: mi serve la sua password per un controllo.» Funziona da trent'anni. Entra in due sistemi diversi con le credenziali di un dipendente o dell'operatore: nome e anno di nascita, o quello che trovi nella posta.`, objectives: [{ deed: "staff", n: 2, distinct: "node", label: "Entra in 2 sistemi con credenziali del personale" }], reward: 1500, xp: 240, minXp: 200, tier: 1 };
  },
  (c) => {
    const n = c.pick(c.any());
    return { id: "gotmail", faction: "red", type: "spree", nodeId: n.id, title: "C'è posta per te", brief: `${c.client} vuole sapere di cosa si parla nei corridoi. Leggi la posta interna di tre organizzazioni diverse: i segreti veri non stanno negli archivi, stanno nelle mail delle sei di sera.`, objectives: [{ deed: "z:posta", n: 3, distinct: "node", label: "Leggi la posta interna di 3 organizzazioni" }], reward: 1600, xp: 240, minXp: 200, tier: 1 };
  },
  (c) => {
    const n = c.pick(c.any(1));
    return { id: "deepthroat", faction: "red", type: "spree", nodeId: n.id, title: "Gola profonda", brief: `Un giornalista aspetta in un parcheggio sotterraneo. «Segui il denaro», dice sempre. Portagli due allegati compromettenti presi dalla posta di due organizzazioni diverse.`, objectives: [{ deed: "z:dossier", n: 2, distinct: "node", label: "Copia un allegato compromettente da 2 organizzazioni" }], reward: 2400, xp: 300, minXp: 550, tier: 2 };
  },
  (c) => {
    const xs = c.nodes("corp", 2).concat(c.nodes("bank", 2), c.nodes("lab", 2), c.nodes("mil", 2)).filter((n) => n.inner);
    if (!xs.length) return null;
    const n = c.pick(xs);
    return { id: "lookingglass", faction: "red", type: "chain", nodeId: n.id, title: "Dietro lo specchio", brief: `${n.org} ha una macchina che da fuori non risponde: ${n.inner!.org}. Entra da admin, mappa la rete interna, passa dall'altra parte e porta via un file prima che la finestra si chiuda.`, objectives: [{ deed: "z:pivot", n: 1, nodeId: n.id, label: `Mappa la rete interna di ${n.org}` }, { deed: "t:copy", n: 1, nodeId: n.inner!.id, label: `Copia un file da ${n.inner!.org}` }], reward: 4200, xp: 480, minXp: 3500, requires: ["decrypt"] };
  },
  (c) => {
    const bank = one(c, "bank", 1);
    if (!bank || !bank.files.length) return null;
    return { id: "eleven", faction: "red", type: "chain", nodeId: bank.id, title: "Undici uomini e un nastro", brief: `Sui monitor della sorveglianza, il caveau di ieri. Nel caveau, voi. Entra in ${bank.org} da operatore, metti le telecamere in loop e copia un file mentre guardano il corridoio vuoto.`, objectives: [{ deed: "z:loop", n: 1, nodeId: bank.id, label: `Metti in loop le telecamere di ${bank.org}` }, { deed: "t:copy", n: 1, nodeId: bank.id, label: "Copia un file" }], reward: 2600, xp: 320, minXp: 1100 };
  },
  (c) => {
    const n = c.pick(c.any(1));
    return { id: "badges", faction: "red", type: "spree", nodeId: n.id, title: "Non ci servono i distintivi", brief: `Invece sì. Stampati un badge in due organizzazioni diverse: domani entrerai dalla porta principale, salutando la guardia.`, objectives: [{ deed: "z:badge", n: 2, distinct: "node", label: "Stampati un badge in 2 organizzazioni" }], reward: 1900, xp: 280, minXp: 550, tier: 1 };
  },
  (c) => {
    const xs = c.any().filter((n) => n.bio === "voce");
    if (!xs.length) return null;
    const n = c.pick(xs);
    return { id: "passport", faction: "red", type: "chain", nodeId: n.id, title: "Il mio nome è il mio passaporto", brief: `«Salve, il mio nome è… verificatemi.» ${n.org} ha un'impronta vocale sull'accesso di root. ${c.client} vuole che tu ci passi: registra la voce dell'amministratore dal centralino, accordala al lettore, e poi entra da admin.`, objectives: [{ deed: "z:voce", n: 1, nodeId: n.id, label: "Registra la voce dell'amministratore" }, { deed: "bio", n: 1, nodeId: n.id, label: "Passa l'impronta vocale" }, { deed: "admin", n: 1, nodeId: n.id, label: `Diventa admin su ${n.org}` }], reward: 2600, xp: 340, minXp: 1500, tier: 3 };
  },
  (c) => {
    const xs = c.any().filter((n) => n.bio === "retina");
    const med = one(c, "med");
    if (!xs.length || !med) return null;
    const n = c.pick(xs);
    return { id: "eyeforaneye", faction: "red", type: "chain", nodeId: n.id, title: "Occhio per occhio", brief: `Nei film serve una penna e uno stomaco forte. A te basta una cartella clinica. Collegati a ${n.org} per vedere chi apre lo scanner, vai a prenderne la retina in ospedale (${med.org} va benissimo), e torna a mostrarla al lettore.`, objectives: [{ deed: "z:retina", n: 1, kind: "med", label: "Copia la scansione della retina da una clinica" }, { deed: "bio", n: 1, nodeId: n.id, label: `Passa lo scanner di ${n.org}` }], reward: 3000, xp: 380, minXp: 1500, tier: 3 };
  },
  (c) => {
    const xs = c.any().filter((n) => n.bio);
    if (!xs.length) return null;
    const n = c.pick(xs);
    return { id: "iamthelock", faction: "red", type: "stunt", nodeId: n.id, title: "La serratura sono io", brief: `${c.client} non vuole entrare una volta in ${n.org}: vuole le chiavi. Passa la barriera, diventa admin e riscrivi l'archivio del lettore con i tuoi modelli. Da domani, per quel sistema, l'amministratore sei tu.`, objectives: [{ deed: "bio", n: 1, nodeId: n.id, label: "Passa la barriera biometrica" }, { deed: "z:modelli", n: 1, nodeId: n.id, label: "Impianta i tuoi modelli" }], reward: 3400, xp: 400, minXp: 2200, tier: 4 };
  },
];

const BLUE: Maker[] = [
  (c) => {
    const ns = some(c, c.any(), 3);
    if (!ns) return null;
    return { id: "audit", faction: "blue", type: "audit", nodeId: ns[0]!.id, clientNodes: ns.map((n) => n.id), title: "Ispezione a tappeto", brief: `${c.client} ha tre sedi e nessuna fiducia nei propri sistemisti. Rinforza con il Patch Kit ${ns.map((n) => n.org).join(", ")}.`, objectives: ns.map((n) => ({ deed: "t:patch", n: 1, nodeId: n.id, label: `Rinforza ${n.org}` })), reward: 1500, xp: 240, minXp: 200, tier: 1, requires: ["patch"] };
  },
  (c) => {
    const ns = some(c, c.any(1), 3);
    if (!ns) return null;
    return { id: "wormhunt", faction: "blue", type: "audit", nodeId: ns[0]!.id, clientNodes: ns.map((n) => n.id), title: "Il verme di Morris", brief: `Novantanove righe di codice e un errore di calcolo: seimila macchine in ginocchio in una notte. Qualcosa di simile gira di nuovo. Passa Forensics su ${ns.map((n) => n.org).join(", ")}.`, objectives: ns.map((n) => ({ deed: "t:forensics", n: 1, nodeId: n.id, label: `Analisi forense su ${n.org}` })), reward: 1700, xp: 260, minXp: 550, tier: 2, requires: ["forensics"] };
  },
  (c) => {
    const ns = some(c, c.any().filter((n) => n.files.length), 2);
    if (!ns) return null;
    return { id: "cuckoo", faction: "blue", type: "audit", nodeId: ns[0]!.id, clientNodes: ns.map((n) => n.id), title: "L'uovo del cuculo", brief: `Settantacinque centesimi che non tornano nei conti del laboratorio: da lì un astronomo risalì fino a Hannover. Piazza un honeypot su ${ns.map((n) => n.org).join(" e su ")} e aspetta.`, objectives: ns.map((n) => ({ deed: "t:honey", n: 1, nodeId: n.id, label: `Piazza un honeypot su ${n.org}` })), reward: 1500, xp: 240, minXp: 550, tier: 1, requires: ["honey"] };
  },
  (c) => {
    const ns = some(c, c.any(1), 3);
    if (!ns) return null;
    return { id: "echelon", faction: "blue", type: "audit", nodeId: ns[0]!.id, clientNodes: ns.map((n) => n.id), title: "Rete d'ascolto", brief: `Cinque antenne, cinque paesi, e una parola chiave che fa scattare il nastro. Al cliente bastano tre sensori: uno su ${ns.map((n) => n.org).join(", uno su ")}.`, objectives: ns.map((n) => ({ deed: "sensor", n: 1, nodeId: n.id, label: `Piazza un sensore su ${n.org}` })), reward: 1600, xp: 240, minXp: 550, tier: 2 };
  },
  (c) => {
    const ns = some(c, c.any(1), 2);
    if (!ns) return null;
    return { id: "nightwatch", faction: "blue", type: "audit", nodeId: ns[0]!.id, clientNodes: ns.map((n) => n.id), title: "Notte di guardia", brief: `Stanotte qualcuno prova a entrare, il cliente ne è certo. Presidia ${ns[0]!.org} e ${ns[1]!.org}: chi tocca i fili, muore.`, objectives: ns.map((n) => ({ deed: "preside", n: 1, nodeId: n.id, label: `Presidia ${n.org}` })), reward: 1100, xp: 200, minXp: 0, tier: 0 };
  },
  (c) => {
    const ns = some(c, c.any(1), 2);
    if (!ns) return null;
    return { id: "deworm", faction: "blue", type: "audit", nodeId: ns[0]!.id, clientNodes: ns.map((n) => n.id), title: "Disinfestazione", brief: `Le fatture non tornano di qualche centesimo, e la CPU scalda anche di notte. Rinforza ${ns[0]!.org} e ${ns[1]!.org} con il Patch Kit: se c'è un worm, lo schiaccia.`, objectives: ns.map((n) => ({ deed: "t:patch", n: 1, nodeId: n.id, label: `Rinforza ${n.org}` })), reward: 1300, xp: 220, minXp: 200, tier: 1, requires: ["patch"] };
  },
  (c) => {
    const gov = one(c, "gov");
    const law = one(c, "law");
    if (!gov || !law) return null;
    return { id: "crosscheck", faction: "blue", type: "audit", nodeId: gov.id, clientNodes: [gov.id, law.id], title: "Verifica incrociata", brief: `Un nome compare in anagrafe e non nel casellario, o viceversa: qualcuno ha ritoccato qualcosa. Consulta gli archivi di ${gov.org} e di ${law.org}, poi passa Forensics su uno dei due.`, objectives: [{ deed: "search", n: 1, nodeId: gov.id, label: `Consulta l'archivio di ${gov.org}` }, { deed: "search", n: 1, nodeId: law.id, label: `Consulta l'archivio di ${law.org}` }, { deed: "t:forensics", n: 1, label: "Lancia un'analisi forense" }], reward: 1400, xp: 240, minXp: 550, tier: 1, requires: ["forensics"] };
  },
  (c) => {
    const ns = some(c, c.nodes("bank").concat(c.nodes("corp"), c.nodes("gov")), 2);
    if (!ns) return null;
    return { id: "rewind", faction: "blue", type: "audit", nodeId: ns[0]!.id, clientNodes: ns.map((n) => n.id), title: "Riavvolgi il nastro", brief: `Il log dice che non è entrato nessuno. Le telecamere dicono altro. Rivedi i nastri di ${ns[0]!.org} e di ${ns[1]!.org}.`, objectives: ns.map((n) => ({ deed: "z:nastri", n: 1, nodeId: n.id, label: `Rivedi i nastri di ${n.org}` })), reward: 1300, xp: 220, minXp: 200, tier: 1 };
  },
  (c) => {
    const ns = some(c, c.any(1), 2);
    if (!ns) return null;
    return { id: "circular", faction: "blue", type: "audit", nodeId: ns[0]!.id, clientNodes: ns.map((n) => n.id), title: "Circolare numero uno", brief: `«Si ricorda al personale che l'assistenza non chiede mai la password al telefono.» Manda l'avviso a tutto il personale di ${ns[0]!.org} e di ${ns[1]!.org}: per un quarto d'ora staranno all'erta.`, objectives: ns.map((n) => ({ deed: "z:allerta", n: 1, nodeId: n.id, label: `Avvisa il personale di ${n.org}` })), reward: 1000, xp: 200, minXp: 0, tier: 0 };
  },
  (c) => {
    const xs = c.any().filter((n) => n.bio);
    const ns = some(c, xs, 2);
    if (!ns) return null;
    return { id: "reenrol", faction: "blue", type: "audit", nodeId: ns[0]!.id, clientNodes: ns.map((n) => n.id), title: "Tutti in fila per la foto", brief: `Qualcuno gira con la voce del direttore su una cassetta. Il cliente vuole letture nuove per tutti: ri-registra il personale di ${ns[0]!.org} e di ${ns[1]!.org}. Se nel lettore c'è roba che non è loro, sparisce.`, objectives: ns.map((n) => ({ deed: "z:riregistra", n: 1, nodeId: n.id, label: `Ri-registra il personale di ${n.org}` })), reward: 1900, xp: 300, minXp: 900, tier: 2 };
  },
];

export function rollScene(faction: Faction, c: SceneCtx, only?: string): Scene | null {
  const pool = faction === "red" ? RED : BLUE;
  for (let i = 0; i < (only ? 400 : 6); i += 1) {
    const s = c.pick(pool)(c);
    if (only && s?.id !== only) continue;
    if (s) return s;
  }
  return null;
}

export const SCENE_COUNT = { red: RED.length, blue: BLUE.length };
