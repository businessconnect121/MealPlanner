/* Feature tests for Meal Planner Steps 2–8 (Gemini and YouTube are mocked).
   Run: node tests/planner-features.test.js */
'use strict';
const { chromium } = require('playwright');
const http = require('http'), fs = require('fs'), path = require('path');
const ROOT = path.resolve(__dirname, '..');
let pass = 0, fail = 0; const errs = []; const prompts = []; let ytPhase = 1; let ytCalls = 0;
const ok = (c, m) => { if (c) { pass++; console.log('  ✓ ' + m); } else { fail++; console.log('  ✗ ' + m); } };
function serve() { return new Promise(res => { const s = http.createServer((q, r) => {
  const u = decodeURIComponent(q.url.split('?')[0]); const f = path.join(ROOT, u === '/' ? 'index.html' : u);
  if (!f.startsWith(ROOT) || !fs.existsSync(f) || fs.statSync(f).isDirectory()) { r.writeHead(404); r.end(); return; }
  r.writeHead(200, { 'content-type': f.endsWith('.js') ? 'text/javascript' : 'text/html' }); fs.createReadStream(f).pipe(r); }); s.listen(0, () => res(s)); }); }
const NL_MAIN = /idli|idly|dosa|dosai|upma|pongal|poha|aval|uttapam|appam|idiyappam|puttu|adai|pesarattu|paratha|roti|chapati|poori|puri|kanji|porridge|oats|bread|toast|sandwich|paniyaram|sevai|semiya|khichdi|kichadi|kozhukattai|cheela|chilla|dhokla|pancake|millet/i;
const J = o => ({ candidates: [{ content: { parts: [{ text: JSON.stringify(o) }] } }] });
function gemini(prompt) {
  prompts.push(prompt);
  if (/Turn each YouTube recipe video title/.test(prompt)) {
    const lines = prompt.split('Videos (number | title | master-list candidates):\n')[1].split('\n').filter(Boolean);
    return J({ v: lines.map(l => { const [i, t, c] = l.split(' | '); const cands = c === 'none' ? [] : c.split('; ');
      const veg = /chicken/i.test(t) ? 'nonveg' : 'veg'; const dish = t.replace(/ (recipe|in tamil).*$/i, '').replace(/\|.*$/, '').trim();
      return { i: +i, dish, link: cands[0] || null, slots: /dosa/i.test(t) ? ['breakfast', 'dinner'] : ['homeLunch', 'dinner'], diet: veg }; }) });
  }
  if (/You check whether dishes suit/.test(prompt)) {
    const mem = [...prompt.matchAll(/^(M\d+): conditions: (.*)$/gm)].map(m => [m[1], m[2]]);
    const ds = prompt.split('Dishes (number | name | serving note | recipe note | check for):\n')[1].split('\nReply')[0].split('\n').filter(Boolean);
    const r = []; for (const l of ds) { const [n, name, , , who] = l.split(' | ');
      for (const m of who.split(',')) { const cond = (mem.find(x => x[0] === m) || [])[1] || '';
        let s = 'ok', p = '', w = 'Fine for this member';
        if (/cholesterol/.test(cond) && /coconut|ghee|fry|biryani/i.test(name)) { s = 'no'; w = 'High in saturated fat'; }
        else if (/diabet/.test(cond) && /rice|kesari|payasam|biryani/i.test(name)) { s = 'limit'; p = '½ cup'; w = 'High in carbs'; }
        r.push({ d: +n, m, s, p, w }); } }
    return J({ r });
  }
  if (/Guests are coming/.test(prompt)) { const ls = prompt.split('\n').filter(l => /^\d+ \| dish:/.test(l));
    return J({ r: ls.map(l => { const n = +l.split(' | ')[0]; return { n, s: (/chicken|biryani/i.test(l) || n === 1) ? 'no' : 'ok', w: 'Not for the 2 vegetarian guests' }; }) }); }
  if (/Decide which EMPTY meals each request asks to fill/.test(prompt)) {
    const reqs = prompt.split('Requests:\n')[1].split('\nReply')[0].split('\n').filter(Boolean);
    return J({ r: reqs.map(l => { const [id, rest, ks] = l.split(' | '); const keys = ks.replace('empty meals it can fill: ', '').split(', ').filter(Boolean); const tx = rest.toLowerCase();
      if (/idli for breakfast/.test(tx)) return { id, all: false, meals: keys.filter(k => k.endsWith('|breakfast')), understood: ['Idli', 'Breakfast only'] };
      if (/sunday lunch/.test(tx)) return { id, all: false, meals: keys.filter(k => k === '6|homeLunch'), understood: ['Sunday lunch'], guests: /guests/.test(tx) ? ['6|homeLunch'] : [] };
      if (/repeat/.test(tx)) return { id, all: false, meals: keys.slice(0, 2), understood: ['No Wednesday repeats'] };
      return { id, all: true, meals: [], understood: ['Idli batter ×6', 'Cook Mon & Wed'] }; }) });
  }
  if (/You plan home meals/.test(prompt)) {
    const blocks = prompt.split('Meals to fill:\n')[1].split('\nReply')[0];
    const ms = [...blocks.matchAll(/^(\d\|\w+) = .*\n  candidates: (.*)$/gm)];
    return J({ meals: ms.map(([, k, c]) => { const raw = c.split('; '); const cs = raw.map(x => x.replace(/ \[[^\]]*\]$/, '')); const guest = /GUEST/.test(blocks.split(k + ' = ')[1].split('\n')[0]);
      let dishes = guest ? cs.filter(x => /biryani|kesari|payasam|paneer/i.test(x)).slice(0, 3).concat(cs.slice(0, 1)) : cs.slice(0, 2);
      if (global.mockSame) dishes = [cs.find(x => /coconut chutney/i.test(x)) || cs.find(x => /filter coffee/i.test(x)) || cs.find(x => /^apple/i.test(x)) || cs[0]];
      if (global.mockSkip && /\|morningSnack$/.test(k)) dishes = [];
      const alt = []; if (!guest && !global.mockNoAlt) for (const d of dishes) { const r = raw[cs.indexOf(d)] || ''; const mm = r.match(/not for (M\d)/); if (mm) { const j = raw.findIndex(x => !x.includes('not for ' + mm[1]) && !dishes.includes(x.replace(/ \[[^\]]*\]$/, ''))); if (j >= 0) alt.push({ dish: cs[j], for: [mm[1]] }); } }
      return { k, dishes, alt, new: /try new/i.test(prompt) ? ['Millet surprise bowl'] : [], why: 'test' }; }),
      understood: { week: ['Idli batter ×6', 'Cook Mon & Wed'], days: { '6': ['Guests for lunch'] }, meals: {} }, guests: /guests coming sunday lunch/i.test(prompt) ? ['6|homeLunch'] : [] });
  }
  if (/List the RAW ingredients, as bought from a shop, for ONE serving/.test(prompt)) {
    const ls = prompt.split('Dishes (number | name | serving note | recipe note | video description):\n')[1].split('\n').filter(Boolean);
    return J({ d: ls.map(l => { const n = +l.split(' | ')[0]; const name = l.split(' | ')[1].toLowerCase(); const ing = [{ i: 'onion', q: 0.25, u: 'pc', c: 'veg', b: false }, { i: 'salt', q: 0.5, u: 'tsp', c: 'pantry', b: true }];
      if (/rice/.test(name)) ing.push({ i: 'rice', q: 70, u: 'g', c: 'pantry', b: false }); if (/dosa|idli/.test(name)) { ing.push({ i: 'idli batter', q: 0.5, u: 'cup', b: false }); ing.push({ i: 'urad dal', q: 15, u: 'g', c: 'pantry', b: false }); }
      if (/carrot/.test(name)) ing.push({ i: 'carrot', q: 0.5, u: 'pc', c: 'veg', b: false }); if (/papaya|fruit|orange/.test(name)) ing.push({ i: 'papaya', q: 0.25, u: 'pc', c: 'fruit', b: false });
      return { n, ing }; }) });
  }
  if (/Estimate how long each home-cooked dish takes/.test(prompt)) { global.timeCalls = (global.timeCalls || 0) + 1;
    const ls = prompt.split('Dishes (number | name | serving note | recipe note):\n')[1].split('\n').filter(Boolean);
    return J({ t: ls.map(l => { const [n, name] = l.split(' | '); const x = name.toLowerCase();
      const m = /tea|coffee|juice|buttermilk|lemon|milk|drink|kanji|malt/.test(x) ? 5 : /sundal|chaat|fruit|salad|makhana|peanut|poha|aval/.test(x) ? 10 : /vada|bajji|samosa|cutlet|bonda|murukku/.test(x) ? 35 : 20;
      return { n: +n, m, pre: /idli|dosa|dhokla|vada/.test(x) }; }) }); }
  if (/Match what the user says/.test(prompt)) return J({ m: [{ key: 'carrot', have: true, amt: null }], unmatched: ['paneer'] });
  if (/Candidates \(number/.test(prompt)) return J({ picks: [{ n: 1, why: 'ok' }] });
  return J({});
}
/* mock of netlify/functions/meal-master.mjs (same request/response shape) */
const BLOB = { doc: null, pass: 'family123', puts: 0 };
function blobRoute(route) { const r = route.request(); const send = (st, o) => route.fulfill({ status: st, contentType: 'application/json', body: JSON.stringify(o) });
  if (r.headers()['x-family-passcode'] !== BLOB.pass) return send(401, { error: 'wrong_passcode' });
  if (r.method() === 'GET') return send(200, { doc: BLOB.doc ? JSON.parse(JSON.stringify(BLOB.doc)) : null });
  if (r.method() === 'PUT') { const doc = JSON.parse(r.postData()); doc.savedAt = new Date().toISOString(); BLOB.doc = doc; BLOB.puts++; return send(200, { ok: true, savedAt: doc.savedAt }); }
  return send(405, {}); }
function youtube(url) {
  ytCalls++; const u = new URL(url);
  if (u.pathname.endsWith('/playlists')) return { items: [{ snippet: { title: 'My Recipes' } }] };
  const all = [{ vid: 'v1', t: 'Ragi Dosa Recipe | Instant breakfast', d: 'Ingredients: ragi flour, rice flour, onion' }, { vid: 'v2', t: "Amma's Kadala Curry in Tamil", d: '' },
    { vid: 'v3', t: 'Chicken 65 restaurant style', d: '' }, { vid: 'v4', t: 'Private video', d: '' }];
  const items = ytPhase === 1 ? all : [all[0], all[2], { vid: 'v5', t: 'Lemon Rice Recipe', d: '' }];
  return { items: items.map(x => ({ snippet: { title: x.t, description: x.d, resourceId: { videoId: x.vid } }, contentDetails: { videoId: x.vid } })) };
}
(async () => {
  const srv = await serve(); const base = `http://127.0.0.1:${srv.address().port}/`;
  const b = await chromium.launch();
  const ctx = await b.newContext({ viewport: { width: 1366, height: 1000 } });
  await ctx.addInitScript(() => { if (!localStorage.getItem('nl_profiles')) localStorage.setItem('nl_profiles', JSON.stringify([
    { id: 1, name: 'Asha', conditions: 'IBS — low FODMAP diet; type 2 diabetes', diet: '' },
    { id: 2, name: 'Ravi', conditions: 'high cholesterol', diet: 'Vegetarian. Peanut allergy' },
    { id: 3, name: 'Meera', conditions: '', diet: '' }])); localStorage.setItem('nl_yt_key', JSON.stringify('YT-TEST-KEY')); });
  await ctx.route('**/*', route => { const u = route.request().url();
    if (u.includes('/.netlify/functions/gemini')) { const body = JSON.parse(route.request().postData() || '{}'); const txt = body.body.contents[0].parts[0].text;
      if (/You check whether dishes suit/.test(txt) && global.slowCheck) return new Promise(r => setTimeout(r, 1500)).then(() => route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(gemini(txt)) })).catch(() => {});
      if (global.slowPlan && /You plan home meals/.test(txt)) return new Promise(r => setTimeout(r, 700)).then(() => route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(gemini(txt)) })).catch(() => {});
      if (global.fail429 > 0 && /You plan home meals/.test(txt)) { global.fail429--; return route.fulfill({ status: 429, contentType: 'application/json', body: '{}' }); }
      if (global.garbageOnce && /You plan home meals/.test(txt)) { global.garbageOnce = false; return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ candidates: [{ content: { parts: [{ text: '{"meals":[{"k":"0|break' }] } }] }) }); }
      if (/Estimate how long/.test(txt)) { global.inFlight = (global.inFlight || 0) + 1; global.maxInFlight = Math.max(global.maxInFlight || 0, global.inFlight);
        return new Promise(r => setTimeout(r, 120)).then(() => { global.inFlight--; return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(gemini(txt)) }); }).catch(() => {}); }
      return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(gemini(body.body.contents[0].parts[0].text)) }); }
    if (u.startsWith('https://www.googleapis.com/youtube/v3/')) return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(youtube(u)) });
    if (u.includes('/.netlify/functions/meal-master')) return blobRoute(route);
    if (u.startsWith(base)) return route.continue(); return route.abort(); });
  const p = await ctx.newPage(); p.setDefaultTimeout(9000);
  p.on('pageerror', e => errs.push(e.message)); p.on('dialog', d => d.accept());
  await p.goto(base + 'meal-planner/index.html'); await p.evaluate(() => { LIB.open = false; renderLib(); });
  const W = () => p.evaluate(() => st.weeks[st.idx]);
  const add = async (d, s, text) => { await p.click(`#tbody .add[data-a="${d}|${s}"]`); await p.type('#tbody input.acin', text); await p.waitForTimeout(100); await p.keyboard.press('Enter'); await p.keyboard.press('Escape'); };

  console.log('\nStep 3 — family, headcount, guest meals');
  await p.click('#fambtn');
  const famTxt = await p.$eval('#mpo-body', e => e.textContent);
  ok(/Asha/.test(famTxt) && /Ravi/.test(famTxt) && /Meera/.test(famTxt), 'family lists all NutriLens profiles');
  ok(await p.$eval('.gchip[data-m="1"][data-g="fodmap"]', e => e.getAttribute('aria-pressed')) === 'true' && await p.$eval('.gchip[data-m="1"][data-g="diabetes"]', e => e.getAttribute('aria-pressed')) === 'true', 'goals detected from Asha\'s conditions (low-FODMAP + diabetes)');
  ok(/vegetarian/.test(famTxt) && /no peanut/.test(famTxt), 'Ravi\'s vegetarian diet and peanut allergy read from profile');
  await p.click('.gchip[data-m="3"][data-g="weightloss"]'); await p.fill('#fam-name', 'Iyer family'); await p.fill('#fam-size', '3'); await p.click('#fam-save');
  ok(await p.evaluate(() => st.family.name === 'Iyer family' && st.family.goals['3'].weightloss === true), 'rename family + planner-only goal change saved');
  ok(await p.evaluate(() => !JSON.parse(localStorage.getItem('nl_profiles'))[2].conditions), 'profile itself unchanged');
  ok((await p.$$eval('#thead .dpeople', e => e.length)) === 7, 'every day shows 👥 headcount');
  await p.click('#thead .dpeople[data-day="6"]'); await p.fill('#dy-people', '15'); await p.waitForTimeout(50);
  ok(await p.$eval('#mpo-body .gprompt', e => !e.hidden), 'raising headcount above family size asks “Cooking for guests?”');
  await p.click('#mpo-body .gprompt button'); ok(await p.$eval('#dy-guest', e => e.checked), 'one tap makes it a guest day');
  await p.fill('#dy-gnote', '2 vegetarian guests'); await p.click('#dy-save');
  let w = await W(); ok(w.meta.days[6].people === 15 && w.meta.days[6].guest === true, 'Sunday saved: 15 people, guest day');
  ok(/🎉/.test(await p.$eval('#thead .dpeople[data-day="6"]', e => e.textContent)), 'day header shows 🎉');
  // meal-level override
  await p.click('#tbody .mopt[data-mo="6|dinner"]'); await p.fill('#ml-people', '3'); await p.uncheck('#ml-guest'); await p.selectOption('#ml-time', '15'); await p.click('#ml-save');
  ok(await p.evaluate(() => NL.peopleFor(st.weeks[st.idx], 6, 'dinner') === 3 && !NL.guestFor(st.weeks[st.idx], 6, 'dinner') && NL.peopleFor(st.weeks[st.idx], 6, 'homeLunch') === 15), 'meal setting beats day setting (Sun dinner family-only, 3 people)');
  ok(/Guest meal/.test(await p.$eval('#tbody td[data-cell="6|homeLunch"] .mtag', e => e.textContent)) && /3 family \+ 12 guests/.test(await p.$eval('#tbody td[data-cell="6|homeLunch"] .mtag', e => e.textContent)), 'guest meal tag: “3 family + 12 guests”');

  console.log('\nStep 8 — planning settings');
  await p.click('#thead .dpeople[data-day="1"]'); await p.selectOption('#dy-diet', 'veg'); await p.click('#dy-save');
  ok(/veg/.test(await p.$eval('#thead .dpeople[data-day="1"]', e => e.textContent)) && await p.evaluate(() => NL.dietFor(st.weeks[st.idx], 1) === 'veg'), 'Tuesday set to vegetarian');
  await p.click('#regen'); await p.selectOption('#wk-nov', 'fav'); await p.selectOption('#wk-time', '60'); await p.click('#wk-save');
  ok(await p.evaluate(() => st.weeks[st.idx].meta.week.novelty === 'fav' && NL.timeFor(st.weeks[st.idx], 0, 'breakfast') === '60' && NL.timeFor(st.weeks[st.idx], 6, 'dinner') === '15'), 'week defaults (familiar, 1 hr) with meal override (15 min)');

  console.log('\nStep 2 — YouTube favourites');
  await p.click('#favbtn'); await p.fill('#pl-url', 'https://www.youtube.com/playlist?list=PLtest1234567890'); await p.click('#pl-go');
  await p.waitForSelector('#rv-save');
  const rv = await p.$$eval('.rev', e => e.map(x => x.textContent)); ok(rv.length === 3, 'private/deleted videos skipped (3 to review)');
  ok(await p.$eval('#rv-sel-0', e => e.value) === 'L:Ragi dosa', 'Ragi Dosa video → suggests linking to list dish “Ragi dosa”');
  ok(await p.$eval('#rv-sel-1', e => e.value) === 'N' && /Kadala Curry/.test(await p.$eval('#rv-nm-1', e => e.value)), 'Amma\'s Kadala Curry → new dish');
  await p.click('#rv-save'); await p.waitForTimeout(100);
  ok(await p.evaluate(() => !!st.favDishes['Ragi dosa'] && st.favDishes['Ragi dosa'].video === 'https://www.youtube.com/watch?v=v1'), 'linked favourite keeps list dish, uses your video');
  ok(await p.evaluate(() => { const k = Object.keys(st.custom).find(n => /Kadala/.test(n)); return k && st.custom[k].fav && st.custom[k].link.endsWith('v2'); }), 'new favourite saved as own dish with video link');
  await p.keyboard.press('Escape');
  await p.click('#tbody .add[data-a="0|breakfast"]'); await p.type('#tbody input.acin', 'ragi'); await p.waitForTimeout(120);
  ok(await p.$eval('#aclist .aco', e => e.classList.contains('fav') && /★/.test(e.textContent) && /Ragi dosa/.test(e.textContent)), 'favourite first in type-to-add with ★');
  await p.keyboard.press('Enter'); await p.keyboard.press('Escape');
  ok(await p.$eval('#tbody li[data-c="0|breakfast|0"]', e => e.classList.contains('fav') && /v1/.test(e.querySelector('a').href)), 'favourite shown in colour with its video link in the week');
  await p.evaluate(() => { LIB.open = true; LIB.slot = 'breakfast'; renderLib(); });
  ok(await p.$eval('#lib-rows .lrow:first-child', e => /★/.test(e.textContent) && !/Favourite/.test(e.textContent) && /Ragi dosa/.test(e.textContent)), 'favourite at top of Meal combinations with just a ★');
  ok(await p.evaluate(() => { const r = [...document.querySelectorAll('#lib-rows .lrow')].map(x => Math.round(x.getBoundingClientRect().top)); return new Set(r).size < r.length; }), 'several combinations share a line, each with its own ⠿');
  await p.evaluate(() => { LIB.open = false; renderLib(); });
  // re-sync
  ytPhase = 2; await p.click('#favbtn'); await p.click('[data-sync="0"]'); await p.waitForSelector('#rv-save');
  ok((await p.$$eval('.rev', e => e.length)) === 1 && /Lemon Rice/.test(await p.$eval('.rev', e => e.textContent)), 're-sync only reviews the new video');
  await p.click('#rv-save'); await p.waitForTimeout(100);
  ok(/No longer in the playlist \(1\)/.test(await p.$eval('#mpo-body', e => e.textContent)), 'video removed from playlist is flagged, not deleted');
  await p.keyboard.press('Escape');

  console.log('\nBuild a few meals');
  await add(0, 'lunchPacked', 'lemon rice'); await add(0, 'lunchPacked', 'carrot por'); await add(0, 'homeLunch', 'coconut rice'); await add(1, 'dinner', 'chicken 65');
  ok((await W()).days[0].lunchPacked.join('+') === 'Lemon rice+Carrot poriyal', 'meals added');

  console.log('\nStep 5 — suggest boxes fill only what they ask for');
  const filledKeys = async () => (await W()).days.flatMap((dd, d) => Object.entries(dd).filter(([, v]) => v.length).map(([s]) => d + '|' + s));
  const fillNow = async (btn, status) => { await p.evaluate(() => NL.status('')); await p.click(btn); await p.waitForFunction(() => /Filled \d+ meal|Nothing to fill|don't ask|isn't set up/.test(document.getElementById('b2status').textContent), null, { timeout: 15000 }); };
  const base0 = await filledKeys();
  ok(await p.evaluate(() => !document.getElementById('weekbtn')), 'the separate Suggest week button is gone');
  await p.click('#regen'); ok(/Regenerate week/.test(await p.$eval('#mpo-title', e => e.textContent)) && await p.$('#wk-sug') !== null, 'Regenerate week opens the requirements box first');
  await p.fill('#wk-sug', 'Breakfast: no upma or pongal. Lunch: more greens and dal.'); await p.selectOption('#wk-nov', 'mix'); await fillNow('#wk-fill');
  let wR = await W(); const nAll = wR.days.reduce((a, dd) => a + Object.values(dd).filter(x => x.length).length, 0);
  ok(nAll === 56, `Regenerate week plans every meal (${nAll} of 56)`);
  ok(!wR.days.some(dd => dd.breakfast.some(n => /upma|pongal/i.test(n))), '“Breakfast: no upma or pongal” → no upma or pongal at breakfast');
  ok(wR.days.filter(dd => dd.homeLunch.some(n => /keerai|spinach|palak|greens|dal|paruppu/i.test(n))).length >= 5, '“Lunch: more greens and dal” → greens or dal at most lunches');
  ok(await p.evaluate(() => { const w = st.weeks[st.idx]; NL.runSeed = 11; const a = [...slotCandidates(w, 0, 'breakfast', false, 'any', 'mix').keys()].slice(0, 12).join(); const b = [...slotCandidates(w, 1, 'breakfast', false, 'any', 'mix').keys()].slice(0, 12).join(); NL.runSeed = 12; const c = [...slotCandidates(w, 0, 'breakfast', false, 'any', 'mix').keys()].slice(0, 12).join(); return a !== b && a !== c; }), 'each day and each Regenerate gets a different mix of candidates (not the same list every day)');
  { const bd = wR.days.map(dd => dd.breakfast[0]); ok(new Set(bd).size >= 5, `breakfasts vary across the week (${new Set(bd).size} different of 7)`); }
  ok(prompts.filter(x => /You plan home meals/.test(x)).some(x => /Rotate the breakfast base/.test(x) && /follow every one of them/.test(x)), 'Gemini is told to follow every requirement and vary each day');
  ok(prompts.filter(x => /You plan home meals/.test(x)).some(x => /Week box: Breakfast: no upma or pongal\. Lunch: more greens and dal\./.test(x)), 'your requirements are sent with the plan request');
  ok(!(await p.$eval('#mpo', d => d.open)), 'dialog closes after regenerating so the week is visible');
  await p.click('#toast-undo'); ok((await filledKeys()).join() === base0.join() && (await W()).days[0].lunchPacked.join('+') === 'Lemon rice+Carrot poriyal', 'one Undo brings the previous week back');
  let newK;
  await p.click('#thead .dpeople[data-day="3"]'); await p.fill('#dy-sug', 'idli for breakfast'); await fillNow('#dy-fill');
  newK = (await filledKeys()).filter(k => !base0.includes(k)); ok(newK.join() === '3|breakfast', 'day box on Thursday “idli for breakfast” → only Thursday breakfast');
  await p.click('#toast-undo'); await p.click('#thead .dpeople[data-day="3"]'); await p.fill('#dy-sug', ''); await p.click('#dy-save');
  // general request + day and meal boxes
  await p.click('#regen'); await p.fill('#wk-sug', 'I have idli batter I can use 5-6 times. I will cook only Monday and Wednesday.'); await p.click('#wk-save');
  await p.click('#thead .dpeople[data-day="6"]'); await p.fill('#dy-sug', 'guests coming sunday lunch, festive'); await p.click('#dy-save');
  await p.click('#tbody .mopt[data-mo="2|dinner"]'); await p.fill('#ml-sug', 'light, 15 minutes'); await p.click('#ml-save');
  const before = await W();
  await p.click('#regen'); await p.check('#wk-keep'); await fillNow('#wk-fill');
  w = await W(); const fp = prompts.filter(x => /You plan home meals/.test(x));
  ok(fp.some(x => /Week box: I have idli batter/.test(x)) && fp.some(x => /Day box \(Sunday\): guests coming/.test(x)) && fp.some(x => /Meal box \(Wednesday Dinner\): light, 15 minutes/.test(x)), 'week, day and meal boxes all sent to Gemini');
  ok(/MEAL box beats the DAY box, the DAY box beats the ROW box \(one meal on every day\), and the ROW box beats the WEEK box/.test(fp[0]), 'precedence rule given: meal > day > row > week for conflicts');
  ok(w.days[0].lunchPacked.join('+') === 'Lemon rice+Carrot poriyal' && w.days[0].homeLunch.join('+') === 'Coconut rice', 'dishes you placed are not replaced');
  const filled = w.days.reduce((a, dd) => a + Object.values(dd).filter(x => x.length).length, 0); ok(filled === 56, `“Keep the dishes already in the week” fills every empty meal (${filled} of 56)`);
  ok(!Object.values(w.days[1]).flat().some(n => /chicken|egg|mutton|fish|prawn/i.test(n) && n !== 'Chicken 65'), 'Tuesday (veg day) got no non-veg suggestions');
  const sunCand = fp.find(x => /6\|dinner = Sunday Dinner/.test(x)); ok(sunCand && /6\|dinner = Sunday Dinner \| people 3 \| family meal \| food: any \| time: 15 minutes/.test(sunCand), 'meal settings (3 people, family meal, 15 min) passed to Sunday dinner');
  ok(fp.some(x => /GUEST MEAL \(2 vegetarian guests\)/.test(x)), 'guest meal and note passed to Gemini');
  ok(await p.evaluate(() => (st.weeks[st.idx].meta.week.understood || []).includes('Idli batter ×6')), '“Understood” chips stored for the week box');
  await p.click('#regen'); ok(/Idli batter ×6/.test(await p.$eval('#mpo-body .und', e => e.textContent)), 'week box shows what it understood'); await p.keyboard.press('Escape');

  console.log('\nDrag dishes with video links (real mouse)');
  const realDrag = async (fromSel, toSel, mod) => { await p.evaluate(s => { const el = document.querySelector(s); window.scrollBy(0, el.getBoundingClientRect().top - 150); }, fromSel);
    const a = await p.locator(fromSel).boundingBox(); const t = await p.locator(toSel).boundingBox(); if (mod) await p.keyboard.down(mod);
    await p.mouse.move(a.x + 8, a.y + a.height / 2); await p.mouse.down(); for (let i = 1; i <= 12; i++) await p.mouse.move(a.x + 8 + (t.x + 30 - a.x) * i / 12, a.y + a.height / 2 + (t.y + 12 - a.y) * i / 12); await p.mouse.up(); if (mod) await p.keyboard.up(mod); await p.waitForTimeout(80); };
  const linked = await p.evaluate(() => { const w = st.weeks[st.idx]; const n = POOL.roles.tiffinBase.find(d => linkOf(d) && !w.days[4].breakfast.includes(d) && !w.days[4].morningSnack.includes(d) && !w.days[5].morningSnack.includes(d) && !w.days[5].lunchPacked.includes(d)); w.days[4].breakfast = [n].concat(w.days[4].breakfast.filter(x => x !== n)); save(); render(); return n; });
  ok(await p.$(`#tbody li[data-c="4|breakfast|0"] .dn a`) !== null, 'test dish has a video link: ' + linked);
  await realDrag('#tbody li[data-c="4|breakfast|0"] .dn a', 'td[data-cell="4|morningSnack"]');
  w = await W(); ok(!w.days[4].breakfast.includes(linked) && w.days[4].morningSnack.includes(linked), 'drag a linked dish to another meal slot moves it (Fri breakfast → Fri morning snack)');
  await p.click('#dmode .segb[data-m="copy"]');
  const k = await p.evaluate(n => st.weeks[st.idx].days[4].morningSnack.indexOf(n), linked);
  await realDrag(`#tbody li[data-c="4|morningSnack|${k}"] .dn a`, 'td[data-cell="5|lunchPacked"]');
  w = await W(); ok(w.days[4].morningSnack.includes(linked) && w.days[5].lunchPacked.includes(linked), 'Copy mode copies it to another slot on another day (Fri morning snack → Sat lunch packed)');
  await p.click('#dmode .segb[data-m="move"]');
  await p.click('#toast-undo'); await p.click('#toast-undo');

  console.log('\nClear');
  const wClear = await W();
  await p.click('#tbody .mopt[data-mo="0|dinner"]'); await p.click('#ml-clear'); ok((await W()).days[0].dinner.length === 0, 'clear one meal'); await p.click('#toast-undo'); ok((await W()).days[0].dinner.length > 0, 'undo');
  await p.click('#thead .dpeople[data-day="1"]'); await p.click('#dy-clear'); ok(Object.values((await W()).days[1]).every(x => !x.length), 'clear a day'); await p.click('#toast-undo');
  await p.click('#tbody .rowclear[data-cs="breakfast"]'); ok((await W()).days.every(dd => !dd.breakfast.length) && (await W()).days[0].lunchPacked.length === 2, 'clear one meal slot across the week (row button)'); await p.click('#toast-undo');
  await p.click('#regen'); await p.selectOption('#wk-cslot', 'nightDrink'); await p.click('#wk-cslot-go'); ok((await W()).days.every(dd => !dd.nightDrink.length), 'clear a slot from the Regenerate week box'); await p.click('#toast-undo');
  await p.click('#regen'); await p.click('#wk-clear'); ok((await W()).days.every(dd => Object.values(dd).every(x => !x.length)), 'clear the whole week'); await p.click('#toast-undo');
  ok(JSON.stringify((await W()).days) === JSON.stringify(wClear.days), 'undo brings everything back');

  console.log('\nStep 4 — Check for family');
  await p.selectOption('#viewas', '2'); await p.waitForTimeout(80);
  ok(await p.isVisible('#vabanner') && /Viewing as Ravi/.test(await p.$eval('#vabanner', e => e.textContent)) && /Check for family/.test(await p.$eval('#vabanner', e => e.textContent)), 'View as works before checking, with a banner saying what\'s still unchecked');
  ok(await p.$eval('#tbody li[data-c="1|dinner|0"]', e => e.classList.contains('va-allergy')), 'View as Ravi (before check): Chicken 65 already marked (vegetarian)');
  await p.screenshot({ path: path.join(__dirname, 'va.png') });
  await p.selectOption('#viewas', '3'); await p.waitForTimeout(80); ok(/Meera/.test(await p.$eval('#vabanner', e => e.textContent)) && !(await p.$eval('#tbody li[data-c="1|dinner|0"]', e => e.classList.contains('va-allergy'))), 'View as Meera looks different from Ravi');
  await p.selectOption('#viewas', '');
  global.slowCheck = true; await p.click('#checkbtn'); await p.waitForTimeout(300);
  ok(/Stop checking/.test(await p.$eval('#checkbtn', e => e.textContent)), 'Check for family turns into “Stop checking” while running');
  await p.click('#checkbtn'); await p.waitForFunction(() => /Stopped/.test(document.getElementById('b2status').textContent), null, { timeout: 5000 });
  ok(/Check for family/.test(await p.$eval('#checkbtn', e => e.textContent)), 'Stop works and the button comes back');
  global.slowCheck = false;
  await p.click('#checkbtn'); await p.waitForFunction(() => /Checked \d+ dishes/.test(document.getElementById('b2status').textContent), null, { timeout: 20000 });
  const cr = await p.evaluate(() => { const w = st.weeks[st.idx]; const ms = NL.members(); const v = (mid, n) => verdict(ms.find(m => m.id === mid), n); return { lemonA: v('1', 'Lemon rice'), coconutR: v('2', 'Coconut rice'), chickenR: v('2', 'Chicken 65'), lemonM: v('3', 'Lemon rice') }; });
  ok(cr.lemonA.s === 'limit' && /½ cup|cup/.test(cr.lemonA.p), 'Asha (FODMAP + diabetes): Lemon rice limited, with portion');
  ok(cr.coconutR.s === 'no', 'Ravi (cholesterol): Coconut rice not suitable');
  ok(cr.chickenR.s === 'allergy' && /vegetarian/.test(cr.chickenR.w), 'Ravi (vegetarian): Chicken 65 → ⚠ strict diet');
  ok(cr.lemonM.s === 'ok', 'Meera: suits');
  const bd = await p.$eval('#tbody li[data-c="0|homeLunch|0"] .sbadges', e => e.textContent); ok(/A•/.test(bd) && /R✕/.test(bd) && /M/.test(bd), 'badges on the dish: ' + bd);
  const gRow = await p.$$eval('#tbody td[data-cell^="6|"] .sb.gb', e => e.length); ok(gRow >= 1, 'guest meal: outlined G badge from the guest note');
  await p.click('#tbody li[data-c="0|homeLunch|0"] .sb.s-no'); ok(/Ravi · not suitable/.test(await p.$eval('.sbtip', e => e.textContent)), 'tap an initial → reason');
  await p.selectOption('#viewas', '2'); await p.waitForTimeout(80);
  ok(await p.$eval('#tbody li[data-c="0|homeLunch|0"]', e => e.classList.contains('va-no')) && (await p.$$eval('#tbody .sbadges', e => e.length)) === 0, 'View as Ravi: unsuitable dishes outlined, badges hidden');
  await p.selectOption('#viewas', ''); const calls1 = prompts.filter(x => /You check whether/.test(x)).length;
  await p.click('#checkbtn'); await p.waitForFunction(() => /Checked/.test(document.getElementById('b2status').textContent));
  ok(prompts.filter(x => /You check whether/.test(x)).length === calls1, 'second check reuses kept results (no new Gemini calls)');

  console.log('\nSteps 6–7 — ingredients & groceries');
  await p.click('#grobtn'); ok(await p.isVisible('#gro-est'), 'groceries ask to estimate ingredients first');
  await p.click('#gro-est'); await p.waitForFunction(() => /Estimated ingredients/.test(document.getElementById('gro-status').textContent), null, { timeout: 20000 });
  const g = await p.$$eval('.glist .gi', e => e.map(x => x.textContent.replace(/\s+/g, ' ')));
  ok(g.some(x => /onion/i.test(x)) && g.some(x => /salt/i.test(x)), 'needed list and basics built from estimates');
  ok(await p.$$eval('.gi.basic input[type=checkbox]', e => e.every(x => x.checked)), 'pantry basics ticked by default');
  const onion = await p.evaluate(() => groceryNeed().list.find(x => x.key === 'onion')); const expected = await p.evaluate(() => { const w = st.weeks[st.idx]; let q = 0; w.days.forEach((dd, d) => SLOTS.forEach(([s]) => dd[s].forEach(n => { const e = st.ingr[n]; if (e) e.ing.filter(x => x.i === 'onion').forEach(x => { q += x.q * NL.peopleFor(w, d, s); }); }))); return q; });
  ok(Math.abs(onion.parts[0].q - expected) < 1e-6, 'amounts scaled by each meal\'s headcount (incl. 15 on Sunday)');
  ok(g.every(x => !/batter|cooked/.test(x)), 'raw ingredients only (no “idli batter”, uses urad dal etc.)');
  const cats = await p.$$eval('.gcat > .lbl', e => e.map(x => x.textContent)); ok(cats.some(x => /Vegetables/.test(x)) && cats.some(x => /Fruits/.test(x)) && cats.some(x => /Pantry/.test(x)), 'grouped: ' + cats.map(x => x.split(' (')[0]).join(' · '));
  ok((await p.$$eval('[data-amt]', e => e.length)) === 0 && !/I have…/.test(await p.$eval('#mpo-body', e => e.textContent)), 'no “I have …” quantity boxes: just name, amount and a tick');
  await p.fill('#gro-say', 'I have 2 onions, no rice and paneer'); await p.click('#gro-apply'); await p.waitForTimeout(200);
  const st2 = await p.evaluate(() => st.pantry.have);
  ok(st2.onion && st2.onion.t === true && st2.onion.amt === undefined, '“2 onions” just ticks onion (amount ignored)'); ok(st2.rice && st2.rice.t === false, '“no rice” → need it');
  ok(await p.$eval('[data-have="onion"]', e => e.checked), 'onion shown ticked'); await p.screenshot({ path: path.join(__dirname, 'gro.png') });
  await p.context().grantPermissions(['clipboard-read', 'clipboard-write']);
  await p.click('#gro-keep'); const clip = await p.evaluate(() => navigator.clipboard.readText());
  ok(/^Rice – \d/m.test(clip) && !/^Onion/m.test(clip) && !/Salt/.test(clip), 'Copy for Keep: unticked items only, name – amount, no basics:\n      ' + clip.split('\n').slice(0, 4).join(' | '));
  await p.click('.gi.basic input[type=checkbox]'); await p.click('#gro-keep'); const clip2 = await p.evaluate(() => navigator.clipboard.readText());
  ok(clip2.split('\n').length === clip.split('\n').length + 1, 'unticking a basic adds it to the list');
  await p.click('#gro-ing'); await p.click('.inglist summary'); const ta = await p.$('.inglist textarea'); await ta.fill('rice, 80 g\nsalt, 1 tsp (basic)'); await p.click('#ing-save');
  ok(await p.evaluate(() => Object.values(st.ingr).some(e => e.src === 'you' && e.ing[0].q === 80)), 'ingredients editable and saved as yours');
  await p.keyboard.press('Escape');

  console.log('\nSaving keeps everything');
  await p.click('#savebtn'); await p.fill('#sp-name', 'Test week'); await p.click('#sp-save'); await p.waitForFunction(() => /Saved “/.test(document.getElementById('sp-status').textContent));
  ok(await p.evaluate(() => { const pl = JSON.parse(localStorage.getItem('lf-saved-v1'))[0]; return pl.week.meta && pl.week.meta.days[6].guest === true; }), 'saved plan includes headcounts, guest meals and suggest boxes');
  await p.keyboard.press('Escape');
  await p.reload(); await p.waitForTimeout(300);
  ok(await p.evaluate(() => st.family.name === 'Iyer family' && Object.keys(st.favDishes).length >= 2 && st.weeks[st.idx].checked), 'family, favourites and checks persist after reload');
  await p.screenshot({ path: path.join(__dirname, 'features-desktop.png') });
  console.log('\nShared favourites (online store, mocked)');
  const fav = () => p.$eval('#mpo-body', e => e.textContent);
  await p.click('#favbtn');
  ok(/Enter your family passcode once/.test(await fav()), 'Favourites asks for the family passcode once per device');
  ok(await p.$eval('#favbtn', e => e.classList.contains('unsaved')), 'red dot while favourites are not shared yet');
  await p.fill('#ms-pass', 'wrong'); await p.click('#ms-connect'); await p.waitForFunction(() => NL.SYNC.state === 'wrongpass');
  ok(/doesn't match/.test(await fav()) && BLOB.doc === null, 'wrong passcode: nothing saved, says so');
  await p.fill('#ms-pass', 'family123'); await p.click('#ms-connect'); await p.waitForFunction(() => NL.SYNC.state === 'saved');
  ok(BLOB.doc && BLOB.doc.videos.v1 && BLOB.doc.videos.v2 && Object.keys(BLOB.doc.custom).some(n => /Kadala/.test(n)), 'right passcode: favourite videos and own dishes saved to the store');
  ok(/Shared with your devices/.test(await fav()) && !(await p.$eval('#favbtn', e => e.classList.contains('unsaved'))), 'shows “Shared with your devices”, red dot gone');
  const puts0 = BLOB.puts; await p.waitForTimeout(1800); ok(BLOB.puts === puts0, 'no repeat saves when nothing changed');
  await p.keyboard.press('Escape');
  await p.evaluate(() => { removeFavourite('v3'); save(); render(); });
  await p.waitForFunction(() => NL.SYNC.state === 'saved' && !NL.masterPending(), null, { timeout: 6000 });
  ok(!BLOB.doc.videos.v3 && BLOB.doc.del.vids.includes('v3'), 'removing a favourite saves automatically (and is remembered as removed)');
  await p.click('#bkbtn');
  const [dl] = await Promise.all([p.waitForEvent('download'), p.click('#ms-save')]);
  const myjs = fs.readFileSync(await dl.path(), 'utf8');
  ok(dl.suggestedFilename() === 'my-dishes.js' && /window\.MY_DISHES=/.test(myjs) && /Kadala/.test(myjs), 'Backup → Save to master (download) still gives my-dishes.js');
  await p.keyboard.press('Escape');
  // another device: empty browser, passcode entered
  const dev = async (builtIn, pass) => { const c = await b.newContext({ viewport: { width: 1366, height: 900 } });
    await c.route('**/*', route => { const u = route.request().url();
      if (builtIn && u.endsWith('/meal-planner/my-dishes.js')) return route.fulfill({ status: 200, contentType: 'text/javascript', body: builtIn });
      if (u.includes('/.netlify/functions/meal-master')) return blobRoute(route);
      if (u.startsWith('https://www.googleapis.com/youtube/v3/')) return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(youtube(u)) });
      if (u.startsWith(base)) return route.continue(); return route.abort(); });
    await c.addInitScript(pw => { localStorage.setItem('nl_yt_key', JSON.stringify('YT-TEST-KEY')); if (pw) localStorage.setItem('mp-family-passcode', pw); }, pass);
    const pg = await c.newPage(); pg.on('pageerror', e => errs.push(e.message)); await pg.goto(base + 'meal-planner/index.html'); return { c, pg }; };
  const { c: ctx2, pg: d2 } = await dev(null, 'family123');
  await d2.waitForFunction(() => NL.SYNC.state === 'saved');
  ok(await d2.evaluate(() => !!st.favDishes['Ragi dosa'] && Object.keys(st.custom).some(n => /Kadala/.test(n)) && !st.favs.videos.v3), 'new device: favourites and own dishes load from the store (removed one stays removed)');
  await d2.click('#favbtn'); await d2.click('[data-sync="0"]'); await d2.waitForTimeout(400);
  ok(/no new videos/.test(await d2.$eval('#mpo-body', e => e.textContent)) || !(await d2.$('#rv-save')), 're-importing the same playlist adds nothing (already saved)');
  await d2.keyboard.press('Escape');
  await d2.evaluate(() => { st.custom['Kerala puttu'] = { link: '', note: 'test', slots: ['breakfast'] }; removeFavourite('v2'); save(); render(); });
  await d2.waitForFunction(() => NL.SYNC.state === 'saved' && !NL.masterPending(), null, { timeout: 6000 });
  ok(BLOB.doc.custom['Kerala puttu'] && !BLOB.doc.videos.v2, 'second device: new own dish and a removal save automatically');
  await p.evaluate(() => NL.syncNow()); await p.waitForFunction(() => NL.SYNC.state === 'saved');
  ok(await p.evaluate(() => !!st.custom['Kerala puttu'] && !st.favs.videos.v2), 'first device picks up the other device\'s changes');
  await p.evaluate(() => { st.custom['Kerala puttu'].note = 'steam 10 min'; save(); render(); });
  await p.waitForFunction(() => NL.SYNC.state === 'saved' && !NL.masterPending(), null, { timeout: 6000 });
  await d2.evaluate(() => NL.syncNow()); await d2.waitForFunction(() => NL.SYNC.state === 'saved');
  ok(await d2.evaluate(() => st.custom['Kerala puttu'].note === 'steam 10 min'), 'an edit to an own dish reaches the other device');
  await ctx2.close();
  // built-in list: a device that never enters the passcode still has the favourites
  const { c: ctx3, pg: d3 } = await dev(myjs, null); await d3.waitForTimeout(400);
  ok(await d3.evaluate(() => !!st.favDishes['Ragi dosa'] && Object.keys(st.custom).some(n => /Kadala/.test(n))), 'built-in list (my-dishes.js) loads without the online store');
  await d3.click('#favbtn'); ok(/Built-in list: \d+ favourite videos/.test(await d3.$eval('#mpo-body', e => e.textContent)), 'Favourites shows the built-in list');
  await ctx3.close();
  // built-in list has v2, store says removed → stays removed
  const { c: ctx4, pg: d4 } = await dev(myjs, 'family123'); await d4.waitForFunction(() => NL.SYNC.state === 'saved');
  ok(await d4.evaluate(() => !st.favs.videos.v2 && !!st.custom['Kerala puttu']), 'removal in the store wins over an older built-in list');
  await ctx4.close();

  console.log('\nManage dishes');
  const settle = () => p.waitForFunction(() => NL.SYNC.state === 'saved' && !NL.masterPending(), null, { timeout: 6000 });
  await p.click('#favbtn'); await p.click('#mg-open');
  ok(await p.$$eval('#mg-list .sp-item', e => e.length) >= 2, 'Favourites → Manage dishes lists your dishes and favourites');
  const mgBtn = async (name, act) => { await p.fill('#mg-q', name); await p.waitForTimeout(80); await p.click(`#mg-list button[data-mg="${act}"]`); };
  await mgBtn('Ragi dosa', 'unfav');
  ok(await p.evaluate(() => !st.favDishes['Ragi dosa'] && /v1/.test(linkOf('Ragi dosa'))), 'Unfavourite: ★ gone, the dish keeps its video as the recipe link');
  await settle(); ok(BLOB.doc.videos.v1.unfav === true && !BLOB.doc.favDishes['Ragi dosa'], '…shared to the store');
  await p.reload(); await p.waitForTimeout(400); ok(await p.evaluate(() => !st.favDishes['Ragi dosa']), 'stays unfavourited after reload');
  await p.click('#favbtn'); await p.click('#mg-open'); await mgBtn('Ragi dosa', 'fav');
  ok(await p.evaluate(() => !!st.favDishes['Ragi dosa'] && !st.favs.videos.v1.unfav), '★ Favourite again restores it'); await settle();
  await mgBtn('Ragi dosa', 'unfav'); await settle();
  const own = await p.evaluate(() => Object.keys(st.custom).find(n => /Kadala/.test(n) && !RX.INFO[n]));
  await mgBtn(own, 'del'); ok(await p.evaluate(n => !!st.custom[n], own) && /Tap again/.test(await p.$eval('#mg-list', e => e.textContent)), 'Delete dish asks for a second tap');
  await p.click('#mg-list button[data-mg="del"]');
  ok(await p.evaluate(n => !st.custom[n] || st.custom[n].forgotten, own), 'second tap deletes the own dish'); await settle();
  ok(!BLOB.doc.custom[own] && BLOB.doc.del.dishes.includes(own), '…and the deletion is shared');
  const lemon = await p.evaluate(() => Object.keys(RX.INFO).find(n => /^lemon rice$/i.test(n)) || Object.keys(RX.INFO).find(n => /lemon rice/i.test(n)));
  await mgBtn(lemon.slice(0, 10), 'hide');
  ok(await p.evaluate(n => st.hidden.includes(n), lemon), 'search finds a master-list dish to Hide');
  ok(await p.evaluate(n => !suggest('lemon', 0, 'lunchPacked').some(x => x.n === n), lemon), 'hidden dish not offered while typing');
  ok(await p.evaluate(n => !RX.rankAdd({ week: st.weeks[st.idx], day: 0, slot: 'lunchPacked', query: 'lemon', scope: 'all', cats: new Set(['L','P','R','V','H','U']) }).items.some(x => x.name === n), lemon), 'hidden dish not in the Add panel');
  ok(await p.evaluate(n => !combosFor('lunchPacked', true, true).some(c => c.includes(n)), lemon), 'hidden dish not in Meal combinations');
  ok(await p.evaluate(n => !slotCandidates(st.weeks[st.idx], 0, 'lunchPacked', false, 'any', 'mix').has(n), lemon), 'hidden dish not given to Suggest');
  ok(await p.evaluate(n => !generateWeek(POOL, { seed: 5 }).some(d => Object.values(d).some(m => m.includes(n))), lemon), 'hidden dish not used in a new week');
  await settle(); ok((BLOB.doc.hidden || []).includes(lemon), 'hidden list is shared');
  await p.click('#mg-f .chip[data-f="hidden"]'); await p.fill('#mg-q', '');
  ok(/1/.test(await p.$eval('#mg-f .chip[data-f="hidden"] .n', e => e.textContent)) && (await p.$$eval('#mg-list .sp-item', e => e.length)) === 1, 'Hidden filter lists it');
  await p.keyboard.press('Escape');
  { const { c, pg } = await dev(myjs, 'family123'); await pg.waitForFunction(() => NL.SYNC.state === 'saved');
    ok(await pg.evaluate(([n, o]) => st.hidden.includes(n) && !st.favDishes['Ragi dosa'] && (!st.custom[o] || st.custom[o].forgotten), [lemon, own]),
      'another device (with the older built-in list) gets the hide, the unfavourite and the delete');
    await pg.evaluate(n => { st.hidden = st.hidden.filter(x => x !== n); save(); render(); }, lemon);
    await pg.waitForFunction(() => NL.SYNC.state === 'saved' && !NL.masterPending(), null, { timeout: 6000 }); await c.close(); }
  await p.evaluate(() => NL.syncNow()); await p.waitForFunction(() => NL.SYNC.state === 'saved');
  ok(await p.evaluate(n => !st.hidden.includes(n), lemon), 'Show again on one device un-hides everywhere');

  console.log('\nRename');
  await p.evaluate(() => { const w = st.weeks[st.idx]; w.days[2].breakfast = ['Kerala puttu']; save(); render(); });
  await p.click('#savebtn'); await p.fill('#sp-name', 'Rename test'); await p.click('#sp-save'); await p.waitForFunction(() => /Saved “/.test(document.getElementById('sp-status').textContent)); await p.keyboard.press('Escape');
  await p.click('#favbtn'); await p.click('#mg-open'); await p.click('#mg-f .chip[data-f="all"]'); await p.fill('#mg-q', 'Kerala puttu'); await p.waitForTimeout(80);
  await p.click('#mg-list button[data-mg="edit"]'); ok(await p.$('#mg-new') !== null, 'Rename opens an inline name box');
  await p.fill('#mg-new', 'Steamed puttu'); await p.keyboard.press('Enter');
  ok(await p.evaluate(() => !!st.custom['Steamed puttu'] && !st.custom['Kerala puttu'] && st.custom['Steamed puttu'].note === 'steam 10 min'), 'renamed, note kept');
  ok(await p.evaluate(() => st.weeks[st.idx].days[2].breakfast.includes('Steamed puttu')), 'the week shows the new name');
  ok(await p.evaluate(() => JSON.parse(localStorage.getItem('lf-saved-v1')).some(pl => JSON.stringify(pl.week).includes('Steamed puttu') && !JSON.stringify(pl.week).includes('Kerala puttu'))), 'saved plans use the new name');
  await settle(); ok(BLOB.doc.custom['Steamed puttu'] && !BLOB.doc.custom['Kerala puttu'], 'rename shared to the store');
  const idli = await p.evaluate(() => Object.keys(RX.INFO).find(n => /^idli$/i.test(n)) || Object.keys(RX.INFO).find(n => /^idli/i.test(n)));
  await p.evaluate(() => { st.custom['amma idly'] = { link: 'https://www.youtube.com/watch?v=v9', note: '', slots: ['breakfast'], fav: true, diet: 'veg' };
    st.favs.videos.v9 = { title: 'Amma idly', dish: 'amma idly', playlist: 'x', desc: '', removed: false }; st.favDishes['amma idly'] = { video: 'https://www.youtube.com/watch?v=v9', vid: 'v9', title: 'Amma idly' }; save(); render(); });
  await p.fill('#mg-q', 'amma idly'); await p.waitForTimeout(80); await p.click('#mg-list button[data-mg="edit"]');
  await p.fill('#mg-new', idli.toUpperCase()); await p.waitForTimeout(50);
  ok(/Joins the master-list dish/.test(await p.$eval('#mg-hint', e => e.textContent)), 'typing a master-list name says it will join that dish');
  await p.click('#mg-list button[data-mg="rename"]');
  ok(await p.evaluate(n => !st.custom['amma idly'] && st.favs.videos.v9.dish === n && (!st.favDishes[n] || st.favDishes[n].vid) , idli), 'joined: the video now belongs to the master-list dish, own dish gone');
  await settle();
  { const { c, pg } = await dev(null, 'family123'); await pg.waitForFunction(() => NL.SYNC.state === 'saved');
    ok(await pg.evaluate(n => !!st.custom['Steamed puttu'] && !st.custom['Kerala puttu'] && !st.custom['amma idly'] && st.favs.videos.v9.dish === n, idli), 'another device sees the renames'); await c.close(); }
  await p.keyboard.press('Escape');

  console.log('\nSame / similar dish names while typing');
  await p.evaluate(() => { st.custom['Pudina Amla Drink'] = { link: '', note: '', slots: ['morningDrink'], fav: false, diet: 'veg' }; const w = st.weeks[st.idx]; w.days[4].morningDrink = []; w.days[5].morningDrink = []; save(); render(); });
  await p.click('#tbody .add[data-a="4|morningDrink"]'); await p.type('#tbody input.acin', 'mint amla drink'); await p.waitForTimeout(150);
  const first = await p.$eval('#aclist .aco', e => e.textContent);
  ok(/Pudina Amla Drink/.test(first) && /same dish\?/.test(first), 'typing “mint amla drink” shows Pudina Amla Drink first, marked “≈ same dish?”');
  ok(/similar/.test(await p.$eval('#aclist', e => e.textContent)) && /Amla juice|Amla cooler/.test(await p.$eval('#aclist', e => e.textContent)), 'close matches (Amla juice …) are listed as “similar”');
  await p.keyboard.press('Enter'); await p.waitForTimeout(150); await p.keyboard.press('Escape');
  ok(await p.evaluate(() => st.weeks[st.idx].days[4].morningDrink.includes('Pudina Amla Drink') && !st.custom['mint amla drink']), 'Enter adds the existing dish, no duplicate created');
  await p.click('#tbody .add[data-a="5|morningDrink"]'); await p.type('#tbody input.acin', 'PUDINA  amla-drink'); await p.waitForTimeout(120);
  ok(!(await p.$('#acnew')), 'different capitals/spaces/dashes: no “Save as new dish” offered');
  await p.fill('#tbody input.acin', 'nellikai pudina sharbat'); await p.waitForTimeout(120); await p.click('#acnew');
  ok(/Looks like/.test(await p.$eval('#nd-msg', e => e.textContent)), 'saving a near-duplicate warns “Looks like …” in the new-dish box');
  await p.click('#nd-use'); await p.waitForTimeout(150); await p.keyboard.press('Escape');
  ok(await p.evaluate(() => st.weeks[st.idx].days[5].morningDrink.length === 1 && !st.custom['nellikai pudina sharbat']), '“Use …” places the existing dish instead');
  ok(await p.evaluate(() => ['pudnia amla drnk', 'pudina amal drink', 'lemn rice', 'curd rcie', 'chiken biryani', 'bisibele bath'].every(q => { const h = SIM.find(q, allDishNames(), 3)[0]; return h && h.kind === 'same'; })), 'spelling mistakes still find the dish (pudnia, amal, lemn, rcie, chiken, bisibele)');
  ok(await p.evaluate(() => { const h = SIM.find('paal payasam', allDishNames(), 3); return !h.some(x => x.kind === 'same' && /^aval payasam$/i.test(x.n)); }), 'different dishes with similar spelling are not treated as the same (paal ≠ aval payasam)');

  console.log('\nCooking time: Suggest filters Meal combinations');
  await p.evaluate(() => { const w = st.weeks[st.idx]; w.days[0].eveningSnack = []; LIB.open = false; LIB.time = null; LIB.slot = 'breakfast'; renderLib(); save(); render(); });
  await p.click('#tbody .mopt[data-mo="0|eveningSnack"]'); await p.fill('#ml-sug', 'something in 15 mins'); await p.click('#ml-fill');
  await p.waitForFunction(() => LIB.time === 15 && !NL.pending && LIB.tstate === 'ok', null, { timeout: 30000 }); await p.waitForTimeout(300);
  ok(await p.evaluate(() => LIB.open && LIB.slot === 'eveningSnack' && document.getElementById('lib-time').value === '15'), 'meal ⚙ “something in 15 mins” → Meal combinations opens on Evening snack, ⏱ ≤ 15 min');
  ok(await p.evaluate(() => LIB.list.length > 0 && LIB.list.every(c => c.every(n => st.ttime[n] && st.ttime[n].m <= 15 && !st.ttime[n].pre))), 'every listed dish can be made within 15 minutes');
  ok(await p.evaluate(() => LIB.list.some(c => c.length === 1 && RX.INFO[c[0]] && LIB.list.indexOf(c) >= LIB.ownN)) && /Within 15 min/.test(await p.$eval('#lib-count', e => e.textContent)), 'includes more evening-snack dishes from the master list, and says “Within 15 min”');
  ok(await p.$$eval('#lib-rows .tmin', e => e.length > 0 && e.every(x => parseInt(x.textContent) <= 15)), 'each dish chip shows its minutes');
  ok(await p.evaluate(() => st.weeks[st.idx].days[0].eveningSnack.length > 0 && st.weeks[st.idx].days[0].eveningSnack.every(n => !st.ttime[n] || st.ttime[n].m <= 15)), 'the meal itself was filled only with dishes within 15 minutes');
  const calls = global.timeCalls; await p.selectOption('#lib-time', '30'); await p.waitForTimeout(200);
  ok(global.timeCalls === calls && await p.evaluate(() => LIB.list.some(c => c.some(n => st.ttime[n].m > 15))), 'changing the time picker re-filters without asking Gemini again (times are kept)');
  await p.selectOption('#lib-time', ''); await p.waitForTimeout(100); ok(await p.evaluate(() => LIB.time === null && !/Within/.test(document.getElementById('lib-count').textContent)), '“Any time” removes the filter');
  ok(await p.evaluate(() => { const r = NL.readAsk({ days: [0, 1, 2, 3, 4, 5, 6] }); return true; }), 'readAsk runs for the week');
  await p.evaluate(() => { const m = st.weeks[st.idx].meta; m.week.suggest = 'evening snack in 15 mins'; m.meals = {}; save(); });
  ok(await p.evaluate(() => { const r = NL.readAsk({ days: [0, 1, 2, 3, 4, 5, 6] }); return r.slot === 'eveningSnack' && r.max === 15; }), 'week box “evening snack in 15 mins” → Evening snack, 15 min');
  ok(await p.evaluate(() => { st.weeks[st.idx].meta.days[2].suggest = 'dinner under 30 minutes'; const r = NL.readAsk({ days: [2] }); return r.slot === 'dinner' && r.max === 30; }), 'day box “dinner under 30 minutes” beats the week box for that day');
  await p.evaluate(() => { const m = st.weeks[st.idx].meta; m.week.suggest = ''; m.days[2].suggest = ''; LIB.time = null; save(); renderLib(); });
  await settle(); ok(Object.keys(BLOB.doc.times || {}).length > 50, 'cooking times are shared, so other devices don\'t ask Gemini again');

  console.log('\nGroceries: voice keeps listening until “that\'s all”');
  await p.evaluate(() => { window.__sr = []; window.SpeechRecognition = class { constructor() { window.__sr.push(this); } start() { this.started = true; } stop() { this.stopped = true; } };
    for (const k of Object.keys(st.pantry.have)) delete st.pantry.have[k]; save(); });
  await p.click('#grobtn'); await p.waitForSelector('#gro-mic');
  ok(await p.isVisible('#gro-hint') && /that's all/.test(await p.$eval('#gro-hint', e => e.textContent)), 'a label tells you to say “that\'s all” when you finish');
  await p.click('#gro-mic');
  ok(/Listening/.test(await p.$eval('#gro-status', e => e.textContent)) && await p.$eval('#gro-mic', e => e.classList.contains('listening')), 'mic shows it is listening');
  const fire = (txt, fin) => p.evaluate(([t, f]) => { const r = window.__sr[window.__sr.length - 1]; const res = [{ 0: { transcript: t }, isFinal: f, length: 1 }]; r.onresult({ resultIndex: 0, results: res }); }, [txt, fin]);
  await fire('I have onion', true);
  await p.evaluate(() => window.__sr[window.__sr.length - 1].onend()); // a pause: the browser stops listening
  ok(await p.evaluate(() => window.__sr.length === 2 && NL.groVoice && NL.groVoice.on), 'a pause doesn\'t end it: it keeps listening');
  ok(await p.evaluate(() => (st.pantry.have.onion || {}).t && document.querySelector('[data-have="onion"]').checked), 'onion is ticked as soon as you say it, while still listening');
  await fire('and carrot that\'s all', true); await p.waitForTimeout(400);
  ok(await p.evaluate(() => !NL.groVoice), 'saying “that\'s all” stops listening');
  ok(await p.evaluate(() => (st.pantry.have.onion || {}).t && (st.pantry.have.carrot || {}).t), 'then everything you said is ticked (onion, carrot)');
  ok(!/that.s all/i.test(await p.$eval('#gro-say', e => e.value)), 'the done phrase isn\'t treated as an item');
  await p.click('#gro-mic'); await fire('rice', true); await p.click('#gro-mic'); await p.waitForTimeout(300);
  ok(await p.evaluate(() => !NL.groVoice && (st.pantry.have.rice || {}).t), 'tapping the mic again also finishes');
  await p.keyboard.press('Escape');

  console.log('\nGemini busy / cut-off answers, and time limits in Regenerate');
  await p.evaluate(() => { const w = st.weeks[st.idx]; w.days[3].eveningSnack = []; save(); render(); });
  global.fail429 = 1; await p.click('#tbody .mopt[data-mo="3|eveningSnack"]'); await p.fill('#ml-sug', ''); await p.click('#ml-fill');
  await p.waitForFunction(() => /trying again/.test(document.getElementById('b2status').textContent), null, { timeout: 5000 });
  ok(true, 'when Gemini is busy, it says “Gemini is busy — trying again in 4 s…”');
  await p.waitForFunction(() => st.weeks[st.idx].days[3].eveningSnack.length > 0, null, { timeout: 15000 });
  ok(global.fail429 === 0, '…and fills the meal on the same press, no second click needed');
  await p.keyboard.press('Escape').catch(() => {});
  await p.evaluate(() => { const w = st.weeks[st.idx]; w.days[3].eveningSnack = []; save(); render(); });
  global.garbageOnce = true; await p.click('#tbody .mopt[data-mo="3|eveningSnack"]'); await p.click('#ml-fill');
  await p.waitForFunction(() => st.weeks[st.idx].days[3].eveningSnack.length > 0, null, { timeout: 15000 });
  ok(!global.garbageOnce, 'an answer cut off half-way is asked again automatically');
  await p.keyboard.press('Escape').catch(() => {});
  await p.evaluate(() => { st.ttime = {}; save(); }); global.maxInFlight = 0; const tc0 = global.timeCalls || 0;
  await p.click('#regen'); await p.fill('#wk-sug', 'evening snacks less than 15 minutes'); await p.selectOption('#wk-nov', 'mix');
  await p.click('#wk-fill'); await p.waitForFunction(() => !NL.pending, null, { timeout: 30000 }); await p.waitForTimeout(300);
  const snacks = await p.evaluate(() => st.weeks[st.idx].days.map(d => d.eveningSnack));
  ok(snacks.every(x => x.length) && await p.evaluate(() => st.weeks[st.idx].days.every(d => d.eveningSnack.every(n => st.ttime[n] && st.ttime[n].m <= 15 && !st.ttime[n].pre))), 'Regenerate “evening snacks less than 15 minutes” fills every evening snack with dishes within 15 min');
  ok(global.maxInFlight <= 1, 'cooking-time requests go one at a time (no burst that makes Gemini busy)');
  await p.waitForFunction(() => LIB.tstate === 'ok', null, { timeout: 30000 });
  ok(await p.evaluate(() => LIB.slot === 'eveningSnack' && LIB.time === 15 && LIB.list.length > 0), 'then Meal combinations shows the full filtered list');
  await p.evaluate(() => { st.weeks[st.idx].meta.week.suggest = ''; LIB.time = null; save(); renderLib(); });

  console.log('\nSuggest / Regenerate: the box closes at once and the week shows progress');
  global.slowPlan = true;
  await p.click('#regen'); await p.fill('#wk-sug', ''); await p.click('#wk-fill'); await p.waitForTimeout(150);
  ok(!(await p.$eval('#mpo', d => d.open)), 'pressing Regenerate week closes the box straight away');
  ok(await p.$$eval('td.planning .plan-note', e => e.length) > 10 && await p.isVisible('#b2stop'), 'meals waiting for Gemini show “Planning…”, with a spinner and Stop button above the week');
  await p.waitForFunction(() => !NL.pending, null, { timeout: 30000 });
  ok(await p.$$eval('td.planning', e => e.length) === 0 && await p.evaluate(() => st.weeks[st.idx].days.every(d => Object.values(d).every(x => x.length))), 'meals fill in as answers arrive; nothing left “Planning…”');
  ok(!(await p.isVisible('#b2stop')) && /Filled \d+ meal/.test(await p.$eval('#b2status', e => e.textContent)), 'status says what was filled, Stop button gone');
  await p.click('#regen'); await p.click('#wk-fill'); await p.waitForTimeout(100); await p.click('#b2stop');
  await p.waitForFunction(() => !NL.pending, null, { timeout: 15000 });
  ok(/Stopped/.test(await p.$eval('#b2status', e => e.textContent)), 'Stop cancels it');
  global.slowPlan = false;

  console.log('\nSelecting text in a box doesn\'t close it');
  await p.click('#regen'); await p.fill('#wk-sug', 'Breakfast: no upma. Lunch: more greens and dal.');
  { const ta = await p.locator('#wk-sug').boundingBox(); const dl = await p.locator('#mpo').boundingBox();
    await p.mouse.move(ta.x + ta.width - 10, ta.y + 12); await p.mouse.down(); await p.mouse.move(ta.x + 5, ta.y + 12, { steps: 4 }); await p.mouse.move(dl.x - 30, dl.y + 40, { steps: 6 }); await p.mouse.up(); }
  ok(await p.$eval('#mpo', d => d.open), 'drag-selecting text and letting go outside the box keeps it open');
  await p.mouse.click(5, 5); ok(!(await p.$eval('#mpo', d => d.open)), 'a real click outside still closes it');

  console.log('\nSomeone can\'t have a dish → an alternative alongside');
  await p.evaluate(() => { const w = st.weeks[st.idx]; const m = w.meta; m.week.suggest = 'Lunch: chicken dishes'; m.week.novelty = 'mix'; m.week.diet = 'nonveg'; m.days.forEach(x => { x.diet = ''; x.suggest = ''; }); w.days[0].homeLunch = []; save(); render(); });
  await p.click('#tbody .mopt[data-mo="0|homeLunch"]'); await p.fill('#ml-sug', ''); await p.click('#ml-fill'); await p.waitForFunction(() => !NL.pending, null, { timeout: 30000 }); await p.waitForTimeout(200);
  let lunch = await p.evaluate(() => st.weeks[st.idx].days[0].homeLunch); const alt0 = await p.evaluate(() => (st.weeks[st.idx].alt || {})['0|homeLunch'] || {});
  ok(lunch.some(n => /chicken/i.test(n)) && Object.keys(alt0).length && Object.keys(alt0).every(n => !/chicken|egg|mutton|fish|prawn/i.test(n)), `a chicken dish for the family plus a veg alternative for Ravi (${lunch.join(' + ')})`);
  ok(/for Ravi/.test(await p.$eval('#tbody td[data-cell="0|homeLunch"]', e => e.textContent)), 'the alternative is labelled “for Ravi” in the week');
  ok(prompts.filter(x => /You plan home meals/.test(x)).some(x => /not for M2/.test(x) && /cooked side by side within the meal's time/.test(x)), 'Gemini is told who can\'t have which dish, and to keep both within the meal\'s time');
  global.mockNoAlt = true; await p.evaluate(() => { st.weeks[st.idx].days[0].homeLunch = []; save(); render(); });
  await p.click('#tbody .mopt[data-mo="0|homeLunch"]'); await p.click('#ml-fill'); await p.waitForFunction(() => !NL.pending, null, { timeout: 30000 }); await p.waitForTimeout(200); global.mockNoAlt = false;
  ok(await p.evaluate(() => { const a = (st.weeks[st.idx].alt || {})['0|homeLunch'] || {}; return Object.keys(a).length > 0 && Object.keys(a).every(n => !NL.isNonveg(n)); }), 'if Gemini forgets, the planner adds a suitable alternative itself');
  ok(prompts.some(x => /Groceries already at home \(ticked in Groceries\): .*onion/.test(x)), 'groceries you ticked are sent, so “plan with the groceries in hand” works');
  await p.evaluate(() => { const m = st.weeks[st.idx].meta; m.week.suggest = ''; m.week.diet = 'any'; save(); });

  console.log('\nVariety guard, complete meals, skipped meals');
  global.mockSame = true; global.mockSkip = true;
  await p.click('#regen'); await p.fill('#wk-sug', ''); await p.selectOption('#wk-nov', 'mix'); await p.click('#wk-fill'); await p.waitForFunction(() => !NL.pending, null, { timeout: 40000 }); await p.waitForTimeout(200);
  global.mockSame = false; global.mockSkip = false;
  const wv = await W();
  { const cnt = {}; wv.days.forEach(dd => Object.values(dd).flat().forEach(n => cnt[n] = (cnt[n] || 0) + 1));
    const coffee = Object.entries(cnt).filter(([n]) => /filter coffee/i.test(n)).reduce((a, [, v]) => a + v, 0);
    ok(coffee <= 3, `even when Gemini picks the same drink every day, it's swapped for variety (filter coffee ${coffee}× not 7×)`); }
  ok(wv.days.every(dd => dd.breakfast.some(n => NL_MAIN.test(n))), 'every breakfast has a main item (a chutney alone gets a tiffin added): ' + wv.days.map(dd => dd.breakfast.join('+')).slice(0, 3).join(' | '));
  ok(wv.days.every(dd => dd.morningSnack.length), 'meals Gemini skipped are filled by the planner (no empty morning snack)');
  console.log('\nSuggest a whole row');
  await p.click('#toast-undo');
  await p.evaluate(() => { const w = st.weeks[st.idx]; w.days.forEach(dd => dd.breakfast = []); save(); render(); });
  ok(await p.$$eval('#tbody .rowsug', e => e.length) === 8, 'every row has “✨ Suggest row”');
  await p.click('#tbody .rowsug[data-rs="breakfast"]'); await p.fill('#rw-sug', 'a different tiffin each day, no upma'); await p.click('#rw-fill');
  await p.waitForFunction(() => !NL.pending, null, { timeout: 30000 }); await p.waitForTimeout(200);
  { const wr = await W(); ok(wr.days.every(dd => dd.breakfast.length) && !wr.days.some(dd => dd.breakfast.some(n => /upma/i.test(n))), 'Suggest every breakfast fills all 7 breakfasts, following the row box (no upma)');
    ok(new Set(wr.days.map(dd => dd.breakfast[0])).size >= 5, 'with variety across the days'); }
  ok(prompts.filter(x => /You plan home meals/.test(x)).some(x => /Row box \(every Breakfast\): a different tiffin each day, no upma/.test(x)), 'row box sent to Gemini');
  await p.click('#regen'); ok(await p.$('#wk-row') !== null, 'Regenerate box also offers “One meal for every day” (for phones)'); await p.keyboard.press('Escape');
  console.log('\n12 weeks open');
  await p.evaluate(() => { for (let i = st.weeks.length; i < 12; i++) st.weeks.push(emptyWeek()); save(); render(); updWeekBtns(); });
  ok(await p.$$eval('#wktabs .wtab', e => e.length) === 12, '12 weeks can be open at once');
  await p.click('#newcustom', { force: true }); ok(await p.evaluate(() => st.weeks.length) === 12 && /12 weeks at a time/.test(await p.$eval('#toast-msg', e => e.textContent)), 'a 13th is blocked with a message');
  await p.evaluate(() => { st.weeks = st.weeks.slice(0, 1); st.idx = 0; save(); render(); updWeekBtns(); });

  console.log('\n“Don\'t repeat Wednesday\'s meals”');
  ok(await p.evaluate(() => { const w = st.weeks[st.idx]; const m = w.meta; const keep = m.days[3].suggest;
    const t = q => { m.days[3].suggest = q; const r = NL.boxWishes(w, 3, 'dinner'); return r; };
    const a = t("don't repeat wednesday meals"), b = t('dont repeat yesterday'), c = t('different from Wednesday'), e = t('no repeats this week'), f = t("Don't repeat Wednesday's dishes");
    m.days[3].suggest = keep; return a.avoidDays.join() === '2' && b.avoidDays.join() === '2' && c.avoidDays.join() === '2' && e.noRepeat && f.avoidDays.join() === '2'; }), 'understands “don\'t repeat Wednesday meals”, “dont repeat yesterday”, “different from Wednesday”, “no repeats”');
  await p.evaluate(() => { const w = st.weeks[st.idx]; Object.keys(w.days[3]).forEach(s => w.days[3][s] = []); save(); render(); });
  await p.click('#thead .dpeople[data-day="3"]'); await p.fill('#dy-sug', "don't repeat wednesday meals"); await p.click('#dy-fill');
  await p.waitForFunction(() => !NL.pending, null, { timeout: 30000 }); await p.waitForTimeout(200);
  { const wd = await W(); const wed = new Set(Object.values(wd.days[2]).flat()); const thu = Object.values(wd.days[3]).flat();
    ok(thu.length > 5 && !thu.some(n => wed.has(n)), `Thursday filled with nothing from Wednesday (${thu.length} dishes, 0 repeats)`); }
  ok(await p.evaluate(() => SLOTS.every(([s]) => st.weeks[st.idx].days[3][s].length)), 'a general day request fills all 8 meals of the day');
  await p.click('#thead .dpeople[data-day="3"]'); await p.fill('#dy-sug', ''); await p.click('#dy-save');

  console.log('\nAny number of dishes in a meal');
  await p.evaluate(() => { const w = st.weeks[st.idx]; w.days[5].dinner = []; const names = Object.keys(RX.INFO).filter(n => RX.INFO[n].bits & 64).slice(0, 30); placeInto(5, 'dinner', names, false); });
  ok(await p.evaluate(() => st.weeks[st.idx].days[5].dinner.length) === 30 && await p.$$eval('#tbody td[data-cell="5|dinner"] li[data-c]', e => e.length) === 30, '30 dishes in one meal, all shown');
  await add(5, 'dinner', 'lemon rice'); ok(await p.evaluate(() => st.weeks[st.idx].days[5].dinner.length) === 31, 'and you can keep adding (31st by typing)');
  ok(prompts.filter(x => /You plan home meals/.test(x)).some(x => /up to 30/.test(x)), 'Suggest may give bigger spreads when asked (up to 30)');
  await p.evaluate(() => { st.weeks[st.idx].days[5].dinner = []; save(); render(); });

  console.log('\nGroceries for an empty week, and Clear list');
  await p.evaluate(() => { st.weeks.push(emptyWeek()); st.idx = st.weeks.length - 1; st.pantry.have = {}; save(); render(); });
  await p.click('#grobtn'); ok(await p.isVisible('#gro-plan') && /no dishes yet/.test(await p.$eval('#mpo-body', e => e.textContent)), 'an empty week asks what you have at home, with “Plan the week with what I have”');
  await p.fill('#gro-say', 'I have onion, tomato, toor dal, ragi flour'); await p.click('#gro-apply'); await p.waitForTimeout(150);
  ok(await p.$$eval('#gro-pantry .pchip', e => e.length) === 4 && /Added to what you have at home/.test(await p.$eval('#gro-status', e => e.textContent)), 'typed items are listed under “At home now”');
  await p.evaluate(() => { window.__sr = []; window.SpeechRecognition = class { constructor() { window.__sr.push(this); } start() {} stop() {} }; }); await p.evaluate(() => groDialog());
  await p.click('#gro-mic'); await p.evaluate(() => { const r = window.__sr[window.__sr.length - 1]; r.onresult({ resultIndex: 0, results: [{ 0: { transcript: 'paneer' }, isFinal: true, length: 1 }] }); });
  ok(await p.$$eval('#gro-pantry .pchip', e => e.some(x => /paneer/.test(x.textContent))), 'spoken items appear one by one too');
  await p.evaluate(() => { const r = window.__sr[window.__sr.length - 1]; r.onresult({ resultIndex: 0, results: [{ 0: { transcript: "carrots that's all" }, isFinal: true, length: 1 }] }); }); await p.waitForTimeout(200);
  ok(await p.evaluate(() => !!(st.pantry.have.carrot || st.pantry.have.carrots) && !NL.groVoice), '…until “that\'s all”');
  await p.click('#gro-pantry [data-unpan="tomato"]'); ok(await p.evaluate(() => !st.pantry.have.tomato), '× removes an item');
  await p.click('#gro-plan'); ok(/Regenerate week/.test(await p.$eval('#mpo-title', e => e.textContent)) && /groceries I have at home/.test(await p.$eval('#wk-sug', e => e.value)), '“Plan the week with what I have” opens Regenerate with that request');
  await p.click('#wk-fill'); await p.waitForFunction(() => !NL.pending, null, { timeout: 30000 });
  ok(prompts.filter(x => /You plan home meals/.test(x)).slice(-1)[0].match(/Groceries already at home \(ticked in Groceries\): [^\n]*ragi flour/) !== null, 'the week is planned with your groceries sent to Gemini');
  await p.click('#grobtn'); await p.click('#gro-clear'); ok(/Tap again/.test(await p.$eval('#gro-clear', e => e.textContent)), 'Clear list asks for a second tap');
  await p.click('#gro-clear'); ok(await p.evaluate(() => Object.keys(st.pantry.have).length === 0) && /Cleared/.test(await p.$eval('#gro-status', e => e.textContent)), 'second tap clears every tick and item at home');
  await p.keyboard.press('Escape'); await p.evaluate(() => { st.weeks.pop(); st.idx = 0; save(); render(); });

  // phone smoke
  const m = await (await b.newContext({ viewport: { width: 390, height: 844 } })).newPage(); const me = []; m.on('pageerror', e => me.push(e.message));
  await m.addInitScript(() => {}); await m.goto(base + 'meal-planner/index.html'); await m.waitForTimeout(300);
  ok(await m.evaluate(() => document.documentElement.scrollWidth) <= 390, 'phone: no sideways scrolling'); await m.screenshot({ path: path.join(__dirname, 'features-phone.png') });
  ok(errs.length === 0 && me.length === 0, 'no page errors ' + errs.concat(me).join(' | '));
  await b.close(); srv.close(); console.log(`\n${pass} passed, ${fail} failed`); process.exit(fail ? 1 : 0);
})();
