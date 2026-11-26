#!/usr/bin/env bash
# Compila e firma l'app Android di AETHER (APK per l'installazione diretta, AAB per un eventuale negozio).
# La chiave e le sue password stanno in ~/.config/aether-android (fuori dal repository): vedi android/README.md.
# Uso: node android/genera.mjs && bash android/compila.sh      → android/dist/aether-<versione>.apk e .aab
set -euo pipefail
cd "$(dirname "$0")"
KEYDIR="$HOME/.config/aether-android"
[ -f "$KEYDIR/aether.keystore" ] && [ -f "$KEYDIR/keystore.env" ] || { echo "manca la chiave di firma in $KEYDIR (vedi README.md)"; exit 1; }
set -a; . "$KEYDIR/keystore.env"; set +a
export JAVA_HOME="$HOME/.local/opt/jdk-17"   # il progetto generato da Bubblewrap vuole il JDK 17
export ANDROID_HOME="$HOME/Android/Sdk"
BT="$ANDROID_HOME/build-tools/36.0.0"
VER=$(node -p 'require("./twa-manifest.json").appVersionName')
mkdir -p dist
(cd progetto && ./gradlew --no-daemon -q assembleRelease bundleRelease)
"$BT/zipalign" -f -p 4 progetto/app/build/outputs/apk/release/app-release-unsigned.apk dist/allineato.apk
"$BT/apksigner" sign --ks "$KEYDIR/aether.keystore" --ks-key-alias aether --ks-pass env:BUBBLEWRAP_KEYSTORE_PASSWORD --key-pass env:BUBBLEWRAP_KEY_PASSWORD --out "dist/aether-$VER.apk" dist/allineato.apk
rm -f dist/allineato.apk dist/*.idsig
"$JAVA_HOME/bin/jarsigner" -keystore "$KEYDIR/aether.keystore" -storepass:env BUBBLEWRAP_KEYSTORE_PASSWORD -keypass:env BUBBLEWRAP_KEY_PASSWORD -signedjar "dist/aether-$VER.aab" progetto/app/build/outputs/bundle/release/app-release.aab aether >/dev/null
"$BT/apksigner" verify "dist/aether-$VER.apk" && echo "firmato: dist/aether-$VER.apk e dist/aether-$VER.aab"
(cd progetto && ./gradlew --stop >/dev/null 2>&1 || true)
