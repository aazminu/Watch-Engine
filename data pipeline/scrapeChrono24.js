/**
 * Chrono24 Scraper
 * Scrapes watch listings from Chrono24 and inserts into Supabase.
 *
 * Usage: node "data pipeline/scrapeChrono24.js" [--brand "rolex"] [--pages 5]
 *
 * Note: Chrono24 has anti-bot protection. This scraper launches a visible
 * browser. If you hit a CAPTCHA, solve it manually and the script continues.
 *
 * Prerequisites:
 *   - Ollama running with nomic-embed-text pulled
 *   - .env configured with Supabase credentials
 */

import puppeteer from 'puppeteer';
import { Ollama } from 'ollama';
import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';
import path from 'path';

dotenv.config({ path: path.resolve(process.cwd(), '.env') });

const supabase = createClient(process.env.VITE_SUPABASE_URL, process.env.VITE_SUPABASE_ANON_KEY);
const ollama = new Ollama({ host: process.env.OLLAMA_HOST || 'http://localhost:11434' });

const args = process.argv.slice(2);
const brandArg = args.includes('--brand') ? args[args.indexOf('--brand') + 1] : 'rolex';
const maxPages = args.includes('--pages') ? parseInt(args[args.indexOf('--pages') + 1]) : 3;

const BASE_URL = 'https://www.chrono24.com';
const DELAY_MS = 4000;

function buildEmbeddingText(watch) {
  const parts = [];
  if (watch.model_name) parts.push(`Model: ${watch.model_name}`);
  if (watch.family_name) parts.push(`Family: ${watch.family_name}`);
  if (watch.movement_name) parts.push(`Movement: ${watch.movement_name}`);
  if (watch.function_name) parts.push(`Function: ${watch.function_name}`);
  if (watch.dial_color) parts.push(`Dial color: ${watch.dial_color}`);
  if (watch.year_produced) parts.push(`Year: ${watch.year_produced}`);
  if (watch.price_eur) parts.push(`Price: EUR${watch.price_eur}`);
  if (watch.limited_edition) parts.push(`Limited edition: ${watch.limited_edition}`);
  if (watch.description) parts.push(`Description: ${watch.description}`);
  return parts.join('. ');
}

async function generateEmbedding(text) {
  try {
    const response = await ollama.embeddings({
      model: 'nomic-embed-text',
      prompt: `search_document: ${text}`,
    });
    return response.embedding;
  } catch (error) {
    console.error('Embedding error:', error.message);
    return null;
  }
}

function parsePrice(priceText) {
  if (!priceText) return null;
  const cleaned = priceText.replace(/[^0-9.]/g, '');
  const value = parseFloat(cleaned);
  return isNaN(value) ? null : value;
}

async function waitForHuman(page, msg) {
  // Check if we hit a CAPTCHA or bot check
  const blocked = await page.evaluate(() => {
    const body = document.body?.textContent?.toLowerCase() || '';
    return body.includes('captcha') ||
           body.includes('are you a human') ||
           body.includes('verify you are human') ||
           body.includes('access denied') ||
           body.includes('just a moment') ||
           document.querySelector('iframe[src*="captcha"]') !== null;
  });

  if (blocked) {
    console.log(`\n  *** CAPTCHA detected — ${msg}`);
    console.log('  *** Solve it in the browser window, then press Enter here to continue...');
    await new Promise(resolve => {
      process.stdin.once('data', resolve);
    });
    // Wait a bit after solving
    await new Promise(r => setTimeout(r, 2000));
  }
}

async function scrapeChrono24ListingPage(page, url) {
  await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 45000 });
  // Give JS time to render
  await new Promise(r => setTimeout(r, 3000));
  await waitForHuman(page, 'on listing page');

  // Scroll down to trigger lazy loading
  await page.evaluate(async () => {
    for (let i = 0; i < 5; i++) {
      window.scrollBy(0, 800);
      await new Promise(r => setTimeout(r, 500));
    }
    window.scrollTo(0, 0);
  });
  await new Promise(r => setTimeout(r, 1500));

  const watches = await page.evaluate(() => {
    const items = [];

    // Chrono24 listing selectors — try multiple patterns
    const selectors = [
      'a[href*="/id"][class*="article"]',
      '[class*="article-item"] a',
      'a[class*="rcard"]',
      '.article-item-container a',
      'div[data-qa="list"] a',
      'a[href*="-id"]',
    ];

    let cards = [];
    for (const sel of selectors) {
      cards = document.querySelectorAll(sel);
      if (cards.length > 0) break;
    }

    // Fallback: find all links that look like watch detail pages
    if (cards.length === 0) {
      cards = document.querySelectorAll('a[href]');
      cards = Array.from(cards).filter(a => {
        const href = a.getAttribute('href') || '';
        return href.includes('/id') && href.includes('.htm');
      });
    }

    const seenHrefs = new Set();

    cards.forEach(card => {
      try {
        const href = card.getAttribute('href') || '';
        if (!href || seenHrefs.has(href)) return;
        if (!href.includes('.htm')) return;
        seenHrefs.add(href);

        // Get text content from the card
        const text = card.textContent?.trim() || '';
        // Look for an image
        const imgEl = card.querySelector('img');
        const imgSrc = imgEl?.getAttribute('src') || imgEl?.getAttribute('data-src') || '';

        // Try to parse title and price from the card text
        const lines = text.split('\n').map(l => l.trim()).filter(Boolean);
        const title = lines[0] || '';
        const priceLine = lines.find(l => /[\$€£]|EUR|USD/.test(l)) || '';

        if (title && title.length > 3) {
          items.push({ title, price: priceLine, href, imgSrc });
        }
      } catch (e) {}
    });

    return items;
  });

  return watches;
}

async function scrapeWatchDetail(page, url) {
  try {
    await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 45000 });
    await new Promise(r => setTimeout(r, 2000));
    await waitForHuman(page, 'on detail page');

    const details = await page.evaluate(() => {
      const data = {};

      // JSON-LD structured data (most reliable)
      const scripts = document.querySelectorAll('script[type="application/ld+json"]');
      scripts.forEach(script => {
        try {
          const parsed = JSON.parse(script.textContent);
          if (parsed['@type'] === 'Product' || parsed.name) {
            data.name = parsed.name;
            data.brand = parsed.brand?.name;
            data.description = parsed.description;
            data.image = Array.isArray(parsed.image) ? parsed.image[0] : parsed.image;
            if (parsed.offers) {
              const offer = Array.isArray(parsed.offers) ? parsed.offers[0] : parsed.offers;
              data.price = offer?.price;
              data.currency = offer?.priceCurrency;
            }
            if (parsed.sku) data.reference = parsed.sku;
          }
        } catch (e) {}
      });

      // Spec table — Chrono24 uses various table/list formats
      const specSelectors = [
        'table tr',
        '[class*="spec"] tr',
        '[class*="detail"] tr',
        'dl dt, dl dd',
        '[class*="key-value"] > div',
      ];

      for (const sel of specSelectors) {
        const rows = document.querySelectorAll(sel);
        if (rows.length === 0) continue;

        rows.forEach(row => {
          let label, value;
          if (row.tagName === 'TR') {
            const cells = row.querySelectorAll('td, th');
            if (cells.length >= 2) {
              label = cells[0]?.textContent?.trim()?.toLowerCase() || '';
              value = cells[1]?.textContent?.trim() || '';
            }
          } else {
            label = row.querySelector('[class*="label"], [class*="key"], dt')?.textContent?.trim()?.toLowerCase() || '';
            value = row.querySelector('[class*="value"], dd')?.textContent?.trim() || '';
          }

          if (!label || !value) return;

          if (label.includes('reference') || label.includes('ref.')) data.reference = value;
          if (label.includes('movement')) data.movement = value;
          if (label.includes('year') && label.includes('produc')) data.year = value;
          if (label.includes('dial')) data.dialColor = value;
          if (label.includes('case') && label.includes('material')) data.caseMaterial = value;
          if (label.includes('functions') || label.includes('complication')) data.functions = value;
          if (label.includes('model')) data.model = value;
          if (label.includes('family') || label.includes('collection')) data.family = value;
          if (label.includes('water')) data.waterResistance = value;
        });
      }

      return data;
    });

    return details;
  } catch (error) {
    console.error(`Error on detail page: ${error.message}`);
    return {};
  }
}

function transformToSchema(listing, detail, brand) {
  const modelName = detail.name || detail.model || listing.title || '';

  return {
    source_id: listing.href || null,
    reference: detail.reference || null,
    brand_id: null,
    model_name: modelName,
    family_name: detail.family || null,
    movement_name: detail.movement || null,
    function_name: detail.functions || null,
    year_produced: detail.year || null,
    limited_edition: null,
    price_eur: parsePrice(detail.price || listing.price),
    image_url: detail.image || listing.imgSrc || null,
    image_filename: null,
    description: detail.description || null,
    dial_color: detail.dialColor || null,
    source: 'Chrono24',
    raw_data: { listing, detail, brand },
    created_at: new Date().toISOString(),
    last_updated: new Date().toISOString(),
  };
}

async function resolveBrandId(brandName) {
  if (!brandName) return null;
  const { data } = await supabase
    .from('brands')
    .select('id')
    .ilike('name', `%${brandName}%`)
    .limit(1)
    .single();
  return data?.id || null;
}

async function main() {
  console.log(`Scraping Chrono24 for "${brandArg}" — ${maxPages} pages`);
  console.log('(Browser will open — solve any CAPTCHAs if they appear)\n');

  const browser = await puppeteer.launch({
    headless: false, // Visible browser to handle CAPTCHAs
    args: [
      '--no-sandbox',
      '--disable-setuid-sandbox',
      '--disable-blink-features=AutomationControlled',
      '--window-size=1280,900',
    ],
    defaultViewport: null,
  });

  const page = await browser.newPage();

  // Stealth: hide automation signals
  await page.evaluateOnNewDocument(() => {
    Object.defineProperty(navigator, 'webdriver', { get: () => false });
    Object.defineProperty(navigator, 'plugins', { get: () => [1, 2, 3] });
    window.chrome = { runtime: {} };
  });

  await page.setUserAgent('Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36');

  const brandId = await resolveBrandId(brandArg);
  let totalInserted = 0;

  // First visit the homepage to establish cookies
  console.log('Loading Chrono24 homepage...');
  await page.goto(BASE_URL, { waitUntil: 'domcontentloaded', timeout: 30000 });
  await new Promise(r => setTimeout(r, 3000));
  await waitForHuman(page, 'on homepage');

  for (let pageNum = 1; pageNum <= maxPages; pageNum++) {
    const slug = brandArg.toLowerCase().replace(/\s+/g, '-');
    const searchUrl = `${BASE_URL}/${slug}/index.htm?pageSize=60&showPage=${pageNum}`;
    console.log(`\nPage ${pageNum}: ${searchUrl}`);

    const listings = await scrapeChrono24ListingPage(page, searchUrl);
    console.log(`Found ${listings.length} listings`);

    if (listings.length === 0) {
      console.log('No listings found — try solving CAPTCHA if browser shows one, then re-run.');
      break;
    }

    const batch = [];

    for (let i = 0; i < listings.length; i++) {
      const listing = listings[i];

      let detail = {};
      if (listing.href) {
        const detailUrl = listing.href.startsWith('http')
          ? listing.href
          : `${BASE_URL}${listing.href}`;
        console.log(`  [${i + 1}/${listings.length}] ${listing.title.substring(0, 60)}...`);
        detail = await scrapeWatchDetail(page, detailUrl);
        await new Promise(r => setTimeout(r, DELAY_MS));
      }

      const row = transformToSchema(listing, detail, brandArg);
      row.brand_id = brandId;

      const embText = buildEmbeddingText(row);
      row.embedding = await generateEmbedding(embText);

      if (row.model_name) {
        batch.push(row);
      }
    }

    if (batch.length > 0) {
      const { error } = await supabase.from('watches').upsert(batch, { onConflict: 'source,source_id' });
      if (error) {
        console.error('Upsert error:', error);
      } else {
        totalInserted += batch.length;
        console.log(`Inserted ${batch.length} watches from page ${pageNum}`);
      }
    }
  }

  await browser.close();
  console.log(`\nDone! Total watches inserted: ${totalInserted}`);
}

main().catch(console.error);
