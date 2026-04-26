/**
 * DPR-95 browser golden-path verification.
 *
 * 1. Mints a Supabase session for the user via admin.generateLink + verifyOtp
 * 2. Launches system Chrome via puppeteer-core
 * 3. Sets the session in localStorage on the frontend origin
 * 4. Navigates to the furniture-placer page
 * 5. Adds an IKEA item that previously hit float-coord 400 (퀸 침대 프레임)
 * 6. Confirms placement and asserts no error banner + a placement appears
 * 7. Captures network log for any 4xx/5xx
 */
import { createRequire } from "node:module";
import { readFileSync } from "node:fs";
const require = createRequire("/tmp/puppeteer-tools/package.json");
const puppeteer = require("puppeteer-core");
const { createClient } = require("@supabase/supabase-js");

const env = Object.fromEntries(
  readFileSync("server/.env", "utf8")
    .split("\n").filter((l) => l && !l.startsWith("#"))
    .map((l) => { const i = l.indexOf("="); return [l.slice(0, i), l.slice(i + 1)]; }),
);
const FRONTEND_URL = "http://localhost:4000";
const USER_ID = "37b39861-f164-4ecb-9ce6-4131f100cbbd";
const PROJECT_ID = "9c0d3c93-8310-4266-a422-77a07e60938b";
const FURNITURE_ID = "03c10f2a-96ad-49dd-a2dc-db3adbca5a7d"; // 퀸 침대 프레임 (was y=3762.5)
const PROJECT_REF = new URL(env.SUPABASE_URL).hostname.split(".")[0];

// 1. mint session
const admin = createClient(env.SUPABASE_URL, env.SUPABASE_SERVICE_KEY, { auth: { persistSession: false } });
const { data: u } = await admin.auth.admin.getUserById(USER_ID);
const { data: link } = await admin.auth.admin.generateLink({ type: "magiclink", email: u.user.email });
const anon = createClient(env.SUPABASE_URL, env.SUPABASE_ANON_KEY, { auth: { persistSession: false } });
const { data: sess } = await anon.auth.verifyOtp({
  token_hash: link.properties.hashed_token,
  type: link.properties.verification_type,
});
const session = sess.session;
console.log(`[mint] access_token len=${session.access_token.length} expires_at=${session.expires_at}`);

// 2. launch chrome
const browser = await puppeteer.launch({
  headless: "new",
  executablePath: "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome",
  args: ["--no-sandbox", "--disable-dev-shm-usage"],
});
const page = await browser.newPage();

const networkErrors = [];
page.on("response", (r) => {
  const u = r.url();
  if (r.status() >= 400 && (u.includes("/trpc/") || u.includes("/api/"))) {
    networkErrors.push({ status: r.status(), url: u });
  }
});
page.on("console", (msg) => {
  const t = msg.type();
  if (t === "error" || t === "warn") console.log(`[browser:${t}]`, msg.text());
});

// 3. seed localStorage on origin then load app
const sbKey = `sb-${PROJECT_REF}-auth-token`;
const sbValue = JSON.stringify({
  access_token: session.access_token,
  refresh_token: session.refresh_token,
  expires_at: session.expires_at,
  expires_in: session.expires_in,
  token_type: "bearer",
  user: session.user,
});
// load a blank page on the same origin first so localStorage works
await page.goto(`${FRONTEND_URL}/`, { waitUntil: "domcontentloaded", timeout: 30000 });
await page.evaluate(([k, v]) => localStorage.setItem(k, v), [sbKey, sbValue]);

// 4. navigate to furniture-placer page
const target = `${FRONTEND_URL}/homefix/planner/${PROJECT_ID}/furniture`;
await page.goto(target, { waitUntil: "networkidle2", timeout: 60000 });

// wait for placer to render — look for the catalog list or "+ 배치" button
await page.waitForFunction(
  () => Array.from(document.querySelectorAll("button")).some((b) => /\+\s*배치/.test(b.textContent ?? "")),
  { timeout: 30000 },
).catch(async (err) => {
  const html = await page.content();
  console.error("[fatal] placer never rendered. body snippet:", html.slice(0, 1500));
  throw err;
});
console.log("[ok] placer rendered");

// 5a. click "침대" category tab to narrow the list
await page.evaluate(() => {
  const tab = Array.from(document.querySelectorAll("button"))
    .find((b) => b.textContent?.trim() === "침대");
  tab?.click();
});
await new Promise((r) => setTimeout(r, 500));

// 5b. find the row for our target furniture by name and click its "+ 배치"
const clicked = await page.evaluate((targetName) => {
  const buttons = Array.from(document.querySelectorAll("button"))
    .filter((b) => /\+\s*배치/.test(b.textContent ?? ""));
  for (const btn of buttons) {
    // walk up ancestors until we find one containing the target name
    let p = btn.parentElement;
    for (let i = 0; i < 8 && p; i++) {
      if (p.textContent?.includes(targetName)) { btn.click(); return true; }
      p = p.parentElement;
    }
  }
  return false;
}, "퀸 침대 프레임");
if (!clicked) {
  const debug = await page.evaluate(() => {
    const rows = Array.from(document.querySelectorAll("button"))
      .filter((b) => /\+\s*배치/.test(b.textContent ?? ""))
      .slice(0, 3)
      .map((b) => {
        const card = b.closest("li, div, tr, article");
        return card?.textContent?.replace(/\s+/g, " ").trim().slice(0, 200);
      });
    const tabs = Array.from(document.querySelectorAll("button"))
      .filter((b) => !/\+\s*배치/.test(b.textContent ?? ""))
      .map((b) => b.textContent?.trim())
      .slice(0, 30);
    return { rows, tabs };
  });
  console.error("[debug] catalog cards:", JSON.stringify(debug, null, 2));
  await browser.close();
  process.exit(1);
}
console.log("[ok] clicked + 배치");

// 6. wait for preview panel ("배치 확정" button) then click confirm
await page.waitForFunction(
  () => Array.from(document.querySelectorAll("button"))
    .some((b) => /배치\s*확정/.test(b.textContent ?? "")),
  { timeout: 15000 },
);
console.log("[ok] preview panel appeared");

// snapshot placement count before confirm
const before = await page.evaluate(() => document.querySelectorAll("[data-placement-id], .placement-item").length);

await page.evaluate(() => {
  const b = Array.from(document.querySelectorAll("button"))
    .find((x) => /배치\s*확정/.test(x.textContent ?? ""));
  b?.click();
});

// 7. wait for either a new placement or an error banner
await new Promise((r) => setTimeout(r, 3000));
const errorBanner = await page.evaluate(() => {
  const all = Array.from(document.querySelectorAll("p, div, span"));
  for (const e of all) {
    const t = e.textContent ?? "";
    if (t.includes("배치 확정에 실패") || t.includes("자동 배치 요청 실패") || t.includes("자동 배치를 불러오는데 실패")) {
      return t;
    }
  }
  return null;
});

if (errorBanner) {
  console.error(`[fail] error banner appeared: ${errorBanner}`);
  console.error("network 4xx/5xx during run:", networkErrors);
  await browser.close();
  process.exit(1);
}

// confirm placement was added — verify via API rather than DOM (DOM structure varies)
const list = await fetch(`http://localhost:8000/trpc/homefix.staging.get?input=${encodeURIComponent(JSON.stringify({ id: PROJECT_ID }))}`, {
  headers: { Authorization: `Bearer ${session.access_token}` },
}).then((r) => r.json());
const placements = list.result?.data?.json?.placements ?? list.result?.data?.placements ?? [];
const found = placements.find((p) => p.furniture_id === FURNITURE_ID);
console.log(`[check] placements after confirm: ${placements.length}, target found: ${!!found}`);
if (!found) {
  console.error("[fail] placement was not persisted");
  console.error("network 4xx/5xx during run:", networkErrors);
  await browser.close();
  process.exit(1);
}

// ── Steps 5–7: DPR-124 — selection, rotate, delete (placement click → setSelectedId) ──

// Step 5. Click the newly placed <g> using its exact bounding rect centre.
// Each placed furniture <g> carries data-placement-id so we can find it
// without relying on fragile text or order heuristics.
const placementRect = await page.evaluate((placementId) => {
  const g = document.querySelector(`[data-placement-id="${placementId}"]`);
  if (!g) return null;
  const r = g.getBoundingClientRect();
  return { x: r.left + r.width / 2, y: r.top + r.height / 2, w: r.width, h: r.height };
}, found.id);

if (!placementRect || placementRect.w < 1 || placementRect.h < 1) {
  console.error(`[fail] step 5 — placement <g data-placement-id="${found.id}"> not found or zero-size in DOM`);
  await browser.close();
  process.exit(1);
}
console.log(`[step 5] placement rect centre (${placementRect.x.toFixed(1)}, ${placementRect.y.toFixed(1)}) size ${placementRect.w.toFixed(1)}×${placementRect.h.toFixed(1)}`);

// Use mouse.click so real pointer events fire (not synthetic DOM click which
// skips the pointerdown → setSelectedId path we're testing here).
await page.mouse.click(placementRect.x, placementRect.y);
await new Promise((r) => setTimeout(r, 400));

// Step 6. Verify the selection UI appeared — either the "↻ 회전" button or
// the placement rect switching to the blue stroke (#2563eb).
const selectionVisible = await page.evaluate((placementId) => {
  const rotateBtn = Array.from(document.querySelectorAll("button"))
    .find((b) => /↻\s*회전/.test(b.textContent ?? ""));
  if (rotateBtn && !rotateBtn.disabled) return { via: "button" };

  // Fallback: check SVG rect stroke colour inside the clicked <g>
  const g = document.querySelector(`[data-placement-id="${placementId}"]`);
  if (g) {
    const rect = g.querySelector("rect");
    if (rect) {
      const stroke = rect.getAttribute("stroke") ?? getComputedStyle(rect).stroke;
      if (stroke && stroke.includes("2563eb")) return { via: "stroke" };
    }
  }
  return null;
}, found.id);

if (!selectionVisible) {
  console.error("[fail] step 6 — placement was clicked but selection UI (↻ 회전 button or blue stroke) did not appear");
  console.error("network 4xx/5xx during run:", networkErrors);
  await browser.close();
  process.exit(1);
}
console.log(`[step 6] selection visible via: ${selectionVisible.via}`);

// Step 7a. Click "↻ 회전" and confirm the placement rotation changed.
const rotateBtn = await page.evaluate(() => {
  const b = Array.from(document.querySelectorAll("button"))
    .find((x) => /↻\s*회전/.test(x.textContent ?? ""));
  if (b) { b.click(); return true; }
  return false;
});
if (!rotateBtn) {
  console.error("[fail] step 7a — ↻ 회전 button not found after selection");
  await browser.close();
  process.exit(1);
}
await new Promise((r) => setTimeout(r, 800));
console.log("[step 7a] rotation button clicked");

// Verify rotation was applied — the transform on the <g> should change.
const rotated = await page.evaluate((placementId) => {
  const g = document.querySelector(`[data-placement-id="${placementId}"]`);
  if (!g) return null;
  return g.getAttribute("transform") ?? "";
}, found.id);
// rotation_deg starts at 0; after one click it should be 90
const rotationApplied = rotated && rotated.includes("rotate(90");
console.log(`[step 7a] post-rotate transform="${rotated}" rotation_applied=${rotationApplied}`);
if (!rotationApplied) {
  console.error("[fail] step 7a — rotation did not update the <g> transform to rotate(90,…)");
  await browser.close();
  process.exit(1);
}

// Step 7b. Click the newly-placed item again to re-select, then delete it.
// (Rotation deselects; click again to bring back the action bar.)
await page.mouse.click(placementRect.x, placementRect.y);
await new Promise((r) => setTimeout(r, 400));

const deleteBtn = await page.evaluate(() => {
  const b = Array.from(document.querySelectorAll("button"))
    .find((x) => x.textContent?.includes("삭제"));
  if (b) { b.click(); return true; }
  return false;
});
if (!deleteBtn) {
  console.error("[fail] step 7b — 삭제 button not found after re-selection");
  await browser.close();
  process.exit(1);
}
await new Promise((r) => setTimeout(r, 800));
console.log("[step 7b] delete button clicked");

// Placement should be removed from DOM
const stillInDom = await page.evaluate((placementId) =>
  !!document.querySelector(`[data-placement-id="${placementId}"]`),
found.id);
if (stillInDom) {
  console.error("[fail] step 7b — placement <g> still in DOM after delete");
  await browser.close();
  process.exit(1);
}
console.log("[step 7b] placement removed from DOM — delete confirmed");

// Placement was deleted via UI; API cleanup is only needed if delete failed above
// (we already exited on failure). Skip redundant API removeFurniture call here.

console.log(`\n✅ golden path passed (incl. DPR-124 selection steps). network 4xx/5xx during run: ${networkErrors.length}`);
if (networkErrors.length) console.log(JSON.stringify(networkErrors, null, 2));
await browser.close();
