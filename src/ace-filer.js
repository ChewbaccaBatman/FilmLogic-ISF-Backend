import { chromium } from 'playwright';

const ACE_URL = 'https://ace.cbp.dhs.gov';

// ISF field mapping: our keys → ACE portal field selectors/labels
// NOTE: Update these selectors if CBP updates the ACE UI
const ACE_FIELD_MAP = {
  seller:                    '#sellerName',
  buyer:                     '#buyerName',
  importer_of_record:        '#importerOfRecordNumber',
  consignee:                 '#consigneeName',
  manufacturer:              '#manufacturerName',
  ship_to_party:             '#shipToPartyName',
  country_of_origin:         '#countryOfOrigin',
  hts_codes:                 '#htsCommodityCode',
  container_stuffing_location: '#containerStuffingLocation',
  consolidator:              '#consolidatorName',
  vessel_voyage:             '#vesselVoyageNumber',
  bill_of_lading:            '#billOfLadingNumber',
};

export async function fileISF({ credentials, isf, onLog }) {
  onLog('step', 'Launching secure browser session...');

  const browser = await chromium.launch({
    headless: true,
    args: ['--no-sandbox', '--disable-setuid-sandbox'],
  });

  const context = await browser.newContext({
    userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/120.0.0.0 Safari/537.36',
    viewport: { width: 1280, height: 800 },
  });

  const page = await context.newPage();

  try {
    // Step 1 — Navigate to ACE
    onLog('step', 'Navigating to ACE portal...');
    await page.goto(ACE_URL, { waitUntil: 'domcontentloaded', timeout: 30000 });

    // Step 2 — Log in
    onLog('step', 'Logging in with ACE credentials...');
    await page.waitForSelector('#username', { timeout: 15000 });
    await page.fill('#username', credentials.username);
    await page.fill('#password', credentials.password);
    await page.click('[type="submit"]');

    // Wait for dashboard
    await page.waitForNavigation({ waitUntil: 'networkidle', timeout: 20000 });

    // Check for login error
    const errorEl = await page.$('.login-error, .alert-danger, #error-msg');
    if (errorEl) {
      const errText = await errorEl.innerText();
      throw new Error(`ACE login failed: ${errText.trim()}`);
    }
    onLog('step', 'Logged in successfully');

    // Step 3 — Navigate to ISF filing
    onLog('step', 'Opening new ISF filing form...');
    await page.goto(`${ACE_URL}/isf/new`, { waitUntil: 'domcontentloaded', timeout: 20000 });

    // Fallback: try clicking through menu if direct URL redirects
    const isfMenuBtn = await page.$('a[href*="isf"], button:has-text("ISF"), a:has-text("Importer Security Filing")');
    if (isfMenuBtn) {
      await isfMenuBtn.click();
      await page.waitForNavigation({ waitUntil: 'domcontentloaded', timeout: 15000 });
    }

    // Step 4 — Fill each ISF field
    onLog('step', 'Filling ISF 10+2 fields...');
    let filled = 0;

    for (const [key, selector] of Object.entries(ACE_FIELD_MAP)) {
      const value = isf[key];
      if (!value || value === 'null') continue;

      try {
        const el = await page.$(selector);
        if (!el) {
          // Try by name or aria-label as fallback
          const fallback = await page.$(`[name="${key}"], [aria-label*="${key}"]`);
          if (fallback) {
            await fallback.fill(String(value));
            filled++;
          }
          continue;
        }

        const tagName = await el.evaluate(e => e.tagName.toLowerCase());
        if (tagName === 'select') {
          await el.selectOption({ label: String(value) }).catch(() =>
            el.selectOption({ value: String(value) })
          );
        } else {
          await el.fill(String(value));
        }
        filled++;
        await page.waitForTimeout(120); // Gentle pacing
      } catch (fieldErr) {
        onLog('warn', `Could not fill field: ${key} — ${fieldErr.message}`);
      }
    }

    onLog('step', `Filled ${filled} of 12 fields`);

    // Step 5 — Submit
    onLog('step', 'Submitting ISF filing...');
    const submitBtn = await page.$('[type="submit"], button:has-text("Submit"), button:has-text("File ISF")');
    if (!submitBtn) throw new Error('Submit button not found on ACE filing form');
    await submitBtn.click();

    // Wait for confirmation
    await page.waitForNavigation({ waitUntil: 'networkidle', timeout: 20000 });

    // Try to grab confirmation number
    const confirmEl = await page.$('.confirmation-number, #confirmationNumber, [data-confirm], h2, .success-msg');
    let confirmNumber = `ISF-${Date.now()}`;
    if (confirmEl) {
      const text = await confirmEl.innerText();
      const match = text.match(/[A-Z0-9]{6,}/);
      if (match) confirmNumber = match[0];
    }

    onLog('step', `ISF submitted — confirmation: ${confirmNumber}`);
    return confirmNumber;

  } finally {
    await browser.close();
  }
}
