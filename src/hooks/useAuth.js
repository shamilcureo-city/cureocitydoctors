import { useEffect, useState } from 'react';
import { getSession, onAuthStateChange } from '../lib/auth';
import { supabaseConfigured } from '../lib/supabaseClient';

export function useAuth() {
  const [session, setSession] = useState(null);
  const [loading, setLoading] = useState(supabaseConfigured);

  useEffect(() => {
    let cancelled = false;

    if (!supabaseConfigured) {
      // initial state is already loading:false in this case — nothing to do
      return () => {};
    }

    getSession().then(({ data }) => {
      if (cancelled) return;
      setSession(data.session ?? null);
      setLoading(false);
    });

    const subscription = onAuthStateChange((next) => {
      setSession(next ?? null);
    });

    return () => {
      cancelled = true;
      subscription.unsubscribe?.();
    };
  }, []);

  return {
    session,
    user: session?.user ?? null,
    loading,
    cloudEnabled: supabaseConfigured,
  };
}
