# Geselle

KI-Mitarbeiter für kleine Betriebe, der nach einem Lehrvertrag arbeitet, ein Berichtsheft führt und erst nach bestandener Prüfung mehr allein darf. Gebaut mit Claude Code.

Zwei Teile:

1. **Demo im Browser** (`dist/index.html`): drei Musterbetriebe, alles simuliert außer der Logik.
2. **Geselle auf deinem Rechner** (`bridge/`): versteht Nachrichten mit Ollama, entscheidet nach Lehrvertrag, führt ein echtes Berichtsheft als Datei und liest auf Wunsch ein E-Mail-Postfach mit. Er verschickt **keine** Antworten, er meldet dir per Telegram, was er tun würde.

Alle Betriebe, Personen, Preise und Verkaufszahlen sind erfunden. Keine Rechtsberatung.

## Inhalt

| Datei | Zweck |
|---|---|
| `src/engine.js` | Entscheidungslogik: Wächter, Verstehen, Lehrvertrag, Prüfung, Hash-Kette, Prognose, Prompt fürs Sprachmodell. Läuft im Browser und in Node. |
| `src/app.js`, `src/style.css`, `src/index.tpl.html` | Oberfläche der Demo |
| `build.js` | Baut `dist/index.html` als eine Datei |
| `bridge/geselle.js` | Kommandozeile: `frage`, `pruefung`, `heft-pruefen`, mit Ollama |
| `bridge/postfach.py` | Liest neue Mails, fragt den Gesellen, meldet per Telegram |
| `test/run.js` | Hash-Funktion, Tagesablauf, alle 91 Prüfungsfälle ohne Modell |
| `test/bridge-test.sh` | Ganze Kette mit einer Ollama-Attrappe, ohne echtes Modell |
| `test/mock-ollama.js` | Die Attrappe; spielt auch aufgezeichnete Antworten echter Modelle ab |
| `test/echte-modelle/` | Antworten von Claude Haiku 5.5 und Sonnet 5.5 auf alle 65 Modell-Prompts der Prüfung, `abspielen.sh`, `ERGEBNIS.md` |
| `test/mails/` | Drei Beispiel-Mails zum Testen |

Voraussetzungen: Node.js 18 oder neuer, Python 3.8 oder neuer, für Teil 2 zusätzlich Ollama.

---

## Teil 1: Demo bauen und testen

```bash
cd ~/geselle
node build.js
node test/run.js
```

Erwartet: Bäckerei 44/46, Elektro 23/23, Physio 22/22. Die zwei Fehler (Dialekt, Ironie) sind Absicht: Ohne Sprachmodell versteht der Geselle nur Schlüsselwörter.

Öffnen: macOS `open dist/index.html`, Windows `start dist\index.html`.

## Teil 1b: Demo auf GitHub Pages

Auf github.com leeres Repo `EarlGreyLab/geselle` anlegen (ohne README), dann im Ordner `geselle`:

```bash
cat > .gitignore <<'EOF'
node_modules/
test/*.png
heft*.jsonl
pruefung-*.json
geselle.env
.DS_Store
EOF
cp dist/index.html index.html
git init
git add .
git commit -m "Geselle: Konzept-Demo und lokale Anbindung"
git branch -M main
git remote add origin https://github.com/EarlGreyLab/geselle.git
git push -u origin main
```

Dann auf GitHub: Settings → Pages → Source „Deploy from a branch“ → Branch `main`, Ordner `/ (root)` → Save. Nach ein bis zwei Minuten: `https://earlgreylab.github.io/geselle/`

Kürzer mit der GitHub-Kommandozeile (`gh auth login` einmal vorher), statt Repo im Browser anlegen, `git remote` und `git push`:

```bash
gh repo create EarlGreyLab/geselle --public --source=. --remote=origin --push
gh api -X POST repos/EarlGreyLab/geselle/pages -f "source[branch]=main" -f "source[path]=/"
```

Nach jeder Änderung an der Demo:

```bash
node build.js && cp dist/index.html index.html && git add -A && git commit -m "Demo aktualisiert" && git push
```

---

## Teil 2: Geselle mit Ollama auf deinem Rechner

### Schritt 1: Prüfen, ob die Kette läuft (ohne echtes Modell, 10 Sekunden)

```bash
cd ~/geselle
bash test/bridge-test.sh
```

Alle Zeilen müssen mit `ok` beginnen.

### Schritt 2: Modell holen

```bash
ollama pull qwen3:8b
```

`qwen3:14b` versteht besser, braucht aber mehr Zeit je Nachricht. Mit `--modell qwen3:14b` umschalten.

### Schritt 3: Adresse von Ollama setzen

**MacBook oder Linux mit Ollama auf demselben Gerät:** nichts zu tun, Standard ist `http://localhost:11434`.

**Windows-PC, Skripte in WSL2, Ollama nativ unter Windows:** Nimm dieselbe Adresse, die dein Daily Brief benutzt (Host und Port aus dessen `config.py`), nur ohne `/api/generate`:

```bash
echo 'export OLLAMA_URL="http://HOST:PORT"' >> ~/.bashrc
source ~/.bashrc
curl -s "$OLLAMA_URL/api/tags" | head -c 200; echo
```

Kommt JSON mit deinen Modellen, stimmt die Adresse.

Node in WSL2 zu alt oder nicht da (`node --version` unter 18):

```bash
curl -fsSL https://raw.githubusercontent.com/nvm-sh/nvm/v0.40.1/install.sh | bash
source ~/.bashrc
nvm install 22
node --version
```

### Schritt 4: Gesellenprüfung mit dem Modell (Tor 2)

```bash
cd ~/geselle
node bridge/geselle.js pruefung --betrieb alle
```

Dauert je nach GPU einige Minuten (91 Fälle, 65 davon gehen ans Modell). Ziel: mindestens 90 % und **kein** kritischer Fehler.

Zum Vergleich, aufgezeichnet am 12.11.2026 mit genau diesen Prompts: Claude Haiku 5.5 89 von 91, Claude Sonnet 5.5 88 von 91, Schlüsselwörter 89 von 91, jeweils kein kritischer Fehler. Selbst abspielen:

```bash
bash test/echte-modelle/abspielen.sh
```

Details und Grenzen der Aufnahme: `test/echte-modelle/ERGEBNIS.md`. Das Ergebnis landet in `pruefung-<betrieb>.json` und deckelt danach die Stufen. Ohne diese Datei bleibt alles auf Stufe Lehrling.

### Schritt 5: Einzelne Nachrichten testen

```bash
node bridge/geselle.js frage "Moin, 10 Brödchen un 2 Rogenbrot für morje bitte." --betrieb baeckerei --uhr 10:00 --heft heft.jsonl
node bridge/geselle.js frage "Aus der Steckdose kommen Funken!" --betrieb elektro --heft heft-elektro.jsonl
node bridge/geselle.js frage "Bin krank, falle heute aus." --betrieb physio --rolle mitarbeiter
node bridge/geselle.js heft-pruefen heft.jsonl
```

Eigene Regeln: Im Reiter „Lehrvertrag“ der Demo den Vertrag kopieren, als `lehrvertrag.json` speichern und `--vertrag lehrvertrag.json` anhängen.

### Schritt 6: Postfach mitlesen lassen

Erst mit den Beispiel-Mails, ohne Telegram:

```bash
cp -r test/mails testmails
python3 bridge/postfach.py --ordner testmails --trocken --heft heft-test.jsonl
```

Dann mit einem echten Postfach. Nimm zum Start dein eigenes Gmail mit einem Label `geselle-test`, kein Kundenpostfach.

1. Gmail: Bestätigung in zwei Schritten muss an sein. Dann myaccount.google.com → Sicherheit → App-Passwörter → eins für „geselle“ erzeugen.
2. Gmail: Label `geselle-test` anlegen und ein paar Test-Mails damit versehen.
3. Für Telegram einen **neuen** Bot bei @BotFather anlegen, nicht den Daily-Brief-Bot.
4. Zugangsdaten in eine Datei, die nur du lesen kannst:

```bash
cd ~/geselle
cat > geselle.env <<'EOF'
GESELLE_IMAP_HOST=imap.gmail.com
GESELLE_IMAP_USER=deine.adresse@gmail.com
GESELLE_IMAP_PW=xxxx xxxx xxxx xxxx
GESELLE_LABEL=geselle-test
TELEGRAM_TOKEN=123456:ABC
TELEGRAM_CHAT=123456789
OLLAMA_URL=http://localhost:11434
OLLAMA_MODEL=qwen3:8b
EOF
chmod 600 geselle.env
```

Werte in `geselle.env` mit einem Editor eintragen, nie in einen Chat kopieren. Unter WSL2 bei `OLLAMA_URL` dieselbe Adresse wie in Schritt 3 eintragen. Die Datei steht in `.gitignore` und landet nicht auf GitHub.

5. Einmal von Hand laufen lassen:

```bash
set -a; . ./geselle.env; set +a
python3 bridge/postfach.py --betrieb baeckerei --heft heft.jsonl
```

6. Alle 15 Minuten automatisch, gleiches Muster wie beim Daily Brief. Wrapper anlegen (Pfad anpassen, wenn der Ordner woanders liegt):

```bash
cat > ~/geselle/run-postfach.sh <<'EOF'
#!/usr/bin/env bash
export NVM_DIR="$HOME/.nvm"; [ -s "$NVM_DIR/nvm.sh" ] && . "$NVM_DIR/nvm.sh"
cd ~/geselle || exit 1
set -a; . ./geselle.env; set +a
python3 bridge/postfach.py --betrieb baeckerei --heft heft.jsonl >> postfach.log 2>&1
EOF
chmod +x ~/geselle/run-postfach.sh
```

Windows, PowerShell:

```powershell
schtasks /Create /SC MINUTE /MO 15 /TN "GesellePostfach" /TR "wsl.exe -e bash -lc ~/geselle/run-postfach.sh"
```

macOS, Terminal:

```bash
(crontab -l 2>/dev/null; echo "*/15 * * * * bash $HOME/geselle/run-postfach.sh") | crontab -
```

Wieder abschalten: Windows `schtasks /Delete /TN "GesellePostfach" /F`, macOS `crontab -e` und die Zeile löschen.

---

## FAQ

**Schickt der Geselle Antworten an Kunden?**
Nein. Er bewertet, schreibt einen Entwurf ins Ergebnis und meldet dir per Telegram. Antworten verschickst du selbst. Das ist bewusst so, solange kein Pilot gemessen ist.

**Was steht in der Telegram-Meldung?**
Standard: Entscheidung, Zusammenfassung, Absender, Betreff, Grund. Den Antwortentwurf nur mit `--mit-entwurf`. Telegram ist ein Cloud-Dienst; bei echten Kundenmails deshalb ohne Entwurf starten.

**Was passiert, wenn Ollama aus ist oder Unsinn antwortet?**
Die Nachricht gilt als „unklar“ und geht zur Freigabe an dich. `test/bridge-test.sh` prüft genau das, auch mit einem Modell, das absichtlich falsch versteht.

**Warum ist bei `frage` alles auf Stufe Lehrling?**
Weil für dieses Modell noch keine bestandene Prüfung gespeichert ist. Erst `pruefung` laufen lassen. Ein Modellwechsel braucht eine neue Prüfung.

**Warum verstehen Modell und feste Muster beide?**
Das Modell liest Dialekt und Ironie. Die festen Muster sichern ab: Erkennen sie Geld, Gesundheit, Rabatt oder Gefahr, gilt das immer. Verstehen beide die Nachricht unterschiedlich, handelt der Geselle nicht allein.

**Wo liegt das Berichtsheft, und was ist, wenn es kaputt ist?**
In der Datei, die du mit `--heft` angibst (eine Zeile je Vorgang). `heft-pruefen` zeigt, ob jemand etwas geändert hat. Ist die Kette gebrochen, hängt `frage` nichts mehr an, bis du das klärst.

**Die Mail wurde nicht bewertet, was nun?**
`postfach.log` ansehen. Häufig: falsches App-Passwort, Label falsch geschrieben (Groß- und Kleinschreibung), `OLLAMA_URL` in der geplanten Aufgabe nicht gesetzt. Eine Mail wird erst als gelesen markiert, wenn die Meldung durch ist.

**Kann ich die Demo auf Englisch haben?**
Noch nicht. Claude Code kann die Texte in `src/app.js` und `src/engine.js` übersetzen; die Prüfungsfälle müssen dann mit.

**Einen eigenen Betrieb anlegen?**
In `src/engine.js` ein Objekt nach dem Muster von `ELEKTRO` (Stammdaten, `skills`, `meistersache`, `ereignisse`, `pruefung`) und in `BETRIEBE` eintragen. In `src/app.js` `VORLAUF`, `KURZ` und `BEISPIELE` ergänzen. Dann `node build.js && node test/run.js`.

**Warum wurden Claude-Modelle geprüft und nicht qwen3:8b?**
In der Umgebung, in der Geselle gebaut wurde, gibt es kein Ollama und keine GPU. Die Claude-Aufnahme zeigt, dass Prompt, Auswertung und Absicherung mit echten Modellen funktionieren, und hat einen echten Fehler gefunden (Personalfragen). Was auf deinem Rechner selbstständig laufen darf, entscheidet trotzdem nur die Prüfung mit dem Modell, das dort läuft.

**Kann ich eine eigene Aufnahme ergänzen?**
Ja. `node test/echte-modelle/prompts-export.js` schreibt die Prompts nach `test/echte-modelle/prompts.json`. Antworten als JSON-Objekt `{schlüssel: rohtext}` unter `test/echte-modelle/antworten-<name>.json` ablegen, dann `abspielen.sh`. Für die Demo zusätzlich `<name>` in `build.js` und `PRUEFLINGE` in `src/app.js` eintragen.
