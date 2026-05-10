import { supabase, supabaseConfigured } from './supabaseClient';

export async function signInWithEmail(email) {
  if (!supabaseConfigured) {
    return { error: { message: 'Cloud sync not configured. Running in local-only mode.' } };
  }
  const { error } = await supabase.auth.signInWithOtp({
    email,
    options: { emailRedirectTo: window.location.origin },
  });
  return { error };
}

export async function signInWithPhone(phone) {
  if (!supabaseConfigured) {
    return { error: { message: 'Cloud sync not configured. Running in local-only mode.' } };
  }
  const { error } = await supabase.auth.signInWithOtp({ phone });
  return { error };
}

export async function verifyPhoneOtp(phone, token) {
  if (!supabaseConfigured) {
    return { error: { message: 'Cloud sync not configured.' }, data: null };
  }
  return supabase.auth.verifyOtp({ phone, token, type: 'sms' });
}

export async function signOut() {
  if (!supabaseConfigured) return { error: null };
  return supabase.auth.signOut();
}

export async function getSession() {
  if (!supabaseConfigured) return { data: { session: null }, error: null };
  return supabase.auth.getSession();
}

export function onAuthStateChange(handler) {
  if (!supabaseConfigured) {
    handler(null);
    return { unsubscribe: () => {} };
  }
  const { data } = supabase.auth.onAuthStateChange((_event, session) => handler(session));
  return data.subscription;
}
