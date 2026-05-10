/**
 * crawl.js
 * --------
 * Uses Playwright to render SAM.gov opportunity pages and return
 * their content as plain text for Claude to analyze.
 *
 * SAM.gov pages are JavaScript-rendered SPAs — a plain fetch() will
 * return an empty shell. Playwright launches a headless Chromium
 * instance, waits for the page to fully render, and extracts the text.
 *
 * Network flakes and slow renders are common, so each page is attempted
 * up to MAX_ATTEMPTS times with exponential backoff. If all attempts
 * fail, an empty string is returned and the pipeline continues — the
 * downstream Claude analysis can still reason from SAM.gov metadata.
 */

import { chromium } from 'playwright';

const NAVIGATION_TIMEOUT_MS = 60_000;  // 60 seconds to load the page
const RENDER_WAIT_MS        = 3_000;   // extra wait for JS to settle after load
const MAX_ATTEMPTS          = 3;
const BASE_BACKOFF_MS       = 1_500;   // 1.5s, 3s, 6s

/**
 * Render a SAM.gov opportunity page and return its visible text content.
 *
 * @param {string} url - The sam.gov opportunity detail URL
 * @returns {Promise<string>} - Visible text content, or '' if all retries fail
 */
export async function crawlOpportunityPage(url) {
  let lastError = null;

  for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt++) {
    try {
      return await renderOnce(url);
    } catch (err) {
      lastError = err;
      if (attempt < MAX_ATTEMPTS) {
        const wait = BASE_BACKOFF_MS * 2 ** (attempt - 1);
        console.warn(`  ⚠  Crawl attempt ${attempt} failed (${err.message}). Retrying in ${wait}ms…`);
        await sleep(wait);
      }
    }
  }

  console.warn(`  ⚠  Crawl failed after ${MAX_ATTEMPTS} attempts: ${lastError?.message ?? 'unknown error'}`);
  console.warn(`     Continuing with metadata only for ${url}`);
  return '';
}

async function renderOnce(url) {
  const browser = await chromium.launch({ headless: true });

  try {
    const page = await browser.newPage();

    // Block images, fonts, and media — we only need text
    await page.route('**/*', (route) => {
      const type = route.request().resourceType();
      if (['image', 'media', 'font', 'stylesheet'].includes(type)) {
        route.abort();
      } else {
        route.continue();
      }
    });

    await page.goto(url, {
      waitUntil: 'networkidle',
      timeout:   NAVIGATION_TIMEOUT_MS,
    });

    // Give JS-rendered content a moment to fully settle
    await page.waitForTimeout(RENDER_WAIT_MS);

    // Extract all visible text from the page body
    const text = await page.evaluate(() => {
      // Remove script and style elements before extracting text
      document.querySelectorAll('script, style, noscript').forEach(el => el.remove());
      return document.body?.innerText ?? '';
    });

    return text.trim();

  } finally {
    await browser.close();
  }
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
