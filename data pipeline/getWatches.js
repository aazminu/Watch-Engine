import { Ollama } from 'ollama';
import axios from 'axios';
import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';
import path from 'path';

dotenv.config({ path: path.resolve(process.cwd(), '.env') });

const supabase = createClient(
  process.env.VITE_SUPABASE_URL,
  process.env.VITE_SUPABASE_ANON_KEY
);

// SETTINGS
const MAKE_ID = 31;
const LIMIT = 20;
const TABLE_NAME = 'watches';
const BASE_URL = 'https://watch-database1.p.rapidapi.com/watches/make';
const ollama = new Ollama({ host: process.env.OLLAMA_HOST || 'http://localhost:11434' });

// Helper function to extract dial color from model name
function extractDialColorFromModelName(modelName) {
  const parts = modelName.split('/');
  const dialColor = parts[parts.length - 1].trim();
  return dialColor || null;
}

// Build rich embedding text from all watch fields
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

// Generate embedding using local Ollama (nomic-embed-text, 768 dimensions)
async function generateEmbedding(text) {
  try {
    const response = await ollama.embeddings({
      model: 'nomic-embed-text',
      prompt: `search_document: ${text}`,
    });
    return response.embedding;
  } catch (error) {
    console.error('Error generating embedding:', error.message);
    return null;
  }
}

async function fetchAndInsertAllPages() {
  let page = 1;

  while (true) {
    const url = `${BASE_URL}/${MAKE_ID}/page/${page}/limit/${LIMIT}`;
    const options = {
      method: 'GET',
      url,
      headers: {
        'x-rapidapi-key': process.env.RAPIDAPI_KEY,
        'x-rapidapi-host': 'watch-database1.p.rapidapi.com',
      }
    };

    try {
      const response = await axios.request(options);
      const watches = response.data.watches;

      if (!watches || watches.length === 0) {
        console.log(`No more data on page ${page}. Finished.`);
        break;
      }

      const insertBatch = [];

      for (const w of watches) {
        if (!w.modelName) {
          console.log(`Skipping watch with missing model: ${w.reference || 'unknown reference'}`);
          continue;
        }

        const dialColor = extractDialColorFromModelName(w.modelName);

        // Build the row first so we can use all fields for embedding
        const row = {
          source_id: w.watchId != null ? String(w.watchId) : null,
          reference: w.reference || null,
          brand_id: MAKE_ID,
          model_name: w.modelName,
          family_name: w.familyName || null,
          movement_name: w.movementName || null,
          function_name: w.functionName || null,
          year_produced: w.yearProducedName || null,
          limited_edition: w.limitedName || null,
          price_eur: parseFloat(w.priceInEuro) || null,
          image_url: w.url || null,
          image_filename: w.watchImageName || null,
          description: w.descriptionContent || null,
          dial_color: dialColor,
          raw_data: w,
          source: 'Watch Database API',
          created_at: new Date().toISOString(),
          last_updated: new Date().toISOString(),
        };

        // Generate enriched embedding from ALL fields
        const embeddingText = buildEmbeddingText(row);
        const embedding = await generateEmbedding(embeddingText);
        row.embedding = embedding;

        insertBatch.push(row);
      }

      if (insertBatch.length === 0) {
        console.log(`No valid watches to insert on page ${page}`);
      } else {
        const { error } = await supabase
          .from(TABLE_NAME)
          .upsert(insertBatch, { onConflict: 'source,source_id' });

        if (error) {
          console.error(`Insert error on page ${page}:`, error);
          break;
        }

        console.log(`Inserted ${insertBatch.length} watches from page ${page}`);
      }

      page++;
      await new Promise(res => setTimeout(res, 1100));

    } catch (err) {
      console.error(`Fetch error on page ${page}:`, err.message);
      break;
    }
  }
}

fetchAndInsertAllPages();
