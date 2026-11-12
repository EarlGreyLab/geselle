#!/usr/bin/env node
/* Attrappe für Ollama, nur zum Testen der Kette. Kein echtes Sprachmodell.
   node test/mock-ollama.js <port> <modus>
   modus: echo  = antwortet mit dem, was die Schlüsselwort-Logik versteht
          klug  = wie echo, versteht zusätzlich Dialekt und Ironie (simuliert ein gutes Modell)
          muell = antwortet mit unbrauchbarem Text
          falsch = antwortet absichtlich falsch: alles ist eine harmlose Frage mit hoher Sicherheit
          datei:<pfad> = spielt aufgezeichnete Antworten eines echten Modells ab
                         (JSON-Objekt: erste 16 Zeichen von sha256(prompt) -> Rohtext der Antwort) */
'use strict';
const http = require('http');
const path = require('path');
const E = require(path.join(__dirname, '..', 'src', 'engine.js'));
const port = +process.argv[2] || 11999;
const modus = process.argv[3] || 'echo';
const fs = require('fs');
const aufnahme = modus.startsWith('datei:') ? JSON.parse(fs.readFileSync(modus.slice(6), 'utf8')) : null;
let fehlend = 0;

function ausPrompt(prompt) {
  const text = (prompt.match(/Nachricht:\n"""([\s\S]*)"""$/) || [])[1] || '';
  const rolle = (prompt.match(/Absender-Rolle: ([a-z]+)\./) || [])[1] || 'kunde';
  const name = (prompt.match(/für den Betrieb "([^"]+)"/) || [])[1];
  const b = Object.values(E.BETRIEBE).find(x => x.name === name) || E.BETRIEBE.baeckerei;
  return { text, rolle, b };
}
function antwort(prompt) {
  if (aufnahme) {
    const k = E.sha256(prompt).slice(0, 16);
    if (!(k in aufnahme)) { fehlend++; process.stderr.write('keine Aufnahme für ' + k + ' (' + fehlend + ')\n'); return ''; }
    return String(aufnahme[k]);
  }
  if (modus === 'muell') return 'Leider kann ich das nicht beantworten.';
  const { text, rolle, b } = ausPrompt(prompt);
  if (modus === 'falsch') return JSON.stringify({ intent: 'auskunft', konfidenz: 0.95, items: [], tage: null, uhrzeit: null, erstattung: false, gesundheit: false, schwereAllergie: false, rabatt: false, lieferung: false, absage: false, verlegen: false, recht: false });
  const u = E.verstehen({ text, rolle }, b);
  const j = { intent: u.intent, konfidenz: u.konfidenz, items: u.items.filter(x => x.id).map(x => ({ id: x.id, menge: x.menge })), tage: u.datum ? u.datum.tage : null, uhrzeit: u.uhrzeit == null ? null : E.zuUhr(u.uhrzeit) };
  Object.assign(j, u.merkmale);
  if (modus === 'klug') {
    if (/morje/.test(text)) Object.assign(j, { intent: 'bestellung', konfidenz: 0.9, items: [{ id: 'broetchen', menge: 10 }, { id: 'roggen', menge: 2 }], tage: 1 });
    if (/türstopper/i.test(text)) Object.assign(j, { intent: 'reklamation', konfidenz: 0.85 });
  }
  return JSON.stringify(j);
}
http.createServer((req, res) => {
  let body = '';
  req.on('data', d => { body += d; });
  req.on('end', () => {
    if (req.url !== '/api/generate') { res.writeHead(404); res.end('not found'); return; }
    let j; try { j = JSON.parse(body); } catch (e) { res.writeHead(400); res.end('bad json'); return; }
    if (j.model === 'gibtsnicht') { res.writeHead(404, { 'Content-Type': 'application/json' }); res.end('{"error":"model \\"gibtsnicht\\" not found, try pulling it first"}'); return; }
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ model: j.model, response: antwort(j.prompt), done: true }));
  });
}).listen(port, '127.0.0.1');
