/**
 * Server-side AI cost cap enforcement.
 *
 * Each /api/ai/* and /api/intake/* endpoint calls checkOrgBudget(orgId)
 * before invoking Gemini or Claude. If the org has spent ≥ its
 * daily_ai_cost_cap_inr today, the call is blocked with a 429.
 *
 * Cost is measured in the existing public.ai_calls table (cost_inr column).
 * Today is computed in the org's local timezone (Asia/Kolkata for India).
 *
 * Why: one runaway client doing thousands of consults overnight can rack up
 * tens of thousands of rupees of Gemini/Claude bills. The cap is a safety
 * fuse — clinics on Phase 5 paid pilots get configured caps; the default
 * is ₹2000/day per org which is enough for ~300-500 consults.
 *
 * Requires the SUPABASE_SERVICE_ROLE_KEY to read across orgs.
 */

import { createClient } from '@supabase/supabase-js';

let _adminClient = null;
function adminClient() {
  if (_adminClient) return _adminClient;
  const url = process.env.VITE_SUPABASE_URL || process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) {
    throw new Error('Supabase admin client misconfigured (need VITE_SUPABASE_URL + SUPABASE_SERVICE_ROLE_KEY)');
  }
  _adminClient = createClient(url, key, { auth: { persistSession: false } });
  return _adminClient;
}

/**
 * Returns the start of "today" in IST (Asia/Kolkata) as an ISO string.
 * Daily caps reset at midnight IST.
 */
function startOfDayIstIso() {
  // IST is UTC+5:30
  const now = new Date();
  const istOffsetMin = 330;
  const utcMs = now.getTime() + now.getTimezoneOffset() * 60_000;
  const istMs = utcMs + istOffsetMin * 60_000;
  const istNow = new Date(istMs);
  istNow.setUTCHours(0, 0, 0, 0);
  // Convert back to UTC by subtracting the IST offset
  return new Date(istNow.getTime() - istOffsetMin * 60_000).toISOString();
}

/**
 * Sums today's ai_calls.cost_inr across all members of an org.
 *
 * Returns { todaySpendInr, capInr, blocked, nearCap }
 *   - blocked  = todaySpendInr >= capInr
 *   - nearCap  = todaySpendInr >= 0.8 * capInr (warning threshold)
 *
 * If orgId is null or anything fails, returns blocked=false (fail-open).
 * Failing-open is the right call here because the cost cap is a safety
 * fuse, not a license check; we shouldn't make Gemini unavailable to
 * doctors because of a transient DB hiccup.
 */
export async function checkOrgBudget(orgId) {
  if (!orgId) return { todaySpendInr: 0, capInr: null, blocked: false, nearCap: false };

  let admin;
  try { admin = adminClient(); }
  catch (e) {
    console.warn('[budgetCheck] admin client unavailable, failing open:', e.message);
    return { todaySpendInr: 0, capInr: null, blocked: false, nearCap: false };
  }

  try {
    // Read the org's cap
    const { data: org, error: orgErr } = await admin
      .from('organizations')
      .select('daily_ai_cost_cap_inr')
      .eq('id', orgId)
      .maybeSingle();
    if (orgErr || !org) {
      return { todaySpendInr: 0, capInr: null, blocked: false, nearCap: false };
    }
    const capInr = Number(org.daily_ai_cost_cap_inr);

    // Read all member user_ids for this org
    const { data: members, error: memErr } = await admin
      .from('org_memberships')
      .select('user_id')
      .eq('org_id', orgId)
      .eq('is_active', true);
    if (memErr || !members?.length) {
      return { todaySpendInr: 0, capInr, blocked: false, nearCap: false };
    }
    const memberIds = members.map(m => m.user_id);

    // Sum today's spend across all members
    const sinceIso = startOfDayIstIso();
    const { data: rows, error: spendErr } = await admin
      .from('ai_calls')
      .select('cost_inr')
      .in('doctor_id', memberIds)
      .gte('created_at', sinceIso);
    if (spendErr) {
      return { todaySpendInr: 0, capInr, blocked: false, nearCap: false };
    }

    const todaySpendInr = (rows || [])
      .reduce((sum, r) => sum + (Number(r.cost_inr) || 0), 0);

    return {
      todaySpendInr: Number(todaySpendInr.toFixed(4)),
      capInr,
      blocked: todaySpendInr >= capInr,
      nearCap: todaySpendInr >= 0.8 * capInr,
    };
  } catch (err) {
    console.warn('[budgetCheck] fail-open:', err.message);
    return { todaySpendInr: 0, capInr: null, blocked: false, nearCap: false };
  }
}

/**
 * Convenience: build a 429 Response when blocked.
 */
export function budgetBlockedResponse(check) {
  return new Response(JSON.stringify({
    error: 'Daily AI cost cap reached for your organization. Try again tomorrow or contact your admin.',
    today_spend_inr: check.todaySpendInr,
    cap_inr: check.capInr,
  }), {
    status: 429,
    headers: { 'content-type': 'application/json' },
  });
}
