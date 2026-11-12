const E = require(require('path').join(__dirname, '..', '..', 'src', 'engine.js'));
const out = [];
for (const id of Object.keys(E.BETRIEBE)) {
  const b = E.BETRIEBE[id];
  b.pruefung.forEach((c, i) => {
    const msg = E.pruefungsNachricht(c);
    if (!E.braeuchteModell(msg)) return;
    const prompt = E.llmPrompt(msg, b, E.pruefungsUhr(c));
    out.push({ key: E.sha256(prompt).slice(0, 16), prompt });
  });
}
// gemischt, damit die Reihenfolge nichts verrät
out.sort((a, b) => a.key < b.key ? -1 : 1);
require('fs').writeFileSync(require('path').join(__dirname, 'prompts.json'), JSON.stringify(out, null, 1));
console.log(out.length, 'Prompts');
