const E = require('../src/engine.js');
const crypto = require('crypto');
let bad = 0;
for (const s of ['', 'abc', 'Bäckerei Mustermann – 20 × Brötchen €', 'x'.repeat(1000), '😀 Öcher Puffel']) {
  const a = E.sha256(s), b = crypto.createHash('sha256').update(s, 'utf8').digest('hex');
  if (a !== b) { bad++; console.log('SHA MISMATCH', JSON.stringify(s.slice(0,20))); }
}
console.log('sha256 ok:', bad === 0);
for (const id of Object.keys(E.BETRIEBE)) {
  const B = E.BETRIEBE[id], V = E.standardVertrag(B);
  console.log('\n=== ' + B.name + ' ===');
  for (const ev of B.ereignisse) {
    if (ev.system) { console.log(ev.zeit, '[system]', ev.text); continue; }
    const r = E.bearbeite(ev, B, V, E.zuMin(ev.zeit));
    console.log(ev.zeit, '|', r.intent, '|', r.entscheidung, '|', r.aktion, '|', r.wert, '|', r.ort, '|', r.kostenCt.toFixed(3) + 'ct', '|', r.minuten + 'min', '|', r.zusammenfassung);
    if (process.argv.includes('-v')) { r.schritte.forEach(s => console.log('     ', s.ok ? '✓' : '✗', s.t + ':', s.text)); console.log('      >>', r.antwort.replace(/\n/g, ' ⏎ ')); }
  }
  const P = E.pruefung(B);
  console.log('Prüfung:', P.ok + '/' + P.n);
  for (const k of Object.keys(P.proSkill)) { const s = P.proSkill[k]; console.log('  ', k, s.ok + '/' + s.n, 'kritisch verfehlt', s.kritischVerfehlt, '→', s.erlaubt); }
  P.faelle.filter(f => !f.bestanden).forEach(f => console.log('   FAIL #' + f.nr, '[' + f.skill + ']', f.text, '→', f.fehler.join('; '), f.kritischVerfehlt ? '(KRITISCH)' : ''));
}
