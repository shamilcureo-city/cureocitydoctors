const Header = ({ user, onSignOut }) => {
  return (
    <header className="app-header">
      <div className="logo">
        <div className="logo-mark">Cx</div>
        <div className="logo-name">Cureocity Clinical Assistant</div>
        <div className="logo-version">v5.0 · Kerala</div>
      </div>
      <div className="header-right">
        <div className="patient-badge">
          <span>🧑‍⚕️</span>
          <div>
            <div style={{ fontSize: '11px', color: 'var(--ink3)' }}>Active Case</div>
            <strong id="hdr-age-gender">—</strong>
          </div>
        </div>
        <div className="progress-dots" id="progress-dots"></div>
        <button className="btn btn-sm btn-secondary">📝 Notes</button>
        <button className="btn btn-sm btn-secondary">New Case</button>
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
