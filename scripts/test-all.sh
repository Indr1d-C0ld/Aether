#!/usr/bin/env bash
# Lancia tutti i test, ognuno su un mondo pulito (gli NPC di un mondo condiviso possono falsare i risultati).
# Uso: scripts/test-all.sh [porta]
cd "$(dirname "$0")/.." || exit 1
PORT="${1:-7090}"
TMP="$(mktemp -d)"
fail=0
for t in smoke smoke-gateway smoke-market smoke-depth smoke-blue smoke-soc smoke-world smoke-admin smoke-net smoke-zones smoke-grid smoke-rotors smoke-tones smoke-bio smoke-bbs smoke-malware smoke-life smoke-orgs smoke-citizens smoke-stocks smoke-jobs smoke-ownbbs smoke-intel smoke-law smoke-aftermath smoke-session smoke-surprises; do
  rm -f "$TMP"/w.db*
  AETHER_DEV=1 AETHER_FAST=1 AETHER_DB="$TMP/w.db" AETHER_PORT="$PORT" node server/main.ts > "$TMP/$t.server.log" 2>&1 &
  pid=$!
  sleep 2
  if AETHER_DB="$TMP/w.db" node "scripts/$t.ts" "$PORT" > "$TMP/$t.log" 2>&1; then echo "OK    $t"; else echo "FAIL  $t (vedi $TMP/$t.log)"; fail=1; fi
  grep -E "^FAIL|TypeError|Error:" "$TMP/$t.log" | head -5
  kill "$pid" 2>/dev/null
  wait "$pid" 2>/dev/null
done
exit $fail
