// Deterministic red-flag matcher.
//
// Loads the active phrases from public.red_flag_phrases on session
// start, then runs string-contains (case-insensitive) match against
// every transcript chunk. Matches are emitted to the client AND
// persisted as agent.red_flag events for audit.
//
// This runs IN ADDITION to whatever the LLM agent does. The agent
// might catch nuanced phrasing the regex misses; the regex catches
// exact phrases the agent might miss. Belt + suspenders.

const REDFLAG_CACHE_TTL_MS = 60_000;
let _cache = null;
let _cacheLoadedAt = 0;

export async function loadRedFlagPhrases(env) {
  const now = Date.now();
  if (_cache && now - _cacheLoadedAt < REDFLAG_CACHE_TTL_MS) {
    return _cache;
  }

  if (!env.SUPABASE_URL || !env.SUPABASE_SERVICE_ROLE_KEY) {
    return [];
  }

  const url = `${env.SUPABASE_URL}/rest/v1/red_flag_phrases?is_active=eq.true&select=phrase,severity,category,recommended_action,language,match_type`;
  const res = await fetch(url, {
    headers: {
      apikey: env.SUPABASE_SERVICE_ROLE_KEY,
      Authorization: `Bearer ${env.SUPABASE_SERVICE_ROLE_KEY}`,
    },
  });
  if (!res.ok) {
    throw new Error(`load red_flag_phrases ${res.status}`);
  }

  const rows = await res.json();
  // Pre-lowercase phrases for fast contains check.
  _cache = rows.map(r => ({
    ...r,
    phrase_lower: r.phrase.toLowerCase(),
  }));
  _cacheLoadedAt = now;
  return _cache;
}

// Returns array of matched red flag descriptors (no dedup against history;
// caller may dedupe by phrase if they want).
export function matchRedFlags(text, phrases) {
  if (!text) return [];
  const t = text.toLowerCase();
  const out = [];
  for (const p of phrases) {
    if (p.match_type === 'regex') {
      try {
        if (new RegExp(p.phrase, 'i').test(text)) out.push(p);
      } catch { /* bad regex; skip */ }
    } else {
      if (t.includes(p.phrase_lower)) out.push(p);
    }
  }
  return out;
}
