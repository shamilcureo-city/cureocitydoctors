import { useState } from 'react';
import { logEvent } from '../utils/auditLog';

const SESSION_KEY = 'cx_disclaimer_dismissed_v1';

const DisclaimerBanner = () => {
  const [dismissed, setDismissed] = useState(
    () => sessionStorage.getItem(SESSION_KEY) === '1'
  );

  if (dismissed) return null;

  const handleDismiss = () => {
    sessionStorage.setItem(SESSION_KEY, '1');
    logEvent('disclaimer.acknowledged', {});
    setDismissed(true);
  };

  return (
    <div className="disclaimer-banner" role="alert">
      <div className="disclaimer-banner-icon" aria-hidden="true">⚕️</div>
      <div className="disclaimer-banner-text">
        <strong>Clinical decision support — not a substitute for medical judgement.</strong>{' '}
        All differentials, drug suggestions and risk scores are advisory. The treating clinician
        is responsible for the final decision. Per the Telemedicine Practice Guidelines (2020).
      </div>
      <button
        className="disclaimer-banner-dismiss"
        onClick={handleDismiss}
        aria-label="Acknowledge disclaimer"
      >
        I understand
      </button>
    </div>
  );
};

export default DisclaimerBanner;
