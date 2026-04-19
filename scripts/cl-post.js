#!/usr/bin/env node
/**
 * ============================================================
 * Craigslist Auto-Poster — Local Script
 * ============================================================
 * Posts EXACTLY 2 times per day:
 *   - Morning : ~8:15am  (random ±15 min → 8:00–8:30am)
 *   - Midday  : ~12:00pm (random ±15 min → 11:45am–12:15pm)
 *
 * Runs every day. Stop with Ctrl+C.
 *
 * SETUP:
 *   1. Copy scripts\.env.example → scripts\.env and fill in values
 *   2. node scripts/cl-post.js
 * ============================================================
 */

const path = require("path");
const fs   = require("fs");

// ── Load env ──────────────────────────────────────────────────────────────────

function loadEnv() {
  const locations = [
    path.join(__dirname, ".env"),
    path.join(__dirname, "..", ".env.local"),
    path.join(__dirname, "..", ".env"),
  ];
  for (const loc of locations) {
    if (fs.existsSync(loc)) {
      const lines = fs.readFileSync(loc, "utf8").split(/\r?\n/);
      for (const line of lines) {
        const trimmed = line.trim();
        if (!trimmed || trimmed.startsWith("#")) continue;
        const eq = trimmed.indexOf("=");
        if (eq === -1) continue;
        const key = trimmed.slice(0, eq).trim();
        const val = trimmed.slice(eq + 1).trim().replace(/^["']|["']$/g, "");
        if (!process.env[key]) process.env[key] = val;
      }
      console.log(`[config] Loaded env from ${loc}`);
      break;
    }
  }
}

loadEnv();

const SITE_URL    = (process.env.SITE_URL    || "").replace(/\/$/, "");
const CL_EMAIL    = process.env.CL_EMAIL    || "";
const CL_PASSWORD = process.env.CL_PASSWORD || "";

if (!SITE_URL) {
  console.error("[error] SITE_URL is not set. Add it to scripts/.env");
  process.exit(1);
}
if (!CL_EMAIL || !CL_PASSWORD) {
  console.error("[error] CL_EMAIL and CL_PASSWORD must be set in scripts/.env");
  process.exit(1);
}

// ── Timing config ─────────────────────────────────────────────────────────────

// Two daily post windows. Each is a target hour + minute, with a random
// ±JITTER_MINUTES offset applied each day so it never posts at the exact same time.
const SLOTS = [
  { hour: 8,  minute: 15, label: "Morning"  }, // ~8:15am
  { hour: 12, minute:  0, label: "Midday"   }, // ~12:00pm
];
const JITTER_MINUTES = 15; // ±15 min random offset per slot per day

// ── Helpers ───────────────────────────────────────────────────────────────────

function sleep(ms) {
  return new Promise((r) => setTimeout(r, ms));
}

function randomInt(min, max) {
  return Math.floor(Math.random() * (max - min + 1)) + min;
}

function log(msg) {
  const ts = new Date().toLocaleTimeString();
  console.log(`[${ts}] ${msg}`);
}

function dateKey(d = new Date()) {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2,"0")}-${String(d.getDate()).padStart(2,"0")}`;
}

// Build today's two scheduled post times with random jitter
function buildTodaySchedule() {
  const schedule = SLOTS.map(({ hour, minute, label }) => {
    const jitter = randomInt(-JITTER_MINUTES, JITTER_MINUTES);
    const d = new Date();
    d.setHours(hour, minute + jitter, randomInt(0, 59), 0);
    return { label, time: d };
  });
  // Sort ascending just in case jitter swaps them
  schedule.sort((a, b) => a.time - b.time);
  return schedule;
}

async function apiFetch(urlPath, opts = {}) {
  const res = await fetch(`${SITE_URL}${urlPath}`, {
    headers: { "Content-Type": "application/json", ...(opts.headers || {}) },
    ...opts,
  });
  const json = await res.json().catch(() => ({}));
  return { ok: res.ok, status: res.status, data: json };
}

// ── Playwright ────────────────────────────────────────────────────────────────

async function runPlaywright({ title, body, city, category }) {
  let chromium;
  try {
    const pw = require("playwright");
    chromium = pw.chromium;
  } catch {
    throw new Error("Playwright not installed. Run: npm install playwright && npx playwright install chromium");
  }

  const cityMap = {
    miami: "miami", "fort lauderdale": "broward", broward: "broward",
    orlando: "orlando", tampa: "tampa", jacksonville: "jacksonville",
    "west palm beach": "westpalmbeach", sarasota: "sarasota",
    gainesville: "gainesville", "cape coral": "swfl", "fort myers": "swfl",
    "new york": "newyork", "los angeles": "losangeles", chicago: "chicago",
    houston: "houston", phoenix: "phoenix", philadelphia: "philadelphia",
    "san antonio": "sanantonio", "san diego": "sandiego", dallas: "dallas",
    denver: "denver", seattle: "seattle", boston: "boston",
    charlotte: "charlotte", "las vegas": "lasvegas", atlanta: "atlanta",
    nashville: "nashville", minneapolis: "minneapolis", portland: "portland",
    austin: "austin", raleigh: "raleigh", detroit: "detroit",
    columbus: "columbus", "kansas city": "kansascity",
  };
  const cityKey = city.toLowerCase().replace(/,.*$/, "").trim();
  const subdomain = cityMap[cityKey] || cityKey.replace(/[^a-z0-9]/g, "");

  const catConfig = {
    "jobs/construction":      { type: "jo", typeText: "job offered",      catText: "construction / extraction" },
    "services/skilled-trades":{ type: "so", typeText: "service offered",  catText: "skilled trade services"    },
    "gigs/labor":             { type: "go", typeText: "gig offered",      catText: "labor gigs"                },
  }[category] || { type: "jo", typeText: "job offered", catText: "construction / extraction" };

  const delay = () => sleep(randomInt(1500, 3500));

  const browser = await chromium.launch({ headless: false, slowMo: 60 });
  const ctx     = await browser.newContext({ viewport: { width: 1280, height: 800 } });
  const page    = await ctx.newPage();

  try {
    log("  Browser: logging in...");
    await page.goto("https://accounts.craigslist.org/login/home", { waitUntil: "domcontentloaded", timeout: 30000 });

    await page.locator("#inputEmailHandle, input[name='inputEmailHandle'], input[type='email']").first().fill(CL_EMAIL);
    await page.locator("#inputPassword, input[name='inputPassword'], input[type='password']").first().fill(CL_PASSWORD);
    await delay();
    await page.locator("button[type='submit'], input[type='submit']").first().click();
    await page.waitForURL((url) => !url.toString().includes("/login"), { timeout: 20000 });
    log("  Browser: logged in.");
    await delay();

    // Post link
    await page.locator("a[href*='/post'], a:has-text('post to classifieds'), a:has-text('post an ad')").first().click();
    await page.waitForLoadState("domcontentloaded", { timeout: 15000 });
    await delay();

    // City selection
    const areaLink = page.locator(`a[href*="${subdomain}"], a:has-text("${city.split(",")[0].trim()}")`).first();
    if (await areaLink.isVisible({ timeout: 4000 }).catch(() => false)) {
      await areaLink.click();
      await page.waitForLoadState("domcontentloaded", { timeout: 15000 });
      await delay();
    }

    // Posting type
    const typeEl = page.locator(`input[value="${catConfig.type}"], label:has-text("${catConfig.typeText}")`).first();
    if (await typeEl.isVisible({ timeout: 5000 }).catch(() => false)) {
      await typeEl.click();
    } else {
      const typeLink = page.locator(`a:has-text("${catConfig.typeText}")`).first();
      if (await typeLink.isVisible({ timeout: 3000 }).catch(() => false)) await typeLink.click();
    }
    await page.waitForLoadState("domcontentloaded", { timeout: 15000 });
    await delay();

    // Continue
    const cont1 = page.locator("button:has-text('Continue'), input[value='Continue']").first();
    if (await cont1.isVisible({ timeout: 3000 }).catch(() => false)) {
      await cont1.click();
      await page.waitForLoadState("domcontentloaded", { timeout: 15000 });
      await delay();
    }

    // Category
    const catEl = page.locator(`label:has-text("${catConfig.catText}"), input[value*="construction"], input[value*="labor"], input[value*="skilled"]`).first();
    if (await catEl.isVisible({ timeout: 5000 }).catch(() => false)) await catEl.click();

    const cont2 = page.locator("button:has-text('Continue'), input[value='Continue']").first();
    if (await cont2.isVisible({ timeout: 3000 }).catch(() => false)) {
      await cont2.click();
      await page.waitForLoadState("domcontentloaded", { timeout: 15000 });
      await delay();
    }

    // Fill form
    log("  Browser: filling form...");
    const titleEl = page.locator("#PostingTitle, input[name='PostingTitle']").first();
    if (await titleEl.isVisible({ timeout: 5000 }).catch(() => false)) {
      await titleEl.fill(title);
      await delay();
    }

    const bodyEl = page.locator("#postingBody, textarea[name='postingBody']").first();
    if (await bodyEl.isVisible({ timeout: 5000 }).catch(() => false)) {
      await bodyEl.fill(body);
      await delay();
    }

    // Submit
    const submitBtn = page.locator("button:has-text('Continue'), input[value='Continue']").first();
    if (await submitBtn.isVisible({ timeout: 5000 }).catch(() => false)) {
      await submitBtn.click();
      await page.waitForLoadState("domcontentloaded", { timeout: 20000 });
      log("  Browser: submitted — check window for any verification step.");
    }

    // Wait 30s for any CAPTCHA / email verification the user might need to handle
    log("  Browser: waiting 30s for manual verification if needed...");
    await sleep(30000);

    await browser.close();
    return { success: true };
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    log(`  Browser error: ${msg}`);
    try { await browser.close(); } catch {}
    return { success: false, error: msg };
  }
}

// ── Post one listing ──────────────────────────────────────────────────────────

async function postOne(lastAddressId) {
  // Generate preview from live API
  let previewRes = await apiFetch("/api/craigslist/preview", { method: "POST" });

  // Auto-reset if all addresses used
  if (!previewRes.ok && previewRes.data?.error?.includes("No pending addresses")) {
    log("All addresses used — resetting to pending...");
    await apiFetch("/api/craigslist/addresses", {
      method: "POST",
      body: JSON.stringify({ action: "reset" }),
    });
    previewRes = await apiFetch("/api/craigslist/preview", { method: "POST" });
  }

  if (!previewRes.ok) {
    log(`Preview error: ${previewRes.data?.error || "unknown"}`);
    return { addressId: null };
  }

  let preview = previewRes.data;

  // Avoid same address as last time — try once more
  if (lastAddressId && preview.addressId === lastAddressId) {
    log("Avoiding repeat address — regenerating...");
    const retry = await apiFetch("/api/craigslist/preview", { method: "POST" });
    if (retry.ok && retry.data.addressId !== lastAddressId) {
      preview = retry.data;
    }
  }

  log(`Address  : ${preview.address}`);
  log(`Title    : ${preview.title}`);
  log(`City     : ${preview.city}  |  Category: ${preview.category}`);

  // Run Playwright
  const result = await runPlaywright({
    title:    preview.title,
    body:     preview.body,
    city:     preview.city,
    category: preview.category,
  });

  // Report back to live app
  await apiFetch("/api/craigslist/post", {
    method: "POST",
    body: JSON.stringify({
      action:    "mark-posted",
      addressId: preview.addressId,
      title:     preview.title,
      postBody:  preview.body,
      city:      preview.city,
      category:  preview.category,
      success:   result.success,
      error:     result.error,
    }),
  });

  if (result.success) {
    log(`✓ Posted successfully. Address marked as used.`);
  } else {
    log(`✗ Post failed: ${result.error}`);
  }

  return { addressId: preview.addressId };
}

// ── Main loop ─────────────────────────────────────────────────────────────────

async function runForever() {
  console.log("=".repeat(60));
  console.log("  Craigslist Auto-Poster");
  console.log(`  Site    : ${SITE_URL}`);
  console.log(`  Account : ${CL_EMAIL}`);
  console.log("  Posts   : 2 per day");
  console.log("  Times   : ~8:15am and ~12:00pm (±15 min random)");
  console.log("  Stop    : Ctrl+C");
  console.log("=".repeat(60));

  let lastAddressId = null;

  while (true) {
    const now      = new Date();
    const today    = dateKey(now);
    const schedule = buildTodaySchedule();

    console.log(`\n── Schedule for ${today} ──────────────────────────────`);
    for (const slot of schedule) {
      console.log(`  ${slot.label.padEnd(8)} → ${slot.time.toLocaleTimeString()}`);
    }

    // Run each slot in order
    for (const slot of schedule) {
      const now2 = new Date();

      // Skip if the slot already passed when we started today
      if (slot.time <= now2) {
        log(`${slot.label} slot (${slot.time.toLocaleTimeString()}) already passed — skipping.`);
        continue;
      }

      // Sleep until slot time
      const waitMs = slot.time - now2;
      const waitMin = Math.round(waitMs / 60000);
      log(`Next post: ${slot.label} at ${slot.time.toLocaleTimeString()} (${waitMin} min away)`);
      await sleep(waitMs);

      // Post
      log(`\n── ${slot.label} Post ─────────────────────────────────────`);
      try {
        const result = await postOne(lastAddressId);
        if (result.addressId) lastAddressId = result.addressId;
      } catch (err) {
        log(`Error during post: ${err instanceof Error ? err.message : err}`);
      }
    }

    // Sleep until tomorrow morning (a bit before the first slot)
    const tomorrow = new Date();
    tomorrow.setDate(tomorrow.getDate() + 1);
    tomorrow.setHours(SLOTS[0].hour - 1, 45, 0, 0); // 1h before first slot
    const msUntilTomorrow = tomorrow - new Date();
    const hoursUntil = (msUntilTomorrow / 3600000).toFixed(1);
    log(`\nAll posts done for today. Sleeping ${hoursUntil}h until tomorrow...`);
    await sleep(msUntilTomorrow);
  }
}

runForever().catch((err) => {
  console.error("Fatal:", err);
  process.exit(1);
});
