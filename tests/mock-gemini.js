/* Deterministic stand-in for the Gemini proxy (/.netlify/functions/gemini) used by the
   browser tests. It answers each NutriLens prompt type with plausible structured JSON. */
'use strict';
const hash = s => { let h = 0; for (const c of String(s)) h = (h * 31 + c.charCodeAt(0)) >>> 0; return h; };
function vecFor(name, qty) {
  const h = hash(name); const f = Math.max(0.2, Math.min(4, qty || 1));
  const r = (k, a, b) => +((a + ((h >>> k) % 1000) / 1000 * (b - a)) * f).toFixed(2);
  return { calories: r(1, 20, 180), protein_g: r(2, 0.2, 9), carbs_g: r(3, 1, 30), total_fat_g: r(4, 0, 8), fiber_g: r(5, 0, 5), sugars_g: r(6, 0, 4), saturated_fat_g: r(7, 0, 2),
    sodium_mg: r(8, 2, 180), potassium_mg: r(9, 20, 300), calcium_mg: r(10, 5, 140), iron_mg: r(11, 0.1, 2.5), zinc_mg: r(12, 0.1, 1.5), magnesium_mg: r(13, 5, 60), vitamin_c_mg: r(14, 0, 15), folate_mcg: r(15, 2, 60), vitamin_a_mcg: r(16, 0, 120), b12_mcg: r(17, 0, 0.3) };
}
const wrap = obj => ({ candidates: [{ content: { parts: [{ text: typeof obj === 'string' ? obj : JSON.stringify(obj) }] } }] });
const SUGG = ['Rava idli', 'Ven pongal', 'Pesarattu', 'Adai', 'Ragi dosa', 'Semiya upma', 'Appam', 'Puttu', 'Neer dosa', 'Lemon poha', 'Kuzhi paniyaram', 'Rava dosa', 'Idiyappam', 'Akki rotti', 'Oats upma', 'Moong dal chilla', 'Paneer paratha', 'Masala oats', 'Vegetable sevai', 'Thalipeeth'];
function respond(prompt, calls) {
  const p = String(prompt);
  if (/A user has logged their meals for the day/.test(p)) {
    const slotIds = [...p.matchAll(/\[slot_id:([a-z_]+)\]\s*\S+\s*([^:]+):\s*(.*)/g)].map(m => ({ id: m[1], name: m[2].trim(), text: m[3].trim() }));
    return wrap({ meals: slotIds.map(s => ({ slot_id: s.id, occasion: s.name, nutrients: { calories: 420, protein_g: 14, carbs_g: 70, total_fat_g: 9, fiber_g: 6, calcium_mg: 120, iron_mg: 3, sodium_mg: 450, zinc_mg: 2 }, dishes: [{ name: s.text, qty: '1 plate', nutrition: { calories: 420, protein_g: 14 } }], absorption_note: null })),
      verdict: 'A balanced start with room for more protein.', health_impact: null, top_gap: { nutrient: 'Calcium', pct: 12, why_it_matters: 'Bones.', food_options: ['Curd'] }, gaps: [{ nutrient: 'Iron', pct: 20, action: 'Add greens' }], highlight: 'Good fibre.' });
  }
  if (/deeply personalised, body-focused daily nutrition review/.test(p)) return wrap({ summary: 'Your **protein** is low today.', gaps: [], highlight: 'Nice variety.' });
  if (/helping the user understand their meal data/.test(p)) return wrap('Try adding a bowl of curd for calcium.');
  if (/return evidence-based RDA/.test(p)) return wrap({ conditions: [], unclear: [], summary: 'none' });
  if (/build a reusable meal library/.test(p)) {
    const n = Math.min(20, +(p.match(/Suggest (\d+) distinct dishes/) || [0, 10])[1]);
    const lib = (p.match(/do not repeat\): (.*)\./) || [0, ''])[1].toLowerCase();
    const list = SUGG.filter(s => !lib.includes(s.toLowerCase())).slice(0, n);
    return wrap({ reply: `Here are ${list.length} easy ideas.`, suggestions: list.map((name, i) => ({ name, description: `Classic ${name.toLowerCase()} for busy mornings`, cuisine: 'South Indian', slots: ['breakfast'], role: 'main', prep_min: 5 + i % 3 * 5, active_min: 10 + i % 4 * 5, total_min: 30 + i * 3, difficulty: i % 5 === 4 ? 'medium' : 'easy', prep_method: 'fresh', key_ingredients: ['rice', 'urad dal'], est_per_serving: { calories: 250 + i * 7, protein_g: 7 + i % 5, carbs_g: 40, total_fat_g: 6, fiber_g: 3 }, why: 'quick' })) });
  }
  if (/Create complete, structured home recipes/.test(p)) {
    const names = [...p.matchAll(/^\d+\. ([^—\n(]+?)(?: —| \(|$)/gm)].map(m => m[1].trim());
    return wrap({ dishes: names.map(name => {
      const peanut = /pesarattu/i.test(name);
      const ings = [{ name: 'rice', qty: 1, unit: 'cup' }, { name: 'urad dal', qty: 0.25, unit: 'cup' }, { name: peanut ? 'peanuts' : 'grated coconut', qty: 2, unit: 'tbsp' }, { name: 'oil', qty: 1, unit: 'tbsp' }, { name: 'salt', qty: 1, unit: 'tsp' }];
      return { name, description: 'Home-style ' + name, cuisine: 'South Indian', slots: ['breakfast'], role: 'main', pairs_with: ['Coconut chutney'], servings: 4, serving_size: '2 pieces', prep_min: 10, active_min: 15, total_min: 40, difficulty: 'easy', prep_method: 'fresh',
        storage: { location: 'fridge', usable_days: 5, instructions: 'Refrigerate' }, ingredients: ings.map(i => ({ ...i, optional: false, nutrition: vecFor(i.name, i.qty) })), instructions: ['Prepare batter', 'Cook on tawa'], substitutions: [{ from: 'rice', to: 'millet', note: '' }], contains: peanut ? ['peanut'] : [], link: 'http://bad.example/hallucinated' };
    }) });
  }
  if (/Estimate nutrition for each ingredient line/.test(p)) {
    const items = [...p.matchAll(/\[id:([^\]]+)\] ([^:]+): (.*)/g)].map(m => ({ id: m[1], name: m[2], q: m[3] }));
    return wrap({ items: items.map(it => ({ id: it.id, assumed_qty: /not given/.test(it.q) ? 1 : null, assumed_unit: /not given/.test(it.q) ? 'tbsp' : null, nutrition: vecFor(it.name, parseFloat(it.q) || 1), confidence: 'medium' })) });
  }
  if (/Assess whether each dish suits each family member/.test(p)) {
    const dishes = [...p.matchAll(/\[id:([^\]]+)\] ([^:]+):/g)].map(m => ({ id: m[1], name: m[2] }));
    const mem = [...p.matchAll(/Member ([A-Z]):/g)].map(m => m[1]);
    return wrap({ assessments: dishes.flatMap(d => mem.map(L => ({ dish_id: d.id, member: L, status: 'suitable', reason: 'No conflicts with recorded restrictions', modification: null }))), missing_info: dishes.slice(0, 1).map(d => ({ dish_id: d.id, what: 'spice level not specified' })) });
  }
  if (/Interpret this household kitchen update/.test(p)) {
    const t = (p.match(/Update: "([^"]*)"/) || [0, ''])[1].toLowerCase();
    const changes = [];
    if (/two carrots/.test(t)) changes.push({ action: 'use', name: 'carrot', qty: 2, unit: 'pc' });
    if (/one cup of beans/.test(t)) changes.push({ action: 'use', name: 'beans', qty: 1, unit: 'cup' });
    if (/half a cup of peas/.test(t)) changes.push({ action: 'use', name: 'peas', qty: 0.5, unit: 'cup' });
    if (/curd/.test(t) && /ran out|finished/.test(t)) changes.push({ action: 'finish', name: 'curd' });
    if (/bought/.test(t)) changes.push({ action: 'add', name: 'onion', qty: 1, unit: 'kg', category: 'fresh' });
    return wrap({ changes, unclear: [] });
  }
  if (/Explain these CALCULATED plan changes/.test(p)) return wrap('Your revised plan changes protein and calcium as listed. Would you like an alternative that improves calcium without much extra cooking?');
  if (/Convert this recipe text into structured data/.test(p)) return wrap({ name: 'Tomato rice', description: 'Quick lunch', cuisine: 'South Indian', slots: ['lunch'], servings: 3, prep_min: 10, active_min: 15, total_min: 30, ingredients: [{ name: 'rice', qty: 1, unit: 'cup' }, { name: 'tomato', qty: 3, unit: 'pc' }], instructions: ['Cook rice', 'Mix with tomato masala'], storage: { location: 'fridge', usable_days: 1 } });
  if (/meal-library assistant inside a family nutrition app/.test(p)) return wrap('You can ask me for suggestions like “Suggest 10 quick dinners”.');
  calls.unknown = (calls.unknown || 0) + 1;
  return wrap({});
}
module.exports = { respond, vecFor };
