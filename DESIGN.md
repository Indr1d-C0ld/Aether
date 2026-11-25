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

1. **Grafica PixelLab**: sfondi di città per la schermata d'accesso, ritratti degli handle NPC, icone dei software in 32×32 a palette VGA, splash per le schede dei nodi.
2. ~~Audio~~ (fatto, sintetizzato nel browser). La musica e gli effetti di PixelLab richiedono un abbonamento Tier 2: con quello si potrebbero aggiungere brani registrati da alternare a quelli generativi.
3. ~~Gateway attaccabili~~ (fatto). Possibili estensioni: rubare strumenti, trojan che si attivano più tardi, IP rotabili a pagamento.
4. ~~Mercato fra giocatori~~ (fatto: mercato nero, ricettatore, taglie). Possibile estensione: exploit con usura.
5. **Stagioni ed eventi globali** («Zero-Day Outbreak», «Corporate War»), alleanze e cellule.
6. **Mini-giochi opzionali** sopra agli strumenti automatici: fatti la griglia del firewall (0.5.0) e i rotori del Decrypter (0.6.0). Prossimi: toni della Blue Box, oscilloscopio per i blu. Uno alla volta.
7. **APK Android**: icona PNG 512, dominio HTTPS, `bubblewrap init --manifest https://…/manifest.webmanifest`.
8. **Sicurezza di rete**: limiti di frequenza sulle azioni, scadenza dei token, HTTPS/WSS dietro un proxy.
