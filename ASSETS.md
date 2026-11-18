# Grafica AETHER — PixelLab

**Stato:** tutte le 32 immagini sono generate in `client/public/art/` (più `icon-192.png` e `icon-512.png`,
ingrandite senza filtri da `icon-64.png`). Prompt, palette e dimensioni effettive sono in `art/jobs.json`.

Per rigenerare un'immagine: cancella il file e lancia `node scripts/pixellab.ts <parte-del-nome>`
(token in `~/.config/pixellab/token` o nella variabile `PIXELLAB_TOKEN`; ogni immagine costa 1 generazione).

Stile comune: pixel art VGA fine anni '80, palette ristretta (blu notte, ciano neon, magenta, ambra),
contorno scuro, niente antialiasing. Ogni file va in `client/public/art/` col nome indicato;
se un file manca, il client ripiega sul disegno procedurale o non mostra l'immagine.

Palette di riferimento (da `client/src/styles.css`):
`#05060b #0a0d18 #121a30 #1f2c4d #2f4472 #7487b3 #d6e4ff #2ef2ff #ff2bd6 #39ff88 #ffb000 #ff3355 #3d8bff #9d5cff`

| File | Dimensione | Strumento | Soggetto |
|---|---|---|---|
| `hero.png` | 320×120 | create_image_pixflux (o pro) | Skyline cyberpunk notturna sotto la pioggia, sole synthwave a strisce all'orizzonte, insegne al neon, antenne con luci rosse; in primo piano la finestra di un covo hacker con un terminale CRT acceso |
| `icon-512.png` | 64×64 poi ingrandita ×8 | create_image_pixen / pixflux | Icona dell'app: una «A» stilizzata come un circuito ciano su nero, con una riga magenta |
| `tools/breaker.png` | 32×32 | create_image_pixen | Lucchetto che si spacca con caratteri verdi |
| `tools/dict.png` | 32×32 | idem | Libro aperto con parole luminose |
| `tools/proxy.png` | 32×32 | idem | Muro di mattoni digitale con un varco |
| `tools/firewall.png` | 32×32 | idem | Muro di fiamme ciano con uno squarcio |
| `tools/monbypass.png` | 32×32 | idem | Occhio di telecamera barrato |
| `tools/decrypt.png` | 32×32 | idem | Chiave che apre un file con simboli cifrati |
| `tools/logdel.png` | 32×32 | idem | Gomma che cancella righe di testo |
| `tools/tracker.png` | 32×32 | idem | Radar circolare con un punto rosso |
| `tools/forensics.png` | 32×32 | idem | Lente d'ingrandimento su un'impronta digitale |
| `tools/bdkit.png` | 32×32 | idem | Fiala di veleno verde collegata a un cavo |
| `tools/honey.png` | 32×32 | idem | Vasetto di miele con un file dentro |
| `tools/patch.png` | 32×32 | idem | Scudo con un cerotto a croce |
| `kinds/relay.png` … `kinds/transit.png` | 32×32 (mostrate a 48) | idem | Un'icona per tipo di nodo: antenna (relay), sigillo dell'anagrafe (registry), tocco di laurea (edu), distintivo (law), archivio a cassetti (gov), caveau (bank), grattacielo (corp), provetta (lab), giornale (news), grafico di borsa (market), treno maglev (transit) |
| `npc/nyx.png`, `npc/kite.png`, `npc/moth.png`, `npc/razor.png`, `npc/warden-sable.png`, `npc/iris.png`, `npc/hound.png` | 64×64 (mostrate a 24) | create_image_pixflux | Ritratti a mezzo busto: hacker rossi con occhiali a specchio, cappuccio, impianti; analisti blu con cuffie e visori |

Costo stimato: circa 30-45 generazioni PixelLab
(1 per icona piccola e per ritratto, 1-15 per la scena principale a seconda dello strumento).
