# AETHER per Android

L'app è una **Trusted Web Activity**: un guscio Android minimo (circa 1 MB) che apre il gioco in linea,
`https://timrouter.dns.army/aether/`, a tutto schermo, con il motore di Chrome. Il gioco vero resta sul server:
quando AETHER si aggiorna, l'app non va ripubblicata.

## File

| File | Cosa contiene |
|---|---|
| `twa-manifest.json` | La configurazione dell'app: pacchetto `army.dns.timrouter.aether`, nome, colori, icone, versione |
| `genera.mjs` | Rigenera il progetto Android in `progetto/` dalla configurazione, con la libreria di Bubblewrap |
| `compila.sh` | Compila e firma: `dist/aether-<versione>.apk` (installazione diretta) e `.aab` (per un negozio) |
| `assetlinks.json` | Il collegamento fra dominio e app (vedi sotto) |

`progetto/` e `dist/` non sono nel repository: si rigenerano.

## Compilare

```bash
node android/genera.mjs
bash android/compila.sh
```

Serve la toolchain di Melchior: JDK 17, Android SDK in `~/Android/Sdk`, Bubblewrap installato con npm.
La versione dell'app segue quella del gioco (`package.json`): 0.27.1 diventa il codice di versione 2701.

## La chiave di firma

Sta **fuori dal repository**, in `~/.config/aether-android/`: `aether.keystore` (alias `aether`) e `keystore.env`, con le
password, leggibile solo dal proprietario. Va conservata: un aggiornamento dell'app installata si può firmare solo
con la stessa chiave. Una copia di sicurezza di quella cartella in un posto non pubblico è una buona idea.

Impronta SHA-256 del certificato (pubblica):
`73:16:D2:9C:77:85:9B:09:81:4E:30:25:1B:62:97:7D:C7:53:20:52:21:C0:51:99:F3:36:CC:74:1C:00:65:D9`

## Collegamento fra dominio e app

Perché Android apra il gioco senza la barra dell'indirizzo in cima, il sito deve dichiarare di riconoscere l'app:
`assetlinks.json` va pubblicato alla radice del dominio, in `https://timrouter.dns.army/.well-known/assetlinks.json`.
Finché non c'è, l'app funziona lo stesso, ma mostra una sottile barra con l'indirizzo.

## Installare sul telefono

Con il debug wireless del telefono (`adb pair`, poi `adb connect`): `adb install -r android/dist/aether-<versione>.apk`.
Oppure si copia l'APK sul telefono e lo si apre, permettendo l'installazione da origini sconosciute.
