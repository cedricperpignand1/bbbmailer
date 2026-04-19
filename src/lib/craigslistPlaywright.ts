/**
 * Craigslist Playwright Automation — Phase 1
 *
 * Automates browser-based posting to Craigslist.
 * Phase 1: Fills everything, launches non-headless browser so user can verify/submit.
 * Phase 2 (future): Fully automated submission + email verification.
 *
 * Install: npm install playwright && npx playwright install chromium
 */

export interface CraigslistPostParams {
  title: string;
  body: string;
  city: string;          // e.g. "Miami, FL"
  category: string;      // "jobs/construction" | "services/skilled-trades" | "gigs/labor"
  email: string;
  password: string;
  minDelayMs: number;
  maxDelayMs: number;
}

export interface CraigslistPostResult {
  success: boolean;
  phase: "login" | "area" | "type" | "category" | "form" | "submitted" | "error";
  message: string;
  error?: string;
}

// Map city name → Craigslist subdomain
function cityToSubdomain(city: string): string {
  const normalized = city.toLowerCase().replace(/,.*$/, "").trim();
  const map: Record<string, string> = {
    miami: "miami",
    "fort lauderdale": "broward",
    broward: "broward",
    orlando: "orlando",
    tampa: "tampa",
    jacksonville: "jacksonville",
    tallahassee: "tallahassee",
    "west palm beach": "westpalmbeach",
    "boca raton": "miami",
    "palm beach": "westpalmbeach",
    "st. petersburg": "tampa",
    "saint petersburg": "tampa",
    sarasota: "sarasota",
    gainesville: "gainesville",
    pensacola: "pensacola",
    "cape coral": "swfl",
    "fort myers": "swfl",
    naples: "swfl",
    "new york": "newyork",
    "los angeles": "losangeles",
    chicago: "chicago",
    houston: "houston",
    phoenix: "phoenix",
    philadelphia: "philadelphia",
    "san antonio": "sanantonio",
    "san diego": "sandiego",
    dallas: "dallas",
    "san jose": "sfbay",
    austin: "austin",
    jacksonville2: "jacksonville",
    denver: "denver",
    seattle: "seattle",
    boston: "boston",
    charlotte: "charlotte",
    "las vegas": "lasvegas",
    atlanta: "atlanta",
    nashville: "nashville",
    minneapolis: "minneapolis",
    portland: "portland",
    memphis: "memphis",
    sacramento: "sacramento",
    "salt lake city": "saltlakecity",
    raleigh: "raleigh",
    richmond: "richmond",
    cleveland: "cleveland",
    pittsburgh: "pittsburgh",
    cincinnati: "cincinnati",
    columbus: "columbus",
    detroit: "detroit",
    milwaukee: "milwaukee",
    "kansas city": "kansascity",
    "oklahoma city": "oklahomacity",
    tucson: "tucson",
    albuquerque: "albuquerque",
    "el paso": "elpaso",
    mesa: "phoenix",
  };
  return map[normalized] || normalized.replace(/\s+/g, "").replace(/[^a-z0-9]/g, "");
}

// Map category key → Craigslist posting type and category text
function getCategoryConfig(category: string): {
  postingType: string;
  categoryText: string;
  typeValue: string;
} {
  switch (category) {
    case "services/skilled-trades":
      return {
        postingType: "service offered",
        categoryText: "skilled trade services",
        typeValue: "so",
      };
    case "gigs/labor":
      return {
        postingType: "gig offered",
        categoryText: "labor gigs",
        typeValue: "go",
      };
    case "jobs/construction":
    default:
      return {
        postingType: "job offered",
        categoryText: "construction / extraction",
        typeValue: "jo",
      };
  }
}

function randomDelay(min: number, max: number): Promise<void> {
  const ms = min + Math.random() * (max - min);
  return new Promise((r) => setTimeout(r, ms));
}

export async function postToCraigslist(
  params: CraigslistPostParams
): Promise<CraigslistPostResult> {
  // Dynamic import — only load playwright at runtime (not build time)
  let chromium: typeof import("playwright").chromium;
  try {
    const pw = await import("playwright");
    chromium = pw.chromium;
  } catch {
    return {
      success: false,
      phase: "error",
      message: "Playwright not installed. Run: npm install playwright && npx playwright install chromium",
      error: "playwright_not_installed",
    };
  }

  const { title, body, city, category, email, password, minDelayMs, maxDelayMs } = params;
  const subdomain = cityToSubdomain(city);
  const catConfig = getCategoryConfig(category);

  const browser = await chromium.launch({
    headless: false, // Phase 1: visible so user can intervene
    slowMo: 50,
  });

  const ctx = await browser.newContext({
    viewport: { width: 1280, height: 800 },
  });
  const page = await ctx.newPage();

  try {
    // ── Step 1: Login ──────────────────────────────────────────────────────────
    await page.goto("https://accounts.craigslist.org/login/home", {
      waitUntil: "domcontentloaded",
      timeout: 30000,
    });

    // Fill email
    const emailField = page.locator("#inputEmailHandle, input[name='inputEmailHandle'], input[type='email']").first();
    await emailField.fill(email);

    // Fill password
    const pwField = page.locator("#inputPassword, input[name='inputPassword'], input[type='password']").first();
    await pwField.fill(password);

    await randomDelay(minDelayMs, maxDelayMs);

    // Submit login
    const loginBtn = page.locator("button[type='submit'], input[type='submit'], .submitBtn, .loginButton").first();
    await loginBtn.click();

    // Wait for redirect away from login page
    await page.waitForURL((url) => !url.toString().includes("/login"), {
      timeout: 15000,
    });

    await randomDelay(minDelayMs, maxDelayMs);

    // ── Step 2: Navigate to Post ───────────────────────────────────────────────
    const postLink = page.locator("a[href*='/post'], a:has-text('post to classifieds'), a:has-text('post an ad')").first();
    await postLink.click();
    await page.waitForLoadState("domcontentloaded", { timeout: 15000 });

    await randomDelay(minDelayMs, maxDelayMs);

    // ── Step 3: Select Area / City ────────────────────────────────────────────
    // Try to find the city in the area selection
    const areaLink = page.locator(
      `a[href*="${subdomain}"], a:has-text("${city.split(",")[0].trim()}")`
    ).first();

    if (await areaLink.isVisible({ timeout: 5000 }).catch(() => false)) {
      await areaLink.click();
      await page.waitForLoadState("domcontentloaded", { timeout: 15000 });
      await randomDelay(minDelayMs, maxDelayMs);
    }
    // If not visible, we may already be on the right city subdomain

    // ── Step 4: Select Posting Type ───────────────────────────────────────────
    const typeRadio = page.locator(
      `input[value="${catConfig.typeValue}"], label:has-text("${catConfig.postingType}")`
    ).first();

    if (await typeRadio.isVisible({ timeout: 5000 }).catch(() => false)) {
      await typeRadio.click();
    } else {
      // Try text-based selection
      const typeLink = page.locator(`a:has-text("${catConfig.postingType}")`).first();
      if (await typeLink.isVisible({ timeout: 3000 }).catch(() => false)) {
        await typeLink.click();
      }
    }

    await page.waitForLoadState("domcontentloaded", { timeout: 15000 });
    await randomDelay(minDelayMs, maxDelayMs);

    // ── Step 5: Continue to category selection ────────────────────────────────
    const continueBtn = page.locator("button:has-text('Continue'), input[value='Continue']").first();
    if (await continueBtn.isVisible({ timeout: 3000 }).catch(() => false)) {
      await continueBtn.click();
      await page.waitForLoadState("domcontentloaded", { timeout: 15000 });
      await randomDelay(minDelayMs, maxDelayMs);
    }

    // ── Step 6: Select Category ───────────────────────────────────────────────
    const catRadio = page.locator(
      `label:has-text("${catConfig.categoryText}"), input[value*="construction"], input[value*="labor"], input[value*="skilled"]`
    ).first();

    if (await catRadio.isVisible({ timeout: 5000 }).catch(() => false)) {
      await catRadio.click();
    }

    const continueBtn2 = page.locator("button:has-text('Continue'), input[value='Continue']").first();
    if (await continueBtn2.isVisible({ timeout: 3000 }).catch(() => false)) {
      await continueBtn2.click();
      await page.waitForLoadState("domcontentloaded", { timeout: 15000 });
      await randomDelay(minDelayMs, maxDelayMs);
    }

    // ── Step 7: Fill the Posting Form ─────────────────────────────────────────
    // Title
    const titleField = page.locator(
      "#PostingTitle, input[name='PostingTitle'], input[placeholder*='title' i]"
    ).first();
    if (await titleField.isVisible({ timeout: 5000 }).catch(() => false)) {
      await titleField.fill(title);
      await randomDelay(500, 1200);
    }

    // Description / Body
    const bodyField = page.locator(
      "#postingBody, textarea[name='postingBody'], textarea[placeholder*='description' i], textarea[name*='description' i]"
    ).first();
    if (await bodyField.isVisible({ timeout: 5000 }).catch(() => false)) {
      await bodyField.fill(body);
      await randomDelay(500, 1200);
    }

    // Postal code — try to fill with something based on city
    const postalField = page.locator(
      "#postal_code, input[name='postal_code'], input[name*='zip' i], input[placeholder*='zip' i]"
    ).first();
    if (await postalField.isVisible({ timeout: 3000 }).catch(() => false)) {
      // Leave blank for user to fill, or user can set a default in settings
      await randomDelay(300, 600);
    }

    // ── Phase 1: Stop here and let user review / submit manually ─────────────
    // The browser stays open. User can review and click "Continue" or "Publish".
    // Future Phase 2: automate final submit + email verification.

    return {
      success: true,
      phase: "form",
      message:
        "Form filled successfully. Browser is open — review the post and click Continue/Publish to submit. The browser will stay open.",
    };
  } catch (err: unknown) {
    const errMsg = err instanceof Error ? err.message : String(err);

    // Keep browser open so user can see what happened
    return {
      success: false,
      phase: "error",
      message: `Automation stopped: ${errMsg}`,
      error: errMsg,
    };
  }
  // Note: We intentionally do NOT close the browser here in Phase 1.
  // browser.close() will be called in Phase 2.
}
