/**
 * Indian prescription timing + drug-form helpers.
 *
 * Pure functions — no engine state, no DOM, no side effects.
 * Used by:
 *   - PrescriptionPanel printable Rx (1-0-1 grid + Tab./Inj. prefix)
 *   - SOAP note generation
 *   - Referral letter
 *
 * If you change a mapping here, the printable Rx output changes
 * for every doctor immediately. Update tests in
 * src/engine/__tests__/engine.test.js if you do.
 */

// ── INDIAN PRESCRIPTION TIMING MAPPER ───────────────────────────
// Converts frequency strings (BD / TDS / OD / PRN / etc.) to the
// India-standard 1-0-1 grid format used on every printed prescription.
export function mapToIndianTiming(freq, route) {
  if (!freq) return '1-0-0';
  const f = freq.toLowerCase().trim();
  const isInjection = route && (
    route.toLowerCase().includes('iv') ||
    route.toLowerCase().includes('im') ||
    route.toLowerCase().includes('sc') ||
    route.toLowerCase().includes('injection')
  );
  if (isInjection) return freq; // Keep as-is for injections

  // OD patterns
  if (f.includes('od') || f.includes('once daily') || f === '1×/day' || f.includes('once a day')) {
    if (f.includes('morning') || f.includes('am')) return '1-0-0';
    if (f.includes('night') || f.includes('hs') || f.includes('bedtime') || f.includes('nocte')) return '0-0-1';
    return '1-0-0'; // default OD = morning
  }
  // BD patterns
  if (f.includes('bd') || f.includes('twice daily') || f.includes('bid') || f === '2×/day') return '1-0-1';
  // TDS patterns
  if (f.includes('tds') || f.includes('three times') || f.includes('tid') || f === '3×/day') return '1-1-1';
  // QDS/QID patterns
  if (f.includes('qds') || f.includes('four times') || f.includes('qid') || f === '4×/day') return '1-1-1-1';
  // PRN
  if (f.includes('prn') || f.includes('as needed') || f.includes('when needed')) return 'SOS';
  // Stat
  if (f.includes('stat') || f.includes('single dose') || f.includes('once only')) return 'STAT';
  // Weekly
  if (f.includes('weekly') || f.includes('once a week')) return '1×/week';
  // Default
  return f.toUpperCase();
}

// Drug-form prefix used on the printable Rx ("Tab. Amoxicillin", "Inh. Salbutamol", etc.)
export function getFormPrefix(route, genericName) {
  if (!route) return 'Tab.';
  const r = route.toLowerCase();
  const g = (genericName || '').toLowerCase();
  if (r.includes('inhaled') || r.includes('mdi') || r.includes('dpi') || g.includes('inhaler')) return 'Inh.';
  if (r.includes('iv') || r.includes('intravenous')) return 'Inj. IV';
  if (r.includes('im') || r.includes('intramuscular')) return 'Inj. IM';
  if (r.includes('sc') || r.includes('subcutaneous')) return 'Inj. SC';
  if (r.includes('topical') || r.includes('gel') || r.includes('cream') || r.includes('ointment')) return 'Appl.';
  if (r.includes('eye') || r.includes('ophthalmic')) return 'Eye Drops';
  if (r.includes('ear')) return 'Ear Drops';
  if (r.includes('nasal') || r.includes('intranasal')) return 'Nasal';
  if (r.includes('rectal') || r.includes('suppository')) return 'Supp.';
  if (r.includes('syrup') || r.includes('liquid') || r.includes('suspension') || g.includes('syrup')) return 'Syr.';
  if (r.includes('drops') && !r.includes('eye') && !r.includes('ear')) return 'Drops';
  if (r.includes('patch') || r.includes('transdermal')) return 'Patch';
  if (r.includes('capsule') || g.includes('capsule')) return 'Cap.';
  return 'Tab.'; // default
}
