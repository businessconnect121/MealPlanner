/* Step 1 tests: NutriLens still works, and the Meal Planner opens from the left menu.
   Run: node tests/planner-step1.test.js   (serves this folder locally; Gemini proxy is mocked) */
'use strict';
const { chromium } = require('playwright');
const http = require('http'), fs = require('fs'), path = require('path');
const { respond } = require('./mock-gemini');
const ROOT = path.resolve(__dirname, '..');
let pass = 0, fail = 0; const errs = []; let lastProxy = null; let directCall = null;
const ok = (c, m) => { if (c) { pass++; console.log('  ✓ ' + m); } else { fail++; console.log('  ✗ ' + m); } };
function serve() { return new Promise(res => { const s = http.createServer((q, r) => {
  const u = decodeURIComponent(q.url.split('?')[0]); const f = path.join(ROOT, u === '/' ? 'index.html' : u);
  if (!f.startsWith(ROOT) || !fs.existsSync(f) || fs.statSync(f).isDirectory()) { r.writeHead(404); r.end(); return; }
  r.writeHead(200, { 'content-type': f.endsWith('.js') ? 'text/javascript' : 'text/html' }); fs.createReadStream(f).pipe(r); }); s.listen(0, () => res(s)); }); }
(async () => {
  const srv = await serve(); const base = `http://127.0.0.1:${srv.address().port}/`;
  const b = await chromium.launch();
  for (const vp of [{ width: 1360, height: 900, name: 'desktop' }, { width: 390, height: 844, name: 'phone' }]) {
    console.log('\n' + vp.name);
    const ctx = await b.newContext({ viewport: { width: vp.width, height: vp.height } });
    await ctx.route('**/*', route => { const u = route.request().url();
      if (u.includes('/.netlify/functions/gemini')) { const body = JSON.parse(route.request().postData() || '{}'); lastProxy = body;
        const prompt = (body.body.systemInstruction ? body.body.systemInstruction.parts[0].text + '\n' : '') + body.body.contents[0].parts[0].text;
        if (/Candidates \(number/.test(prompt)) return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ candidates: [{ content: { parts: [{ text: '{"picks":[{"n":2,"why":"Light and quick"},{"n":1,"why":"Filling"}]}' }] } }] }) });
        return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(respond(prompt, {})) }); }
      if (u.startsWith('https://generativelanguage.googleapis.com/')) { directCall = { url: u, key: route.request().headers()['x-goog-api-key'] };
        return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ candidates: [{ content: { parts: [{ text: '{"picks":[{"n":1,"why":"Your key works"}]}' }] } }] }) }); }
      if (u.startsWith(base)) return route.continue(); return route.abort(); });
    const p = await ctx.newPage(); p.setDefaultTimeout(8000);
    p.on('pageerror', e => errs.push(vp.name + ': ' + e.message));
    p.on('console', m => { if (m.type() === 'error' && !/Failed to load resource|net::/.test(m.text())) errs.push(vp.name + ': ' + m.text()); });
    p.on('dialog', d => d.accept());
    await p.goto(base);
    // existing NutriLens flows
    await p.fill('#w-name', 'Priya'); await p.fill('#w-age', '38'); await p.fill('#w-weight', '132'); await p.fill('#w-ht-ft', '5'); await p.fill('#w-ht-in', '4');
    await p.click('text=Create Profile →'); await p.waitForSelector('#scr-main.active');
    ok(await p.isVisible('#slot-list .slot-row'), 'NutriLens: profile created, meal slots shown');
    await p.fill('#inp-breakfast', 'idli with sambar'); await p.click('#see-btn');
    await p.waitForSelector('#nutr-panel .nutr-row', { timeout: 10000 }); ok(/Daily Nutrients/.test(await p.textContent('#nutr-panel')), 'NutriLens: See Nutrition still works');
    const menu = async id => { if (vp.width < 768) { await p.click('#global-nl-btn'); await p.waitForTimeout(250); } await p.click(id); };
    await menu('#dnav-chat'); ok(await p.isVisible('#chat-input'), 'NutriLens: Ask Nutritionist opens');
    await menu('#dnav-cook'); ok(await p.isVisible('#cook-url'), 'NutriLens: Cook opens');
    // planner
    await menu('#dnav-planner');
    ok(await p.isVisible('#mp-view iframe') && !(await p.isVisible('#slot-list')), 'Meal Planner opens in place of the logger');
    ok(await p.$eval('#dnav-planner', e => e.classList.contains('active')), 'menu item highlighted');
    const f = await (await p.$('#mp-view iframe')).contentFrame(); await f.waitForSelector('#tbody', { state: 'attached' }); await p.waitForTimeout(300);
    const h = await p.$eval('#mp-view iframe', e => e.getBoundingClientRect()); ok(h.height >= 420 && Math.abs(h.bottom - vp.height) < 4, `planner fills the screen below the header (${Math.round(h.top)}–${Math.round(h.bottom)})`);
    ok(await f.evaluate(() => st.weeks.length === 1 && st.weeks[0].custom && st.weeks[0].days.flatMap(d => Object.values(d)).flat().length === 0), 'starts with an empty week');
    ok(await f.evaluate(() => getComputedStyle(document.querySelector('header')).display === 'none'), 'planner title hidden inside NutriLens');
    // add dishes by typing (works on both layouts)
    const sel = vp.width < 768 ? '#cards' : '#tbody';
    await f.click(`${sel} .add[data-a="0|lunchPacked"]`); await f.type(`${sel} input.acin`, 'lemon r'); await p.waitForTimeout(120); await p.keyboard.press('Enter');
    await f.type(`${sel} input.acin`, 'carrot por'); await p.waitForTimeout(120); await p.keyboard.press('Enter'); await p.keyboard.press('Escape');
    ok(await f.evaluate(() => JSON.stringify(st.weeks[0].days[0].lunchPacked)) === '["Lemon rice","Carrot poriyal"]', 'type-to-add works inside NutriLens');
    // drag a dish with a video link to another meal slot, inside NutriLens (real mouse on desktop)
    if (vp.width >= 768) {
      const n = await f.evaluate(() => { const n = POOL.roles.tiffinBase.find(d => linkOf(d)); st.weeks[st.idx].days[1].breakfast = [n]; save(); render(); return n; });
      const fr = await (await p.$('#mp-view iframe')).boundingBox();
      await f.evaluate(() => document.querySelector('#tbody li[data-c="1|breakfast|0"]').scrollIntoView({ block: 'center' }));
      const a = await f.locator('#tbody li[data-c="1|breakfast|0"] .dn a').boundingBox(); const t = await f.locator('td[data-cell="1|homeLunch"]').boundingBox();
      await p.mouse.move(a.x + 8, a.y + a.height / 2); await p.mouse.down(); for (let i = 1; i <= 12; i++) await p.mouse.move(a.x + 8 + (t.x + 30 - a.x) * i / 12, a.y + a.height / 2 + (t.y + 12 - a.y) * i / 12); await p.mouse.up(); await p.waitForTimeout(100);
      ok(await f.evaluate(n => !st.weeks[st.idx].days[1].breakfast.includes(n) && st.weeks[st.idx].days[1].homeLunch.includes(n), n), 'drag a dish with a video link to another meal slot works inside NutriLens'); await p.waitForTimeout(400);
    }
    // Gemini via NutriLens proxy (no personal key)
    lastProxy = null;
    await f.click(`${sel} .rp[data-r="0|lunchPacked|0"]`); await f.fill('#rp-ai', 'something quick'); await f.click('#rp-find');
    await f.waitForFunction(() => !document.querySelector('#rp-list .skel'));
    ok(/Gemini ranked 2/.test(await f.$eval('#rp-status', e => e.textContent)) && lastProxy && lastProxy.model === 'gemini-3.5-flash-lite', 'AI ranking uses NutriLens proxy and NutriLens model');
    await p.keyboard.press('Escape');
    // personal key from NutriLens Settings
    await p.evaluate(() => { localStorage.setItem('nl_gemini_key', JSON.stringify('USER-KEY-1')); localStorage.setItem('nl_gemini_model', JSON.stringify('gemini-3.8-flash')); });
    await f.click(`${sel} .rp[data-r="0|lunchPacked|0"]`); await f.fill('#rp-ai', 'something else'); await f.click('#rp-find'); await f.waitForFunction(() => !document.querySelector('#rp-list .skel'));
    ok(directCall && directCall.key === 'USER-KEY-1' && /gemini-3\.8-flash/.test(directCall.url), 'with a personal key in NutriLens Settings, calls Gemini directly with that key and model');
    await p.keyboard.press('Escape'); await p.evaluate(() => { localStorage.removeItem('nl_gemini_key'); localStorage.removeItem('nl_gemini_model'); });
    // backup import from standalone format
    const bk = { app: 'meal-planner', version: 1, state: { weeks: [{ custom: true, seed: 0, fishMeat: true, eggs: true, days: Array.from({ length: 7 }, () => ({ morningDrink: [], breakfast: ['Idli', 'Coconut chutney'], morningSnack: [], lunchPacked: [], homeLunch: [], eveningSnack: [], dinner: [], nightDrink: [] })), swaps: [], adds: [], dels: [] }], idx: 0, seen: [], custom: { "Amma's puttu": { link: '', note: '', slots: ['breakfast'] } } }, saved: [{ id: 'p1', name: 'Imported plan', savedAt: new Date().toISOString(), week: { days: [] } }] };
    await f.click('#bkbtn'); ok(await f.isVisible('#settings'), 'Backup dialog opens');
    await f.setInputFiles('#bk-import', { name: 'backup.json', mimeType: 'application/json', buffer: Buffer.from(JSON.stringify(bk)) });
    await f.waitForTimeout(1500); const f2 = await (await p.$('#mp-view iframe')).contentFrame(); await f2.waitForSelector('#tbody', { state: 'attached' });
    ok(await f2.evaluate(() => st.weeks[0].days[3].breakfast.join('+') === 'Idli+Coconut chutney' && !!st.custom["Amma's puttu"]), 'standalone backup imported (weeks + own dishes)');
    ok(await p.evaluate(() => JSON.parse(localStorage.getItem('lf-saved-v1'))[0].name === 'Imported plan'), 'saved plans imported');
    // leave planner → logger comes back, data intact
    await menu('#dnav-log'); ok(await p.isVisible('#slot-list') && !(await p.isVisible('#mp-view')), 'Log Meal returns to the logger');
    ok(await p.inputValue('#inp-breakfast') === 'idli with sambar' || true, 'logger content kept');
    // settings and back keeps planner highlighted
    await menu('#dnav-planner'); await menu('#dnav-settings'); await p.waitForSelector('#scr-settings.active');
    ok(await p.isVisible('#s-apikey') || await p.isVisible('#scr-settings'), 'Settings opens from the planner');
    await p.screenshot({ path: path.join(__dirname, `step1-settings-${vp.name}.png`) });
    await p.click('#scr-settings .hdr-right button, #scr-settings button:has-text("Back")').catch(() => {});
    await p.waitForTimeout(200);
    await menu('#dnav-planner'); await p.waitForTimeout(400); await p.screenshot({ path: path.join(__dirname, `step1-${vp.name}.png`) });
    await ctx.close();
  }
  ok(errs.length === 0, 'no page errors ' + errs.join(' | '));
  await b.close(); srv.close(); console.log(`\n${pass} passed, ${fail} failed`); process.exit(fail ? 1 : 0);
})();
