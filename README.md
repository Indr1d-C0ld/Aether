# AETHER

Deck d'intrusione multiplayer e persistente, rosso contro blu, sul Reticolo del 2039.
Reinterpretazione moderna del modello di Uplink: hacking da film, trace da battere, log che ricordano tutto.

## Avvio rapido

```bash
cd aether
npm install
npm run dev        # server di gioco (porta 7077, con --watch) + Vite (porta 5173, o PORT)
```

Apri `http://localhost:5173`. Per provare il multiplayer apri una seconda finestra in incognito
e registra un handle dell'altra cellula.

Produzione (un solo processo, client compilato servito dal server Node):

```bash
npm run build
npm start          # http://0.0.0.0:7077
```

Variabili d'ambiente: `AETHER_PORT` (default 7077), `AETHER_DB` (default `data/aether.db`).
Il server usa solo Node 26 (TypeScript nativo, `node:sqlite`) e la libreria `ws`.

Controlli:

```bash
npm run typecheck
node scripts/smoke.ts 7099          # con un server avviato su AETHER_PORT=7099: ciclo rosso + caccia blu
node scripts/smoke-gateway.ts 7099  # assalto a un gateway e rivalsa (server con AETHER_DEV=1)
node scripts/smoke-market.ts 7099   # mercato nero, ricettatore e taglie (server con AETHER_DEV=1)
node scripts/smoke-depth.ts 7099    # archivi, banca, oggetti, giustizia, War Dialer (AETHER_DEV=1 AETHER_FAST=1)
node scripts/smoke-blue.ts 7099     # lato blu completo: 7 tipi di contratto (AETHER_DEV=1 AETHER_FAST=1)
scripts/test-all.sh                 # tutti i test smoke, ognuno su un mondo pulito
node scripts/smoke-world.ts 7099    # mondo vivo: esplorazione, reazioni dei nodi, comandi di sistema (AETHER_DEV=1 AETHER_FAST=1)
node scripts/smoke-soc.ts 7099      # sala operativa blu: presidi, sensori come prova, analista (AETHER_DEV=1 AETHER_FAST=1)
node scripts/economy.ts             # economia: ricompense per grado, CR/ora, ore per salire di livello (senza server)
node scripts/playtest.ts 7099       # bilanciamento: un bot gioca a 5 livelli di equipaggiamento (AETHER_DEV=1, ~2 minuti)
```

`npm run dev` avvia il server con `AETHER_DEV=1`, che abilita l'azione di test `devGrant` (XP e crediti);
`npm start` no.

Per azzerare il mondo: ferma il server e cancella `data/aether.db*`.

## Struttura

| Cartella | Contenuto |
|---|---|
| `shared/types.ts` | Viste inviate al client e protocollo WebSocket |
| `shared/rules.ts` | **Tutti i numeri del bilanciamento**: strumenti, hardware, trace, ranghi |
| `server/game.ts` | Simulazione autoritativa: mondo, operazioni live, trace, log, forensica, contratti, NPC |
| `server/content.ts` | Nodi, file, password, NPC del mondo iniziale, nodi nascosti |
| `server/worldgen.ts` | Generatore del mondo: circa 290 nodi di 13 tipi su 73 città, datori di lavoro e PC di casa dei cittadini |
| `server/people.ts` | I 100 cittadini (generati da un seme fisso) che popolano anagrafe, casellario, atenei e banche |
| `shared/depth.ts` | Rarità, exploit e chip, fama, etica, capi d'accusa e mandati, imprese |
| `server/db.ts` | Persistenza SQLite (documenti JSON) e account (scrypt + token) |
| `server/main.ts` | HTTP statico + WebSocket, tick a 4 Hz |
| `client/src/pixel.ts` | Pixel art procedurale: mappa 320×180, glifi, rimbalzi, skyline |
| `client/src/views/` | Accesso, deck, mappa, console d'intrusione, bacheca, mercato, ecc. |

Il client non riceve mai segreti: password, autore reale delle righe di log e honeypot altrui
restano sul server. Le azioni sono validate e temporizzate dal server; il client interpola solo
le barre (trace e task) fra un aggiornamento e l'altro.

## Grafica

Le immagini in pixel art (scena d'accesso, icone dei software e dei nodi, ritratti NPC, icona dell'app) sono generate
con PixelLab: vedi `ASSETS.md` e `scripts/pixellab.ts`. Se un file manca, il client ripiega sul disegno procedurale.

## Audio

Musica ed effetti sono sintetizzati nel browser con il Web Audio API, alla maniera delle schede FM anni '90
(AdLib / Sound Blaster): nessun file audio. `client/src/audio.ts` contiene il motore (voci FM a due operatori,
batteria sintetica, 13 effetti: modem, tastiera, allarmi, sirene, cassa…), `client/src/music.ts` il sequencer
generativo con tre brani: titolo (La minore, 86 bpm), deck (Re minore, 100 bpm) e inseguimento (Mi minore,
da 128 a 156 bpm secondo l'avanzamento del trace). Musica ed effetti si attivano separatamente dalla barra in alto;
il browser sblocca l'audio al primo clic o tasto.

## PWA e Android

Il client è una PWA (manifest + service worker, icone PNG 192 e 512). Per un APK con Bubblewrap serve
ancora un URL HTTPS pubblico del server: vedi `DESIGN.md`, sezione Prossimi passi.
