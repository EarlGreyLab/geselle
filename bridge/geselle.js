#!/usr/bin/env node
/* Geselle auf dem eigenen Rechner: Verstehen über Ollama, Entscheiden nach Lehrvertrag, Berichtsheft als Datei.
   Node 18 oder neuer, keine Pakete nötig.

   node bridge/geselle.js frage "Text der Nachricht" [--betrieb baeckerei] [--rolle kunde] [--absender "Frau K."] [--kanal E-Mail] [--uhr 10:00] [--heft heft.jsonl] [--json]
   node bridge/geselle.js pruefung [--betrieb baeckerei|elektro|physio|alle]
   node bridge/geselle.js heft-pruefen heft.jsonl
   Gemeinsame Optionen: --url http://localhost:11434  --modell qwen3:8b  --ohne-modell  --vertrag lehrvertrag.json
*/
'use strict';
const fs = require('fs');
const path = require('path');
const E = require(path.join(__dirname, '..', 'src', 'engine.js'));

function optionen(argv) {
  const o = { _: [] };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a.startsWith('--')) {
      const k = a.slice(2), n = argv[i + 1];
      if (n === undefined || n.startsWith('--')) o[k] = true; else { o[k] = n; i++; }
    } else o._.push(a);
  }
  return o;
}
const O = optionen(process.argv.slice(2));
const URL_OLLAMA = String(O.url || process.env.OLLAMA_URL || 'http://localhost:11434').replace(/\/+$/, '');
const MODELL = String(O.modell || process.env.OLLAMA_MODEL || 'qwen3:8b');
const OHNE_MODELL = !!O['ohne-modell'];

function fehler(text, code) { process.stderr.write('Fehler: ' + text + '\n'); process.exit(code || 1); }
function betriebWaehlen(id) {
  const b = E.BETRIEBE[id || 'baeckerei'];
  if (!b) fehler('Unbekannter Betrieb „' + id + '“. Möglich: ' + Object.keys(E.BETRIEBE).join(', '));
  return b;
}

async function ollama(prompt) {
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), 180000);
  try {
    const r = await fetch(URL_OLLAMA + '/api/generate', {
      method: 'POST', headers: { 'Content-Type': 'application/json' }, signal: ctrl.signal,
      body: JSON.stringify({ model: MODELL, prompt, stream: false, format: 'json', think: false, options: { temperature: 0, num_ctx: 4096 } })
    });
    if (!r.ok) {
      const txt = await r.text().catch(() => '');
      throw new Error('Ollama antwortet mit ' + r.status + (/not found/i.test(txt) ? ' – Modell „' + MODELL + '“ fehlt, erst: ollama pull ' + MODELL : ''));
    }
    const j = await r.json();
    return j.response || '';
  } catch (e) {
    if (e.name === 'AbortError') throw new Error('Ollama hat nach 180 Sekunden nicht geantwortet');
    if (e.cause && e.cause.code === 'ECONNREFUSED') throw new Error('Ollama ist unter ' + URL_OLLAMA + ' nicht erreichbar. Läuft „ollama serve“? Stimmt OLLAMA_URL?');
    throw e;
  } finally { clearTimeout(t); }
}

/* Versteht eine Nachricht. Bei Modellfehlern nie raten: „unklar“ geht immer an den Meister. */
async function verstehen(msg, betrieb, uhrMin) {
  if (OHNE_MODELL || !E.braeuchteModell(msg)) return { u: null, hinweis: '' };
  try {
    const roh = await ollama(E.llmPrompt(msg, betrieb, uhrMin));
    return { u: E.llmParse(roh, msg, betrieb), hinweis: '' };
  } catch (e) {
    const unklar = { intent: 'unklar', konfidenz: 0, items: [], produktUnklar: false, datum: null, uhrzeit: null, sterne: null, beleg: null, quelle: 'Sprachmodell (Fehler)', merkmale: {} };
    return { u: unklar, hinweis: e.message };
  }
}

function vertragLaden(betrieb) {
  const v = E.standardVertrag(betrieb);
  if (O.vertrag) {
    let j;
    try { j = JSON.parse(fs.readFileSync(O.vertrag, 'utf8')); } catch (e) { fehler('Lehrvertrag „' + O.vertrag + '“ nicht lesbar: ' + e.message); }
    if (j.faehigkeiten) Object.keys(j.faehigkeiten).forEach(k => { if (v.faehigkeiten[k]) Object.assign(v.faehigkeiten[k], j.faehigkeiten[k]); });
    if (j.datenwege) Object.assign(v.datenwege, j.datenwege);
    if (typeof j.sicherheitsschwelle === 'number') v.schwelleSicherheit = j.sicherheitsschwelle;
  }
  // Auf dem eigenen Rechner gibt es nur Ollama: Jede Datenklasse wird lokal verarbeitet, keine Kosten je Vorgang
  Object.keys(v.datenwege).forEach(k => { v.datenwege[k] = 'lokal'; });
  // Stufen deckeln: ohne bestandene Modell-Prüfung bleibt alles auf Lehrling (Mitlesen)
  const datei = pruefDatei(betrieb);
  let ergebnis = null;
  if (!OHNE_MODELL && fs.existsSync(datei)) { try { ergebnis = JSON.parse(fs.readFileSync(datei, 'utf8')); } catch (e) { ergebnis = null; } }
  if (ergebnis && ergebnis.modell !== MODELL) ergebnis = null;
  const quelle = OHNE_MODELL ? E.pruefung(betrieb) : ergebnis;
  Object.keys(v.faehigkeiten).forEach(k => {
    const erlaubt = quelle ? E.erlaubteStufe(quelle, k) : 'lehrling';
    if (E.stufenRang(v.faehigkeiten[k].stufe) > E.stufenRang(erlaubt)) v.faehigkeiten[k].stufe = erlaubt;
  });
  return { v, mitPruefung: !!quelle };
}
function pruefDatei(betrieb) { return path.resolve('pruefung-' + betrieb.id + '.json'); }

function heftLesen(datei) {
  if (!fs.existsSync(datei)) return [];
  return fs.readFileSync(datei, 'utf8').split('\n').filter(Boolean).map((z, i) => {
    try { return JSON.parse(z); } catch (e) { fehler('Berichtsheft Zeile ' + (i + 1) + ' ist kein gültiges JSON'); }
  });
}

async function befehlFrage() {
  const text = O._.slice(1).join(' ').trim();
  if (!text) fehler('Nachricht fehlt. Beispiel: node bridge/geselle.js frage "Bitte 10 Brötchen für morgen 7 Uhr"');
  const b = betriebWaehlen(O.betrieb);
  const uhrMin = O.uhr ? E.zuMin(O.uhr) : (() => { const d = new Date(); return d.getHours() * 60 + d.getMinutes(); })();
  const msg = { text, rolle: String(O.rolle || 'kunde'), absender: String(O.absender || 'unbekannt'), kanal: String(O.kanal || 'Kommandozeile') };
  const { v, mitPruefung } = vertragLaden(b);
  const { u, hinweis } = await verstehen(msg, b, uhrMin);
  const r = E.bearbeite(msg, b, v, uhrMin, u);
  let heftZeile = null;
  if (O.heft) {
    const heft = heftLesen(O.heft);
    const chk = E.heftPruefen(heft);
    if (!chk.ok) fehler('Berichtsheft ist beschädigt (Zeile ' + chk.nr + ': ' + chk.grund + '). Nichts angehängt.');
    const vorher = heft.length;
    const skill = b.skills.find(s => s.id === r.skill);
    heftZeile = E.heftAnhaengen(heft, { zeit: new Date().toISOString(), art: 'Vorgang', bezug: null, kanal: msg.kanal, absender: msg.absender, faehigkeit: skill ? skill.name : (r.skill === 'waechter' ? 'Wächter' : '–'), verstanden: r.verstanden, entscheidung: r.entscheidung, gruende: r.gruende.slice(0, 3), ausgefuehrt: r.entscheidung === 'selbst' ? 'Geselle' : (r.entscheidung === 'abgewehrt' ? 'Wächter' : 'noch offen'), ort: r.ort, kostenCt: r.kostenCt, minuten: r.minuten });
    fs.appendFileSync(O.heft, JSON.stringify(heft[vorher]) + '\n');
  }
  const aus = { betrieb: b.id, modell: OHNE_MODELL ? null : MODELL, quelle: r.quelle, hinweis, mitPruefung, intent: r.intent, entscheidung: r.entscheidung, aktion: r.aktion, wert: r.wert, zusammenfassung: r.zusammenfassung, verstanden: r.verstanden, gruende: r.gruende, schritte: r.schritte, entwurf: r.antwort, sofort: r.sofort || null, heftNr: heftZeile ? heftZeile.nr : null, heftHash: heftZeile ? heftZeile.hash : null };
  if (O.json) { process.stdout.write(JSON.stringify(aus) + '\n'); return; }
  const marke = { selbst: 'SELBST ERLEDIGT', freigabe: 'WARTET AUF FREIGABE', meister: 'MEISTERSACHE', abgewehrt: 'ABGEWEHRT' }[r.entscheidung];
  console.log('\n' + marke + ' · ' + r.zusammenfassung);
  console.log('Verstanden von: ' + (OHNE_MODELL ? 'Schlüsselwörtern' : (u ? 'Ollama, ' + MODELL : 'festen Regeln (Beleg, Bewertung oder Wächter)')));
  if (hinweis) console.log('Achtung: ' + hinweis + ' → an dich weitergeleitet');
  if (!mitPruefung) console.log('Hinweis: Noch keine Modell-Prüfung für ' + MODELL + ' gespeichert, deshalb alles auf Stufe Lehrling. Erst: node bridge/geselle.js pruefung --betrieb ' + b.id);
  console.log('');
  r.schritte.forEach(s => console.log((s.ok ? '  ✓ ' : '  ! ') + s.t.padEnd(13) + s.text));
  if (r.antwort) console.log('\nEntwurf:\n' + r.antwort.split('\n').map(z => '  ' + z).join('\n'));
  if (heftZeile) console.log('\nBerichtsheft Nr. ' + heftZeile.nr + ' · ' + heftZeile.hash.slice(0, 16));
  console.log('');
}

async function befehlPruefung() {
  const ids = (!O.betrieb || O.betrieb === 'alle') ? Object.keys(E.BETRIEBE) : [betriebWaehlen(O.betrieb).id];
  let alleOk = true;
  for (const id of ids) {
    const b = E.BETRIEBE[id];
    const ohne = E.pruefung(b);
    const extern = [];
    const fehlerListe = [];
    process.stdout.write('\n' + b.name + ' · ' + b.pruefung.length + ' Fälle mit ' + (OHNE_MODELL ? 'Schlüsselwörtern' : 'Ollama ' + MODELL) + '\n');
    for (let i = 0; i < b.pruefung.length; i++) {
      const c = b.pruefung[i];
      const msg = E.pruefungsNachricht(c);
      const { u, hinweis } = await verstehen(msg, b, E.pruefungsUhr(c));
      extern.push(u);
      if (hinweis) fehlerListe.push('Fall ' + (i + 1) + ': ' + hinweis);
      process.stdout.write(u && u.quelle === 'Sprachmodell (Fehler)' ? 'x' : '.');
    }
    const mit = OHNE_MODELL ? ohne : E.pruefungMit(b, extern);
    process.stdout.write('\n\nErgebnis: ' + mit.ok + ' von ' + mit.n + ' bestanden (' + Math.round(mit.quote * 100) + ' %), kritische Fehler: ' + mit.kritischVerfehlt + '\n');
    if (!OHNE_MODELL) process.stdout.write('Zum Vergleich mit Schlüsselwörtern: ' + ohne.ok + ' von ' + ohne.n + '\n');
    Object.keys(mit.proSkill).forEach(k => {
      const s = mit.proSkill[k];
      process.stdout.write('  ' + k.padEnd(12) + String(s.ok + '/' + s.n).padStart(6) + '   höchstens ' + E.STUFEN_NAME[s.erlaubt] + (s.kritischVerfehlt ? '   (' + s.kritischVerfehlt + ' kritisch)' : '') + '\n');
    });
    mit.faelle.filter(f => !f.bestanden).forEach(f => process.stdout.write('  ✗ Fall ' + f.nr + (f.kritischVerfehlt ? ' KRITISCH' : '') + ': ' + f.text + '\n      ' + f.fehler.join('; ') + '\n'));
    if (fehlerListe.length) { process.stdout.write('Modellfehler (als unklar gewertet):\n'); fehlerListe.slice(0, 5).forEach(z => process.stdout.write('  ' + z + '\n')); }
    if (!OHNE_MODELL) {
      const speichern = { betrieb: b.id, modell: MODELL, datum: new Date().toISOString(), n: mit.n, ok: mit.ok, quote: mit.quote, kritischVerfehlt: mit.kritischVerfehlt, proSkill: mit.proSkill };
      fs.writeFileSync(pruefDatei(b), JSON.stringify(speichern, null, 2));
      process.stdout.write('Gespeichert: ' + pruefDatei(b) + ' (deckelt die Stufen bei „frage“)\n');
    }
    const tor = mit.quote >= 0.9 && mit.kritischVerfehlt === 0;
    process.stdout.write(tor ? 'Tor 2 erreicht: mindestens 90 % und kein kritischer Fehler.\n' : 'Tor 2 noch nicht erreicht: Ziel sind mindestens 90 % ohne kritischen Fehler.\n');
    if (!tor) alleOk = false;
  }
  process.exit(alleOk ? 0 : 2);
}

function befehlHeftPruefen() {
  const datei = O._[1] || O.heft;
  if (!datei) fehler('Datei fehlt. Beispiel: node bridge/geselle.js heft-pruefen heft.jsonl');
  if (!fs.existsSync(datei)) fehler('Datei „' + datei + '“ gibt es nicht');
  const heft = heftLesen(datei);
  const chk = E.heftPruefen(heft);
  if (chk.ok) console.log('Kette unversehrt: ' + chk.zeilen + ' Zeilen, letzter Fingerabdruck ' + chk.letzter);
  else { console.log('KETTE GEBROCHEN in Zeile ' + chk.nr + ': ' + chk.grund); process.exit(3); }
}

const befehl = O._[0];
(async () => {
  if (befehl === 'frage') await befehlFrage();
  else if (befehl === 'pruefung') await befehlPruefung();
  else if (befehl === 'heft-pruefen') befehlHeftPruefen();
  else {
    console.log('Befehle:\n  frage "Nachricht" [--betrieb baeckerei] [--rolle kunde|mitarbeiter|unbekannt] [--heft heft.jsonl] [--json]\n  pruefung [--betrieb alle|baeckerei|elektro|physio]\n  heft-pruefen heft.jsonl\nOptionen: --url ' + URL_OLLAMA + '  --modell ' + MODELL + '  --ohne-modell  --vertrag lehrvertrag.json');
    process.exit(befehl ? 1 : 0);
  }
})().catch(e => fehler(e.message));
