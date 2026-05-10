function patientLabel(patient) {
  if (!patient) return null;
  const parts = [];
  if (patient.age != null && patient.age !== '') parts.push(`${patient.age}y`);
  if (patient.gender === 'F') parts.push('Female');
  else if (patient.gender === 'M') parts.push('Male');
  else if (patient.gender === 'O') parts.push('Other');
  return parts.length ? parts.join(' ') : null;
}

function orgTypeIcon(type) {
  return type === 'hospital' ? '🏥'
       : type === 'clinic' ? '🩺'
       : type === 'pharma_panel' ? '💊'
       : '👤';
}

const Header = ({
  user, onSignOut, patient, steps, activeStep, onOpenNotes, onNewCase,
  // Phase 3 — clinic context
  activeOrg,             // { id, name, type, ... }
  myOrgs,                // [{ org_id, role, organizations: {...} }]
  onSwitchOrg,           // (orgId) => void
  onExportBilling,       // () => Promise<void>
}) => {
  const label = patientLabel(patient);
  const isOrgOwner = myOrgs?.some(m => m.org_id === activeOrg?.id && m.role === 'org_owner');
  const hasMultipleOrgs = (myOrgs?.length || 0) > 1;

  return (
    <header className="app-header">
      <div className="logo">
        <div className="logo-mark">Cx</div>
        <div className="logo-name">Cureocity Clinical Assistant</div>
        <div className="logo-version">v5.0 · Kerala</div>
      </div>
      <div className="header-right">
        {/* Org indicator + switcher */}
        {activeOrg && (
          <div
            style={{
              display: 'flex', alignItems: 'center', gap: '8px',
              padding: '4px 10px', background: 'var(--surface2)',
              border: '1px solid var(--border)', borderRadius: 'var(--r)',
              fontSize: '12px',
            }}
            title={`${activeOrg.type} · role: ${myOrgs?.find(m => m.org_id === activeOrg.id)?.role || 'member'}`}
          >
            <span style={{ fontSize: '14px' }}>{orgTypeIcon(activeOrg.type)}</span>
            {hasMultipleOrgs && onSwitchOrg ? (
              <select
                value={activeOrg.id}
                onChange={e => onSwitchOrg(e.target.value)}
                style={{
                  border: 'none', background: 'transparent', fontSize: '12px',
                  fontWeight: 600, color: 'var(--ink)', cursor: 'pointer',
                  padding: 0, outline: 'none',
                }}
              >
                {myOrgs.map(m => (
                  <option key={m.org_id} value={m.org_id}>
                    {m.organizations?.name || m.org_id}
                  </option>
                ))}
              </select>
            ) : (
              <strong style={{ color: 'var(--ink)' }}>{activeOrg.name}</strong>
            )}
            {isOrgOwner && (
              <span
                className="badge badge-ok"
                style={{ fontSize: '8.5px', marginLeft: '4px' }}
                title="You are the owner of this organization"
              >
                OWNER
              </span>
            )}
          </div>
        )}

        {/* Owner-only billing export */}
        {isOrgOwner && onExportBilling && (
          <button
            className="btn btn-sm btn-secondary"
            onClick={onExportBilling}
            title="Export this org's consultations and prescriptions as CSV (last 30 days)"
          >
            📊 Export
          </button>
        )}

        {label && (
          <div className="patient-badge">
            <span>🧑‍⚕️</span>
            <div>
              <div style={{ fontSize: '11px', color: 'var(--ink3)' }}>Active Case</div>
              <strong>{label}</strong>
            </div>
          </div>
        )}

        {Array.isArray(steps) && steps.length > 0 && (
          <div className="progress-dots" title={`Step ${activeStep} of ${steps.length}`}>
            {steps.map((s) => {
              const isActive = s.id === activeStep;
              const isDone   = !s.locked && s.id < activeStep;
              return (
                <div
                  key={s.id}
                  className={`dot ${isActive ? 'active' : isDone ? 'done' : ''}`}
                  title={s.label}
                />
              );
            })}
          </div>
        )}

        <button className="btn btn-sm btn-secondary" onClick={onOpenNotes} title="Clinical Notes (⌘/Ctrl+N)">
          📝 Notes
        </button>
        <button className="btn btn-sm btn-secondary" onClick={onNewCase}>
          New Case
        </button>
        {user && (
          <>
            <span className="header-user" title={user.email || user.phone || ''}>
              {(user.email || user.phone || '').split('@')[0]}
            </span>
            <button className="btn btn-sm btn-secondary" onClick={onSignOut}>Sign out</button>
          </>
        )}
      </div>
    </header>
  );
};

export default Header;
