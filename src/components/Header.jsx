function patientLabel(patient) {
  if (!patient) return null;
  const parts = [];
  if (patient.age != null && patient.age !== '') parts.push(`${patient.age}y`);
  if (patient.gender === 'F') parts.push('Female');
  else if (patient.gender === 'M') parts.push('Male');
  else if (patient.gender === 'O') parts.push('Other');
  return parts.length ? parts.join(' ') : null;
}

const Header = ({ user, onSignOut, patient, steps, activeStep, onOpenNotes, onNewCase }) => {
  const label = patientLabel(patient);

  return (
    <header className="app-header">
      <div className="logo">
        <div className="logo-mark">Cx</div>
        <div className="logo-name">Cureocity Clinical Assistant</div>
        <div className="logo-version">v5.0 · Kerala</div>
      </div>
      <div className="header-right">
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
