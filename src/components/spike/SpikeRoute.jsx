// SpikeRoute — throwaway wrapper that mounts LiveTranscriptSpike for the
// Sprint 0/1 end-to-end check. Pulls the Supabase access token from the
// active session and assigns a fresh consultationId on mount.
//
// Delete in Sprint 5 along with LiveTranscriptSpike.

import { useMemo } from 'react';
import { useAuth } from '../../hooks/useAuth';
import Auth from '../Auth';
import { LiveTranscriptSpike } from './LiveTranscriptSpike.jsx';

function randomConsultationId() {
  if (typeof crypto !== 'undefined' && crypto.randomUUID) return crypto.randomUUID();
  return 'spike-' + Math.random().toString(36).slice(2, 10) + '-' + Date.now();
}

export default function SpikeRoute() {
  const { session, user, loading, cloudEnabled } = useAuth();
  const consultationId = useMemo(() => randomConsultationId(), []);

  if (!cloudEnabled) {
    return (
      <div style={notice}>
        Supabase is not configured — the realtime Worker requires a Supabase JWT.
        Set <code>VITE_SUPABASE_URL</code> and <code>VITE_SUPABASE_ANON_KEY</code> and reload.
      </div>
    );
  }
  if (loading) return <div style={notice}>Loading session…</div>;
  if (!user) return <Auth />;

  return (
    <LiveTranscriptSpike
      consultationId={consultationId}
      doctorId={user.id}
      orgId={user.user_metadata?.org_id || ''}
      authToken={session?.access_token || ''}
    />
  );
}

const notice = {
  fontFamily: 'IBM Plex Sans, system-ui, sans-serif',
  padding: 24,
  color: '#374151',
};
