const Sidebar = ({ steps, onStepClick }) => {
  return (
    <nav className="step-nav">
      <div className="step-nav-title">Workflow</div>
      
      {steps.map((step) => (
        <div 
          key={step.id} 
          className={`step-item ${step.active ? 'active' : ''} ${step.locked ? 'locked' : ''}`}
          onClick={() => onStepClick(step.id)}
          style={{ cursor: step.locked ? 'not-allowed' : 'pointer' }}
        >
          <div className="step-num">{step.id}</div>
          <div>
            <div className="step-label">{step.label}</div>
            <div className="step-sublabel">{step.sublabel}</div>
          </div>
        </div>
      ))}
    </nav>
  );
};

export default Sidebar;
