// Genera (o rigenera) il progetto Android di AETHER: una Trusted Web Activity che apre il gioco in linea a tutto schermo.
// La configurazione dell'app sta in twa-manifest.json; la chiave di firma NON sta nel repository (vedi README.md).
// Uso: node android/genera.mjs            (poi: bash android/compila.sh)
import { createRequire } from "node:module";
import { existsSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { homedir } from "node:os";

const require = createRequire(import.meta.url);
const core = require(join(homedir(), ".local/opt/node/lib/node_modules/@bubblewrap/cli/node_modules/@bubblewrap/core"));
const here = dirname(fileURLToPath(import.meta.url));
const conf = join(here, "twa-manifest.json");
const out = join(here, "progetto");
const pkg = require(join(here, "..", "package.json"));

let twa;
if (existsSync(conf)) twa = await core.TwaManifest.fromFile(conf);
else {
  twa = await core.TwaManifest.fromWebManifest("https://timrouter.dns.army/aether/manifest.webmanifest");
  twa.packageId = "army.dns.timrouter.aether";
  twa.name = "AETHER";
  twa.launcherName = "AETHER";
  twa.maskableIconUrl = "https://timrouter.dns.army/aether/art/icon-512.png";
  // solo indicativo: la firma la fa compila.sh, con la chiave in ~/.config/aether-android (fuori dal repository)
  twa.signingKey = { path: "~/.config/aether-android/aether.keystore", alias: "aether" };
  twa.enableNotifications = false;
  twa.orientation = "any";
  twa.fallbackType = "customtabs";
}
// la versione dell'app segue quella del gioco: 0.27.1 → 2701
const [ma, mi, pa] = pkg.version.split(".").map(Number);
twa.appVersionName = pkg.version;
twa.appVersionCode = ma * 10000 + mi * 100 + pa;
twa.generatorApp = "aether/android/genera.mjs";
// la scorciatoia «impostazioni del sito» va lasciata: senza, la libreria cerca la sua attività all'avvio e l'app si chiude
twa.enableSiteSettingsShortcut = true;
// la libreria delle Trusted Web Activity vuole almeno Android 7 (API 24)
twa.minSdkVersion = Math.max(24, twa.minSdkVersion ?? 0);
await twa.saveToFile(conf);
if (existsSync(out)) rmSync(out, { recursive: true });
await new core.TwaGenerator().createTwaProject(out, twa, new core.ConsoleLog("genera"));
// senza regole che proteggano le classi della libreria, l'ottimizzazione di R8 rinomina una classe che la libreria cerca
// per nome e l'app si chiude all'avvio («Component class R.u does not exist»): il guscio è piccolo, si compila senza
const gradle = join(out, "app", "build.gradle");
writeFileSync(gradle, readFileSync(gradle, "utf8").replace(/minifyEnabled true/g, "minifyEnabled false"));
console.log(`progetto Android in ${out} · ${twa.packageId} · versione ${twa.appVersionName} (${twa.appVersionCode})`);
