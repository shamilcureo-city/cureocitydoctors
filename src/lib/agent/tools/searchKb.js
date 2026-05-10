// search_kb tool handler — RAG retrieval via pgvector.
//
// Class A in the tool boundary. Returns top-k chunks; agent must cite the
// returned chunk_id values for any clinical claim.
//
// This handler runs server-side (in api/agent/turn.js). It needs:
//   - Supabase service role client (bypasses RLS for write to citations)
//   - Voyage-3 embedder
//
// In Sprint 0 we ship the scaffold; in Sprint 2 we wire embeddings + ingest.

import { createClient } from '@supabase/supabase-js';

let _supabaseService = null;
function getSupabaseService() {
  if (_supabaseService) return _supabaseService;
  const url = process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) {
    throw new Error('SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY required for search_kb');
  }
  _supabaseService = createClient(url, key, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  return _supabaseService;
}

// Voyage-3 embedding endpoint. Wrapped to allow swap for OpenAI later.
async function embedQuery(text) {
  const apiKey = process.env.VOYAGE_API_KEY;
  if (!apiKey) {
    throw new Error('VOYAGE_API_KEY required for query embedding');
  }
  const res = await fetch('https://api.voyageai.com/v1/embeddings', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${apiKey}`,
    },
    body: JSON.stringify({
      input: [text],
      model: 'voyage-3',
      input_type: 'query',
    }),
  });
  if (!res.ok) {
    const errText = await res.text().catch(() => '');
    throw new Error(`Voyage embed failed: ${res.status} ${errText}`);
  }
  const data = await res.json();
  return data?.data?.[0]?.embedding;
}

// Convert metadata filter to JSONB form expected by the RPC.
// The filter language is intentionally limited to AND-of-keys; complex
// queries can be added later if the agent needs them.
function toJsonbFilter(filters) {
  if (!filters) return {};
  const out = {};
  if (Array.isArray(filters.conditions) && filters.conditions.length) {
    out.conditions = filters.conditions;
  }
  if (Array.isArray(filters.drugs) && filters.drugs.length) {
    out.drugs = filters.drugs;
  }
  if (Array.isArray(filters.age_groups) && filters.age_groups.length) {
    out.age_groups = filters.age_groups;
  }
  if (filters.guideline) {
    out.guideline = filters.guideline;
  }
  return out;
}

export async function handleSearchKb({ query, filters, k = 5 }, _ctx = {}) {
  if (typeof query !== 'string' || !query.trim()) {
    return { error: 'query is required', items: [] };
  }
  const startedAt = Date.now();
  try {
    const embedding = await embedQuery(query);
    if (!Array.isArray(embedding)) {
      return { error: 'embedding_failed', items: [] };
    }

    const supabase = getSupabaseService();
    const { data, error } = await supabase.rpc('search_kb_chunks', {
      query_embedding: embedding,
      match_count: Math.max(1, Math.min(10, k)),
      metadata_filter: toJsonbFilter(filters),
    });

    if (error) {
      return { error: error.message, items: [] };
    }

    const items = (data || []).map(row => ({
      chunk_id: row.id,
      content: row.content,
      source_doc: row.source_doc,
      source_section: row.source_section,
      metadata: row.metadata,
      similarity: row.similarity,
    }));

    return {
      items,
      _meta: {
        latency_ms: Date.now() - startedAt,
        query_length: query.length,
        result_count: items.length,
      },
    };
  } catch (err) {
    return {
      error: err?.message || String(err),
      items: [],
      _meta: { latency_ms: Date.now() - startedAt },
    };
  }
}
