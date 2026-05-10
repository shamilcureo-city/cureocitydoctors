// Supabase JWT verification by calling /auth/v1/user with the token.
// Cheaper to verify the JWT signature locally with the Supabase JWT
// secret, but calling the user endpoint is simpler and avoids storing
// another secret. Gemini Live latency dominates anyway.
//
// Returns:
//   { ok: true,  userId: string }
//   { ok: false, reason: string }

export async function authenticateRequest(req, env) {
  const url = new URL(req.url);
  const token =
    url.searchParams.get('token') ||
    (req.headers.get('authorization')?.startsWith('Bearer ')
      ? req.headers.get('authorization').slice(7)
      : null);

  if (!token) return { ok: false, reason: 'no_token' };
  if (!env.SUPABASE_URL || !env.SUPABASE_ANON_KEY) {
    return { ok: false, reason: 'auth_misconfigured' };
  }

  try {
    const res = await fetch(`${env.SUPABASE_URL}/auth/v1/user`, {
      headers: {
        Authorization: `Bearer ${token}`,
        apikey: env.SUPABASE_ANON_KEY,
      },
    });
    if (!res.ok) return { ok: false, reason: `auth_${res.status}` };
    const data = await res.json();
    if (!data?.id) return { ok: false, reason: 'no_user_in_response' };
    return { ok: true, userId: data.id };
  } catch (err) {
    return { ok: false, reason: err?.message || 'auth_fetch_failed' };
  }
}
