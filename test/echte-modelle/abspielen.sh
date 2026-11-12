#!/usr/bin/env bash
# Spielt aufgezeichnete Antworten echter Modelle durch die Gesellenprüfung.
# Aufruf aus dem Projektordner: bash test/echte-modelle/abspielen.sh
set -u
HIER="$(cd "$(dirname "$0")" && pwd)"
WURZEL="$(cd "$HIER/../.." && pwd)"
TMP="$(mktemp -d)"
gesamt=0
port=11960
for datei in "$HIER"/antworten-*.json; do
  name="$(basename "$datei" .json | sed 's/^antworten-//')"
  port=$((port + 1))
  node "$WURZEL/test/mock-ollama.js" "$port" "datei:$datei" 2>"$TMP/$name.err" &
  pid=$!
  sleep 0.8
  mkdir -p "$TMP/$name"
  ( cd "$TMP/$name" && node "$WURZEL/bridge/geselle.js" pruefung --betrieb alle --url "http://127.0.0.1:$port" --modell "claude-$name-aufnahme" > ausgabe.txt )
  code=$?
  kill "$pid" 2>/dev/null
  echo "== $name (Exit $code)"
  grep -E "Ergebnis|✗" "$TMP/$name/ausgabe.txt"
  if [ -s "$TMP/$name.err" ]; then echo "   Fehlende Aufnahmen:"; cat "$TMP/$name.err"; fi
  [ "$code" -ne 0 ] && gesamt=1
done
rm -rf "$TMP"
exit $gesamt
