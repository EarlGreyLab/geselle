#!/usr/bin/env python3
"""Geselle-Postfach: liest neue E-Mails, lässt sie vom Gesellen bewerten und meldet das Ergebnis per Telegram.

Der Geselle schreibt dabei KEINE Antwort-Mails. Er liest mit, entscheidet nach Lehrvertrag und führt
das Berichtsheft. Antworten verschickst du selbst. Das ist die Stufe „Mitlesen“ aus dem Pilotplan.

Nur Python-Standardbibliothek. Zugangsdaten kommen aus Umgebungsvariablen, nie aus dem Code:
  GESELLE_IMAP_HOST   (Standard imap.gmail.com)
  GESELLE_IMAP_USER   E-Mail-Adresse
  GESELLE_IMAP_PW     App-Passwort, nicht das normale Passwort
  GESELLE_LABEL       Ordner oder Gmail-Label (Standard INBOX)
  TELEGRAM_TOKEN, TELEGRAM_CHAT   für die Meldung an dich
  OLLAMA_URL, OLLAMA_MODEL        werden an den Gesellen durchgereicht

Aufruf:
  python3 bridge/postfach.py --betrieb baeckerei --heft heft.jsonl
  python3 bridge/postfach.py --ordner testmails --trocken     (liest .eml-Dateien, schreibt nur ins Terminal)
Optionen: --mit-entwurf  (Telegram-Meldung enthält auch den Antwortentwurf; Standard: nur die Zusammenfassung)
"""
import argparse
import email
import imaplib
import json
import os
import re
import subprocess
import sys
import urllib.parse
import urllib.request
from email.header import decode_header, make_header
from email.utils import parseaddr

HIER = os.path.dirname(os.path.abspath(__file__))
GESELLE = os.path.join(HIER, "geselle.js")
MARKE = {"selbst": "Selbst erledigt", "freigabe": "Wartet auf dich", "meister": "Meistersache", "abgewehrt": "Abgewehrt"}


def text_der_mail(msg):
    teile = msg.walk() if msg.is_multipart() else [msg]
    plain, html = "", ""
    for p in teile:
        if p.get_content_maintype() == "multipart" or p.get("Content-Disposition", "").startswith("attachment"):
            continue
        roh = p.get_payload(decode=True)
        if not roh:
            continue
        t = roh.decode(p.get_content_charset() or "utf-8", errors="ignore")
        if p.get_content_type() == "text/plain":
            plain += t
        elif p.get_content_type() == "text/html":
            html += re.sub(r"<[^>]+>", " ", t)
    text = plain or html
    # zitierten Verlauf abschneiden, damit nur die neue Nachricht bewertet wird
    text = re.split(r"\n(?:Am .{5,80} schrieb|On .{5,80} wrote|-----\s*Original)", text)[0]
    return re.sub(r"\s+", " ", text).strip()[:2000]


def absender_name(msg):
    name, adresse = parseaddr(str(make_header(decode_header(msg.get("From", "")))))
    return name or adresse or "unbekannt"


def frage_geselle(text, absender, args):
    befehl = ["node", GESELLE, "frage", text, "--betrieb", args.betrieb, "--rolle", "kunde",
              "--absender", absender, "--kanal", "E-Mail", "--json"]
    if args.heft:
        befehl += ["--heft", args.heft]
    if args.vertrag:
        befehl += ["--vertrag", args.vertrag]
    erg = subprocess.run(befehl, capture_output=True, text=True, timeout=300)
    if erg.returncode != 0:
        raise RuntimeError(erg.stderr.strip() or "Geselle ohne Antwort")
    return json.loads(erg.stdout.strip().splitlines()[-1])


def meldung(r, absender, betreff, mit_entwurf):
    zeilen = [f"{MARKE.get(r['entscheidung'], r['entscheidung'])} · {r['zusammenfassung']}",
              f"Von: {absender}", f"Betreff: {betreff}"]
    if r.get("hinweis"):
        zeilen.append(f"Achtung: {r['hinweis']}")
    if r.get("gruende"):
        zeilen.append("Grund: " + r["gruende"][0])
    if mit_entwurf and r.get("entwurf"):
        zeilen += ["", "Entwurf:", r["entwurf"]]
    if r.get("heftNr"):
        zeilen.append(f"Berichtsheft Nr. {r['heftNr']}")
    return "\n".join(zeilen)


def telegram(text):
    token, chat = os.environ.get("TELEGRAM_TOKEN"), os.environ.get("TELEGRAM_CHAT")
    if not token or not chat:
        raise RuntimeError("TELEGRAM_TOKEN oder TELEGRAM_CHAT fehlt. Zum Testen --trocken nutzen.")
    daten = urllib.parse.urlencode({"chat_id": chat, "text": text[:4000], "disable_web_page_preview": "true"}).encode()
    urllib.request.urlopen(f"https://api.telegram.org/bot{token}/sendMessage", data=daten, timeout=30)


def mails_aus_ordner(ordner):
    gesehen_datei = os.path.join(ordner, ".gesehen")
    gesehen = set(open(gesehen_datei, encoding="utf-8").read().split("\n")) if os.path.exists(gesehen_datei) else set()
    for name in sorted(os.listdir(ordner)):
        if not name.endswith(".eml") or name in gesehen:
            continue
        with open(os.path.join(ordner, name), "rb") as f:
            yield email.message_from_bytes(f.read())
        with open(gesehen_datei, "a", encoding="utf-8") as f:
            f.write(name + "\n")


def mails_aus_imap():
    user, pw = os.environ.get("GESELLE_IMAP_USER"), os.environ.get("GESELLE_IMAP_PW")
    if not user or not pw:
        raise RuntimeError("GESELLE_IMAP_USER und GESELLE_IMAP_PW setzen (App-Passwort).")
    box = imaplib.IMAP4_SSL(os.environ.get("GESELLE_IMAP_HOST", "imap.gmail.com"))
    box.login(user, pw)
    status, _ = box.select('"' + os.environ.get("GESELLE_LABEL", "INBOX") + '"')
    if status != "OK":
        raise RuntimeError("Ordner oder Label nicht gefunden: " + os.environ.get("GESELLE_LABEL", "INBOX"))
    _, ids = box.search(None, "UNSEEN")
    try:
        for mid in ids[0].split():
            _, roh = box.fetch(mid, "(BODY.PEEK[])")  # PEEK: noch nicht als gelesen markieren
            yield email.message_from_bytes(roh[0][1])
            box.store(mid, "+FLAGS", "\\Seen")  # erst nach erfolgreicher Meldung
    finally:
        box.logout()


def main():
    ap = argparse.ArgumentParser(description="Geselle liest E-Mails mit und meldet per Telegram.")
    ap.add_argument("--betrieb", default="baeckerei")
    ap.add_argument("--heft", default="heft.jsonl")
    ap.add_argument("--vertrag")
    ap.add_argument("--ordner", help="statt IMAP: Ordner mit .eml-Dateien")
    ap.add_argument("--trocken", action="store_true", help="nur anzeigen, nichts an Telegram")
    ap.add_argument("--mit-entwurf", action="store_true")
    args = ap.parse_args()

    quelle = mails_aus_ordner(args.ordner) if args.ordner else mails_aus_imap()
    anzahl = 0
    for msg in quelle:
        betreff = str(make_header(decode_header(msg.get("Subject", ""))))
        absender = absender_name(msg)
        text = text_der_mail(msg)
        if not text:
            continue
        try:
            r = frage_geselle((betreff + ". " + text) if betreff else text, absender, args)
            nachricht = meldung(r, absender, betreff, args.mit_entwurf)
        except Exception as e:  # nie still scheitern: jede Mail landet bei dir
            nachricht = f"Wartet auf dich · Bewertung fehlgeschlagen\nVon: {absender}\nBetreff: {betreff}\nFehler: {e}"
        anzahl += 1
        if args.trocken:
            print(nachricht + "\n" + "-" * 40)
        else:
            telegram(nachricht)
    if args.trocken:
        print(f"{anzahl} Mail(s) bewertet.")


if __name__ == "__main__":
    try:
        main()
    except Exception as e:
        print("Fehler:", e, file=sys.stderr)
        sys.exit(1)
