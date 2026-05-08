import { lazy, Suspense, useEffect, useState } from 'react';
import Landing from './components/Landing';
import Auth from './components/Auth';
import { useAuth } from './hooks/useAuth';

import { setAuditDoctorId, logEvent } from './utils/auditLog';
import { identify, track, resetIdentity } from './lib/analytics';
import { setUserContext } from './lib/errorReporting';

// Lazy-load the 8.3k-line clinical engine (and the workflow that uses it)
// so Landing/Auth first-paint stays fast on Indian 4G.
const WorkflowApp = lazy(() => import('./components/WorkflowApp'));

const VIEW_KEY = 'cx_view_v1';

function WorkflowFallback() {
  return (
    <div className="app-loading">
      <div className="logo">
        <div className="logo-mark">Cx</div>
        <div className="logo-name">Cureocity</div>
      </div>
      <div className="app-loading-spinner" />
    </div>
  );
}

function App() {
  const { user, loading, cloudEnabled } = useAuth();
  const [view, setView] = useState(
    () => sessionStorage.getItem(VIEW_KEY) || 'landing'
  );

  useEffect(() => {
    sessionStorage.setItem(VIEW_KEY, view);
  }, [view]);

  useEffect(() => {
    setAuditDoctorId(user?.id ?? null);
    setUserContext(user);
    if (user) {
      identify(user.id, { email: user.email });
      track('app.signedIn', {});
      logEvent('auth.session.active', {});
    } else {
      resetIdentity();
    }
  }, [user]);

  if (loading) {
    return (
      <div className="app-loading">
        <div className="logo">
          <div className="logo-mark">Cx</div>
          <div className="logo-name">Cureocity</div>
        </div>
        <div className="app-loading-spinner" />
      </div>
    );
  }

  // Local-only mode: no cloud configured. Skip auth entirely.
  if (!cloudEnabled) {
    return (
      <Suspense fallback={<WorkflowFallback />}>
        <WorkflowApp user={null} />
      </Suspense>
    );
  }

  if (user) {
    return (
      <Suspense fallback={<WorkflowFallback />}>
        <WorkflowApp user={user} />
      </Suspense>
    );
  }

  if (view === 'landing') {
    return <Landing onContinue={() => setView('auth')} />;
  }

  return <Auth />;
}

export default App;
