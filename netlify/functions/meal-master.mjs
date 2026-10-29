/* Meal Planner shared favourites (Netlify Blobs).
   Stores one JSON document: favourite recipe videos, playlists, own dishes and removals.
   Reads and writes both need the family passcode set in Netlify:
   Site configuration → Environment variables → MEAL_PLANNER_PASSCODE. */
import { getStore } from "@netlify/blobs";
import { timingSafeEqual, createHash } from "node:crypto";

const MAX_BYTES = 1_500_000;
const json = (status, obj) => new Response(JSON.stringify(obj), {
  status, headers: { "content-type": "application/json", "cache-control": "no-store" } });
const digest = s => createHash("sha256").update(String(s)).digest();

export default async (req) => {
  const env = name => { try { const v = globalThis.Netlify?.env?.get(name); if (v) return v; } catch {} return process.env[name]; };
  const secret = (env("MEAL_PLANNER_PASSCODE") || "").trim();
  if (!secret) return json(503, { error: "not_set_up" });
  const given = req.headers.get("x-family-passcode") || "";
  if (!timingSafeEqual(digest(given), digest(secret))) return json(401, { error: "wrong_passcode" });

  try {
  const store = getStore({ name: "meal-master", consistency: "strong" });

  if (req.method === "GET") {
    const doc = await store.get("master", { type: "json" });
    return json(200, { doc: doc || null });
  }
  if (req.method === "PUT") {
    const text = await req.text();
    if (text.length > MAX_BYTES) return json(413, { error: "too_large" });
    let doc; try { doc = JSON.parse(text); } catch { return json(400, { error: "bad_json" }); }
    const obj = v => v && typeof v === "object" && !Array.isArray(v);
    if (!obj(doc) || doc.version !== 1 || !obj(doc.videos) || !obj(doc.custom) || !obj(doc.favDishes)
        || !Array.isArray(doc.playlists) || (doc.del && !obj(doc.del)) || (doc.hidden && !Array.isArray(doc.hidden))) return json(400, { error: "bad_shape" });
    doc.savedAt = new Date().toISOString();
    await store.setJSON("master", doc);
    return json(200, { ok: true, savedAt: doc.savedAt });
  }
  return json(405, { error: "method" });
  } catch (e) { return json(500, { error: "store_error", detail: String(e && e.message || e).slice(0, 200) }); }
};

