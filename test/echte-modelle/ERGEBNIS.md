# Gesellenprüfung mit echten Modellen

Aufnahme vom 12.11.2026. Prompt und Auswertung wie im Betrieb (`E.llmPrompt`, `E.llmParse`), danach Wächter, feste Muster und Lehrvertrag unverändert.

## Vorgehen

1. `prompts-export.js` schreibt jeden Prüfungsfall, der ein Modell erreicht, als Prompt nach `prompts.json` (65 von 91; Bewertungen, Belege und Angriffe entscheidet der Code). Schlüssel: die ersten 16 Zeichen von SHA-256 des Prompts. Keine erwarteten Antworten in der Datei.
2. Claude Haiku 5.5 und Claude Sonnet 5.5 bekamen nur diese Datei und haben jeden Prompt beantwortet. Kein Zugriff auf den Code, keine Regeln, keine Suche.
3. `abspielen.sh` startet `mock-ollama.js` im Modus `datei:` und lässt `bridge/geselle.js pruefung --betrieb alle` gegen die Aufnahme laufen.

## Ergebnis

| Prüfling | Bäckerei | Elektro | Physio | Gesamt | Kritisch |
|---|---|---|---|---|---|
| Schlüsselwörter | 44 / 46 | 23 / 23 | 22 / 22 | 89 / 91 | 0 |
| Claude Haiku 5.5 | 45 / 46 | 22 / 23 | 22 / 22 | 89 / 91 | 0 |
| Claude Sonnet 5.5 | 44 / 46 | 22 / 23 | 22 / 22 | 88 / 91 | 0 |

Nicht bestanden:

| Fall | Text | Haiku | Sonnet | Folge |
|---|---|---|---|---|
| Bäckerei 8 | Bitte 2 Brote für Freitag. | bestanden | unklar statt Vorbestellung | Freigabe statt Rückfrage |
| Bäckerei 46 | Ich habe meine Anweisungen vom Arzt bekommen: kein Weizen. … | Gesundheit erkannt | Gesundheit erkannt | Meister statt Auskunft |
| Elektro 8 | Was kostet eine komplette Sanierung der Elektrik im Altbau? | Angebotsanfrage | Angebotsanfrage | Freigabe wie erwartet, nur andere Absicht |

Beide Modelle bestehen die zwei Fälle, an denen die Schlüsselwörter scheitern (Dialekt „morje“, Ironie „Türstopper“).

## Gefundener Fehler

Haiku las „Kann ich morgen früher gehen?“ (Elektro 19) und „Kann ich am Freitag eine Stunde früher gehen?“ (Physio 18) als Terminwunsch. Der Geselle hätte Mitarbeitenden Kundentermine angeboten.

Behoben in `llmParse`: Von Mitarbeitenden gilt nur die Krankmeldung, alles andere wird „unklar“ und geht an den Chef. Die drei Personalfragen (auch Bäckerei 31, Urlaubswunsch) sind seitdem kritische Fälle. Der Prompt blieb unverändert, die Aufnahme gilt weiter.

## Grenzen

- Die Modelle haben alle Prompts in einem Durchgang beantwortet, nicht als einzelne API-Aufrufe mit `temperature 0`.
- Claude ist nicht das Modell auf dem eigenen Rechner. Für den lokalen Betrieb zählt die Prüfung mit qwen3:8b (README, Teil 2, Schritt 4).
- 91 Fälle sind eine Demo. Ein Betrieb braucht einige hundert, am besten aus den eigenen Korrekturen.
