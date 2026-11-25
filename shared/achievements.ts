// Traguardi: serie a quattro gradi (bronzo, argento, oro, platino) su ogni contatore del gioco.
// Il server le assegna quando un contatore sale (Game.bump); il client mostra avanzamento e mancanti.
// I contatori sono quelli di agent.counters: «a:<azione>» per ogni azione riuscita, «t:<strumento>»
// per ogni strumento portato a termine, «sys:<comando>» per i comandi di sistema, più alcuni dedicati.
// Le chiavi «$…» vengono dall'agente stesso (fama, XP, crediti), quelle che finiscono con «*» contano
// i contatori con quel prefisso (es. «k:*» = tipi di nodo diversi violati).

export type AchCat = "intrusione" | "dati" | "denaro" | "contratti" | "esplorazione" | "sistemi" | "giustizia" | "difesa" | "mercato" | "sociale" | "carriera";

export const ACH_CAT: Record<AchCat, string> = {
  intrusione: "Intrusione",
  dati: "Dati e archivi",
  denaro: "Denaro",
  contratti: "Contratti",
  esplorazione: "Esplorazione",
  sistemi: "Sistemi e sabotaggi",
  giustizia: "Giustizia e rischio",
  difesa: "Difesa e caccia",
  mercato: "Mercato e bottino",
  sociale: "Rete e compagnia",
  carriera: "Carriera",
};

export type Track = {
  key: string;
  cat: AchCat;
  /** quattro nomi, uno per grado */
  names: [string, string, string, string];
  goals: [number, number, number, number];
  /** descrizione con {n} al posto dell'obiettivo */
  desc: string;
  money?: boolean;
};

export const TIER_NAME = ["Bronzo", "Argento", "Oro", "Platino"] as const;
export const TIER_COLOR = ["#c98b52", "#c9d3e6", "#ffcc33", "#7ef9ff"] as const;
export const TIER_FAME = [1, 3, 8, 20] as const;

const T = (key: string, cat: AchCat, names: string, goals: [number, number, number, number], desc: string, money = false): Track => ({
  key,
  cat,
  names: names.split("|") as Track["names"],
  goals,
  desc,
  money,
});

export const TRACKS: Track[] = [
  // ---------------------------------------------------------------- intrusione
  T("t:proxy", "intrusione", "Primo varco|Tunnel scavato|Mille porte|Il passe-partout", [1, 25, 100, 500], "Abbatti {n} proxy."),
  T("t:firewall", "intrusione", "Breccia|Muro di fuoco|Pompiere al contrario|Ghiaccio sottile", [1, 25, 100, 500], "Abbatti {n} firewall."),
  T("mg:grid", "intrusione", "Trovata la falla|Lettore di regole|Regola 0: permit any|Il muro era di carta", [1, 20, 80, 300], "Apri {n} firewall a mano, dalla griglia delle regole."),
  T("mg:gridclean", "intrusione", "Mano leggera|In punta di piedi|Nessuna impronta|Chirurgo", [1, 10, 50, 200], "Apri {n} firewall dalla griglia con almeno 2 sonde avanzate: nessuna riga nel log."),
  T("mg:gridmanual", "intrusione", "Senza attrezzi|Fai da te|Chi ha bisogno della v3?|MacGyver", [1, 5, 25, 100], "Apri a mano {n} firewall più alti del tuo Firewall Bypass."),
  T("t:monbypass", "intrusione", "Occhi chiusi|Il nastro in loop|Telecamere cieche|Fantasma nella macchina", [1, 20, 80, 300], "Confondi {n} monitor."),
  T("t:breaker", "intrusione", "Forzatura|Grimaldello|Scassinatore|Chiave universale", [1, 25, 100, 400], "Forza {n} password con il Password Breaker."),
  T("t:dict", "intrusione", "Parola d'ordine|Vocabolario|Lessicografo|Il dizionario sono io", [1, 10, 50, 200], "Restringi {n} password con il Dizionario."),
  T("a:login", "intrusione", "Indovinato|Intuito|Lettore di menti|«Joshua»", [1, 5, 25, 100], "Entra {n} volte con una password scritta a mano."),
  T("nodes", "intrusione", "Chiavi in tasca|Mazzo di chiavi|Portinaio del Reticolo|Signore delle chiavi", [5, 25, 100, 250], "Ottieni l'accesso admin su {n} nodi diversi."),
  T("k:*", "intrusione", "Curioso|Tuttofare|Onnivoro|Hack the Planet", [3, 6, 10, 14], "Diventa admin su {n} tipi di sistema diversi."),
  T("hops", "intrusione", "Rimbalzo|Giro del mondo|Ragnatela|Rete di rimbalzi", [25, 250, 1000, 5000], "Attraversa {n} relay in tutto."),
  T("longroute", "intrusione", "Strada lunga|Labirinto|Filo d'Arianna|Sette mari", [1, 10, 50, 200], "Chiudi {n} operazioni rimbalzando su almeno 6 relay."),
  T("t:bdkit", "intrusione", "Porta sul retro|Inquilino abusivo|Mille serrature|Padrone di casa", [1, 5, 25, 100], "Installa {n} backdoor nei relay."),
  T("gw", "intrusione", "Mess with the best|Ospite indesiderato|Predatore di gateway|Re dei duelli", [1, 5, 25, 100], "Entra da admin in {n} gateway di altri handle."),
  T("night", "intrusione", "Nottambulo|Turno di notte|Creatura della notte|Il buio è casa", [1, 10, 50, 200], "Chiudi {n} operazioni su sistemi di notte."),
  T("close", "intrusione", "Per un pelo|Sangue freddo|Nervi d'acciaio|Il filo del rasoio", [1, 10, 50, 150], "Stacca {n} volte con il trace oltre il 90%."),
  T("ghost", "intrusione", "Mai stato qui|Ombra|Spettro|Leggenda metropolitana", [1, 10, 50, 200], "Chiudi {n} indagini senza che risalgano a te."),
  T("a:clientLogin", "intrusione", "Ospite di riguardo|Di casa|Chiavi del cliente|Fiducia cieca", [1, 25, 100, 500], "Entra {n} volte con le credenziali di un cliente."),

  // ---------------------------------------------------------------- dati
  T("t:copy", "dati", "Prima copia|Collezionista di file|Archivio ambulante|Biblioteca di Alessandria", [1, 25, 100, 500], "Copia {n} file."),
  T("t:decrypt", "dati", "Codice spezzato|Enigma|Bletchley Park|Chiave pubblica", [1, 20, 100, 400], "Decifra {n} file."),
  T("mg:rotor", "dati", "Scatto giusto|Orecchio da scassinatore|Cifrario di casa|Turing in persona", [1, 20, 80, 300], "Decifra {n} file a mano, allineando i rotori."),
  T("mg:rotorclean", "dati", "Buona la seconda|Colpo sicuro|Chiave di riserva|«La macchina sono io»", [1, 10, 50, 200], "Trova {n} chiavi con almeno 2 prove avanzate: il trace si ferma."),
  T("mg:rotormanual", "dati", "Carta e matita|Crittoanalista|Stanza 40|Chi ha bisogno del Decrypter?", [1, 5, 25, 100], "Decifra a mano {n} file più cifrati del tuo Decrypter."),
  T("t:delete", "dati", "Cancellino|Tabula rasa|Inceneritore|Crash Override", [1, 20, 100, 400], "Cancella {n} file."),
  T("logs", "dati", "Gomma|Pulizie di primavera|Senza impronte|Nessuno è passato di qui", [5, 50, 250, 1000], "Togli {n} righe dai log."),
  T("forged", "dati", "Falsario|Alibi di carta|Pista sbagliata|Il colpevole perfetto", [1, 10, 50, 200], "Falsifica l'origine di {n} righe di log."),
  T("a:alter", "dati", "Una virgola|Mano sui registri|Riscrivere la storia|Il Grande Fratello", [1, 15, 60, 250], "Altera {n} campi negli archivi pubblici."),
  T("a:searchRecords", "dati", "Schedatore|Curioso di professione|Archivista ombra|Lo sguardo del Reticolo", [5, 50, 250, 1000], "Fai {n} ricerche negli archivi."),
  T("t:upload", "dati", "Corriere|Pony express|Mnemonico|Johnny", [1, 5, 25, 100], "Consegna {n} carichi a destinazione."),

  // ---------------------------------------------------------------- denaro
  T("earned", "denaro", "Primi soldi|Stipendio|Benestante|Re Mida", [10000, 100000, 1000000, 5000000], "Guadagna {n} CR in tutto.", true),
  T("a:transfer", "denaro", "Bonifico|Mani lunghe|Banchiere ombra|Il colpo del secolo", [1, 10, 50, 200], "Muovi {n} bonifici da conti altrui."),
  T("stolen", "denaro", "Spiccioli|Bottino|Cassaforte|Svizzera", [5000, 50000, 250000, 1000000], "Sottrai {n} CR con i bonifici.", true),
  T("a:siphon", "denaro", "Sifone|Pompa|Idrovora|Prosciugatore", [1, 5, 25, 100], "Prosciuga {n} gateway di altri handle."),
  T("sys:cash", "denaro", "Fondo cassa|Registratore|Tutte le casse|Saldi di fine stagione", [1, 10, 50, 200], "Svuota {n} casse di negozi."),
  T("spent", "denaro", "Primo acquisto|Cliente fisso|Grande spendaccione|Azionista", [5000, 50000, 250000, 1000000], "Spendi {n} CR in software e hardware.", true),

  // ---------------------------------------------------------------- contratti
  T("a:deliver", "contratti", "Primo contratto|Professionista|Veterano|Leggenda della bacheca", [1, 25, 100, 500], "Consegna {n} contratti."),
  T("m:*", "contratti", "Versatile|Coltellino svizzero|Uomo per tutte le stagioni|Tutti i mestieri", [3, 6, 9, 12], "Consegna {n} tipi di contratto diversi."),
  T("m:chain", "contratti", "Primo atto|Sceneggiatore|Regista|Kolossal", [1, 5, 20, 60], "Porta a termine {n} operazioni a tappe."),
  T("m:spree", "contratti", "Raffica|Serie positiva|Inarrestabile|Millecinquecentosette", [1, 5, 20, 60], "Porta a termine {n} raffiche."),
  T("m:stunt", "contratti", "Colpo di scena|Controfigura|Stuntman|Senza rete", [1, 5, 20, 60], "Porta a termine {n} colpi di scena."),
  T("m:audit", "difesa", "Ispettore|Revisore dei conti|Commissario|Corte dei conti", [1, 5, 20, 60], "Porta a termine {n} ispezioni."),
  T("sc:*", "contratti", "Cinefilo|Videoteca|Cineteca|Tutti i film", [3, 8, 15, 30], "Completa {n} copioni diversi."),
  T("elite", "contratti", "Colpo grosso|Lavori difficili|Solo il meglio|Impossibile è un'opinione", [1, 10, 50, 200], "Consegna {n} contratti di grado 3 o superiore."),
  T("ghostpay", "contratti", "Senza traccia|Mani pulite|Fantasma pagato|Il lavoro perfetto", [1, 10, 50, 200], "Incassa {n} bonus «senza traccia»."),
  T("bounty", "contratti", "Cacciatore di taglie|Mercenario|Sicario digitale|Il nome che fa paura", [1, 5, 20, 100], "Esegui {n} taglie di altri handle."),

  // ---------------------------------------------------------------- esplorazione
  T("a:wardial", "esplorazione", "Giochiamo?|Telefono rosso|Centralinista|WOPR", [1, 10, 50, 200], "Lancia {n} scansioni con il War Dialer."),
  T("mg:tone", "esplorazione", "Fischio giusto|2600 Hz|Captain Crunch|Il centralino sono io", [1, 10, 50, 200], "Ripeti {n} volte tutti i toni con la Blue Box durante una scansione."),
  T("seen", "esplorazione", "Prime coordinate|Cartografo|Esploratore|La mappa è il territorio", [10, 80, 220, 480], "Metti {n} nodi sulla tua mappa."),
  T("hidden", "esplorazione", "Fuori dalla mappa|Segreti|Archeologo|Tutti e quattro", [1, 4, 9, 17], "Trova {n} nodi nascosti."),
  T("rumor", "esplorazione", "Soffiata|Orecchie lunghe|Confidente|L'Oracolo sono io", [1, 3, 6, 12], "Ricevi {n} soffiate sui nodi nascosti."),
  T("a:registry", "esplorazione", "Pagine gialle|Elenco telefonico|Informatore|Chi è chi", [1, 10, 50, 200], "Interroga il Registro {n} volte."),
  T("r:*", "esplorazione", "Fuori porta|Intercontinentale|Globetrotter|Il mondo intero", [2, 3, 5, 6], "Opera in {n} regioni del mondo."),
  T("a:connect", "esplorazione", "Carrier|Abbonato|Sempre in linea|Vivo nel Reticolo", [1, 50, 250, 1000], "Apri {n} connessioni."),

  // ---------------------------------------------------------------- sistemi
  T("a:sys", "sistemi", "Riga di comando|Operatore|Sysop|Root del mondo", [1, 25, 100, 400], "Lancia {n} comandi di sistema."),
  T("sys:blackout", "sistemi", "Interruttore|Buio in sala|Città spenta|Blackout continentale", [1, 5, 20, 50], "Provoca {n} blackout."),
  T("sys:shutdown", "sistemi", "Spina staccata|Sabotatore|Demolitore|Fine delle trasmissioni", [1, 5, 20, 50], "Spegni {n} sistemi."),
  T("sys:publish", "sistemi", "Prima pagina|Opinionista|Direttore ombra|Quarto potere", [1, 5, 20, 100], "Pubblica {n} articoli su un handle."),
  T("sys:tap", "sistemi", "Orecchio teso|Cimice|Grande orecchio|Echelon", [1, 5, 20, 100], "Intercetta {n} linee."),
  T("sys:reroute", "sistemi", "Deviazione|Scambio|Smistatore|Centrale fantasma", [1, 5, 20, 100], "Devia {n} volte la tua linea."),
  T("sys:warrant", "sistemi", "Soffiata|Mandato|Giustiziere|Il distretto è mio", [1, 5, 20, 100], "Fai emettere {n} mandati."),
  T("t:worm", "sistemi", "Primo verme|Allevatore|Botnet|Il virus Da Vinci", [1, 10, 50, 200], "Pianta {n} worm."),
  T("wormcr", "denaro", "Spiccioli|Rendita|Mungitura|Superman III", [500, 5000, 25000, 100000], "Incassa {n} CR dalla tua botnet.", true),
  T("staff", "intrusione", "Sono dell'assistenza|Faccia tosta|Ingegnere sociale|Il condor", [1, 15, 60, 250], "Entra {n} volte con le credenziali di un dipendente o dell'operatore."),
  T("z:posta", "dati", "Ficcanaso|Lettore assiduo|Portinaio|Ufficio censura", [1, 20, 100, 400], "Leggi la posta interna di {n} sistemi."),
  T("z:lead", "esplorazione", "Appunto|Agenda fitta|Rubrica nera|Sei gradi di separazione", [1, 15, 60, 200], "Annota {n} indirizzi trovati nella posta."),
  T("z:dossier", "dati", "Panni sporchi|Ricattatore|Archivio dei veleni|Gola profonda", [1, 10, 40, 150], "Copia {n} allegati compromettenti."),
  T("z:rubrica", "esplorazione", "Pagine interne|Centralinista|Smistatore|Tutti i numeri", [1, 15, 60, 200], "Sfoglia {n} rubriche di centralino."),
  T("z:loop", "intrusione", "Nastro in loop|Corridoio vuoto|Regista|Undici uomini", [1, 15, 60, 200], "Metti in loop le telecamere {n} volte."),
  T("z:fattura", "denaro", "Rimborso spese|Fornitore fantasma|Creativo|Contabilità parallela", [1, 15, 60, 250], "Storna {n} fatture."),
  T("z:mastro", "dati", "Partita doppia|Revisore ombra|Mastro di chiavi|I conti veri", [1, 10, 40, 150], "Copia {n} libri mastri."),
  T("bio", "intrusione", "Verificatemi|Il mio passaporto|Uomo dai mille volti|Nessuno, cioè chiunque", [1, 10, 40, 150], "Passa {n} barriere biometriche."),
  T("biosample", "intrusione", "Un capello sul bavero|Collezionista di voci|Schedario parallelo|Banca delle identità", [1, 15, 60, 250], "Ruba {n} campioni biometrici."),
  T("mg:scope", "intrusione", "Buona la prima|Orecchio assoluto|Accordatore|Onda perfetta", [1, 10, 40, 150], "Accorda {n} campioni al primo tentativo."),
  T("z:modelli", "intrusione", "Doppione|Le chiavi di casa|Padrone di casa|La serratura sono io", [1, 5, 20, 60], "Impianta {n} volte i tuoi modelli biometrici."),
  T("z:badge", "intrusione", "Badge|Tornello amico|Dipendente del mese|Assunto ovunque", [1, 10, 40, 150], "Stampati {n} badge."),
  T("z:pivot", "intrusione", "Dall'altra parte|Dietro lo specchio|Speleologo|Nessuna porta chiusa", [1, 5, 20, 66], "Mappa {n} reti interne."),
  T("z:nastri", "difesa", "Moviola|Videoregistratore|Occhio elettronico|Niente si cancella davvero", [1, 10, 50, 200], "Rivedi i nastri {n} volte."),
  T("z:riregistra", "difesa", "Foto tessera|Tutti in fila|Anagrafe nuova|Nessuno è chi dice di essere", [1, 5, 25, 100], "Ri-registra {n} volte il personale di un sistema."),
  T("z:revoca", "difesa", "Tornello chiuso|Portiere|Buttafuori|Qui non passa nessuno", [1, 5, 25, 100], "Revoca i badge {n} volte."),
  T("a:overload", "sistemi", "Surriscaldamento|Ventole al massimo|Fusione|Sindrome cinese", [1, 5, 25, 100], "Sovraccarica {n} gateway."),

  // ---------------------------------------------------------------- giustizia
  T("arrests", "giustizia", "Sette anni senza tastiera|Recidivo|Habitué|Leggenda delle celle", [1, 5, 15, 40], "Fatti arrestare {n} volte."),
  T("traced", "giustizia", "Beccato|Di nuovo|Calamita per i monitor|Bersaglio fisso", [1, 10, 40, 100], "Fatti tracciare {n} volte."),
  T("a:payBail", "giustizia", "Libertà su cauzione|Cliente dell'avvocato|Abbonato al tribunale|Porta girevole", [1, 5, 15, 40], "Paga {n} cauzioni."),
  T("a:clearCharges", "giustizia", "Fedina immacolata|Colpo di spugna|Mai esistito|Nessun precedente", [1, 5, 20, 50], "Svuota {n} fascicoli nel casellario."),
  T("a:useItem", "giustizia", "Asso nella manica|Trucchi|Arsenale|Zero-day", [1, 10, 50, 200], "Usa {n} exploit monouso."),
  T("heatmax", "giustizia", "Sotto i riflettori|Ricercato|Nemico pubblico|Wanted", [1, 5, 20, 50], "Arriva {n} volte al calore massimo."),

  // ---------------------------------------------------------------- difesa
  T("attrib", "difesa", "Segugio|Investigatore|Profiler|Sherlock", [1, 10, 50, 200], "Attribuisci {n} intrusioni al colpevole."),
  T("countertraces", "difesa", "Il muro|Rete di contenimento|Trappola per topi|Nessuno passa", [1, 5, 20, 100], "Chiudi {n} intrusi con il contro-trace."),
  T("t:forensics", "difesa", "Lente d'ingrandimento|Scientifica|CSI del Reticolo|Niente si cancella", [1, 20, 100, 400], "Lancia {n} analisi forensi."),
  T("t:patch", "difesa", "Toppa|Manutentore|Fortificatore|Il sistema immunitario", [1, 20, 100, 400], "Applica {n} Patch Kit."),
  T("t:honey", "difesa", "Miele|Alveare|Apicoltore|La regina", [1, 10, 50, 200], "Piazza {n} honeypot."),
  T("honeytrip", "difesa", "Preso con le mani nel miele|Trappola scattata|Raccolto|Stagione del miele", [1, 5, 25, 100], "Fai scattare {n} tuoi honeypot."),
  T("a:recoverFile", "difesa", "Dal backup|Recuperatore|Nulla va perduto|Lazzaro", [1, 10, 50, 200], "Recupera {n} file cancellati."),
  T("a:reverseTransfer", "difesa", "Storno|Antifrode|Revisore|La banca vince sempre", [1, 10, 50, 200], "Storna {n} bonifici."),
  T("a:preside", "difesa", "Sentinella|Guardiano|Vigilanza armata|Occhio che non dorme", [1, 20, 100, 400], "Presidia {n} volte un nodo."),
  T("a:deploySensor", "difesa", "Microspia|Rete di sensori|Ascolto totale|Panopticon", [1, 10, 50, 200], "Piazza {n} sensori."),
  T("a:counter", "difesa", "Contrattacco|Rispedito al mittente|Caccia al topo|Inseguitore", [1, 10, 50, 200], "Lancia {n} contro-trace."),
  T("a:restart", "difesa", "Riavvio|Pronto soccorso|Rianimatore|Phoenix", [1, 5, 25, 100], "Rimetti in linea {n} sistemi spenti."),
  T("dewormed", "difesa", "Insetticida|Disinfestatore|Antivirus|Immunità di gregge", [1, 10, 50, 200], "Schiaccia {n} worm."),
  T("a:hireAnalyst", "difesa", "Turno di notte|Squadra|Sala operativa|Il SOC non dorme", [1, 5, 25, 100], "Ingaggia {n} volte l'analista."),

  // ---------------------------------------------------------------- mercato
  T("loot", "mercato", "Trovato qualcosa|Cacciatore di tesori|Razziatore|Il bottino è mio", [1, 10, 50, 200], "Trova {n} oggetti."),
  T("rare", "mercato", "Raro|Pezzo pregiato|Da collezione|Wunderkammer", [1, 5, 20, 60], "Trova {n} oggetti rari o migliori."),
  T("legend", "mercato", "Collezionista|Reliquia|Mito|Tutte le leggende", [1, 3, 6, 12], "Trova {n} pezzi leggendari."),
  T("gadget", "mercato", "Aggeggio|Cintura multiuso|Q|Ispettore Gadget", [1, 20, 100, 400], "Usa {n} volte un gadget."),
  T("mw:build", "sistemi", "Hello, world|Scrittore di virus|Zoo personale|Dark Avenger", [1, 5, 20, 60], "Assembla {n} creature nel Laboratorio."),
  T("mw:plant", "sistemi", "Paziente zero|Untore|Focolaio|Pandemia", [1, 15, 60, 250], "Impianta {n} creature nei sistemi."),
  T("mw:spread", "sistemi", "Si è mosso da solo|Contagio|Epidemia|In the wild", [1, 10, 50, 200], "Le tue creature si replicano da sole {n} volte."),
  T("mw:victim", "sistemi", "Timeo Danaos|Regali avvelenati|Mille cavalli|Tutti aprono l'allegato", [1, 10, 50, 200], "{n} vittime installano un tuo trojan."),
  T("mw:cr", "denaro", "Spiccioli altrui|Rendita|Botnet che rende|Il crimine paga", [500, 5000, 30000, 150000], "Incassa {n} crediti dalle tue creature.", true),
  T("mw:seed", "sistemi", "Uploader in malafede|0-day sospetto|Nuker|La scena ti odia", [1, 5, 20, 60], "Carica {n} trojan travestiti nelle aree file dei BBS."),
  T("mw:repack", "sistemi", "Seconda versione|Variante B|Mutante|Mille facce", [1, 5, 20, 60], "Reimpacchetta {n} volte una creatura con la firma pubblicata."),
  T("warez", "mercato", "Copia di sicurezza|Pirata|Collezionista di crack|0-day o niente", [1, 10, 50, 200], "Installa {n} programmi pirata."),
  T("infected", "mercato", "Te l'avevo detto|Ipocondriaco no|Cavia|Colabrodo", [1, 5, 15, 40], "Fatti infettare il deck {n} volte."),
  T("disinfect", "difesa", "Riavvio pulito|Igiene|Camera bianca|Asettico", [1, 5, 20, 60], "Togli {n} infezioni dal tuo deck."),
  T("av:clean", "difesa", "In quarantena|Disinfestatore di reti|Reparto infettivi|Lazzaretto", [1, 15, 60, 250], "Togli {n} infezioni dai sistemi (quarantena o Patch Kit)."),
  T("av:sig", "difesa", "Prima firma|Ricercatore|Laboratorio antivirus|Dottor Solomon", [1, 5, 20, 60], "Pubblica {n} firme."),
  T("bbs:days", "sociale", "CONNECT 2400|Abbonato|Di casa|Linea sempre occupata", [1, 10, 40, 150], "Chiama un BBS in {n} giorni (ogni BBS conta per sé)."),
  T("bbs:post", "sociale", "Primo messaggio|Penna facile|Colonna della bacheca|Sysop onorario", [1, 15, 60, 250], "Scrivi {n} messaggi sui BBS."),
  T("bbs:up", "mercato", "Uploader|Rapporto in attivo|Corriere|La scena ringrazia", [1, 10, 40, 150], "Carica {n} file su un BBS."),
  T("bbs:down", "mercato", "Leech educato|Zero-day warez|Collezione completa|Hard disk pieno", [1, 7, 30, 100], "Scarica {n} pacchetti dall'area file di un BBS."),
  T("bbs:door", "sociale", "Porta aperta|Mercante|Grossista|Il re del porto", [1, 7, 30, 100], "Chiudi {n} giornate al Mercante di Chip."),
  T("bbs:tris", "esplorazione", "Pari|Stallo|Nessun vincitore|Strano gioco", [1, 3, 10, 30], "Pareggia {n} partite a tris con il sistema del professore."),
  T("bbs:gtw", "esplorazione", "Vuoi fare una partita?|DEFCON 1|Vincitore: nessuno|L'unica mossa vincente", [1, 3, 10, 30], "Simula {n} volte la Guerra Termonucleare Globale."),
  T("xdcc", "mercato", "Leecher|Abbonato|Collezionista di zip|Ratio 1:0", [1, 7, 30, 100], "Scarica {n} pacchetti dal bot XDCC."),
  T("a:equip", "mercato", "Saldatore|Overclock|Wetware|Cyborg", [1, 5, 20, 50], "Monta {n} chip sul deck."),
  T("a:fence", "mercato", "Ricettatore|Affari sporchi|Giro di merce|Il mercato nero sono io", [1, 25, 100, 500], "Vendi {n} file al ricettatore."),
  T("sold", "mercato", "Prima vendita|Bancarella|Negozio|Monopolio", [1, 10, 50, 200], "Vendi {n} file ad altri handle."),
  T("a:buyListing", "mercato", "Compratore|Buon cliente|Collezionista di segreti|Insider", [1, 10, 50, 200], "Compra {n} file al mercato nero."),
  T("a:postBounty", "mercato", "Mandante|Committente|Burattinaio|L'uomo nell'ombra", [1, 5, 20, 100], "Metti {n} taglie in bacheca."),

  // ---------------------------------------------------------------- sociale
  T("ircmsg", "sociale", "Lurker|Chiacchierone|Regular|Idle da record", [10, 200, 1000, 5000], "Scrivi {n} righe su ReticoloNet."),
  T("traded", "sociale", "Baratto|Mercante|Trafficante|Via della seta", [1, 10, 50, 200], "Concludi {n} scambi con altri handle."),
  T("paid", "sociale", "Mancia|Mecenate|Banchiere della crew|Filantropo", [1000, 10000, 50000, 200000], "Manda {n} CR ad altri handle.", true),
  T("duelwin", "sociale", "Primo sangue|Duellante|Pistolero|Il più veloce del Reticolo", [1, 5, 25, 100], "Vinci {n} duelli."),
  T("duellose", "sociale", "Lezione|Sparring|Sacco da boxe|Sa perdere", [1, 5, 25, 100], "Perdi {n} duelli. Succede."),
  T("a:crewDonate", "sociale", "Colletta|Socio|Tesoriere|Cassa comune", [1, 10, 50, 200], "Versa {n} volte nella cassa della crew."),

  // ---------------------------------------------------------------- carriera
  T("$xp", "carriera", "Apprendista|Esperto|Maestro|Elite", [1000, 10000, 50000, 150000], "Raggiungi {n} XP."),
  T("$fame", "carriera", "Conosciuto|Chiacchierato|Celebre|Icona del Reticolo", [50, 250, 1000, 3000], "Raggiungi {n} punti di fama."),
  T("$credits", "carriera", "Gruzzolo|Conto a sei cifre|Ricco|Paperone", [10000, 100000, 500000, 2000000], "Abbi {n} CR sul conto.", true),
  T("days", "carriera", "Primo giorno|Una settimana|Un mese|Cento giorni", [1, 7, 30, 100], "Gioca in {n} giorni diversi."),
  T("a:buyTool", "carriera", "Primo software|Cassetta degli attrezzi|Arsenale|Suite completa", [1, 5, 15, 30], "Compra {n} software."),
  T("a:buyHw", "carriera", "Primo upgrade|Cacciavite|Overclocker|La macchina perfetta", [1, 4, 10, 20], "Compra {n} componenti hardware."),
];

export type AchState = { id: string; track: Track; tier: number; name: string; goal: number; value: number; done: boolean };

export const achId = (key: string, tier: number) => `${key}#${tier}`;

/** Valore di una serie, dai contatori e dai numeri dell'agente. */
export function trackValue(t: Track, counters: Record<string, number>, self: { xp: number; fame: number; credits: number }) {
  if (t.key === "$xp") return self.xp;
  if (t.key === "$fame") return Math.round(self.fame);
  if (t.key === "$credits") return self.credits;
  if (t.key.endsWith("*")) {
    const p = t.key.slice(0, -1);
    return Object.keys(counters).filter((k) => k.startsWith(p) && (counters[k] ?? 0) > 0).length;
  }
  return counters[t.key] ?? 0;
}

/** Le serie toccate da un contatore che è appena salito. */
export function tracksFor(key: string) {
  return TRACKS.filter((t) => t.key === key || (t.key.endsWith("*") && key.startsWith(t.key.slice(0, -1))));
}

export const ACH_TOTAL = TRACKS.length * 4;

export function fmtGoal(t: Track, n: number) {
  return n.toLocaleString("it-IT") + (t.money ? " CR" : "");
}

/** Come si chiama ogni contatore nelle statistiche personali e globali. */
export const STAT_LABEL: Record<string, string> = {
  "t:proxy": "Proxy abbattuti",
  "t:firewall": "Firewall abbattuti",
  "t:monbypass": "Monitor confusi",
  "t:breaker": "Password forzate",
  "t:dict": "Dizionari lanciati",
  "a:login": "Password indovinate a mano",
  nodes: "Nodi diversi da admin",
  "k:*": "Tipi di sistema violati",
  "mg:rotor": "File decifrati a mano",
  "mg:rotorclean": "Chiavi trovate al volo",
  "mg:rotormanual": "File sopra il tuo Decrypter",
  "mg:rotorlost": "Chiavi ruotate",
  "mg:grid": "Firewall aperti a mano",
  "mg:gridclean": "Brecce pulite",
  "mg:gridmanual": "Firewall sopra la tua versione",
  "mg:gridlost": "Griglie fallite",
  hops: "Relay attraversati",
  longroute: "Operazioni con 6+ relay",
  "t:bdkit": "Backdoor installati",
  gw: "Gateway altrui violati",
  night: "Operazioni notturne",
  close: "Stacchi oltre il 90%",
  ghost: "Indagini senza nome",
  "a:clientLogin": "Accessi con credenziali cliente",
  "t:copy": "File copiati",
  "t:decrypt": "File decifrati",
  "t:delete": "File cancellati",
  logs: "Righe di log tolte",
  forged: "Righe di log falsificate",
  "a:alter": "Campi d'archivio alterati",
  "a:searchRecords": "Ricerche negli archivi",
  "t:upload": "Carichi consegnati",
  earned: "Crediti guadagnati",
  "a:transfer": "Bonifici mossi",
  stolen: "Crediti sottratti",
  "a:siphon": "Gateway prosciugati",
  "sys:cash": "Casse svuotate",
  spent: "Crediti spesi in dotazione",
  "a:deliver": "Contratti consegnati",
  "m:*": "Tipi di contratto diversi",
  elite: "Contratti di grado 3+",
  ghostpay: "Bonus «senza traccia»",
  bounty: "Taglie eseguite",
  "a:wardial": "Scansioni del War Dialer",
  "mw:build": "Creature assemblate",
  "mw:plant": "Creature impiantate",
  "mw:spread": "Repliche spontanee",
  "mw:victim": "Vittime dei tuoi trojan",
  "mw:cr": "Crediti dalle creature",
  "mw:seed": "Trojan caricati sui BBS",
  "mw:repack": "Reimpacchettamenti",
  "mw:mod": "Moduli trovati",
  warez: "Programmi pirata installati",
  infected: "Infezioni prese",
  disinfect: "Infezioni tolte dal deck",
  "av:clean": "Infezioni tolte dai sistemi",
  "av:sig": "Firme pubblicate",
  "av:scan": "Scansioni antivirus",
  "bbs:call": "Chiamate ai BBS",
  "bbs:days": "Giorni di chiamata ai BBS",
  "bbs:post": "Messaggi sui BBS",
  "bbs:up": "File caricati sui BBS",
  "bbs:down": "Pacchetti scaricati dai BBS",
  "bbs:door": "Giornate al Mercante di Chip",
  "bbs:tris": "Pareggi a tris col sistema",
  "bbs:gtw": "Guerre termonucleari simulate",
  "bbs:read": "Testi letti sui BBS",
  "mg:tone": "Centralini ingannati",
  "mg:tonelost": "Toni sbagliati",
  seen: "Nodi sulla mappa",
  hidden: "Nodi nascosti trovati",
  "a:registry": "Interrogazioni del Registro",
  "r:*": "Regioni in cui hai operato",
  "a:connect": "Connessioni aperte",
  "a:sys": "Comandi di sistema",
  "sys:blackout": "Blackout",
  "sys:shutdown": "Sistemi spenti",
  "sys:publish": "Articoli pubblicati",
  "sys:tap": "Linee intercettate",
  "sys:reroute": "Linee deviate",
  "sys:warrant": "Mandati fatti emettere",
  "a:overload": "Gateway sovraccaricati",
  arrests: "Arresti",
  traced: "Volte tracciato",
  "a:payBail": "Cauzioni pagate",
  "a:clearCharges": "Fascicoli svuotati",
  "a:useItem": "Exploit usati",
  heatmax: "Volte al calore massimo",
  attrib: "Intrusioni attribuite",
  countertraces: "Intrusi presi col contro-trace",
  "t:forensics": "Analisi forensi",
  "t:patch": "Patch Kit applicati",
  "t:honey": "Honeypot piazzati",
  honeytrip: "Honeypot scattati",
  "a:recoverFile": "File recuperati",
  "a:reverseTransfer": "Bonifici stornati",
  "a:preside": "Presidi",
  "a:deploySensor": "Sensori piazzati",
  "a:counter": "Contro-trace lanciati",
  "a:restart": "Sistemi riaccesi",
  "a:hireAnalyst": "Analisti ingaggiati",
  loot: "Oggetti trovati",
  rare: "Oggetti rari o migliori",
  legend: "Pezzi leggendari",
  "a:equip": "Chip montati",
  "a:fence": "File al ricettatore",
  sold: "File venduti ad altri",
  "a:buyListing": "File comprati al mercato nero",
  "a:postBounty": "Taglie messe in bacheca",
  $xp: "Esperienza",
  $fame: "Fama",
  $credits: "Crediti sul conto",
  days: "Giorni di gioco",
  "a:buyTool": "Software comprati",
  "a:buyHw": "Hardware comprato",
  staff: "Accessi da dipendente o operatore",
  "z:posta": "Caselle di posta lette",
  "z:lead": "Indirizzi annotati dalla posta",
  "z:dossier": "Allegati compromettenti",
  "z:rubrica": "Rubriche sfogliate",
  "z:loop": "Telecamere in loop",
  "z:fattura": "Fatture stornate",
  "z:mastro": "Libri mastri copiati",
  "z:badge": "Badge stampati",
  bio: "Barriere biometriche passate",
  biosample: "Campioni biometrici rubati",
  "mg:scope": "Campioni accordati al primo colpo",
  "mg:scopelost": "Lettori bloccati",
  "z:modelli": "Modelli impiantati",
  "z:riregistra": "Personale ri-registrato",
  "z:voce": "Voci registrate",
  "z:impronta": "Impronte copiate",
  "z:retina": "Retine copiate",
  "z:pivot": "Reti interne mappate",
  "z:nastri": "Nastri rivisti",
  "z:revoca": "Revoche di badge",
  "m:chain": "Operazioni a tappe",
  "m:spree": "Raffiche",
  "m:stunt": "Colpi di scena",
  "m:audit": "Ispezioni",
  "sc:*": "Copioni diversi completati",
  rumor: "Soffiate ricevute",
  gadget: "Gadget usati",
  xdcc: "Pacchetti XDCC",
  "t:worm": "Worm piantati",
  wormcr: "Crediti dalla botnet",
  dewormed: "Worm schiacciati",
  ircmsg: "Righe su ReticoloNet",
  traded: "Scambi conclusi",
  paid: "Crediti mandati ad altri",
  duelwin: "Duelli vinti",
  duellose: "Duelli persi",
  "a:crewDonate": "Versamenti alla crew",
  signup: "Iscrizioni",
  login: "Accessi",
};
