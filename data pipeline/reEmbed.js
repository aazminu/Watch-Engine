/**
 * One-time migration script: regenerate all watch embeddings
 * using local Ollama (nomic-embed-text, 768 dimensions) with enriched text.
 *
 * Prerequisites:
 *   1. Ollama running: `ollama serve`
 *   2. Model pulled: `ollama pull nomic-embed-text`
 *   3. DB column already altered to VECTOR(768)
 *
 * Usage: node "data pipeline/reEmbed.js"
 */

import { Ollama } from 'ollama';
import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';
import path from 'path';

dotenv.config({ path: path.resolve(process.cwd(), '.env') });

const supabase = createClient(
  process.env.VITE_SUPABASE_URL,
  process.env.VITE_SUPABASE_ANON_KEY
);

const ollama = new Ollama({ host: process.env.OLLAMA_HOST || 'http://localhost:11434' });
const BATCH_SIZE = 20;
const PAGE_SIZE = 100;

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
  const response = await ollama.embeddings({
    model: 'nomic-embed-text',
    prompt: `search_document: ${text}`,
  });
  return response.embedding;
}

async function reEmbedAll() {
  let offset = 0;
  let totalUpdated = 0;

  console.log('Starting re-embedding of all watches...');

  while (true) {
    // Fetch watches that don't have embeddings yet (resume-safe)
    const { data: watches, error } = await supabase
      .from('watches')
      .select('id, model_name, family_name, movement_name, function_name, dial_color, year_produced, price_eur, limited_edition, description')
      .is('embedding', null)
      .limit(PAGE_SIZE);

    if (error) {
      console.error('Fetch error:', error);
      break;
    }

    if (!watches || watches.length === 0) {
      console.log('No more watches to process.');
      break;
    }

    console.log(`Processing ${watches.length} watches (offset ${offset})...`);

    // Process in batches
    for (let i = 0; i < watches.length; i += BATCH_SIZE) {
      const batch = watches.slice(i, i + BATCH_SIZE);

      const updates = await Promise.all(
        batch.map(async (watch) => {
          const text = buildEmbeddingText(watch);
          const embedding = await generateEmbedding(text);
          return { id: watch.id, embedding };
        })
      );

      // Update each row
      for (const { id, embedding } of updates) {
        const { error: updateError } = await supabase
          .from('watches')
          .update({ embedding })
          .eq('id', id);

        if (updateError) {
          console.error(`Error updating watch ${id}:`, updateError);
        } else {
          totalUpdated++;
        }
      }

      console.log(`  Updated ${Math.min(i + BATCH_SIZE, watches.length)}/${watches.length} in this page`);
    }

    // No offset needed — we always fetch the next batch with null embeddings
  }

  console.log(`Done! Re-embedded ${totalUpdated} watches.`);
}

reEmbedAll();
