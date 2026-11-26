#!/usr/bin/env bash
# =============================================================================
# AETHER su Balthasar — installazione e aggiornamento.
#
#   sudo bash deploy/balthasar/installa.sh          (dalla cartella del repository)
#
# Rilanciabile: aggiorna codice e client, lascia il mondo di gioco dov'è.
#
# Cosa fa:
#   1. Node 26 ufficiale in /opt/aether/node (Balthasar ha Node 20 di sistema,
#      che non basta: AETHER usa TypeScript nativo e node:sqlite). Scaricato da
#      nodejs.org e verificato con SHASUMS256.
#   2. compila il client come l'utente che ha lanciato sudo (mai da root),
#      con il percorso pubblico /aether/;
#   3. copia server, client compilato e dipendenze in /opt/aether/app (root,
#      sola lettura), il mondo sta in /var/lib/aether (utente di servizio aether);
#   4. unità systemd aether.service, in sandbox, in ascolto solo su 127.0.0.1:7077;
#   5. conf Apache aether.conf: /aether/ e /aether/ws verso il server;
#      configtest, reload, prova finale.
#
# Il server salva il mondo ogni 5 minuti (AETHER_FLUSH_S), alla registrazione di
# un handle e all'arresto: niente scritture continue sulla SSD.
# =============================================================================
set -Eeuo pipefail
export PATH=/usr/local/bin:/usr/bin:/bin:/usr/local/sbin:/usr/sbin:/sbin

NODE_VERSION=v26.13.0
PREFIX=/opt/aether
APP=$PREFIX/app
NODE_DIR=$PREFIX/node
DATA=/var/lib/aether
PORT=7077
HERE="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO="$(cd "$HERE/../.." && pwd)"

say(){ printf '\033[1;36m==>\033[0m %s\n' "$*"; }
die(){ printf '\033[1;31mERRORE:\033[0m %s\n' "$*" >&2; exit 1; }

[[ $EUID -eq 0 ]] || die "lancialo con sudo"
BUILDER="${SUDO_USER:-}"
[[ -n $BUILDER && $BUILDER != root ]] || die "lancialo con sudo da un utente normale: il client si compila come quell'utente"
[[ -f $REPO/package.json && -f $REPO/server/main.ts ]] || die "non trovo il repository di AETHER in $REPO"
if ss -ltnH "sport = :$PORT" | grep -q . && ! systemctl is-active --quiet aether; then
  die "la porta $PORT è già occupata da qualcos'altro"
fi

# ---------------------------------------------------------------- 1. Node 26
if [[ "$("$NODE_DIR/bin/node" --version 2>/dev/null)" != "$NODE_VERSION" ]]; then
  say "Node $NODE_VERSION in $NODE_DIR"
  TMP="$(mktemp -d)"; trap 'rm -rf "$TMP"' EXIT
  TAR="node-$NODE_VERSION-linux-x64.tar.xz"
  curl -fsSL --proto '=https' "https://nodejs.org/dist/$NODE_VERSION/$TAR" -o "$TMP/$TAR"
  curl -fsSL --proto '=https' "https://nodejs.org/dist/$NODE_VERSION/SHASUMS256.txt" -o "$TMP/SHASUMS256.txt"
  (cd "$TMP" && grep " $TAR\$" SHASUMS256.txt | sha256sum -c --status) || die "checksum di Node non valido"
  install -d -m 0755 "$PREFIX"
  rm -rf "$NODE_DIR.new"; install -d -m 0755 "$NODE_DIR.new"
  tar -xJf "$TMP/$TAR" -C "$NODE_DIR.new" --strip-components=1 --no-same-owner
  rm -rf "$NODE_DIR"; mv "$NODE_DIR.new" "$NODE_DIR"
fi
NODE="$NODE_DIR/bin/node"
NPM="$NODE_DIR/bin/npm"
"$NODE" --version

# ---------------------------------------------------------------- 2. compilazione del client
say "Compilo il client (utente $BUILDER, percorso /aether/)"
sudo -u "$BUILDER" -H env PATH="$NODE_DIR/bin:/usr/bin:/bin" bash -c "cd '$REPO' && npm ci --no-audit --no-fund && AETHER_BASE=/aether/ npm run build"
grep -q '/aether/assets/' "$REPO/dist/index.html" || die "il client non è stato compilato per /aether/"

# ---------------------------------------------------------------- 3. codice e dati
say "Codice in $APP"
getent group aether >/dev/null || groupadd --system aether
id -u aether >/dev/null 2>&1 || useradd --system --gid aether --home-dir "$DATA" --no-create-home --shell /usr/sbin/nologin aether
install -d -m 0750 -o aether -g aether "$DATA"

STAGE="$PREFIX/app.new"
rm -rf "$STAGE"; install -d -m 0755 "$STAGE"
cp -a "$REPO/server" "$REPO/shared" "$REPO/dist" "$REPO/package.json" "$REPO/package-lock.json" "$REPO/LICENSE" "$STAGE/"
install -d "$STAGE/scripts" && cp -a "$REPO/scripts/admin-account.ts" "$STAGE/scripts/"
# l'app Android: il file che dichiara al telefono che il dominio riconosce l'app (servito da aether.conf)
install -d "$STAGE/android" && cp -a "$REPO/android/assetlinks.json" "$STAGE/android/"
(cd "$STAGE" && env PATH="$NODE_DIR/bin:/usr/bin:/bin" HOME=/root "$NPM" ci --omit=dev --ignore-scripts --no-audit --no-fund --loglevel=error)
chown -R root:root "$STAGE"; chmod -R go-w "$STAGE"
rm -rf "$PREFIX/app.old"; [[ -d $APP ]] && mv "$APP" "$PREFIX/app.old"
mv "$STAGE" "$APP"

# ---------------------------------------------------------------- 4. servizio
say "Unità aether.service"
install -m 0644 "$HERE/aether.service" /etc/systemd/system/aether.service
systemctl daemon-reload
systemctl enable aether.service >/dev/null
systemctl restart aether.service
for _ in $(seq 1 20); do
  curl -fsS "http://127.0.0.1:$PORT/health" >/dev/null 2>&1 && break
  sleep 0.5
done
curl -fsS "http://127.0.0.1:$PORT/health" >/dev/null || { journalctl -u aether -n 30 --no-pager; die "il server non risponde"; }

# ---------------------------------------------------------------- 5. Apache
say "Apache: /aether/"
a2enmod -q proxy proxy_http proxy_wstunnel headers >/dev/null
install -m 0644 "$HERE/aether-apache.conf" /etc/apache2/conf-available/aether.conf
a2enconf -q aether >/dev/null
if ! apache2ctl configtest 2>/dev/null; then
  a2disconf -q aether >/dev/null
  apache2ctl configtest || true
  die "configurazione di Apache non valida: aether.conf disabilitata, il resto del sito non è stato toccato"
fi
systemctl reload apache2

# ---------------------------------------------------------------- prova finale
say "Prova"
sleep 1
curl -fsS -o /dev/null -w 'pagina  %{http_code}\n' "http://127.0.0.1/aether/"
curl -fsS "http://127.0.0.1/aether/health"; echo
rm -rf "$PREFIX/app.old"
say "Fatto: https://timrouter.dns.army/aether/"
echo "Account dell'amministratore (crearlo o cambiargli la chiave):"
echo "  sudo -u aether $NODE $APP/scripts/admin-account.ts --db $DATA/aether.db admin"
