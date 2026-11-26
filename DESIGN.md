# AETHER — note di design

Punto di partenza: la conversazione Grok «Rielaborazione moderna di Uplink in multiplayer cyberpunk»
(mondo persistente condiviso, rosso/blu, sabotaggio, classifiche multiple, estetica da film hacker),
il sorgente C++ di Uplink e la bozza AETHER generata da Grok (TanStack Start + Postgres).

## Cosa viene da dove

**Dal modello di Uplink** (sorgente in `extracted/uplink`):
- rimbalzo sui relay scelto sulla mappa, con il monitor che risale la catena **hop per hop** fino al gateway;
- strumenti che girano in parallelo e si dividono la CPU (Password Breaker che rivela un carattere alla volta, bypass di proxy/firewall/monitor, Decrypter, Log Deleter);
- hardware del gateway (CPU, modem, memoria) che decide velocità, hop massimi e task contemporanei;
- log persistenti sui nodi e consegna dei contratti verificata sullo stato del mondo.

**Dalla bozza AETHER** (`extracted/grok`): nome, ambientazione Reticolo 2039, ranghi per cellula,
catalogo di software, backdoor sui relay, honeypot, incastri, NPC che tengono vivo il mondo, testi in italiano.
La bozza non è stata riusata come codice: dipendeva dall'infrastruttura Grok/Vercel e i suoi mini-giochi
inviavano al client la soluzione. Qui tutto è autoritativo sul server.

**Dalla visione Grok**: mondo condiviso e persistente, conseguenze che restano (nodi rinforzati, relay
avvelenati, file cancellati), classifiche multiple, cat-and-mouse rosso/blu, rischio permanente («burned»).

## Il ciclo

**Rosso**: contratto → rimbalzo sulla mappa → connessione (parte il trace) → bypass e password →
lavoro (copia, cancella, altera un record, installa backdoor) → **pulizia del log** → stacco → consegna.

**Blu**: contratti cliente con credenziali (niente password, niente trace) → rinforzo nodi, bonifica relay,
honeypot sui file → **cacce**: leggere il log del nodo violato, seguire l'IP d'origine relay dopo relay
fino al gateway colpevole, consegnarne l'IP. Forensics ricostruisce le righe cancellate male.

## La catena delle prove (meccanica centrale)

Ogni connessione scrive righe vere nel mondo condiviso:
- su ogni relay: `ROUTE <hop precedente> -> <hop successivo>`;
- sul bersaglio: `CONNECT`, `WARN` (bypass e breaker sono rumorosi), `LOGIN`, `FILE`, `RECORD`, sempre con l'IP da cui arrivi.

Sei identificabile finché la catena è intatta: bersaglio → relay → … → gateway.
- Log Deleter v1 lascia un buco visibile (ricostruibile con Forensics per 30 minuti), v2 cancella pulito, v3 riscrive l'IP d'origine.
- Falsificare l'origine verso il gateway di un rivale **lo incastra davvero**: la Guardia del Reticolo e i blu seguono le prove visibili, non la verità.
- I log dei relay scadono dopo 25 minuti e quelli dei bersagli dopo 75: il tempo gioca per il rosso, la velocità per il blu.
- Dopo 6 minuti la Guardia del Reticolo (NPC) percorre la catena: se arriva a un gateway, calore +20 a quel giocatore.

## Interazioni fra giocatori già attive

- **Backdoor**: chi rimbalza sul relay avvelenato da un rivale viene tracciato più in fretta (×0,35 su quell'hop); il proprietario incassa una provvigione e riceve l'IP della vittima.
- **Honeypot**: chi copia il file trappola prende calore e il suo IP arriva al blu che l'ha piazzata.
- **Incastri**: contratti rossi per far ricadere un'intrusione su un altro handle (anche un giocatore vero).
- **Presidio e contro-trace**: un blu presidia un nodo; se un rosso ci entra mentre il blu è online, lo vede e può accelerare il trace (×1,7 per 20 s). Se il rosso viene preso, il blu incassa.
- **Cacce**: ogni intrusione che lascia danni genera (80%) una caccia per i blu, risolvibile solo seguendo i log.
- **Registro**: 200 CR per risolvere un IP in handle o viceversa; serve ai blu per confermare e ai rossi per trovare chi incastrare.
- **Calore**: sale con tracce, attribuzioni e honeypot; a 100 il gateway viene sequestrato (multa, hardware −1, archivio perso, nuovo IP).

## Gateway attaccabili

Ogni giocatore (e ogni NPC) ha un gateway raggiungibile componendo il suo IP: non compare sulla mappa.
- **Come si trova un indirizzo**: Registro (200 CR), passaggi sui tuoi backdoor, honeypot scattati, cacce risolte, intrusi tracciati. Finiscono nella rubrica «Indirizzi noti» della scheda Gateway.
- **Difese** (nuovo hardware, livelli 1-5): proxy, firewall e monitor del gateway salgono con il livello; la password si allunga e **cambia dopo ogni intrusione**.
- **Dentro**, con l'accesso admin: copiare o cancellare i file dell'archivio della vittima (le copie valgono per consegnare i suoi contratti), **prosciugare i conti** (15%, max 2.000 CR, una volta ogni 30 minuti per vittima), **sovraccaricare la CPU** (strumenti della vittima a metà velocità per 10 minuti).
- **Difesa attiva**: se il proprietario è online riceve l'allarme e può lanciare il contro-trace. Se l'intruso viene tracciato, la vittima riceve metà multa più il maltolto e il suo indirizzo.
- **Rivalsa**: ogni intrusione che lascia danni genera per la vittima un contratto di caccia personale. Il log del proprio gateway è nella scheda Gateway; da lì si risale relay dopo relay come in una caccia blu. Ricompensa: 400 CR più quanto rubato.
- **Protezione dei nuovi**: sotto i 200 XP non si può attaccare un gateway né essere attaccati.

## Mercato tra giocatori

Nella scheda Mercato, accanto all'attrezzatura:
- **Mercato nero**: i file rubati si mettono in vendita a un prezzo scelto (100-50.000 CR, massimo 5 annunci, 3 ore).
  Chi compra riceve una copia «originale», valida per consegnare i contratti; il mercato trattiene il 10%.
  Ogni annuncio mostra quanti contratti aperti chiedono proprio quel file. Gli invenduti tornano nell'archivio.
- **Ricettatore**: un NPC compra subito qualsiasi file, a prezzo basso (in base al valore e alla dimensione del file):
  tiene liquido il mercato anche con pochi giocatori.
- **Taglie**: contratti scritti dai giocatori, con la ricompensa in deposito e una commissione del 5% non rimborsabile.
  Tipi: estrazione (il file arriva a chi paga), cancellazione, assalto al gateway di un handle (vale un prelievo
  o un sabotaggio riuscito dopo l'accettazione), incastro (solo rossi), localizzazione (si consegna l'IP del suo gateway,
  che arriva anche a chi paga). Si sceglie la bacheca (rossi o blu) e la durata (1-24 ore); scadute o ritirate,
  la ricompensa torna indietro. Al massimo 3 taglie aperte per handle.

## Profondità: archivi, contratti, bottino, fama, giustizia

### La popolazione
100 cittadini generati da un seme fisso (`server/people.ts`), ognuno con foto tessera (PixelLab), anno e città di nascita,
mestiere, ID Reticolo, conto in banca, eventuale carriera universitaria e precedenti. Compaiono in:
anagrafe (Archivio Civico di Vesper: stato in vita, residenza, nulla osta, e l'unico posto dove si legge l'ID Reticolo),
casellario (Polizia di Meridia: precedenti, stato), atenei (Halcyon e Karsk: corso, titolo, voto),
banche (Orsini Kreditt per i ricchi, Credito Cooperativo di Meridia per gli altri: conto e saldo).
Gli archivi si interrogano con una ricerca libera (nome, anno, mestiere, città, ID, numero di conto), come in Uplink.

### Contratti (18 tipi)
Rossi: estrazione, cancellazione, **alterazione con movente** (far risultare morto qualcuno, pulire o sporcare una fedina,
regalare una laurea, alzare un voto, dare un nulla osta), **profilo** (pochi indizi, da incrociare fra più archivi, per
consegnare l'ID Reticolo della persona), **bonifico** fra due conti, **distruzione** di un intero archivio,
**trasporto** (un carico grosso da un nodo a un altro prima che si corrompa, 12 minuti), backdoor, incastro, più le taglie.
Blu: rinforzo, bonifica, honeypot, caccia, profilo (con credenziali su tutti gli archivi), e tre contratti che nascono
da quello che fanno i rossi: **ripristino** di un record manomesso, **recupero** di un file dal backup, **storno** di un bonifico.
- **Grado** (Ordinario → Leggendario) dalla sicurezza del nodo: decide paga, probabilità di bottino e fama; i gradi alti
  si vedono solo con abbastanza fama (60 / 250 / 700).
- **Complicazioni** casuali: Urgente (12 minuti, +40%), Senza traccia (+50% se nel log non resta nessuna tua riga),
  Presidiato (trace +35%, paga +30%).

### Bottino e rarità
Cinque rarità (Comune, Non comune, Raro, Epico, Leggendario). I file di dati hanno una rarità dal loro valore.
- **Exploit** (monouso): Alibi (calore −25), Loop di telecamera (trace fermo 20 s), 0-day Proxy e Firewall,
  Scrubber di sessione (cancella pulite le tue righe), Rotta fantasma (trace da zero), Chiave scheletro (admin immediato),
  Avvocato (cade l'accusa più grave).
- **Chip** (permanenti, 1-4 slot secondo il rango): velocità strumenti, trace più lento, copia più rapida, archivio più
  grande, meno calore, ricompense più alte, più fortuna, hop in più.
- **Leggendari unici**, solo nei nodi nascosti e una volta per handle: Nucleo Joshua, Deck di Zero Cool, Memoria di Johnny,
  Cortex di Jobe.
- Da dove arriva: tiro alla consegna dei contratti (8-60% secondo il grado), pacchetti che compaiono sui nodi e che prende
  chi arriva primo, nodi nascosti, mercato nero, furto dai gateway altrui (gli oggetti in archivio si portano via;
  i chip montati no).

### Nodi nascosti e War Dialer
Quattro nodi non sono su nessuna mappa: Crystal Palace (WarGames, password JOSHUA), Gibson (Hackers, password GOD),
Pharmakom (Johnny Mnemonic, un file da 48 GQ che serve tanta memoria per portare via), VSI (Il Tagliaerbe).
Il War Dialer (100 CR a scansione) compone numeri a tappeto e ogni tanto ne trova uno; chi conosce l'IP può anche
comporlo a mano, quindi le coordinate si possono vendere o regalare.

### Fama, etica, imprese, ranghi
- 12 ranghi di esperienza per cellula. La **fama** è separata: sale con contratti, imprese e colpi grossi, sbiadisce di
  circa l'1% l'ora, dà un titolo pubblico, apre i contratti scottanti. Per i rossi ha un prezzo: +2% di velocità del trace
  per ogni titolo.
- **Etica** da Spietato a Idealista, secondo quello che si fa (per ora è un tratto visibile, senza effetti).
- 18 **imprese** con nomi dai film (Hack the Planet!, Crash Override, Mess with the best, Corriere mnemonico,
  L'unica mossa vincente…), alcune segrete.

### Rischio e giustizia
Il calore resta l'attenzione a breve termine; i **capi d'accusa** sono il fascicolo a lungo termine.
- Si prendono quando si viene tracciati in flagrante (2), identificati da un'indagine (1), attribuiti da un blu (2),
  presi da un honeypot (1), incastrati (2); la frode bancaria vale 3.
- **Mandato**: Attenzionato (3 punti, trace +10%), Ricercato (6, trace +20%, indagini due volte più rapide),
  Mandato federale (9, trace +30%): al capo d'accusa successivo scatta l'**arresto**.
- **Arresto** (anche a calore 100): custodia da 1 a 6 minuti o cauzione, multa del 20-40%, archivio sequestrato, un chip
  montato perso una volta su due, CPU e modem −1, −5% XP, nuovo indirizzo; il fascicolo si chiude.
- **Indagini visibili**: nella scheda Gateway c'è il conto alla rovescia di ogni indagine aperta (6 minuti, 3 per banche,
  polizia e militari). È il tempo per tornare a cancellare i log sui relay.
- **Bonifici verso il proprio conto**: massimo 25% del saldo, due per sessione; il denaro resta in transito e arriva solo
  se l'indagine si chiude senza un nome. Se ti risalgono, o un blu storna, torna indietro.
- **Ripulirsi**: entrare nel casellario di Meridia e svuotare il proprio fascicolo (o quello di un altro handle), oppure
  usare un Avvocato.

## Il planisfero e il rimbalzo

La mappa è un vero planisfero 320×180, disegnato dalla sagoma reale dei continenti (Natural Earth, pubblico dominio;
`scripts/worldmap.py` e `scripts/worldmap-styles.py`). Cinque stili a scelta, salvati nel browser: Reticolo (vettoriale),
Uplink (blu a retino), NORAD (fosfori ambra, da WarGames), Neon (continenti a circuito, texture PixelLab), Notte
(luci delle città vere). Tutti condividono la stessa geografia, quindi i nodi stanno sempre sulle stesse città.
Ogni handle chiama da una città assegnata dal suo indirizzo.

Il rimbalzo non conta più solo gli hop. Ogni relay ha un moltiplicatore del tempo di risalita, che la mappa mostra
prima di collegarsi (`routeTrace` in `shared/rules.ts`, la stessa funzione su server e client):
- **Tipo di relay** (17 in tutto): Pubblico ×1, gratis, log 25 min · Carrier commerciale ×0,75, log 45 min ·
  Rete grigia ×1,25, 60 CR, log 10 min · Offshore ×1,5, 200 CR, log 5 min · Satellitare ×1,8, 350 CR, log 15 min.
  La durata dei log decide quanto tempo hanno i blu per seguire la catena.
- **Confini**: ogni cambio di giurisdizione (sei regioni) vale ×1,35.
- **Distanza**: le tratte lunghe rallentano chi risale, da ×0,85 a ×1,25.
- **Chiavi**: se hai avuto l'accesso admin a un relay ne tieni le chiavi (×1,4) finché un blu non lo bonifica:
  la bonifica cambia la password e revoca le chiavi a tutti.
- **Usura**: ogni uso dello stesso relay negli ultimi 10 minuti toglie il 12% (fino a −50%): i percorsi abituali si bruciano.
- **Backdoor altrui** ×0,35, come prima.
- **Percorsi salvati**: tre rimbalzi preferiti per handle, nel browser.
- Il modem (e i chip) decidono quanti hop regge il rimbalzo, da 3 a 7 e oltre.

## Bilanciamento misurato

`scripts/playtest.ts` fa giocare a un bot la stessa operazione completa (bypass, password, decifra, copia, pulizia dei log)
a cinque livelli di equipaggiamento, con un rimbalzo ingenuo (solo relay pubblici) e uno curato (fino a 900 CR di tariffe),
con 1,8 secondi di reazione per azione. Trace consumato a fine operazione dopo la taratura:

| Livello | Bersaglio tipo | Ingenuo | Curato |
|---|---|---|---|
| Esordiente (tutto v1, 3 hop) | università, redazione | 42-46% | 25-27% |
| Primi acquisti (4 hop) | ateneo, anagrafe, trasporti | 60-70% | 37-43% |
| Metà carriera (v2, 5 hop) | corporazioni, laboratori | 44-80% | 27-48% |
| Avanzato (v3, 6 hop) | polizia federale | 73% | 44% |
| Fine gioco (tutto al massimo, 7 hop) | banca Orsini | 84% | 57% |

Prima della taratura nessuna operazione superava il 55% e la banca si chiudeva al 44%: CPU e versioni acceleravano più
di quanto la sicurezza rallentasse. Modifiche: potenza CPU +40% per livello (era +50%), versioni +30% (era +35%),
monitor 10,5 / 8,2 / 6,4 / 4,0 / 2,9 secondi per hop, password dei nodi blindati più lunghe da forzare,
costi degli ultimi livelli più alti (hardware 1.500 / 3.500 / 7.000 / 12.000; strumenti v3 a 4,5 volte la base),
custodia al massimo 4 minuti, sempre almeno quattro contratti di grado basso in bacheca.
Non misurati dal bot: economia nel lungo periodo, frequenza del bottino, lato blu.

## Economia e lato blu (misurati)

`scripts/economy.ts` campiona 4.000 contratti per cellula dal generatore vero e stima guadagno orario e tempi di crescita
a ritmo umano (rossi: durata dell'operazione dal playtest + 80 s fra lettura, rimbalzo e consegna; blu: 25 s per gli
incarichi brevi, 120 s per i profili, + 60 s).

Prima della taratura un rosso guadagnava 1.600-4.900 CR a contratto e tutto l'equipaggiamento costava 192.000 CR:
circa 3-4 ore per avere tutto. I blu pagavano 900-1.700 CR senza crescere col grado, ma con incarichi da pochi secondi
e nessun rischio rendevano all'ora quanto i rossi.

Dopo la taratura:

| | Rossi | Blu |
|---|---|---|
| Paga media per grado 0 → 4 | 1.100 → 3.470 CR | 560 → 1.560 CR |
| Guadagno orario per grado 0 → 4 | 31.000 → 85.000 CR | 23.000 → 63.000 CR |
| XP all'ora | 5.200 → 12.600 | 3.400 → 8.600 |
| Ore di contratti per comprare tutto | circa 6 | circa 9 |

Leve usate: `REWARD_SCALE = 0,7` su tutti i contratti generati (non su taglie e contratti di prova), strumenti v2 a 2,5
volte la base e v3 a 9 volte, hardware 1.500 / 4.500 / 12.000 / 26.000, soglie dei ranghi alti allungate fino a 56.000 XP,
paga e XP dei blu che crescono col grado del nodo. Con ricompense più basse le tariffe dei relay pesano di più:
un rimbalzo offshore e satellitare da 600 CR è un lusso ai gradi bassi e una scelta ai gradi alti.
Il modello non include: i gradi sbloccati dalla fama, le perdite per arresto, il bottino, le vendite al mercato nero.

Lato blu, verificato da `scripts/smoke-blue.ts` (un rosso fa danni, un blu chiude i contratti che ne nascono):
rinforzo, recupero, ripristino, storno, bonifica, caccia fino al gateway, profilo con credenziali su tutti gli archivi.
Corretti tre difetti che rendevano ingiocabili dall'interfaccia alcuni contratti blu: sui relay mancava il pulsante
delle credenziali del cliente (si parte da ospiti), nei profili le credenziali valevano solo sull'anagrafe, e il monitor
partiva contro un blu regolarmente incaricato prima che usasse le credenziali.

## La sala operativa dei blu (le loro spese)

I blu guadagnavano senza avere su cosa spendere. Ora hanno tre investimenti, tutti legati al gioco di difesa:
- **Console SOC** (hardware solo blu, 5 livelli, stessi costi dell'altro hardware: 44.000 CR in tutto): da 1 a 5 nodi
  presidiati insieme, da 2 a 6 sensori, presidi da 20 a 60 minuti, contro-trace da ×1,7 a ×2,1 con ricarica da 35 a 19 secondi.
- **Sensori** (1.200 CR, 45 minuti, su nodi e relay): avvisano quando passa un rosso e copiano ogni riga di log con un
  indirizzo d'origine. La copia si legge dalla scheda Gateway, non si cancella né si falsifica, e **vale come prova**
  quando il proprietario consegna una caccia; sulle cacce dove aveva un sensore il cliente paga il 25% in più.
  Contromossa dei rossi: con Monitor Bypass v2 i sensori si vedono dalla mappa, e da admin si possono staccare:
  la copia della sessione in corso va persa (quelle passate restano).
- **Analista di turno** (2.500 CR l'ora): i presidi restano attivi anche a giocatore scollegato e il contro-trace parte da solo.

Peso sull'economia: con quattro sensori sempre attivi e l'analista si spendono circa 9.000 CR l'ora, fra il 15 e il 35%
di quello che un blu guadagna (23.000-63.000 CR l'ora). Verificato da `scripts/smoke-soc.ts`.

## Mondo aperto: 320 nodi, esplorazione, reazioni

### Il mondo
Ai 34 nodi scritti a mano se ne aggiungono circa 290 generati da un seme fisso (`server/worldgen.ts`), su 73 città:
44 attività commerciali (banchi dei pegni, videonoleggi, hotel, casinò, sale giochi…), 40 aziende di nove settori,
20 uffici pubblici (imposte, dogane, catasto, motorizzazione…), 16 fra ospedali, cliniche e farmacie, 14 reti di servizio
(elettricità, acqua, traffico, aeroporti, porti), 14 laboratori, 12 banche, 12 scuole e biblioteche, 10 compagnie
telefoniche, 10 testate, 10 questure, tribunali e carceri, 14 relay, 70 PC di casa dei cittadini.
Ogni tipo ha nomi, difese, file, archivi e password del suo genere. I 100 cittadini hanno un datore di lavoro,
e ogni organizzazione ha un amministratore di sistema che a casa tiene gli appunti con la password dell'ufficio:
il PC di casa non è sorvegliato e la sua password è nome più anno di nascita.

### Esplorare
All'inizio si conoscono 30 nodi. Gli altri si scoprono con: **scansioni per regione** (War Dialer, ora in dotazione a tutti:
100 CR, da 2 a 5 nodi a scansione secondo la versione, e ogni tanto un nodo segreto), **componendo un IP** qualunque,
**il Registro** (anche per nome dell'organizzazione), **le compagnie telefoniche** (intercettando un cittadino si ottengono
casa e datore di lavoro), **i contratti** (il cliente dà l'indirizzo del bersaglio, tranne quello dei PC di casa).
La mappa ha sette inquadrature (mondo e sei regioni) e una ricerca fra i nodi conosciuti.

### Ogni nodo si comporta secondo quello che è
- **Sorveglianza**: un PC di casa non ha monitor; un negozio non guarda chi entra e il monitor parte solo alla prima
  mossa rumorosa (uno strumento, una password, un file); tutti gli altri tracciano dal primo istante.
- **Blocco del login**: uffici pubblici, ospedali e compagnie telefoniche bloccano l'utenza dopo 3 password sbagliate;
  banche, polizia e militari dopo 2, con un salto in avanti del trace.
- **Turni di notte**: negozi, uffici, scuole, aziende e laboratori hanno un livello di monitor in meno fra le 22 e le 6,
  ora locale del nodo (dalla sua longitudine).
- **Allerta**: dopo un'intrusione che lascia danni il nodo alza il monitor di un livello per 20 minuti e cambia password.
- **Ritorsione**: alla terza intrusione dello stesso handle, aziende, banche, laboratori, telefoniche e reti di servizio
  mettono una taglia sul suo indirizzo.
- **Comandi di sistema** (da admin, diversi per tipo): svuotare la cassa di un negozio; pubblicare un articolo su una
  testata (fama di un handle su o giù); intercettare un'utenza o deviare la propria linea da una telefonica (ultimo tratto
  del trace ×1,6 per 30 minuti); blackout regionale da una rete elettrica (monitor −1 e sensori ciechi per 5 minuti);
  mandato d'ufficio da una questura (un capo d'accusa a un altro handle); spegnere qualunque sistema per 8 minuti.

### Le missioni di Uplink
Ora ci sono tutte quelle del gioco originale, tranne la trama: rubare e cancellare file, alterare i registri accademici,
giudiziari e anagrafici, **trovare i dettagli finanziari**, **seguire un bonifico**, fare un bonifico, rintracciare un
hacker, **far arrestare qualcuno**, incastrare qualcuno, distruggere un archivio, **spegnere un sistema**, il test iniziale.
In più i lavori sui PC di casa (il cliente dà solo il nome) e, per i blu, il riavvio dei sistemi spenti.
In tutto 23 tipi di contratto; i rossi ne vedono 13 in bacheca con quote fra il 5 e il 20%.

### Mercato a due canali
Stesso catalogo per tutti. Gli strumenti di mestiere dell'altra cellula (Kit Backdoor per i blu; Forensics, Honeypot e
Patch Kit per i rossi) si comprano fuori canale a 1,75 volte il prezzo; strumenti comuni e hardware costano uguale.
Resta solo dei blu la Console SOC, che è la loro sala operativa.

Tecnica: l'elenco dei nodi è la parte pesante dello stato e parte intero dopo ogni azione del giocatore, poi al massimo
ogni 3 secondi. Verificato da `scripts/smoke-world.ts` (25 controlli); `scripts/test-all.sh` lancia tutti i test su mondi puliti.

## Mondo aperto ribilanciato (misurato)

Tre correzioni, tutte in `shared/rules.ts`, verificate con `scripts/playtest.ts <porta> 1800 gen` (nodi generati) e `scripts/economy.ts` (sezione «gioco libero»).

**Guardia, non livelli.** Notte, blackout e allerta non tolgono né aggiungono più un livello di monitor: moltiplicano il tempo del trace (`WATCH_NIGHT` ×1.3, `WATCH_BLACKOUT` ×1.5, `WATCH_ALERT` ×0.75). Il fattore si vede sulla mappa e nella stima prima di collegarsi.

**Trace sui nodi generati.** Il bot gioca un'operazione completa su nodi di ogni tipo. Trace consumato a fine pulizia, rimbalzo ingenuo / curato:

| Equipaggiamento | Bersagli | Ingenuo | Curato |
|---|---|---|---|
| Esordiente | negozi, biblioteca, tv locale | 23–67% | 13–38% |
| Primi acquisti | camera di commercio, clinica | 37–68% | 22–38% |
| Metà carriera | acquedotto, telefonica, biotech | 51–74% | 31–46% |
| Avanzato | carcere, studio legale, cambiavalute | 42–48% | 28–32% |
| Fine gioco | banche | 60–77% | 43–54% |

In linea con i nodi storici: nessun ritocco ai tempi di trace.

**Soldi del gioco libero.** Devono valere la pena senza battere i contratti.

- Bonifici: tetto dell'antifrode `heistCap(grado)` = 1000 + 1000 × grado (3000–5000 CR sulle banche che esistono) (oltre al 25% del saldo); dopo un colpo il conto di chi incassa resta segnalato 10 minuti.
- Ricettazione: lo stesso file rivenduto entro 2 ore vale il 10%.
- Casse dei negozi: 100–400 CR, una ogni 30 minuti per negozio.

Resa modellata per ora (rossi): ricettazione 6–30 mila CR contro 29–67 mila dei contratti; colpi in banca 14–24 mila in più a rischio storno; casse al più ~13 mila conoscendo tutti i 44 negozi. Ai gradi 3–4 i file valgono poco rispetto ai contratti: lì il gioco libero rende con colpi e bottino, non con la ricettazione.

## Regia: il cinema da hacker (`client/src/cinema.tsx`)

Solo scena: non decide nulla, legge lo stato che arriva dal server e non blocca mai i comandi (`pointer-events: none`). Si spegne con l'interruttore «cine» accanto all'audio; parte spenta se il sistema chiede meno movimento.

- **Password**: caselle che girano a vuoto e si bloccano una alla volta sul carattere giusto (`op.cracked`), con lampo, nota che sale e contatore dei tentativi.
- **Strumenti al lavoro**: uno schermo per ogni task in corso. Firewall = muro di porte che cade; proxy = raffica di SYN falsificati; monitor = oscilloscopio che si appiattisce mentre la telecamera va in loop; decrypter = esadecimale che diventa testo; copia/upload = hexdump; cancellazione = shred a passate; log deleter = righe annerite; dizionario = parole depennate.
- **Schedario**: a ogni ricerca o scheda aperta le foto tessera scorrono a raffica («confronto schede»), poi la foto si sviluppa con il timbro MATCH e i campi si decifrano.
- **Inquadrature a tutto schermo**: avvio del deck, chiamata hop per hop, ACCESS GRANTED / DENIED, TRACE COMPLETO, ARRESTATO con lampeggianti, NO CARRIER, bonifico con la cifra che corre, timbri per i comandi di sistema (SYSTEM HALTED, BLACKOUT, MANDATO EMESSO…), nuovo rango.
- **Trace che stringe**: cornice rossa che pulsa oltre il 50%, più veloce oltre il 75%, e sopra il 90% la scritta «STACCA».
- **Dettagli**: crediti che scorrono fino al nuovo valore, uscita dei comandi battuta a macchina, War Dialer con il registro delle chiamate (ATDT … NO CARRIER / CARRIER).

## Rete, compagnia e mondo allargato (0.3.0)

**Operazioni a obiettivi** (`server/scenarios.ts`). 25 copioni rossi e 7 blu, ognuno un cliché: «Yippee-ki-yay» (blackout + furto), «Too many secrets», «Free Kevin», «Sessanta secondi» (a tempo), «1507 sistemi»… Il motore annota le *gesta* del giocatore (`Game.deed`: admin, t:copy, sys:blackout, ghostexit, alter…) e il contratto le conta da quando è stato accettato; un obiettivo può chiedere un nodo preciso, un tipo, o n volte «diverse» per nodo, tipo o regione. Tipi nuovi: Operazione, Raffica, Colpo di scena, Ispezione. Circa il 30% della bacheca. Aggiungere un copione = una voce in quel file.

**Oggetti.** 14 exploit nuovi; **gadget** (`GADGETS`): non si consumano, hanno un tempo di ricarica; chip con due effetti nuovi (esperienza, ricettatore); 8 leggendari nuovi in altrettanti nodi segreti; fino a 6 slot per i chip. Effetti a tempo in `agent.buffs`.

**Worm e botnet.** Strumento rosso: un worm per sistema, 4/8/12 vivi secondo la versione, 60 minuti di vita, resa `wormYield(grado, versione)` ogni 45 s (al massimo ~5.000 CR/ora con tutto al massimo). Il Patch Kit dei blu, in modalità rinforzo, li schiaccia (+180 CR l'uno).

**Mondo.** Un secondo giro del generatore con un seme suo (`EXTRA` in `server/worldgen.ts`) aggiunge ~200 nodi senza toccare quelli di prima: BBS, sale LAN, zaibatsu, arcologie, centrali nucleari, radio pirata, silos, più una settantina di insegne-tributo. 13 nodi segreti nuovi in `server/content.ts` (17 in tutto). In totale 527 nodi.

**Crescita.** 20 ranghi (fino a 640.000 XP), livello 1-99 (`levelOf`), sette **specializzazioni** (`shared/progress.ts`) che salgono con i contatori personali e danno fino al 10% nel loro campo.

**Fra giocatori** (`server/social.ts`). Crew (stessa cellula, max 12, cassa, classifica), duelli (stessa posta, bersaglio a sorte alla portata del più debole, 10 minuti, 5% al banco), scambio di oggetti con prezzo o in regalo, crediti (5% di commissione, 20.000 CR al giorno, da 200 XP).

**ReticoloNet** (`server/irc.ts`, testi in `server/irc-text.ts`). Canali pubblici, di cellula (`#rossi`, `#blu`), di crew, e due segreti; query; operatori; MOTD; CTCP; netsplit; bot (X, Oracolo con `!voce`, Lumen che rilancia il feed, XDCC-Kestrel con un pacchetto al giorno, e gli handle NPC che chiacchierano solo se c'è qualcuno). I comandi di gioco (`/paga`, `/dcc`, `/sfida`, `/crew`) chiamano gli stessi gesti di `social.ts`: la chat non ha poteri suoi. L'amministratore è IRC operator (`/wallops`, `/kill`, `/silence`) e può mettere la rete in sola lettura dalle regolazioni. Gli arretrati si salvano col mondo.

**Dev-log** (`shared/devlog.ts`): le novità in cima alla pagina d'ingresso e nella scheda Feed. Ogni modifica visibile ai giocatori aggiunge una voce.

## Minigiochi: la griglia del firewall (0.5.0)

Regola di casa: un minigioco **affianca** la barra, non la sostituisce. Chi non vuole giocarlo non perde niente; chi lo gioca bene guadagna tempo, pulizia o un livello di strumento. Il segreto resta sul server (`op.grid.hidden`): al client arrivano solo le caselle già sondate.

**Griglia** (`shared/grid.ts`, azione `grid {act: open|probe, cell}`). Lato 5/6/7, falle 2/3/4, sonde 7/9/11 per firewall L1/L2/L3. Una sonda a vuoto mostra la distanza di Manhattan dalla falla nascosta più vicina (si aggiorna quando ne trovi una). Tutte trovate → `bypass.firewall`, la barra in corso si chiude. Con ≥ 2 sonde avanzate niente riga `WARN firewall fault` nel log. **A mano**: se il Firewall Bypass è un livello sotto il firewall, la griglia si apre lo stesso con una sonda in meno; sonde finite → regole ricaricate (una sola griglia per connessione) e trace +12% del percorso.

Taratura (20.000 partite simulate di un giocatore che sonda solo caselle compatibili con gli indizi): vince nel 99,6% dei casi con lo strumento giusto e nel 97% a mano; breccia pulita 82-88% e 45-66%. Chi clicca a caso vince fra l'1% e il 12%. Un umano sta in mezzo: i numeri vanno riguardati con le partite vere (contatori `mg:grid`, `mg:gridclean`, `mg:gridmanual`, `mg:gridlost` nella panoramica dell'admin).

## Operazioni lunghe (0.27.0)

`server/longops.ts`, regole in `shared/longops.ts`. Al più 2 operazioni per giocatore; ogni 6 ore (sul battito del mondo) ciascuna dà un esito e rischia di saltare.
- *Talpa* (rossi, 1.500 CR, 5 giorni): un dipendente con fascicolo aperto e debiti oltre 3.000 CR. Esiti: password dell'operatore (30%), mezza password di root (25%), copia di un file in chiaro del datore di lavoro, con contenuto al 35% (25%), il suo badge da operatore per 24 ore (20%). Scoperta con probabilità 0,05 + paura/1000 (al più 0,15; con 0,1 + paura/500 la simulazione ne scopriva 6 su 8 in cinque giorni, e una talpa rendeva meno di quanto costa): licenziamento (`citizens.fire`), Cronaca, calore +15. Se nel frattempo cambia lavoro l'operazione si chiude.
- *Sotto copertura* (blu, 1.500 CR, 3 giorni, in una banda rossa di abitanti): a ogni giro un membro, un bersaglio (in allerta 4 ore, sulla mappa del blu), al 25% il nome alla Guardia (`Game.lifeHeat` +60); scoperto all'8%: favore −20 con tutta la banda, calore +10.

## Bottino con un contenuto (0.26.0)

`server/leaks.ts`, regole in `shared/leaks.ts`. Quando un file entra nell'archivio (`t:copy`, `z:dossier`) può ricevere un contenuto, che viaggia con il file (anche al mercato nero): *progetto* (laboratori, aziende, militari, valore ≥ 4, 50%) o *prova di scandalo* (uffici pubblici, polizia, banche, aziende, cliniche, valore ≥ 4, 35%; gli allegati compromettenti della posta interna sempre).
- Progetto al concorrente (il primo della lista dei concorrenti): 600 + 450 × grado CR; vittima −(800 + 300 × grado) di cassa e −5 di reputazione, concorrente +3; la vittima sospetta del concorrente (`orgs.blame`, alla quinta volta guerra commerciale).
- Scandalo a un giornale (la testata più vicina): 250 + 100 × grado CR, fama +8, etica +4; vittima reputazione −15, paura +10; se è polizia o ufficio pubblico, fiducia nella Guardia −6.
- Ricatto: 900 + 550 × grado CR pagati dalla vittima, etica −8; al 30% va alla polizia (calore +20, capo d'accusa).

## Territori (0.25.0)

`server/turf.ts`, regole in `shared/turf.ts`. Punti di presenza per città: dalle imprese dei giocatori (accesso admin 2, copia 1, bonifico e libro mastro 1, spegnimento, blackout e sabotaggio da malware 3, presidio e patch 2, bonifica antivirus e allerta 1) alla loro crew; da ogni evento di un abitante di una banda (`Game.orgEvent`: le bande rosse per i colpi, quella blu per le difese) 2 alla sua banda. Mezza vita 72 ore. Una città è di chi ha almeno 10 punti e almeno 1,25 volte la seconda; se la seconda ha almeno 5 punti ed è più vicina, è contesa. Cambi di mano e contese in Cronaca (al più una notizia ogni 6 ore per città).
Gli abitanti di una banda scelgono il bersaglio fra quelli possibili in una delle tre città più forti della banda con probabilità 0,6, così le città si tengono anche senza giocatori. Vantaggi: rossi della crew trace × 0,9 sui sistemi della città (`Game.turfTrace`); blu (solo crew di giocatori) indagini × 0,85 (`Game.lifeSweep`); pedaggio di 40 CR per relay attraversato in una città di un'altra crew di giocatori, alla cassa di quella crew (`Game.onConnect`). Le bande degli abitanti tengono città ma non incassano.

## Nemesi e favori (0.24.0)

`server/nemesis.ts`, regole in `shared/nemesis.ts`. Ogni indagine aperta su una sessione di un rosso che ha toccato qualcosa (`Game.registerIncident`) dà 1 traccia (2 se grave) a un abitante blu (quello che lo segue già, o uno a caso); a 5 diventa nemesi. Mosse ogni 3-6 ore, solo da sveglio: livello 1 allerta di 3 ore su tutti i nodi dell'organizzazione più colpita; 2 un'esca in bacheca (contratto personale che paga una volta e mezza più 600 CR: entrarci da admin vale calore +20 e l'indirizzo a tutti i blu); 3 una segnalazione (capo d'accusa, calore +10); dal livello 3 una mossa a caso. Fine: calore sotto 15 per 24 ore (si stufa), arresto (chiude il caso), depistaggio (1.200 CR, 60%: mossa rimandata di 12 ore, livello −1), corruzione (4.000 CR, 40%: caso chiuso, etica −5; altrimenti calore +20 e capo d'accusa).
Favori: abitanti svegli della tua parte con favore ≥ 20, 3% a battito, al più uno ogni 12 ore; contratto personale (`ownerId`) di 12 ore. Fatto: favore +12 e un numero nascosto (o 800 CR); mancato: favore −8.

## Effetto domino (0.23.0)

`server/domino.ts`, regole in `shared/domino.ts`. Ogni organizzazione ha per fornitore la più vicina di ogni tipo che le serve (nella sua regione, se c'è): banche telefonia e reti; aziende telefonia, banche e reti; negozi banche e aziende; laboratori reti e banche; cliniche reti e laboratori; testate e polizia telefonia; uffici pubblici telefonia e reti; università reti; telefonia reti. Si ricalcola ogni ora (i traslochi la cambiano). Un sabotaggio a un fornitore (o un'infezione su una rete o una compagnia telefonica, al 40%) mette in disservizio per 6 ore i clienti: cassa −(200 + 150 × grado), morale −5, reputazione −2, trace × 1,15 sui loro sistemi; un cliente che è a sua volta fornitore propaga al 50% (un anello in più). Una notizia in Cronaca, un contratto rosso sul cliente (paga +600 + 250 × grado, scade con il disservizio) e uno blu sul fornitore (presidio e patch).

### Misura del mondo da solo (26 novembre 2026)

`scripts/world-sim.ts`: tutto il server in memoria, nessun giocatore, orologio accelerato (un battito ogni 45 secondi simulati).

| Cosa | Prima delle correzioni | Dopo |
|---|---|---|
| Abitanti finiti in custodia | 0 in più giorni (il calore scendeva di 32 punti l'ora) | circa uno ogni giorno e mezzo (raffreddamento a 0,15 a battito) |
| Retate | quasi sempre in corso, a regime (contavano gli arresti degli handle di sfondo) | solo per arresti di giocatori e abitanti in custodia, con 48 ore di pausa |
| Sabotaggi degli abitanti | mai | uno ogni due giorni circa (5% per chi cerca vendetta o fama, 1,5% gli altri) |
| Fiducia nella Guardia | 56-64, nessuno scandalo | uguale: senza giocatori non si muove, ed è voluto |
| Aiuto da fuori | — | qualche ora ogni tanto, quando il rapporto dei punti guerra delle 24 ore scende sotto 0,6 |
| Informazioni, un giorno al massimo | stima 12.000 CR | misurato fra 6.900 e 8.500 CR (Mediatore 8 password, bancarella 5) |
| Territori delle bande, 7 giorni | nessuna città tenuta (colpi sparsi su 69 città) | 5 città tenute da 3 bande, 10 cambi di mano: le bande tornano di preferenza (60%) nelle loro tre città più forti (`Game.lifeTarget`) |
| Effetti domino, 7 giorni | — | 2, dai sabotaggi degli abitanti |
| Bottino con un contenuto, file di valore 6 | — | ricettatore circa 810 CR; usarlo rende 1.050-2.400 CR alla concorrenza (grado 1-4), 1.015-2.170 attesi con un ricatto, 350-650 più fama da un giornale |
| Talpe, 4 giocatori con 2 talpe ciascuno, 5 giorni | 6 scoperte su 8, file per 5.600 CR contro 16.000 spesi | rischio abbassato: 5 scoperte su 8, 11 file per 6.700 CR (4 con un contenuto), 131 lettere fra password, badge e avvisi; prezzo da 2.000 a 1.500 CR |
| Favori, stessi giocatori con 3 abitanti amici | — | 25 chiesti in 5 giorni (circa uno al giorno a testa), paga media 925 CR più il regalo |

## Imprevisti (0.22.0)

**Quando** (`server/surprises.ts`, regole in `shared/surprises.ts`). Ogni sessione viva di un giocatore, dopo 12 secondi dal collegamento, ogni 8 secondi ha il 6% di probabilità di un imprevisto, al più uno per sessione (circa una sessione su tre lunga un minuto, una su due lunga due minuti). Si sceglie fra quelli possibili in quel momento, con un peso:

| Imprevisto | Possibile se | Peso |
|---|---|---|
| L'amministratore è in linea | rossi, organizzazione con amministratore, in orario d'ufficio (ora del nodo) | 3 |
| Controllo a campione | rossi, organizzazione, notte nel fuso del nodo | 3 |
| Non sei solo | organizzazione; con un giocatore sullo stesso nodo, oppure un abitante rosso sveglio | 4 se c'è un giocatore, altrimenti 2 |
| Riavvio programmato | qualunque nodo che non sia gateway o relay | 1 |
| Linea disturbata | blackout nella regione, città al buio o rimbalzo di 6 nodi o più | 2 |
| Il file chiama casa | copia di un file da un'organizzazione con paura ≥ 20: 25% a copia, anche dopo un altro imprevisto | — |

**Scelte ed esiti.** 20 secondi per scegliere (12 per il segnalatore), poi decide il caso con la scelta indicata.
- *Amministratore*: bluff con probabilità 0,45 + 0,25 se conosci l'amministratore (è fra i tuoi contatti) + 0,15 da operatore + 0,15 se è in ferie (risponde il sostituto) − calore/200, fra 0,1 e 0,9; riuscito, trace fermo 15 secondi; fallito, trace +25% del totale, allerta 30 minuti, riga nel log. Restare zitti: metà delle volte se ne va, metà chiude la sessione (allerta, calore +8).
- *Riavvio*: dopo 30 secondi la linea cade. «Finisci in fretta»: strumenti × 1,4 fino ad allora. «Rimanda» (solo admin): riga «shutdown -c» nel log, 30% di allerta.
- *Altro intruso*: «Seguilo» insegna il gateway di un giocatore, o il prossimo bersaglio di un abitante (30% che se ne accorga: favore −5); «Chiudigli la porta» (admin) butta fuori il giocatore (calore +5), o costa all'abitante favore e calore; ignorarlo vale trace × 1,2 per un minuto. I blu possono tracciarlo: indirizzo in rubrica e contro-trace × 1,5 per 20 secondi, o calore +40 all'abitante (`Game.lifeHeat`).
- *Controllo a campione*: fermarsi ferma strumenti e trace 12 secondi; continuare ha il 40% di trace × 1,5 per 20 secondi; con un Log Deleter v2 il trace va × 0,9 per 30 secondi.
- *Linea disturbata*: rallentare dimezza copie e caricamenti per 40 secondi; tenere duro fa cadere la linea una volta su tre.
- *Segnalatore*: staccare lo ferma al 70%; rimbalzarlo serve le chiavi di un relay del rimbalzo; lasciarlo correre vale calore +15 e il gateway nella rubrica di tutti i blu.

Effetti sugli strumenti e sul trace con due hook (`Game.twistTrace`, `Game.twistSpeed`). Nei test veloci (`AETHER_FAST`) gli imprevisti spontanei sono spenti, perché un amministratore a caso renderebbe instabili gli altri test; il test `smoke-surprises` li accende.

## Cicatrici e mercato nero (0.21.0)

**0-day che invecchiano** (`server/blackmarket.ts`, regole in `shared/blackmarket.ts`). Otto exploit tecnici (0-day Proxy, Firewall e Monitor, Loop di telecamera, Scrubber, Chiave scheletro, Rompighiaccio, Scatola nera) hanno una notorietà: +1 a ogni uso riuscito e a ogni tentativo fallito, mezza vita 72 ore. Freschezza = 1 / (1 + usi/6). Prima dell'uso, su un sistema di grado *g*, la falla è già chiusa con probabilità (1 − freschezza) × (0,4 + 0,15 *g*), al più 85%: l'exploit si consuma senza effetto e lascia nel log una riga «exploit attempt blocked» con l'origine (`Game.exploitTry`). Il ricettatore paga un exploit × (0,4 + 0,6 × freschezza). Gli abitanti ne usano uno a caso con probabilità 0,3% a battito (circa uno al giorno ciascuno, a regime freschezza intorno a 0,65).

**Retate.** Punti arresto in 24 ore: 2 per un handle (`Game.arrest`), 1 per un abitante (`Game.lifeBust`); a 4 scatta una retata, e scatta comunque con lo stato d'emergenza (`Game.onEmergency`). Dura 72 ore con un peso *k* che scende da 1 a 0: moduli base del Laboratorio × (1 + 2*k*), exploit, chip e gadget dal ricettatore × (1 + 0,6*k*), attività degli abitanti rossi × (1 − 0,4*k*), e gli 0-day degli abitanti calano allo stesso modo. Notizia in Cronaca e lettera ai rossi; una sola retata alla volta.

**Cicatrici** (`server/scars.ts`, regole in `shared/scars.ts`). Ogni sabotaggio (`Game.orgEvent`) segna il nodo per 72 ore (quattro bruciature sulla mappa, che sbiadiscono) e lo mette in allerta per 24 ore. Un sabotaggio a un nodo `util` lascia al buio la sua città per 6 ore: alone scuro sulla mappa e trace × 1,3 su tutti i sistemi della città (`Game.orgWatch`).

**Traslochi.** Per aziende, banche, laboratori, telefoni, giornali, cliniche e negozi generati: colpi in 7 giorni, sabotaggio 3 e furto 1; a 9 l'organizzazione cambia città (una qualunque di `WORLD_CITIES`), indirizzo IP e password (`Game.react`), al più una volta ogni 14 giorni. La traccia dalla vecchia sede resta sulla mappa 72 ore. Il caricamento del mondo riprende posizione e città dal contenuto, quindi il modulo riapplica i traslochi all'avvio (verificato con un riavvio). I contratti già in bacheca restano sullo stesso nodo; le password in vendita come informazione bruciano.

## Leggi e contrappesi (0.20.0)

**Fiducia nella Guardia** (`server/law.ts`, regole in `shared/law.ts`). Un numero da 0 a 100, 60 all'inizio, che torna verso 60 di 1,5 punti l'ora. Si muove con fatti veri; i sistemi governativi (`gov`) contano la metà di quelli della Guardia (`law`):

| Fatto | Fiducia |
|---|---|
| furto in un sistema della Guardia (gesta «furto» di giocatori e abitanti, `Game.orgEvent`) | −4 |
| sabotaggio | −8 |
| infezione | −2 |
| intrusione | −1 |
| difesa (patch, ronde, presidi) | +1 |
| handle arrestato (`Game.arrest`) | +3 |
| abitante finito in custodia | +1 |
| fascicolo di polizia venduto al ricettatore (`Game.fenceSold`, che ora riceve anche chi vende) | −3 |
| soffiata alla Guardia | +2 |
| azienda avvisata delle sue password | +1 |

Effetti su `Game.num`: da 80 in su indagini più rapide del 10% (`sweepMult` × 0,9); fino a 35 più lente del 15%; sotto 25 scoppia lo **scandalo**: 12 ore con indagini × 1,5, custodia × 0,7, cauzione × 0,7, stato d'emergenza chiuso e bloccato, fiducia ferma; finito lo scandalo riparte da 45. Chi ha fatto scendere la fiducia nelle 24 ore prima riceve una lettera e il traguardo. Tutti gli eventi delle organizzazioni, anche quelli dei giocatori, ora passano da `Game.orgEvent` perché altri moduli possano ascoltarli.

**Aiuto da fuori.** Ogni ora il modulo fotografa i punti guerra (`meta.war`); confronta gli ultimi con quelli di 24 ore prima. Se una parte ne ha fatti almeno 40 e l'altra meno del 60% di quelli, la seconda riceve aiuto per 6 ore, rinnovato a ogni controllo finché la condizione resta: contratti generati pagati il 20% in più (`Game.priced`), abitanti della parte 1,6 volte più attivi (`Game.lifeRally`); in più ai blu indagini più rapide (`sweepMult` × 0,85), ai rossi 0,25 punti di calore in meno a battito (circa 20 l'ora, oltre ai 120 normali). Notizia in Cronaca e lettera ai giocatori della parte. Con pochi giocatori conta soprattutto per gli abitanti: quando i rossi dominano, la Guardia indaga più in fretta anche se nessun blu è collegato.

Le due bilance si parlano: lo scandalo arriva più facilmente quando i rossi colpiscono la Guardia, e l'aiuto ai blu arriva quando i rossi dominano; entrambe tornano al normale da sole.

## Informazioni come merce (0.19.0)

**Che cosa si vende** (`server/intel.ts`, regole in `shared/intel.ts`). Cinque tipi, tutti verificati dal server, che conosce il contenuto vero: nessuna truffa possibile, ma informazioni che scadono.

| Tipo | Da dove viene | Quando brucia | Valore base |
|---|---|---|---|
| Password di root | un accesso admin (`Game.deed` «admin», escluso un gateway): il modulo salva la password com'era | quando l'azienda la cambia (`Game.react`, dopo un'intrusione con danni, o una segnalazione) | 200 + 300 × grado |
| Indirizzo di un gateway | la rubrica (`known` con un handle) | quando l'handle cambia indirizzo | 300 + 2 × fama (max 1.500) + 300 × mandato |
| Numero nascosto | `discovered` (War Dialer) | mai; vale meno per ogni giocatore che lo conosce | 250 + 200 × grado |
| Mappa di rete interna | la mappatura dal nodo davanti («z:pivot») | dopo 24 ore | 500 + 300 × grado |
| Fascicolo | un'indagine sulla persona | mai | 150, più 250 per debiti oltre 3.000, 200 per una relazione, 150 per un licenziamento, 200 se amministra un sistema |

Ogni copia venduta (al Mediatore, in bancarella, a un abitante) moltiplica il valore per 0,8.

**Canali.**
- *Mediatore*: paga il 60% del valore, subito; solo informazioni scoperte da sé (non comprate), una volta a settimana per ciascuna, al più 8 al giorno. Al 10% è sorvegliato: calore +12.
- *Bancarella*: prezzo libero fra 50 e 20.000 CR, 24 ore, al più 6 annunci, commissione 10%. Più compratori per annuncio, uno per handle. L'acquisto è verificato al momento: un annuncio bruciato sparisce. Chi compra una password o un numero la può rivendere (non al Mediatore); una mappa comprata dà 6 ore di accesso diretto alla macchina interna (`Game.canReach`) e non si rivende.
- *Segnalazione all'azienda*: solo password di organizzazioni generate (quelle che cambiano password). Paga il 50% del valore base (65% ai blu), etica +4, una volta al giorno per azienda; la password cambia per tutti e gli annunci bruciano. In Cronaca.
- *Soffiata alla Guardia*: indirizzo di un giocatore con mandato o calore ≥ 30, una volta al giorno per bersaglio. Paga 200 + 400 × mandato + 4 × calore; etica −8 ai rossi. Tutti i blu imparano l'indirizzo; il bersaglio riceve un avvertimento, con il nome del venditore al 20%. In Cronaca.

**Abitanti.** Ogni 3 ore riempiono la bancarella fino a 4 annunci veri (password di organizzazioni di grado 1-3, mappe, numeri nascosti, fascicoli succosi) a 1,15-1,5 volte il valore. Comprano dai giocatori password, numeri e fascicoli se il prezzo non supera 1,3 volte il valore corrente: 4% a battito per annuncio, al più 3 abitanti per annuncio e 5 acquisti al giorno per venditore. Chi compra una password la usa subito (`Game.lifeBuy`): righe vere nei log, intrusione per l'organizzazione, notizia in Cronaca, lettera al venditore.

**Reddito.** Al più 8 vendite al Mediatore (password di grado 3: ~660 CR l'una) e 5 agli abitanti (~1.290 nette) al giorno: circa 12.000 CR al giorno nel caso migliore, meno di mezz'ora di contratti. Il valore vero è altrove: vendere ad altri giocatori e usare quello che si compra. Rivendere roba comprata dagli abitanti è sempre in perdita (si compra a 1,15 volte il valore, si rivende al più a 1,3 × 0,8 meno la commissione).

## Il BBS del giocatore (0.18.0)

**Dove.** Nello stesso motore dei BBS di serie (`server/bbs.ts`): la scheda del giocatore (`state.owned`, id `u-<agente>`) diventa una definizione come le altre al momento della lettura, quindi chiamata a tempo, livelli, bacheche, porte e area file non hanno codice a parte. Uno per giocatore, 4.000 CR.

**Testi liberi letti da altri.** Nome 28 caratteri, sottotitolo 80, regole 300, insegna 10 righe × 64 colonne; caratteri di controllo tolti. Nome unico fra tutti i BBS. Moderazione: `admin.bbsList`, `admin.bbsReset` (azzera i testi), `admin.bbsClose` (chiude con lettera al sysop); finiscono nel registro. I messaggi singoli li rimuove lo staff dalla bacheca, come sui BBS di serie.

**Area file.** Niente pacchetti del giorno (sarebbe una fonte di exploit per ogni BBS aperto): solo il materiale caricato dagli utenti (ultimi 12). Chi carica perde il file e prende credito in KB come altrove; il sysop riceve una copia a metà valore (dagli abitanti al più tre al giorno); chi scarica prende un'altra copia a metà valore, una per file. Le copie hanno un identificativo proprio, quindi il ricettatore le paga una volta per giocatore, alla metà.

**Fama e abitanti.** +1 per visitatore diverso al giorno (giocatori e abitanti). Un abitante che chiama un BBS ha il 35% di provarne uno dei giocatori della sua parte, scelto in proporzione a fama + 3; lì carica un file (20%) o scrive al sysop (12%, al più due lettere al giorno, con un indirizzo nuovo o mezza password vera).

**Rischi.** Calore: +4 per file caricato da un giocatore, +3 da un abitante, +35 per segnalazione di un blu (una al giorno per blu), −0,05 a battito. A 100: sigilli per 6 ore, sessioni chiuse, fama ×0,7, calore a 30. Sfregio: chi è admin sul gateway del sysop può riscrivere l'insegna per 12 ore (fama −10); il sysop la ripristina gratis.

Scelte rispetto alla proposta: niente lettura della posta privata fra giocatori; le «lettere al sysop» arrivano solo dagli abitanti.

## Commissioni, ricettatore, aperture (0.17.0)

**Commissioni** (`shared/jobs.ts`, `Game.postJob`). Un contratto scritto da un giocatore: obiettivo (un'impresa registrata in `Game.deed` su quel nodo) e condizioni. «Di notte» e «in orario d'ufficio» sono un campo `when` dell'obiettivo, controllato sull'ora del nodo nel momento dell'impresa (`Game.whenOk`); «senza tracce» aggiunge l'obiettivo `ghostexit`; «fretta» mette un limite di 30 minuti; «esperti» un minimo di 1.500 XP. Paga minima 800 CR × (1 + 0,35 a condizione); ricompensa e 5% di commissione in deposito come per le taglie.

**Ricettatore** (`server/fence.ts`, `shared/fence.ts`). Ogni categoria di merce (tipo di nodo d'origine, o exploit, chip, gadget) ha un'offerta che decade con mezza vita di 6 ore verso un livello «normale» del giorno (da 0 a 6, la metà delle volte 3); moltiplicatore 1,25 − 0,08 × offerta, fra 0,45 e 1,25; la richiesta del giorno vale ×1,5. Ogni vendita aggiunge 1, ogni furto di un abitante 0,5. Prima di questa versione l'offerta tendeva a zero e a mercato fermo ogni merce valeva il 25% in più: ora a riposo la maggior parte vale ×1.

**Aperture** (`server/startups.ts`, testi in `server/startups-text.ts`). Al più una ogni 3 ore, al più 16 vive; a ogni battito la probabilità è 0,4% + 0,4% per disoccupato (fino a 6). Il fondatore è un disoccupato (amministratore del nodo nuovo), con fino a due licenziati; difese proxy 0-1, firewall 1, monitor 1, password da dizionario, cassa 2.500 CR. I nodi nuovi sono documenti come gli altri e sopravvivono ai riavvii. Quando un'organizzazione viene comprata (`Game.orgAcquired`), metà del personale non amministratore viene licenziata.

### Misura del reddito (25 novembre 2026)

`scripts/economy.ts` (contratti) e `scripts/sandbox-economy.ts` (fonti nuove), motore in memoria:

| Fonte | Resa |
|---|---|
| Contratti giocati attivamente, rossi | 33.000-76.000 CR/ora (modello ideale: un contratto dopo l'altro, senza errori) |
| Ricettazione nel gioco libero | 10.000-30.000 CR/ora |
| Copertura al livello massimo, due dipendenti | 1.680 CR/ora d'apertura, circa 16.800 al giorno |
| Botnet: worm v3 al completo su nodi di grado 2 | 11.520 CR/ora |
| Creature del Laboratorio | al più 5.120 CR/ora, e nello stesso tetto dei worm: insieme non superano 11.520 |
| Borsa da insider, 100 titoli allo scoperto | 1 sabotaggio: ~830 CR attesi · 2: ~2.040 · 3: ~3.450 (vigilanza al 35%) |

Conclusione: le fonti passive messe insieme (botnet al tetto più copertura) valgono circa 13.000 CR l'ora, un quinto o un terzo dei contratti giocati; la Borsa da insider rende meno di un contratto per lo stesso tempo. Correzioni fatte in base a questa misura: tetto unico per worm e creature, vigilanza di Borsa al 35% con sequestro e calore, scoperto da 200 a 100 titoli, mercato del ricettatore che torna verso il normale invece che verso la scarsità. Non misurato: il ricettatore con la richiesta del giorno sfruttata a ripetizione (ogni vendita abbassa il moltiplicatore dell'8%, quindi si esaurisce in poche vendite).

## Sandbox (0.12.0 - 0.16.0)

Principio: **niente evento a copione**. Ogni modulo tiene uno stato, lo fa cambiare da quello che succede davvero (le gesta dei giocatori via `Game.deed`, quelle degli abitanti via `Game.orgEvent`) e reagisce a soglie. Il racconto (Cronaca, feed, chat, BBS) legge quello stato, non lo inventa.

**Organizzazioni** (`server/orgs.ts`, documento `world/state`). Cassa, reputazione, morale, paura; due concorrenti (i più vicini dello stesso tipo). Ogni battito ne passa un quinto: incasso in orario d'apertura, costi fissi, decadimento della paura. Reazioni: difese comprate a paura ≥ 60 se la cassa regge (al massimo due scatti sopra quelle di serie, e mai oltre 9 in tutto) e lasciate scadere dopo 48 ore di calma; turno di notte tagliato in rosso; sciopero col morale sotto 20; crisi sotto −75% della cassa iniziale e, dopo 12 ore, acquisizione (nessun nodo sparisce). Sospetti a ogni furto (40%), accusa pubblica a 3, guerra commerciale di sei ore a 5, con un contratto rosso e uno blu ogni 40 minuti. Stato d'emergenza a 45 intrusioni in 24 ore (indagini ×0,7, custodia ×1,3 per 12 ore, applicati avvolgendo `Game.num`); allerta virus di tre ore con 8 sistemi infetti in una regione.

**Attenzione al bilanciamento:** le difese dei nodi ora cambiano da sole. I contratti già in bacheca su un nodo che si rafforza diventano più difficili senza che la paga cambi.

**Persone** (`server/citizens.ts`). Dove si trova una persona è calcolato dall'orologio, non salvato. Stato salvato: debiti, lealtà, licenziamento, avvisi. Si conoscono leggendo un organico (o usandone le credenziali). Azioni: indagine 300 CR; badge da chi ha più di 3.000 CR di debiti (800 + 20% del debito, 24 ore da operatore; chi è leale o avvisato rifiuta e alza il calore); fonte fra i licenziati (500 CR: utenza operatore e mezza password di root per posta); ricatto a chi ha una relazione (500-1.400 CR, 20% di denuncia); per i blu la messa in guardia (48 ore di immunità, badge annullati).

**Abitanti** (`server/life.ts`). Ambizione con avanzamento per impresa; favore per giocatore da −100 a 100 (regalo +8, risposta a una sua discussione +4, crew ×1,5, −3% al giorno). Sopra 30 soffiate vere ogni tre ore al massimo; sopra 45 prestito, sopra 60 alibi. Sotto −40 fanno il tuo nome. Quattro crew fisse con punteggio che decade del 30% al giorno.

**Borsa** (`server/stocks.ts`). Valore equo = funzione dello stato dell'organizzazione; il prezzo lo insegue del 12% a battito con ±1% di rumore, solo a mercato aperto. Scoperto con margine del 50%. Il contatore `stock:insider` scatta quando si guadagna su un titolo toccato nelle due ore prima: è voluto, non un abuso.

**Copertura** (`server/fronts.ts`). 5/9/14 CR a battito in orario d'apertura, tetto di cassa 1.500/3.500/7.000: un giorno di assenza rende al massimo un tetto.

Il reddito combinato di copertura, Borsa da insider e creature è misurato nella 0.17 (sezione «Misura del reddito»). Resta da guardare nelle partite vere la frequenza di difese comprate e di guerre commerciali con pochi giocatori: con due soli giocatori e trenta abitanti quasi tutta la pressione viene dagli abitanti.

Quanto restava della proposta (contratti dei giocatori con condizioni, prezzi del ricettatore legati all'offerta, organizzazioni che aprono da zero, BBS del giocatore) è arrivato con la 0.17 e la 0.18.

## Il mondo vive: orologio e popolazione (0.11.0)

**Orologio** (`shared/clock.ts`). Nessun tempo di gioco accelerato: ora vera, fuso dalla longitudine del nodo. Fasce: notte 22-6, alba 6-8, mattina 8-12:30, pranzo 12:30-14, pomeriggio 14-18, sera 18-22. Orari: «ufficio» (aziende, banche, enti, scuole, laboratori: lun-ven 8-18), «negozio» (lun-sab 9-20), «sempre» (polizia, ospedali, militari, giornali, telefoni, reti). L'ombra sulla mappa è la stessa funzione, con un'ora e mezza di crepuscolo.

**Cosa cambia** (`server/life.ts`, agganci `life*` nel motore):
- login con credenziali di un dipendente in orario d'ufficio: non avvia il monitor (prima lo avviava sempre);
- centralino/voce: solo a ufficio aperto e non in pausa pranzo;
- sorveglianza: ×1,15 in pausa pranzo, ×1,2 nel fine settimana di giorno (la notte ×1,3 c'era già);
- indagini: ×1,5 più lente se l'ufficio è chiuso;
- casse dei negozi: ×1,5 la sera, ×0,6 al mattino;
- War Dialer: +1 nodo se la regione è al buio.

**Popolazione.** Trenta personaggi (`server/life-text.ts`) con fuso, ore di veglia, schieramento e BBS frequentati; stato salvato in `life/state` (calore, crediti, custodia, ultima impresa). A ogni battito chi è sveglio ha l'1,2% di agire (il doppio se è al verde) e il 2% di chiamare un BBS. I rossi colpiscono nodi di grado basso dove è notte: scrivono righe vere nei log, alzano l'attività del nodo, a volte mettono in giro un ceppo; il calore sale e a 100 finiscono in custodia per 2-6 ore. I blu tolgono ceppi selvatici o mettono un nodo in allerta per dieci minuti. A mezzanotte UTC la bolletta.

**Racconto.** Ogni impresa finisce in una coda che la chat pesca per prima; i BBS ricevono chiamate, frasi sul muro, risposte e discussioni con i segnaposto riempiti dal mondo ({org}, {city}, {ora}, {virus}, {chi}); le notizie d'agenzia seguono l'ora del posto di cui parlano.

**Nei test** il mondo è fermo «di giorno» (`clockForce`), così nessun test dipende dall'ora in cui gira.

Non misurato: quanto il login silenzioso di giorno accorcia i contratti, e quanto disturbano i giocatori le allerte e i ceppi messi in giro dagli abitanti. Tutta la popolazione si spegne con l'impostazione «Handle NPC attivi».

## Warez, malware e antivirus (0.10.0)

Tre sistemi che si tengono (`server/malware.ts`, regole in `shared/malware.ts`, azione `mw {cmd,…}`).

**Warez.** Quattro pacchetti al giorno per BBS, derivati dal giorno; 40 KB di credito, una volta al giorno ciascuno, da «validato». Probabilità d'infezione fra 10% e 45% per pacchetto, suggerita (non dichiarata) dal commento. Si installano dal Laboratorio; l'effetto usa i bonus che esistevano già (CPU, modem) più due nuovi (credito KB, esperienza).

**Infezioni del deck.** Quattro: lento (strumenti ×0,7), dialer (6 CR a battito, al massimo 500), spione (trace ×1,2, mai visibile senza scansione), bomba (cancella un file dopo 90 minuti). Furtività 2-5. L'antivirus vede fino a 3/5/7 con le firme di oggi, un punto in meno per ogni giorno di ritardo. Quello che non vede lo toglie un tecnico a 400 CR, o il dischetto di avvio.

**Creature.** Quattro moduli; i base si comprano, i rari vengono dal bottino (40% dei bottini dei rossi) o smontando un exploit. Furtività = 1 + somma, vita = 2 h + somma, replica in % a battito (45 s). Al massimo 15 infezioni vive per autore e 3 generazioni. Ogni nodo ha un antivirus residente che vede 1/2/3/4/6 per grado (+2 se rinforzato, +1 in allerta): sotto quella soglia la creatura attecchisce ma a ogni battito ha il 25% di essere trovata. Rese: il ladro rende quanto un worm v1 per unità di resa; il cifratore paga una volta sola (600 + 500 × grado) e brucia l'infezione.

**Firme.** Quarantena → campione → analisi (serve il livello 2) → firma pubblica per quell'identificativo di creatura. Con la firma: le copie nei nodi spariscono al battito dopo, l'impianto viene bloccato (trace +10%), i trojan escono dalle aree file. Reimpacchettare (300 CR × generazione) cambia identificativo. Il polimorfico è immune dalla prima replica in poi.

**PvP.** Un trojan caricato su un BBS infetta chi lo installa senza vederlo: il danno è limitato per costruzione (500 CR al massimo per dialer, un file per bomba) e sempre curabile.

**Ceppi selvatici.** Con `npcActive`, a ogni battito c'è il 20% che un handle NPC impianti uno dei sei ceppi di serie in un nodo di grado basso (al massimo 10 vivi): materia per le missioni dei blu.

Resa: sulla carta 15 infezioni con un ladro di resa 2 su nodi di grado 2 darebbero circa 16.800 CR l'ora. Dalla 0.12 le creature hanno un tetto di 64 CR a battito (circa 5.000 l'ora), e dalla 0.17 lo dividono con i worm dello stesso autore: insieme non superano una botnet di worm v3 al completo (11.520 l'ora).

## BBS (0.9.0)

**Perché accanto all'IRC.** L'IRC è presenza; il BBS è permanenza. Niente messaggi spinti dal server: tutto passa dall'azione `bbs {cmd,…}` e torna come dato, quindi il client è una macchina a schermate. Stato in un solo documento (`docs` → `bbs/state`), salvato con il resto.

**Chiamata e tempo.** Un BBS alla volta, mai col modem occupato da una connessione. Minuti al giorno per livello (20/35/50/75); la sessione vive in memoria e il tempo si scala al riattacco. Cambiare vista riattacca.

**Livelli** (per BBS, calcolati dai contatori dell'utente): validato = 2 giorni di chiamata e 1 messaggio; fidato = 5 giorni, 5 messaggi, 2 file; élite = 12, 15, 8. Lo staff è co-sysop e può rimuovere messaggi.

**Bacheche.** Le discussioni di partenza stanno in `server/bbs-text.ts` e nascono datate nei giorni scorsi; a una discussione nuova un habitué risponde dopo qualche minuto (risposta pescata da una lista). Tetti: 60 discussioni per area (cade la più vecchia non in evidenza), 80 messaggi per discussione, 1200 caratteri, un messaggio ogni 20 secondi.

**Area file.** Caricare un file dell'archivio (non oggetti, non carichi) lo toglie dall'archivio e dà 20 + valore × 12 KB di credito: è la rinuncia al ricettatore in cambio di exploit. Tre pacchetti al giorno per BBS, scelti dal giorno; 80 o 160 KB; uno al giorno per BBS.

**Porte.** Mercante di Chip: prezzi derivati da agente, giorno, mossa e città (niente stato da salvare a parte la classifica), premio vero = (contanti − 1000) / 25, al massimo 300 CR al giorno. Tris: il sistema gioca con minimax, quindi pareggia o vince. Guerra Termonucleare Globale: copione fisso.

Non misurato: quanto credito in KB produce un giocatore medio, e quindi se un exploit al giorno per BBS è troppo o poco; il premio del Mercante (al massimo 300 CR al giorno) è scelto a occhio.

## Barriere biometriche (0.8.0)

**Dove** (`server/bio.ts`, niente da migrare: si calcola dal nodo). Hanno una barriera i nodi di organizzazione con proxy+firewall+monitor ≥ 9 (29, quasi tutte banche e basi militari) e metà delle 66 macchine di rete interna; il tipo (voce, impronta, retina) viene dall'id. Il titolare è l'amministratore dell'organizzazione (per una rete interna, quello della casa madre).

**Cosa blocca.** Solo l'accesso admin: login con la password di root, Password Breaker e chiave universale rispondono che serve il campione. Le credenziali cliente dei blu e i livelli impiegato/operatore non sono toccati: è da lì che si va a prendere il campione.

**Campioni** (`agent.samples`, 7 giorni). Azioni di sottosistema: `centralino/voce` (impiegato), `personale/impronta` (operatore), `cartelle/retina` in qualunque nodo `med` (operatore; dà la retina dei titolari degli scanner che hai incontrato, `agent.bioWanted`). Oppure un gadget davanti alla barriera.

**Oscilloscopio** (`scope {act: open|try, params}`). Il bersaglio sono quattro interi (frequenza 1-6, ampiezza 1-5, fase 0-7, armonica 0-4); al client arrivano i 96 punti della traccia, non i parametri. Passa con somiglianza ≥ 0,985: l'unico errore tollerato è uno scatto di armonica, che a occhio si vede appena. Tre letture; ogni respinta trace +8%, alla terza lettore bloccato per la connessione. Chi fa un fit dei punti lo passa sempre: come per i toni, è un gioco d'occhio e non un segreto.

**Dopo.** `personale/modelli` (admin, rossi): 24 ore di barriera aperta su quel nodo. `personale/riregistra` (admin o cliente, blu): azzera modelli e invalida i campioni presi prima (`node.bioReset`).

Non misurato: quanto la barriera rallenta i contratti sui 29 nodi più ricchi. I contratti lì pagano il 25% in più a compenso, cifra scelta a occhio; da riguardare con i contatori `bio`, `biosample`, `mg:scope`, `mg:scopelost`.

## Minigiochi: i toni della Blue Box (0.7.0)

**Toni** (`shared/tones.ts`, azione `tone {act: open|dial, keys}`, stato in `Game.tones`, non salvato). Un «Simon» su tastierino a 12 tasti con le coppie DTMF vere, agganciato all'attesa del War Dialer: tre giri da 4, 5 e 6 toni (la sequenza si allunga, non cambia). Finché la partita è aperta la fine della scansione aspetta, al massimo 90 s. Vittoria: scansione chiusa subito, +2 nodi, probabilità del nodo segreto piena invece che al 35%. Errore: 300 CR di interurbana, la scansione prosegue; una linea per scansione.

Qui la sequenza **deve** arrivare al client, che la suona: è un gioco di memoria, non di deduzione, e chi legge lo stato lo vince sempre. La posta è volutamente bassa (nodi di mappa, non crediti) proprio per questo. Niente simulazione: la difficoltà è la memoria di chi gioca; da riguardare con `mg:tone` e `mg:tonelost`.

## Minigiochi: i rotori del Decrypter (0.6.0)

**Rotori** (`shared/rotors.ts`, azione `rotor {act: open|try, fileId, guess}`). Un Mastermind a 6 simboli con ripetizioni: 3/4/5 rotori e 6/6/7 prove per cifratura L1/L2/L3. Riscontro: allineati e giusti-fuori-posto. Chiave trovata → file decifrato per questa connessione, la barra in corso si chiude; con ≥ 2 prove avanzate il trace si ferma 10 s. **A mano** un livello sopra il Decrypter, con una prova in meno; prove finite → chiave ruotata (su quel file a mano non si riprova nella stessa connessione) e, solo a mano, trace +12%. Una chiave sul banco alla volta.

Taratura (simulazione: «attento» prova solo chiavi compatibili con i riscontri, «distratto» una volta su tre ne prova una a caso): con lo strumento giusto vince 99% / 82-90%; a mano 85-96% / 58-75%. Chi prova a caso resta sotto il 3%. Contatori `mg:rotor`, `mg:rotorclean`, `mg:rotormanual`, `mg:rotorlost`.

## Sottosistemi, livelli di accesso, posta interna (0.4.0)

Scelta di fondo: **niente riga di comando**. La libertà dentro un nodo si dà con stanze cliccabili e poche azioni ciascuna, non con una shell.

**Livelli** (`op.clearance`, 0-3). Accanto all'accesso admin (3, come le credenziali cliente) ci sono *impiegato* (1) e *operatore* (2), che aprono le stanze ma non i file. Si ottengono dal solito login: la password personale di un dipendente è nome + anno di nascita (come sui PC di casa; il nome dell'amministratore è nella descrizione del nodo, l'anno in anagrafe), quella dell'operatore è diversa per ogni nodo e sta nella posta interna.

**Stanze** (`shared/zones.ts`, logica in `server/zones.ts`): posta interna (1), centralino (1), telecamere (2), contabilità (2), ufficio del personale (2), rete interna (3). Ogni azione lascia una riga nel log e, dove il monitor parte «alla prima mossa», lo fa partire. Tempi di ricarica per nodo e per giocatore: fattura 45 min, libro mastro 2 ore, rubrica 20 min, allegato una volta a settimana.

**Posta** generata da un seme (nodo + settimana): la circolare con la password dell'operatore, a volte metà della password di root, indirizzi di altri nodi e di PC di casa da annotare, un allegato compromettente (file di valore 5-9), raramente la traccia di un nodo segreto, e chiacchiere d'ufficio.

**Reti interne**: terzo giro del generatore, 66 nodi `inner` dietro corp, banche, laboratori e siti militari con difese ≥ 6. `Game.canReach` li rende raggiungibili solo per 15 minuti dopo «mappa la rete interna» sul nodo davanti. File di valore 9-12.

**Blu**: nastri (ricostruisce fino a due righe rimosse, anche pulite, entro 30 min), revoca dei badge (+150 CR l'uno), circolare d'allerta.

## Bilanciamento iniziale (in `shared/rules.ts`)

- Monitor 1/2/3/4/5: 13 / 9,5 / 7,2 / 5,4 / 4 secondi per hop. Collegarsi diretti dà al monitor un solo hop.
- Il contratto di prova (monitor 1, firewall 1) con 3 relay lascia circa il 40% di margine a uno script; con 2 è teso; diretto è impossibile.
- Strumenti: Firewall/Proxy L1 5 s, Password Breaker 1,2 s per carattere (più con la sicurezza), Log Deleter 0,6 s per riga, tutto diviso per la potenza della CPU e per il numero di task attivi.

## Prossimi passi proposti

Aggiornato al 26 novembre 2026 (0.27.0).

1. **Grafica PixelLab**: sfondi di città per la schermata d'accesso, ritratti degli handle NPC, icone dei software in 32×32 a palette VGA, splash per le schede dei nodi.
2. ~~Audio~~ (fatto, sintetizzato nel browser). La musica e gli effetti di PixelLab richiedono un abbonamento Tier 2: con quello si potrebbero aggiungere brani registrati da alternare a quelli generativi.
3. ~~Gateway attaccabili~~ (fatto). Possibili estensioni: rubare strumenti, IP rotabili a pagamento. I trojan che si attivano più tardi ci sono (innesco «a orologeria» del Laboratorio, 0.10).
4. ~~Mercato fra giocatori~~ (fatto: mercato nero, ricettatore con offerta e richiesta, taglie, commissioni, informazioni). ~~Exploit con usura~~ (fatto: 0-day che invecchiano, 0.21).
5. **Stagioni ed eventi a copione**: messi da parte su richiesta (17 novembre). Al loro posto ci sono eventi che nascono da soglie: guerre commerciali, stato d'emergenza, scandali, retate, aiuto da fuori, allerte virali (0.12-0.21).
6. ~~Mini-giochi opzionali~~ (fatti: griglia del firewall 0.5, rotori del Decrypter 0.6, toni della Blue Box 0.7, oscilloscopio delle barriere biometriche 0.8).
7. ~~APK Android~~ (fatto, 0.28: Trusted Web Activity con Bubblewrap, `android/`; APK allegato alle release su GitHub, `assetlinks.json` servito da `aether.conf`).
8. **Sicurezza di rete**: ~~HTTPS/WSS dietro un proxy~~ (Apache su Balthasar), ~~limite di frequenza~~ (30 messaggi al secondo per connessione, tetti su accessi sbagliati e iscrizioni). ~~Scadenza dei token~~ (0.21.1: 30 giorni dall'ultimo uso, rinnovata a ogni accesso, `AETHER_SESSION_DAYS`; le sessioni scadute si cancellano a ogni nuovo accesso e all'avvio).
9. **Proposta sandbox** del 25 novembre: completa (0.12-0.21). Seconda proposta del 26 novembre (imprevisti, effetto domino, nemesi e favori, territori, bottino con un contenuto, operazioni lunghe): completa (0.22-0.27).
