import { createClient } from "@supabase/supabase-js";
import { readFileSync } from "node:fs";

const env = Object.fromEntries(
  readFileSync("server/.env", "utf8").split("\n").filter(l => l && !l.startsWith("#"))
    .map(l => { const i = l.indexOf("="); return [l.slice(0,i), l.slice(i+1)]; })
);
const userId = "37b39861-f164-4ecb-9ce6-4131f100cbbd";
const projectId = "9c0d3c93-8310-4266-a422-77a07e60938b"; // user's active project

const admin = createClient(env.SUPABASE_URL, env.SUPABASE_SERVICE_KEY, { auth: { persistSession: false }});
const { data: u } = await admin.auth.admin.getUserById(userId);
const { data: link } = await admin.auth.admin.generateLink({ type: "magiclink", email: u.user.email });
const anon = createClient(env.SUPABASE_URL, env.SUPABASE_ANON_KEY, { auth: { persistSession: false }});
const { data: sess } = await anon.auth.verifyOtp({ token_hash: link.properties.hashed_token, type: link.properties.verification_type });
const token = sess.session.access_token;

const { data: items } = await admin.from("furniture_catalog")
  .select("id, name_ko, brand, category, width_mm, depth_mm")
  .eq("is_active", true)
  .or("brand.ilike.%ikea%,name_ko.ilike.%ikea%");

console.log(`testing ${items.length} IKEA items against project ${projectId}…\n`);

async function trpcQuery(path, input) {
  const url = `http://localhost:8000/trpc/${path}?input=${encodeURIComponent(JSON.stringify(input))}`;
  const res = await fetch(url, { headers: { Authorization: `Bearer ${token}` }});
  return { status: res.status, body: await res.json() };
}
async function trpcMutation(path, body) {
  const res = await fetch(`http://localhost:8000/trpc/${path}`, {
    method: "POST", headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
    body: JSON.stringify(body),
  });
  return { status: res.status, body: await res.json() };
}

let fail400 = 0, failNoFit = 0, ok = 0;
for (const it of items) {
  const ap = await trpcQuery("homefix.staging.autoPlace",
    { project_id: projectId, furniture_id: it.id, k: 3, clearance_mm: 50 });
  if (ap.body.error) {
    console.log(`❌ ${it.name_ko} [${it.category}] ${it.width_mm}×${it.depth_mm}: autoPlace HTTP ${ap.status} — ${ap.body.error.message}`);
    if (ap.status === 400) fail400++;
    continue;
  }
  const d = ap.body.result?.data?.json ?? ap.body.result?.data;
  if (!d.best) {
    console.log(`⚠️  ${it.name_ko} [${it.category}] ${it.width_mm}×${it.depth_mm}: no fit (best=null, alts=${d.alternatives?.length})`);
    failNoFit++;
    continue;
  }
  const isInt = Number.isInteger(d.best.x_mm) && Number.isInteger(d.best.y_mm);
  // try addFurniture too — DON'T persist (set rollback)
  const af = await trpcMutation("homefix.staging.addFurniture", {
    project_id: projectId, furniture_id: it.id,
    x_mm: d.best.x_mm, y_mm: d.best.y_mm, rotation_deg: d.best.rotation_deg,
  });
  if (af.body.error) {
    console.log(`❌ ${it.name_ko} [${it.category}]: autoPlace OK but addFurniture HTTP ${af.status} — ${af.body.error.message} (x=${d.best.x_mm}, y=${d.best.y_mm}, intCoords=${isInt})`);
    if (af.status === 400) fail400++;
  } else {
    const placementId = af.body.result?.data?.json?.id ?? af.body.result?.data?.id;
    if (placementId) await trpcMutation("homefix.staging.removeFurniture", { placement_id: placementId });
    ok++;
  }
}
console.log(`\nsummary: ok=${ok}, no-fit=${failNoFit}, http400=${fail400}, total=${items.length}`);
