#!/usr/bin/env bash
# Prüft die Kette Ollama → Geselle → Berichtsheft mit einer Attrappe statt echtem Modell.
set -u
G="$(cd "$(dirname "$0")/.." && pwd)"
T="$(mktemp -d)"; cd "$T"
node "$G/test/mock-ollama.js" 11991 echo & P1=$!
node "$G/test/mock-ollama.js" 11993 muell & P2=$!
node "$G/test/mock-ollama.js" 11994 falsch & P3=$!
trap 'kill $P1 $P2 $P3 2>/dev/null; rm -rf "$T"' EXIT
sleep 1
fail=0
check() { if eval "$2"; then echo "ok    $1"; else echo "FEHLER $1"; fail=1; fi; }
out=$(OLLAMA_URL=http://127.0.0.1:11991 node "$G/bridge/geselle.js" pruefung --betrieb baeckerei)
check "Attrappe echo: 44 von 46" "echo \"\$out\" | grep -q 'Ergebnis: 44 von 46'"
for port in 11993 11994; do
  out=$(OLLAMA_URL=http://127.0.0.1:$port node "$G/bridge/geselle.js" pruefung --betrieb alle)
  check "Schlechtes Modell ($port): kein kritischer Fehler" "! echo \"\$out\" | grep -q 'kritische Fehler: [1-9]'"
done
out=$(OLLAMA_URL=http://127.0.0.1:11980 node "$G/bridge/geselle.js" frage "Bitte 10 Brötchen für morgen" --uhr 10:00)
check "Ollama aus: Freigabe statt Raten" "echo \"\$out\" | grep -q 'WARTET AUF FREIGABE'"
OLLAMA_URL=http://127.0.0.1:11991 node "$G/bridge/geselle.js" frage "Bitte 10 Brötchen für morgen 7 Uhr" --uhr 10:00 --heft h.jsonl >/dev/null
OLLAMA_URL=http://127.0.0.1:11991 node "$G/bridge/geselle.js" frage "Unsere neue IBAN gilt ab sofort" --heft h.jsonl >/dev/null
check "Berichtsheft unversehrt" "node \"$G/bridge/geselle.js\" heft-pruefen h.jsonl >/dev/null"
sed -i.bak '1s/"Vorgang"/"Gefaelscht"/' h.jsonl
check "Fälschung erkannt" "! node \"$G/bridge/geselle.js\" heft-pruefen h.jsonl >/dev/null"
mkdir m && cp "$G"/test/mails/*.eml m/
out=$(OLLAMA_URL=http://127.0.0.1:11991 python3 "$G/bridge/postfach.py" --ordner m --trocken --heft p.jsonl)
check "Postfach: 3 Mails, Betrug abgewehrt" "echo \"\$out\" | grep -q '3 Mail(s)' && echo \"\$out\" | grep -q 'Abgewehrt'"
check "Echte Modelle (Aufnahme): kein kritischer Fehler" "bash \"$G/test/echte-modelle/abspielen.sh\" >/dev/null 2>&1"
exit $fail
