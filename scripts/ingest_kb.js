#!/usr/bin/env node
// scripts/ingest_kb.js
//
// One-shot ingestion: read clinical KB documents, chunk them, embed with
// Voyage-3, and insert into kb_chunks. Records the run in kb_versions
// and (optionally) marks the new version active.
//
// Sprint 0 scaffold; Sprint 2 wires it to the real corpus.
//
// Usage:
//   GEMINI_API_KEY=... VOYAGE_API_KEY=... \
//   SUPABASE_URL=... SUPABASE_SERVICE_ROLE_KEY=... \
//   node scripts/ingest_kb.js \
//       --source docs/kb-corpus/ \
//       --version v2026-05-10 \
//       --activate
//
// Inputs (in --source):
//   *.md or *.json files. Each file is one source_doc; sections are
//   sliced at h2 boundaries (md) or per `sections[]` entry (json).
//
// Outputs:
//   - kb_versions row
//   - N kb_chunks rows
//   - corpus hash (sha256 of input contents) for traceability

import { createClient } from '@supabase/supabase-js';
import { readFile, readdir } from 'node:fs/promises';
import { resolve, join, extname, basename } from 'node:path';
import { createHash } from 'node:crypto';
import process from 'node:process';

const args = parseArgs(process.argv.slice(2));
const SOURCE_DIR = args.source || './docs/kb-corpus';
const KB_VERSION = args.version || `v${new Date().toISOString().slice(0, 10)}`;
const ACTIVATE = !!args.activate;
const DRY_RUN = !!args['dry-run'];

const VOYAGE_API_KEY = process.env.VOYAGE_API_KEY;
const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
const EMBED_MODEL = process.env.KB_EMBED_MODEL || 'voyage-3';
const TARGET_TOKENS = Number(process.env.KB_CHUNK_TOKENS || 500);

if (!VOYAGE_API_KEY && !DRY_RUN) die('VOYAGE_API_KEY required');
if ((!SUPABASE_URL || !SUPABASE_KEY) && !DRY_RUN) die('SUPABASE creds required');

const sb = (!DRY_RUN)
  ? createClient(SUPABASE_URL, SUPABASE_KEY, {
      auth: { persistSession: false, autoRefreshToken: false },
    })
  : null;

(async () => {
  console.log(`[ingest_kb] source=${SOURCE_DIR} version=${KB_VERSION} activate=${ACTIVATE} dry=${DRY_RUN}`);
  const files = await listSourceFiles(SOURCE_DIR);
  if (files.length === 0) die(`no source files in ${SOURCE_DIR}`);
  console.log(`[ingest_kb] found ${files.length} source files`);

  const corpusHasher = createHash('sha256');
  const allChunks = [];

  for (const file of files) {
    const buf = await readFile(file, 'utf8');
    corpusHasher.update(buf);
    const sourceDoc = basename(file);
    const ext = extname(file).toLowerCase();

    let sections;
    if (ext === '.md') {
      sections = sliceMarkdown(buf);
    } else if (ext === '.json') {
      sections = sliceJson(buf);
    } else {
      console.warn(`[ingest_kb] skipping unsupported file: ${file}`);
      continue;
    }

    for (const section of sections) {
      const subChunks = chunkSection(section.content, TARGET_TOKENS);
      for (const content of subChunks) {
        allChunks.push({
          source_doc: sourceDoc,
          source_section: section.title,
          content,
          metadata: section.metadata || {},
          token_count: estimateTokens(content),
        });
      }
    }
  }

  console.log(`[ingest_kb] total chunks: ${allChunks.length}`);

  // Embed in batches
  const BATCH = 32;
  const embedded = [];
  for (let i = 0; i < allChunks.length; i += BATCH) {
    const batch = allChunks.slice(i, i + BATCH);
    const embeddings = DRY_RUN
      ? batch.map(() => null)
      : await embedBatch(batch.map(c => c.content));
    for (let j = 0; j < batch.length; j++) {
      embedded.push({ ...batch[j], embedding: embeddings[j] });
    }
    console.log(`[ingest_kb] embedded ${Math.min(i + BATCH, allChunks.length)}/${allChunks.length}`);
  }

  if (DRY_RUN) {
    console.log('[ingest_kb] DRY RUN — not writing to DB');
    console.log(JSON.stringify(embedded.slice(0, 2), null, 2));
    return;
  }

  // Insert kb_versions row first
  const corpusHash = corpusHasher.digest('hex');
  const { error: vErr } = await sb.from('kb_versions').insert({
    version: KB_VERSION,
    embedding_model: EMBED_MODEL,
    chunk_count: embedded.length,
    source_corpus_hash: corpusHash,
    is_active: false,  // toggled at end if --activate
  });
  if (vErr) die(`insert kb_versions: ${vErr.message}`);

  // Insert chunks in batches
  for (let i = 0; i < embedded.length; i += 200) {
    const batch = embedded.slice(i, i + 200).map(c => ({
      source_doc: c.source_doc,
      source_section: c.source_section,
      content: c.content,
      embedding: c.embedding,
      kb_version: KB_VERSION,
      metadata: c.metadata,
      token_count: c.token_count,
    }));
    const { error: cErr } = await sb.from('kb_chunks').insert(batch);
    if (cErr) die(`insert kb_chunks: ${cErr.message}`);
    console.log(`[ingest_kb] inserted ${Math.min(i + 200, embedded.length)}/${embedded.length} chunks`);
  }

  if (ACTIVATE) {
    // Deactivate all, then activate the new one — single-active constraint
    await sb.from('kb_versions').update({ is_active: false }).neq('version', KB_VERSION);
    await sb.from('kb_versions').update({ is_active: true }).eq('version', KB_VERSION);
    console.log(`[ingest_kb] activated ${KB_VERSION}`);
  }

  console.log('[ingest_kb] done');
})().catch(err => {
  console.error('[ingest_kb] FAILED', err);
  process.exit(1);
});

// ───────────────────────────────────────────────────────────────────

async function listSourceFiles(dir) {
  let entries;
  try { entries = await readdir(dir); }
  catch { return []; }
  return entries
    .filter(f => /\.(md|json)$/i.test(f))
    .map(f => resolve(join(dir, f)));
}

function sliceMarkdown(text) {
  const sections = [];
  const lines = text.split('\n');
  let title = 'preamble';
  let buf = [];
  for (const line of lines) {
    const m = /^##\s+(.+)$/.exec(line);
    if (m) {
      if (buf.length) sections.push({ title, content: buf.join('\n') });
      title = m[1].trim();
      buf = [];
    } else {
      buf.push(line);
    }
  }
  if (buf.length) sections.push({ title, content: buf.join('\n') });
  return sections.filter(s => s.content.trim().length > 0);
}

function sliceJson(text) {
  const obj = JSON.parse(text);
  const sections = obj.sections || [obj];
  return sections.map(s => ({
    title: s.title || s.section || 'untitled',
    content: s.content || s.text || '',
    metadata: s.metadata || {},
  }));
}

function chunkSection(text, targetTokens) {
  // Approx 4 chars per token. Cut on paragraph boundaries when possible.
  const paragraphs = text.split(/\n\s*\n/);
  const out = [];
  let buf = [];
  let bufTokens = 0;
  for (const p of paragraphs) {
    const pT = estimateTokens(p);
    if (bufTokens + pT > targetTokens && buf.length) {
      out.push(buf.join('\n\n'));
      buf = [];
      bufTokens = 0;
    }
    buf.push(p);
    bufTokens += pT;
  }
  if (buf.length) out.push(buf.join('\n\n'));
  return out.filter(c => c.trim().length > 0);
}

function estimateTokens(s) {
  return Math.ceil(s.length / 4);
}

async function embedBatch(texts) {
  const res = await fetch('https://api.voyageai.com/v1/embeddings', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${VOYAGE_API_KEY}`,
    },
    body: JSON.stringify({
      input: texts,
      model: EMBED_MODEL,
      input_type: 'document',
    }),
  });
  if (!res.ok) {
    const err = await res.text().catch(() => '');
    die(`Voyage embed failed: ${res.status} ${err}`);
  }
  const data = await res.json();
  return (data?.data || []).map(d => d.embedding);
}

function parseArgs(argv) {
  const out = {};
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a.startsWith('--')) {
      const key = a.slice(2);
      const next = argv[i + 1];
      if (next && !next.startsWith('--')) {
        out[key] = next;
        i++;
      } else {
        out[key] = true;
      }
    }
  }
  return out;
}

function die(msg) {
  console.error(`[ingest_kb] ${msg}`);
  process.exit(1);
}
