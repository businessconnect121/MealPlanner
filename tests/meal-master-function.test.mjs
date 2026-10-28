/* Runs netlify/functions/meal-master.mjs against Netlify's local Blobs server.
   Needs: npm install (once). Run: node tests/meal-master-function.test.mjs */
import { BlobsServer } from "@netlify/blobs/server";
import fs from "node:fs"; import os from "node:os"; import path from "node:path";
const dir = fs.mkdtempSync(path.join(os.tmpdir(), "mm-blobs-"));
const server = new BlobsServer({ directory: dir, port: 0, token: "tok" });
const { port } = await server.start();
const url = `http://localhost:${port}`;
process.env.NETLIFY_BLOBS_CONTEXT = Buffer.from(JSON.stringify({ siteID: "site1", token: "tok", edgeURL: url, uncachedEdgeURL: url })).toString("base64");
const { default: fn } = await import("../netlify/functions/meal-master.mjs");
const call = async (method, pass, body) => { const r = await fn(new Request("https://x/.netlify/functions/meal-master", { method, headers: pass ? { "x-family-passcode": pass } : {}, body })); return [r.status, await r.json()]; };
let ok = 0, bad = 0; const t = (c, m) => { c ? ok++ : bad++; console.log((c ? "✓ " : "✗ ") + m); };
t((await call("GET", "x"))[0] === 503, "no passcode env → 503 not set up");
process.env.MEAL_PLANNER_PASSCODE = "family123";
t((await call("GET", "nope"))[0] === 401, "wrong passcode → 401");
t((await call("GET"))[0] === 401, "missing passcode → 401");
let [s, j] = await call("GET", "family123"); t(s === 200 && j.doc === null, "empty store → doc null");
const doc = { version: 1, playlists: [{ id: "PL1" }], videos: { v1: { title: "Ragi dosa", dish: "Ragi dosa" } }, favDishes: {}, custom: { Puttu: { note: "x" } }, del: { vids: [], dishes: [] } };
t((await call("PUT", "nope", JSON.stringify(doc)))[0] === 401, "PUT with wrong passcode refused");
[s, j] = await call("PUT", "family123", JSON.stringify(doc)); t(s === 200 && j.savedAt, "PUT saves");
[s, j] = await call("GET", "family123"); t(s === 200 && j.doc.videos.v1 && j.doc.custom.Puttu && j.doc.savedAt, "GET returns what was saved (read-after-write)");
t((await call("PUT", "family123", "{bad"))[0] === 400, "bad JSON refused");
t((await call("PUT", "family123", JSON.stringify({ version: 2 })))[0] === 400, "wrong shape refused");
t((await call("PUT", "family123", "x".repeat(1_600_000)))[0] === 413, "too large refused");
t((await call("DELETE", "family123"))[0] === 405, "other methods refused");
await server.stop(); fs.rmSync(dir, { recursive: true, force: true }); console.log(`${ok} passed, ${bad} failed`); process.exit(bad ? 1 : 0);
