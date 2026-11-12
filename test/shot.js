const { chromium } = require('/opt/npm-tools/node_modules/playwright');
(async () => {
  const browser = await chromium.launch({ executablePath: '/usr/bin/google-chrome', args: ['--no-sandbox'] });
  const errors = [];
  const run = async (name, opts, steps) => {
    const ctx = await browser.newContext(opts);
    const page = await ctx.newPage();
    page.on('pageerror', e => errors.push(name + ': ' + e.message));
    page.on('console', m => { if (m.type() === 'error' && !/fonts\.g|ERR_|Failed to load resource/.test(m.text())) errors.push(name + ' console: ' + m.text()); });
    await page.goto('file://' + __dirname + '/../dist/index.html' + (opts.hash || ''), { waitUntil: 'domcontentloaded' });
    await page.waitForTimeout(400);
    if (steps) await steps(page);
    await page.screenshot({ path: __dirname + '/' + name + '.png', fullPage: !!opts.full });
    const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
    console.log(name, 'h-overflow px:', overflow);
    await ctx.close();
  };
  const which = process.argv[2] || 'all';
  const D = { viewport: { width: 1280, height: 860 } };
  if (which === 'all' || which === 'heute') await run('heute', { ...D, full: true });
  if (which === 'all' || which === 'tag') await run('tag', { ...D, full: true }, async p => {
    for (let i = 0; i < 12; i++) { const b = p.locator('[data-akt="weiter"]'); if (await b.isDisabled()) break; await b.click(); }
    await p.fill('#test-text', 'Für Samstag bitte 12 Brötchen und 2 Croissants, Abholung 8 Uhr.'); await p.click('[data-akt="test"]');
    await p.locator('[data-akt="frei"]').first().click();
  });
  for (const v of ['lehrvertrag', 'pruefung', 'backzettel', 'berichtsheft', 'wirkung', 'bauplan']) if (which === 'all' || which === v) await run(v, { ...D, full: true, hash: '#' + v }, v === 'berichtsheft' ? async p => { await p.click('[data-akt="heft-faelschen"]'); await p.click('[data-akt="heft-pruefen"]'); } : null);
  if (which === 'all' || which === 'mobil') await run('mobil', { viewport: { width: 390, height: 800 }, full: true });
  if (which === 'all' || which === 'dunkel') await run('dunkel', { ...D, colorScheme: 'dark' });
  if (which === 'all' || which === 'physio') await run('physio', { ...D, full: true }, async p => { await p.click('[data-akt="betrieb"][data-id="physio"]'); for (let i = 0; i < 9; i++) { const b = p.locator('[data-akt="weiter"]'); if (await b.isDisabled()) break; await b.click(); } });
  console.log(errors.length ? 'ERRORS:\n' + errors.join('\n') : 'no js errors');
  await browser.close();
})();
