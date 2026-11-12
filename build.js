const fs = require('fs');
const r = f => fs.readFileSync(__dirname + '/src/' + f, 'utf8');
let html = r('index.tpl.html');
for (const [k, f] of [['/*STYLE*/', 'style.css'], ['/*ENGINE*/', 'engine.js'], ['/*APP*/', 'app.js']]) {
  let c = r(f);
  if (f === 'app.js') {
    // Aufgezeichnete Rohantworten echter Modelle (test/echte-modelle), damit die Seite die Prüfung damit nachrechnen kann
    const auf = {};
    for (const n of ['haiku', 'sonnet']) auf[n] = JSON.parse(fs.readFileSync(__dirname + '/test/echte-modelle/antworten-' + n + '.json', 'utf8'));
    c = 'window.GESELLE_AUFNAHMEN = ' + JSON.stringify(auf).replace(/</g, '\\u003c') + ';\n' + c;
  }
  if (c.includes('</script')) throw new Error('script end tag inside ' + f);
  html = html.split(k).join(c);
}
fs.mkdirSync(__dirname + '/dist', { recursive: true });
fs.writeFileSync(__dirname + '/dist/index.html', html);
console.log('dist/index.html', (html.length / 1024).toFixed(1) + ' KB');
