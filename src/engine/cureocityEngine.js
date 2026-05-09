
// --- HEADLESS DOM MOCK ---
const mockElement = {
  innerHTML: '',
  style: {},
  classList: { add: () => {}, remove: () => {}, toggle: () => {} },
  value: '',
  appendChild: () => {},
  textContent: '',
  disabled: false
};
const document = {
  getElementById: () => mockElement,
  querySelector: () => mockElement,
  querySelectorAll: () => [], addEventListener: () => {}
};
const window = {
  scrollTo: () => {}
};
// -------------------------

'use strict';

// ══════════════════════════════════════════════════════════════
// GLOBAL STATE (single source of truth)
// ══════════════════════════════════════════════════════════════

const S = {
  step: 1,
  unlockedSteps: new Set([1]),
  patient: { age: null, gender: '', comorbid: '' },
  rawInput: '',
  corpus: '',
  normalizations: [],  // [{original, mapped}]
  activeSystems: {},   // { cv: {hits, score}, ... }
  redFlags: [],
  scored: [],
  gaps: [],            // [{key, label, sys, critical, value:''}]
  examFindings: {},    // { cv: { pulse:'', bp:'', ... }, ... }
  activeExamFindings: {},  // { cv: ['tachycardia','raised jvp',...], ... } — canonical KBE terms
  drugs: [],           // [{name, dose, duration}]
  interactions: [],    // [{drug1, drug2, severity, desc, resolution}]
  labs: {},            // {key: {value, unit, ref_low, ref_high, status}}
  labAlerts: [],
  differential: { t1:[], t2:[], t3:[] },
  nextSteps: [],
  certainty: 0,
  certaintyNote: '',
  structuredSymptoms: [],  // Array of standardized symptom terms from symptom builder
};

// ══════════════════════════════════════════════════════════════

// ── termPresent: negation-aware term detection ──────────────────────
// Returns true if 'term' is present in 'corpus' and NOT preceded
// by a negation phrase (no, not, without, denies, absent, never)
const _NEGATION_PREFIXES = [
  'no ','not ','without ','denies ','negative for ',
  'never ','no history of ','no h/o ','absent ','resolved ',
  'ruled out ','excluded ','unlikely ','nil ',
];
function termPresent(corpus, term) {
  if (!corpus || !term) return false;
  const idx = corpus.indexOf(term);
  if (idx === -1) return false;
  // Check all occurrences — if any is NOT negated, return true
  let searchFrom = 0;
  while (true) {
    const pos = corpus.indexOf(term, searchFrom);
    if (pos === -1) break;
    const preceding = corpus.slice(Math.max(0, pos - 40), pos);
    const negated = _NEGATION_PREFIXES.some(neg =>
      preceding.endsWith(neg) || preceding.slice(-neg.length - 3).includes(neg)
    );
    if (!negated) return true;
    searchFrom = pos + 1;
  }
  return false;
}

// MODULE A — LANGUAGE ENGINE
// 3-pass: Manglish → Shorthand → Phrase synonyms
// ══════════════════════════════════════════════════════════════

const MANGLISH = [
  [/\btired\s*aanu\b/gi,'fatigue'],[/\bklanjirikkunnu\b/gi,'fatigue'],
  [/\bshakthi\s*illa\b/gi,'weakness'],[/\bvayar\s*vedana\b/gi,'abdominal pain'],
  [/\bthalachedu\b|\bthalav[ae]dan[ae]\b/gi,'headache'],
  [/\bneru\s*vedana\b/gi,'back pain'],[/\bukkal\b/gi,'vomiting'],
  [/\bomothal\b/gi,'nausea'],[/\bvayar\s*(pulikkal|otti)\b/gi,'heartburn'],
  [/\bshevasam\s*muttum\b/gi,'dyspnoea'],[/\bchanth\b/gi,'cough'],
  [/\bmoham\s*marichittu\b/gi,'syncope'],[/\bkallipidutham\b/gi,'palpitations'],
  [/\bperiod\s*sher[iy]+alla\b/gi,'menstrual irregularity'],
  [/\bperiod\s*varunnilla\b/gi,'amenorrhoea'],
  [/\bweight\s*koodi\b/gi,'weight gain'],[/\bweight\s*kurai[nj]u\b/gi,'weight loss'],
  [/\bmootr[ao]m\s*(koodum|yantu)\b/gi,'polyuria'],
  [/\bthwak\s*manja\b|\bkann\s*manja\b/gi,'jaundice'],
  // Additional Kerala/Manglish terms
  [/\bmootr[ao]m\s*eriyumbol\b|\bmootr[ao]m\s*vedanai\b/gi,'burning micturition'],
  [/\bvedana\b/gi,'pain'],[/\bvayar\s*otti\b/gi,'abdominal cramps'],
  [/\bkall\s*vedana\b|\bkaalinnu\s*vedana\b/gi,'leg pain'],
  [/\bnilavilakku\b/gi,'syncope'],[/\bthoppil\s*vedana\b/gi,'abdominal pain'],
  [/\bchevi\s*sheri\s*alla\b/gi,'hearing loss'],[/\bkaan\s*moopp\b/gi,'tinnitus'],
  [/\bparachedu\b|\bparakkum\s*pole\b/gi,'dizziness vertigo'],
  [/\bmalar\s*vedana\b|\bmalarpu\s*vedana\b/gi,'chest pain'],
  [/\bshevasam\s*ella\b|\bshevasam\s*edukkan\s*patilla\b/gi,'dyspnoea'],
  [/\bvayar\s*otti\s*varunnu\b/gi,'abdominal cramping'],
  [/\bkaal\s*veekkam\b|\bkaalinnu\s*veekkam\b/gi,'leg swelling oedema'],
  [/\bmukham\s*veekkam\b|\bmukhathinu\s*veekkam\b/gi,'facial swelling'],
  [/\bkann\s*vedana\b|\bkanninu\s*vedana\b/gi,'eye pain'],
  [/\bkann\s*mazhunnal\b/gi,'blurred vision'],
  [/\bthala\s*keru\b|\bthalakeru\b/gi,'vertigo dizziness'],
  [/\bkuru\b(?=\s)/gi,'rash skin lesion'],[/\bchoriyanam\b/gi,'pruritus itching'],
  [/\bmurivil\b|\bmurivu\b/gi,'wound ulcer'],[/\bpuzhu\b/gi,'worm infestation'],
  [/\bmattyam\b|\bkaatham\b/gi,'diarrhoea loose stools'],
  [/\bkakkoos\s*pokunna\s*vedana\b/gi,'defecation pain rectal pain'],
  [/\bhridayam\s*thebbishikkunnu\b|\bhridayam\s*udikkunnu\b/gi,'palpitations'],
  [/\bthanda\s*thonnunnu\b|\bthanda\s*edukkunnu\b/gi,'cold intolerance'],
  [/\bchoodum\s*thonnunnu\b|\bachoodam\b/gi,'heat intolerance'],
  [/\bthonnunilla\b/gi,'anorexia loss of appetite'],
  [/\bvishappu\s*illa\b/gi,'anorexia loss of appetite'],
  [/\brathiram\s*thooran\b/gi,'epistaxis nosebleed'],
  [/\bmuttu\s*vedana\b/gi,'knee joint pain'],
  [/\bthavide\s*vedana\b/gi,'shoulder pain'],
  [/\bthapam\b/gi,'fever'],[/\bkanjukuthunnu\b|\bvisharam\b/gi,'fever'],
  [/\brushiyilla\b|\bchappiyilla\b/gi,'anorexia loss of appetite'],
  [/\bneer\s*daaham\b|\bneer\s*kudikan\s*thonnum\b/gi,'polydipsia increased thirst'],
  [/\bpalla\s*vedana\b/gi,'dental pain'],[/\bgala\s*vedana\b/gi,'sore throat'],
];

const SHORTHAND = [
  [/\bSOB\b|\bSoB\b/g,'dyspnoea'],[/\bCP\b/g,'chest pain'],[/\bDOE\b/g,'exertional dyspnoea'],
  [/\bPND\b/g,'paroxysmal nocturnal dyspnoea'],[/\bHTN\b|\bHtn\b/g,'hypertension'],
  [/\bDM\b/g,'diabetes mellitus'],[/\bCAD\b/g,'coronary artery disease'],
  [/\bMI\b/g,'myocardial infarction'],[/\bCKD\b/g,'chronic kidney disease'],
  [/\bh\/o\b/gi,'history of'],[/\bH\/O\b/g,'history of'],
  [/\bOCP\b/g,'oral contraceptive pill'],[/\bRx\b/g,'treatment'],
  [/\bAF\b|\bAFib\b/g,'atrial fibrillation'],[/\bHF\b/g,'heart failure'],
  [/\bCHF\b/g,'congestive heart failure'],[/\bPE\b/g,'pulmonary embolism'],
  // Additional Indian medical shorthands
  [/\bBM\b/g,'bowel motion'],[/\bL\/M\b|\bLM\b/g,'loose motions'],
  [/\bLMP\b/g,'last menstrual period'],[/\bP\/A\b|\bPA\b/g,'per abdomen'],
  [/\bP\/V\b|\bPV\b/g,'per vaginal bleeding'],[/\bDVT\b/g,'deep vein thrombosis'],
  [/\bTIA\b/g,'transient ischaemic attack'],[/\bGORD\b|\bGERD\b/g,'heartburn'],
  [/\bIHD\b/g,'ischaemic heart disease'],[/\bCOPD\b/g,'chronic obstructive pulmonary disease'],
  [/\bTB\b/g,'tuberculosis'],[/\bUTI\b/g,'burning micturition urinary symptoms'],
  [/\bDKA\b/g,'diabetic ketoacidosis'],[/\bCVA\b/g,'stroke'],
  [/\bOA\b/g,'joint pain osteoarthritis'],[/\bRA\b/g,'joint pain rheumatoid arthritis'],
  [/\bIBD\b/g,'inflammatory bowel disease diarrhoea'],[/\bGI\b/g,'gastrointestinal'],
  [/\bLBP\b/g,'low back pain'],[/\bNV\b/g,'nausea vomiting'],
  [/\bNAFLD\b/g,'fatty liver hepatomegaly'],[/\bALD\b/g,'alcohol liver disease jaundice'],
  [/\bPCOS\b/g,'menstrual irregularity polycystic ovary syndrome hirsutism'],
  [/\bHb\b/g,'haemoglobin'],[/\bFBS\b/g,'fasting blood sugar glucose'],
  [/\bPPBS\b/g,'post prandial blood sugar glucose'],[/\bHbA1c\b/g,'glycated haemoglobin diabetes'],
  [/\bECG\b/g,'electrocardiogram cardiac'],[/\becho\b/gi,'echocardiogram cardiac'],
  [/\bUSG\b|\bUSS\b/g,'ultrasound'],[/\bCT\b/g,'computed tomography scan'],
  [/\bMRI\b/g,'magnetic resonance imaging scan'],[/\bCXR\b/g,'chest x-ray'],
  [/\bk\/c\/o\b|\bKCO\b/gi,'known case of'],[/\bc\/o\b/gi,'complaints of'],
  [/\bs\/o\b/gi,'suggestive of'],[/\bw\/o\b/gi,'without'],
  [/\bLFT\b/g,'liver function test'],[/\bRFT\b/g,'renal function test creatinine'],
  [/\bTFT\b/g,'thyroid function test'],[/\bCBC\b|\bFBC\b/g,'complete blood count haemoglobin'],
  [/\bBMI\b/g,'body mass index obesity'],[/\bBP\b/g,'blood pressure hypertension'],
  [/\bHR\b/g,'heart rate tachycardia'],[/\bRR\b/g,'respiratory rate dyspnoea'],
  [/\bSpO2\b|\bSPO2\b/g,'oxygen saturation hypoxia'],[/\bT\b(?=\s*[=:]\s*[\d.]+)/g,'temperature fever'],
  [/\bACE\b/g,'angiotensin converting enzyme'],[/\bARB\b/g,'angiotensin receptor blocker'],
  [/\bNSAID\b/g,'non steroidal anti inflammatory pain'],[/\bPPI\b/g,'proton pump inhibitor heartburn'],
  [/\bORS\b/g,'oral rehydration solution diarrhoea'],[/\bIV\b/g,'intravenous'],
  [/\bIM\b(?=\s)/g,'intramuscular injection'],[/\bSC\b(?=\s)/g,'subcutaneous injection'],
];

// Spell correction — medical term fuzzy map
const SPELL_MAP = {
  'brething':'breathing','tightnes':'tightness','breathign':'breathing',
  'chect':'chest','chestpain':'chest pain','palptations':'palpitations',
  'sweting':'sweating','dificulty':'difficulty','diffuculty':'difficulty',
  'hedache':'headache','haedache':'headache','vomitin':'vomiting',
  'dizines':'dizziness','weekness':'weakness','fateigue':'fatigue',
  'fatiuge':'fatigue','irergular':'irregular','diabetis':'diabetes',
  'hpertension':'hypertension','thryoid':'thyroid','polyurea':'polyuria',
  'polydypsia':'polydipsia','jaundise':'jaundice','palpitaion':'palpitation',
  'stomatch':'stomach','abdomen':'abdominal','synscope':'syncope',
  'haemptysis':'haemoptysis','haematmesis':'haematemesis',
  // Additional
  'breathlessnes':'breathlessness','palpitaitons':'palpitations',
  'diarhea':'diarrhoea','diarrohea':'diarrhoea','diareah':'diarrhoea',
  'vommiting':'vomiting','nausaea':'nausea','haedach':'headache',
  'musle':'muscle','muscele':'muscle','joitn':'joint','siezure':'seizure',
  'seziure':'seizure','eplepsy':'epilepsy','thyorid':'thyroid',
  'constipaiton':'constipation','constipaton':'constipation',
  'uriantion':'urination','urinaton':'urination','freqeunt':'frequent',
  'swolln':'swollen','sweling':'swelling','buring':'burning',
  'burining':'burning','painfull':'painful','dificult':'difficult',
  'loosemotion':'loose stools','loosemotons':'loose stools',
  'abdominalpain':'abdominal pain','chestpressure':'chest pressure',
  'weighgain':'weight gain','weightloss':'weight loss',
  'shortbreath':'dyspnoea','shortnessbreath':'dyspnoea',
  'pitting':'pitting','oedma':'oedema','eodema':'oedema',
  'anklswelling':'ankle swelling','legswelling':'leg swelling',
  'palitation':'palpitation','palpitaton':'palpitation',
  'palpitation':'palpitations','feverish':'fever','feavr':'fever',
  'temprature':'temperature','temperatur':'temperature',
  'backpain':'back pain','backache':'back pain','backach':'back pain',
  'kneepain':'knee pain','shoulderpain':'shoulder pain',
  'stomachache':'stomach pain','stomachpain':'abdominal pain',
  'acidity':'heartburn','abdominaldistension':'abdominal distension',
  'yelloweyes':'jaundice','yellowskin':'jaundice',
  'hairfall':'hair loss','hairloss':'hair loss','periood':'period',
  'menstual':'menstrual','irregularmenses':'menstrual irregularity',
};

const PHRASES = [
  ['worst headache of my life','thunderclap headache'],
  ['worst headache ever','thunderclap headache'],
  ['sudden severe headache','thunderclap headache'],
  ['never had headache like this','thunderclap headache'],
  ['cannot touch chin to chest','neck stiffness'],
  ['stiff neck','neck stiffness'],['neck rigidity','neck stiffness'],
  ['left arm pain','radiation left arm'],['jaw pain','radiation jaw'],
  ['radiation to jaw','radiation jaw'],['arm pain','radiation left arm'],
  ['shortness of breath','dyspnoea'],['short of breath','dyspnoea'],
  ['difficulty breathing','dyspnoea'],['breathing difficulty','dyspnoea'],
  ['breathing problem','dyspnoea'],['cannot breathe','dyspnoea'],
  ['breathlessness','dyspnoea'],['breathless','dyspnoea'],
  ['chest tightness','chest pain'],['chest heaviness','chest pain'],
  ['chest pressure','chest pain'],['tight chest','chest pain'],
  ['fast heartbeat','palpitations'],['racing heart','palpitations'],
  ['heart racing','palpitations'],['heart pounding','palpitations'],
  ['frequent urination','polyuria'],['pass urine often','polyuria'],
  ['urinating a lot','polyuria'],['increased thirst','polydipsia'],
  ['very thirsty','polydipsia'],['always thirsty','polydipsia'],
  ['irregular periods','menstrual irregularity'],
  ['missed periods','menstrual irregularity'],
  ['period late','menstrual irregularity'],
  ['period problem','menstrual irregularity'],
  ['no periods','amenorrhoea'],['periods stopped','amenorrhoea'],
  ['hair falling','hair loss'],['hair fall','hair loss'],
  ['vomiting blood','haematemesis'],['blood in vomit','haematemesis'],
  ['black stool','melaena'],['tarry stool','melaena'],['dark stool','melaena'],
  ['blood in stool','rectal bleeding'],['bloody stool','rectal bleeding'],
  ['sweating profusely','diaphoresis'],['excessive sweating','diaphoresis'],
  ['profuse sweating','diaphoresis'],['night sweats','night sweats'],
  ['sweating at night','night sweats'],['sweating','diaphoresis'],
  ['weight going up','weight gain'],['gaining weight','weight gain'],
  ['weight going down','weight loss'],['losing weight','weight loss'],
  ['always cold','cold intolerance'],['feeling cold','cold intolerance'],
  ['always hot','heat intolerance'],['feeling hot','heat intolerance'],
  ['cannot tolerate light','photophobia'],['sensitive to light','photophobia'],
  ['light hurts','photophobia'],['neck stiff','neck stiffness'],
  ['tearing pain','tearing pain'],['ripping pain','tearing pain'],
  ['blood in urine','haematuria'],['red urine','haematuria'],
  ['leg swelling','oedema'],['ankle swelling','oedema'],
  ['swollen ankles','oedema'],['both legs swollen','bilateral oedema'],
  ['swollen glands','lymphadenopathy'],['swollen lymph nodes','lymphadenopathy'],
  ['facial droop','facial droop'],['face drooping','facial droop'],
  ['slurred speech','speech difficulty'],['cannot speak','speech difficulty'],
  ['word finding difficulty','speech difficulty'],
  ['blacked out','syncope'],['fainted','syncope'],
  ['passed out','syncope'],['lost consciousness','syncope'],
  ['coughing blood','haemoptysis'],['blood in sputum','haemoptysis'],
  ['tummy pain','abdominal pain'],['stomach pain','abdominal pain'],
  ['belly pain','abdominal pain'],['upper stomach pain','epigastric pain'],
  ['bone pain','bone pain'],['bone ache','bone pain'],
  ['morning stiffness','morning stiffness'],
  ['stiff in morning','morning stiffness'],
  ['tiredness','fatigue'],['lethargy','fatigue'],['low energy','fatigue'],
  ['feeling cold always','cold intolerance'],
  ['high temperature','fever'],['loosing weight','weight loss'],
  ['losing hair','hair loss'],['acidity','heartburn'],['acid reflux','heartburn'],
  ['pins and needles','tingling'],['double vision','diplopia'],
  ['room spinning','vertigo'],['shaking hands','tremor'],
  // Additional Indian English phrases
  ['loose motions','diarrhoea'],['watery stools','diarrhoea'],
  ['runny stools','diarrhoea'],['frequent stools','diarrhoea'],
  ['burning urination','burning micturition'],['burning while passing urine','burning micturition'],
  ['pain while urinating','burning micturition'],['painful urination','burning micturition'],
  ['burning in urine','burning micturition'],['urinary burning','burning micturition'],
  ['unable to pass urine','urinary retention'],['cannot pass urine','urinary retention'],
  ['urine not coming','urinary retention'],['urine stopped','urinary retention'],
  ['stomach upset','nausea abdominal pain'],['indigestion','heartburn dyspepsia'],
  ['gas trouble','bloating flatulence'],['gas problem','bloating flatulence'],
  ['tummy upset','nausea abdominal pain'],['loose stools','diarrhoea'],
  ['motion problem','diarrhoea constipation'],['no motion','constipation'],
  ['not passing stools','constipation'],['stools not coming','constipation'],
  ['body pain','myalgia'],['body ache','myalgia'],['whole body pain','myalgia'],
  ['pain all over','myalgia'],['generalised pain','myalgia'],
  ['feeling weak','weakness'],['no strength','weakness'],
  ['cannot walk','weakness leg weakness'],['legs giving way','leg weakness'],
  ['yellow eyes','jaundice'],['yellow skin','jaundice'],
  ['yellow colour','jaundice'],['eyes yellow','jaundice'],
  ['upper stomach pain','epigastric pain'],['upper abdomen pain','epigastric pain'],
  ['lower stomach pain','lower abdominal pain'],['lower abdomen pain','lower abdominal pain'],
  ['right side pain','right iliac fossa pain'],['left side pain','left iliac fossa pain'],
  ['back of head pain','occipital headache'],['temple pain','temporal headache'],
  ['eye pain','eye pain'],['behind the eyes pain','retro-orbital headache'],
  ['drooping eyelid','ptosis'],['cannot open eye','ptosis'],
  ['cannot close eye','facial weakness'],['face drooping','facial droop'],
  ['numbness','numbness'],['tingling sensation','tingling'],
  ['electric shock feeling','tingling neuropathy'],['burning sensation feet','peripheral neuropathy'],
  ['burning feet','peripheral neuropathy'],['cold feet','peripheral vascular disease'],
  ['walking pain','intermittent claudication'],['calf pain walking','intermittent claudication'],
  ['heart pain','chest pain'],['chest pain radiating','chest pain radiation left arm'],
  ['chest pain left side','chest pain'],['left chest pain','chest pain'],
  ['nose bleed','epistaxis'],['nosebleed','epistaxis'],
  ['blood from nose','epistaxis'],['bleeding nose','epistaxis'],
  ['worm in stool','helminthiasis'],['worms in motion','helminthiasis'],
  ['passing worms','helminthiasis'],['itching around anus','perianal pruritus'],
  ['anal itching','perianal pruritus'],
  ['difficulty swallowing','dysphagia'],['cannot swallow','dysphagia'],
  ['food sticking','dysphagia'],['painful swallowing','odynophagia'],
  ['hoarse voice','hoarse voice'],['voice change','hoarse voice'],
  ['loss of voice','hoarse voice'],['throat pain','sore throat'],
  ['sore throat','sore throat'],['throat itching','sore throat'],
  ['ear pain','otalgia'],['earache','otalgia'],['ringing in ears','tinnitus'],
  ['ear ringing','tinnitus'],['hearing loss','hearing loss'],
  ['cannot hear properly','hearing loss'],['hearing reduced','hearing loss'],
  ['eye redness','conjunctivitis'],['red eyes','conjunctivitis'],
  ['discharge from eyes','conjunctivitis'],['watery eyes','lacrimation'],
  ['blurred vision','blurred vision'],['vision blurred','blurred vision'],
  ['cannot see properly','visual disturbance'],['vision problem','visual disturbance'],
  ['seeing double','diplopia'],['black spots in vision','visual disturbance scotoma'],
  ['flashes of light','photopsia'],
  ['joint swelling','joint swelling'],['swollen joint','joint swelling'],
  ['joint redness','joint inflammation'],['hot joint','joint inflammation'],
  ['red swollen joint','joint inflammation'],
  ['knee pain','knee pain'],['hip pain','hip pain'],
  ['shoulder pain','shoulder pain'],['elbow pain','elbow pain'],
  ['wrist pain','wrist pain'],['finger pain','finger joint pain'],
  ['ankle pain','ankle pain'],['foot pain','foot pain'],
  ['neck pain','neck pain'],['cervical pain','neck pain'],
  ['lumbar pain','low back pain'],['lumbago','low back pain'],
  ['sciatic pain','sciatica low back pain'],['sciatica','sciatica low back pain'],
  ['pain going down leg','sciatica low back pain'],['radiation to leg','sciatica'],
  ['skin rash','rash'],['skin lesion','skin lesion'],['spots on skin','rash'],
  ['itchy skin','pruritus'],['skin itching','pruritus'],
  ['skin peeling','skin peeling'],['skin dryness','dry skin'],
  ['dry skin','dry skin'],['scaly skin','dry skin'],
  ['hair thinning','hair loss'],['bald patches','alopecia'],
  ['lump in neck','neck swelling lymphadenopathy'],['swelling in neck','neck swelling'],
  ['lump under arm','axillary lymphadenopathy'],['swelling under arm','axillary lymphadenopathy'],
  ['lump in groin','inguinal lymphadenopathy'],
  ['breast lump','breast lump'],['breast pain','breast pain'],
  ['nipple discharge','nipple discharge galactorrhoea'],
  ['facial hair','hirsutism'],['hair on face','hirsutism'],
  ['acne','acne'],['pimples','acne'],['pimple problem','acne'],
  ['excessive hair growth','hirsutism'],
  ['urinary frequency','polyuria'],['urinating frequently','polyuria'],
  ['urinating at night','nocturia'],['getting up at night to urinate','nocturia'],
  ['night urination','nocturia'],['nocturia','nocturia'],
  ['urine colour dark','dark urine'],['dark yellow urine','dark urine'],
  ['cola coloured urine','haematuria dark urine'],
  ['foamy urine','proteinuria'],['frothy urine','proteinuria'],
  ['puffiness of face','facial oedema periorbital puffiness'],
  ['puffy face','facial oedema periorbital puffiness'],
  ['swelling of face','facial oedema'],['puffy eyes','periorbital puffiness'],
  ['stomach bloating','bloating abdominal distension'],['belly bloating','abdominal distension'],
  ['abdomen distended','abdominal distension'],['belly getting bigger','abdominal distension'],
  ['rectal bleeding','rectal bleeding'],['bleeding from rectum','rectal bleeding'],
  ['blood in toilet','rectal bleeding'],
  ['fits','seizure'],['seizure','seizure'],['convulsion','seizure'],
  ['shaking attack','seizure'],['jerking movements','seizure'],
  ['unconscious','loss of consciousness'],['collapse','syncope collapse'],
  ['fell down','syncope fall'],['blacking out','syncope'],
  ['memory loss','memory loss amnesia'],['forgetting things','memory loss'],
  ['confused','confusion'],['behaving oddly','confusion'],
  ['mood swings','mood changes'],['irritable','irritability mood changes'],
  ['anxiety','anxiety'],['worried all the time','anxiety'],
  ['panic attack','panic attack'],['heart sinking feeling','anxiety panic'],
  ['sad mood','depression low mood'],['depression','depression low mood'],
  ['not interested in anything','anhedonia depression'],['no interest','anhedonia'],
  ['sleep problem','insomnia'],['not sleeping','insomnia'],
  ['sleeping too much','hypersomnia'],['waking at night','insomnia'],
  ['poor appetite','anorexia'],['not eating','anorexia'],
  ['loss of appetite','anorexia loss of appetite'],['no hunger','anorexia'],
  ['excessive hunger','polyphagia'],['always hungry','polyphagia'],
].sort((a,b) => b[0].length - a[0].length);

function normalizeInput(raw) {
  if (!raw || typeof raw !== 'string') return { corpus: '', normalizations: [] };
  const norms = [];

  // Pass 0: Spell correction
  let corpus = raw.toLowerCase().trim();
  const words = corpus.split(/\s+/);
  const corrected = words.map(w => {
    const clean = w.replace(/[^a-z]/g,'');
    if (SPELL_MAP[clean] && clean !== w) {
      norms.push({ original: w, mapped: SPELL_MAP[clean], type: 'spell' });
      return SPELL_MAP[clean];
    }
    return w;
  });
  corpus = corrected.join(' ');

  // Pass 1: Manglish
  for (const [rx, rep] of MANGLISH) {
    if (rx.test(corpus)) {
      norms.push({ original: corpus.match(rx)?.[0] || '(Manglish)', mapped: rep, type: 'manglish' });
      corpus = corpus.replace(rx, rep);
    }
  }

  // Pass 2: Shorthand
  for (const [rx, rep] of SHORTHAND) {
    if (rx.test(corpus)) {
      norms.push({ original: corpus.match(rx)?.[0] || '', mapped: rep, type: 'shorthand' });
      corpus = corpus.replace(rx, rep);
    }
  }

  // Pass 3: Phrase synonyms
  for (const [phrase, canonical] of PHRASES) {
    if (corpus.includes(phrase) && phrase !== canonical) {
      norms.push({ original: phrase, mapped: canonical, type: 'synonym' });
      corpus = corpus.split(phrase).join(canonical);
    }
  }

  return { corpus, normalizations: norms };
}

// ══════════════════════════════════════════════════════════════
// MODULE B — BODY SYSTEMS
// ══════════════════════════════════════════════════════════════

const SYSTEMS = {
  cv: {
    name:'Cardiovascular', color:'var(--cv)', bg:'var(--cv-t)',
    activators:['chest pain','palpitations','dyspnoea','syncope','oedema','diaphoresis',
      'bilateral oedema','radiation left arm','radiation jaw','orthopnoea',
      'paroxysmal nocturnal dyspnoea','exertional dyspnoea','tearing pain'],
    exam_findings:{
      inspection:[
        {term:'raised jvp',             label:'Raised JVP',              kbe:'raised jvp'},
        {term:'peripheral cyanosis',    label:'Peripheral cyanosis',     kbe:'peripheral cyanosis'},
        {term:'central cyanosis',       label:'Central cyanosis',        kbe:'central cyanosis'},
        {term:'bilateral pitting oedema',label:'Bilateral pitting oedema',kbe:'bilateral pitting oedema'},
        {term:'pallor',                 label:'Pallor',                  kbe:'pallor'},
        {term:'diaphoresis',            label:'Diaphoresis / sweating',  kbe:'diaphoresis'},
      ],
      palpation:[
        {term:'displaced apex beat',    label:'Displaced apex beat',     kbe:'displaced apex beat'},
        {term:'heaves',                 label:'Parasternal heave',       kbe:'heaves'},
        {term:'thrills',                label:'Palpable thrill',         kbe:'thrills'},
        {term:'weak peripheral pulses', label:'Weak peripheral pulses',  kbe:'weak peripheral pulses'},
        {term:'absent peripheral pulses',label:'Absent peripheral pulses',kbe:'absent peripheral pulses'},
      ],
      auscultation:[
        {term:'third heart sound',      label:'S3 gallop',               kbe:'third heart sound'},
        {term:'fourth heart sound',     label:'S4',                      kbe:'fourth heart sound'},
        {term:'new murmur',             label:'Murmur (new)',            kbe:'new murmur'},
        {term:'bilateral crackles',     label:'Bilateral basal crackles',kbe:'bilateral crackles'},
        {term:'pericardial rub',        label:'Pericardial rub',         kbe:'pericardial rub'},
      ],
      local_exam:[
        {term:'tachycardia',            label:'HR > 100 (tachycardia)',  kbe:'tachycardia'},
        {term:'bradycardia',            label:'HR < 60 (bradycardia)',   kbe:'bradycardia'},
        {term:'hypotension',            label:'BP < 90/60 (hypotension)',kbe:'hypotension'},
        {term:'hypertension',           label:'BP > 140/90',             kbe:'hypertension'},
        {term:'irregular pulse',        label:'Irregular pulse (AF?)',   kbe:'atrial fibrillation'},
        {term:'pulsus paradoxus',       label:'Pulsus paradoxus',        kbe:'pulsus paradoxus'},
        {term:'low spo2',               label:'SpO2 < 94% (hypoxia)',    kbe:'hypoxia'},
        {term:'hepatomegaly',           label:'Hepatomegaly',            kbe:'hepatomegaly'},
        {term:'ascites',                label:'Ascites',                 kbe:'ascites'},
      ],
    },
    vitals_fields:['HR (bpm)','BP (mmHg)','SpO2 (%)','RR (/min)','Temp (°C)'],
    required_missing:['duration','onset','exertion_relationship','radiation','diaphoresis','prior_cardiac'],
  },
  rs: {
    name:'Respiratory', color:'var(--rs)', bg:'var(--rs-t)',
    activators:['cough','haemoptysis','dyspnoea','wheeze','pleuritic pain',
      'exertional dyspnoea','dry cough','productive cough','night sweats'],
    exam_findings:{
      inspection:[
        {term:'use of accessory muscles',label:'Accessory muscle use',    kbe:'use of accessory muscles'},
        {term:'intercostal recession',   label:'Intercostal recession',   kbe:'intercostal recession'},
        {term:'central cyanosis',        label:'Central cyanosis',        kbe:'central cyanosis'},
        {term:'clubbing',                label:'Finger clubbing',         kbe:'clubbing'},
        {term:'barrel chest',            label:'Barrel chest (COPD)',     kbe:'barrel chest'},
        {term:'tracheal deviation',      label:'Tracheal deviation',      kbe:'tracheal deviation'},
      ],
      palpation:[
        {term:'reduced chest expansion', label:'Reduced chest expansion', kbe:'reduced chest expansion'},
        {term:'increased tactile fremitus',label:'Increased fremitus',    kbe:'increased tactile fremitus'},
        {term:'reduced tactile fremitus', label:'Reduced fremitus',       kbe:'reduced tactile fremitus'},
      ],
      percussion:[
        {term:'dullness to percussion',  label:'Dull (consolidation/effusion)',kbe:'dullness to percussion'},
        {term:'hyperresonance',          label:'Hyperresonant (pneumothorax)', kbe:'hyperresonance'},
        {term:'stony dull',              label:'Stony dull (pleural effusion)',kbe:'stony dull'},
      ],
      auscultation:[
        {term:'crackles',                label:'Crackles / Crepitations', kbe:'crackles'},
        {term:'bronchial breathing',     label:'Bronchial breathing',     kbe:'bronchial breathing'},
        {term:'wheeze',                  label:'Wheeze',                  kbe:'wheeze'},
        {term:'pleural rub',             label:'Pleural rub',             kbe:'pleural rub'},
        {term:'reduced breath sounds',   label:'Reduced breath sounds',   kbe:'reduced breath sounds'},
        {term:'absent breath sounds',    label:'Absent breath sounds',    kbe:'absent breath sounds'},
      ],
      local_exam:[
        {term:'raised respiratory rate', label:'RR > 20 (tachypnoea)',   kbe:'raised respiratory rate'},
        {term:'fever >38',               label:'Fever > 38°C',           kbe:'fever >38'},
        {term:'low spo2',                label:'SpO2 < 94%',             kbe:'low spo2'},
        {term:'pursed lip breathing',    label:'Pursed-lip breathing',   kbe:'pursed lip breathing'},
        {term:'stridor',                 label:'Stridor (upper airway)', kbe:'stridor'},
      ],
    },
    vitals_fields:['RR (/min)','SpO2 (%)','Temp (°C)','HR (bpm)','BP (mmHg)'],
    required_missing:['cough_duration','sputum_character','smoking_history','triggers','nocturnal'],
  },
  en: {
    name:'Endocrine', color:'var(--en)', bg:'var(--en-t)',
    activators:['fatigue','weight gain','weight loss','polyuria','polydipsia',
      'menstrual irregularity','amenorrhoea','cold intolerance','heat intolerance',
      'hair loss','hirsutism','galactorrhoea','tremor','acne'],
    exam_findings:{
      inspection:[
        {term:'goitre',                  label:'Goitre (neck swelling)',  kbe:'goitre'},
        {term:'exophthalmos',            label:'Exophthalmos',           kbe:'exophthalmos'},
        {term:'lid lag',                 label:'Lid lag',                kbe:'lid lag'},
        {term:'acanthosis nigricans',    label:'Acanthosis nigricans',   kbe:'acanthosis nigricans'},
        {term:'dry skin',                label:'Dry / coarse skin',      kbe:'dry skin'},
        {term:'warm moist skin',         label:'Warm moist skin',        kbe:'warm moist skin'},
        {term:'hirsutism',               label:'Hirsutism',              kbe:'hirsutism'},
        {term:'hair loss',               label:'Hair thinning / loss',   kbe:'hair loss'},
        {term:'periorbital puffiness',   label:'Periorbital puffiness',  kbe:'periorbital puffiness'},
        {term:'obesity',                 label:'Obesity / central fat',  kbe:'obesity'},
      ],
      local_exam:[
        {term:'thyroid palpation — enlarged smooth',label:'Thyroid: enlarged smooth', kbe:'goitre'},
        {term:'thyroid palpation — nodular',        label:'Thyroid: nodular',          kbe:'goitre'},
        {term:'thyroid bruit',           label:'Thyroid bruit',          kbe:'thyroid bruit'},
        {term:'fine tremor',             label:'Fine tremor (hands)',    kbe:'fine tremor'},
        {term:'delayed relaxation reflexes',label:'Delayed reflexes',   kbe:'delayed relaxation reflexes'},
        {term:'bradycardia',             label:'Bradycardia (hypothyroid?)',kbe:'bradycardia'},
        {term:'tachycardia',             label:'Tachycardia (hyperthyroid?)',kbe:'tachycardia'},
        {term:'proximal myopathy',       label:'Proximal muscle weakness',kbe:'proximal myopathy'},
        {term:'galactorrhoea',           label:'Galactorrhoea on expression',kbe:'galactorrhoea'},
      ],
    },
    vitals_fields:['Weight (kg)','Height (cm)','BMI','Waist (cm)','BP (mmHg)'],
    required_missing:['weight_direction','menstrual_history','temperature_tolerance','family_history_dm_thyroid','duration'],
  },
  nr: {
    name:'Neurological', color:'var(--nr)', bg:'var(--nr-t)',
    activators:['headache','thunderclap headache','neck stiffness','dizziness','syncope',
      'weakness','numbness','tingling','seizure','speech difficulty','facial droop',
      'diplopia','vertigo','confusion','photophobia','phonophobia'],
    exam_findings:{
      general:[
        {term:'gcs <15',                 label:'GCS < 15 (reduced)',     kbe:'reduced gcs'},
        {term:'confusion',               label:'Confusion / disoriented',kbe:'confusion'},
        {term:'meningism',               label:'Neck stiffness / meningism',kbe:'neck stiffness'},
        {term:'photophobia',             label:'Photophobia',            kbe:'photophobia'},
        {term:'papilloedema',            label:'Papilloedema',           kbe:'papilloedema'},
      ],
      cranial_nerves:[
        {term:'facial droop',            label:'Facial droop (VII)',     kbe:'facial droop'},
        {term:'speech difficulty',       label:'Dysphasia / dysarthria', kbe:'speech difficulty'},
        {term:'diplopia',                label:'Diplopia (III/IV/VI)',   kbe:'diplopia'},
        {term:'unequal pupils',          label:'Unequal pupils',         kbe:'unequal pupils'},
      ],
      motor:[
        {term:'hemiplegia',              label:'Hemiplegia / hemiparesis',kbe:'hemiplegia'},
        {term:'monoplegia',              label:'Monoplegia',             kbe:'monoplegia'},
        {term:'pronator drift',          label:'Pronator drift +ve',     kbe:'pronator drift'},
        {term:'upper motor neurone signs',label:'UMN signs',             kbe:'upper motor neurone signs'},
        {term:'lower motor neurone signs',label:'LMN signs',             kbe:'lower motor neurone signs'},
      ],
      local_exam:[
        {term:'kernig sign positive',    label:"Kernig's sign +ve",      kbe:'kernig sign'},
        {term:'brudzinski sign positive',label:"Brudzinski's sign +ve",  kbe:'brudzinski sign'},
        {term:'slr positive',            label:'SLR positive (sciatica)',kbe:'slr positive'},
        {term:'romberg positive',        label:"Romberg's test +ve",     kbe:'romberg positive'},
        {term:'babinski positive',       label:'Babinski +ve (UMN)',     kbe:'babinski positive'},
        {term:'nystagmus',               label:'Nystagmus',              kbe:'nystagmus'},
        {term:'ataxic gait',             label:'Ataxic gait',            kbe:'ataxic gait'},
        {term:'sensory loss glove stocking',label:'Glove-stocking sensory loss',kbe:'peripheral neuropathy'},
      ],
    },
    vitals_fields:['GCS (/15)','BP (mmHg)','HR (bpm)','Temp (°C)','Pupils (mm)'],
    required_missing:['headache_onset_speed','focal_neuro_signs','consciousness_level','fever'],
  },
  gi: {
    name:'Gastrointestinal', color:'var(--gi)', bg:'var(--gi-t)',
    activators:['abdominal pain','nausea','vomiting','diarrhoea','constipation',
      'haematemesis','melaena','rectal bleeding','jaundice','bloating','heartburn','epigastric pain'],
    exam_findings:{
      inspection:[
        {term:'jaundice',                label:'Jaundice (icterus)',     kbe:'jaundice'},
        {term:'abdominal distension',    label:'Abdominal distension',   kbe:'abdominal distension'},
        {term:'caput medusae',           label:'Caput medusae',          kbe:'caput medusae'},
        {term:'spider naevi',            label:'Spider naevi',           kbe:'spider naevi'},
        {term:'leuconychia',             label:'Leuconychia (white nails)',kbe:'leuconychia'},
        {term:'palmer erythema',         label:'Palmar erythema',        kbe:'palmar erythema'},
      ],
      palpation:[
        {term:'epigastric tenderness',   label:'Epigastric tenderness',  kbe:'epigastric tenderness'},
        {term:'right iliac fossa tenderness',label:'RIF tenderness',     kbe:'right iliac fossa tenderness'},
        {term:'rebound tenderness',      label:'Rebound tenderness',     kbe:'rebound tenderness'},
        {term:'guarding',                label:'Guarding',               kbe:'guarding'},
        {term:'rigidity',                label:'Board-like rigidity',    kbe:'rigidity'},
        {term:'hepatomegaly',            label:'Hepatomegaly',           kbe:'hepatomegaly'},
        {term:'splenomegaly',            label:'Splenomegaly',           kbe:'splenomegaly'},
        {term:'tender liver',            label:'Tender hepatomegaly',    kbe:'tender liver'},
        {term:'murphy sign positive',    label:"Murphy's sign +ve",      kbe:'murphy sign positive'},
        {term:'mcburney point tenderness',label:"McBurney's +ve",        kbe:'right iliac fossa tenderness'},
      ],
      percussion:[
        {term:'shifting dullness',       label:'Shifting dullness (ascites)',kbe:'ascites'},
        {term:'liver dullness',          label:'Liver dullness',         kbe:'hepatomegaly'},
      ],
      auscultation:[
        {term:'absent bowel sounds',     label:'Absent bowel sounds',    kbe:'absent bowel sounds'},
        {term:'hyperactive bowel sounds',label:'Hyperactive bowel sounds',kbe:'hyperactive bowel sounds'},
        {term:'tinkling bowel sounds',   label:'Tinkling sounds (obstruction)',kbe:'tinkling bowel sounds'},
      ],
      local_exam:[
        {term:'rovsing sign positive',   label:"Rovsing's sign +ve",     kbe:'right iliac fossa tenderness'},
        {term:'psoas sign positive',     label:'Psoas sign +ve',         kbe:'psoas sign'},
        {term:'obturator sign positive', label:'Obturator sign +ve',     kbe:'pelvic pain'},
        {term:'grey turner sign',        label:"Grey Turner's sign",     kbe:'retroperitoneal haemorrhage'},
        {term:'cullen sign',             label:"Cullen's sign",          kbe:'intraperitoneal haemorrhage'},
        {term:'hernial orifices bulge',  label:'Hernia bulge',           kbe:'hernia'},
        {term:'digital rectal examination — bleeding',label:'DRE: bleeding',kbe:'rectal bleeding'},
        {term:'digital rectal examination — mass',label:'DRE: rectal mass',kbe:'rectal mass'},
      ],
    },
    vitals_fields:['HR (bpm)','BP (mmHg)','Temp (°C)','RR (/min)','Urine output'],
    required_missing:['pain_character','bowel_habit','alcohol_history','blood_in_stool','nausea_vomiting'],
  },
  hm: {
    name:'Haematological', color:'var(--hm)', bg:'var(--hm-t)',
    activators:['fatigue','pallor','easy bruising','bleeding tendency','lymphadenopathy',
      'night sweats','bone pain','haemoptysis','rectal bleeding','haematemesis'],
    exam_findings:{
      inspection:[
        {term:'pallor',                  label:'Pallor (conjunctivae/palms)',kbe:'pallor'},
        {term:'jaundice',                label:'Jaundice',               kbe:'jaundice'},
        {term:'petechiae',               label:'Petechiae',              kbe:'petechiae'},
        {term:'purpura',                 label:'Purpura / ecchymosis',   kbe:'purpura'},
        {term:'koilonychia',             label:'Koilonychia (spoon nails)',kbe:'koilonychia'},
        {term:'angular stomatitis',      label:'Angular stomatitis',     kbe:'angular stomatitis'},
        {term:'glossitis',               label:'Glossitis',              kbe:'glossitis'},
      ],
      palpation:[
        {term:'splenomegaly',            label:'Splenomegaly',           kbe:'splenomegaly'},
        {term:'hepatomegaly',            label:'Hepatomegaly',           kbe:'hepatomegaly'},
        {term:'lymphadenopathy',         label:'Lymphadenopathy (site)', kbe:'lymphadenopathy'},
        {term:'lymph node — firm rubbery',label:'Firm/rubbery nodes (lymphoma)',kbe:'lymphadenopathy'},
        {term:'lymph node — hard fixed', label:'Hard fixed nodes (malignancy)',kbe:'lymphadenopathy'},
        {term:'bone tenderness',         label:'Sternal / bone tenderness',kbe:'bone pain'},
      ],
      local_exam:[
        {term:'tourniquet test positive',label:'Tourniquet test +ve (dengue)',kbe:'tourniquet test positive'},
        {term:'cervical lymphadenopathy',label:'Cervical lymphadenopathy',kbe:'lymphadenopathy'},
        {term:'axillary lymphadenopathy',label:'Axillary lymphadenopathy',kbe:'lymphadenopathy'},
        {term:'inguinal lymphadenopathy',label:'Inguinal lymphadenopathy',kbe:'lymphadenopathy'},
        {term:'bleeding gums',           label:'Bleeding gums',          kbe:'bleeding tendency'},
      ],
    },
    vitals_fields:['HR (bpm)','BP (mmHg)','Temp (°C)','SpO2 (%)','Weight (kg)'],
    required_missing:['b_symptoms','bleeding_tendency','lymph_node_duration','dietary_history'],
  },
  ms: {
    name:'Musculoskeletal', color:'var(--ms)', bg:'var(--ms-t)',
    activators:['joint pain','back pain','morning stiffness','swelling','bone pain','muscle pain'],
    exam_findings:{
      inspection:[
        {term:'joint swelling',          label:'Joint swelling',         kbe:'joint swelling'},
        {term:'joint redness',           label:'Joint redness / erythema',kbe:'joint inflammation'},
        {term:'deformity',               label:'Deformity',              kbe:'deformity'},
        {term:'muscle wasting',          label:'Muscle wasting',         kbe:'muscle wasting'},
        {term:'varus deformity',         label:'Varus deformity (knee)', kbe:'varus deformity'},
        {term:'valgus deformity',        label:'Valgus deformity',       kbe:'valgus deformity'},
        {term:'swan neck deformity',     label:'Swan neck (RA)',         kbe:'swan neck deformity'},
        {term:'boutonnieres deformity',  label:'Boutonnière (RA)',       kbe:'boutonnieres deformity'},
      ],
      palpation:[
        {term:'joint warmth',            label:'Joint warmth',           kbe:'joint inflammation'},
        {term:'joint line tenderness',   label:'Joint line tenderness',  kbe:'joint line tenderness'},
        {term:'effusion',                label:'Effusion (fluctuation)', kbe:'effusion'},
        {term:'crepitus',                label:'Crepitus',               kbe:'crepitus'},
        {term:'paraspinal tenderness',   label:'Paraspinal tenderness',  kbe:'paraspinal tenderness'},
        {term:'bony swelling',           label:'Bony swelling / osteophytes',kbe:'bony swelling'},
      ],
      local_exam:[
        {term:'slr positive',            label:'SLR +ve (sciatica/disc)',kbe:'slr positive'},
        {term:'restricted rom',          label:'Restricted range of motion',kbe:'restricted rom'},
        {term:'mcmurray test positive',  label:"McMurray's +ve (meniscus)",kbe:'meniscal injury'},
        {term:'lachman test positive',   label:"Lachman's +ve (ACL)",    kbe:'acl injury'},
        {term:'anterior drawer positive',label:'Anterior drawer +ve',   kbe:'acl injury'},
        {term:'finkelstein test positive',label:"Finkelstein's +ve (De Quervain's)",kbe:'de quervain tenosynovitis'},
        {term:'empty can test positive', label:'Empty can +ve (rotator cuff)',kbe:'rotator cuff tear'},
        {term:'hawkins test positive',   label:"Hawkins' +ve (impingement)",kbe:'shoulder impingement'},
        {term:'faber test positive',     label:'FABER +ve (hip/SI joint)',kbe:'sacroiliac joint pain'},
        {term:'sciatic stretch positive',label:'Sciatic stretch +ve',   kbe:'sciatica'},
        {term:'limited lumbar flexion',  label:'Limited lumbar flexion', kbe:'limited lumbar flexion'},
        {term:'tenderness over si joint',label:'SI joint tenderness',    kbe:'sacroiliac joint pain'},
      ],
    },
    vitals_fields:['HR (bpm)','BP (mmHg)','Temp (°C)','Weight (kg)','BMI'],
    required_missing:['joint_distribution','morning_stiffness_duration','trauma','single_vs_multiple'],
  },
  ps: {
    name:'Psychiatric', color:'var(--ps)', bg:'var(--ps-t)',
    activators:['anxiety','depression','low mood','insomnia','panic attack','fatigue','confusion'],
    exam_findings:{
      appearance:[
        {term:'poor grooming',           label:'Poor self-care/grooming',kbe:'psychomotor retardation'},
        {term:'psychomotor retardation', label:'Psychomotor retardation',kbe:'psychomotor retardation'},
        {term:'psychomotor agitation',   label:'Psychomotor agitation',  kbe:'psychomotor agitation'},
        {term:'flat affect',             label:'Flat / blunted affect',  kbe:'flat affect'},
        {term:'tearful',                 label:'Tearful',                kbe:'tearful'},
        {term:'poor eye contact',        label:'Poor eye contact',       kbe:'poor eye contact'},
      ],
      cognition:[
        {term:'disorientation',          label:'Disoriented (time/place)',kbe:'confusion'},
        {term:'poor concentration',      label:'Poor concentration',     kbe:'poor concentration'},
        {term:'impaired memory',         label:'Impaired memory',        kbe:'memory loss'},
        {term:'hallucinations',          label:'Hallucinations',         kbe:'hallucinations'},
        {term:'delusions',               label:'Delusions',              kbe:'delusions'},
      ],
      local_exam:[
        {term:'phq9 score >=10',         label:'PHQ-9 ≥ 10 (depression)',kbe:'depression low mood'},
        {term:'gad7 score >=10',         label:'GAD-7 ≥ 10 (anxiety)',   kbe:'anxiety'},
        {term:'suicidal ideation present',label:'Suicidal ideation +ve', kbe:'suicidal ideation'},
        {term:'insight absent',          label:'Insight absent',         kbe:'psychosis'},
        {term:'flight of ideas',         label:'Flight of ideas (mania)',kbe:'mania'},
      ],
    },
    vitals_fields:['BP (mmHg)','HR (bpm)','Weight (kg)','Temp (°C)','BMI'],
    required_missing:['mood_assessment','sleep_quality','suicidality','substance_use','life_stressors'],
  },
  rn: {
    name:'Renal / Urinary', color:'var(--info)', bg:'var(--info-t)',
    activators:['burning micturition','polyuria','haematuria','nocturia','urinary frequency',
      'proteinuria','dark urine','urinary retention','bilateral oedema'],
    exam_findings:{
      inspection:[
        {term:'periorbital puffiness',   label:'Periorbital puffiness (morning)',kbe:'periorbital puffiness'},
        {term:'bilateral pitting oedema',label:'Bilateral pitting oedema',kbe:'bilateral pitting oedema'},
        {term:'pallor',                  label:'Pallor (renal anaemia)', kbe:'pallor'},
        {term:'uraemic fetor',           label:'Uraemic breath',         kbe:'uraemia'},
        {term:'excoriation marks',       label:'Excoriation (pruritus)', kbe:'pruritus'},
      ],
      palpation:[
        {term:'renal angle tenderness',  label:'Renal angle tenderness (CVA)',kbe:'renal angle tenderness'},
        {term:'loin tenderness',         label:'Loin tenderness',        kbe:'loin tenderness'},
        {term:'suprapubic tenderness',   label:'Suprapubic tenderness',  kbe:'suprapubic tenderness'},
        {term:'palpable kidney',         label:'Palpable kidney',        kbe:'renal mass'},
        {term:'bladder enlargement',     label:'Palpable bladder (retention)',kbe:'urinary retention'},
      ],
      local_exam:[
        {term:'hypertension',            label:'BP elevated (renal HTN)',kbe:'hypertension'},
        {term:'urine dipstick — blood',  label:'Dipstick: blood +ve',    kbe:'haematuria'},
        {term:'urine dipstick — protein',label:'Dipstick: protein +ve',  kbe:'proteinuria'},
        {term:'urine dipstick — nitrites',label:'Dipstick: nitrites +ve (UTI)',kbe:'burning micturition'},
        {term:'urine dipstick — leucocytes',label:'Dipstick: leucocytes +ve',kbe:'burning micturition'},
        {term:'penile discharge',        label:'Penile discharge',       kbe:'penile discharge'},
        {term:'prostate enlarged on dre',label:'Prostate enlarged (DRE)',kbe:'benign prostatic hyperplasia'},
      ],
    },
    vitals_fields:['BP (mmHg)','HR (bpm)','Temp (°C)','Weight (kg)','Urine output'],
    required_missing:['dysuria','haematuria','frequency','prior_uti','diabetes','catheter_use'],
  },
};

function activateSystems(corpus) {
  if (!corpus) return {};
  const result = {};
  for (const [id, sys] of Object.entries(SYSTEMS)) {
    const hits = sys.activators.filter(a => corpus.includes(a));
    if (hits.length > 0) result[id] = { hits, score: hits.length };
  }
  return result;
}

// ══════════════════════════════════════════════════════════════
// MODULE C — CONDITIONS + SCORING ENGINE
// ══════════════════════════════════════════════════════════════

const CONDITIONS = [
  // CV
  { id:'acs', name:'ACS (STEMI/NSTEMI)', systems:['cv'], tier:'t3', danger:true,
    triggers:['chest pain'], w:{'chest pain':4,'diaphoresis':3,'radiation left arm':4,'radiation jaw':2,'dyspnoea':1,'nausea':1,'syncope':1},
    age:[35,90], gw:{M:1.4,F:0.9}, kerala:1.0,
    reason:'Chest pain + diaphoresis/radiation in adult = ACS until ECG proves otherwise.',
    missing:'Radiation pattern, onset time, sweating, prior cardiac history, ECG result.',
    gl:'ESC ACS 2023 / ACLS' },
  { id:'pe', name:'Pulmonary Embolism', systems:['cv','rs'], tier:'t3', danger:true,
    triggers:['dyspnoea','pleuritic pain'], w:{'dyspnoea':3,'pleuritic pain':2,'haemoptysis':2,'oedema':2,'syncope':1,'chest pain':1},
    age:[20,90], gw:{M:1.0,F:1.1}, kerala:1.0,
    reason:'Dyspnoea + pleuritic pain + risk factors (immobility/OCP) = PE until CT-PA excluded.',
    missing:'Immobility history, OCP/HRT use, previous DVT, Wells score components.',
    gl:'ESC PE 2019' },
  { id:'pneumothorax', name:'Tension Pneumothorax', systems:['rs','cv'], tier:'t3', danger:true,
    triggers:['dyspnoea','chest pain'], w:{'dyspnoea':3,'chest pain':2,'tracheal deviation':3,'absent breath sounds':2},
    age:[15,50], gw:{M:1.6,F:0.6}, kerala:1.0,
    reason:'Sudden dyspnoea + chest pain in young male. If haemodynamically unstable → tension pneumothorax.',
    missing:'Tracheal position, breath sounds comparison, SpO2, prior lung disease.',
    gl:'ATLS / BTS Pleural Disease' },
  { id:'heart_failure', name:'Heart Failure (Decompensated)', systems:['cv','rs'], tier:'t2', danger:false,
    triggers:['dyspnoea','oedema'], w:{'dyspnoea':2,'bilateral oedema':3,'orthopnoea':3,'paroxysmal nocturnal dyspnoea':3,'fatigue':1},
    age:[55,90], gw:{M:1.1,F:0.95}, kerala:1.2,
    reason:'Orthopnoea + bilateral oedema + exertional dyspnoea = heart failure triad.',
    missing:'Orthopnoea (pillow count), exertional threshold, prior cardiac history, BNP result.',
    gl:'ESC HF 2021' },
  { id:'asthma', name:'Asthma Exacerbation', systems:['rs'], tier:'t1', danger:false,
    triggers:['wheeze','dyspnoea'], w:{'wheeze':3,'dyspnoea':2,'chest pain':1,'cough':1,'nocturnal':2,'triggers':2},
    age:[5,55], gw:{M:1.1,F:1.0}, kerala:1.1,
    reason:'Episodic wheeze + dyspnoea + triggers + atopy — GINA criteria for asthma.',
    missing:'Trigger identification, PEFR, nocturnal symptoms, prior asthma diagnosis, reversibility.',
    gl:'GINA 2024' },
  { id:'anxiety_panic', name:'Anxiety / Panic Attack', systems:['ps','cv','rs'], tier:'t1', danger:false,
    triggers:['palpitations','dyspnoea'], w:{'palpitations':2,'dyspnoea':2,'chest pain':1,'dizziness':1,'tingling':2,'anxiety':3},
    age:[15,50], gw:{M:0.7,F:1.5}, kerala:1.0,
    reason:'Chest tightness + dyspnoea + palpitations + tingling with preserved SpO2 in young female.',
    missing:'Situational triggers, duration, recovery pattern, prior anxiety diagnosis, caffeine intake.',
    gl:'NICE NG222' },
  { id:'pneumonia', name:'Community-Acquired Pneumonia', systems:['rs'], tier:'t2', danger:false,
    triggers:['fever','cough'], w:{'fever':2,'cough':2,'dyspnoea':2,'productive cough':2,'rigors':1,'pleuritic pain':1},
    age:[5,90], gw:{M:1.0,F:1.0}, kerala:1.0,
    reason:'Fever + productive cough + dyspnoea = pneumonia. CXR mandatory.',
    missing:'Fever duration, sputum colour, rigors, CURB-65 components, CXR result.',
    gl:'BTS CAP 2009' },
  { id:'gerd', name:'GERD / Oesophageal Spasm', systems:['gi','rs'], tier:'t1', danger:false,
    triggers:['heartburn','chest pain'], w:{'heartburn':3,'chest pain':1,'regurgitation':2,'worse lying':1,'night symptoms':1},
    age:[25,70], gw:{M:1.2,F:0.9}, kerala:1.2,
    reason:'Burning chest pain + heartburn worse lying flat — GERD or oesophageal spasm.',
    missing:'Relation to meals, response to antacids, dysphagia, regurgitation, nocturnal symptoms.',
    gl:'ACG GERD Guidelines' },
  // ENDOCRINE
  { id:'hypothyroid', name:'Hypothyroidism', systems:['en'], tier:'t1', danger:false,
    triggers:['fatigue','weight gain'], w:{'fatigue':2,'weight gain':3,'cold intolerance':3,'hair loss':3,'menstrual irregularity':2,'constipation':1,'depression':1},
    age:[20,75], gw:{M:0.5,F:1.7}, kerala:1.8,
    reason:'Fatigue + weight gain + cold intolerance triad in Kerala female has highest prior probability for hypothyroidism.',
    missing:'Cold intolerance, hair loss, constipation, voice change, TSH result.',
    gl:'NICE CG132 / ETA 2019' },
  { id:'pcos', name:'PCOS', systems:['en'], tier:'t1', danger:false,
    triggers:['menstrual irregularity','weight gain'], w:{'menstrual irregularity':3,'weight gain':2,'hirsutism':3,'acne':2,'amenorrhoea':2},
    age:[14,45], gw:{M:0,F:1.0}, kerala:1.6,
    reason:'Menstrual irregularity + weight gain + hirsutism in reproductive age female — Rotterdam criteria.',
    missing:'Hirsutism, acne, fertility plans, LH:FSH ratio, pelvic USS.',
    gl:'ESHRE/ASRM PCOS 2023' },
  { id:'t2dm', name:'Type 2 Diabetes Mellitus', systems:['en'], tier:'t1', danger:false,
    triggers:['polyuria','polydipsia'], w:{'polyuria':3,'polydipsia':3,'weight loss':2,'fatigue':1,'blurred vision':1,'tingling':1},
    age:[30,90], gw:{M:1.1,F:1.0}, kerala:1.9,
    reason:'Polyuria + polydipsia in Kerala adult — prior T2DM probability >25% before testing.',
    missing:'Family history DM, HbA1c, fasting glucose, neuropathy screen, fundoscopy.',
    gl:'ADA 2024 / ICMR India' },
  // NEUROLOGICAL
  { id:'sah', name:'Subarachnoid Haemorrhage', systems:['nr'], tier:'t3', danger:true,
    triggers:['thunderclap headache','headache'], w:{'thunderclap headache':5,'headache':1,'neck stiffness':3,'photophobia':2,'vomiting':1,'syncope':2},
    age:[30,70], gw:{M:0.8,F:1.2}, kerala:1.0,
    reason:'"Worst headache of life" peaking in seconds = SAH until CT proves otherwise.',
    missing:'Onset speed (seconds vs hours), previous headaches, neck stiffness, LOC, CT result.',
    gl:'NICE NG214' },
  { id:'meningitis', name:'Bacterial Meningitis', systems:['nr'], tier:'t3', danger:true,
    triggers:['fever','neck stiffness'], w:{'fever':2,'neck stiffness':3,'headache':2,'photophobia':2,'rash':4,'confusion':2,'vomiting':1},
    age:[1,35], gw:{M:1.0,F:1.0}, kerala:1.0,
    reason:'Fever + neck stiffness + photophobia = meningitis triad. Non-blanching rash = meningococcal.',
    missing:'Rash character (blanching?), vaccination history, contacts, CSF result.',
    gl:'NICE NG98' },
  { id:'migraine', name:'Migraine', systems:['nr'], tier:'t1', danger:false,
    triggers:['headache'], w:{'headache':2,'nausea':2,'photophobia':2,'phonophobia':2,'unilateral':2,'aura':2,'pulsating':1},
    age:[15,60], gw:{M:0.7,F:1.4}, kerala:1.0,
    reason:'Unilateral pulsating headache + nausea + photo/phonophobia — ICHD-3 migraine criteria.',
    missing:'Aura type, triggers, previous pattern, OCP use (stroke risk with aura).',
    gl:'NICE NG150 / EHF' },
  // GI
  { id:'gi_bleed', name:'Upper GI Haemorrhage', systems:['gi'], tier:'t3', danger:true,
    triggers:['haematemesis','melaena'], w:{'haematemesis':4,'melaena':3,'dizziness':1,'syncope':2,'nsaid use':1,'alcohol history':1},
    age:[30,90], gw:{M:1.5,F:0.7}, kerala:1.1,
    reason:'Haematemesis or melaena = upper GI bleed until endoscopy. Immediate resuscitation required.',
    missing:'NSAID/aspirin use, alcohol intake, prior peptic ulcer, Glasgow-Blatchford score.',
    gl:'BSG Upper GI Bleed 2021' },
  { id:'iron_deficiency', name:'Iron Deficiency Anaemia', systems:['hm'], tier:'t1', danger:false,
    triggers:['fatigue','pallor'], w:{'fatigue':2,'pallor':3,'palpitations':1,'dyspnoea':1,'hair loss':1},
    age:[15,55], gw:{M:0.6,F:1.7}, kerala:1.5,
    reason:'Fatigue + pallor in Kerala reproductive-age female = iron deficiency anaemia until ferritin proves otherwise.',
    missing:'Menstrual blood loss, dietary iron, pica, serum ferritin, CBC result.',
    gl:'NICE NG24 / BSH' },
  // ── ADDITIONAL CONDITIONS (v5) ──────────────────────────────────────────
  { id:'viral_fever_urti', name:'Viral Fever / URTI', systems:['rs'], tier:'t1', danger:false,
    triggers:['fever','cough'], w:{'fever':3,'cough':2,'sore throat':3,'myalgia':2,'fatigue':1,'headache':1,'runny nose':2,'sneezing':2},
    age:[1,90], gw:{M:1.0,F:1.0}, kerala:1.5,
    reason:'Fever + sore throat + myalgia = viral URTI in most cases (adenovirus/influenza). Exclude dengue if >5 days.',
    missing:'Duration of fever, rash, dengue contact, platelet trend.',
    gl:'NICE CKS URTI / WHO Influenza' },
  { id:'peptic_ulcer', name:'Peptic Ulcer / Gastritis', systems:['gi'], tier:'t1', danger:false,
    triggers:['epigastric pain','heartburn'], w:{'epigastric pain':4,'heartburn':3,'nausea':2,'vomiting':2,'haematemesis':1,'melaena':1,'dyspepsia':2,'worse lying':1},
    age:[20,70], gw:{M:1.3,F:0.8}, kerala:1.4,
    reason:'Epigastric pain worse on empty stomach + heartburn = peptic ulcer or gastritis. H. pylori highly prevalent in India.',
    missing:'H. pylori test, NSAID/aspirin use, alcohol, response to antacids, OGD.',
    gl:'NICE CG184 / BSG Dyspepsia' },
  { id:'uti_dysuria', name:'Urinary Tract Infection', systems:['rn'], tier:'t1', danger:false,
    triggers:['burning micturition','urinary frequency'], w:{'burning micturition':5,'urinary frequency':4,'haematuria':3,'lower abdominal pain':2,'nocturia':2,'dark urine':2,'cloudy urine':2},
    age:[15,80], gw:{M:0.4,F:1.8}, kerala:1.5,
    reason:'Burning micturition + frequency + lower abdominal pain in females = UTI until MSU proves otherwise.',
    missing:'Fever (pyelonephritis?), MSU culture, pregnancy test, diabetes, catheter use.',
    gl:'NICE NG109 / IDSA UTI 2011' },
  { id:'copd_exac', name:'COPD Exacerbation', systems:['rs'], tier:'t2', danger:false,
    triggers:['dyspnoea','cough'], w:{'dyspnoea':3,'cough':2,'wheeze':2,'productive cough':2,'chronic cough':3,'smoking':2,'sputum':2},
    age:[40,90], gw:{M:1.4,F:0.8}, kerala:1.0,
    reason:'Chronic cough + dyspnoea + smoking history = COPD. Exacerbation: worsening over baseline with purulent sputum.',
    missing:'Smoking history (pack-years), prior COPD diagnosis, spirometry, GOLD grade.',
    gl:'GOLD 2024 / BTS COPD' },
  { id:'hepatitis', name:'Acute Viral Hepatitis', systems:['gi','hm'], tier:'t2', danger:false,
    triggers:['jaundice','nausea'], w:{'jaundice':5,'nausea':2,'vomiting':2,'fatigue':2,'anorexia':2,'dark urine':3,'right upper quadrant pain':3,'fever':2,'myalgia':1},
    age:[10,50], gw:{M:1.2,F:0.9}, kerala:1.6,
    reason:'Jaundice + dark urine + anorexia = hepatitis (A, E especially in Kerala). HBV/HCV in risk groups.',
    missing:'Vaccination status, travel history, water source, HBsAg, anti-HCV, anti-HAV IgM.',
    gl:'EASL Hepatitis 2017 / WHO' },
  { id:'dengue_fever', name:'Dengue Fever', systems:['hm','rs'], tier:'t2', danger:false,
    triggers:['fever','myalgia'], w:{'fever':3,'myalgia':4,'headache':2,'retro-orbital headache':5,'rash':3,'thrombocytopenia':4,'nausea':1,'bone pain':3,'fatigue':2},
    age:[5,60], gw:{M:1.0,F:1.0}, kerala:2.0,
    reason:'Fever + retro-orbital headache + myalgia + thrombocytopenia in monsoon Kerala = dengue until NS1 excluded.',
    missing:'Day of fever, platelet count, NS1 antigen, tourniquet test, dengue IgM/IgG.',
    gl:'WHO Dengue 2012 / NVBDCP India' },
  { id:'hyperthyroidism', name:'Hyperthyroidism / Thyrotoxicosis', systems:['en','cv'], tier:'t1', danger:false,
    triggers:['heat intolerance','palpitations'], w:{'heat intolerance':5,'palpitations':3,'weight loss':3,'tremor':4,'diarrhoea':2,'anxiety':2,'hair loss':2,'exophthalmos':4,'goitre':3,'tachycardia':3},
    age:[15,60], gw:{M:0.4,F:1.8}, kerala:1.6,
    reason:'Heat intolerance + weight loss + tremor + palpitations = hyperthyroidism. Graves disease most common in Kerala females.',
    missing:'Goitre on palpation, eye signs (exophthalmos), TFT (suppressed TSH + elevated FT4), TRAb.',
    gl:'ETA 2018 / NICE CG132' },
  { id:'acute_gastroenteritis_v2', name:'Acute Gastroenteritis / Food Poisoning', systems:['gi'], tier:'t1', danger:false,
    triggers:['diarrhoea','vomiting'], w:{'diarrhoea':5,'vomiting':3,'loose stools':5,'nausea':2,'abdominal cramps':3,'fever':1,'dehydration':3},
    age:[1,90], gw:{M:1.0,F:1.0}, kerala:1.5,
    reason:'Acute onset diarrhoea + vomiting = gastroenteritis. Common in Kerala monsoon — check for cholera, salmonella.',
    missing:'Dehydration signs, fever, blood in stool, food history, water source, contacts.',
    gl:'NICE CKS Gastroenteritis / WHO Diarrhoea' },
  { id:'hypertension_urg', name:'Hypertension', systems:['cv'], tier:'t1', danger:false,
    triggers:['hypertension'], w:{'hypertension':3,'headache':2,'fatigue':1,'palpitations':1,'blurred vision':2,'oedema':1},
    age:[30,90], gw:{M:1.2,F:1.0}, kerala:2.0,
    reason:'Hypertension is the leading non-communicable disease in Kerala adults — must be measured in every consultation.',
    missing:'BP (both arms), family history, target organ damage (renal, cardiac, eye), lifestyle factors.',
    gl:'ESH/ESC 2023 / ICMR India' },
  { id:'neuropathy_periph', name:'Peripheral Neuropathy', systems:['nr','en'], tier:'t2', danger:false,
    triggers:['tingling','numbness'], w:{'tingling':4,'numbness':4,'burning sensation feet':4,'peripheral neuropathy':5,'weakness':2,'glove stocking':3,'diabetes mellitus':2},
    age:[35,90], gw:{M:1.0,F:1.0}, kerala:1.8,
    reason:'Tingling/numbness in hands and feet = peripheral neuropathy — most commonly diabetic in Kerala adults.',
    missing:'Diabetes history/HbA1c, alcohol intake, B12 level, nerve conduction study.',
    gl:'AAN Peripheral Neuropathy / ADA 2024' },
  { id:'rheumatoid_arthritis', name:'Rheumatoid Arthritis', systems:['ms'], tier:'t2', danger:false,
    triggers:['joint pain','morning stiffness'], w:{'joint pain':3,'morning stiffness':4,'joint swelling':4,'symmetrical joint pain':4,'small joint involvement':4,'fatigue':2,'rheumatoid':3},
    age:[25,70], gw:{M:0.5,F:1.7}, kerala:1.3,
    reason:'Symmetrical small joint polyarthritis + morning stiffness >1 hour = RA until anti-CCP/RF proves otherwise.',
    missing:'Morning stiffness duration, joint distribution, RF, anti-CCP, ESR/CRP, X-rays.',
    gl:'NICE NG100 / ACR/EULAR 2010' },
  { id:'urolithiasis', name:'Renal Colic / Urolithiasis', systems:['rn','gi'], tier:'t2', danger:false,
    triggers:['loin pain','haematuria'], w:{'loin pain':5,'haematuria':4,'colicky pain':4,'vomiting':2,'radiation to groin':4,'nausea':2,'renal colic':5},
    age:[20,60], gw:{M:1.5,F:0.7}, kerala:1.3,
    reason:'Severe unilateral loin-to-groin colicky pain + haematuria = renal colic until USS/CT KUB proves otherwise.',
    missing:'Haematuria, prior stones, previous episodes, USS KUB, urine dipstick.',
    gl:'EAU Urolithiasis 2023 / NICE NG118' },
  { id:'appendicitis', name:'Acute Appendicitis', systems:['gi'], tier:'t2', danger:true,
    triggers:['right iliac fossa pain','abdominal pain'], w:{'right iliac fossa pain':5,'anorexia':3,'nausea':2,'vomiting':2,'fever':2,'periumbilical pain':2,'rebound tenderness':4},
    age:[10,40], gw:{M:1.1,F:1.0}, kerala:1.0,
    danger_why:'Perforation risk — delayed diagnosis can be fatal.',
    reason:'RIF pain + anorexia + fever = appendicitis until USS/CT proves otherwise. Alvarado score.',
    missing:'Migration of pain (periumbilical to RIF), Alvarado score, USS/CT abdomen.',
    gl:'NICE CG22 / ACS Acute Appendicitis' },
];

const CMAP = Object.fromEntries(CONDITIONS.map(c => [c.id, c]));

// ══════════════════════════════════════════════════════════════
// MODULE D — RED FLAG DETECTOR
// ══════════════════════════════════════════════════════════════

const RF_COMBOS = [
  { combo:['chest pain','diaphoresis'], sev:3, msg:'Chest pain + diaphoresis → ACS protocol. ECG within 10 minutes.', cond:'acs' },
  { combo:['chest pain','radiation left arm'], sev:3, msg:'Chest pain + left arm radiation → ACS until ECG proves otherwise.', cond:'acs' },
  { combo:['chest pain','radiation jaw'], sev:3, msg:'Chest pain + jaw radiation → STEMI equivalent.', cond:'acs' },
  { combo:['thunderclap headache'], sev:3, msg:'Thunderclap headache → SAH until CT proves otherwise. Do not treat empirically.', cond:'sah' },
  { combo:['fever','neck stiffness','photophobia'], sev:3, msg:'Meningitis triad → IV ceftriaxone immediately. Do not delay for LP.', cond:'meningitis' },
  { combo:['rash','fever','neck stiffness'], sev:3, msg:'Petechial rash + fever + neck stiffness → meningococcal sepsis. IV benzylpenicillin now.', cond:'meningitis' },
  { combo:['facial droop'], sev:3, msg:'Facial droop → FAST positive. CT brain STAT. Thrombolysis window 4.5 hours.', cond:null },
  { combo:['haematemesis'], sev:3, msg:'Haematemesis → upper GI bleed. IV access ×2, crossmatch, urgent OGD.', cond:'gi_bleed' },
  { combo:['melaena'], sev:3, msg:'Melaena → upper GI haemorrhage. Haemodynamic assessment immediately.', cond:'gi_bleed' },
  { combo:['abdominal pain','abdominal rigidity'], sev:3, msg:'Abdominal rigidity → peritonitis. Immediate surgical review. NBM.', cond:null },
  { combo:['dyspnoea','haemoptysis'], sev:2, msg:'Dyspnoea + haemoptysis → PE or lung malignancy. CT-PA if stable.', cond:'pe' },
  { combo:['palpitations','syncope'], sev:2, msg:'Palpitations + syncope → malignant arrhythmia. ECG immediately.', cond:null },
  { combo:['tearing pain'], sev:3, msg:'Tearing pain character → aortic dissection. CT aortogram — NO thrombolytics.', cond:null },
];

function detectRedFlags(corpus) {
  const flags = [], seen = new Set();
  for (const rule of RF_COMBOS) {
    if (rule.combo.every(p => corpus.includes(p))) {
      if (!seen.has(rule.msg)) { flags.push(rule); seen.add(rule.msg); }
    }
  }
  return flags;
}

// ══════════════════════════════════════════════════════════════
// MODULE E — MISSING DATA TEMPLATES
// ══════════════════════════════════════════════════════════════

const HISTORY_GAPS = {
  duration:    { label:'Duration of symptoms',         critical:true,  sys:'universal' },
  onset:       { label:'Onset — sudden or gradual',    critical:true,  sys:'universal' },
  progression: { label:'Progression — stable/worse/better', critical:false, sys:'universal' },
  radiation:   { label:'Radiation of pain',            critical:true,  sys:'cv' },
  exertion:    { label:'Exertion relationship',        critical:false, sys:'cv' },
  diaphoresis: { label:'Diaphoresis (sweating)',       critical:true,  sys:'cv' },
  prior_cardiac:{ label:'Prior cardiac history',      critical:false, sys:'cv' },
  orthopnoea:  { label:'Orthopnoea (pillow count)',    critical:false, sys:'cv' },
  smoking:     { label:'Smoking history',              critical:false, sys:'rs' },
  cough_dur:   { label:'Cough duration',               critical:false, sys:'rs' },
  sputum:      { label:'Sputum character/colour',      critical:false, sys:'rs' },
  triggers:    { label:'Triggers (dust/pets/exercise)', critical:false, sys:'rs' },
  nocturnal:   { label:'Nocturnal symptoms',           critical:false, sys:'rs' },
  weight_dir:  { label:'Weight — gaining or losing',   critical:true,  sys:'en' },
  menstrual:   { label:'Menstrual history',            critical:true,  sys:'en' },
  temp_tol:    { label:'Cold/heat intolerance',        critical:false, sys:'en' },
  fhx_dm:      { label:'Family history DM/Thyroid',   critical:false, sys:'en' },
  hair_loss:   { label:'Hair loss',                    critical:false, sys:'en' },
  onset_speed: { label:'Headache onset speed (seconds?)', critical:true, sys:'nr' },
  focal_neuro: { label:'Focal neurological signs',    critical:true,  sys:'nr' },
  fever:       { label:'Fever',                        critical:true,  sys:'nr' },
  bowel_habit: { label:'Bowel habit change',           critical:false, sys:'gi' },
  alcohol:     { label:'Alcohol history',              critical:true,  sys:'gi' },
  blood_stool: { label:'Blood in stool / Melaena',     critical:true,  sys:'gi' },
  b_symptoms:  { label:'B-symptoms (fever/sweats/weight loss)', critical:true, sys:'hm' },
  jt_dist:     { label:'Joint distribution (mono/poly)', critical:false, sys:'ms' },
  morning_stiff:{ label:'Morning stiffness duration', critical:false, sys:'ms' },
  mood:        { label:'Mood assessment (PHQ-9)',      critical:true,  sys:'ps' },
  sleep:       { label:'Sleep quality',                critical:false, sys:'ps' },
  suicidality: { label:'Suicidal ideation screen',    critical:true,  sys:'ps' },
};

function buildGapsForSystems(activeSystems) {
  const active = new Set(Object.keys(activeSystems));
  const gaps = [];
  for (const [key, g] of Object.entries(HISTORY_GAPS)) {
    if (g.sys === 'universal' || active.has(g.sys)) {
      gaps.push({ key, label: g.label, critical: g.critical, sys: g.sys, value: '' });
    }
  }
  return gaps;
}

// ══════════════════════════════════════════════════════════════
// MODULE F — DRUG SAFETY ENGINE
// ══════════════════════════════════════════════════════════════

const DRUG_INTERACTIONS_DB = [
  { drugs:['warfarin','aspirin'],          sev:'high',     desc:'Combined anticoagulant + antiplatelet significantly increases bleeding risk.', resolution:'Avoid combination unless benefit outweighs risk. Monitor INR closely. Consider PPI cover. BNF recommendation.' },
  { drugs:['warfarin','ibuprofen'],        sev:'high',     desc:'NSAIDs displace warfarin from protein binding and inhibit platelet function.', resolution:'Avoid NSAIDs with warfarin. Use paracetamol for analgesia. Monitor INR if unavoidable.' },
  { drugs:['metformin','contrast'],        sev:'high',     desc:'IV contrast media increases risk of metformin-associated lactic acidosis.', resolution:'Withhold metformin 48h before and after IV contrast. Check RFT before resuming. NICE recommendation.' },
  { drugs:['ace inhibitor','potassium'],   sev:'high',     desc:'ACEi reduces K+ excretion. Hyperkalaemia risk.',  resolution:'Monitor K+ and RFT regularly. Avoid K+ supplements unless monitored. BNF.' },
  { drugs:['ramipril','spironolactone'],   sev:'high',     desc:'Dual RAAS blockade → hyperkalaemia risk especially with CKD.', resolution:'Monitor K+ and eGFR regularly. Target K+ <5.0 mmol/L. ESC HF 2021.' },
  { drugs:['bisoprolol','verapamil'],      sev:'high',     desc:'Beta-blocker + verapamil = complete heart block and cardiac arrest risk.', resolution:'Avoid combination. If CCB needed, use amlodipine (dihydropyridine class). ESC.' },
  { drugs:['digoxin','amiodarone'],        sev:'high',     desc:'Amiodarone increases digoxin levels by 50-100% → digoxin toxicity.', resolution:'Reduce digoxin dose by 50% when starting amiodarone. Monitor digoxin level and ECG. BNF.' },
  { drugs:['lithium','ibuprofen'],         sev:'high',     desc:'NSAIDs reduce renal lithium excretion → lithium toxicity (narrow therapeutic index).', resolution:'Avoid NSAIDs with lithium. Use paracetamol. Monitor lithium levels if unavoidable. BNF.' },
  { drugs:['ssri','tramadol'],             sev:'high',     desc:'Serotonin syndrome risk — potentially fatal.', resolution:'Avoid combination. If pain control needed, use an alternative opioid under specialist guidance.' },
  { drugs:['rifampicin','ocp'],            sev:'high',     desc:'Rifampicin is a potent CYP inducer — renders OCP ineffective.', resolution:'Use barrier contraception for the duration of rifampicin + 4 weeks after. BNF / FSRH guidance.' },
  { drugs:['methotrexate','ibuprofen'],    sev:'high',     desc:'NSAIDs reduce renal MTX excretion → MTX toxicity (bone marrow suppression).', resolution:'Avoid NSAIDs with methotrexate. Use paracetamol. Alert rheumatologist.' },
  { drugs:['aspirin','clopidogrel'],       sev:'moderate', desc:'Dual antiplatelet therapy — acceptable for ACS/post-stent but increases bleeding.', resolution:'Acceptable for 12 months post-ACS. Use PPI cover (omeprazole). ESC ACS 2023.' },
  { drugs:['amlodipine','simvastatin'],    sev:'moderate', desc:'Amlodipine inhibits CYP3A4 — increases simvastatin level → myopathy risk.', resolution:'Cap simvastatin at 20mg with amlodipine. Consider switching to rosuvastatin/pravastatin. BNF.' },
  { drugs:['metformin','alcohol'],         sev:'moderate', desc:'Excessive alcohol with metformin → lactic acidosis risk.', resolution:'Advise alcohol limitation. Regular monitoring if alcohol dependency present.' },
  { drugs:['ace inhibitor','nsaid'],       sev:'moderate', desc:'Triple whammy: ACEi + NSAID + diuretic → acute kidney injury risk.', resolution:'Avoid NSAIDs in patients on ACEi + diuretics, especially elderly or CKD. Monitor RFT.' },
  { drugs:['warfarin','amiodarone'],       sev:'high',     desc:'Amiodarone inhibits warfarin metabolism → major bleeding risk.', resolution:'Reduce warfarin dose by 30-50%. Daily INR monitoring when initiating. BNF Class A.' },
  { drugs:['quinolone','antacid'],         sev:'low',      desc:'Antacids chelate quinolones → reduced absorption.', resolution:'Take quinolone 2 hours before or 6 hours after antacid. BNF.' },
  { drugs:['levothyroxine','calcium'],     sev:'low',      desc:'Calcium impairs levothyroxine absorption.', resolution:'Take levothyroxine 30 min before breakfast. Space calcium by 4 hours. NICE CG132.' },
  { drugs:['levothyroxine','omeprazole'],  sev:'low',      desc:'PPIs reduce levothyroxine absorption.', resolution:'Take levothyroxine on empty stomach. Monitor TSH more frequently.' },
];

function normalDrugName(name) {
  return name.toLowerCase().replace(/[^a-z\s]/g,'').trim();
}

const DRUG_KEY_MAP = {
  'warfarin':'warfarin', 'aspirin':'aspirin', 'clopidogrel':'clopidogrel',
  'ibuprofen':'ibuprofen','naproxen':'ibuprofen','diclofenac':'ibuprofen',
  'celecoxib':'ibuprofen','nsaid':'ibuprofen',
  'metformin':'metformin','lithium':'lithium',
  'rifampicin':'rifampicin','rifampin':'rifampicin',
  'ocp':'ocp','oral contraceptive':'ocp','contraceptive pill':'ocp',
  'methotrexate':'methotrexate',
  'amiodarone':'amiodarone','digoxin':'digoxin',
  'bisoprolol':'bisoprolol','atenolol':'bisoprolol','carvedilol':'bisoprolol',
  'metoprolol':'bisoprolol',
  'verapamil':'verapamil','diltiazem':'verapamil',
  'amlodipine':'amlodipine','felodipine':'amlodipine',
  'simvastatin':'simvastatin','atorvastatin':'atorvastatin',
  'ramipril':'ace inhibitor','lisinopril':'ace inhibitor',
  'perindopril':'ace inhibitor','enalapril':'ace inhibitor',
  'spironolactone':'spironolactone','eplerenone':'spironolactone',
  'potassium':'potassium','k supplement':'potassium',
  'tramadol':'tramadol',
  'sertraline':'ssri','fluoxetine':'ssri','citalopram':'ssri','escitalopram':'ssri',
  'contrast':'contrast','iodine contrast':'contrast',
  'antacid':'antacid','gaviscon':'antacid','rennies':'antacid',
  'levothyroxine':'levothyroxine','thyroxine':'levothyroxine',
  'calcium':'calcium','calcium carbonate':'calcium','calcitrol':'calcium',
  'omeprazole':'omeprazole','pantoprazole':'omeprazole','lansoprazole':'omeprazole',
  'alcohol':'alcohol',
  'quinolone':'quinolone','ciprofloxacin':'quinolone','levofloxacin':'quinolone',
};

function mapDrugToKey(name) {
  const n = normalDrugName(name);
  for (const [k, v] of Object.entries(DRUG_KEY_MAP)) {
    if (n.includes(k)) return v;
  }
  return n;
}

function checkInteractions(drugs) {
  const keys = drugs.map(d => mapDrugToKey(d.name));
  const found = [];
  const seen = new Set();
  for (const ix of DRUG_INTERACTIONS_DB) {
    const matched = ix.drugs.every(d => keys.some(k => k === d));
    if (matched) {
      const key = ix.drugs.join('+');
      if (!seen.has(key)) {
        found.push({ ...ix, matchedDrugs: ix.drugs });
        seen.add(key);
      }
    }
  }
  return found.sort((a,b) => {
    const order = {high:0,moderate:1,low:2};
    return (order[a.sev]||2) - (order[b.sev]||2);
  });
}

// ══════════════════════════════════════════════════════════════
// MODULE G — LAB DEFINITIONS
// ══════════════════════════════════════════════════════════════

const LAB_DEFS = {
  cbc: [
    { key:'hb',   name:'Hb',          unit:'g/dL',  ref:[12,18],  critical:[6,null] },
    { key:'wbc',  name:'WBC',         unit:'×10³',  ref:[4,11],   critical:[2,30] },
    { key:'plt',  name:'Platelets',   unit:'×10³',  ref:[150,400],critical:[50,null] },
    { key:'neut', name:'Neutrophils', unit:'%',      ref:[40,75],  critical:null },
    { key:'mcv',  name:'MCV',         unit:'fL',     ref:[80,100], critical:null },
  ],
  metabolic: [
    { key:'na',   name:'Sodium',    unit:'mmol/L', ref:[135,145], critical:[120,160] },
    { key:'k',    name:'Potassium', unit:'mmol/L', ref:[3.5,5.0], critical:[2.5,6.5] },
    { key:'urea', name:'Urea',      unit:'mmol/L', ref:[2.5,7.5], critical:[null,30] },
    { key:'cr',   name:'Creatinine',unit:'μmol/L', ref:[60,110],  critical:[null,500] },
    { key:'glu',  name:'Glucose',   unit:'mmol/L', ref:[4.0,7.8], critical:[2.5,25] },
    { key:'hba1c',name:'HbA1c',     unit:'%',      ref:[4,6.5],   critical:null },
  ],
  cardiac: [
    { key:'trop',  name:'Troponin I',  unit:'ng/L',  ref:[0,14],    critical:[null,50] },
    { key:'bnp',   name:'BNP',         unit:'pg/mL', ref:[0,100],   critical:[null,900] },
    { key:'ck',    name:'CK-MB',       unit:'U/L',   ref:[0,25],    critical:null },
    { key:'lact',  name:'Lactate',     unit:'mmol/L',ref:[0.5,1.6], critical:[null,4] },
  ],
  thyroid: [
    { key:'tsh',  name:'TSH',    unit:'mIU/L', ref:[0.4,4.0],  critical:[0.01,null] },
    { key:'ft4',  name:'Free T4',unit:'pmol/L',ref:[12,22],    critical:null },
    { key:'ft3',  name:'Free T3',unit:'pmol/L',ref:[3.1,6.8],  critical:null },
  ],
  lft: [
    { key:'alt',  name:'ALT',    unit:'U/L',   ref:[0,40],    critical:[null,1000] },
    { key:'ast',  name:'AST',    unit:'U/L',   ref:[0,40],    critical:[null,1000] },
    { key:'tbil', name:'Bili(T)', unit:'μmol/L',ref:[0,21],   critical:[null,200] },
    { key:'alp',  name:'ALP',    unit:'U/L',   ref:[35,130],  critical:null },
    { key:'alb',  name:'Albumin',unit:'g/L',   ref:[35,50],   critical:[20,null] },
    { key:'inr',  name:'INR',    unit:'',      ref:[0.9,1.2], critical:[null,5] },
  ],
  inflam: [
    { key:'crp',  name:'CRP',    unit:'mg/L',  ref:[0,5],     critical:[null,300] },
    { key:'esr',  name:'ESR',    unit:'mm/hr', ref:[0,20],    critical:null },
    { key:'pct',  name:'Procalcitonin',unit:'ng/mL',ref:[0,0.1],critical:[null,10] },
  ],
};

function getLabStatus(val, def) {
  if (!val && val !== 0) return 'normal';
  const v = parseFloat(val);
  if (isNaN(v)) return 'normal';
  const [lo, hi] = def.ref;
  const crit = def.critical;
  if (crit) {
    if ((crit[0] !== null && v <= crit[0]) || (crit[1] !== null && v >= crit[1])) return 'critical';
  }
  if (lo !== null && v < lo) return 'abnormal-low';
  if (hi !== null && v > hi) return 'abnormal-high';
  return 'normal';
}

// ══════════════════════════════════════════════════════════════
// MODULE H — DIFFERENTIAL + NEXT STEPS BUILDER
// ══════════════════════════════════════════════════════════════

// ══════════════════════════════════════════════════════════════
// RENDER FUNCTIONS
// ══════════════════════════════════════════════════════════════

function renderNormalizerOutput() {
  if (!S.normalizations.length) {
    document.getElementById('norm-content').innerHTML = `
      <div style="font-size:12.5px;color:var(--ink3);font-style:italic">
        No normalization needed — input appears to already be in standard form.
      </div>
      <div class="tags-row" id="extracted-symptoms"></div>`;
  } else {
    const typeLabels = { spell:'Spell', manglish:'Manglish', shorthand:'Shorthand', synonym:'Synonym' };
    document.getElementById('norm-content').innerHTML = `
      <div style="font-size:11px;font-weight:600;color:var(--ink3);text-transform:uppercase;letter-spacing:.5px;margin-bottom:10px">
        ${S.normalizations.length} normalization(s) applied
      </div>
      <div class="norm-list">${S.normalizations.map(n => `
        <div class="norm-row">
          <span class="norm-original">"${esc(n.original)}"</span>
          <span class="norm-arrow">→</span>
          <span class="norm-mapped">${esc(n.mapped)} <span class="badge badge-gray" style="font-size:8.5px">${typeLabels[n.type]||n.type}</span></span>
        </div>`).join('')}
      </div>
      <div style="margin-top:12px">
        <div style="font-size:11px;font-weight:600;color:var(--ink3);text-transform:uppercase;letter-spacing:.5px;margin-bottom:7px">Extracted Terms</div>
        <div class="tags-row" id="extracted-symptoms"></div>
      </div>`;
  }
  renderExtractedSymptoms();
}

function renderExtractedSymptoms() {
  const el = document.getElementById('extracted-symptoms');
  if (!el) return;
  const activeSysList = Object.keys(S.activeSystems);
  const sysClassMap = { cv:'cv',rs:'rs',en:'en',nr:'nr',gi:'gi',hm:'hm',ms:'ms',ps:'ps' };
  const syms = activeSysList.flatMap(id => S.activeSystems[id].hits.slice(0,3));
  const uniq = [...new Set(syms)];
  if (!uniq.length) { el.innerHTML = '<span style="font-size:11.5px;color:var(--ink4)">No specific terms extracted</span>'; return; }
  el.innerHTML = uniq.map((s,i) => {
    const sysId = activeSysList.find(id => S.activeSystems[id].hits.includes(s)) || 'cv';
    const cls = sysClassMap[sysId] || 'cv';
    return `<span class="tag tag-${cls}">${esc(s)}</span>`;
  }).join('');
}

function renderMissingDataPanel() {
  const el = document.getElementById('missing-data-content');
  if (!el) return;
  if (!S.gaps.length) { el.innerHTML = '<div class="empty-state"><div class="empty-state-icon">✅</div>No gaps detected.</div>'; return; }

  const criticalGaps = S.gaps.filter(g => g.critical);
  const optionalGaps = S.gaps.filter(g => !g.critical);
  const totalFilled = S.gaps.filter(g => g.value).length;

  const sysColor = { cv:'var(--cv)',rs:'var(--rs)',en:'var(--en)',nr:'var(--nr)',gi:'var(--gi)',hm:'var(--hm)',ms:'var(--ms)',ps:'var(--ps)',universal:'var(--ink3)' };

  const renderGapItem = (g) => {
    const filled = g.value ? 'filled' : '';
    const critical = g.critical && !g.value ? 'critical' : '';
    const color = sysColor[g.sys] || 'var(--ink3)';
    const sysName = SYSTEMS[g.sys]?.name || g.sys.charAt(0).toUpperCase()+g.sys.slice(1);
    return `<div class="gap-item ${filled} ${critical}" id="gap-item-${g.key}">
      <div class="gap-checkbox">${g.value ? '✓' : ''}</div>
      <div>
        <div class="gap-label">${esc(g.label)}</div>
        ${g.value ? `<div style="font-size:11px;color:var(--ok);margin-top:2px">${esc(g.value)}</div>` : ''}
      </div>
      <div style="display:flex;align-items:center;gap:6px">
        ${!g.value ? `<input class="gap-input" type="text" placeholder="Enter…" onchange="fillGap('${g.key}',this.value)" onblur="fillGap('${g.key}',this.value)">` : `<button class="btn btn-xs btn-secondary" onclick="clearGap('${g.key}')">Edit</button>`}
        <span class="gap-sys-tag" style="background:${color};color:#fff;opacity:.85">${esc(sysName.slice(0,3).toUpperCase())}</span>
      </div>
    </div>`;
  };

  el.innerHTML = `
    <div id="symptom-builder-container">${renderSymptomBuilder()}</div>
    <div class="card" style="margin-bottom:12px">
      <div class="card-head">
        <div class="card-title">📊 Completeness</div>
        <div class="card-sub">${totalFilled} / ${S.gaps.length} filled</div>
      </div>
      <div class="card-body">
        <div style="height:6px;background:var(--border);border-radius:3px;overflow:hidden">
          <div style="height:100%;background:var(--ok);border-radius:3px;width:${Math.round(totalFilled/S.gaps.length*100)}%;transition:width .4s"></div>
        </div>
        <div style="font-size:11px;color:var(--ink3);margin-top:6px">${criticalGaps.filter(g=>!g.value).length} critical items remaining</div>
      </div>
    </div>
    ${criticalGaps.length ? `
    <div class="card">
      <div class="card-head">
        <div class="card-title">🔴 Critical — Must Document</div>
        <div class="card-sub">${criticalGaps.filter(g=>!g.value).length} missing</div>
      </div>
      <div class="card-body">
        <div class="gap-list">${criticalGaps.map(renderGapItem).join('')}</div>
      </div>
    </div>` : ''}
    ${optionalGaps.length ? `
    <div class="card">
      <div class="card-head">
        <div class="card-title">⚪ Additional History</div>
        <div class="card-sub">${optionalGaps.filter(g=>!g.value).length} missing</div>
      </div>
      <div class="card-body">
        <div class="gap-list">${optionalGaps.map(renderGapItem).join('')}</div>
      </div>
    </div>` : ''}`;
}



// ══════════════════════════════════════════════════════════════
// STRUCTURED SYMPTOM BUILDER
// Clickable symptom grid organized by system — supplements free-text
// ══════════════════════════════════════════════════════════════

const SYMPTOM_BUILDER_GROUPS = [
  { label:'Cardiovascular', color:'var(--cv)', bg:'var(--cv-t)', icon:'❤️', symptoms:[
    'chest pain','chest tightness','palpitations','dyspnoea','exertional dyspnoea',
    'orthopnoea','bilateral oedema','diaphoresis','radiation left arm','radiation jaw',
    'syncope','tachycardia','bradycardia','pleuritic pain','paroxysmal nocturnal dyspnoea',
  ]},
  { label:'Respiratory', color:'var(--rs)', bg:'var(--rs-t)', icon:'🫁', symptoms:[
    'cough','productive cough','dry cough','haemoptysis','wheeze','dyspnoea',
    'pleuritic pain','night sweats','fever','rigors','breathlessness',
    'sputum','hoarse voice',
  ]},
  { label:'Endocrine', color:'var(--en)', bg:'var(--en-t)', icon:'⚗️', symptoms:[
    'fatigue','weight gain','weight loss','cold intolerance','heat intolerance',
    'polyuria','polydipsia','menstrual irregularity','amenorrhoea','hair loss',
    'hirsutism','acne','goitre','tremor','constipation','periorbital puffiness',
    'galactorrhoea','acanthosis nigricans','polyphagia',
  ]},
  { label:'Neurological', color:'var(--nr)', bg:'var(--nr-t)', icon:'🧠', symptoms:[
    'headache','thunderclap headache','neck stiffness','photophobia','phonophobia',
    'dizziness','vertigo','syncope','weakness','numbness','tingling',
    'speech difficulty','facial droop','diplopia','confusion','seizure',
    'memory loss','aura','vomiting',
  ]},
  { label:'Gastrointestinal', color:'var(--gi)', bg:'var(--gi-t)', icon:'🫃', symptoms:[
    'abdominal pain','epigastric pain','nausea','vomiting','diarrhoea','constipation',
    'heartburn','haematemesis','melaena','rectal bleeding','bloating',
    'jaundice','dysphagia','anorexia','loose stools','abdominal distension',
    'hepatomegaly','right iliac fossa pain','lower abdominal pain',
  ]},
  { label:'Haematological', color:'var(--hm)', bg:'var(--hm-t)', icon:'🩸', symptoms:[
    'fatigue','pallor','easy bruising','bleeding tendency','lymphadenopathy',
    'night sweats','bone pain','haemoptysis','petechiae','epistaxis',
    'splenomegaly','weight loss',
  ]},
  { label:'Musculoskeletal', color:'var(--ms)', bg:'var(--ms-t)', icon:'🦴', symptoms:[
    'joint pain','knee pain','hip pain','low back pain','morning stiffness',
    'joint swelling','joint inflammation','myalgia','neck pain','shoulder pain',
    'sciatica','crepitus','tingling','weakness','bone pain',
  ]},
  { label:'Psychiatric', color:'var(--ps)', bg:'var(--ps-t)', icon:'🧠', symptoms:[
    'depression low mood','anhedonia','anxiety','insomnia','fatigue',
    'poor concentration','mood changes','irritability','panic attack',
    'weight loss','weight gain','memory loss','confusion',
  ]},
  { label:'Urinary/Renal', color:'var(--info)', bg:'var(--info-t)', icon:'🫘', symptoms:[
    'burning micturition','polyuria','haematuria','nocturia','urinary frequency',
    'proteinuria','dark urine','urinary retention','bilateral oedema',
    'periorbital puffiness','hypertension','fatigue',
  ]},
  { label:'Fever/Infection', color:'var(--danger)', bg:'var(--danger-t)', icon:'🌡️', symptoms:[
    'fever','rigors','night sweats','fatigue','myalgia','headache',
    'rash','lymphadenopathy','productive cough','diarrhoea',
    'sore throat','nausea vomiting','weight loss',
  ]},
];

function renderSymptomBuilder() {
  const active = S.structuredSymptoms || [];
  const html = SYMPTOM_BUILDER_GROUPS.map(g => {
    const rows = g.symptoms.map(sym => {
      const isOn = active.includes(sym);
      return `<button onclick="toggleStructuredSymptom('${sym.replace(/'/g,"\\'")}',this)"
        style="padding:4px 10px;border-radius:20px;font-size:11px;font-weight:500;
        border:1.5px solid ${isOn ? g.color : 'var(--border2)'};
        background:${isOn ? g.bg : 'var(--surface)'};
        color:${isOn ? g.color : 'var(--ink3)'};cursor:pointer;transition:all .1s;
        white-space:nowrap;${isOn ? 'font-weight:700;' : ''}"
        data-sym="${sym}">${isOn ? '✓ ' : ''}${sym}</button>`;
    }).join('');
    return `<details style="border:1.5px solid var(--border);border-radius:var(--r);overflow:hidden;margin-bottom:6px">
      <summary style="padding:9px 14px;background:${g.bg};cursor:pointer;font-size:12px;font-weight:600;color:${g.color};display:flex;align-items:center;gap:8px;list-style:none">
        <span>${g.icon}</span><span>${g.label}</span>
        <span style="margin-left:auto;font-size:10px;color:${g.color};opacity:.7">${g.symptoms.filter(s=>active.includes(s)).length > 0 ? '('+g.symptoms.filter(s=>active.includes(s)).length+' selected)' : ''} ▶</span>
      </summary>
      <div style="padding:10px 14px;display:flex;flex-wrap:wrap;gap:6px">${rows}</div>
    </details>`;
  }).join('');
  return `<div class="card" style="margin-bottom:14px">
    <div class="card-head">
      <div class="card-title">🔘 Structured Symptom Builder
        <span class="badge badge-ok" style="margin-left:8px">v5 NEW</span>
      </div>
      <div class="card-sub">Click symptoms to add to diagnosis engine · Expands each system below</div>
    </div>
    <div class="card-body" style="padding:12px">
      ${active.length > 0 ? `<div style="display:flex;flex-wrap:wrap;gap:5px;margin-bottom:10px;padding:9px 12px;background:var(--en-t);border-radius:var(--r);border:1.5px solid rgba(10,122,110,.2)">
        <span style="font-size:10px;font-weight:700;color:var(--accent);text-transform:uppercase;letter-spacing:.5px;width:100%;margin-bottom:4px">Active Symptoms (${active.length})</span>
        ${active.map(s => `<span style="background:var(--accent);color:#fff;border-radius:12px;padding:2px 9px;font-size:11px;cursor:pointer" onclick="toggleStructuredSymptom('${s.replace(/'/g,"\\'")}')">✓ ${s} ×</span>`).join('')}
      </div>` : `<div style="font-size:12px;color:var(--ink4);margin-bottom:10px;padding:6px 0">Click a system below to expand, then click symptoms the patient has. This directly improves diagnostic accuracy.</div>`}
      ${html}
    </div>
  </div>`;
}

function toggleStructuredSymptom(sym) {
  if (!S.structuredSymptoms) S.structuredSymptoms = [];
  const idx = S.structuredSymptoms.indexOf(sym);
  if (idx >= 0) S.structuredSymptoms.splice(idx, 1);
  else S.structuredSymptoms.push(sym);
  // Re-render symptom builder section
  const sbEl = document.getElementById('symptom-builder-container');
  if (sbEl) sbEl.innerHTML = renderSymptomBuilder();
  // Re-score with updated symptoms
  rebuildCorpusAndRescore();
  /* updateLivePanel() */
  notify(idx >= 0 ? `Removed: ${sym}` : `Added: ${sym}`, 'ok');
}

function renderExamSection(section, items, sysId, sysFindings) {
  return '<div style="margin-bottom:12px">' +
    '<div style="font-size:10px;font-weight:600;color:var(--ink3);text-transform:uppercase;letter-spacing:.5px;margin-bottom:6px">' + esc(section) + '</div>' +
    '<div class="exam-grid">' +
    items.map(function(item) { return renderExamField(item, sysId, sysFindings); }).join('') +
    '</div></div>';
}

function renderExamField(item, sysId, sysFindings) {
  const key = sysId + '_' + item.replace(/[^a-zA-Z0-9]/g, '_').toLowerCase();
  const val = sysFindings[key] || '';
  return '<div class="exam-field">' +
    '<div class="exam-field-label">' + esc(item) + '</div>' +
    '<input class="exam-input" type="text" placeholder="\u2014" value="' + esc(val) + '"' +
    ' onchange="fillExam(\'' + sysId + '\',\'' + key + '\',this.value)"' +
    ' onblur="fillExam(\'' + sysId + '\',\'' + key + '\',this.value)">' +
    '</div>';
}

function renderExamPanel() {
  const el = document.getElementById('exam-content');
  if (!el) return;
  const activeSysList = Object.keys(S.activeSystems);
  if (!activeSysList.length) { el.innerHTML = '<div class="empty-state"><div class="empty-state-icon">🩺</div>No systems activated.</div>'; return; }

  // Ensure active findings store exists
  if (!S.activeExamFindings) S.activeExamFindings = {};

  el.innerHTML = activeSysList.map(sysId => {
    const sys = SYSTEMS[sysId];
    if (!sys) return '';
    const findings = sys.exam_findings || {};
    const activeFindingsForSys = S.activeExamFindings[sysId] || [];
    const vitalsFields = sys.vitals_fields || [];
    const sysVitals = S.examFindings[sysId] || {};

    const sectionOrder = ['inspection','palpation','percussion','auscultation','cranial_nerves',
      'motor','sensory','general','cognition','appearance','local_exam'];
    const sectionLabels = {
      inspection:'👁 Inspection', palpation:'🤚 Palpation',
      percussion:'🎵 Percussion', auscultation:'🔊 Auscultation',
      cranial_nerves:'🧠 Cranial Nerves', motor:'💪 Motor System',
      sensory:'✋ Sensory', general:'📋 General',
      cognition:'🧩 Cognition', appearance:'👤 Appearance',
      local_exam:'📍 Local Examination',
    };

    const totalActive = activeFindingsForSys.length;

    const sectionsHtml = sectionOrder.map(sec => {
      const items = findings[sec];
      if (!items || !items.length) return '';
      const isLocalExam = sec === 'local_exam';
      const label = sectionLabels[sec] || sec;
      const rows = items.map(f => {
        const isOn = activeFindingsForSys.includes(f.term);
        const btnStyle = isOn
          ? `border-color:${sys.color};background:${sys.bg};color:${sys.color};font-weight:700;`
          : `border-color:var(--border2);background:var(--surface);color:var(--ink3);`;
        return `<button
          onclick="toggleExamFinding('${sysId}','${f.term.replace(/'/g,"\\'")}')"
          style="padding:5px 11px;border-radius:20px;font-size:11px;border:1.5px solid;cursor:pointer;
          transition:all .12s;white-space:nowrap;${btnStyle}"
          title="${f.kbe}"
        >${isOn ? '✓ ' : ''}${esc(f.label)}</button>`;
      }).join('');

      return `<div style="margin-bottom:12px">
        <div style="font-size:9.5px;font-weight:700;color:${isLocalExam ? sys.color : 'var(--ink3)'};
          text-transform:uppercase;letter-spacing:.8px;margin-bottom:6px;
          ${isLocalExam ? `background:${sys.bg};padding:4px 10px;border-radius:4px;display:inline-block;` : ''}
        ">${label}${isLocalExam ? ' — click to record specific tests' : ''}</div>
        <div style="display:flex;flex-wrap:wrap;gap:5px">${rows}</div>
      </div>`;
    }).join('');

    const vitalsHtml = vitalsFields.length ? `
      <div style="margin-bottom:12px">
        <div style="font-size:9.5px;font-weight:700;color:var(--ink3);text-transform:uppercase;letter-spacing:.8px;margin-bottom:6px">🩺 Vitals</div>
        <div style="display:grid;grid-template-columns:repeat(auto-fill,minmax(130px,1fr));gap:6px">
          ${vitalsFields.map(f => {
            const key = sysId + '_vital_' + f.replace(/[^a-z0-9]/gi,'_').toLowerCase();
            const val = sysVitals[key] || '';
            return `<div style="background:var(--surface2);border:1.5px solid var(--border);border-radius:var(--r);padding:6px 9px">
              <div style="font-size:9px;font-weight:600;color:var(--ink3);text-transform:uppercase;margin-bottom:3px">${esc(f)}</div>
              <input type="text" value="${esc(val)}" placeholder="—"
                style="width:100%;border:none;background:transparent;font-family:var(--font-mono);font-size:13px;color:var(--ink);outline:none"
                onchange="fillExam('${sysId}','${key}',this.value)"
                onblur="fillExam('${sysId}','${key}',this.value)">
            </div>`;
          }).join('')}
        </div>
      </div>` : '';

    // Active findings summary strip
    const activeStripHtml = totalActive > 0
      ? `<div style="display:flex;flex-wrap:wrap;gap:4px;margin-bottom:10px;padding:8px 10px;
           background:${sys.bg};border-radius:var(--r);border:1.5px solid ${sys.color}33">
          <span style="font-size:9px;font-weight:700;color:${sys.color};text-transform:uppercase;
            letter-spacing:.5px;width:100%;margin-bottom:3px">Active Findings (${totalActive})</span>
          ${activeFindingsForSys.map(t => {
            const f = Object.values(findings).flat().find(x => x.term === t);
            return `<span style="background:${sys.color};color:#fff;border-radius:12px;padding:2px 8px;
              font-size:11px;cursor:pointer" onclick="toggleExamFinding('${sysId}','${t.replace(/'/g,"\\'")}')"
            >✓ ${esc(f?.label || t)} ×</span>`;
          }).join('')}
        </div>` : '';

    // Free text notes
    const notesKey = sysId + '_free_notes';
    const notesVal = sysVitals[notesKey] || '';

    return `<div class="exam-system" id="exam-sys-${sysId}">
      <div class="exam-sys-head" onclick="toggleExam('${sysId}')" id="exam-head-${sysId}">
        <div class="exam-sys-title">
          <span style="color:${sys.color};font-size:13px">●</span>
          ${esc(sys.name)} — Examination
        </div>
        <div style="display:flex;align-items:center;gap:8px">
          <span class="badge ${totalActive > 0 ? 'badge-ok' : 'badge-gray'}">${totalActive} finding${totalActive!==1?'s':''}</span>
          <span style="font-size:11px;color:var(--ink4)" id="exam-toggle-${sysId}">▼</span>
        </div>
      </div>
      <div class="exam-sys-body" id="exam-body-${sysId}">
        ${activeStripHtml}
        ${vitalsHtml}
        ${sectionsHtml}
        <div style="margin-top:10px">
          <div style="font-size:9.5px;font-weight:700;color:var(--ink3);text-transform:uppercase;letter-spacing:.8px;margin-bottom:5px">📝 Additional Notes</div>
          <textarea style="width:100%;min-height:50px;padding:8px 10px;border:1.5px solid var(--border);
            border-radius:var(--r);font-family:var(--font-sans);font-size:12px;resize:vertical;outline:none"
            placeholder="Any other findings not listed above…"
            onblur="fillExam('${sysId}','${notesKey}',this.value)">${esc(notesVal)}</textarea>
        </div>
      </div>
    </div>`;
  }).join('');
}

/**
 * Toggle a standardized exam finding — adds canonical kbe term to examFindings
 * so kbeScoreCondition can match it directly
 */
function toggleExamFinding(sysId, term) {
  if (!S.activeExamFindings) S.activeExamFindings = {};
  if (!S.activeExamFindings[sysId]) S.activeExamFindings[sysId] = [];

  const arr = S.activeExamFindings[sysId];
  const idx = arr.indexOf(term);
  if (idx >= 0) arr.splice(idx, 1);
  else arr.push(term);

  // Write ALL active findings for this system as a concatenated string
  // into examFindings so kbeScoreCondition allExamText matches them
  if (!S.examFindings[sysId]) S.examFindings[sysId] = {};
  const sys = SYSTEMS[sysId];
  const allFindings = sys?.exam_findings || {};
  const activeKbeTerms = arr.map(t => {
    const f = Object.values(allFindings).flat().find(x => x.term === t);
    return f ? f.kbe : t;
  });
  S.examFindings[sysId]['__active_findings__'] = activeKbeTerms.join(' ');

  // Re-render just this system's section
  const panel = document.getElementById('exam-body-' + sysId);
  if (panel) {
    // Re-render full exam panel
    /* renderExamPanel() */
    // Re-open the toggled system
    setTimeout(() => {
      const body = document.getElementById('exam-body-' + sysId);
      const head = document.getElementById('exam-head-' + sysId);
      const tog  = document.getElementById('exam-toggle-' + sysId);
      if (body) { body.classList.add('open'); if(head) head.classList.add('open'); if(tog) tog.textContent='▲'; }
    }, 10);
  }

  // Re-score with updated exam findings
  kbeDebounce('exam_rescore', () => {
    S.scored       = kbeScoreAll(S.corpus, S.patient, S.examFindings, S.labs, S.gaps);
    S.differential = kbeBuildDifferential(S.scored, S.redFlags);
    /* updateLivePanel() */
  }, 300);

  notify(idx >= 0 ? `Removed: ${term}` : `Added: ${term}`, 'ok');
}

function renderDrugList() {
  const card = document.getElementById('drug-list-card');
  const listEl = document.getElementById('drug-list');
  if (!S.drugs.length) { card.style.display='none'; return; }
  card.style.display='block';
  listEl.innerHTML = S.drugs.map((d,i) => `
    <div class="drug-item">
      <div><div class="drug-name">${esc(d.name)}</div><div class="drug-dose">${esc(d.dose||'—')} · ${esc(d.duration||'ongoing')}</div></div>
      <div class="tag tag-ok">On list</div>
      <button class="btn btn-xs btn-secondary" onclick="removeDrug(${i})">Remove</button>
    </div>`).join('');
}

function renderInteractions() {
  const ix = S.interactions;
  const el = document.getElementById('drug-interactions-content');
  const liveDrug = document.getElementById('live-drug-section');
  const liveDrugAlerts = document.getElementById('live-drug-alerts');

  if (!ix.length) {
    el.innerHTML = S.drugs.length
      ? `<div class="process-banner ok"><span>✓</span>No significant drug interactions detected for ${S.drugs.length} medication(s).</div>`
      : `<div class="empty-state"><div class="empty-state-icon">✅</div>No medications added. Add medications to check for interactions.</div>`;
    liveDrug.style.display='none';
    updateBadge(4, null);
    return;
  }

  const highCount = ix.filter(i=>i.sev==='high').length;
  liveDrug.style.display='block';
  updateBadge(4, highCount > 0 ? `${highCount}` : null);

  el.innerHTML = `
    <div class="card">
      <div class="card-head">
        <div class="card-title">⚠️ Drug Interactions</div>
        <div style="display:flex;gap:6px">
          ${ix.filter(i=>i.sev==='high').length ? `<span class="badge badge-danger">${ix.filter(i=>i.sev==='high').length} HIGH</span>` : ''}
          ${ix.filter(i=>i.sev==='moderate').length ? `<span class="badge badge-warn">${ix.filter(i=>i.sev==='moderate').length} MODERATE</span>` : ''}
        </div>
      </div>
      <div class="card-body">
        ${ix.map(i => `
          <div class="interaction-item ${i.sev}">
            <div style="display:flex;align-items:center;gap:8px;margin-bottom:4px">
              <span class="interaction-badge ${i.sev}">${i.sev.toUpperCase()}</span>
              <div class="interaction-title">${i.matchedDrugs.map(d=>d.charAt(0).toUpperCase()+d.slice(1)).join(' + ')}</div>
            </div>
            <div class="interaction-desc">${esc(i.desc)}</div>
            <div class="interaction-resolution">Resolution: ${esc(i.resolution)}</div>
          </div>`).join('')}
      </div>
    </div>`;

  liveDrugAlerts.innerHTML = ix.slice(0,3).map(i => `
    <div style="font-size:11px;padding:5px 0;border-bottom:1px solid var(--border);color:${i.sev==='high'?'var(--danger)':i.sev==='moderate'?'var(--warn)':'var(--info)'};display:flex;gap:6px">
      <span>${i.sev==='high'?'⛔':i.sev==='moderate'?'⚠️':'ℹ️'}</span>
      <span>${i.matchedDrugs.map(d=>d.charAt(0).toUpperCase()+d.slice(1)).join(' + ')}</span>
    </div>`).join('');
}

function buildLabInputs(sectionId, defs) {
  const el = document.getElementById(sectionId);
  if (!el) return;
  el.innerHTML = defs.map(def => {
    const val = S.labs[def.key] || '';
    const status = val ? getLabStatus(val, def) : '';
    return `<div class="lab-item ${status}" id="labitem-${def.key}">
      <div class="lab-name">${esc(def.name)}</div>
      <input class="lab-input ${status.includes('abnormal')||status==='critical' ? (status==='critical'?'':'') : ''}"
        type="text" value="${esc(val)}" placeholder="—"
        oninput="updateLab('${def.key}',this.value,'${sectionId}')"
        style="${status==='abnormal-high'?'color:var(--danger)':status==='abnormal-low'?'color:var(--info)':status==='critical'?'color:var(--danger);font-weight:700':''}">
      <div class="lab-range">${def.ref[0]} – ${def.ref[1]} ${esc(def.unit)}</div>
      <div class="lab-arrow"></div>
    </div>`;
  }).join('');
}

function renderLabAlerts() {
  const alerts = [];
  for (const [group, defs] of Object.entries(LAB_DEFS)) {
    for (const def of defs) {
      const val = S.labs[def.key];
      if (!val) continue;
      const status = getLabStatus(val, def);
      if (status !== 'normal') {
        alerts.push({ name: def.name, value: val, unit: def.unit, ref: def.ref, status, group });
      }
    }
  }
  S.labAlerts = alerts;

  const el = document.getElementById('lab-alerts-content');
  const liveLabs = document.getElementById('live-labs-section');
  const liveLabFlags = document.getElementById('live-lab-flags');
  const statLabs = document.getElementById('stat-labs');
  const labCount = Object.values(S.labs).filter(v => v).length;
  if (statLabs) statLabs.textContent = labCount + ' entered';

  if (!alerts.length) {
    el.style.display='none'; liveLabs.style.display='none';
    updateBadge(5, null); return;
  }

  el.style.display='block';
  liveLabs.style.display='block';
  updateBadge(5, alerts.filter(a=>a.status==='critical').length > 0 ? '!' : null);

  const criticals = alerts.filter(a=>a.status==='critical');
  const highs = alerts.filter(a=>a.status==='abnormal-high');
  const lows = alerts.filter(a=>a.status==='abnormal-low');

  document.getElementById('lab-alerts-list').innerHTML = [...criticals,...highs,...lows].map(a => `
    <div style="display:flex;align-items:center;gap:10px;padding:9px 14px;border-bottom:1px solid var(--border)">
      <span class="badge ${a.status==='critical'?'badge-danger':a.status==='abnormal-high'?'badge-warn':'badge-info'}">${a.status==='critical'?'CRITICAL':a.status==='abnormal-high'?'HIGH':'LOW'}</span>
      <span style="font-size:12.5px;font-weight:500;color:var(--ink)">${esc(a.name)}</span>
      <span style="font-family:var(--font-mono);font-size:13px;font-weight:600;color:${a.status==='critical'?'var(--danger)':a.status==='abnormal-high'?'var(--warn)':'var(--info)'}">${esc(a.value)} ${esc(a.unit)}</span>
      <span style="font-size:11px;color:var(--ink3)">(ref: ${a.ref[0]}–${a.ref[1]})</span>
    </div>`).join('');

  liveLabFlags.innerHTML = alerts.slice(0,4).map(a => `
    <div style="display:flex;gap:6px;font-size:11px;padding:4px 0;border-bottom:1px solid var(--border);color:${a.status==='critical'?'var(--danger)':a.status==='abnormal-high'?'var(--warn)':'var(--info)'}">
      <span>${a.status==='critical'?'🔴':a.status==='abnormal-high'?'🟡':'🔵'}</span>
      <span>${esc(a.name)}: <strong>${esc(a.value)} ${esc(a.unit)}</strong></span>
    </div>`).join('');
}

function _base_buildAssessment() {
  const el = document.getElementById('assessment-content');
  if (!el) return;

  const diff = S.differential;
  const steps = S.nextSteps;
  const pt = S.patient;

  const sysTagsHtml = Object.entries(S.activeSystems).map(([id, d]) => {
    const sys = SYSTEMS[id];
    return `<span class="sys-pill" style="color:${sys.color};background:${sys.bg};border-color:${sys.color}">${esc(sys.name)} <span style="font-family:var(--font-mono);font-size:9px;opacity:.7">(${d.score})</span></span>`;
  }).join('');

  const filledHistory = S.gaps.filter(g => g.value).map(g => `<div style="display:flex;gap:8px;padding:5px 0;border-bottom:1px solid var(--border);font-size:12.5px"><span style="color:var(--ink3);min-width:120px">${esc(g.label)}</span><span style="color:var(--ink)">${esc(g.value)}</span></div>`).join('');

  const examSummary = Object.entries(S.examFindings).map(([sysId, findings]) => {
    const filled = Object.entries(findings).filter(([,v])=>v);
    if (!filled.length) return '';
    const sys = SYSTEMS[sysId];
    return `<div style="margin-bottom:8px"><div style="font-size:11px;font-weight:600;color:${sys.color};text-transform:uppercase;letter-spacing:.5px;margin-bottom:5px">${esc(sys.name)}</div>${filled.map(([k,v])=>`<div style="font-size:12px;padding:3px 0;border-bottom:1px solid var(--border)"><span style="color:var(--ink3);min-width:150px;display:inline-block">${esc(k.replace(/_/g,' ').replace(sysId+'_',''))}</span> ${esc(v)}</div>`).join('')}</div>`;
  }).filter(Boolean).join('');

  const renderDiffTier = (items, tierLabel, color) => {
    if (!items.length) return '';
    const maxScore = Math.max(...items.map(i=>i.score||0), 1);
    return `<div class="diff-tier" style="border-color:${color}20">
      <div class="diff-tier-head" onclick="toggleTier(this)" style="background:${color}10;cursor:pointer">
        <div class="diff-tier-label" style="color:${color}">${esc(tierLabel)}</div>
        <div class="diff-tier-count">${items.length} condition(s)</div>
        <div class="diff-tier-toggle open">▼</div>
      </div>
      <div class="diff-tier-body open">
        ${items.map(c => {
          const fillPct = Math.round(((c.score||0)/maxScore)*100);
          const kb = lookupKB(c.id);
          const glTags = c.gl ? `<span class="badge badge-gray" style="font-size:8.5px">${esc(c.gl.split('/')[0].trim())}</span>` : '';
          const kbBtn = kb ? `<button class="btn btn-xs btn-secondary" onclick="event.stopPropagation();openKBModal('${esc(c.id)}')" style="margin-left:auto;font-size:9px">📖 Protocol</button>` : '';
          return `<div class="diff-cond">
            <div style="flex:1;min-width:0">
              <div style="display:flex;align-items:center;gap:7px;margin-bottom:3px;flex-wrap:wrap">
                <div class="diff-cond-name">${esc(c.name)}</div>
                ${glTags}
                ${kbBtn}
              </div>
              <div class="diff-cond-reason">${esc((c.reason||'').slice(0,140))}</div>
              ${(() => { const disp = getDisposition(c.id); return disp ? `<div style="font-size:10.5px;font-weight:700;padding:2px 8px;border-radius:3px;display:inline-block;margin:3px 0;${disp.level==='emergency'?'background:var(--danger-t);color:var(--danger)':disp.level==='admit'?'background:rgba(184,106,0,.12);color:var(--warn)':disp.level==='refer'?'background:var(--info-t);color:var(--info)':'background:var(--ok-t);color:var(--ok)'}">${esc(disp.tag)}</div><div style="font-size:11px;color:var(--ink3);line-height:1.4">${esc(disp.msg)}</div>` : ''; })()}
              ${c.missing ? `<div class="diff-cond-missing">⟳ Missing to confirm: ${esc(c.missing.slice(0,100))}</div>` : ''}
            </div>
            <div class="diff-score" style="flex-shrink:0;margin-left:10px">
              ${c.score && c.score < 900 ? `<div style="margin-bottom:2px">${c.score.toFixed(1)}</div>` : ''}
              <div class="diff-score-bar"><div class="diff-score-fill" style="width:${fillPct}%;background:${color}"></div></div>
            </div>
          </div>`;
        }).join('')}
      </div>
    </div>`;
  };

  const urgencyConfig = {
    urgent: { cls:'urgent', label:'IMMEDIATE' },
    important: { cls:'important', label:'HIGH PRIORITY' },
    routine: { cls:'routine', label:'ROUTINE' },
  };

  const nextStepsHtml = steps.map(s => {
    const cfg = urgencyConfig[s.urgency] || urgencyConfig.routine;
    return `<div class="next-step ${cfg.cls}">
      <div class="next-step-icon">${s.icon}</div>
      <div>
        <div class="next-step-type">${cfg.label} · ${s.type.toUpperCase()}</div>
        <div class="next-step-text">${esc(s.action)}</div>
        <div class="next-step-why">${esc(s.why)}</div>
      </div>
    </div>`;
  }).join('');

  const rfBannerHtml = S.redFlags.length
    ? `<div class="process-banner danger">⚑ ${S.redFlags.length} Red Flag(s) Active — Emergency assessment required</div>`
    : `<div class="process-banner ok">✓ No emergency red flags from available history</div>`;

  el.innerHTML = `
    ${rfBannerHtml}

    <div class="card"><div class="card-head"><div class="card-title">01 · Problem Representation</div></div>
    <div class="card-body">
      <div class="summary-section">
        <div class="summary-section-title">Patient</div>
        <div style="font-size:13px;color:var(--ink2)">${pt.age||'?'}y ${pt.gender==='F'?'Female':pt.gender==='M'?'Male':pt.gender||'Not specified'}${pt.comorbid?` · Comorbidities: ${esc(pt.comorbid)}`:''}
        </div>
      </div>
      <div class="summary-section">
        <div class="summary-section-title">Chief Complaint</div>
        <div style="font-size:13px;color:var(--ink2);line-height:1.6;padding:8px 12px;background:var(--surface2);border-radius:var(--r);border-left:3px solid var(--accent)">${esc(S.rawInput.slice(0,200))}${S.rawInput.length>200?'…':''}</div>
      </div>
      <div class="summary-section">
        <div class="summary-section-title">System Involvement</div>
        <div class="system-involvement-row">${sysTagsHtml || '<span style="color:var(--ink4);font-size:11.5px">No specific systems activated</span>'}</div>
      </div>
      <div class="certainty-display" style="margin-top:10px">
        <span style="font-size:11px;color:var(--ink3);min-width:80px">Confidence</span>
        <div class="certainty-bar"><div class="certainty-fill" style="width:${S.certainty}%"></div></div>
        <span class="certainty-pct">${S.certainty}%</span>
      </div>
    </div></div>

    ${filledHistory ? `<div class="card"><div class="card-head"><div class="card-title">02 · Clinical History</div><div class="card-sub">${S.gaps.filter(g=>g.value).length} / ${S.gaps.length} documented</div></div><div class="card-body">${filledHistory}</div></div>` : ''}

    ${examSummary ? `<div class="card"><div class="card-head"><div class="card-title">03 · Examination Findings</div></div><div class="card-body">${examSummary}</div></div>` : ''}

    <div class="card"><div class="card-head"><div class="card-title">04 · 3-Tier Differential Diagnosis</div></div>
    <div class="card-body p0" style="padding:12px">
      ${renderDiffTier(diff.t3,'TIER 3 — Must Not Miss','var(--danger)')}
      ${renderDiffTier(diff.t1,'TIER 1 — Most Likely','var(--ok)')}
      ${renderDiffTier(diff.t2,'TIER 2 — Possible','var(--info)')}
      ${!diff.t1.length&&!diff.t2.length&&!diff.t3.length?'<div class="empty-state">Complete intake to generate differential.</div>':''}
    </div></div>

    ${S.interactions.length ? `<div class="card"><div class="card-head"><div class="card-title">05 · Drug Safety Alerts</div></div>
    <div class="card-body">
      ${S.interactions.map(i=>`<div class="interaction-item ${i.sev}" style="margin-bottom:8px">
        <div style="display:flex;gap:7px;align-items:center;margin-bottom:3px"><span class="interaction-badge ${i.sev}">${i.sev.toUpperCase()}</span><strong style="font-size:12.5px">${i.matchedDrugs.join(' + ')}</strong></div>
        <div style="font-size:12px;color:var(--ink2)">${esc(i.desc)}</div>
        <div style="font-size:11.5px;color:var(--ink3);margin-top:3px;font-style:italic">→ ${esc(i.resolution)}</div>
      </div>`).join('')}
    </div></div>` : ''}

    ${S.labAlerts.length ? `<div class="card"><div class="card-head"><div class="card-title">06 · Abnormal Lab Results</div></div>
    <div class="card-body">
      <div style="display:grid;grid-template-columns:repeat(4,1fr);gap:8px">
        ${S.labAlerts.map(a=>`<div style="padding:10px;border-radius:var(--r);background:${a.status==='critical'?'var(--danger-t)':a.status==='abnormal-high'?'var(--warn-t)':'var(--info-t)'};border:1px solid ${a.status==='critical'?'rgba(192,57,43,.3)':a.status==='abnormal-high'?'rgba(184,106,0,.3)':'rgba(26,92,158,.3)'}">
          <div style="font-size:10px;font-weight:600;color:var(--ink3);text-transform:uppercase">${esc(a.name)}</div>
          <div style="font-family:var(--font-mono);font-size:16px;font-weight:700;color:${a.status==='critical'?'var(--danger)':a.status==='abnormal-high'?'var(--warn)':'var(--info)'}">${esc(a.value)}</div>
          <div style="font-size:10px;color:var(--ink4)">${esc(a.unit)} · ref ${a.ref[0]}–${a.ref[1]}</div>
        </div>`).join('')}
      </div>
    </div></div>` : ''}

    <div class="card"><div class="card-head"><div class="card-title">07 · Next Steps</div><div class="card-sub">Priority ordered</div></div>
    <div class="card-body">${nextStepsHtml||'<div class="empty-state">Complete intake to generate next steps.</div>'}</div></div>`;
}

// ══════════════════════════════════════════════════════════════
// LIVE PANEL UPDATER
// ══════════════════════════════════════════════════════════════

function updateLivePanel() {
  // Systems
  const sysEl = document.getElementById('live-systems');
  const activeSysList = Object.entries(S.activeSystems);
  if (activeSysList.length) {
    sysEl.innerHTML = activeSysList.map(([id, d]) => {
      const sys = SYSTEMS[id];
      return `<div style="display:flex;align-items:center;gap:7px;padding:4px 0;border-bottom:1px solid var(--border)">
        <span style="width:8px;height:8px;border-radius:50%;background:${sys.color};flex-shrink:0"></span>
        <span style="font-size:12px;color:var(--ink2)">${esc(sys.name)}</span>
        <span style="font-family:var(--font-mono);font-size:9.5px;color:var(--ink4);margin-left:auto">${d.score}</span>
      </div>`;
    }).join('');
  } else {
    sysEl.innerHTML = '<div style="color:var(--ink4);font-size:11.5px">None activated</div>';
  }

  // Red flags
  const rfEl = document.getElementById('live-flags');
  if (S.redFlags.length) {
    rfEl.innerHTML = S.redFlags.map(rf => `
      <div class="live-rf">
        <span class="live-rf-icon">⚑</span>
        <span>${esc(rf.msg)}</span>
      </div>`).join('');
  } else {
    rfEl.innerHTML = '<div style="color:var(--ok);font-size:11.5px">✓ No flags detected</div>';
  }

  // Differential
  const diffEl = document.getElementById('live-diff');
  const allDiff = [...S.differential.t3, ...S.differential.t1, ...S.differential.t2];
  if (allDiff.length) {
    const maxScore = Math.max(...allDiff.map(d => d.score||0), 1);
    diffEl.innerHTML = allDiff.slice(0,5).map(cond => {
      const tier = cond.tier === 't3' ? 'danger' : cond.tier === 't2' ? 'info' : 'ok';
      const color = cond.tier === 't3' ? 'var(--danger)' : cond.tier === 't2' ? 'var(--info)' : 'var(--ok)';
      const pct = Math.round(((cond.score||0)/maxScore)*100);
      const evLabel = pct >= 70 ? 'Strong evidence' : pct >= 35 ? 'Moderate evidence' : 'Weak evidence';
      const disp = getDisposition(cond.id);
      return `<div class="live-diff-row">
        <div style="display:flex;align-items:center;gap:5px;flex-wrap:wrap">
          <div class="live-diff-name">${esc(cond.name)}</div>
          <span class="badge badge-${tier}" style="font-size:7.5px">T${cond.tier.slice(1)}</span>
          ${disp ? `<span style="font-size:8.5px;font-weight:700;padding:1px 5px;border-radius:2px;${disp.level==='emergency'?'color:var(--danger);background:var(--danger-t)':disp.level==='admit'?'color:var(--warn);background:rgba(184,106,0,.1)':disp.level==='refer'?'color:var(--info);background:var(--info-t)':'color:var(--ok);background:var(--ok-t)'}">${esc(disp.tag)}</span>` : ''}
        </div>
        <div style="display:flex;align-items:center;gap:6px;margin-top:3px">
          <div class="live-diff-bar" style="flex:1"><div class="live-diff-fill" style="width:${pct}%;background:${color}"></div></div>
          <span style="font-size:9px;color:var(--ink4);white-space:nowrap">${esc(evLabel)}</span>
        </div>
      </div>`;
    }).join('');
  } else {
    diffEl.innerHTML = '<div style="color:var(--ink4);font-size:11.5px">Awaiting analysis</div>';
  }

  // Immediate action
  const actionEl = document.getElementById('live-action');
  const urgent = S.nextSteps.find(s => s.urgency === 'urgent');
  if (urgent) {
    actionEl.innerHTML = `<div style="background:var(--danger-t);border:1px solid rgba(192,57,43,.25);border-radius:var(--r);padding:9px 12px;font-size:12px;color:var(--danger)">${urgent.icon} ${esc(urgent.action)}</div>`;
  } else if (S.nextSteps.length) {
    actionEl.innerHTML = `<div style="font-size:12px;color:var(--ink2);padding:6px 0">${S.nextSteps[0].icon} ${esc(S.nextSteps[0].action)}</div>`;
  } else {
    actionEl.innerHTML = '<div style="color:var(--ink4);font-size:11.5px">—</div>';
  }

  // Confidence
  S.certainty = calcCertainty(S.gaps, S.scored, S.redFlags, S.labs);
  const confBar = document.getElementById('conf-bar');
  const confPct = document.getElementById('conf-pct');
  const confNote = document.getElementById('conf-note');
  if (confBar) confBar.style.width = S.certainty + '%';
  if (confPct) confPct.textContent = S.certainty + '%';
  if (confNote) {
    confNote.textContent = S.certainty < 40 ? 'Insufficient data' :
      S.certainty < 60 ? 'Low-moderate confidence' :
      S.redFlags.length ? 'Emergency conditions must be excluded' :
      'Reasonable diagnostic direction';
  }

  // Follow-up questions (condition-specific)
  if (document.getElementById('live-followup')) renderFollowUpPanel();

  // Completeness stats
  const totalFilled = S.gaps.filter(g => g.value).length;
  const statHistory = document.getElementById('stat-history');
  const statExam = document.getElementById('stat-exam');
  if (statHistory) statHistory.textContent = `${totalFilled}/${S.gaps.length} fields`;
  const examFilled = Object.values(S.examFindings).reduce((a,sys) => a + Object.values(sys).filter(v=>v).length, 0);
  const examTotal = Object.keys(S.activeSystems).reduce((a,id) => a + Object.values(SYSTEMS[id].exam_fields||{}).reduce((b,arr)=>b+arr.length,0), 0);
  if (statExam) statExam.textContent = examTotal > 0 ? `${examFilled}/${examTotal} fields` : '—';
  if (document.getElementById('stat-drugs')) document.getElementById('stat-drugs').textContent = S.drugs.length + ' added';
}

// ══════════════════════════════════════════════════════════════
// STEP NAVIGATION
// ══════════════════════════════════════════════════════════════

function goStep(n) {
  if (!S.unlockedSteps.has(n)) { notify('Complete the current step first', 'warn'); return; }
  S.step = n;
  document.querySelectorAll('.step-panel').forEach(p => p.classList.remove('active'));
  document.querySelectorAll('.step-item').forEach((item, i) => {
    item.classList.remove('active');
    if (S.unlockedSteps.has(i+1)) item.classList.remove('locked');
    else item.classList.add('locked');
    if (S.unlockedSteps.has(i+1) && i+1 !== n) item.classList.add('done');
  });
  const panel = document.getElementById(`step-${n}`);
  const nav = document.getElementById(`nav-${n}`);
  if (panel) panel.classList.add('active');
  if (nav) { nav.classList.add('active'); nav.classList.remove('done','locked'); }
  updateProgressDots();
  // Step 8: lazy-init calculators and ICD
  if (n === 8) {
    setTimeout(() => {
      const scoresEl = document.getElementById('calc-scores-content');
      if (scoresEl && !scoresEl.children.length) renderCalculators();
      renderICDSuggested();
    }, 100);
  }
}

function unlockStep(n) {
  S.unlockedSteps.add(n);
  const navEl = document.getElementById(`nav-${n}`);
  if (navEl) navEl.classList.remove('locked');
}

function updateBadge(step, text) {
  const el = document.getElementById(`badge-${step}`);
  if (!el) return;
  if (text) { el.textContent = text; el.style.display='inline-block'; }
  else el.style.display='none';
}

function updateProgressDots() {
  const el = document.getElementById('progress-dots');
  if (!el) return;
  el.innerHTML = [1,2,3,4,5,6,7,8].map(i => {
    const cls = i === S.step ? 'active' : S.unlockedSteps.has(i) ? 'done' : '';
    return `<div class="dot ${cls}"></div>`;
  }).join('');
}

function updateHeader() {
  const age = document.getElementById('pt-age').value;
  const gender = document.getElementById('pt-gender').value;
  const el = document.getElementById('hdr-age-gender');
  if (el) el.textContent = `${age||'?'}y ${gender==='F'?'Female':gender==='M'?'Male':gender||'—'}`;
  S.patient.age = parseInt(age) || null;
  S.patient.gender = gender;
  S.patient.comorbid = document.getElementById('pt-comorbid').value;
  /* updateLivePanel() */
}

// ══════════════════════════════════════════════════════════════
// MAIN PROCESSING PIPELINE
// ══════════════════════════════════════════════════════════════

function _base_processIntake() {
  try {
  const text = (S.rawInput || '').trim();
  if (!text || text.length < 5) { notify('Please enter a complaint (minimum 5 characters).', 'warn'); return; }

  S.rawInput = text;
  /* S.patient.age already set via React */
  /* S.patient.gender already set via React */
  /* S.patient.comorbid already set via React */

  // Stage 1: Normalize
  const { corpus, normalizations } = normalizeInput(text);
  S.corpus = corpus;
  S.normalizations = normalizations;

  // Stage 2: Activate systems
  S.activeSystems = activateSystems(corpus);

  // Stage 3: Red flags
  S.redFlags = detectRedFlags(corpus);

  // Stage 4: Score conditions
  S.scored = scoreConditions(corpus, S.patient);

  // Stage 5: Build differential
  S.differential = buildDifferential(S.scored, S.redFlags);

  // Stage 6: Build gaps
  S.gaps = buildGapsForSystems(S.activeSystems);
  S.examFindings = {};
  S.activeExamFindings = {};
  Object.keys(S.activeSystems).forEach(id => { S.examFindings[id] = {}; S.activeExamFindings[id] = []; });

  // Stage 7: Next steps
  S.nextSteps = buildNextSteps(S.differential, S.redFlags, S.labs);

  // Unlock all steps
  [2,3,4,5,6,7,8].forEach(unlockStep);

  // Render
  /* renderNormalizerOutput() */
  /* renderMissingDataPanel() */
  /* renderExamPanel() */
  updateBadge(2, S.gaps.filter(g=>g.critical).length > 0 ? S.gaps.filter(g=>g.critical).length+'!' : null);
  updateBadge(3, Object.keys(S.activeSystems).length > 0 ? Object.keys(S.activeSystems).length : null);
  /* updateLivePanel() */

  document.getElementById('normalizer-output').style.display = 'block';
  notify(
    `✓ Analysis complete: ${Object.keys(S.activeSystems).length} systems, ${S.redFlags.length} red flags, ${S.scored.length} conditions scored`,
    S.redFlags.some(r=>r.sev===3) ? 'danger' : S.redFlags.length ? 'warn' : 'ok'
  );
  } catch(err) {
    console.error('[processIntake] Pipeline error:', err);
    notify('Processing error: ' + err.message, 'warn');
  }
}

// ══════════════════════════════════════════════════════════════
// INTERACTION HANDLERS
// ══════════════════════════════════════════════════════════════

function fillGap(key, value) {
  const gap = S.gaps.find(g => g.key === key);
  if (gap) {
    gap.value = value;
    /* renderMissingDataPanel() */

    // ── CRITICAL FIX: Re-build corpus including all filled gap values ──────────
    // Gap text contains medically significant terms — must be folded into scoring
    rebuildCorpusAndRescore();

    /* updateLivePanel() */
    updateBadge(2, S.gaps.filter(g=>g.critical&&!g.value).length > 0 ? S.gaps.filter(g=>g.critical&&!g.value).length+'!' : null);
  }
}

/**
 * Rebuilds the scoring corpus from the original intake text PLUS all filled
 * history gaps and structured symptoms, then re-runs the full scoring pipeline.
 * This ensures gap answers (e.g. "productive cough 3 weeks") influence the differential.
 */
function rebuildCorpusAndRescore() {
  if (!S.rawInput) return;
  // Gather all additional text
  const gapText = (S.gaps || []).filter(g => g.value).map(g => g.value).join(' ');
  const structuredText = (S.structuredSymptoms || []).join(' ');
  const combined = [S.rawInput, gapText, structuredText, S.patient.comorbid || ''].join(' ').trim();
  const { corpus } = normalizeInput(combined);
  S.corpus = corpus;
  // Re-activate systems in case gap text adds new ones
  S.activeSystems = activateSystems(corpus);
  // Re-score all conditions
  S.scored = kbeScoreAll ? kbeScoreAll(corpus, S.patient, S.examFindings, S.labs, S.gaps) : scoreConditions(corpus, S.patient);
  S.redFlags = detectRedFlags(corpus);
  S.differential = (typeof kbeBuildDifferential === 'function') ? kbeBuildDifferential(S.scored, S.redFlags) : buildDifferential(S.scored, S.redFlags);
  S.nextSteps = (typeof kbeBuildNextSteps === 'function') ? kbeBuildNextSteps(S.differential, S.redFlags, S.scored, S.labs, S.patient, corpus) : buildNextSteps(S.differential, S.redFlags, S.labs);
  if (typeof kbeInterpretLabs === 'function') S.kbeLabAlerts = kbeInterpretLabs(S.labs).alerts;
}

function clearGap(key) {
  const gap = S.gaps.find(g => g.key === key);
  if (gap) { gap.value = ''; /* renderMissingDataPanel() */ rebuildCorpusAndRescore(); /* updateLivePanel() */ }
}

function _base_fillExam(sysId, key, value) {
  if (!S.examFindings[sysId]) S.examFindings[sysId] = {};
  S.examFindings[sysId][key] = value;
  const examFilled = Object.values(S.examFindings).reduce((a,sys) => a + Object.values(sys).filter(v=>v).length, 0);
  /* updateLivePanel() */
}

function toggleExam(sysId) {
  const body = document.getElementById(`exam-body-${sysId}`);
  const toggle = document.getElementById(`exam-toggle-${sysId}`);
  const head = body.previousElementSibling;
  if (body) {
    body.classList.toggle('open');
    head.classList.toggle('open');
    if (toggle) toggle.textContent = body.classList.contains('open') ? '▲' : '▼';
  }
}

function addDrug() {
  const name = (document.getElementById('drug-name').value || '').trim();
  const dose = (document.getElementById('drug-dose').value || '').trim();
  const dur = (document.getElementById('drug-dur').value || '').trim();
  if (!name) { notify('Please enter a drug name', 'warn'); return; }
  S.drugs.push({ name, dose, duration: dur });
  document.getElementById('drug-name').value = '';
  document.getElementById('drug-dose').value = '';
  document.getElementById('drug-dur').value = '';
  S.interactions = checkInteractions(S.drugs);
  renderDrugList();
  renderInteractions();
  if (document.getElementById('stat-drugs')) document.getElementById('stat-drugs').textContent = S.drugs.length + ' added';
  notify(`${name} added. ${S.interactions.length} interaction(s) found.`, S.interactions.filter(i=>i.sev==='high').length ? 'danger' : 'ok');
}

function removeDrug(index) {
  S.drugs.splice(index, 1);
  S.interactions = checkInteractions(S.drugs);
  renderDrugList();
  renderInteractions();
  if (document.getElementById('stat-drugs')) document.getElementById('stat-drugs').textContent = S.drugs.length + ' added';
}

function _base_updateLab(key, value, sectionId) {
  S.labs[key] = value;
  // Re-render just this lab item's styling
  const allDefs = Object.values(LAB_DEFS).flat();
  const def = allDefs.find(d => d.key === key);
  if (def) {
    const el = document.getElementById(`labitem-${key}`);
    if (el) {
      const status = value ? getLabStatus(value, def) : '';
      el.className = `lab-item ${status}`;
      const input = el.querySelector('.lab-input');
      if (input) {
        input.style.color = status === 'abnormal-high' ? 'var(--danger)' : status === 'abnormal-low' ? 'var(--info)' : status === 'critical' ? 'var(--danger)' : '';
        input.style.fontWeight = status === 'critical' ? '700' : '';
      }
    }
  }
  renderLabAlerts();
  // Rebuild next steps if Troponin/BNP entered
  if (['trop','bnp','tsh','hba1c','hb'].includes(key)) {
    S.nextSteps = buildNextSteps(S.differential, S.redFlags, S.labs);
    /* updateLivePanel() */
  }
}

function toggleTier(head) {
  const body = head.nextElementSibling;
  const toggle = head.querySelector('.diff-tier-toggle');
  if (body) { body.classList.toggle('open'); if (toggle) toggle.classList.toggle('open'); }
}

function clearIntake() {
  document.getElementById('intake-text').value = '';
  document.getElementById('normalizer-output').style.display = 'none';
}

// ══════════════════════════════════════════════════════════════
// DEMO DATA
// ══════════════════════════════════════════════════════════════

const DEMOS = {
  breathing: {
    age: 30, gender: 'F', comorbid: '',
    text: 'brething tightnes with chest heavines since morning. SOB on exertion. Wheeze noted. No fever. No cough. No ankle swelling. No prior heart problems.',
  },
  pcos: {
    age: 26, gender: 'F', comorbid: '',
    text: 'period sheriyalla for 8 months, weight koodi, facial hair noted, acne on face. Family history of diabetes. Trying to conceive.',
  },
  acs: {
    age: 58, gender: 'M', comorbid: 'HTN, DM',
    text: 'CP with sweating, radiation to jaw, SOB. Onset 1 hour ago. Smokes 20/day. h/o MI 3 years ago. On aspirin and atorvastatin.',
  },
};

function loadDemo(key) {
  const d = DEMOS[key];
  if (!d) return;
  document.getElementById('pt-age').value = d.age;
  document.getElementById('pt-gender').value = d.gender;
  document.getElementById('pt-comorbid').value = d.comorbid;
  document.getElementById('intake-text').value = d.text;
  updateHeader();
  // For ACS demo, auto-add drugs
  if (key === 'acs') {
    S.drugs = [{name:'Aspirin',dose:'75mg OD',duration:'3 years'},{name:'Atorvastatin',dose:'40mg OD',duration:'3 years'}];
  }
  notify(`Demo loaded: "${d.text.slice(0,40)}…"`, 'ok');
}

// ══════════════════════════════════════════════════════════════
// MODULE K — CLINICAL KNOWLEDGE BASE (Single Source of Truth)
// Source hierarchy: L1 Guidelines > L2 References > L3 Textbooks > L4 Drug refs
// Fields: condition, system, symptoms, red_flags, dx_criteria, tx_lines,
//         drugs (dose/route/freq/duration), contraindications, interactions,
//         monitoring, referral, india_context
// ══════════════════════════════════════════════════════════════

const CLINICAL_KB = {

  // ────────────────────────────────────────────────────────────
  // ASTHMA
  // Sources: GINA 2024 (L1) · BTS/SIGN 2023 (L1) · Harrison's 21e (L3) · BNF 86 (L4)
  // ────────────────────────────────────────────────────────────
  asthma: {
    id: 'asthma',
    name: 'Asthma',
    icd10: 'J45',
    systems: ['rs'],
    gl_sources: [
      { name:'GINA 2024',          level:1, type:'guideline' },
      { name:'BTS/SIGN Asthma 2023',level:1, type:'guideline' },
      { name:'Harrison\'s 21e',    level:3, type:'textbook'  },
      { name:'BNF 86',             level:4, type:'drug_ref'  },
    ],
    key_symptoms: ['episodic wheeze','dyspnoea','chest tightness','nocturnal cough','exertional dyspnoea'],
    red_flags: [
      'Silent chest on auscultation (life-threatening)',
      'SpO2 <92% on air',
      'PEFR <33% predicted (life-threatening)',
      'Inability to complete sentences',
      'Cyanosis',
      'Exhaustion, altered consciousness',
      'Tachycardia >120/min, bradycardia (pre-arrest)',
    ],
    dx_criteria: {
      name: 'GINA Diagnostic Criteria 2024',
      criteria: [
        'Variable respiratory symptoms: wheeze, SOB, chest tightness, cough',
        'Expiratory airflow limitation confirmed on spirometry',
        'FEV1/FVC ratio < LLN (lower limit of normal)',
        'Reversibility: FEV1 increase ≥12% AND ≥200mL after 400mcg salbutamol',
        'OR: diurnal PEFR variability >10% over 2 weeks',
        'OR: significant FEV1 increase after 4 weeks ICS trial',
      ],
    },
    severity_classification: {
      mild_intermittent:   'Symptoms ≤2 days/week, night ≤2/month, FEV1 ≥80%',
      mild_persistent:     'Symptoms >2 days/week, night 3-4/month, FEV1 ≥80%',
      moderate_persistent: 'Daily symptoms, night >1/week, FEV1 60-80%',
      severe_persistent:   'Continuous symptoms, frequent nights, FEV1 <60%',
    },
    treatment: {
      acute_mild_moderate: {
        label: 'Acute Mild–Moderate Attack',
        drugs: [
          { generic:'Salbutamol',          brand_india:'Asthalin, Ventolin',   dose:'2.5mg',      route:'Nebulised',      freq:'Every 20 min × 3 then 4-hourly', duration:'Until improvement', class:'SABA', risk:'low',    notes:'First-line bronchodilator. MDI 4-10 puffs via spacer equally effective.', india:'Widely available; generic MDI preferred — cost-effective', monitoring:'PEFR before and after each dose', gl:'GINA 2024 Step 1' },
          { generic:'Ipratropium bromide', brand_india:'Ipravent, Atrovent',   dose:'500mcg',     route:'Nebulised',      freq:'Every 20 min × 3 (add-on)',      duration:'First 1 hour',      class:'SAMA', risk:'low',    notes:'Add-on to salbutamol in moderate-severe. Greater bronchodilation than salbutamol alone.', india:'Available as nebuliser solution', monitoring:'Heart rate', gl:'BTS/SIGN 2023 §5' },
          { generic:'Prednisolone',        brand_india:'Wysolone, Omnacortil',  dose:'40-50mg',    route:'Oral',           freq:'Once daily',                     duration:'5-7 days',          class:'Systemic corticosteroid', risk:'moderate', notes:'Start within 1h of acute attack. No need to taper if course ≤2 weeks.', india:'First-line oral steroid in India — cost-effective', monitoring:'Blood glucose (esp. diabetics)', gl:'BTS/SIGN 2023 §6', contra:'Active peptic ulcer (relative), uncontrolled DM (monitor)' },
        ],
      },
      acute_severe: {
        label: 'Acute Severe / Life-Threatening',
        drugs: [
          { generic:'Salbutamol',          brand_india:'Asthalin',   dose:'5mg',    route:'Continuous nebulisation', freq:'Continuous (driven by O2)',   duration:'Until stabilised', class:'SABA',   risk:'low',    notes:'Continuous nebulisation in life-threatening. O2-driven nebuliser maintains SpO2 >94%.', monitoring:'ECG (hypokalaemia at high doses)', gl:'BTS/SIGN 2023 §7' },
          { generic:'Hydrocortisone',      brand_india:'Efcorlin',   dose:'200mg',  route:'IV',        freq:'6-hourly',         duration:'Until oral possible', class:'IV corticosteroid', risk:'moderate', notes:'Use IV when patient cannot swallow. Switch to oral prednisolone as soon as able.', monitoring:'Glucose, BP, K+', gl:'BTS/SIGN §7' },
          { generic:'Magnesium sulphate',  brand_india:'MgSO4 injection', dose:'1.2-2g', route:'IV',  freq:'Once over 20 min', duration:'Single dose',         class:'Bronchodilator', risk:'moderate', notes:'Single dose IV MgSO4 for acute severe asthma not responding to first-line. GINA Grade A.', monitoring:'BP, deep tendon reflexes (toxicity if reflexes lost)', gl:'GINA 2024 Track 3; NNT = 8 for hospital admission', contra:'Renal impairment (reduce dose)' },
          { generic:'Aminophylline',       brand_india:'Phyllocontin', dose:'5mg/kg loading then 500mcg/kg/h', route:'IV infusion', freq:'Continuous', duration:'Until nebulised bronchodilators work', class:'Xanthine', risk:'high', notes:'Last resort — narrow therapeutic index. NOT recommended routinely (BTS). Use only if no response to above.', monitoring:'Theophylline levels (target 10-20mg/L), ECG, nausea/vomiting', gl:'BTS reserve', contra:'Cardiac arrhythmias, seizure disorder, concurrent macrolides/fluoroquinolones (interactions)' },
        ],
      },
      maintenance_step2: {
        label: 'Step 2 — Low-Dose ICS (GINA)',
        drugs: [
          { generic:'Beclomethasone dipropionate', brand_india:'Beclate, Beclogen', dose:'200mcg/day (2 puffs 100mcg BD)', route:'Inhaled (MDI)',  freq:'BD', duration:'Minimum 3 months before stepping up', class:'ICS', risk:'low', notes:'First-line preventive therapy. Low-dose ICS reduces hospitalisation by 80%. Always prescribe with spacer.', india:'Beclate 100mcg MDI — widely available, cost-effective first-line ICS in India', monitoring:'Height in children (annual), oropharyngeal candidiasis (rinse mouth after)', gl:'GINA 2024 Step 2 preferred controller', contra:'Active pulmonary TB (relative — continue if asthma requires it, seek specialist advice)' },
        ],
      },
      maintenance_step3: {
        label: 'Step 3 — Low ICS + LABA',
        drugs: [
          { generic:'Formoterol + Budesonide', brand_india:'Symbicort, Foracort', dose:'200/6mcg 1 puff BD + as-needed (MART regime)', route:'Inhaled (pMDI/DPI)', freq:'BD + PRN', duration:'Review at 3 months', class:'ICS/LABA', risk:'low', notes:'GINA 2024 preferred Step 3-5 therapy. MART (Maintenance And Reliever Therapy) regime — single inhaler for both maintenance and rescue. Reduces severe exacerbations significantly.', india:'Foracort (Cipla) widely used in India — DPI preferred in humid climate', monitoring:'Annual spirometry, inhaler technique', gl:'GINA 2024 Track 1 preferred, Step 3' },
          { generic:'Salbutamol + Fluticasone', brand_india:'Seroflo, Combihale-FF', dose:'Fluticasone 250mcg + Salmeterol 25mcg, 2 puffs BD', route:'Inhaled MDI', freq:'BD', duration:'As above', class:'ICS/LABA', risk:'low', notes:'Alternative Step 3. Salmeterol NOT appropriate for MART (not fast onset). Use separate salbutamol MDI for rescue.', india:'Seroflo 250 (Sun Pharma) — common in India', monitoring:'Inhaler technique review at each visit', gl:'GINA 2024 Step 3 alternative' },
        ],
      },
      maintenance_step4_5: {
        label: 'Step 4-5 — Add-on Therapy',
        drugs: [
          { generic:'Tiotropium (soft mist)', brand_india:'Spiriva Respimat',  dose:'5mcg',    route:'Inhaled', freq:'Once daily', duration:'Add-on to ICS/LABA', class:'LAMA', risk:'low',     notes:'Step 4-5 add-on. GINA 2024 Grade A. Reduces exacerbations when added to ICS/LABA. Off-label in India for asthma but GINA-recommended.', monitoring:'Urinary retention (prostatic hyperplasia risk)', gl:'GINA 2024 Step 4 add-on', contra:'Narrow-angle glaucoma, severe renal impairment' },
          { generic:'Prednisolone (maintenance)', brand_india:'Wysolone',      dose:'5-10mg',  route:'Oral', freq:'Once daily (morning)', duration:'Minimum required', class:'Oral corticosteroid', risk:'high', notes:'Step 5 last resort. Use lowest effective dose. Every-other-day dosing reduces adrenal suppression.', monitoring:'BMD (bisphosphonate prophylaxis if >3 months), BP, glucose, HPA axis', gl:'GINA 2024 Step 5 — consider biologic first', contra:'Uncontrolled diabetes, active infection, osteoporosis (prescribe with caution + bone protection)' },
          { generic:'Omalizumab',              brand_india:'Xolair',           dose:'150-375mg', route:'SC', freq:'Every 2-4 weeks (dose by weight/IgE)', duration:'Minimum 16 weeks trial', class:'Anti-IgE biologic', risk:'high', notes:'GINA 2024 Step 5 preferred add-on for allergic severe asthma. IgE 30-1500 IU/mL. Expensive (₹15,000-50,000/dose in India).', monitoring:'Anaphylaxis (observe 30 min post-injection)', gl:'GINA 2024 Step 5', contra:'Non-allergic asthma, IgE outside range' },
        ],
      },
    },
    contraindications_class: {
      NSAIDs_aspirin: 'Aspirin-exacerbated respiratory disease (AERD) — 10-20% of asthmatics. Absolute in known AERD.',
      beta_blockers: 'Non-selective beta-blockers (propranolol, timolol eyedrops) — can precipitate fatal bronchospasm. Use cardioselective with caution.',
      SABA_monotherapy: 'SABA alone (no ICS) — GINA 2024 no longer recommends SABA monotherapy at any step. Associated with ↑ mortality.',
    },
    monitoring: [
      { parameter:'PEFR',                 frequency:'Before and after bronchodilator at every acute visit',  target:'≥75% personal best',    action:'If <50% after treatment: admit' },
      { parameter:'SpO2',                 frequency:'Continuous in acute setting',                           target:'94-98%',                 action:'<92%: give O2, consider ICU' },
      { parameter:'Spirometry (FEV1/FVC)',frequency:'Annual (stable) or 3-monthly (step-up/down)',           target:'FEV1 ≥80% predicted',    action:'<60%: specialist referral' },
      { parameter:'Inhaler technique',    frequency:'Every clinic visit',                                    target:'Correct use',            action:'Re-educate; switch device type if needed' },
      { parameter:'Asthma Control Test',  frequency:'Every 4-6 weeks',                                       target:'ACT score ≥20',          action:'Score <16: step up therapy' },
      { parameter:'Growth (children)',    frequency:'Annually',                                               target:'Normal growth velocity',  action:'If stunted: switch to low-dose ICS, refer paediatrics' },
    ],
    referral: [
      'Life-threatening attack: SpO2 <92%, silent chest, PEFR <33% — ICU immediately',
      'Severe attack not responding after 15-30 min: inpatient respiratory medicine',
      'Three or more ED visits in 12 months — specialist review',
      'Diagnosis uncertain — spirometry with reversibility, consider ENT/gastro evaluation',
      'Step 4-5 therapy needed — specialist before escalating to biologics',
      'Occupational asthma suspected — occupational medicine',
    ],
    india_context: {
      availability: 'Salbutamol MDI + Beclomethasone MDI widely available at all levels of healthcare including PHC.',
      cost: 'Salbutamol 100mcg MDI ≈ ₹60-90. Beclate 100mcg MDI ≈ ₹120-160. Foracort 200/6 DPI ≈ ₹350-450.',
      prescribing_patterns: 'Oral bronchodilators (salbutamol tablets/syrup) remain common in rural India — GINA discourages these. Nebulisers common in PHC due to poor inhaler technique awareness.',
      icmr_note: 'ICMR National Programme for Prevention and Control of Asthma (NPPCA) recommends ICS-based therapy. Spacer devices distributed via NHM in some states.',
      climate: 'In humid climates (Kerala, coastal India): DPI may be less reliable — pMDI with spacer preferred.',
      common_triggers_india: 'Incense/agarbatti smoke, cooking smoke (biomass fuel), dust mites, seasonal pollens (parthenium), diwali pollution spikes.',
    },
  },

  // ────────────────────────────────────────────────────────────
  // HYPERTENSION
  // Sources: NICE NG136 2023 (L1) · AHA/ACC 2017 (L1) · WHO 2023 HTN (L1) · BNF 86 (L4) · ICMR-INDIAB (L1)
  // ────────────────────────────────────────────────────────────
  hypertension: {
    id: 'hypertension',
    name: 'Hypertension',
    icd10: 'I10',
    systems: ['cv'],
    gl_sources: [
      { name:'NICE NG136 2023',   level:1, type:'guideline' },
      { name:'AHA/ACC 2017',      level:1, type:'guideline' },
      { name:'WHO 2023 HTN',      level:1, type:'guideline' },
      { name:'ICMR-INDIAB',       level:1, type:'guideline' },
      { name:'BNF 86',            level:4, type:'drug_ref'  },
    ],
    key_symptoms: ['Usually asymptomatic', 'Headache (occipital, morning)', 'Dizziness', 'Epistaxis', 'Visual disturbance', 'Chest pain (hypertensive emergency)'],
    red_flags: [
      'BP ≥180/120 mmHg — hypertensive crisis',
      'Papilloedema or visual change — hypertensive emergency',
      'Chest pain or troponin rise — hypertensive emergency with ACS',
      'Neurological deficit — hypertensive stroke / hypertensive encephalopathy',
      'Pulmonary oedema — hypertensive emergency with LVF',
      'AKI on bloods (creatinine rise) — hypertensive nephropathy',
      'Pregnancy + hypertension — pre-eclampsia until excluded',
    ],
    dx_criteria: {
      name: 'NICE NG136 / WHO 2023 Classification',
      criteria: [
        'Stage 1 HTN: Clinic BP ≥140/90 mmHg, ABPM/HBPM ≥135/85 mmHg',
        'Stage 2 HTN: Clinic BP ≥160/100 mmHg, ABPM/HBPM ≥150/95 mmHg',
        'Severe HTN: Clinic BP ≥180/110 mmHg — same-day specialist assessment',
        'Diagnosis: Minimum 2 readings per visit, 2 separate visits (unless severe)',
        'ABPM preferred for confirmation (NICE NG136 Grade A)',
        'Isolated systolic HTN: SBP ≥140, DBP <90 — common in elderly',
      ],
    },
    secondary_causes: ['Renal artery stenosis','Primary hyperaldosteronism (Conn\'s)','Phaeochromocytoma','Cushing\'s syndrome','Obstructive sleep apnoea','Coarctation of aorta','Drug-induced (NSAIDs, OCP, steroids, decongestants)'],
    treatment: {
      lifestyle: {
        label: 'Step 0 — Lifestyle Intervention (All Stages)',
        drugs: [
          { generic:'Lifestyle modification (non-pharmacological)', dose:'DASH diet: reduce Na+ <2g/day, K+ ≥4.7g/day', route:'Non-drug', freq:'Daily', duration:'Ongoing (concurrent with drugs)', class:'Lifestyle', risk:'low', notes:'DASH diet reduces SBP by 8-14 mmHg. Salt restriction 6g NaCl/day → SBP −4 to −6 mmHg. Aerobic exercise 30 min × 5/week → SBP −5 mmHg. Weight loss 10kg → SBP −6 mmHg. Alcohol <14 units/week.', india:'Low-salt diets difficult in India (pickle, pappad, street food). Salt substitute (K+ salt) may help — avoid in CKD/ACEi.', monitoring:'BP fortnightly for 3 months before pharmacotherapy in Stage 1 low-risk', gl:'NICE NG136 Step 1; AHA/ACC Grade A' },
        ],
      },
      step1: {
        label: 'Step 1 — First-Line Monotherapy',
        drugs: [
          { generic:'Amlodipine',      brand_india:'Amlodac, Stamlo, Amlovas', dose:'5mg (titrate to 10mg)', route:'Oral', freq:'Once daily', duration:'Long-term', class:'CCB (dihydropyridine)', risk:'low',    notes:'Preferred first-line in most patients (NICE NG136 Grade A). Particularly effective in Afro-Caribbean, elderly, and South Asian patients. Does not affect glucose/lipids.', monitoring:'Ankle oedema (dose-dependent), BP and HR', gl:'NICE NG136 Step 1; preferred for age ≥55 or Afro-Caribbean', contra:'Aortic stenosis (relative), cardiogenic shock, unstable angina' },
          { generic:'Ramipril',        brand_india:'Cardace, Hopace, Ramace',  dose:'2.5mg start, titrate to 10mg', route:'Oral', freq:'Once daily', duration:'Long-term', class:'ACE inhibitor', risk:'moderate', notes:'Preferred in: DM with proteinuria, CKD, post-MI, LVF. NOT first-line in Afro-Caribbean (less effective). ONTARGET trial — superior renal protection in DM.', monitoring:'K+ and creatinine at 1-2 weeks post-initiation then 3-monthly. Cough (10-15%)', gl:'NICE NG136 Step 1 (age <55, non-Afro-Caribbean); ICMR preferred in DM+HTN', contra:'Bilateral renal artery stenosis, pregnancy (Category D), history of angioedema with ACEi, K+ >5.5' },
          { generic:'Losartan',        brand_india:'Cozaar, Losar, Repace',    dose:'50mg (titrate to 100mg)', route:'Oral', freq:'Once daily', duration:'Long-term', class:'ARB', risk:'moderate', notes:'Use instead of ACEi if ACEi-cough. Equal efficacy to ramipril (RENAAL trial). Do NOT combine with ACEi (dual RAAS blockade — ONTARGET showed harm).', monitoring:'K+, creatinine, BP. Lower risk of cough vs ACEi.', gl:'NICE NG136 ARB as ACEi alternative; ICMR India', contra:'Same as ACEi. Absolutely contraindicated in pregnancy.', india:'Losartan 50mg ≈ ₹10-20/tablet. Generic widely available.' },
          { generic:'Indapamide',      brand_india:'Lorvas, Natrilix',         dose:'1.5mg (SR) or 2.5mg', route:'Oral', freq:'Once daily (morning)', duration:'Long-term', class:'Thiazide-like diuretic', risk:'low',    notes:'Preferred thiazide-like diuretic over hydrochlorothiazide (NICE NG136) — less metabolic effect. Add after CCB in Step 2. Also effective in isolated systolic HTN in elderly (HYVET trial).', monitoring:'Na+, K+, creatinine, urate, glucose (annually), postural BP in elderly', gl:'NICE NG136 Step 2 add-on; preferred over HCT', contra:'Severe renal impairment (eGFR <30), hyponatraemia, hypokalaemia, gout' },
        ],
      },
      step2: {
        label: 'Step 2 — Dual Therapy',
        drugs: [
          { generic:'Amlodipine + Ramipril', brand_india:'Amlovas-R (FDC)', dose:'As per individual doses', route:'Oral', freq:'Once daily', duration:'Long-term', class:'CCB + ACEi', risk:'moderate', notes:'NICE NG136 Step 2: CCB + ACEi (or ARB). ACCOMPLISH trial showed CCB+ACEi superior to HCTZ+ACEi for CV outcomes. FDC improves adherence in India.', monitoring:'As per individual drugs', gl:'NICE NG136 Step 2 preferred combination' },
          { generic:'Amlodipine + Indapamide', brand_india:'Combo (separate tablets)', dose:'As per individual doses', route:'Oral', freq:'Once daily', duration:'Long-term', class:'CCB + thiazide-like diuretic', risk:'low', notes:'Alternative Step 2 if ACEi/ARB not tolerated (e.g., bilateral RAS). Less evidence for renal/DM protection.', monitoring:'Electrolytes, postural BP', gl:'NICE NG136 Step 2 alternative' },
        ],
      },
      step3: {
        label: 'Step 3 — Triple Therapy (A+C+D)',
        drugs: [
          { generic:'ACEi/ARB + CCB + Thiazide-like diuretic', brand_india:'Individual generics preferred', dose:'Optimised individual doses', route:'Oral', freq:'Once daily', duration:'Long-term', class:'Triple combination', risk:'moderate', notes:'NICE NG136 Step 3 = A (ACEi/ARB) + C (CCB) + D (diuretic). If BP still uncontrolled on Step 3, consider resistant HTN workup.', monitoring:'K+, creatinine, Na+ every 3 months. BP lying and standing (postural hypotension).', gl:'NICE NG136 Step 3' },
        ],
      },
      step4_resistant: {
        label: 'Step 4 — Resistant Hypertension',
        drugs: [
          { generic:'Spironolactone',   brand_india:'Aldactone, Spiromide', dose:'25mg (titrate to 50mg)', route:'Oral', freq:'Once daily', duration:'Long-term, reassess 6-monthly', class:'MRA (potassium-sparing diuretic)', risk:'high',    notes:'PATHWAY-2 trial — spironolactone most effective 4th agent. K+ must be <4.5 and eGFR >45 before starting. Caution in CKD+ACEi (hyperkalaemia). Gynaecomastia in males.', monitoring:'K+ at 1, 4, 8 weeks then 6-monthly. Creatinine, BP.', gl:'NICE NG136 Step 4 preferred; Grade A evidence from PATHWAY-2', contra:'eGFR <30, K+ >4.5, Addison\'s disease, concomitant ACEi+ARB with CKD' },
          { generic:'Bisoprolol',        brand_india:'Concor, Corbis',       dose:'5mg (titrate to 10mg)', route:'Oral', freq:'Once daily', duration:'Long-term', class:'Cardioselective beta-blocker', risk:'moderate', notes:'Alternative 4th-line if spironolactone not tolerated. First choice if: post-MI, heart failure, atrial fibrillation, or angina coexists. Not preferred as first-line HTN monotherapy.', monitoring:'HR, BP, symptoms of bronchoconstriction', gl:'NICE NG136 Step 4 alternative', contra:'Asthma (avoid), COPD (caution), complete heart block, bradycardia <60' },
          { generic:'Doxazosin',         brand_india:'Cardura, Doxacor',     dose:'1mg (titrate to 4-8mg)', route:'Oral', freq:'Once daily (at night)', duration:'Long-term', class:'Alpha-1 blocker', risk:'moderate', notes:'4th-line option. Particularly useful in elderly males with BPH. May cause postural hypotension — start at night.', monitoring:'Postural BP, syncope risk in elderly', gl:'NICE NG136 Step 4 alternative' },
        ],
      },
      hypertensive_emergency: {
        label: 'Hypertensive Emergency (BP ≥180/120 + end-organ damage)',
        drugs: [
          { generic:'Labetalol',         brand_india:'Labetol, Trandate', dose:'20mg IV bolus, then 20-80mg IV q10min to max 300mg; or 0.5-2mg/min infusion', route:'IV', freq:'Titrated', duration:'Until oral agent', class:'Alpha+Beta blocker', risk:'high',    notes:'First-line IV for hypertensive emergency (most settings). Avoid in asthma, decompensated HF, bradycardia. AHA/ACC Grade IB.', monitoring:'BP every 5 min, HR, ECG', gl:'AHA/ACC 2017; JNC 8' },
          { generic:'Amlodipine',        brand_india:'Stamlo 5mg', dose:'5-10mg', route:'Oral (if no IV access)', freq:'Once', duration:'Transition to daily', class:'CCB', risk:'low',    notes:'Oral agent for urgent HTN (BP ≥180/110 without end-organ damage). Slower onset. Do NOT use sublingual nifedipine — causes precipitous BP drop → stroke.', monitoring:'BP every 30 min × 2h', gl:'NICE NG136; AHA/ACC', contra:'Do NOT use sublingual nifedipine — WHO contraindication' },
        ],
      },
    },
    contraindications_class: {
      dual_RAAS: 'ACEi + ARB combination: ONTARGET trial showed ↑ renal failure and hypotension — DO NOT COMBINE',
      NSAIDs: 'NSAIDs blunt antihypertensive effect by 5-6 mmHg SBP + ↑ AKI risk with ACEi/ARB (triple whammy)',
      sublingual_nifedipine: 'WHO: sublingual nifedipine is absolutely contraindicated in hypertensive emergencies — causes uncontrolled BP drop → MI/stroke',
      ACEi_pregnancy: 'ACEi and ARB: absolutely contraindicated in pregnancy (teratogenic — Category D/X). Switch to methyldopa or labetalol.',
    },
    monitoring: [
      { parameter:'Blood Pressure',       frequency:'Fortnightly until target, then 3-6 monthly', target:'<140/90 (general); <130/80 (DM/CKD/CVD risk)', action:'Not at target after 3 months at max dose: step up' },
      { parameter:'Serum K+ + Creatinine',frequency:'1-2 weeks after ACEi/ARB start or dose change, then 6-monthly', target:'K+ 3.5-5.0, Cr stable', action:'K+ >5.5: halve dose or stop ACEi/ARB. Cr ↑ >30%: investigate RAS' },
      { parameter:'Fasting lipids',        frequency:'Annually',              target:'LDL <2.6mmol/L (or <1.8 if high CV risk)', action:'Initiate statin if 10-year CVD risk >10% (QRISK3)' },
      { parameter:'HbA1c/Fasting glucose', frequency:'Annually',              target:'HbA1c <48mmol/mol (6.5%)',  action:'DM newly diagnosed: add ACEi/ARB + lifestyle' },
      { parameter:'Urine albumin:creatinine',frequency:'Annually in DM+HTN', target:'<3mg/mmol (ACR)',           action:'Microalbuminuria: intensify RAAS blockade' },
      { parameter:'ABPM',                  frequency:'At diagnosis + 1 year', target:'Daytime mean <135/85',      action:'White coat HTN: lifestyle ± annual monitoring only' },
    ],
    referral: [
      'Hypertensive emergency (BP ≥180/120 + end-organ damage) — hospital IMMEDIATELY',
      'Suspected secondary hypertension — specialist (renal, endocrine)',
      'Resistant HTN on 3+ agents — specialist hypertension clinic',
      'Hypertension in pregnancy (≥140/90) — obstetric review SAME DAY',
      'Age <30 with HTN — secondary cause workup, specialist',
      'BP >180/110 asymptomatically — same-day specialist assessment (NICE)',
    ],
    india_context: {
      availability: 'Amlodipine, ramipril, losartan, indapamide, spironolactone all on PMBJP (Jan Aushadhi) list. FDC tablets common in India.',
      cost: 'Amlodipine 5mg ≈ ₹2-5/tablet. Ramipril 5mg ≈ ₹5-15/tablet. Losartan 50mg ≈ ₹8-18/tablet (generic).',
      icmr_note: 'ICMR Hypertension Guidelines 2023: recommends ABPM for diagnosis. Targets same as NICE. Polycap (Aspirin+Statin+ACEI+BB+Thiazide) studied in India (TIPS trial) for primary prevention.',
      high_risk_states: 'Kerala, Punjab, Tamil Nadu have highest HTN prevalence in India (28-35%). Kerala-specific: high saturated fat diet (coconut oil), salt intake, sedentary lifestyle drive HTN.',
      prescribing_pattern: 'Amlodipine 5mg most commonly prescribed antihypertensive in India. Telmisartan (ARB) popular due to once-daily dosing and renal protection data.',
    },
  },

  // ────────────────────────────────────────────────────────────
  // PCOS
  // Sources: ESHRE/ASRM PCOS 2023 (L1) · Endocrine Society PCOS 2023 (L1) · ACOG 2018 (L1) · FOGSI PCOS Consensus (L1) · BNF 86 (L4)
  // ────────────────────────────────────────────────────────────
  pcos: {
    id: 'pcos',
    name: 'Polycystic Ovarian Syndrome (PCOS)',
    icd10: 'E28.2',
    systems: ['en'],
    gl_sources: [
      { name:'ESHRE/ASRM PCOS 2023',      level:1, type:'guideline' },
      { name:'Endocrine Society PCOS 2023',level:1, type:'guideline' },
      { name:'ACOG 2018 PCOS',             level:1, type:'guideline' },
      { name:'FOGSI PCOS Consensus 2021',  level:1, type:'guideline' },
      { name:'BNF 86',                     level:4, type:'drug_ref'  },
    ],
    key_symptoms: ['Menstrual irregularity (oligomenorrhoea/amenorrhoea)', 'Hirsutism', 'Acne', 'Weight gain', 'Infertility', 'Scalp hair loss (androgenic alopecia)', 'Acanthosis nigricans (insulin resistance marker)'],
    red_flags: [
      'Endometrial hyperplasia risk — if amenorrhoea >3 months without progesterone withdrawal',
      'Glucose >11 mmol/L — DKA or undiagnosed T2DM',
      'BP ≥160/100 in suspected pregnancy (pre-eclampsia risk with PCOS)',
      'Ovarian torsion (acute abdominal pain in PCOS with enlarged cysts — surgical emergency)',
      'Ovarian hyperstimulation syndrome (OHSS) during fertility treatment — severe abdominal distension, nausea, oliguria',
    ],
    dx_criteria: {
      name: 'Rotterdam Criteria 2003 (2 of 3 required) — validated by ESHRE 2023',
      criteria: [
        '1. Oligo/anovulation: cycles >35 days or <8 cycles/year',
        '2. Clinical or biochemical hyperandrogenism: hirsutism (Ferriman-Gallwey >8) OR raised free testosterone OR DHEAS',
        '3. Polycystic ovarian morphology on USS: ≥20 follicles per ovary (2-9mm) OR ovarian volume >10mL (either ovary)',
        'MUST EXCLUDE: Thyroid disease (TSH), hyperprolactinaemia (prolactin), congenital adrenal hyperplasia (17-OHP), androgen-secreting tumour',
        'ESHRE 2023: Anti-Müllerian Hormone (AMH) may replace USS in adults (>35 follicles/ovary equivalent)',
        'Note: USS not reliable in adolescents <2 years post-menarche — requires all 3 criteria',
      ],
    },
    treatment: {
      lifestyle_core: {
        label: 'Cornerstone — Lifestyle Modification (ALL patients)',
        drugs: [
          { generic:'Lifestyle modification', dose:'5-10% body weight loss', route:'Non-drug', freq:'Daily', duration:'Ongoing', class:'Lifestyle', risk:'low', notes:'ESHRE 2023 Grade A. Even 5% weight loss restores ovulation in 55-60% of obese PCOS. Low GI diet + 150 min moderate aerobic exercise/week. Reduces androgen levels, improves insulin sensitivity, restores menstrual regularity.', india:'High-carbohydrate rice-based diet in South India — specific dietary counselling needed. Yoga has Grade B evidence for PCOS in India (multiple ICMR-funded studies).', monitoring:'Weight, waist circumference, BP, fasting glucose at every visit', gl:'ESHRE/ASRM PCOS 2023 Grade A Recommendation' },
        ],
      },
      metabolic_no_fertility: {
        label: 'Metabolic Management (No Fertility Desire)',
        drugs: [
          { generic:'Metformin',          brand_india:'Glycomet, Glucophage, Obimet', dose:'500mg BD for 1 week, then 500mg TDS or 1g BD (extended release: 1500-2000mg OD)', route:'Oral', freq:'With meals (reduces GI side effects)', duration:'Long-term (minimum 6 months for effect on cycles)', class:'Biguanide (insulin sensitiser)', risk:'low',    notes:'ESHRE 2023 Grade B for anovulatory PCOS without fertility desire + insulin resistance. Reduces: androgens by 19-27%, LH, fasting insulin. Restores ovulation in 40-50% with weight loss. Extended-release (SR) formulation better tolerated.', monitoring:'LFT before start. RFT — withhold if eGFR <30. B12 annually (metformin depletes). Fasting glucose 3-monthly.', gl:'ESHRE 2023; FOGSI 2021 — first-line insulin sensitiser in India', contra:'eGFR <30, hepatic impairment, IV contrast within 48h, alcohol excess', india:'Metformin SR 500mg ≈ ₹3-8/tablet. Generic Glycomet SR widely available. FOGSI 2021 recommends as first-line in Indian women with IR markers (acanthosis, high waist, fasting insulin).' },
          { generic:'Myo-inositol',       brand_india:'Inofolic, Myonat, Ovasitol', dose:'2g + 200mcg folic acid BD (4:1 myo:d-chiro ratio)', route:'Oral (powder/sachet)', freq:'BD', duration:'3-6 months minimum', class:'Insulin sensitiser (nutritional supplement)', risk:'low', notes:'ESHRE 2023 conditionally recommends inositol as alternative to metformin. Meta-analysis: comparable to metformin in restoring ovulation, better GI tolerability. Mechanism: myo-inositol is FSH second messenger.', monitoring:'No routine monitoring required. Fasting glucose + testosterone at 3 months.', gl:'ESHRE 2023 conditional recommendation; widely used in Italy and India', india:'Popular in India as "natural alternative" to metformin. Cost ≈ ₹200-500/month. Not on essential medicines list but widely prescribed.' },
        ],
      },
      hormonal_no_fertility: {
        label: 'Hormonal Management — No Fertility Desire',
        drugs: [
          { generic:'Combined Oral Contraceptive (COCP)', brand_india:'Drospera (EE+Drospirenone), Althea (EE+Cyproterone), Ginette-35', dose:'EE 30-35mcg + progestogen (drospirenone 3mg or cyproterone 2mg preferred)', route:'Oral', freq:'Once daily, days 1-21 (or 24/4 cycle)', duration:'Use minimum required; review annually', class:'COCP', risk:'moderate', notes:'ESHRE 2023 first-line hormonal therapy for menstrual irregularity + hyperandrogenism in women NOT seeking fertility. Cyproterone-containing OCPs (e.g., Diane-35/Ginette-35) most effective for hirsutism — anti-androgen effect. Drospirenone-containing (Drospera) — anti-mineralocorticoid effect, less weight gain.', monitoring:'BP before prescription and 3-monthly. BMI. DVT risk assessment (personal/family VTE history)', gl:'ESHRE/ASRM PCOS 2023; FOGSI 2021', contra:'Smoking+age>35, migraine with aura, personal VTE history, known thrombophilia, breast cancer, uncontrolled HTN, liver disease', india:'FOGSI recommends Diane-35/Ginette-35 as first-line for hirsutism in India. Cost ≈ ₹120-250/cycle.' },
          { generic:'Spironolactone',       brand_india:'Aldactone, Spiromide', dose:'50-100mg (up to 200mg for hirsutism)', route:'Oral', freq:'Once to twice daily', duration:'Minimum 6 months for hirsutism (slow hair growth cycle)', class:'Anti-androgen (MRA)', risk:'moderate', notes:'Off-label for hirsutism in PCOS — most commonly used anti-androgen in many countries. ESHRE 2023 Grade C for COCP add-on or monotherapy. Requires reliable contraception (teratogenic — feminisation of male foetus).', monitoring:'K+ and creatinine at 1-4 weeks (diuretic effect). BP. Ensure contraception.', gl:'ESHRE 2023 add-on for refractory hirsutism', contra:'Pregnancy, K+ >5.5, eGFR <30, concomitant ACEi (hyperkalaemia)', india:'Spironolactone 25mg ≈ ₹5/tablet. Often combined with OCP in dermatology practice in India.' },
        ],
      },
      fertility_ovulation_induction: {
        label: 'Ovulation Induction (Fertility Desired)',
        drugs: [
          { generic:'Letrozole',    brand_india:'Femara, Letoval, Lonitab', dose:'2.5-5mg/day', route:'Oral', freq:'Days 3-7 of cycle', duration:'Per cycle (max 6 cycles)', class:'Aromatase inhibitor', risk:'low', notes:'ESHRE 2023 and FOGSI 2021 Grade A — FIRST-LINE for ovulation induction in PCOS. PPCOS II trial: higher live birth rate than clomiphene (27.5% vs 19.1%). Lower multiple pregnancy rate than FSH. Mechanism: ↓ oestrogen → ↑ FSH → mono-follicular ovulation.', monitoring:'Ultrasound follicle tracking from Day 10 (target 1-2 follicles ≥18mm). LH surge test / HCG trigger if anovulatory.', gl:'ESHRE/ASRM PCOS 2023 Grade A; FOGSI 2021 India first-line', contra:'Pregnancy, hepatic impairment, hormone-sensitive cancer', india:'Letrozole 2.5mg ≈ ₹15-25/tablet. Off-label for ovulation induction in India (approved by DCGI for ovulation induction since 2019 — FOGSI recommendation). Widely available.' },
          { generic:'Clomiphene citrate', brand_india:'Clofert, Siphene, Fertomid', dose:'50mg/day (titrate to 150mg if no response)', route:'Oral', freq:'Days 3-7 (or 5-9) of cycle', duration:'Per cycle (max 6 cycles)', class:'SERM (selective oestrogen receptor modulator)', risk:'low', notes:'ESHRE 2023: second-line after letrozole (lower live birth rate, higher multiple pregnancy risk up to 7-8%, anti-oestrogenic effect on endometrium at higher doses). Still widely used globally.', monitoring:'Ultrasound follicle tracking. Anti-oestrogenic effect on endometrium at >100mg.', gl:'ESHRE/ASRM 2023 second-line; still first-line in many Indian centres', india:'Clomiphene 50mg ≈ ₹5-10/tablet. Extremely cost-effective. Many centres in India still use as first-line due to cost and familiarity.' },
          { generic:'Metformin + Letrozole (combination)', brand_india:'As above', dose:'Metformin 1500mg/day ongoing + Letrozole 2.5-5mg days 3-7', route:'Oral', freq:'Combined', duration:'Per cycle (up to 6 cycles)', class:'Combination: insulin sensitiser + aromatase inhibitor', risk:'low', notes:'ESHRE 2023 Grade A: combination superior to letrozole alone in obese/IR PCOS. Cochrane 2019 meta-analysis confirms improved ovulation rate. Metformin pre-treatment (2-3 months) before ovulation induction preferred in IR patients.', monitoring:'As per individual drugs + ultrasound follicle tracking', gl:'ESHRE/ASRM PCOS 2023; FOGSI 2021 India', india:'Cost-effective combination widely used in India.' },
          { generic:'Gonadotrophins (FSH/LH)', brand_india:'Gonal-F, Puregon, Menopur', dose:'37.5-75 IU/day FSH (low-dose step-up protocol)', route:'SC injection', freq:'Daily', duration:'Per cycle under specialist', class:'Gonadotrophin', risk:'high', notes:'ESHRE 2023 second-line after OI failure. High OHSS risk in PCOS (up to 10% with standard protocols). Low-dose step-up protocol mandatory. Specialist only.', monitoring:'Daily/alternate-day USS from day 6. Oestradiol levels. If >3 dominant follicles: withhold HCG (OHSS risk).', gl:'ESHRE 2023 second-line specialist treatment', contra:'Active ovarian cyst, uncontrolled thyroid/adrenal disorders. Must have USS monitoring infrastructure.' },
        ],
      },
      protective_endometrium: {
        label: 'Endometrial Protection (Amenorrhoea ≥3 months)',
        drugs: [
          { generic:'Medroxyprogesterone acetate (MPA)', brand_india:'Provera, Meprate', dose:'10mg', route:'Oral', freq:'Once daily for 12-14 days', duration:'Every 3 months if no spontaneous cycles', class:'Progestogen', risk:'low', notes:'Withdraw bleed to prevent endometrial hyperplasia in chronic anovulation. ESHRE 2023 recommends at least 4 withdrawal bleeds/year. Alternative: micronised progesterone 200mg vaginally × 12 days.', monitoring:'Endometrial thickness USS if irregular breakthrough bleeding', gl:'ESHRE 2023; FOGSI 2021', india:'Meprate 10mg ≈ ₹5/tablet. Widely available at PHC level.' },
        ],
      },
    },
    contraindications_class: {
      COCP_contra: 'Migraine with aura + OCP = ↑ stroke risk. Absolute contraindication (WHO Cat 4).',
      metformin_pregnancy: 'Metformin: Category B in pregnancy. ESHRE 2023 suggests continuing in first trimester if started for fertility — does not increase miscarriage/teratogenicity. Discuss risk/benefit.',
      spironolactone_pregnancy: 'Absolute contraindication in pregnancy — feminisation of male foetus. Reliable contraception MANDATORY.',
    },
    monitoring: [
      { parameter:'Fasting glucose + HbA1c', frequency:'Annually (all PCOS) — 3-monthly if pre-diabetic',  target:'FPG <5.6mmol/L, HbA1c <5.7%',  action:'>6.5%: treat as T2DM; 5.7-6.4%: intensive lifestyle + metformin' },
      { parameter:'Fasting lipid profile',   frequency:'Annually',                                         target:'LDL <2.6mmol/L, TG <1.7mmol/L',action:'Dyslipidaemia: lifestyle + consider statin' },
      { parameter:'BP',                       frequency:'Every clinic visit',                               target:'<130/80 mmHg',                  action:'HTN + PCOS: prefer ACEi/ARB (metabolic benefit)' },
      { parameter:'BMI + waist',              frequency:'Every 3-6 months',                                 target:'BMI <25, waist <80cm',          action:'>30 BMI: GLP-1 agonist consideration (ESHRE 2023)' },
      { parameter:'Androgen screen (FAI/T)',  frequency:'Every 6 months until stable',                     target:'Normalisation with treatment',   action:'Persistent elevation: CAH exclusion, adrenal USS' },
      { parameter:'Endometrial USS',          frequency:'If amenorrhoea >12 months or irregular bleeding', target:'Endometrium <8mm',               action:'>12mm or irregular: endometrial biopsy to exclude hyperplasia/carcinoma' },
      { parameter:'Mental health screen',     frequency:'Annually (PHQ-9, DASS-21)',                       target:'PHQ-9 <5',                      action:'PCOS has 3× higher depression/anxiety prevalence — refer psychology' },
    ],
    referral: [
      'Fertility: no conception after 6 cycles of ovulation induction — reproductive medicine/IVF',
      'OHSS (ovarian hyperstimulation): severe — hospital admission, IV fluids, haematology',
      'Endometrial hyperplasia on biopsy — gynaecological oncology',
      'Suspected ovarian torsion (acute pain) — surgical emergency, ED',
      'Severe hirsutism unresponsive to OCP + spironolactone × 12 months — endocrinology',
      'Adolescent PCOS — specialist endocrinology/gynaecology (avoid labelling with PCOS in adolescents — use term "clinical features consistent with PCOS")',
    ],
    india_context: {
      prevalence: 'PCOS prevalence in India: 9-22% of reproductive-age women (higher than global 6-13%) — FOGSI 2021. South India (Kerala, TN, AP): 19-22% prevalence.',
      icmr_note: 'ICMR-funded PCOS India Registry ongoing. FOGSI PCOS Consensus 2021 is the primary Indian guideline.',
      diet: 'High-GI rice-dominant diet in South India worsens insulin resistance. Millets, legumes, vegetables recommended.',
      ayurveda: 'ESHRE 2023 notes insufficient evidence for herbal treatments (e.g., ashwagandha, shatavari) — not recommended as primary treatment.',
      cost: 'Letrozole ≈ ₹15-25/tablet, Clomiphene ≈ ₹5-10/tablet, Metformin ≈ ₹3-8/tablet — all affordable. Inositol supplements ₹200-500/month — patient-funded.',
      common_presentations: 'In Kerala: presenting most commonly with menstrual irregularity + weight gain. Hirsutism often under-reported culturally.',
    },
  },

  // ────────────────────────────────────────────────────────────
  // ACS — NSTEMI/UA
  // Sources: ESC ACS 2023 (L1) · AHA/ACC NSTE-ACS 2021 (L1) · BNF 86 (L4)
  // ────────────────────────────────────────────────────────────
  nstemi: {
    id: 'nstemi', name: 'NSTEMI / Unstable Angina', icd10: 'I21.4',
    systems: ['cv'],
    gl_sources: [{ name:'ESC ACS 2023', level:1 }, { name:'AHA/ACC NSTE-ACS 2021', level:1 }, { name:'BNF 86', level:4 }],
    key_symptoms: ['Chest pain/pressure at rest or with minimal exertion', 'Radiation to left arm, jaw, neck', 'Diaphoresis', 'Nausea/vomiting', 'Dyspnoea', 'Syncope', 'New-onset exertional angina'],
    red_flags: ['ST changes on ECG', 'Troponin elevation', 'Haemodynamic instability (SBP <90)', 'Heart failure signs with ACS', 'Ventricular arrhythmia'],
    dx_criteria: {
      name: 'ESC 0h/3h hs-cTn Algorithm (Rapid Rule-In/Out)',
      criteria: ['hs-cTnI at 0h + 3h. If 0h ≥52ng/L → rule-in', 'If 0h <5ng/L and no symptoms → rule-out', 'ECG: ST depression ≥0.5mm in ≥2 contiguous leads (NSTEMI)', 'UA: troponin negative, symptomatic, ECG changes'],
    },
    treatment: {
      immediate: {
        label: 'Immediate Stabilisation', drugs: [
          { generic:'Aspirin', brand_india:'Ecosprin', dose:'300mg loading, then 75mg daily', route:'Oral', freq:'Loading once, then OD', duration:'Lifelong', class:'Antiplatelet', risk:'low', notes:'ESC Class IA. Loading 300mg at diagnosis.', monitoring:'GI bleeding symptoms', gl:'ESC ACS 2023 Class IA', contra:'Active GI bleed, aspirin allergy', india:'Ecosprin 75mg ≈ ₹5/tablet' },
          { generic:'Ticagrelor', brand_india:'Brilinta', dose:'180mg loading, then 90mg BD', route:'Oral', freq:'BD (after loading)', duration:'12 months post-ACS', class:'P2Y12 inhibitor', risk:'moderate', notes:'ESC Class IB — preferred over clopidogrel (PLATO trial: ↓ CV death 21%). Dyspnoea in 14% (usually mild, resolves). Avoid with strong CYP3A inhibitors.', monitoring:'Bleeding, dyspnoea', gl:'ESC ACS 2023 Class IB preferred', contra:'Prior intracranial haemorrhage, active bleeding, hepatic impairment (severe)', india:'Ticagrelor 90mg ≈ ₹50-80/tablet. Clopidogrel preferred in India due to cost (≈₹5-10/tablet).' },
          { generic:'Clopidogrel', brand_india:'Plavix, Clopivas, Deplatt', dose:'600mg loading, then 75mg daily', route:'Oral', freq:'OD', duration:'12 months', class:'P2Y12 inhibitor', risk:'low', notes:'Alternative to ticagrelor — lower cost, similar efficacy in low-bleeding-risk. CYP2C19 poor metabolisers (20-30% of South Asians) have reduced response.', monitoring:'Bleeding', gl:'ESC ACS 2023 Class IB alternative', india:'Deplatt A (Clopidogrel + Aspirin FDC) ≈ ₹10-20/tablet. Most common antiplatelet FDC in India.' },
          { generic:'Fondaparinux', brand_india:'Arixtra', dose:'2.5mg SC OD', route:'SC', freq:'Once daily', duration:'Up to 8 days or revascularisation', class:'Factor Xa inhibitor (anticoagulant)', risk:'moderate', notes:'ESC Class IA for NSTEMI managed conservatively. Lower bleeding than enoxaparin (OASIS-5 trial). Add UFH 85 IU/kg at PCI (catheter thrombosis risk).', monitoring:'Renal function (reduce if eGFR <20)', gl:'ESC ACS 2023 Class IA', contra:'eGFR <20 (absolute)' },
          { generic:'Enoxaparin', brand_india:'Clexane, Injenox', dose:'1mg/kg SC BD (or 0.75mg/kg BD if ≥75 years)', route:'SC', freq:'BD', duration:'8 days or revascularisation', class:'LMWH (anticoagulant)', risk:'moderate', notes:'Alternative anticoagulant if fondaparinux not available. Widely available in India.', monitoring:'Anti-Xa if CrCl <30, obesity. Platelet count (HIT)', gl:'ESC ACS 2023 Class IA alternative', contra:'Active major bleeding, HIT, CrCl <15', india:'Enoxaparin 60mg ≈ ₹120-200/prefilled syringe. More widely stocked than fondaparinux in India.' },
        ],
      },
      secondary_prevention: {
        label: 'Secondary Prevention (Post-ACS)', drugs: [
          { generic:'Atorvastatin', brand_india:'Lipitor, Tonact, Aztor', dose:'80mg daily (high-intensity statin)', route:'Oral', freq:'OD (evening)', duration:'Lifelong', class:'High-intensity statin', risk:'low', notes:'ESC Class IA. PROVE-IT-TIMI 22: atorvastatin 80mg vs pravastatin 40mg → 16% ↓ CV events. Target LDL <1.4mmol/L (55mg/dL) in very high-risk ACS.', monitoring:'LFT at 3 months. CK if myalgia. Fasting lipids at 6-12 weeks.', gl:'ESC CVD Prevention 2021 Class IA', contra:'Active liver disease, pregnancy, concomitant cyclosporine/HIV protease inhibitors (rhabdomyolysis risk)', india:'Atorvastatin 10mg ≈ ₹2/tablet, 80mg ≈ ₹10-25/tablet. Generic widely available.' },
          { generic:'Ramipril', brand_india:'Cardace, Hopace', dose:'Start 2.5mg, titrate to 10mg', route:'Oral', freq:'OD', duration:'Lifelong', class:'ACE inhibitor', risk:'moderate', notes:'ESC Class IA for all post-MI patients. HOPE trial: 22% ↓ CV events in high-risk patients.', monitoring:'K+, creatinine at 1-2 weeks after start/dose change', gl:'ESC ACS 2023 Class IA', contra:'Bilateral RAS, pregnancy, K+>5.5, prior angioedema', india:'Cardace 2.5mg ≈ ₹6-12/tablet' },
          { generic:'Bisoprolol', brand_india:'Concor, Corbis, Biselect', dose:'2.5mg start, titrate to 10mg target HR 55-65', route:'Oral', freq:'OD', duration:'Minimum 3 years post-MI (lifelong if HFrEF)', class:'Cardioselective beta-blocker', risk:'moderate', notes:'ESC Class IIa post-NSTEMI for EF ≥40%. Class IA if EF <40% (LV dysfunction). Reduces sudden death.', monitoring:'HR, BP, symptoms of decompensation', gl:'ESC ACS 2023', contra:'Acute decompensated HF, HR <50, complete HB, COPD (use with caution)', india:'Concor 5mg ≈ ₹8-20/tablet' },
        ],
      },
    },
    monitoring: [
      { parameter:'hs-Troponin', frequency:'0h, 3h (ESC rapid rule-in/out)', target:'Below 99th percentile URL', action:'Any rise with symptoms = NSTEMI' },
      { parameter:'ECG', frequency:'At presentation + 30 min after each episode', target:'No ST changes', action:'ST elevation: activate STEMI pathway immediately' },
      { parameter:'GRACE score', frequency:'At admission', target:'Score guides strategy', action:'>140 = early invasive within 24h. >109 = within 72h.' },
    ],
    referral: [
      'GRACE >140 or haemodynamic instability: catheterisation lab within 24h',
      'GRACE 109-140: invasive strategy within 72h',
      'Post-ACS cardiac rehabilitation referral within 4 weeks',
    ],
    india_context: { cost:'Dual antiplatelet therapy: Deplatt A (Clopidogrel 75+Aspirin 75) FDC ≈ ₹10-20/day. Most cost-effective post-ACS antiplatelet in India.', prescribing:'Ticagrelor gaining adoption in tertiary care India. Clopidogrel remains standard at district hospital level.' },
  },

  // ────────────────────────────────────────────────────────────
  // HYPOTHYROIDISM
  // Sources: NICE CG132 2019 (L1) · ETA 2019 (L1) · BNF 86 (L4)
  // ────────────────────────────────────────────────────────────
  hypothyroidism: {
    id: 'hypothyroidism', name: 'Hypothyroidism', icd10: 'E03.9',
    systems: ['en'],
    gl_sources: [{ name:'NICE CG132 2019', level:1 }, { name:'ETA 2019', level:1 }, { name:'BNF 86', level:4 }],
    key_symptoms: ['Fatigue', 'Weight gain', 'Cold intolerance', 'Hair loss', 'Constipation', 'Dry skin', 'Depression', 'Bradycardia', 'Delayed reflexes', 'Menstrual irregularity', 'Hoarse voice'],
    red_flags: ['Myxoedema coma: altered consciousness + hypothermia + bradycardia', 'Rapidly enlarging goitre (thyroid malignancy)', 'Stridor (tracheal compression by goitre)', 'TSH >100 in asymptomatic patient (high cardiovascular risk)'],
    dx_criteria: { name:'NICE CG132 / ETA 2019', criteria: ['TSH >4.5 mIU/L on 2 occasions ≥3 months apart (if asymptomatic)', 'Overt hypothyroidism: TSH elevated + Free T4 below reference', 'Subclinical hypothyroidism: TSH 4.5-10 + normal Free T4', 'Central hypothyroidism: low FT4 + normal/low TSH (TRH deficiency — rare)'] },
    treatment: {
      standard: { label: 'Standard Thyroid Replacement', drugs: [
        { generic:'Levothyroxine (LT4)', brand_india:'Eltroxin, Thyronorm, Levo-T', dose:'1.6mcg/kg/day full replacement (start 25-50mcg in elderly/cardiac; start lower if TSH ≥100 — risk of precipitating angina)', route:'Oral (morning, fasting, 30 min before breakfast)', freq:'Once daily', duration:'Lifelong (autoimmune), review if drug-induced', class:'Thyroid hormone replacement', risk:'low', notes:'NICE CG132 Gold standard. Titrate by 25mcg increments every 6-8 weeks. Target TSH 0.4-2.5 mIU/L. In elderly or cardiac disease: target TSH 1-2.5 (upper normal). Pregnancy target: TSH <2.5 first trimester, <3.0 second/third trimester.', monitoring:'TSH 6-8 weeks after initiation/dose change, then annually once stable. Annual TSH in stable patients.', gl:'NICE CG132 Grade A; ETA 2019', contra:'Uncorrected adrenal insufficiency (can precipitate Addisonian crisis — exclude/treat first)', india:'Thyronorm 25mcg ≈ ₹35-50/30 tablets, 50mcg ≈ ₹55-75/30 tablets. Eltroxin also widely available. CDSCO approved brands.' },
        { generic:'Liothyronine (LT3) combination', brand_india:'Not widely available in India', dose:'Not recommended routinely', route:'Not applicable', freq:'Not applicable', duration:'Not applicable', class:'T3 supplement', risk:'moderate', notes:'ETA 2019 / NICE CG132: combination LT4+LT3 NOT recommended routinely — no clear clinical benefit in trials. May be considered in patients with persistent symptoms on LT4 with normal TSH — specialist only.', monitoring:'TSH + Free T3 if prescribed', gl:'ETA 2019 — conditional consideration only in specialist setting', india:'Liothyronine not available in India commercially. Not recommended.' },
      ]},
      subclinical: { label: 'Subclinical Hypothyroidism Management', drugs: [
        { generic:'Levothyroxine (selective)', brand_india:'As above', dose:'25-50mcg starting', route:'Oral', freq:'OD', duration:'Trial 6 months + reassess', class:'Thyroid hormone', risk:'low', notes:'NICE CG132: treat subclinical hypothyroidism (TSH 4.5-10) if: symptomatic, anti-TPO positive, pregnancy, age <65. Do NOT treat TSH 4.5-10 routinely in asymptomatic patients >65 (↑ cardiac risk, AF, bone density loss).', monitoring:'TSH at 6 weeks, target 0.5-2.5. If TSH not responding — check compliance.', gl:'NICE CG132' },
      ]},
    },
    contraindications_class: {
      absorption_interactions: 'Calcium, iron, antacids, PPIs, cholestyramine — ALL impair levothyroxine absorption. Separate by minimum 4 hours.',
      cardiac: 'High TSH (>100) + cardiac disease: start levothyroxine very low (12.5-25mcg) and increase slowly — risk of angina/MI if started too fast.',
    },
    monitoring: [
      { parameter:'TSH', frequency:'6-8 weeks post-initiation/dose change; annually when stable', target:'0.4-2.5 mIU/L', action:'TSH <0.1: reduce dose. TSH >4.5: increase by 25mcg.' },
      { parameter:'Free T4', frequency:'With TSH at each change; if suspected central hypothyroidism', target:'Within reference range', action:'Low FT4 despite normal TSH: central hypothyroidism — pituitary MRI' },
      { parameter:'Anti-TPO antibodies', frequency:'Once at diagnosis', target:'Positive = autoimmune (Hashimoto\'s)', action:'Positive: annual TSH surveillance (risk of progression)' },
      { parameter:'Lipid profile', frequency:'At diagnosis + annually', target:'LDL <3mmol/L', action:'Hypothyroidism causes dyslipidaemia — often resolves with treatment' },
      { parameter:'BMD (bone density)', frequency:'Menopausal women on LT4 — after 5 years', target:'T-score ≥-2.5', action:'Suppressed TSH = ↑ fracture risk. Ensure TSH in lower-normal range for age.' },
    ],
    referral: ['Myxoedema coma — ICU immediately', 'Rapidly enlarging goitre — urgent ENT/thyroid surgery', 'Suspected thyroid malignancy (hard/fixed goitre, lymphadenopathy) — endocrinology', 'Pregnancy + hypothyroidism — specialist obstetric/endocrine clinic from conception'],
    india_context: { prevalence:'Hypothyroidism prevalence 11% in India (ICMR-NIN survey 2022). Kerala women: estimated 15-18% prevalence.', cost:'Thyronorm 50mcg ≈ ₹60-80/30 tablets. Cheapest thyroid replacement globally in India.', prescribing:'Common pattern in India: over-treatment of subclinical hypothyroidism in young women. NICE CG132 guidance often not followed — treat only if symptomatic or anti-TPO positive.' },
  },

  // ────────────────────────────────────────────────────────────
  // TYPE 2 DIABETES MELLITUS
  // Sources: ADA Standards 2024 (L1) · NICE NG28 2022 (L1) · ICMR T2DM Guidelines 2023 (L1) · BNF 86 (L4)
  // ────────────────────────────────────────────────────────────
  t2dm: {
    id: 't2dm', name: 'Type 2 Diabetes Mellitus', icd10: 'E11',
    systems: ['en'],
    gl_sources: [{ name:'ADA Standards 2024', level:1 }, { name:'NICE NG28 2022', level:1 }, { name:'ICMR T2DM 2023', level:1 }, { name:'BNF 86', level:4 }],
    key_symptoms: ['Polyuria', 'Polydipsia', 'Weight loss', 'Fatigue', 'Blurred vision', 'Recurrent infections', 'Peripheral tingling/numbness', 'Acanthosis nigricans (IR marker)'],
    red_flags: ['Random glucose >20mmol/L with symptoms — DKA/HHS', 'GCS depression + hyperglycaemia', 'Ketones positive with symptoms', 'Foot ulcer with cellulitis/gangrene', 'Vision loss (proliferative retinopathy/vitreous haemorrhage)', 'eGFR <15 (advanced diabetic nephropathy — urological emergency)'],
    dx_criteria: {
      name: 'WHO 2023 / ADA 2024 Diagnostic Criteria',
      criteria: ['HbA1c ≥48mmol/mol (≥6.5%) on 2 occasions (no symptoms)', 'HbA1c ≥48mmol/mol on 1 occasion + symptoms', 'Fasting glucose ≥7.0mmol/L (126mg/dL) on 2 occasions', 'Random glucose ≥11.1mmol/L + symptoms', 'OGTT 2h ≥11.1mmol/L (75g glucose load)', 'Pre-diabetes: HbA1c 39-47mmol/mol (5.7-6.4%) OR FPG 5.6-6.9mmol/L'],
    },
    treatment: {
      step1: { label: 'Step 1 — Lifestyle + Metformin', drugs: [
        { generic:'Metformin', brand_india:'Glycomet, Glucophage, Obimet', dose:'500mg BD with meals → 1000mg BD target (max 3g/day)', route:'Oral', freq:'BD (or OD with SR formulation)', duration:'Lifelong unless intolerance/contraindication', class:'Biguanide (insulin sensitiser)', risk:'low', notes:'ADA 2024 + ICMR 2023 Grade A first-line. Weight neutral. ↓ CV mortality (UKPDS). SR formulation: 500-2000mg OD — better GI tolerability. B12 deficiency with long-term use (monitor annually after 5 years).', monitoring:'RFT before start (eGFR must be ≥45). Withhold: acute illness, contrast, surgery. B12 annually after 5 years.', gl:'ADA 2024 Grade A; NICE NG28; ICMR 2023', contra:'eGFR <30 (absolute), <45 (reduce dose), hepatic impairment, alcohol excess, IV contrast within 48h, ketoacidosis', india:'Generic metformin ≈ ₹3-8/tablet. Glycomet SR 1000mg ≈ ₹8-15/tablet. Jan Aushadhi metformin ≈ ₹2/tablet.' },
      ]},
      step2_cv_high_risk: { label: 'Step 2A — High CV/Renal Risk (SGLT2i or GLP-1)', drugs: [
        { generic:'Empagliflozin', brand_india:'Jardiance, Empaglu', dose:'10mg (up to 25mg)', route:'Oral', freq:'OD (morning)', duration:'Lifelong if tolerated', class:'SGLT2 inhibitor', risk:'moderate', notes:'ADA 2024 + NICE NG28 Grade A for: eGFR ≥20 + established CVD or CKD (albumin:creatinine >300mg/g). EMPA-REG OUTCOME: 38% ↓ CV death. EMPEROR-Reduced: 25% ↓ HF hospitalisation. Also licensed for HFrEF (regardless of DM). Risk: DKA (euglycaemic), genital mycotic infections, Fournier gangrene (rare), UTI, amputation risk (canagliflozin data). Withhold 3-5 days before surgery/fasting.', monitoring:'eGFR and K+ at initiation, then 3-6 monthly. Genital hygiene education. BP (natriuretic).', gl:'ADA 2024; NICE NG28; ESC HF 2021 (Class IA for HFrEF)', contra:'eGFR <20, recurrent UTI, T1DM, ketoacidosis, pregnancy', india:'Jardiance 10mg ≈ ₹35-60/tablet. Expensive; PMBJP generic available in some states.' },
        { generic:'Semaglutide', brand_india:'Ozempic (SC), Rybelsus (oral)', dose:'SC: 0.25mg weekly × 4 weeks → 0.5mg → 1mg. Oral: 3mg OD → 7mg → 14mg.', route:'SC weekly (Ozempic) or Oral OD (Rybelsus)', freq:'Weekly (SC) / Daily (oral)', duration:'Lifelong if tolerated', class:'GLP-1 receptor agonist', risk:'moderate', notes:'ADA 2024 preferred GLP-1 RA for CV risk reduction. SUSTAIN-6: 26% ↓ MACE. Also approved for weight loss (Wegovy 2.4mg). Most effective glucose-lowering drug for weight loss (−5 to −10 kg). Nausea/vomiting most common (reduces with dose titration).', monitoring:'Renal function (indirect). Pancreatitis symptoms. Diabetic retinopathy monitoring (can worsen if rapid HbA1c reduction).', gl:'ADA 2024; NICE NG28 add-on for weight benefit', contra:'Personal/family history medullary thyroid cancer, MEN2, pancreatitis, pregnancy', india:'Ozempic ≈ ₹2000-3500/pen (1mg × 4 doses). Expensive. Liraglutide (Victoza) also available, older agent. Oral semaglutide not yet widely available in India.' },
        { generic:'Liraglutide', brand_india:'Victoza, Saxenda', dose:'0.6mg SC daily × 1 week → 1.2mg → 1.8mg target', route:'SC', freq:'Once daily', duration:'Lifelong', class:'GLP-1 RA', risk:'moderate', notes:'Alternative GLP-1 RA to semaglutide. LEADER trial: 13% ↓ MACE in T2DM with CV disease. More affordable than semaglutide in India.', monitoring:'Same as semaglutide', gl:'ADA 2024', contra:'Same as semaglutide', india:'Victoza ≈ ₹1200-1800/pen (18mg/3mL, ~30 doses). More cost-effective than semaglutide.' },
      ]},
      step2_no_cv_risk: { label: 'Step 2B — No High CV Risk: Add DPP-4i or Sulfonylurea', drugs: [
        { generic:'Sitagliptin', brand_india:'Januvia, Istavel, Sitagen', dose:'100mg OD (reduce to 50mg if eGFR 30-50; 25mg if eGFR <30)', route:'Oral', freq:'OD', duration:'Ongoing', class:'DPP-4 inhibitor (gliptin)', risk:'low', notes:'ADA 2024 weight-neutral, low hypoglycaemia risk. Suitable for elderly, CKD (dose-adjust). No CV benefit demonstrated (TECOS trial neutral). Simple once-daily dosing.', monitoring:'LFT (rare pancreatitis — stop if symptoms). eGFR for dose adjustment.', gl:'ADA 2024; NICE NG28 add-on after metformin', contra:'History of pancreatitis (caution), severe renal impairment without dose adjustment', india:'Januvia 100mg ≈ ₹65-80/tablet. Generic sitagliptin 100mg ≈ ₹20-30/tablet now available.' },
        { generic:'Glimepiride', brand_india:'Amaryl, Glimestar, Zoryl', dose:'1-4mg daily (start 1mg, titrate up)', route:'Oral', freq:'OD (with breakfast)', duration:'Ongoing (review annually)', class:'Sulfonylurea (2nd generation)', risk:'moderate', notes:'ADA 2024 low cost, effective glucose lowering. Hypoglycaemia risk (lower than glyburide). Weight gain 2-3kg. UKPDS showed microvascular benefit with sulfonylureas. Avoid in elderly (hypoglycaemia risk), irregular meal patterns.', monitoring:'Fasting glucose. Signs of hypoglycaemia. Weight.', gl:'ADA 2024; ICMR 2023 — commonly used in India', contra:'Significant renal/hepatic impairment, G6PD deficiency (sulfonamide), pregnancy, irregular meal intake, elderly (relative — prefer DPP-4i)', india:'Glimepiride 2mg ≈ ₹3-8/tablet. Most common sulfonylurea in India. Jan Aushadhi ≈ ₹2/tablet. FDC with metformin (Glycomet GP) widely used.' },
      ]},
      step3_insulin: { label: 'Step 3 — Insulin Therapy', drugs: [
        { generic:'Insulin glargine (basal)', brand_india:'Lantus, Basalog', dose:'0.1-0.2 units/kg bedtime (titrate by 2 units q3 days for FPG target 80-130mg/dL)', route:'SC', freq:'Once daily (bedtime)', duration:'Ongoing', class:'Long-acting insulin analogue', risk:'high', notes:'ADA 2024: start basal insulin if HbA1c ≥86mmol/mol (10%) or symptoms persist. Glargine U-100: less nocturnal hypoglycaemia vs NPH. Glargine U-300 (Toujeo): less hypoglycaemia than U-100. ICMR India: recommends basal insulin as preferred insulin initiation.', monitoring:'FPG daily until target. HbA1c 3-monthly. Hypoglycaemia episodes. Injection site rotation.', gl:'ADA 2024; ICMR 2023', contra:'Hypoglycaemia unawareness (relative — CSII preferred)', india:'Lantus ≈ ₹250-350/pen (100U/mL × 3mL). Basalog (biosimilar, Biocon) ≈ ₹180-240/pen — widely available.' },
        { generic:'Insulin NPH (isophane)', brand_india:'Huminsulin N, Insuman Basal, Mixtard N', dose:'0.1-0.2 units/kg bedtime', route:'SC', freq:'OD or BD', duration:'Ongoing', class:'Intermediate-acting insulin', risk:'high', notes:'Lower cost than glargine. More nocturnal hypoglycaemia and peak effect. Still widely used in India and in resource-limited settings. WHO Essential Medicines List.', monitoring:'Same as glargine', gl:'WHO Essential Medicines; ICMR 2023 cost-effective option', india:'Huminsulin N (Eli Lilly India) ≈ ₹150-200/vial. Most affordable insulin in India.' },
        { generic:'Premixed insulin 30/70', brand_india:'Mixtard 30, Huminsulin 30/70, Novomix 30', dose:'0.4-0.6 units/kg/day in 2 divided doses (BD before breakfast and dinner)', route:'SC', freq:'BD', duration:'Ongoing', class:'Premixed insulin (biphasic)', risk:'high', notes:'ICMR 2023 commonly used in India for dual bolus+basal requirement. Suitable for regular meal timers. Higher hypoglycaemia risk vs basal-only. Cannot adjust prandial and basal independently.', monitoring:'Pre-meal and bedtime glucose. HbA1c 3-monthly.', gl:'ICMR 2023; widely used in India', india:'Mixtard 30/70 ≈ ₹180-250/vial. Most commonly prescribed insulin regimen in India.' },
      ]},
    },
    monitoring: [
      { parameter:'HbA1c',             frequency:'3-monthly until target; 6-monthly when stable', target:'<48mmol/mol (6.5%) general; <53 if elderly/frail/hypoglycaemia-prone', action:'≥86mmol/mol (10%): consider insulin initiation' },
      { parameter:'Self-monitoring BG', frequency:'Fasting daily (on insulin/SU); 2h post-meal 2-3×/week', target:'FPG 4-7 mmol/L; 2h post-meal <8.5 mmol/L', action:'Hypoglycaemia (<4mmol/L): 15g fast glucose + recheck 15 min' },
      { parameter:'RFT + eGFR',         frequency:'Annually (or 6-monthly if eGFR declining)', target:'eGFR ≥60',         action:'eGFR <45: nephrology; <30: advanced DKD management' },
      { parameter:'Urine ACR',          frequency:'Annually from diagnosis',                    target:'<3mg/mmol',       action:'3-30 (microalbuminuria): add/maximise ACEi/ARB; >30: nephrology' },
      { parameter:'Fundoscopy',         frequency:'At diagnosis, then annually',                 target:'No retinopathy',  action:'Proliferative: urgent ophthalmology. Macula: anti-VEGF' },
      { parameter:'Foot exam',          frequency:'At every clinic visit (inspection); annually detailed', target:'No ulcer, intact sensation', action:'Neuropathy/peripheral vascular: podiatry; ulcer: diabetic foot team' },
      { parameter:'BP',                 frequency:'Every visit',                                  target:'<130/80',         action:'HTN + DM: ACEi/ARB first-line' },
      { parameter:'Lipid profile',      frequency:'At diagnosis, then annually',                  target:'LDL <2.6 general; <1.8 if CVD',  action:'Start/intensify statin if LDL above target or 10-yr risk >10%' },
      { parameter:'Foot pulses + ABI',  frequency:'Annually',                                     target:'ABI 0.9-1.4',     action:'ABI <0.9: peripheral arterial disease — vascular surgery' },
    ],
    referral: [
      'DKA/HHS: ED immediately — IV fluids + insulin protocol',
      'eGFR <30 or rapid decline: nephrology',
      'Proliferative retinopathy: urgent ophthalmology (<1 week)',
      'Infected diabetic foot ulcer: diabetic foot team / hospital if cellulitis/osteomyelitis',
      'HbA1c ≥86mmol/mol on 3 agents: endocrinology',
      'Type 1 DM suspected (young, lean, ketosis): endocrinology',
    ],
    india_context: {
      prevalence: 'India has 101 million people with T2DM (IDF 2021) — 2nd globally. Kerala: >20% prevalence in adults >40.',
      icmr: 'ICMR T2DM Clinical Practice Guidelines 2023: pragmatic India-specific approach. Metformin + glimepiride or DPP-4i most common step 2 in India. Insulin glargine or NPH for step 3.',
      cost_note: 'Metformin + glimepiride ≈ ₹5-15/day. DPP-4i adds ₹30-80/day. SGLT2i adds ₹35-60/day. GLP-1 RA (₹100-200/day) — limited access outside urban centres.',
      dietary: 'Kerala rice-dominant diet: high GI. Specific counselling: reduce rice portions, add millets, legumes, vegetables. Evening rice + fish: common pattern — needs portion guidance.',
    },
  },

};  // END CLINICAL_KB

// ── Extend KB with additional conditions ──────────────────────
Object.assign(CLINICAL_KB, {

  pneumonia: {
    id:'pneumonia', name:'Community-Acquired Pneumonia', icd10:'J18.9',
    systems:['rs'],
    gl_sources:[{name:'BTS CAP 2009',level:1},{name:'IDSA/ATS CAP 2019',level:1},{name:'BNF 86',level:4}],
    key_symptoms:['Fever >38°C','Productive cough','Dyspnoea','Pleuritic chest pain','Rigors','Confusion (elderly)'],
    red_flags:['SpO2 <92%','Respiratory rate >30/min','SBP <90 mmHg','Confusion (new)','Multilobar involvement on CXR','Empyema or lung abscess'],
    dx_criteria:{name:'CURB-65 Score (BTS)',criteria:['C — Confusion (new)','U — Urea >7 mmol/L','R — RR ≥30/min','B — BP <90/60 mmHg','65 — Age ≥65 years','Score 0-1: outpatient; Score 2: hospital; Score ≥3: HDU/ICU']},
    treatment:{
      mild_outpatient:{label:'CURB-65 0-1 — Outpatient',drugs:[
        {generic:'Amoxicillin',brand_india:'Amoxil, Mox, Novamox',dose:'500mg TDS × 5 days',route:'Oral',freq:'TDS (every 8h)',duration:'5 days',class:'Aminopenicillin',risk:'low',notes:'BTS first-line for CAP (no comorbidities, no atypical features). Covers Streptococcus pneumoniae — most common cause. Add macrolide if atypical features (age <50, bilateral, no consolidation).',monitoring:'Clinical review at 48-72h. If no improvement: broaden cover.',gl:'BTS CAP 2009 Grade A',contra:'Penicillin allergy — use doxycycline instead',india:'Mox 500mg ≈ ₹15-30/course. Amoxicillin most common first-line antibiotic in India.'},
        {generic:'Azithromycin (atypical cover add-on)',brand_india:'Zithromax, Azithral',dose:'500mg OD × 3-5 days',route:'Oral',freq:'OD',duration:'3-5 days',class:'Macrolide',risk:'low',notes:'Add for atypical CAP (Mycoplasma, Legionella, Chlamydophila) or when amoxicillin response inadequate. In India — preferred for young adults with atypical features.',monitoring:'ECG if cardiac history (QT prolongation risk).',gl:'BTS CAP 2009',contra:'QT prolongation, concurrent clarithromycin, hepatic impairment',india:'Azithral 500mg ≈ ₹50-100/course.'},
      ]},
      moderate_hospital:{label:'CURB-65 2 — Hospital Admission',drugs:[
        {generic:'Co-amoxiclav + Azithromycin',brand_india:'Augmentin + Azithral',dose:'Co-amox 1.2g IV 8-hourly + Azithromycin 500mg OD IV/oral',route:'IV (switch to oral when stable)',freq:'Co-amox 8-hourly; Azithro OD',duration:'5-7 days total',class:'Beta-lactam + Macrolide combination',risk:'moderate',notes:'IDSA/ATS combination therapy for hospitalised moderate CAP. Dual therapy reduces mortality vs monotherapy. Switch to oral when: afebrile >24h, HR<100, SpO2 maintained on air.',monitoring:'Renal function (co-amoxiclav). Temperature, SpO2, WBC, CRP 48-72h.',gl:'IDSA/ATS 2019 (moderate CAP)'},
      ]},
      severe_icu:{label:'CURB-65 ≥3 — HDU/ICU',drugs:[
        {generic:'Piperacillin-tazobactam',brand_india:'Tazact, Piptaz',dose:'4.5g IV 6-8 hourly',route:'IV',freq:'6-8 hourly',duration:'7-10 days',class:'Broad-spectrum beta-lactam',risk:'moderate',notes:'Severe CAP or suspected aspiration/healthcare-associated. Adjust based on culture results. Add atypical cover (macrolide or fluoroquinolone).',monitoring:'RFT, LFT. Therapeutic drug monitoring in severe sepsis.',gl:'IDSA/ATS 2019 (severe CAP)'},
        {generic:'Levofloxacin (monotherapy option)',brand_india:'Tavanic, Levoflox',dose:'500mg OD (or 750mg OD for severe)',route:'IV then oral',freq:'OD',duration:'5-7 days',class:'Fluoroquinolone',risk:'moderate',notes:'Monotherapy alternative covering both typical and atypical organisms. Useful if beta-lactam contraindicated. Increasing resistance to fluoroquinolones in India — local antibiogram guided.',monitoring:'ECG (QTc), tendon rupture risk (avoid in >60y with steroids)',gl:'BTS/IDSA CAP'},
      ]},
    },
    monitoring:[
      {parameter:'CURB-65',frequency:'At admission',target:'Score guides ward vs ICU',action:'≥3: ICU/HDU; Reassess q48h'},
      {parameter:'SpO2',frequency:'Continuous (inpatient); 4-hourly',target:'≥94%',action:'<92%: O2 therapy; <88% with COPD: controlled O2 + ABG'},
      {parameter:'CXR',frequency:'Baseline + 6 weeks post-discharge (if >50y or smoker)',target:'Resolution of infiltrate',action:'Non-resolution at 6 weeks: CT chest to exclude malignancy'},
      {parameter:'Blood cultures',frequency:'Before antibiotics if CURB-65 ≥2',target:'Culture-directed therapy',action:'Positive: step-down to targeted therapy at 48h'},
    ],
    referral:['CURB-65 ≥3: ITU/HDU','Non-resolving CAP at 6 weeks: CT chest + respiratory medicine','Empyema: respiratory/thoracic surgery','Recurrent pneumonia (>2/year): respiratory medicine + consider immunology'],
    india_context:{availability:'Amoxicillin and co-amoxiclav widely available at district hospital level. Azithromycin widely used in India.',cost:'Amoxicillin 500mg ≈ ₹3-5/tablet. Co-amoxiclav 625mg ≈ ₹25-45/tablet. IV Pip-tazo ≈ ₹250-500/vial.',prescribing:'Over-use of broad-spectrum antibiotics (levofloxacin, ceftriaxone) even for mild CAP is a major AMR issue in India. BTS guidance on narrow-spectrum stepwise use should be followed.',icmr:'ICMR AMR guidelines emphasize rational antibiotic use for CAP — amoxicillin first for mild community-acquired.'},
  },

  iron_deficiency_anaemia: {
    id:'iron_deficiency_anaemia', name:'Iron Deficiency Anaemia', icd10:'D50.9',
    systems:['hm'],
    gl_sources:[{name:'NICE NG24 2021',level:1},{name:'BSH Iron Deficiency 2022',level:1},{name:'WHO Anaemia 2020',level:1},{name:'BNF 86',level:4}],
    key_symptoms:['Fatigue / lethargy','Pallor (conjunctival, palmar)','Dyspnoea on exertion','Palpitations','Hair loss','Brittle nails / koilonychia','Pica (ice, clay, chalk)','Angular stomatitis','Glossitis'],
    red_flags:['Hb <70 g/L with symptoms — consider transfusion','Hb <80 g/L in cardiac disease','Rapid Hb decline (>20 g/L in 2 weeks)','Associated rectal bleeding / haematemesis in male or post-menopausal female — exclude GI malignancy URGENTLY'],
    dx_criteria:{name:'BSH 2022 / NICE NG24',criteria:['Serum ferritin <30 ng/mL (definitive)','Ferritin 30-100 + transferrin saturation <20% = functional iron deficiency','MCV <80 fL + Hb below reference (microcytic anaemia)','Peripheral smear: microcytic, hypochromic, pencil cells, anisocytosis','TIBC elevated (>360 mcg/dL) with low serum iron']},
    treatment:{
      oral:{label:'First-line — Oral Iron',drugs:[
        {generic:'Ferrous sulphate',brand_india:'Niferex, Ferium, Orofer-S',dose:'200mg TDS (equivalent to 200mg elemental Fe/day total from 3 tabs) — OR 200mg OD (alternate-day dosing per recent evidence)',route:'Oral',freq:'TDS between meals or OD alternate day',duration:'3 months after Hb normalises (to replenish stores)',class:'Iron salt',risk:'low',notes:'NICE NG24 / BSH first-line. OD alternate-day dosing (every other day): EQUAL efficacy, BETTER tolerated, BETTER absorbed (hepcidin cycle). Start with OD and titrate. Take with vitamin C (ascorbic acid 200mg) to improve absorption. Avoid with tea, coffee, dairy within 1h.',monitoring:'CBC at 4 weeks (expect Hb rise 10-20 g/L/month). Ferritin at end of course.',gl:'NICE NG24; BSH 2022 Iron Deficiency',contra:'Haemochromatosis, thalassaemia, sideroblastic anaemia, hypersensitivity to iron',india:'Ferrous sulphate 200mg ≈ ₹1-2/tablet. Orofer-S widely available. Jan Aushadhi ferrous sulphate available.'},
        {generic:'Ferrous gluconate (better tolerated)',brand_india:'Ferrocal, Iron Gluconate',dose:'300mg BD (35mg elemental iron per tablet)',route:'Oral',freq:'BD',duration:'As above',class:'Iron salt',risk:'low',notes:'Less elemental iron but fewer GI side effects than ferrous sulphate. Preferred in patients with GI intolerance to sulphate.',monitoring:'Same as ferrous sulphate.',gl:'BSH 2022',india:'Less commonly available in India than ferrous sulphate.'},
      ]},
      iv:{label:'IV Iron (Oral Failure or Severe)',drugs:[
        {generic:'Ferric carboxymaltose',brand_india:'Encicarb, Orofer-FCM, Injectafer',dose:'500-1000mg single IV dose (calculated by Ganzoni formula: weight × [target Hb - actual Hb] × 0.24 + 500)',route:'IV infusion over 15 min',freq:'Single dose or 2 doses separated by 1 week',duration:'Single course',class:'IV iron (non-dextran)',risk:'moderate',notes:'BSH 2022 preferred IV iron — lowest anaphylaxis risk, rapid Hb response. Indicated: oral failure, malabsorption, CKD (GFR <30), pre-op optimization, IBD, severe anaemia needing rapid correction. Faster repletion than oral (>2g in 1 session).',monitoring:'BP and SpO2 during infusion. Phosphate at 2 weeks (hypophosphataemia in 50% — usually transient). Ferritin at 8 weeks.',gl:'BSH 2022 IV iron first-choice',contra:'Iron overload, active bacterial infection (IV iron feeds bacteria), first trimester pregnancy (use second trimester)',india:'FCM 500mg ≈ ₹800-1500/vial. Used in tertiary centres and dialysis units.'},
      ]},
    },
    monitoring:[
      {parameter:'Haemoglobin',frequency:'4 weeks after starting treatment',target:'Rise ≥10 g/L/month',action:'No rise: check compliance, malabsorption, ongoing blood loss, thalassaemia'},
      {parameter:'Serum ferritin',frequency:'At end of treatment course (3 months post-Hb normalisation)',target:'Ferritin >50 ng/mL',action:'Still low: repeat 3-month course. Consider IV iron if persistent.'},
      {parameter:'Source of iron deficiency',frequency:'Mandatory investigation in ALL males and post-menopausal females',target:'No occult blood loss',action:'FOBT positive or GI symptoms: urgent OGD + colonoscopy to exclude malignancy'},
      {parameter:'Dietary assessment',frequency:'Once at diagnosis',target:'Adequate dietary iron intake',action:'Vegetarian/vegan: dietary counselling + sustained supplementation'},
    ],
    referral:['Male or post-menopausal female with IDA: upper and lower GI endoscopy (urgent if >2+ occult blood)','Hb <70 g/L or haemodynamically unstable: transfusion team','Failure to respond to oral + IV iron: haematology','Recurrent IDA: gastroenterology (Coeliac, IBD, GAVE)'],
    india_context:{prevalence:'India has highest anaemia burden globally — 57% of women, 25% of men (NFHS-5 2021). Kerala: 33% women anaemic despite high literacy.',cost:'Ferrous sulphate ≈ ₹1-2/tablet. IV FCM ≈ ₹800-1500/infusion. Ferrous sulphate + folic acid (Haematogen, Dexorange) FDC widely prescribed in India.',icmr:'Anaemia Mukt Bharat (AMB) — national program for anaemia control. Weekly IFA supplementation in adolescent girls and pregnant women.',prescribing:'Iron + Folic acid FDC tablets (e.g., Autrin, Livogen, Dexorange syrup) extremely common in India — often given without ferritin testing. Dexorange (Fe + B12 + Folic acid) syrup widely used.'},
  },

  migraine: {
    id:'migraine', name:'Migraine', icd10:'G43.9',
    systems:['nr'],
    gl_sources:[{name:'NICE NG150 2021',level:1},{name:'EHF Guidelines 2022',level:1},{name:'BNF 86',level:4}],
    key_symptoms:['Unilateral pulsating headache','Nausea / vomiting','Photophobia','Phonophobia','Aura (visual, sensory, speech) — 30% of patients','Worsening with physical activity','Duration 4-72 hours untreated'],
    red_flags:['Thunderclap onset (seconds to max) — SAH','Focal neurological deficit not matching aura — stroke','Fever + neck stiffness — meningitis','First/worst/different/progressive headache','Age >50 new onset (temporal arteritis)','Immunocompromised (HIV, cancer)','Visual loss (not transient scintillations) — acute glaucoma/GCA'],
    dx_criteria:{name:'ICHD-3 Migraine Without Aura',criteria:['≥5 attacks meeting criteria B-D','Duration 4-72 hours','≥2 of: unilateral, pulsating, moderate/severe intensity, aggravated by routine physical activity','≥1 of: nausea/vomiting, photophobia AND phonophobia','Not better explained by another diagnosis','ICHD-3 Migraine With Aura: 1+ aura symptom reversible + aura <60 min duration']},
    treatment:{
      acute:{label:'Acute Attack Treatment',drugs:[
        {generic:'Sumatriptan',brand_india:'Suminat, Formigran, Stasma',dose:'50mg (may repeat after 2h, max 300mg/day)',route:'Oral (also available as 6mg SC injection, 10-20mg nasal spray)',freq:'Single dose; repeat in 2h if partial response',duration:'Per attack',class:'5-HT1B/D agonist (triptan)',risk:'low',notes:'NICE NG150 first-line for moderate-severe migraine if NSAIDs ineffective. Take EARLY (within 30 min of onset). Faster onset with SC formulation. SC preferred for nausea-dominant attacks. Nasal spray useful for those with rapid onset.',monitoring:'BP (causes vasoconstriction). Symptoms of ischaemia.',gl:'NICE NG150 Grade A; EHF 2022 first-line',contra:'Ischaemic heart disease, uncontrolled HTN, previous stroke/TIA, hemiplegic migraine, basilar migraine, pregnancy (relative — specialist advice)',india:'Suminat 50mg ≈ ₹50-80/tablet. Widely available in India.'},
        {generic:'Aspirin + Metoclopramide',brand_india:'Aspirin 900mg + Perinorm/Maxolon',dose:'Aspirin 900mg + Metoclopramide 10mg at onset',route:'Oral',freq:'Single dose; repeat in 30 min if needed',duration:'Per attack',class:'NSAID + antiemetic',risk:'low',notes:'NICE NG150 first-line alternative (cheaper than triptans). Metoclopramide improves gastric motility and NSAID absorption during migraine (gastroparesis). Combination as effective as sumatriptan in most trials.',monitoring:'GI symptoms. Metoclopramide: extrapyramidal effects (avoid >5 days in young females).',gl:'NICE NG150 Grade A first-line',contra:'Peptic ulcer (aspirin), children <16y (Reye syndrome), renal impairment',india:'Aspirin dispersible 325mg ≈ ₹2/tablet. Perinorm 10mg ≈ ₹3/tablet. Extremely cost-effective.'},
      ]},
      prophylaxis:{label:'Prophylaxis (≥4 attacks/month or disabling)',drugs:[
        {generic:'Topiramate',brand_india:'Topamax, Topen',dose:'25mg OD start, increase by 25mg/week to 50-100mg OD/BD',route:'Oral',freq:'OD or BD',duration:'Minimum 6 months; reassess annually',class:'Antiepileptic (migraine prophylaxis)',risk:'moderate',notes:'NICE NG150 first-line prophylaxis. Also approved for weight loss (helpful in obese migraineurs). Cognitive side effects ("dopamax") — start slow. Teratogenic — reliable contraception mandatory. Reduces attacks by 50% in 60-70% of patients.',monitoring:'Cognitive function, weight, eye pressure (acute glaucoma — rare), pregnancy test',gl:'NICE NG150 Grade A first-line prophylaxis',contra:'Pregnancy (Category D, teratogenic), kidney stones, metabolic acidosis, concomitant valproate without specialist',india:'Topamax 25mg ≈ ₹10-18/tablet. Generic topiramate ≈ ₹5-10/tablet.'},
        {generic:'Amitriptyline',brand_india:'Tryptomer, Sarotena',dose:'10mg nocte start, increase by 10mg/week to 25-75mg nocte',route:'Oral',freq:'Nocte (at bedtime)',duration:'6-12 months',class:'TCA (off-label migraine prophylaxis)',risk:'moderate',notes:'NICE NG150 alternative first-line. Particularly useful if comorbid insomnia, depression, or chronic pain. Lower doses used for migraine than depression. Sedating — take at night.',monitoring:'ECG before starting (QTc). Anticholinergic effects (urinary retention, dry mouth). Weight gain.',gl:'NICE NG150 prophylaxis alternative',contra:'Glaucoma, urinary retention, recent MI, MAOIs within 14 days, arrhythmias',india:'Tryptomer 10mg ≈ ₹5-8/tablet. Widely available. Very commonly prescribed for migraine in India.'},
        {generic:'Propranolol',brand_india:'Inderal, Ciplar',dose:'40mg BD, titrate to 160mg daily',route:'Oral',freq:'BD',duration:'6 months minimum',class:'Beta-blocker (migraine prophylaxis)',risk:'moderate',notes:'Established migraine prophylaxis. Also treats hypertension and anxiety (bonus in migraineurs with these comorbidities). Avoid in asthma.',monitoring:'HR, BP. Symptoms of bronchoconstriction.',gl:'NICE NG150 prophylaxis',contra:'Asthma, COPD, complete heart block, bradycardia, diabetes on insulin (masks hypoglycaemia)',india:'Ciplar 40mg ≈ ₹3-5/tablet. Common prophylactic in India.'},
      ]},
    },
    monitoring:[
      {parameter:'Headache diary',frequency:'Every clinic visit',target:'Reduction in attack frequency ≥50%',action:'If no reduction after 3 months on adequate dose: switch prophylactic agent'},
      {parameter:'Analgesic use frequency',frequency:'Monthly review',target:'<10 days/month (simple), <15 days/month (triptans)',action:'Medication overuse headache (MOH): withdrawal and detox protocol — gradual withdrawal under guidance'},
      {parameter:'MIDAS / HIT-6 score',frequency:'Every 6 months',target:'MIDAS Grade I (minimal disability)',action:'Grade III-IV (severe): specialist referral, consider CGRP antagonists (fremanezumab/erenumab)'},
    ],
    referral:['Any red flag feature — neurologist urgently','First/worst/different headache — CT/MRI before treatment','Medication overuse headache (MOH) not responding to withdrawal — headache clinic','MIDAS Grade IV on adequate prophylaxis — CGRP monoclonal antibody (neurologist)','Hemiplegic migraine or migraine with prolonged aura — neurologist'],
    india_context:{cost:'Sumatriptan 50mg ≈ ₹50-80/tab. Topiramate 25mg ≈ ₹5-18/tab. Amitriptyline ≈ ₹5/tab. Propranolol ≈ ₹3/tab — prophylaxis very affordable.',prescribing:'Amitriptyline most commonly used prophylactic in India due to cost. Topiramate growing. CGRP biologics not yet widely available/covered by insurance in India.',icmr:'No specific ICMR migraine guideline. NICE NG150 and EHF guidelines followed by neurologists in India.'},
  },

  heart_failure: {
    id:'heart_failure', name:'Heart Failure (HFrEF)', icd10:'I50.9',
    systems:['cv','rs'],
    gl_sources:[{name:'ESC Heart Failure 2021',level:1},{name:'AHA/ACC HF 2022',level:1},{name:'BNF 86',level:4}],
    key_symptoms:['Dyspnoea on exertion','Orthopnoea (cannot lie flat)','Paroxysmal nocturnal dyspnoea','Bilateral ankle oedema','Fatigue','Cardiac cachexia (late)','Ascites (severe)'],
    red_flags:['SpO2 <90% — acute pulmonary oedema','SBP <90 — cardiogenic shock','K+ >6.0 — hyperkalaemia (ACEi/MRA)','eGFR <20 — cardiorenal syndrome','BNP >5000 pg/mL','New AF or VT in setting of HF'],
    dx_criteria:{name:'ESC HF 2021 — HFrEF Diagnosis',criteria:['Symptoms of HF (dyspnoea, fatigue, ankle oedema)','Signs of HF (raised JVP, pulmonary crackles, peripheral oedema)','EF ≤40% on echocardiogram — HFrEF','BNP >35 pg/mL (outpatient) or NT-proBNP >125 pg/mL confirms diagnosis','HFmrEF (EF 41-49%): treat as HFrEF according to ESC 2021','HFpEF (EF ≥50%): treat symptoms, diuretics; no proven mortality benefit drugs']},
    treatment:{
      foundational_quadruple:{label:'Foundational Quadruple Therapy (HFrEF — ESC 2021 Class IA)',drugs:[
        {generic:'Ramipril (ACE inhibitor)',brand_india:'Cardace, Hopace',dose:'Start 2.5mg OD → target 10mg OD',route:'Oral',freq:'OD',duration:'Lifelong',class:'ACE inhibitor',risk:'moderate',notes:'ESC 2021 Class IA for all HFrEF. Reduces mortality 23% (CONSENSUS trial). If intolerant (cough): switch to sacubitril-valsartan (ARNI) or ARB (candesartan). Titrate every 2 weeks. Target dose maximised to best tolerated.',monitoring:'K+ and creatinine at 1-2 weeks post-start, then 3-6 monthly. BP.',gl:'ESC HF 2021 Class IA',contra:'K+>5.5, Bilateral RAS, angioedema, pregnancy',india:'Cardace 2.5mg ≈ ₹6-12/tablet.'},
        {generic:'Bisoprolol (beta-blocker)',brand_india:'Concor, Corbis',dose:'Start 1.25mg OD → target 10mg OD (titrate every 2 weeks)',route:'Oral',freq:'OD',duration:'Lifelong',class:'Beta-1 selective blocker',risk:'moderate',notes:'ESC 2021 Class IA. CIBIS-II trial: 34% ↓ mortality. Start LOW, titrate SLOW. NEVER start in decompensated/wet HF — wait until euvolaemic. Beta-blocker improves EF significantly over months.',monitoring:'HR (target 55-70 resting), BP, symptoms of decompensation at every dose uptitration.',gl:'ESC HF 2021 Class IA',contra:'Decompensated HF (wet), severe asthma, complete HB, HR<50, cardiogenic shock'},
        {generic:'Eplerenone (MRA)',brand_india:'Inspra, Eplenat',dose:'25mg OD → 50mg OD',route:'Oral',freq:'OD',duration:'Lifelong',class:'Mineralocorticoid receptor antagonist',risk:'high',notes:'ESC 2021 Class IA for EF≤35% with symptoms. EPHESUS trial: 15% ↓ mortality post-MI+HF. Spironolactone (Aldactone 25-50mg) is cheaper alternative — evidence from RALES trial. Eplerenone preferred in males (no gynaecomastia).',monitoring:'K+ and creatinine at 1, 4, 8 weeks after start then 6-monthly. STOP if K+>5.5.',gl:'ESC HF 2021 Class IA',contra:'K+>5.0 at initiation, eGFR<30, concomitant ACEi+ARB (triple RAAS avoid)',india:'Eplerenone 25mg ≈ ₹20-40/tablet. Spironolactone 25mg ≈ ₹5-10/tablet (cheaper alternative).'},
        {generic:'Empagliflozin (SGLT2i)',brand_india:'Jardiance, Empaglu',dose:'10mg OD',route:'Oral',freq:'OD (morning)',duration:'Lifelong',class:'SGLT2 inhibitor',risk:'moderate',notes:'ESC 2021 Class IA for HFrEF regardless of diabetes. EMPEROR-Reduced: 25% ↓ HF hospitalisation, 38% ↓ CV death/HF hospitalisation. Mechanism in HF: osmotic diuresis, reduced preload/afterload, metabolic effects. Does NOT require DM diagnosis.',monitoring:'eGFR (minimum 20 for initiation), genital hygiene. Withhold if unwell/dehydrated.',gl:'ESC HF 2021 Class IA add-on; AHA/ACC HF 2022',contra:'eGFR<20, T1DM, recurrent UTI',india:'Jardiance 10mg ≈ ₹35-60/tablet. PMBJP generic dapagliflozin available — Forxiga (generic) ≈ ₹30/tablet.'},
      ]},
      symptoms:{label:'Symptom Management',drugs:[
        {generic:'Furosemide',brand_india:'Lasix, Frusenex',dose:'20-40mg OD (up to 250mg in resistant oedema)',route:'Oral (IV in acute decompensation)',freq:'OD-BD',duration:'Ongoing, minimum effective dose',class:'Loop diuretic',risk:'moderate',notes:'Symptom control — NOT proven to reduce mortality but essential for congestion. Adjust dose to daily weight (target stable weight). Fluid restriction 1.5-2L/day. Low-salt diet.',monitoring:'Daily weight. Urea, creatinine, electrolytes weekly until stable. K+ (supplement if <3.5).',gl:'ESC HF 2021 Class IC diuretics for congestion',contra:'Anuria, allergy (sulfonamide cross-reactivity — rare)',india:'Lasix 40mg ≈ ₹5-10/tablet. Available at all levels of healthcare.'},
      ]},
    },
    monitoring:[
      {parameter:'Echocardiogram (EF)',frequency:'3-6 months after optimising quadruple therapy',target:'EF improvement (often from 20% → 40%)',action:'Persistent EF <35% on optimised therapy: ICD referral; consider CRT if QRS >130ms'},
      {parameter:'BNP / NT-proBNP',frequency:'At clinic visits + after dose changes',target:'NT-proBNP <1000 pg/mL',action:'>1000: uptitrate diuretics, check adherence, consider hospitalisation'},
      {parameter:'Daily weight',frequency:'Every morning before eating',target:'Stable weight ±1kg',action:'Weight gain >2kg in 2 days: double diuretic dose, contact clinic'},
      {parameter:'K+ and eGFR',frequency:'1-2 weeks after ACEi/MRA initiation or change; 3-monthly stable',target:'K+ 4.0-5.0, eGFR stable',action:'K+>5.5: halve MRA/ACEi. eGFR decline >30%: investigate'},
    ],
    referral:['Acute pulmonary oedema — ED emergency','EF <35% on optimised therapy → ICD referral (cardiology)','QRS >130ms + LBBB → CRT referral (cardiology)','Cardiogenic shock or refractory HF — advanced HF/transplant centre','New AF in HF — cardiology same day'],
    india_context:{cost:'Furosemide 40mg ≈ ₹5/tablet. Bisoprolol 5mg ≈ ₹8-20/tablet. Ramipril 5mg ≈ ₹6-12/tablet. SGLT2i adds ₹1000-1800/month.',prescribing:'Quadruple therapy not widely implemented in India at district level. Most patients receive ACEi + diuretic + BB. SGLT2i adoption increasing in private sector.',kerala:'Heart failure prevalence higher in Kerala due to CAD burden. Cardiology centres in Thiruvananthapuram, Ernakulam, Kozhikode have good HF programs.'},
  },

  depression: {
    id:'depression', name:'Major Depressive Disorder', icd10:'F32.9',
    systems:['ps'],
    gl_sources:[{name:'NICE NG222 2022',level:1},{name:'APA Depression 2022',level:1},{name:'BNF 86',level:4}],
    key_symptoms:['Persistent low mood','Anhedonia (loss of pleasure)','Fatigue / loss of energy','Sleep disturbance (insomnia or hypersomnia)','Psychomotor change (agitation or retardation)','Appetite/weight change','Concentration difficulties','Feelings of worthlessness / guilt','Suicidal ideation (ALWAYS screen)'],
    red_flags:['Active suicidal ideation with plan and intent — PSYCHIATRIC EMERGENCY','Recent serious attempt — requires inpatient assessment','Psychotic features (hallucinations/delusions) — psychotic depression','Severe self-neglect','Mania switching on antidepressant — bipolar disorder','Rapid cognitive decline — organic cause (dementia, hypothyroidism, tumour)'],
    dx_criteria:{name:'ICD-11 / DSM-5 — Major Depressive Episode',criteria:['≥5 symptoms for ≥2 weeks (must include 1. depressed mood OR 2. anhedonia)','1. Depressed mood most of the day nearly every day','2. Markedly diminished interest or pleasure (anhedonia)','3. Weight/appetite change (>5% in 1 month)','4. Sleep disturbance','5. Psychomotor change','6. Fatigue','7. Worthlessness/guilt','8. Concentration difficulty','9. Recurrent thoughts of death / suicidal ideation','PHQ-9 ≥10 = moderate depression; ≥20 = severe','Exclude: substance use, medical cause (thyroid, B12, DM)']},
    treatment:{
      mild:{label:'Mild Depression (PHQ-9 5-9) — Non-pharmacological First',drugs:[
        {generic:'Structured exercise programme',dose:'150 min moderate aerobic exercise/week × 12 weeks',route:'Non-drug',freq:'5×30 min/week',duration:'Ongoing',class:'Exercise therapy',risk:'low',notes:'NICE NG222 recommends structured exercise as first-line for mild depression. STAR*D trial and Cochrane meta-analysis: equal to antidepressants for mild-moderate depression. Social prescribing, sleep hygiene, problem-solving therapy alongside.',monitoring:'PHQ-9 at 4-6 weeks to assess response.',gl:'NICE NG222 Step 1-2'},
        {generic:'Cognitive Behavioural Therapy (CBT)',dose:'16 sessions (individual) or group CBT',route:'Psychological',freq:'Weekly sessions',duration:'16-20 weeks',class:'Psychotherapy',risk:'low',notes:'NICE NG222 Gold standard for all severities. Equal to or better than antidepressants for mild-moderate. Reduces relapse rates significantly. iCBT (online CBT) also effective for mild-moderate.',monitoring:'PHQ-9 + GAD-7 at each session.',gl:'NICE NG222 Recommended Treatment'},
      ]},
      moderate_severe:{label:'Moderate-Severe (PHQ-9 ≥10) — First-line SSRI',drugs:[
        {generic:'Sertraline',brand_india:'Zoloft, Sertima, Daxid',dose:'50mg OD start → 100mg-200mg OD target',route:'Oral',freq:'OD (morning)',duration:'6 months after full response (12 months if 2nd episode; indefinite if 3rd+)',class:'SSRI',risk:'moderate',notes:'NICE NG222 and CIPRIANI network meta-analysis 2018: sertraline has BEST efficacy AND tolerability of all antidepressants. First-line across all major depression severities. Takes 4-6 weeks for full effect. Counsel patient about initial anxiety/agitation (first 1-2 weeks). Sexual dysfunction in 20-30%.',monitoring:'PHQ-9 at 2 weeks, 4 weeks, 3 months. Suicidality monitoring in first 2 weeks (paradoxical activation — especially young adults). Na+ (SIADH risk in elderly).',gl:'NICE NG222 Grade A first-line',contra:'Concurrent MAOIs (serotonin syndrome — fatal), concurrent tramadol, lithium (serotonin syndrome risk)',india:'Daxid 50mg ≈ ₹15-25/tablet. Sertima 50mg ≈ ₹12-20/tablet. Generic sertraline available.'},
        {generic:'Escitalopram',brand_india:'Cipralex, Rexipra, Nexito',dose:'10mg OD start → 20mg OD target',route:'Oral',freq:'OD (morning or evening)',duration:'As above',class:'SSRI',risk:'moderate',notes:'CIPRIANI 2018: escitalopram tied with sertraline for best efficacy. Very well tolerated. Slightly more anxiolytic than sertraline — useful with comorbid anxiety. Fewer drug interactions than other SSRIs.',monitoring:'QTc at baseline if cardiac history (QT prolongation).',gl:'NICE NG222; CIPRIANI 2018 Grade A',contra:'QT prolongation, MAOIs, congenital long QT syndrome',india:'Nexito 10mg ≈ ₹25-35/tablet. Rexipra 10mg ≈ ₹20-30/tablet.'},
        {generic:'Venlafaxine',brand_india:'Venlor, Veniz XR, Effexor',dose:'75mg OD (XR) start → 150-225mg OD target',route:'Oral',freq:'OD (XR formulation)',duration:'As above',class:'SNRI',risk:'moderate',notes:'NICE NG222 second-line or when comorbid pain/anxiety. SNRI — dual action on serotonin and noradrenaline. More effective in severe depression than SSRIs. Can raise BP at higher doses. Discontinuation syndrome prominent — taper slowly.',monitoring:'BP (particularly at >150mg). Heart rate. Suicidality first 2 weeks. Withdrawal symptoms on stopping.',gl:'NICE NG222 second-line / comorbid pain-anxiety',contra:'Uncontrolled HTN, bipolar disorder (without mood stabiliser), MAOIs',india:'Venlor 75mg XR ≈ ₹15-25/tablet.'},
      ]},
      resistant:{label:'Treatment-Resistant Depression (2 adequate trials failed)',drugs:[
        {generic:'Mirtazapine (combination or augmentation)',brand_india:'Remeron, Mirtaz',dose:'15mg nocte (start) → 30-45mg target',route:'Oral',freq:'Nocte (sedating)',duration:'As above',class:'NaSSA',risk:'moderate',notes:'NICE NG222 augmentation or second antidepressant option. Particularly useful for depression with insomnia and poor appetite (stimulates appetite, sedating). California Rocket Fuel: mirtazapine + venlafaxine — highly effective combination. Weight gain a significant side effect.',monitoring:'Weight, BMI. Cholesterol (increased). Blood glucose.',gl:'NICE NG222 augmentation',india:'Mirtaz 15mg ≈ ₹15-25/tablet.'},
        {generic:'Lithium augmentation',brand_india:'Priadel, Licab',dose:'400mg BD start (check level at 5 days — target 0.6-1.0 mmol/L)',route:'Oral',freq:'BD',duration:'1-2 years (specialist)',class:'Mood stabiliser augmentation',risk:'high',notes:'NICE NG222 add-on to antidepressant for TRD. Narrow therapeutic index. Reduces suicide risk (Cipriani 2013 meta-analysis — Grade I evidence). Must be monitored by specialist.',monitoring:'Lithium level at day 5, 1 month, then 3-6 monthly. RFT and TFT 6-monthly (nephrotoxic, causes hypothyroidism).',gl:'NICE NG222 specialist-only augmentation',contra:'Renal impairment, dehydration, NSAIDs, low-sodium diet, pregnancy (Ebstein anomaly risk)',india:'Licab 300mg ≈ ₹5-8/tablet. Lithium monitoring not uniformly available at district level.'},
      ]},
    },
    monitoring:[
      {parameter:'PHQ-9 score',frequency:'At 2 weeks, 4 weeks, 3 months of treatment',target:'PHQ-9 <5 (remission)',action:'PHQ-9 unchanged at 4 weeks: uptitrate dose; unchanged at 8 weeks: switch drug'},
      {parameter:'Suicidality assessment',frequency:'Every visit (especially first 2-4 weeks of SSRI)',target:'No active SI',action:'Active SI + plan: psychiatric emergency referral'},
      {parameter:'PHQ-9 item 9 (suicidality)',frequency:'Every PHQ-9 administration',target:'Item 9 = 0',action:'Item 9 ≥1: direct suicidality assessment. ≥2: urgent psychiatric review'},
      {parameter:'Side effects (sexual, GI, sleep)',frequency:'2 weeks, 4 weeks',target:'Tolerable side effects',action:'Intolerable: switch to different SSRI or mirtazapine'},
      {parameter:'Serum sodium (Na+) — elderly',frequency:'2-4 weeks post-SSRI start in >65y',target:'Na+ ≥130 mmol/L',action:'Hyponatraemia (<125): stop SSRI, fluid restrict, medical review'},
    ],
    referral:['Active suicidal ideation with plan — psychiatric emergency SAME DAY','Psychotic depression — psychiatrist within days','Bipolar disorder suspected — psychiatrist (avoid starting SSRI alone)','Two antidepressant trials failed — psychiatrist for TRD assessment','Severe self-neglect — crisis mental health team'],
    india_context:{prevalence:'Depression prevalence India: 5-7% (WHO 2022); Kerala among highest in India due to migration, family disruption, high expectations. Increasing in young adults.',cost:'Sertraline 50mg ≈ ₹15-25/tablet. Escitalopram 10mg ≈ ₹20-35/tablet. Very affordable.',prescribing:'Psychiatry still stigmatised in rural India. Many depressed patients present to GP with somatic complaints (fatigue, headache). PHQ-9 screening by GP crucial.',icmr:'NMHP (National Mental Health Programme) India. iNMHNS survey: antidepressant prescribing by GPs is low relative to burden.'},
  },

});  // end Object.assign KB extension

// ── KB: Further conditions ─────────────────────────────────
Object.assign(CLINICAL_KB, {

  copd: {
    id:'copd', name:'COPD / Chronic Obstructive Pulmonary Disease', icd10:'J44.1',
    systems:['rs'],
    gl_sources:[{name:'GOLD 2024',level:1},{name:'NICE NG115 2019',level:1},{name:'BNF 86',level:4}],
    key_symptoms:['Progressive exertional dyspnoea','Chronic productive cough','Wheeze','Sputum production','Frequent respiratory infections','Barrel chest (emphysema)','Weight loss (severe disease)'],
    red_flags:['SpO2 <88% on air — consider NIV','Respiratory rate >30/min','Accessory muscle use','Cyanosis','Confusion / drowsiness (hypercapnia)','Failure to improve on max bronchodilators'],
    dx_criteria:{name:'GOLD 2024 — Post-bronchodilator Spirometry',criteria:['FEV1/FVC <0.70 post-bronchodilator (fixed ratio — GOLD criterion)','FEV1 ≥80% predicted: GOLD 1 (Mild)','FEV1 50-79%: GOLD 2 (Moderate)','FEV1 30-49%: GOLD 3 (Severe)','FEV1 <30%: GOLD 4 (Very Severe)','Symptoms ≥2/year: Group E — high risk of exacerbation','DO NOT diagnose COPD without spirometry']},
    treatment:{
      saba_sama:{label:'GOLD Group A — As-needed Reliever',drugs:[
        {generic:'Salbutamol (SABA)',brand_india:'Asthalin, Ventolin',dose:'100-200mcg (1-2 puffs)',route:'Inhaled MDI with spacer',freq:'PRN (as needed)',duration:'Ongoing',class:'Short-acting beta-2 agonist',risk:'low',notes:'GOLD 2024 Group A: as-needed SABA alone. Start with salbutamol before stepping to maintenance therapy.',monitoring:'HR, symptom response. PEFR if uncertain diagnosis.',gl:'GOLD 2024 Group A — Step 1',india:'Asthalin 100mcg MDI ≈ ₹60-90. Most widely available inhaler in India.'},
        {generic:'Ipratropium bromide (SAMA)',brand_india:'Ipravent, Atrovent',dose:'40mcg (2 puffs)',route:'Inhaled MDI',freq:'TDS-QDS PRN',duration:'Ongoing',class:'Short-acting muscarinic antagonist',risk:'low',notes:'Alternative to or combination with salbutamol. More bronchodilation than SABA alone when combined.',monitoring:'Urinary retention in elderly males (prostatic hyperplasia).',gl:'GOLD 2024 Group A alternative',india:'Ipravent MDI ≈ ₹120-180.'},
      ]},
      laba_lama:{label:'GOLD Group B — Dual Bronchodilator',drugs:[
        {generic:'Tiotropium (LAMA)',brand_india:'Spiriva Handihaler, Tiova',dose:'18mcg OD',route:'Inhaled (DPI Handihaler)',freq:'Once daily',duration:'Lifelong',class:'Long-acting muscarinic antagonist',risk:'low',notes:'GOLD 2024 Group B first-line. UPLIFT trial: reduces exacerbations, improves FEV1, QoL. Once daily — best for adherence. Tiova (Cipla) most used in India. Do NOT use in narrow-angle glaucoma.',monitoring:'Urinary retention, dry mouth, constipation (anticholinergic).',gl:'GOLD 2024 Group B preferred LAMA',contra:'Narrow-angle glaucoma, prostatic obstruction (caution)',india:'Tiova 18mcg ≈ ₹280-380/30-capsule. Tiova Rotacaps (DPI) widely available.'},
        {generic:'Formoterol + Glycopyrronium (LABA+LAMA)',brand_india:'Bevespi, Duaklir',dose:'9.6/7.2mcg BD or 5/12.5mcg OD',route:'Inhaled (pMDI or DPI)',freq:'BD or OD',duration:'Lifelong',class:'LABA + LAMA dual bronchodilator',risk:'low',notes:'GOLD 2024: LABA+LAMA preferred over LABA or LAMA alone for Group B patients. FLAME trial: LABA+LAMA superior to LABA+ICS for exacerbation prevention. Avoid ICS unless ≥2 exacerbations + blood eos ≥300.',monitoring:'HR, BP. Inhaler technique — critical.',gl:'GOLD 2024 Group B preferred combination',india:'LABA+LAMA FDC increasingly available in India (Tiotropium+Olodaterol = Stiolto). Tiova + Foradil separate remains common due to cost.'},
      ]},
      ics_add:{label:'GOLD Group E — Add ICS (≥2 Exacerbations OR eos ≥300)',drugs:[
        {generic:'Fluticasone furoate + Vilanterol + Umeclidinium',brand_india:'Trelegy Ellipta',dose:'92/22/55mcg OD',route:'Inhaled DPI (Ellipta)',freq:'Once daily',duration:'Reassess ICS need annually',class:'Triple inhaler (ICS+LABA+LAMA)',risk:'moderate',notes:'GOLD 2024 Group E triple therapy. IMPACT trial: triple > dual bronchodilator for exacerbation prevention. ICS increases pneumonia risk — balance against exacerbation reduction. DO NOT use ICS alone in COPD.',monitoring:'Annual spirometry. Bone density if long-term ICS. Pneumonia risk (monitor for fever, purulent sputum).',gl:'GOLD 2024 Group E escalation',contra:'Active/untreated TB, blood eosinophils <100 (ICS less likely to benefit)',india:'Trelegy Ellipta ≈ ₹2500-3500/inhaler (30 doses). Expensive. Seroflo + Tiova combination remains common in India.'},
      ]},
      acute_exacerbation:{label:'Acute Exacerbation (AECOPD)',drugs:[
        {generic:'Prednisolone',brand_india:'Wysolone, Omnacortil',dose:'30-40mg OD',route:'Oral',freq:'OD',duration:'5 days (GOLD 2024 — 5 days = 14 days, shorter course non-inferior)',class:'Oral corticosteroid',risk:'moderate',notes:'GOLD 2024: 5-day prednisolone course for AECOPD. Reduces treatment failure and length of stay. Treat with antibiotics only if purulent sputum (increased sputum + colour change).',monitoring:'Blood glucose (diabetics). BP.',gl:'GOLD 2024 AECOPD management Grade A',india:'Wysolone 10mg ≈ ₹3/tablet.'},
        {generic:'Amoxicillin-clavulanate',brand_india:'Augmentin',dose:'625mg TDS',route:'Oral',freq:'TDS',duration:'5-7 days',class:'Antibiotic (AECOPD)',risk:'low',notes:'GOLD 2024: antibiotics in AECOPD only if purulent sputum OR CRP >40. Amoxicillin-clavulanate or doxycycline or azithromycin. Reduces time to recovery.',monitoring:'GI tolerance. Diarrhoea (C. diff risk if prolonged).',gl:'GOLD 2024 AECOPD antibiotics — condition-dependent',india:'Augmentin 625mg ≈ ₹25-40/tablet.'},
        {generic:'Controlled oxygen',brand_india:'Piped/cylinder O2 with Venturi mask',dose:'Target SpO2 88-92%',route:'Inhaled (Venturi 24-28%)',freq:'Continuous',duration:'Until stable',class:'Oxygen therapy',risk:'moderate',notes:'CRITICAL: DO NOT give high-flow O2 to COPD patients — removes hypoxic drive → CO2 retention → respiratory arrest. Use Venturi mask: 24% (blue) for SpO2 target 88-90%. GOLD Class I.',monitoring:'SpO2 every 15 min. ABG if SpO2 not improving or altered consciousness.',gl:'GOLD 2024 AECOPD oxygen protocol Class I',contra:'High-flow O2 (>28% without SpO2 monitoring) is contraindicated in COPD with hypercapnia risk'},
      ]},
    },
    monitoring:[
      {parameter:'Spirometry (FEV1/FVC)',frequency:'At diagnosis + annually',target:'Assess decline rate',action:'Rapid decline (>50mL/year): optimise therapy, smoking cessation urgent'},
      {parameter:'mMRC/CAT score',frequency:'Every clinic visit',target:'mMRC <2, CAT <10',action:'CAT ≥10: step up therapy, pulmonary rehabilitation'},
      {parameter:'Exacerbation frequency',frequency:'Every visit (count per year)',target:'<2 moderate exacerbations/year',action:'≥2: add ICS, consider azithromycin prophylaxis (specialist)'},
      {parameter:'Blood eosinophils',frequency:'Annual FBC',target:'Guide ICS benefit: ≥300 = benefit likely',action:'<100: withdraw ICS; ≥300 with exacerbations: add ICS to LABA+LAMA'},
      {parameter:'SpO2 at rest and exertion',frequency:'Every visit',target:'SpO2 ≥92%',action:'<88% at rest: refer for LTOT assessment (pO2 <7.3 kPa = LTOT indicated)'},
    ],
    referral:['SpO2 <92% consistently — respiratory medicine for LTOT assessment','GOLD 3-4 on triple therapy — specialist; consider lung volume reduction surgery','Frequent exacerbations (≥3/year) on maximal therapy — specialist bronchoscopy + azithromycin consideration','Suspected alpha-1 antitrypsin deficiency (young, non-smoker, lower-lobe emphysema) — specialist testing','Palliative care referral if FEV1 <30% + poor QoL — early advance care planning'],
    india_context:{prevalence:'COPD affects 55 million Indians (GBD 2019). Kerala: 6-8% adults. Biomass fuel use (cooking on wood/cow dung) is a major non-smoking cause — affects rural women.',cost:'Tiova Rotacaps ≈ ₹280-380/month. Salbutamol MDI ≈ ₹60-90. LABA+LAMA combinations ≈ ₹600-900/month.',prescribing:'Overuse of ICS without spirometry in India is a significant problem (steroid side effects without benefit). GOLD algorithm should guide ICS use. Spirometry still underutilised in India.',icmr:'NTEP (National Tuberculosis Elimination Programme): COPD and TB co-morbidity common — spirometry post-TB essential.'},
  },

  gout: {
    id:'gout', name:'Gout / Hyperuricaemia', icd10:'M10.9',
    systems:['ms'],
    gl_sources:[{name:'EULAR Gout 2016',level:1},{name:'ACR Gout 2020',level:1},{name:'NICE NG219 2022',level:1},{name:'BNF 86',level:4}],
    key_symptoms:['Sudden severe joint pain (worst within hours)','Podagra — first metatarsophalangeal joint (big toe) — 50%','Warm, red, swollen joint','Fever (acute attack)','Tophi (chronic gout)','Renal stones (uric acid)'],
    red_flags:['Septic arthritis cannot be excluded — MUST aspirate hot single joint','Polyarticular gout in elderly — may mimic septic arthritis','Tophus ulceration — risk of secondary infection','Associated AKI (uric acid nephropathy)'],
    dx_criteria:{name:'ACR/EULAR 2015 Classification (also NICE NG219)',criteria:['Clinical: podagra + sudden onset + hyperuricaemia in at-risk male — >90% PPV','Definitive: monosodium urate (MSU) crystals in synovial fluid (negatively birefringent, needle-shaped) — gold standard','Serum urate >360 μmol/L (6 mg/dL) — NOTE: may be NORMAL during acute attack','X-ray: punched-out erosions with sclerotic margins (chronic gout)','Dual energy CT: urate deposits (specialist investigation)']},
    treatment:{
      acute:{label:'Acute Gout Attack Treatment',drugs:[
        {generic:'Naproxen',brand_india:'Naprosyn, Xenobid',dose:'500mg BD (with food)',route:'Oral',freq:'BD',duration:'5-7 days or until attack resolves',class:'NSAID',risk:'moderate',notes:'NICE NG219 / EULAR: first-line for acute gout. Full anti-inflammatory dose. Naproxen or diclofenac preferred over ibuprofen. Prescribe with omeprazole (GI protection). AVOID in CKD, anticoagulants, active GI ulcer.',monitoring:'RFT (NSAIDs + CKD risk). GI symptoms. BP (can raise).',gl:'NICE NG219 first-line; EULAR 2016 Grade A',contra:'CKD eGFR <30 (avoid NSAIDs), active peptic ulcer, warfarin (increases bleeding), heart failure',india:'Naprosyn 500mg ≈ ₹8-15/tablet.'},
        {generic:'Colchicine',brand_india:'Colchicine, Zycolchin',dose:'500mcg BD-TDS (NICE) — NOT 1mg loading + 0.5mg hourly (old regime — too toxic)',route:'Oral',freq:'BD-TDS (2-3× daily)',duration:'Until attack resolves (max 7-10 days)',class:'Anti-inflammatory (tubulin inhibitor)',risk:'moderate',notes:'NICE NG219: use colchicine when NSAIDs contraindicated. Low-dose regime (500mcg BD-TDS) equally effective to high-dose with less toxicity. Take within 24h of attack onset for best effect. P-glycoprotein inhibitors (ciclosporin, clarithromycin) — markedly increase colchicine toxicity.',monitoring:'GI toxicity (diarrhoea, vomiting — dose-limiting). RFT and LFT (toxicity in renal/hepatic impairment). FBC if prolonged use.',gl:'NICE NG219 second-line (NSAIDs contraindicated); EULAR 2016',contra:'eGFR <30 (significant toxicity risk), severe hepatic impairment, concurrent ciclosporin/clarithromycin',india:'Colchicine 500mcg ≈ ₹5-8/tablet.'},
        {generic:'Prednisolone',brand_india:'Wysolone, Omnacortil',dose:'30mg OD',route:'Oral',freq:'OD',duration:'3-5 days',class:'Oral corticosteroid',risk:'moderate',notes:'Use when both NSAIDs and colchicine contraindicated (e.g., CKD + anticoagulation). Can combine low-dose colchicine + prednisolone for polyarticular gout.',monitoring:'Blood glucose (diabetics). BP.',gl:'NICE NG219 third-line (NSAIDs + colchicine contraindicated)',india:'Widely available — Wysolone 10mg ≈ ₹3/tablet.'},
      ]},
      urate_lowering:{label:'Urate-Lowering Therapy (ULT) — Starting ≥2 attacks or tophi',drugs:[
        {generic:'Allopurinol',brand_india:'Zyloric, Allopurinol',dose:'Start 100mg OD → increase 100mg every 4 weeks → target serum urate <360 μmol/L (max 900mg/day)',route:'Oral',freq:'OD',duration:'Lifelong (once started)',class:'Xanthine oxidase inhibitor',risk:'moderate',notes:'NICE NG219 / ACR 2020 first-line ULT. Start AFTER acute attack resolves (NOT during). ALWAYS start with colchicine 500mcg OD-BD cover for 3-6 months to prevent acute attack flare. Check HLA-B*58:01 in Han Chinese, Thai, Korean before starting (severe hypersensitivity risk). Target urate <360 μmol/L; <300 if tophi.',monitoring:'Serum urate 4-weekly during titration, then 6-monthly. FBC, LFT, RFT. Skin rash (allopurinol hypersensitivity — can be severe/Stevens-Johnson).',gl:'NICE NG219 first-line ULT; ACR 2020',contra:'HLA-B*58:01 positive Han Chinese (relative — risk of SJS), concurrent azathioprine/6-MP (xanthine oxidase inhibitor blocks their metabolism → toxicity)',india:'Zyloric 100mg ≈ ₹5-8/tablet. Widely available. Most common urate-lowering drug in India.'},
        {generic:'Febuxostat',brand_india:'Feburic, Febucip',dose:'80mg OD (may increase to 120mg if target not met)',route:'Oral',freq:'OD',duration:'Lifelong',class:'Non-purine selective xanthine oxidase inhibitor',risk:'moderate',notes:'NICE NG219: use when allopurinol not tolerated or contraindicated. FAST trial: CV mortality signal (non-significant) — MHRA caution: avoid in established CVD or use only if no alternative. More expensive than allopurinol.',monitoring:'LFT, RFT, serum urate. CV risk monitoring.',gl:'NICE NG219 alternative to allopurinol',contra:'Established CVD (relative — MHRA warning based on FAST trial), concurrent azathioprine',india:'Feburic 40mg ≈ ₹15-25/tablet. Available but more expensive than allopurinol.'},
      ]},
    },
    monitoring:[
      {parameter:'Serum urate',frequency:'Every 4 weeks during allopurinol dose titration; 6-monthly when stable',target:'<360 μmol/L (6 mg/dL); <300 if tophi',action:'Above target at max tolerated dose: consider febuxostat or referral'},
      {parameter:'Attack frequency',frequency:'Patient diary + every clinic visit',target:'Zero acute attacks',action:'Breakthrough attacks on ULT: check compliance, serum urate, adequate prophylaxis with colchicine'},
      {parameter:'Renal function',frequency:'Annually (gout and renal disease coexist)',target:'eGFR stable',action:'Deteriorating eGFR: dose-adjust allopurinol + nephrology input'},
      {parameter:'Cardiovascular risk factors',frequency:'Annually',target:'BP <130/80, BMI <25, glucose normal',action:'Gout is a CV risk marker — treat all CV risk factors aggressively'},
    ],
    referral:['Cannot exclude septic arthritis — orthopaedics/rheumatology SAME DAY for aspiration','Tophi causing functional impairment — rheumatology/surgery','Recurrent gout on adequate ULT + target urate achieved — rheumatology (rare causes, pegloticase consideration)'],
    india_context:{prevalence:'Gout prevalence India: 0.12-0.67% (underreported). High-purine diet (red meat, shellfish, alcohol — beer particularly) common in urban India.',cost:'Allopurinol 100mg ≈ ₹5-8/tablet. Colchicine 500mcg ≈ ₹5-8/tablet. Very affordable management.',prescribing:'Colchicine often used at old toxic dosing regime in India — low-dose (500mcg BD) is now NICE/ACR standard. Allopurinol started without acute attack prophylaxis is a common error in India — always start colchicine cover.'},
  },

  uti: {
    id:'uti', name:'Urinary Tract Infection (UTI)', icd10:'N39.0',
    systems:['rn'],
    gl_sources:[{name:'NICE NG109 2018',level:1},{name:'EAU UTI Guidelines 2023',level:1},{name:'ICMR AMR 2022',level:1},{name:'BNF 86',level:4}],
    key_symptoms:['Dysuria (burning on urination)','Frequency of micturition','Urgency','Suprapubic pain/tenderness','Haematuria','Cloudy/offensive smelling urine','Upper UTI (pyelonephritis): loin pain, fever, rigors, vomiting, costovertebral angle tenderness'],
    red_flags:['Pyelonephritis in pregnancy — admit immediately','Urosepsis: fever + tachycardia + hypotension + UTI symptoms — sepsis protocol','Urological obstruction with UTI (blocked catheter, ureteric stone) — urological emergency','UTI in immunocompromised — broader empirical cover + cultures mandatory','Haematuria without other UTI features — consider malignancy (especially age >50)'],
    dx_criteria:{name:'NICE NG109 / EAU 2023',criteria:['Uncomplicated lower UTI: ≥2 of: dysuria, frequency, urgency + positive urine dipstick (nitrites or leucocytes) in non-pregnant women','Urine dipstick: nitrites 90% specific for gram-negative bacteria; leucocytes sensitive but not specific','MSU (mid-stream urine) culture: ≥10⁵ CFU/mL single organism','Upper UTI (pyelonephritis): LUTI symptoms + fever >38°C + loin pain + costovertebral tenderness','Complicated UTI: male, pregnancy, DM, structural abnormality, catheter, immunosuppression, hospital-acquired']},
    treatment:{
      uncomplicated_women:{label:'Uncomplicated Lower UTI — Non-pregnant Women',drugs:[
        {generic:'Nitrofurantoin (modified release)',brand_india:'Macrobid, Niftran MR',dose:'100mg BD',route:'Oral (with food)',freq:'BD',duration:'5 days',class:'Nitrofuran antibiotic',risk:'low',notes:'NICE NG109 first-line for uncomplicated LUTI in women. Excellent bladder penetration, low resistance. AVOID if eGFR <30 (inadequate urinary levels + peripheral neuropathy risk). Urine turns brown — warn patient.',monitoring:'RFT before prescribing. Avoid in last trimester of pregnancy (haemolysis risk).',gl:'NICE NG109 first-line; ICMR AMR rational prescribing',contra:'eGFR <30, G6PD deficiency, late pregnancy (38-42 weeks)',india:'Macrobid 100mg MR ≈ ₹30-60/course. Niftran MR available. Standard first-line now per ICMR AMR stewardship.'},
        {generic:'Trimethoprim',brand_india:'Monotrim, Septra (TMP alone)',dose:'200mg BD',route:'Oral',freq:'BD',duration:'7 days',class:'Antifolate antibiotic',risk:'low',notes:'NICE NG109 second-line due to increasing E. coli resistance (>20-25% in South India — check local antibiogram). Use first-line where nitrofurantoin not tolerated.',monitoring:'Local resistance patterns. K+ if on ACEi/ARB (trimethoprim raises K+).',gl:'NICE NG109 second-line',contra:'First trimester pregnancy (antifolate), K+>5.5 (raises serum K+)',india:'TMP 100-200mg ≈ ₹3-5/tablet. Common in India, but resistance high — always base on local data.'},
        {generic:'Ciprofloxacin',brand_india:'Cipro, Ciplox, Cifran',dose:'500mg BD',route:'Oral',freq:'BD',duration:'3 days (LUTI)',class:'Fluoroquinolone',risk:'moderate',notes:'NICE NG109: reserve fluoroquinolones for pyelonephritis or complicated UTI. Do NOT use for uncomplicated LUTI (stewardship — preserve for serious infections). ICMR AMR 2022 discourages routine use. High local resistance in India (ESBL organisms).',monitoring:'Tendon rupture risk (avoid in patients >60 on steroids). QTc.',gl:'Reserve — use for pyelonephritis or complicated UTI only',contra:'Pregnancy, epilepsy (lowers seizure threshold), QT prolongation, concurrent theophylline/warfarin',india:'Ciplox 500mg ≈ ₹8-15/tablet. Overused in India — major driver of fluoroquinolone resistance.'},
      ]},
      pyelonephritis:{label:'Pyelonephritis (Upper UTI)',drugs:[
        {generic:'Co-amoxiclav',brand_india:'Augmentin',dose:'625mg TDS',route:'Oral (or IV if unable to tolerate orally)',freq:'TDS',duration:'10-14 days',class:'Aminopenicillin + beta-lactamase inhibitor',risk:'moderate',notes:'EAU 2023: if local E. coli resistance to co-amoxiclav <20% — first-line for outpatient pyelonephritis. Blood cultures + urine culture before starting. Step-down from IV if started inpatient.',monitoring:'RFT, FBC, temperature. Response expected within 72h — no improvement = switch/admit.',gl:'EAU 2023 pyelonephritis first-line (if resistance <20%)'},
        {generic:'IV Ceftriaxone + step-down',brand_india:'Monocef, Rocephin',dose:'1-2g OD IV then oral step-down',route:'IV (inpatient), oral step-down when afebrile >24h',freq:'OD',duration:'IV 48-72h then oral 10-14 days total',class:'3rd generation cephalosporin',risk:'moderate',notes:'Hospitalised pyelonephritis, unable to tolerate orals, urosepsis. Step-down to oral cefuroxime or co-amoxiclav guided by culture results.',monitoring:'RFT, blood cultures, urine culture at 72h.',gl:'EAU 2023 hospitalised pyelonephritis',india:'Monocef 1g ≈ ₹60-150/vial.'},
      ]},
    },
    monitoring:[
      {parameter:'Urine dipstick/MSU',frequency:'After treatment if symptomatic recurrence (NOT routine test-of-cure for uncomplicated UTI)',target:'No significant bacteriuria',action:'Recurrent UTI (≥3/year in women): prophylactic low-dose nitrofurantoin or cranberry — refer for investigation'},
      {parameter:'Upper tract imaging',frequency:'Males with UTI: always. Females with: atypical features, recurrent, pyelonephritis that does not resolve',target:'No structural/functional abnormality',action:'Hydronephrosis/obstruction: urgent urology'},
      {parameter:'Renal function',frequency:'Annually in recurrent UTI + CKD',target:'eGFR stable',action:'Declining eGFR with recurrent UTI: nephrology + consider long-term prophylaxis'},
    ],
    referral:['Urosepsis — ED emergency (sepsis 6 protocol)','Pyelonephritis not improving at 72h — inpatient urology/ID','Recurrent UTI (≥3/year) in women — gynaecology/urology for investigation','All UTIs in males — urology (structural cause must be excluded)','Haematuria without UTI features — urgent urology (cancer 2-week wait if ≥50y + haematuria)'],
    india_context:{resistance:'E. coli resistance to fluoroquinolones: >50% in South India (ICMR AMR survey 2021). ESBL-producing organisms increasingly common in community. Culture-guided therapy essential.',cost:'Nitrofurantoin MR 100mg ≈ ₹4-6/capsule. Co-trimoxazole ≈ ₹2/tablet. Co-amoxiclav 625mg ≈ ₹25-40/tablet.',icmr:'ICMR AMR National Action Plan 2022 specifically discourages empirical fluoroquinolone use for LUTI. Nitrofurantoin/trimethoprim preferred per stewardship.',prescribing:'Overuse of ciprofloxacin for uncomplicated UTI in India is a major AMR driver. Fosfomycin 3g sachet single dose (not yet widely available in India) is NICE/EAU preferred — expected to become available.'},
  },

  anxiety: {
    id:'anxiety', name:'Generalised Anxiety Disorder (GAD)', icd10:'F41.1',
    systems:['ps'],
    gl_sources:[{name:'NICE NG197 2020',level:1},{name:'WFSBP Anxiety 2022',level:1},{name:'BNF 86',level:4}],
    key_symptoms:['Excessive worry (multiple domains)','Difficulty controlling the worry','Restlessness / on edge','Fatigue','Concentration difficulties','Irritability','Muscle tension','Sleep disturbance (difficulty initiating/maintaining)','Physical symptoms: palpitations, dyspnoea, tremor, GI upset (somatisation)'],
    red_flags:['Active suicidal ideation — psychiatric emergency','Mixed anxiety-depression with severe functional impairment','Psychosis emerging (rare)','Substance misuse driving anxiety','Undiagnosed medical cause (hyperthyroidism, phaeochromocytoma, arrhythmia — must exclude)'],
    dx_criteria:{name:'GAD-7 Screening + ICD-11 / DSM-5 Criteria',criteria:['GAD-7 score ≥10 = probable GAD (sensitivity 89%, specificity 82%)','GAD-7 5-9: mild anxiety; 10-14: moderate; ≥15: severe','ICD-11: excessive anxiety and worry ≥6 months, difficult to control, with ≥3 symptoms (restlessness, fatigue, concentration, irritability, tension, sleep)','EXCLUDE: medical causes — TFT (hyperthyroidism), ECG (arrhythmia), caffeine/substance use','Screen for comorbid depression (PHQ-9) — GAD + depression coexist in 60%']},
    treatment:{
      lifestyle:{label:'Step 1 — Self-Help + Lifestyle',drugs:[
        {generic:'Structured exercise + sleep hygiene',dose:'150 min/week moderate aerobic exercise + CBT-based sleep hygiene',route:'Non-drug',freq:'Daily',duration:'Ongoing',class:'Lifestyle intervention',risk:'low',notes:'NICE NG197 Step 1: exercise, sleep hygiene, reduce caffeine, alcohol. Psychoeducation about anxiety. Guided self-help or digital CBT (online CBT apps) — equally effective to therapist-delivered for mild-moderate GAD.',monitoring:'GAD-7 at 4 weeks.',gl:'NICE NG197 Step 1'},
      ]},
      psychotherapy:{label:'Step 2 — Psychological Therapy (Moderate GAD)',drugs:[
        {generic:'CBT (Cognitive Behavioural Therapy)',dose:'12-15 individual sessions',route:'Psychological',freq:'Weekly',duration:'12-15 weeks',class:'Psychotherapy',risk:'low',notes:'NICE NG197 Gold standard for GAD. Applied relaxation equally evidence-based (Öst relaxation technique). CBT reduces GAD-7 by 4-6 points. Exposure and response prevention for OCD comorbidity.',monitoring:'GAD-7 + PHQ-9 at each session.',gl:'NICE NG197 Step 2 recommended treatment'},
      ]},
      pharmacological:{label:'Step 3 — Pharmacological Treatment',drugs:[
        {generic:'Sertraline',brand_india:'Zoloft, Sertima, Daxid',dose:'50mg OD start → 100-200mg OD',route:'Oral',freq:'OD (morning)',duration:'6-12 months after full response, longer if recurrent',class:'SSRI',risk:'moderate',notes:'NICE NG197 first-line pharmacotherapy for GAD. CIPRIANI 2018: sertraline best tolerated and effective. Takes 4-6 weeks for full anxiolytic effect — counsel patient about delay. Initial anxiety worsening in first 1-2 weeks — warn about this and use low dose start.',monitoring:'GAD-7 at 4 weeks. Suicidality first 2 weeks (especially young adults). Na+ in elderly.',gl:'NICE NG197 first-line pharmacotherapy',contra:'MAOIs (serotonin syndrome), concurrent tramadol',india:'Daxid 50mg ≈ ₹15-25/tablet.'},
        {generic:'Pregabalin',brand_india:'Lyrica, Pregabalin',dose:'150mg BD start → 300-600mg/day total (BD-TDS)',route:'Oral',freq:'BD-TDS',duration:'Review at 3-6 months',class:'Calcium channel alpha-2-delta ligand',risk:'moderate',notes:'NICE NG197 alternative when SSRI not tolerated or insufficient. Faster onset than SSRIs (days not weeks). Dependence risk — scheduled drug (UK: Class C). Avoid in substance misuse history.',monitoring:'Dependence risk. Dizziness and sedation (dose-related). Weight gain.',gl:'NICE NG197 alternative to SSRI in GAD',contra:'History of substance misuse, pregabalin allergy',india:'Pregabalin 75mg ≈ ₹15-25/capsule. Available. Controlled substance in India.'},
        {generic:'Buspirone',brand_india:'Buspin, Busprex',dose:'5mg TDS start → 15-30mg/day in divided doses',route:'Oral',freq:'TDS',duration:'4-6 weeks to assess response',class:'Azapirone (partial 5-HT1A agonist)',risk:'low',notes:'Alternative for GAD without comorbid depression. NOT effective for panic disorder. Slow onset (1-2 weeks). No dependence risk. Does not interact with alcohol. Less effective than SSRIs overall.',monitoring:'BP (mild hypotension). No withdrawal.',gl:'EMA approved GAD; WFSBP',contra:'MAOIs, severe hepatic/renal impairment',india:'Buspin 5mg ≈ ₹5-10/tablet. Widely prescribed in India as anxiolytic.'},
      ]},
    },
    monitoring:[
      {parameter:'GAD-7 score',frequency:'At each clinic visit during treatment',target:'GAD-7 <5 (remission)',action:'GAD-7 ≥10 after 4 weeks on adequate dose: uptitrate or switch; no response at 8 weeks: refer for psychological therapy'},
      {parameter:'PHQ-9 (comorbid depression)',frequency:'Every 4-6 weeks',target:'PHQ-9 <5',action:'PHQ-9 ≥10: treat depression concurrently — sertraline covers both'},
      {parameter:'Side effects monitoring',frequency:'2 weeks + 4 weeks post-start',target:'Tolerable',action:'Intolerable: switch SSRI; sexual dysfunction common — consider sertraline switch if affects adherence'},
      {parameter:'Caffeine + alcohol intake',frequency:'Every visit',target:'Coffee <2 cups/day; alcohol within limits',action:'Excess caffeine is a major hidden anxiety driver — structured reduction often reduces GAD-7 by 3-4 points alone'},
    ],
    referral:['Active suicidal ideation — psychiatric emergency','GAD not responding to 2 SSRIs + CBT — psychiatry','Comorbid OCD, PTSD, social anxiety requiring specialist therapy — psychiatry','Substance misuse as driver of anxiety — dual diagnosis service'],
    india_context:{prevalence:'Anxiety disorders affect 38 million Indians (WHO 2022). Kerala has disproportionately high rates due to migration-related family separation, academic pressure, and social stressors.',cost:'Sertraline 50mg ≈ ₹15-25/tablet. Buspirone 5mg ≈ ₹5-10/tablet. CBT is free at government mental health clinics (DMHP/CMHP) in Kerala.',prescribing:'Benzodiazepines (diazepam, lorazepam, alprazolam) are extremely overused in India for anxiety — NICE recommends against use beyond 2-4 weeks due to dependence. Sertraline should replace benzodiazepines as first-line.',cultural:'Mental health stigma significant in Kerala. Anxiety commonly presents as somatic complaints to GPs. PHQ-4 (ultra-brief) can be used as opportunistic screen.'},
  },

  sepsis: {
    id:'sepsis', name:'Sepsis / Septic Shock', icd10:'A41.9',
    systems:['cv','rs'],
    gl_sources:[{name:'Surviving Sepsis Campaign 2021',level:1},{name:'NICE NG51 2016',level:1},{name:'ISCCM India Sepsis Guidelines 2020',level:1}],
    key_symptoms:['Fever (>38°C) or hypothermia (<36°C)','Tachycardia (>90/min)','Tachypnoea (>20/min or paCO2 <32)','Altered mental status / confusion','Hypotension (SBP <90 or MAP <65 — septic shock)','Rigors / chills','End-organ dysfunction: oliguria, rising creatinine, coagulopathy'],
    red_flags:['EVERY field is a red flag — sepsis is a medical emergency','qSOFA ≥2 → high risk of ICU admission/death','Lactate >2 mmol/L = occult shock even if BP normal','Capillary refill time >3 sec (tissue hypoperfusion)','Petechial rash (meningococcal sepsis) — benzylpenicillin immediately'],
    dx_criteria:{name:'Sepsis-3 / SOFA Score + NEWS2',criteria:['Sepsis: suspected infection + acute organ dysfunction (SOFA score increase ≥2)','Septic shock: sepsis + vasopressor requirement (noradrenaline) + lactate >2 mmol/L despite adequate fluid','qSOFA (quick SOFA): RR ≥22, altered mental status, SBP ≤100 — if ≥2: high mortality risk','NEWS2 score ≥5: activate sepsis pathway','NICE NG51: NEWS2 ≥5 OR clinical concern → give sepsis 6 within 1 hour']},
    treatment:{
      sepsis6:{label:'Sepsis 6 — Complete Within 1 Hour (SURVIVING SEPSIS 1-HOUR BUNDLE)',drugs:[
        {generic:'High-flow oxygen',brand_india:'Piped O2 / cylinder',dose:'Target SpO2 ≥94% (88-92% if COPD risk)',route:'Face mask (15L/min non-rebreather if shocked)',freq:'Continuous',duration:'Until stabilised',class:'Oxygen supplementation',risk:'low',notes:'Sepsis 6 Action 1. High-flow O2 immediately in septic shock. Downgrade when stable.',monitoring:'SpO2 continuous. ABG if not responding.',gl:'Surviving Sepsis 2021 — Bundle 1h'},
        {generic:'Blood cultures × 2 sets',brand_india:'Blood culture bottles',dose:'2 peripheral venepuncture sites (or central + peripheral)',route:'IV (blood draw)',freq:'BEFORE antibiotics if possible (<45 min delay)',duration:'Single',class:'Diagnostic (mandatory before antibiotics)',risk:'low',notes:'Sepsis 6 Action 2. Culture before antibiotics but DO NOT delay antibiotics >1 hour for cultures. Cultures enable de-escalation and targeted therapy.',monitoring:'Report at 48-72h. De-escalate based on cultures.',gl:'Surviving Sepsis 2021 — mandatory pre-antibiotic culture'},
        {generic:'Piperacillin-tazobactam (broad-spectrum empirical)',brand_india:'Tazact, Piptaz',dose:'4.5g IV q6-8h',route:'IV',freq:'6-8 hourly',duration:'Pending cultures (de-escalate at 48-72h)',class:'Broad-spectrum beta-lactam + beta-lactamase inhibitor',risk:'moderate',notes:'Sepsis 6 Action 3: IV broad-spectrum antibiotics within 1 hour. Pip-tazo covers gram-positive, gram-negative, anaerobes. If MRSA risk (hospitalised patient, skin/soft tissue): add IV vancomycin. De-escalate based on cultures at 48-72h — reduces resistance and side effects.',monitoring:'RFT, LFT. Therapeutic drug monitoring in AKI. 48-72h clinical review.',gl:'Surviving Sepsis 2021 Hour-1 Bundle',contra:'Pip-tazo allergy (penicillin allergy cross-reactivity 1-10% — use meropenem if anaphylaxis history)'},
        {generic:'IV crystalloid fluid resuscitation',brand_india:'Normal saline 0.9%, Ringer\'s lactate',dose:'30mL/kg crystalloid within 3 hours',route:'IV (large-bore cannula)',freq:'Bolus 250-500mL over 15-30 min, reassess, repeat to target MAP ≥65',duration:'Until MAP ≥65 or signs of fluid overload (raised JVP, crackles)',class:'IV fluid resuscitation',risk:'moderate',notes:'Sepsis 6 Action 4. Target: MAP ≥65 mmHg, urine output ≥0.5mL/kg/h. SAFE-TRIPS trial: balanced crystalloids (Ringer\'s lactate) may be preferable over 0.9% saline (less hyperchloraemic acidosis). Use dynamic measures to guide fluid beyond initial 30mL/kg (passive leg raise, pulse pressure variation).',monitoring:'BP every 5 min. Urine output hourly. JVP, lung bases (fluid overload). Lactate trend.',gl:'Surviving Sepsis 2021 — 30mL/kg crystalloid within 3h (Grade 1C)'},
        {generic:'Serum lactate measurement',brand_india:'ABG analyser / point-of-care lactate',dose:'Venous or arterial blood gas',route:'Blood sample',freq:'At presentation; repeat at 2h if ≥2mmol/L',duration:'Monitoring',class:'Diagnostic (lactate clearance)',risk:'low',notes:'Sepsis 6 Action 5. Lactate >2 = cryptic shock (tissue hypoperfusion despite normal BP). Lactate >4 = high mortality — ICU mandatory. Lactate clearance ≥10% at 2h = good prognostic sign.',monitoring:'Repeat at 2h and 6h. Target lactate clearance ≥10%.',gl:'Surviving Sepsis 2021 — lactate guided resuscitation'},
        {generic:'Urine output monitoring (catheterisation)',brand_india:'Urinary catheter',dose:'Urinary catheter insertion',route:'Urethral',freq:'Hourly urine output measurement',duration:'During acute resuscitation',class:'Monitoring (renal perfusion)',risk:'low',notes:'Sepsis 6 Action 6. Target urine output ≥0.5mL/kg/h. Oliguria (<0.5mL/kg/h) indicates renal hypoperfusion. Guides fluid resuscitation.',monitoring:'Hourly urine output. Creatinine trend.',gl:'Surviving Sepsis 2021'},
      ]},
      vasopressors:{label:'Vasopressors (Septic Shock: MAP <65 despite fluid)',drugs:[
        {generic:'Noradrenaline (norepinephrine)',brand_india:'Levophed, Noradrenaline injection',dose:'0.1-0.3 mcg/kg/min start (titrate to MAP ≥65)',route:'IV central line (central venous catheter preferred; short-term peripheral acceptable)',freq:'Continuous infusion',duration:'Until vasopressor independence',class:'Alpha+beta adrenergic vasopressor',risk:'high',notes:'Surviving Sepsis 2021 first-line vasopressor for septic shock. Titrate to MAP ≥65. Add vasopressin 0.03 units/min if high-dose noradrenaline (≥0.25 mcg/kg/min) required. Requires ICU/HDU monitoring.',monitoring:'Continuous BP monitoring (arterial line). Electrolytes. Peripheral ischaemia at high doses.',gl:'Surviving Sepsis 2021 Class 1C first-line vasopressor'},
      ]},
    },
    monitoring:[
      {parameter:'qSOFA / NEWS2',frequency:'On presentation + hourly until stable',target:'qSOFA 0, NEWS2 <5',action:'qSOFA ≥2: immediate senior review + ICU/HDU input'},
      {parameter:'Lactate',frequency:'0h, 2h, 6h',target:'<2 mmol/L; clearance ≥10%/2h',action:'Lactate >4 or not clearing: ICU admission, vasopressors'},
      {parameter:'Urine output',frequency:'Hourly (with catheter)',target:'≥0.5 mL/kg/h',action:'Oliguria despite resuscitation: AKI — nephrology/ICU'},
      {parameter:'Blood cultures',frequency:'Pre-antibiotic (within 45 min of antibiotic decision)',target:'Culture-positive: de-escalate',action:'Positive culture: switch to targeted antibiotic at 48-72h (antibiotic stewardship)'},
    ],
    referral:['Septic shock (MAP <65 on fluid) — ICU immediately','Sepsis with source requiring surgery (peritonitis, empyema, NF) — surgical emergency','Any patient with NEWS2 ≥5 — senior review within 30 minutes'],
    india_context:{burden:'Sepsis is the 3rd leading cause of death in India. Hospital mortality from septic shock: 40-60% in Indian ICUs (ISCCM registry 2019).',cost:'Piperacillin-tazobactam 4.5g ≈ ₹250-500/vial. Meropenem ≈ ₹400-800/vial. Noradrenaline ≈ ₹200-400/infusion.',prescribing:'Delayed antibiotic administration (>1 hour) is common in Indian hospitals — each hour of delay increases mortality by 7%. Blood cultures before antibiotics underperformed — key quality gap.',icmr:'ISCCM India Sepsis Guidelines 2020 adapted for Indian context. iSepsis (Indian Sepsis 6 protocol) mirrors international guidelines.'},
  },

});  // END KB extension 2

// ── Extend CONDITIONS scoring array with new KB conditions ─────
CONDITIONS.push(

  { id:'copd_exac', name:'COPD', systems:['rs'], tier:'t2', danger:false,
    triggers:['dyspnoea','cough'], w:{'dyspnoea':3,'cough':2,'wheeze':2,'exertional dyspnoea':2,'sputum':1,'smoking history':2},
    age:[45,90], gw:{M:1.3,F:0.9}, kerala:1.0,
    reason:'Progressive exertional dyspnoea + chronic cough in a smoker. Spirometry required (FEV1/FVC <0.7).',
    missing:'Pack-year smoking history, spirometry, prior exacerbation history.',
    gl:'GOLD 2024' },

  { id:'gout', name:'Gout', systems:['ms'], tier:'t1', danger:false,
    triggers:['joint pain'], w:{'joint pain':2,'swelling':2,'podagra':3,'sudden onset':2,'hot joint':2},
    age:[30,75], gw:{M:1.7,F:0.5}, kerala:1.1,
    reason:'Sudden hot swollen joint — particularly first MTP (big toe). Serum urate and joint aspiration confirm.',
    missing:'Joint location, onset speed, urate level, alcohol intake.',
    gl:'NICE NG219 2022 / EULAR 2016' },

  { id:'uti', name:'Urinary Tract Infection', systems:['rn'], tier:'t1', danger:false,
    triggers:['dysuria','frequency'], w:{'dysuria':3,'polyuria':2,'haematuria':2,'urgency':2,'loin pain':2,'fever':1},
    age:[15,80], gw:{M:0.5,F:1.6}, kerala:1.0,
    reason:'Dysuria + frequency ± haematuria — urine dipstick (nitrites/leucocytes) + MSU culture required.',
    missing:'Fever (upper vs lower UTI), pregnancy status, urine dipstick result.',
    gl:'NICE NG109 2018' },

  { id:'anxiety', name:'Anxiety Disorder / GAD', systems:['ps','cv','rs'], tier:'t1', danger:false,
    triggers:['anxiety','palpitations'], w:{'anxiety':3,'palpitations':2,'dyspnoea':2,'dizziness':1,'tingling':2,'panic attack':3,'insomnia':1},
    age:[15,60], gw:{M:0.7,F:1.5}, kerala:1.1,
    reason:'Episodic palpitations + dyspnoea + tingling with GAD-7 ≥10 — exclude cardiac first (ECG), then thyroid.',
    missing:'GAD-7 score, caffeine intake, triggers, duration, PHQ-9 (comorbid depression).',
    gl:'NICE NG197 2020' },

  { id:'sepsis', name:'Sepsis / Septic Shock', systems:['cv','rs'], tier:'t3', danger:true,
    triggers:['fever','tachycardia'], w:{'fever':3,'tachycardia':2,'confusion':3,'hypotension':3,'rigors':2,'dyspnoea':1,'oliguria':2},
    age:[1,95], gw:{M:1.0,F:1.0}, kerala:1.0,
    danger_why:'Surviving Sepsis 2021: each hour of antibiotic delay increases mortality 7%. NEWS2 ≥5 requires immediate sepsis 6 bundle.',
    reason:'Fever + tachycardia + altered consciousness = presumed sepsis. qSOFA ≥2 mandates emergency intervention.',
    missing:'Blood pressure, lactate, blood cultures, source of infection, urine output.',
    gl:'Surviving Sepsis Campaign 2021' },

);

CONDITIONS.push(
  { id:'dengue', name:'Dengue Fever', systems:['hm','cv'], tier:'t3', danger:true,
    triggers:['fever','rash'], w:{'fever':4,'myalgia':3,'headache':2,'rash':3,'arthralgia':3},
    age:[5,70], gw:{M:1.0,F:1.0}, kerala:3.0,
    danger_why:'Dengue haemorrhagic fever — NSAIDs absolutely contraindicated. Daily platelet monitoring required.',
    reason:'Sudden fever + myalgia + headache + thrombocytopenia in Kerala monsoon season.',
    missing:'NS1 Ag test, platelet count, haematocrit, warning sign screen.',
    gl:'WHO Dengue 2024 | NHM Kerala' },

  { id:'leptospirosis', name:'Leptospirosis', systems:['rs','gi'], tier:'t2', danger:false,
    triggers:['fever','myalgia'], w:{'myalgia':4,'fever':3,'jaundice':4,'oliguria':3,'flood exposure':5},
    age:[15,65], gw:{M:1.5,F:0.8}, kerala:2.5,
    reason:'Fever + calf myalgia + conjunctival suffusion + flood/soil exposure = leptospira until excluded.',
    missing:'Calf tenderness, conjunctival suffusion, flood/paddy exposure history, RFT, LFT.',
    gl:'WHO Leptospirosis 2021 | Kerala SOP' },

  { id:'scrub_typhus', name:'Scrub Typhus', systems:['rs','nr'], tier:'t2', danger:false,
    triggers:['fever'], w:{'fever':3,'prolonged fever':4,'eschar':8,'lymphadenopathy':4,'rash':3},
    age:[15,70], gw:{M:1.3,F:0.9}, kerala:2.0,
    reason:'Prolonged fever >7 days in Kerala forest/plantation area — check for eschar (search scalp, groin, axilla).',
    missing:'Eschar search, exposure history (forest/plantation), Weil-Felix OXK test.',
    gl:'NVBDCP Scrub Typhus Protocol' },

  { id:'typhoid', name:'Typhoid / Enteric Fever', systems:['gi','hm'], tier:'t1', danger:false,
    triggers:['fever'], w:{'fever':3,'step ladder fever':5,'headache':2,'abdominal pain':2,'bradycardia':4},
    age:[5,50], gw:{M:1.0,F:1.0}, kerala:1.8,
    reason:'Progressive step-ladder fever + relative bradycardia + abdominal pain. Blood culture before antibiotics.',
    missing:'Duration and pattern of fever, pulse-temperature correlation, abdominal tenderness, Widal/Typhidot.',
    gl:'WHO Typhoid 2018 | IAP 2022' },

  { id:'acute_gastroenteritis', name:'Acute Gastroenteritis', systems:['gi'], tier:'t1', danger:false,
    triggers:['diarrhoea','vomiting'], w:{'diarrhoea':5,'vomiting':3,'abdominal cramps':2,'nausea':2},
    age:[1,90], gw:{M:1.0,F:1.0}, kerala:1.5,
    reason:'Diarrhoea + vomiting. Assess dehydration. ORS + Zinc first-line. No routine antibiotics.',
    missing:'Dehydration assessment, stool character (bloody = dysentery), urine output.',
    gl:'WHO Diarrhoea 2017 | IAP | NHM' },

  { id:'osteoarthritis', name:'Osteoarthritis', systems:['ms'], tier:'t1', danger:false,
    triggers:['knee pain','joint pain'], w:{'knee pain':5,'joint pain':4,'crepitus':4,'stiffness':2},
    age:[45,90], gw:{M:0.8,F:1.3}, kerala:1.4,
    reason:'Activity-related joint pain + morning stiffness <30 minutes in patient >45y.',
    missing:'Duration, morning stiffness duration, previous joint X-ray, functional limitation.',
    gl:'NICE NG226 2022' },

  { id:'low_back_pain', name:'Non-Specific Low Back Pain', systems:['ms'], tier:'t1', danger:false,
    triggers:['back pain'], w:{'low back pain':5,'back pain':4,'lumbar pain':5},
    age:[25,80], gw:{M:1.0,F:1.0}, kerala:1.2,
    reason:'Mechanical back pain. Exclude red flags. Stay active — avoid bed rest.',
    missing:'Red flag screen (bladder/bowel/saddle), neurological examination, duration.',
    gl:'NICE NG59 2016' },
);

// Dedup CONDITIONS by id (prevent duplicate if CONDITIONS were already extended)
const _seenCondIds = new Set();
const CONDITIONS_DEDUPED = CONDITIONS.filter(c => {
  if (_seenCondIds.has(c.id)) return false;
  _seenCondIds.add(c.id);
  return true;
});
CONDITIONS.length = 0;
CONDITIONS.push(...CONDITIONS_DEDUPED);

// Update CMAP
Object.assign(CMAP, Object.fromEntries(CONDITIONS.map(c => [c.id, c])));

// ══════════════════════════════════════════════════════════════
// MODULE O — CLINICAL NOTES ENGINE
// Allows doctors to add structured notes per step, saves to session
// ══════════════════════════════════════════════════════════════

const CLINICAL_NOTES = {
  intake: '', history: '', examination: '', drugs: '', labs: '', impression: '',
};

function openNotesPanel() {
  const overlay = document.getElementById('notes-overlay');
  if (!overlay) return;
  document.getElementById('note-intake').value = CLINICAL_NOTES.intake || '';
  document.getElementById('note-impression').value = CLINICAL_NOTES.impression || '';
  document.getElementById('note-history').value = CLINICAL_NOTES.history || '';
  overlay.classList.add('open');
}

function closeNotesPanel() {
  const overlay = document.getElementById('notes-overlay');
  if (overlay) overlay.classList.remove('open');
}

function saveNotes() {
  CLINICAL_NOTES.intake      = (document.getElementById('note-intake')?.value     || '').trim();
  CLINICAL_NOTES.history     = (document.getElementById('note-history')?.value    || '').trim();
  CLINICAL_NOTES.impression  = (document.getElementById('note-impression')?.value || '').trim();
  closeNotesPanel();
  // Include notes in report
  if (S.step === 6 || S.unlockedSteps.has(6)) buildFullReport();
  notify('Notes saved ✓', 'ok');
}

// ══════════════════════════════════════════════════════════════
// MODULE P — FOLLOW-UP QUESTIONS ENGINE
// Generates condition-specific high-yield follow-up questions from KB
// ══════════════════════════════════════════════════════════════

const FOLLOW_UP_QUESTIONS_DB = {
  asthma:    ['Has the wheeze ever required hospital admission?','Any triggers identified — dust, exercise, animals, cold air?','Is the patient using the inhaler correctly (spacer)?','Night-time or early morning symptoms?','PEFR measured at home?'],
  hypertension: ['BP readings at home — average reading?','Family history of hypertension, stroke, or premature CAD?','Salt intake — pickles, pappad, processed food?','ABPM done at any point?','On NSAID or OCP (can drive BP up)?'],
  pcos:      ['Length and regularity of menstrual cycle currently?','Any breast discharge?','Fertility plans now or in near future?','Acanthosis nigricans (dark patches on neck)?','Previous pelvic USS done?'],
  t2dm:      ['Home glucose monitoring — frequency and readings?','Numbness or tingling in feet (neuropathy)?','Last eye check (fundoscopy)?','Last foot examination (monofilament)?','Complications screening up to date?'],
  hypothyroidism: ['Hair loss and cold intolerance severity?','Previous thyroid tests — TSH result?','Family history of thyroid disease?','Any neck swelling noticed?','On any supplements that could affect absorption (calcium, iron, PPIs)?'],
  migraine:  ['How many days per month with headache?','Aura before the headache — visual zigzags or tingling?','Using analgesics more than 10 days/month (MOH risk)?','OCP use (migraine with aura + OCP = high stroke risk)?','Stress or hormonal pattern to attacks?'],
  heart_failure: ['How many pillows to sleep?','Waking at night breathless (PND)?','Ankle swelling — measuring daily weight?','Last echocardiogram — EF reported?','Any recent hospitalisation for HF?'],
  depression: ['Any thoughts of self-harm or not wanting to be here?','Sleep pattern — early morning waking?','How are you functioning at work/relationships?','Previous antidepressant trial — which one, for how long?','Alcohol or substance use to cope?'],

  ckd:      ['eGFR result from last blood test?','Any swelling of ankles or face?','Urine – foamy, reduced, or blood-stained?','Diabetic or hypertensive for how long?','Family history of kidney disease?'],
  tb:       ['How long have you been coughing – weeks?','Any blood in the sputum?','Night sweats soaking through clothing?','Known TB contacts at home or work?','HIV test ever done?'],
  pulmonary_tb: ['How long have you been coughing – weeks?','Any blood in the sputum?','Night sweats soaking through clothing?','Known TB contacts at home or work?','HIV test ever done?'],
  af:       ['Does the irregular heartbeat come and go or is it always present?','Previous stroke or TIA?','Any anticoagulant prescribed before?','CHA₂DS₂-VASc risk factors — DM, HTN, HF?','Last ECG done?'],
  af_stroke_prevention: ['Does the irregular heartbeat come and go or is it always present?','Previous stroke or TIA?','Any anticoagulant prescribed before?','CHA₂DS₂-VASc risk factors — DM, HTN, HF?','Last ECG done?'],
  ectopic_pregnancy: ['Last menstrual period – date?','Positive pregnancy test?','Any shoulder tip pain?','Previous ectopic or PID history?','IUD or sterilisation in place?'],

  copd_exac:   ['Pack-year smoking history?','How far can you walk before stopping (exertional threshold)?','Hospitalisations for COPD in last year?','Currently using inhalers — which type and technique?','Oxygen at home?'],
  gout:      ['How much alcohol — type and frequency?','Which joint affected most recently?','On diuretics (furosemide — causes hyperuricaemia)?','Previous serum urate result?','Diet — red meat, shellfish, fructose drinks?'],
  anxiety:   ['Caffeine intake per day (cups of tea/coffee)?','Specific situations that trigger anxiety?','Affecting work or relationships significantly?','Any physical symptoms — palpitations, tremor, GI upset?','Life stressors currently — work, family, finances?'],
  uti:       ['Fever or loin pain (upper tract involvement)?','Pregnant or possibility of pregnancy?','Previous UTI — how many in last year?','Catheter in place?','Structural urinary tract problem known?'],
  sepsis:    ['When did the fever start — exact time?','Source of infection suspected — cough, urine, skin, surgical wound?','Recent procedure, surgery, or hospitalisation?','Immunocompromised — steroids, chemotherapy, HIV?','Urine output in last few hours?'],
};

function getFollowUpQuestions(conditionId) {
  const kbKey = KB_ID_MAP[conditionId] || conditionId;
  return FOLLOW_UP_QUESTIONS_DB[kbKey] || FOLLOW_UP_QUESTIONS_DB[conditionId] || [];
}

function renderFollowUpPanel() {
  const el = document.getElementById('live-followup');
  if (!el) return;

  const topConds = [...S.differential.t3, ...S.differential.t1].slice(0, 2);
  if (!topConds.length) { el.innerHTML = '<div style="color:var(--ink4);font-size:11.5px">Run analysis to generate questions.</div>'; return; }

  let html = '';
  for (const cond of topConds) {
    const qs = getFollowUpQuestions(cond.id);
    if (!qs.length) continue;
    html += `<div style="margin-bottom:10px">
      <div style="font-size:10px;font-weight:600;color:var(--ink3);text-transform:uppercase;letter-spacing:.5px;margin-bottom:5px">${esc(cond.name)}</div>
      ${qs.slice(0, 3).map((q, i) => `<div style="display:flex;gap:6px;padding:5px 0;border-bottom:1px solid var(--border);font-size:11.5px;color:var(--ink2)">
        <span style="font-family:var(--font-mono);font-size:9px;color:var(--accent);flex-shrink:0;padding-top:1px">Q${i+1}</span>
        <span>${esc(q)}</span>
      </div>`).join('')}
    </div>`;
  }

  el.innerHTML = html || '<div style="color:var(--ink4);font-size:11.5px">No follow-up questions available for current differential.</div>';
}

// ══════════════════════════════════════════════════════════════
// MODULE Q — INDIA DRUG COST ESTIMATOR
// ══════════════════════════════════════════════════════════════

const INDIA_COST_DB = {
  salbutamol:       { brand:'Asthalin 100mcg MDI',   cost_month: 90,  jan_aushadhi: true  },
  beclomethasone:   { brand:'Beclate 100mcg MDI',    cost_month: 150, jan_aushadhi: false },
  budesonide_form:  { brand:'Foracort 200/6 DPI',    cost_month: 420, jan_aushadhi: false },
  amlodipine:       { brand:'Amlodac 5mg',           cost_month: 75,  jan_aushadhi: true  },
  ramipril:         { brand:'Cardace 5mg',           cost_month: 300, jan_aushadhi: true  },
  losartan:         { brand:'Repace 50mg',           cost_month: 420, jan_aushadhi: true  },
  indapamide:       { brand:'Lorvas SR 1.5mg',       cost_month: 180, jan_aushadhi: false },
  metformin:        { brand:'Glycomet SR 500mg',     cost_month: 90,  jan_aushadhi: true  },
  glimepiride:      { brand:'Amaryl 2mg',            cost_month: 120, jan_aushadhi: true  },
  empagliflozin:    { brand:'Jardiance 10mg',        cost_month: 1800,jan_aushadhi: false },
  semaglutide:      { brand:'Ozempic 1mg pen',       cost_month: 3500,jan_aushadhi: false },
  atorvastatin:     { brand:'Tonact 10mg',           cost_month: 60,  jan_aushadhi: true  },
  levothyroxine:    { brand:'Thyronorm 50mcg',       cost_month: 70,  jan_aushadhi: true  },
  sertraline:       { brand:'Daxid 50mg',            cost_month: 375, jan_aushadhi: false },
  escitalopram:     { brand:'Nexito 10mg',           cost_month: 750, jan_aushadhi: false },
  allopurinol:      { brand:'Zyloric 100mg',         cost_month: 120, jan_aushadhi: true  },
  colchicine:       { brand:'Zycolchin 500mcg',      cost_month: 150, jan_aushadhi: false },
  tiotropium:       { brand:'Tiova Rotacaps',        cost_month: 380, jan_aushadhi: false },
  nitrofurantoin:   { brand:'Macrobid 100mg MR',     cost_month: 180, jan_aushadhi: false },
  letrozole:        { brand:'Letoval 2.5mg',         cost_month: 250, jan_aushadhi: false },
  sumatriptan:      { brand:'Suminat 50mg',          cost_month: 300, jan_aushadhi: false },
  amitriptyline:    { brand:'Tryptomer 25mg',        cost_month: 90,  jan_aushadhi: true  },
  furosemide:       { brand:'Lasix 40mg',            cost_month: 60,  jan_aushadhi: true  },
  bisoprolol:       { brand:'Concor 5mg',            cost_month: 300, jan_aushadhi: false },
  spironolactone:   { brand:'Aldactone 25mg',        cost_month: 120, jan_aushadhi: false },
  aspirin:          { brand:'Ecosprin 75mg',         cost_month: 30,  jan_aushadhi: true  },
  clopidogrel:      { brand:'Deplatt 75mg',          cost_month: 180, jan_aushadhi: true  },
};

function getCostEstimate(genericName) {
  const key = Object.keys(INDIA_COST_DB).find(k =>
    genericName.toLowerCase().includes(k.toLowerCase())
  );
  return key ? INDIA_COST_DB[key] : null;
}

function renderCostRow(drugEntry) {
  const cost = getCostEstimate(drugEntry.drug?.generic || '');
  if (!cost) return '';
  return `<div style="display:flex;gap:8px;align-items:center;padding:5px 0;border-bottom:1px solid var(--border);font-size:11.5px">
    <span style="flex:1;color:var(--ink2)">${esc(drugEntry.drug?.generic?.split(' ')[0] || '')}</span>
    <span style="font-family:var(--font-mono);color:var(--accent)">₹${cost.cost_month}/month</span>
    ${cost.jan_aushadhi ? '<span class="badge badge-ok" style="font-size:8px">Jan Aushadhi</span>' : ''}
  </div>`;
}



const S_RX = {
  selectedDrugs: [],   // [{id, drug (KB entry), condName, lineLabel}]
  patientName: '',
  diagnosis: '',
  doctorName: 'Dr.',
  clinicName: 'Cureocity Clinical',
};

function buildPrescriptionSelector() {
  const el = document.getElementById('rx-builder-content');
  if (!el) return;

  const allConds = [...S.differential.t3, ...S.differential.t1, ...S.differential.t2].slice(0,4);
  const hasConds = allConds.some(c => lookupKB(c.id));

  if (!hasConds) {
    el.innerHTML = '<div class="empty-state"><div class="empty-state-icon">💊</div>No KB protocols found for top differential conditions. Complete Assessment first.</div>';
    return;
  }

  // Patient info strip
  const pt = S.patient;
  document.getElementById('rx-pt-demo').textContent = `${pt.age||'?'}y ${pt.gender==='F'?'F':pt.gender==='M'?'M':'—'}`;
  document.getElementById('rx-date').textContent = new Date().toLocaleDateString('en-IN');
  const topCond = allConds[0];
  const topKB = lookupKB(topCond?.id);
  document.getElementById('rx-diagnosis').textContent = topKB ? topKB.name : (topCond?.name || '—');
  S_RX.diagnosis = topKB ? topKB.name : (topCond?.name || '—');

  // Patient name input
  let selectorHtml = `
    <div class="card" style="margin-bottom:14px">
      <div class="card-head"><div class="card-title">👤 Patient Details for Prescription</div></div>
      <div class="card-body">
        <div class="row2">
          <div class="field"><div class="field-label"><label>Patient Name</label></div>
            <input type="text" id="rx-pt-name-input" placeholder="Mr./Mrs. …" oninput="updateRxPatient(this.value)">
          </div>
          <div class="field"><div class="field-label"><label>Doctor Name</label></div>
            <input type="text" id="rx-doctor-input" placeholder="Dr. …" value="${esc(S_RX.doctorName)}" oninput="S_RX.doctorName=this.value">
          </div>
        </div>
      </div>
    </div>
    <div class="card" style="margin-bottom:14px">
      <div class="card-head"><div class="card-title">📋 Select Drugs from Protocols</div><div class="card-sub">Click to add to prescription pad</div></div>
      <div class="card-body p0" style="padding:12px">`;

  for (const cond of allConds) {
    const kb = lookupKB(cond.id);
    if (!kb) continue;
    selectorHtml += `<div class="rx-selector-card" style="margin-bottom:10px">
      <div class="rx-selector-head" onclick="toggleRxSelector('rxsel-${cond.id}')">
        <div class="rx-selector-title">
          <span style="font-size:14px">${sysEmoji(kb.systems)}</span>
          ${esc(kb.name)}
          <span class="badge badge-ok" style="font-size:8px">${(kb.gl_sources||[]).slice(0,1).map(s=>s.name).join('')}</span>
        </div>
        <span style="font-size:10px;color:var(--ink4)" id="rxsel-toggle-${cond.id}">▼</span>
      </div>
      <div id="rxsel-${cond.id}" style="display:none">`;

    for (const [lineKey, line] of Object.entries(kb.treatment||{})) {
      selectorHtml += `<div style="padding:10px 14px;border-top:1px solid var(--border)">
        <div style="font-size:9.5px;font-weight:700;color:var(--ink3);text-transform:uppercase;letter-spacing:.8px;margin-bottom:8px">${esc(line.label)}</div>`;

      for (const [di, drug] of (line.drugs||[]).entries()) {
        const drugId = `${cond.id}_${lineKey}_${di}`;
        const isSelected = S_RX.selectedDrugs.some(d => d.id === drugId);
        selectorHtml += `<div class="rx-drug-option ${isSelected?'selected':''}" onclick="toggleRxDrug('${drugId}','${esc(cond.id)}','${esc(lineKey)}',${di})">
          <div>
            <div class="rx-opt-name">${esc(drug.generic)}</div>
            <div class="rx-opt-dose">${esc(drug.dose)} · ${esc(drug.freq)} · ${esc(drug.duration)}</div>
            ${drug.brand_india ? `<div class="rx-opt-india">🇮🇳 ${esc(drug.brand_india.split(',')[0].trim())}</div>` : ''}
          </div>
          <span class="badge ${drug.risk==='high'?'badge-danger':drug.risk==='moderate'?'badge-warn':'badge-ok'}" style="font-size:8px">${(drug.risk||'low').toUpperCase()}</span>
          <span style="font-size:18px;color:${isSelected?'var(--ok)':'var(--border2)'}">${isSelected?'✓':'+'}</span>
        </div>`;
      }
      selectorHtml += '</div>';
    }
    selectorHtml += '</div></div>';
  }

  selectorHtml += '</div></div>';
  el.innerHTML = selectorHtml;

  document.getElementById('rx-pad-section').style.display = 'block';
  renderRxPad();
}

function toggleRxSelector(id) {
  const body = document.getElementById(id);
  const condId = id.replace('rxsel-', '');
  const toggle = document.getElementById(`rxsel-toggle-${condId}`);
  if (body) {
    const isOpen = body.style.display !== 'none';
    body.style.display = isOpen ? 'none' : 'block';
    if (toggle) toggle.textContent = isOpen ? '▼' : '▲';
  }
}

function toggleRxDrug(drugId, condId, lineKey, drugIndex) {
  const kb = lookupKB(condId);
  if (!kb) return;
  const line = kb.treatment?.[lineKey];
  const drug = line?.drugs?.[drugIndex];
  if (!drug) return;

  const existingIdx = S_RX.selectedDrugs.findIndex(d => d.id === drugId);
  if (existingIdx >= 0) {
    S_RX.selectedDrugs.splice(existingIdx, 1);
  } else {
    S_RX.selectedDrugs.push({ id: drugId, drug, condName: kb.name, lineLabel: line.label, condId });
  }

  renderRxPad();
  checkRxSafety();
  buildPrescriptionSelector();  // re-render to update selected state
}

function renderRxPad() {
  const items = document.getElementById('rx-drug-list-items');
  const countBadge = document.getElementById('rx-drug-count');
  if (!items) return;

  countBadge.textContent = `${S_RX.selectedDrugs.length} item${S_RX.selectedDrugs.length !== 1 ? 's' : ''}`;

  if (!S_RX.selectedDrugs.length) {
    items.innerHTML = '<div style="padding:16px 0;text-align:center;color:var(--ink4);font-size:12px">Select drugs above to add to prescription pad.</div>';
    return;
  }

  items.innerHTML = S_RX.selectedDrugs.map((sel, i) => {
    const cost = getCostEstimate(sel.drug.generic || '');
    return `
    <div class="rx-item">
      <div class="rx-item-num">${i + 1}</div>
      <div>
        <div class="rx-item-name">${esc(sel.drug.generic)}</div>
        <div class="rx-item-detail">${esc(sel.drug.route)} · ${esc((sel.drug.notes || sel.condName).slice(0, 70))}…</div>
        ${sel.drug.brand_india ? `<div style="font-size:10.5px;color:var(--info);margin-top:2px">🇮🇳 ${esc(sel.drug.brand_india.split(',')[0])}</div>` : ''}
        ${cost ? `<div style="font-size:10px;color:var(--accent);font-family:var(--font-mono);margin-top:2px">₹${cost.cost_month}/month${cost.jan_aushadhi?' · <span style="color:var(--ok)">Jan Aushadhi ✓</span>':''}</div>` : ''}
      </div>
      <div class="rx-item-dose">${esc(sel.drug.dose)}</div>
      <div class="rx-item-duration">${esc(sel.drug.duration)}</div>
      <button class="rx-item-remove" onclick="removeRxDrug('${sel.id}')">✕</button>
    </div>`;
  }).join('');

  // Total cost estimate
  let totalCost = 0;
  let allCosted = true;
  for (const sel of S_RX.selectedDrugs) {
    const cost = getCostEstimate(sel.drug.generic || '');
    if (cost) totalCost += cost.cost_month;
    else allCosted = false;
  }
  if (S_RX.selectedDrugs.length > 0) {
    items.innerHTML += `<div style="padding:10px 16px;background:var(--surface2);border-top:1.5px solid var(--border);display:flex;align-items:center;justify-content:space-between">
      <span style="font-size:11px;color:var(--ink3)">Estimated monthly cost${allCosted?'':' (partial)'}</span>
      <span style="font-family:var(--font-mono);font-size:13px;font-weight:600;color:var(--accent)">₹${totalCost.toLocaleString('en-IN')}/month</span>
    </div>`;
  }
}

function removeRxDrug(id) {
  S_RX.selectedDrugs = S_RX.selectedDrugs.filter(d => d.id !== id);
  renderRxPad();
  checkRxSafety();
  buildPrescriptionSelector();
}

function updateRxPatient(val) {
  S_RX.patientName = val;
  document.getElementById('rx-pt-name').textContent = val || '—';
}

function checkRxSafety() {
  const el = document.getElementById('rx-safety-alerts');
  if (!el) return;

  // Check selected drugs against interaction DB
  const fakeDrugs = S_RX.selectedDrugs.map(d => ({ name: d.drug.generic }));
  const ix = checkInteractions(fakeDrugs);

  // Also check selected drugs against existing patient meds
  const allDrugs = [...fakeDrugs, ...S.drugs];
  const allIx = checkInteractions(allDrugs);
  const newIx = allIx.filter(i => {
    const inSelected = i.matchedDrugs.some(d => fakeDrugs.some(fd => mapDrugToKey(fd.name) === d));
    return inSelected;
  });

  // Check contraindications
  const contraAlerts = [];
  for (const sel of S_RX.selectedDrugs) {
    if (!sel.drug.contra) continue;
    // Check against active conditions / comorbidities
    const contraLower = sel.drug.contra.toLowerCase();
    const corpus = S.corpus || '';
    if ((contraLower.includes('renal') || contraLower.includes('egfr')) && corpus.includes('chronic kidney disease')) {
      contraAlerts.push({ drug: sel.drug.generic, message: `Renal contraindication: ${sel.drug.contra.slice(0, 100)}` });
    }
    if (contraLower.includes('pregnancy') && S.patient.gender === 'F' && corpus.includes('pregnant')) {
      contraAlerts.push({ drug: sel.drug.generic, message: `Pregnancy contraindication: ${sel.drug.contra.slice(0, 100)}` });
    }
    if (contraLower.includes('asthma') && corpus.includes('asthma') && sel.drug.generic.toLowerCase().includes('beta')) {
      contraAlerts.push({ drug: sel.drug.generic, message: `Asthma contraindication: beta-blockers can precipitate bronchospasm in asthma.` });
    }
  }

  if (!allIx.length && !contraAlerts.length) {
    el.style.display = 'block';
    el.innerHTML = `<div class="rx-safety-banner ok" style="margin-bottom:10px">✓ No drug interactions or contraindications detected for selected prescription.</div>`;
    return;
  }

  el.style.display = 'block';
  let html = '';
  if (contraAlerts.length) {
    html += contraAlerts.map(a => `<div class="rx-safety-banner danger">⛔ <div><strong>${esc(a.drug)}</strong> — ${esc(a.message)}</div></div>`).join('');
  }
  if (allIx.length) {
    html += allIx.map(i => `<div class="rx-safety-banner ${i.sev === 'high' ? 'danger' : 'warn'}">
      ${i.sev === 'high' ? '⛔' : '⚠️'} <div>
        <strong>${i.matchedDrugs.map(d=>d.charAt(0).toUpperCase()+d.slice(1)).join(' + ')}</strong> — ${esc(i.desc)}
        <div style="font-size:11px;margin-top:3px;opacity:.85">${esc(i.resolution)}</div>
      </div>
    </div>`).join('');
  }
  el.innerHTML = html;
}

function clearPrescription() {
  if (S_RX.selectedDrugs.length && !confirm('Clear all selected drugs?')) return;
  S_RX.selectedDrugs = [];
  renderRxPad();
  const safeEl = document.getElementById('rx-safety-alerts');
  if (safeEl) safeEl.style.display = 'none';
  buildPrescriptionSelector();
}

function generateFinalPrescription() {
  if (!S_RX.selectedDrugs.length) { notify('Add at least one drug to the prescription pad first.', 'warn'); return; }

  const pt = S.patient;
  const today = new Date().toLocaleDateString('en-IN', { day:'2-digit', month:'long', year:'numeric' });
  const ptName = S_RX.patientName || 'Patient';
  const ptDemo = `${pt.age || '?'}y ${pt.gender === 'F' ? 'Female' : pt.gender === 'M' ? 'Male' : ''}`;
  const diagnosis = S_RX.diagnosis;

  // Advice items from conditions
  const adviceItems = [];
  const seenAdvice = new Set();
  for (const sel of S_RX.selectedDrugs) {
    const kb = lookupKB(sel.condId);
    if (!kb) continue;
    if (kb.india_context?.dietary && !seenAdvice.has('diet')) { adviceItems.push(kb.india_context.dietary); seenAdvice.add('diet'); }
    if (sel.drug.monitoring) adviceItems.push(`Monitor: ${sel.drug.monitoring.split('.')[0]}.`);
    if (adviceItems.length >= 4) break;
  }

  // Follow-up
  const followupDays = S.redFlags.length > 0 ? '3-5' : '14';

  const rxHtml = `
    <div class="rx-final" id="final-rx-output">
      <div class="rx-final-header">
        <div>
          <div class="rx-final-title">Prescription</div>
          <div style="font-size:16px;font-weight:700;letter-spacing:-.3px">${esc(S_RX.clinicName)}</div>
          <div style="font-size:12px;color:rgba(255,255,255,.65);margin-top:2px">${esc(S_RX.doctorName)}</div>
        </div>
        <div style="text-align:right">
          <div style="font-size:11px;color:rgba(255,255,255,.5)">Date</div>
          <div style="font-size:13px;font-weight:600">${today}</div>
        </div>
      </div>
      <div class="rx-final-body">
        <div class="rx-final-patient">
          <div><div class="rx-field-label">Patient</div><div style="font-size:13px;font-weight:600">${esc(ptName)}</div></div>
          <div><div class="rx-field-label">Age / Sex</div><div style="font-size:13px;font-weight:600">${esc(ptDemo)}</div></div>
          <div><div class="rx-field-label">Diagnosis</div><div style="font-size:13px;font-weight:600">${esc(diagnosis)}</div></div>
        </div>

        <div style="font-size:28px;color:var(--ink);font-weight:700;margin-bottom:12px;opacity:.15;letter-spacing:-1px">℞</div>

        ${S_RX.selectedDrugs.map((sel, i) => {
          const prefix = getFormPrefix(sel.drug.route, sel.drug.generic);
          const timing = mapToIndianTiming(sel.drug.freq, sel.drug.route);
          const brand = sel.drug.brand_india ? sel.drug.brand_india.split(',')[0].trim() : '';
          return `
          <div class="rx-final-drug">
            <div class="rx-final-rnum">${i + 1}.</div>
            <div style="flex:1">
              <div class="rx-final-dname">${esc(prefix)} ${esc(sel.drug.generic)} <span style="font-size:13px;font-weight:500;color:var(--ink2)">${esc(sel.drug.dose)}</span></div>
              ${brand ? `<div style="font-size:11.5px;color:var(--info);margin-bottom:4px">Brand: ${esc(brand)}</div>` : ''}
              <div class="rx-final-sig" style="display:flex;align-items:center;gap:10px;flex-wrap:wrap">
                <span style="font-family:var(--font-mono);font-size:15px;font-weight:800;background:rgba(0,0,0,.07);padding:2px 10px;border-radius:4px">${esc(timing)}</span>
                <span style="color:var(--ink2)">${esc(sel.drug.route)}</span>
                <em style="color:var(--ink2)">${esc(sel.drug.duration)}</em>
              </div>
              ${sel.drug.notes ? `<div style="font-size:11px;color:var(--ink4);margin-top:3px;font-style:italic">${esc(sel.drug.notes.slice(0,100))}${sel.drug.notes.length>100?'…':''}</div>` : ''}
            </div>
            <div style="text-align:right;flex-shrink:0">
              <span class="badge ${sel.drug.risk==='high'?'badge-danger':sel.drug.risk==='moderate'?'badge-warn':'badge-ok'}" style="font-size:8px">${(sel.drug.risk||'low').toUpperCase()}</span>
            </div>
          </div>`; }).join('')}

        ${adviceItems.length ? `
          <div class="rx-advice-block">
            <div class="rx-advice-title">Patient Advice &amp; Instructions</div>
            ${adviceItems.map(a => `<div class="rx-advice-item">${esc(a)}</div>`).join('')}
            <div class="rx-advice-item">Return in ${followupDays} days for review${S.redFlags.length ? ' — or sooner if symptoms worsen' : ''}.</div>
          </div>` : ''}
      </div>
      <div class="rx-final-footer">
        <div>Generated by Cureocity Clinical Assistant · For physician use only</div>
        <div>Signature: _______________</div>
      </div>
    </div>
    <div class="btn-row" style="margin-top:14px">
      <button class="btn btn-primary" onclick="window.print()">🖨️ Print Prescription</button>
      <button class="btn btn-secondary" onclick="document.getElementById('final-rx-output').remove();document.getElementById('rx-pad-section').style.display='block'">← Edit</button>
    </div>`;

  const padSection = document.getElementById('rx-pad-section');
  padSection.style.display = 'none';
  const existing = document.getElementById('final-rx-output');
  if (existing) existing.remove();
  document.getElementById('rx-builder-content').insertAdjacentHTML('afterend', rxHtml);
  notify('Prescription generated ✓', 'ok');
}

function printReport() { window.print(); }

// ══════════════════════════════════════════════════════════════
// MODULE N — ASSESSMENT TABS + TREATMENT TAB + FULL REPORT
// ══════════════════════════════════════════════════════════════

function switchAssessTab(tab, btn) {
  document.querySelectorAll('.assess-tab').forEach(b => b.classList.remove('active'));
  document.querySelectorAll('.assess-tab-pane').forEach(p => p.classList.remove('active'));
  if (btn) btn.classList.add('active');
  const pane = document.getElementById(`assess-${tab}`);
  if (pane) pane.classList.add('active');
  // Lazy-build tabs on first access
  if (tab === 'treatment') {
    const el = document.getElementById('treatment-content');
    if (el && el.querySelector('.empty-state')) buildTreatmentTab();
  }
  if (tab === 'report') {
    const el = document.getElementById('report-content');
    if (el && el.querySelector('.empty-state')) buildFullReport();
  }
  // AI tab — update data preview
  if (tab === 'ai') {
    const pt = S.patient || {};
    const preview = document.getElementById('ai-data-preview');
    if (preview) {
      const sympCount = (S.structuredSymptoms||[]).length;
      const labCount = Object.values(S.labs||{}).filter(v=>v).length;
      const gapCount = (S.gaps||[]).filter(g=>g.value).length;
      preview.textContent = pt.age
        ? `Case loaded: ${pt.age}y ${pt.gender==='F'?'Female':pt.gender==='M'?'Male':'Unknown'} · ${sympCount} symptoms · ${gapCount} history items · ${labCount} labs`
        : 'No patient data — complete Step 1 first';
    }
  }
}

function _base_buildTreatmentTab() {
  const el = document.getElementById('treatment-content');
  if (!el) return;

  const allConds = [...S.differential.t3, ...S.differential.t1, ...S.differential.t2].slice(0,3);
  let html = '';

  for (const cond of allConds) {
    const kb = lookupKB(cond.id);
    if (!kb) continue;

    const sources = (kb.gl_sources||[]).map(s =>
      `<span class="gl-source ${'gl-'+s.level}" style="font-size:8.5px">L${s.level} ${esc(s.name)}</span>`).join('');

    html += `<div class="card" style="margin-bottom:14px">
      <div class="card-head">
        <div class="card-title">${sysEmoji(kb.systems)} ${esc(kb.name)} — Treatment Protocols</div>
        <div style="display:flex;flex-wrap:wrap;gap:3px">${sources}</div>
      </div>
      <div class="card-body p0">`;

    for (const [lineKey, line] of Object.entries(kb.treatment||{})) {
      const lineClass = lineKey.includes('step1') || lineKey.includes('mild') || lineKey.includes('lifestyle') ? 'tx-line1' :
                        lineKey.includes('step2') || lineKey.includes('moderate') ? 'tx-line2' :
                        lineKey.includes('step3') || lineKey.includes('severe') || lineKey.includes('icu') ? 'tx-alt' : 'tx-non';
      const badgeText = lineKey.includes('step1') || lineKey.includes('lifestyle') ? '1st LINE' :
                        lineKey.includes('step2') ? '2nd LINE' :
                        lineKey.includes('resistant') || lineKey.includes('step3') ? '3rd LINE' : 'SPECIALIST';

      html += `<div class="tx-section ${lineClass}" style="margin:14px 14px 0">
        <div class="tx-section-title">
          <span class="tx-badge">${badgeText}</span>
          ${esc(line.label)}
        </div>
        <table class="drug-table" style="margin-bottom:14px">
          <tr><th>Drug (Generic)</th><th>Dose</th><th>Route/Freq</th><th>Duration</th><th>Risk</th><th>Key Notes</th></tr>
          ${(line.drugs||[]).map(d => `
            <tr>
              <td><div class="drug-name-cell">${esc(d.generic)}</div>${d.brand_india?`<div style="font-size:10px;color:var(--info)">🇮🇳 ${esc(d.brand_india.split(',')[0])}</div>`:''}</td>
              <td class="drug-dose-cell">${esc(d.dose||'—')}</td>
              <td style="font-size:11.5px">${esc(d.route||'—')} / ${esc(d.freq||'—')}</td>
              <td style="font-size:11.5px">${esc(d.duration||'—')}</td>
              <td><span class="drug-risk-tag drug-risk-${d.risk==='high'?'high':d.risk==='moderate'?'mod':'low'}">${(d.risk||'low').toUpperCase()}</span></td>
              <td class="drug-notes-cell">${esc((d.notes||'').slice(0,90))}${(d.notes||'').length>90?'…':''}</td>
            </tr>`).join('')}
        </table>
      </div>`;
    }

    // Monitoring table
    if (kb.monitoring?.length) {
      html += `<div style="margin:14px">
        <div style="font-size:9.5px;font-weight:700;color:var(--ink3);text-transform:uppercase;letter-spacing:.8px;margin-bottom:8px">Monitoring Parameters</div>
        <table class="monitor-table">
          <tr><th>Parameter</th><th>Frequency</th><th>Target</th><th>If Abnormal</th></tr>
          ${kb.monitoring.map(m=>`<tr><td><strong>${esc(m.parameter)}</strong></td><td>${esc(m.frequency)}</td><td style="color:var(--ok)">${esc(m.target)}</td><td style="color:var(--warn)">${esc(m.action)}</td></tr>`).join('')}
        </table>
      </div>`;
    }

    // India context
    if (kb.india_context) {
      html += `<div class="india-box" style="margin:14px">
        <div class="india-box-title">🇮🇳 India / Kerala Context</div>
        ${Object.entries(kb.india_context).map(([k,v])=>
          `<div style="font-size:11.5px;color:var(--ink2);padding:4px 0;border-bottom:1px solid rgba(10,122,110,.1)">
            <span style="font-family:var(--font-mono);font-size:8.5px;color:var(--accent);text-transform:uppercase;margin-right:6px">${esc(k.replace(/_/g,' '))}</span>${esc(v)}</div>`).join('')}
      </div>`;
    }

    html += '</div></div>';
  }

  if (!html) html = '<div class="empty-state"><div class="empty-state-icon">💊</div>No KB entries available for the top differential conditions.</div>';
  el.innerHTML = html;
}

function buildFullReport() {
  const el = document.getElementById('report-content');
  if (!el) return;

  const pt = S.patient;
  const today = new Date().toLocaleString('en-IN');
  const filled = S.gaps.filter(g => g.value);
  const allConds = [...S.differential.t3, ...S.differential.t1, ...S.differential.t2];

  const examSummaryRows = Object.entries(S.examFindings)
    .flatMap(([sysId, findings]) => Object.entries(findings).filter(([,v])=>v)
      .map(([k,v]) => `<tr><td style="color:var(--ink3)">${esc(sysId.toUpperCase())} · ${esc(k.replace(/_/g,' '))}</td><td>${esc(v)}</td></tr>`))
    .join('');

  const labRows = Object.entries(S.labs)
    .filter(([,v])=>v)
    .map(([k,v]) => {
      const allDefs = Object.values(LAB_DEFS).flat();
      const def = allDefs.find(d=>d.key===k);
      const status = def ? getLabStatus(v, def) : 'normal';
      const color = status==='critical'?'var(--danger)':status==='abnormal-high'?'var(--warn)':status==='abnormal-low'?'var(--info)':'var(--ink)';
      return `<tr><td style="color:var(--ink3)">${def?.name||k}</td><td style="color:${color};font-weight:${status!=='normal'?'600':'400'}">${esc(v)} ${esc(def?.unit||'')}</td><td>${esc(def?.ref?.join(' – ')||'—')}</td></tr>`;
    }).join('');

  el.innerHTML = `
    <div class="card">
      <div class="card-head"><div class="card-title">📄 Complete Clinical Report</div><div class="card-sub">${today}</div></div>
      <div class="card-body">

        <div class="report-section">
          <div class="report-section-title">1. Patient &amp; Chief Complaint</div>
          <table style="width:100%;font-size:12.5px;border-collapse:collapse">
            <tr><td style="color:var(--ink3);width:150px">Patient</td><td><strong>${pt.age||'?'}y ${pt.gender==='F'?'Female':pt.gender==='M'?'Male':pt.gender||'—'}</strong></td></tr>
            <tr><td style="color:var(--ink3)">Comorbidities</td><td>${esc(pt.comorbid||'None documented')}</td></tr>
            <tr><td style="color:var(--ink3)">Chief Complaint</td><td style="font-style:italic">${esc(S.rawInput||'—')}</td></tr>
            <tr><td style="color:var(--ink3)">Systems Active</td><td>${Object.keys(S.activeSystems).map(id=>SYSTEMS[id]?.name||id).join(', ')||'—'}</td></tr>
            <tr><td style="color:var(--ink3)">Confidence</td><td>${S.certainty}%</td></tr>
          </table>
        </div>

        ${S.redFlags.length ? `<div class="report-section">
          <div class="report-section-title" style="color:var(--danger)">⚑ 2. Red Flags Detected</div>
          ${S.redFlags.map(f=>`<div style="padding:6px 0;font-size:12.5px;color:var(--danger);display:flex;gap:7px;border-bottom:1px solid var(--border)"><span>⚑</span>${esc(f.msg)}</div>`).join('')}
        </div>` : ''}

        ${filled.length ? `<div class="report-section">
          <div class="report-section-title">3. Clinical History</div>
          <table style="width:100%;font-size:12.5px;border-collapse:collapse">
            ${filled.map(g=>`<tr style="border-bottom:1px solid var(--border)"><td style="color:var(--ink3);padding:5px 0;width:160px">${esc(g.label)}</td><td style="padding:5px 0">${esc(g.value)}</td></tr>`).join('')}
          </table>
        </div>` : ''}

        ${examSummaryRows ? `<div class="report-section">
          <div class="report-section-title">4. Examination Findings</div>
          <table style="width:100%;font-size:12.5px;border-collapse:collapse">
            ${examSummaryRows}
          </table>
        </div>` : ''}

        ${getVitalsSummary().length ? `<div class="report-section">
          <div class="report-section-title">4b. Vital Signs</div>
          <div style="display:grid;grid-template-columns:repeat(4,1fr);gap:6px">
            ${getVitalsSummary().map(v => `<div style="padding:7px 10px;border-radius:var(--r);background:${v.status==='critical'?'var(--cv-t)':v.status==='warning'||v.status==='high'?'var(--warn-t)':'var(--surface2)'};border:1px solid ${v.status==='critical'?'rgba(192,57,43,.3)':v.status!=='normal'?'rgba(184,106,0,.25)':'var(--border)'}">
              <div style="font-size:9px;font-weight:600;color:var(--ink3);text-transform:uppercase;margin-bottom:2px">${esc(v.label)}</div>
              <div style="font-family:var(--font-mono);font-size:14px;font-weight:600;color:${v.status==='critical'?'var(--danger)':v.status!=='normal'?'var(--warn)':'var(--ink)'}">${esc(v.value)}</div>
              <div style="font-size:9px;color:var(--ink4)">${esc(v.unit)}</div>
            </div>`).join('')}
          </div>
        </div>` : ''}

        <div class="report-section">
          <div class="report-section-title">5. Differential Diagnosis</div>
          ${allConds.map((c,i) => {
            const tier = c.tier === 't3' ? '<span class="badge badge-danger">MUST NOT MISS</span>' :
                         c.tier === 't2' ? '<span class="badge badge-info">POSSIBLE</span>' :
                         '<span class="badge badge-ok">MOST LIKELY</span>';
            return `<div style="display:flex;gap:10px;padding:7px 0;border-bottom:1px solid var(--border);font-size:12.5px;align-items:center">
              <span style="font-family:var(--font-mono);color:var(--ink4);font-size:11px;min-width:20px">${i+1}.</span>
              <strong>${esc(c.name)}</strong>
              ${tier}
              ${c.score && c.score < 900 ? `<span style="font-family:var(--font-mono);font-size:10px;color:var(--ink4);margin-left:auto">score ${c.score.toFixed(1)}</span>` : ''}
            </div>`;
          }).join('')}
        </div>

        ${S.drugs.length ? `<div class="report-section">
          <div class="report-section-title">6. Medications (${S.drugs.length})</div>
          ${S.drugs.map(d=>`<div style="font-size:12.5px;padding:5px 0;border-bottom:1px solid var(--border)">${esc(d.name)} <span style="font-family:var(--font-mono);font-size:11px;color:var(--ink3)">${esc(d.dose||'')} · ${esc(d.duration||'')}</span></div>`).join('')}
          ${S.interactions.length ? `<div style="margin-top:8px;padding:8px 12px;background:var(--warn-t);border-radius:var(--r);font-size:12px;color:var(--warn)">${S.interactions.length} interaction(s) detected — see Step 4 for details.</div>` : ''}
        </div>` : ''}

        ${labRows ? `<div class="report-section">
          <div class="report-section-title">7. Lab Results</div>
          <table style="width:100%;font-size:12.5px;border-collapse:collapse">
            <tr><th style="text-align:left;color:var(--ink3);font-size:9.5px;text-transform:uppercase;padding:5px 0;border-bottom:1.5px solid var(--border)">Test</th><th style="text-align:left;color:var(--ink3);font-size:9.5px;text-transform:uppercase;padding:5px 0;border-bottom:1.5px solid var(--border)">Result</th><th style="text-align:left;color:var(--ink3);font-size:9.5px;text-transform:uppercase;padding:5px 0;border-bottom:1.5px solid var(--border)">Reference</th></tr>
            ${labRows}
          </table>
        </div>` : ''}

        <div class="report-section">
          <div class="report-section-title">8. Next Steps</div>
          ${S.nextSteps.map((s,i)=>`<div style="display:flex;gap:10px;padding:6px 0;border-bottom:1px solid var(--border);font-size:12.5px"><span style="font-family:var(--font-mono);font-size:10px;color:var(--ink4);min-width:20px">${i+1}.</span><span style="color:${s.urgency==='urgent'?'var(--danger)':s.urgency==='important'?'var(--warn)':'var(--ink2)'}">${s.icon} ${esc(s.action)}</span></div>`).join('')}
        </div>

        ${S_RX.selectedDrugs.length ? `<div class="report-section">
          <div class="report-section-title">9. Prescription Summary</div>
          ${S_RX.selectedDrugs.map((sel,i)=>`<div style="font-size:12.5px;padding:6px 0;border-bottom:1px solid var(--border)"><strong>${i+1}. ${esc(sel.drug.generic)}</strong> — ${esc(sel.drug.dose)} · ${esc(sel.drug.route)} · ${esc(sel.drug.freq)} · <em>${esc(sel.drug.duration)}</em></div>`).join('')}
        </div>` : ''}

        ${(CLINICAL_NOTES.intake || CLINICAL_NOTES.history || CLINICAL_NOTES.impression) ? `<div class="report-section">
          <div class="report-section-title">10. Doctor's Clinical Notes</div>
          ${CLINICAL_NOTES.intake ? `<div style="margin-bottom:10px"><div style="font-size:10px;font-weight:700;color:var(--ink3);text-transform:uppercase;letter-spacing:.5px;margin-bottom:4px">Presenting Complaint Summary</div><div style="font-size:12.5px;color:var(--ink2);line-height:1.6;padding:8px 12px;background:var(--surface2);border-radius:var(--r);border-left:3px solid var(--accent)">${esc(CLINICAL_NOTES.intake)}</div></div>` : ''}
          ${CLINICAL_NOTES.history ? `<div style="margin-bottom:10px"><div style="font-size:10px;font-weight:700;color:var(--ink3);text-transform:uppercase;letter-spacing:.5px;margin-bottom:4px">History &amp; Examination</div><div style="font-size:12.5px;color:var(--ink2);line-height:1.6;padding:8px 12px;background:var(--surface2);border-radius:var(--r);border-left:3px solid var(--en)">${esc(CLINICAL_NOTES.history)}</div></div>` : ''}
          ${CLINICAL_NOTES.impression ? `<div><div style="font-size:10px;font-weight:700;color:var(--ink3);text-transform:uppercase;letter-spacing:.5px;margin-bottom:4px">Clinical Impression &amp; Plan</div><div style="font-size:12.5px;color:var(--ink2);line-height:1.6;padding:8px 12px;background:var(--surface2);border-radius:var(--r);border-left:3px solid var(--ok)">${esc(CLINICAL_NOTES.impression)}</div></div>` : ''}
        </div>` : ''}

      </div>
    </div>`;
}

// ══════════════════════════════════════════════════════════════
// LIVE KB SEARCH (sidebar)
// ══════════════════════════════════════════════════════════════

function kbSearchLive(q) {
  const resultsEl = document.getElementById('kb-search-results');
  if (!resultsEl) return;
  if (!q || q.length < 2) { resultsEl.style.display = 'none'; return; }

  const qLow = q.toLowerCase();
  const matches = Object.values(CLINICAL_KB).filter(kb =>
    kb.name.toLowerCase().includes(qLow) ||
    (kb.key_symptoms||[]).some(s => s.toLowerCase().includes(qLow)) ||
    (kb.icd10||'').toLowerCase().includes(qLow)
  ).slice(0, 6);

  if (!matches.length) { resultsEl.style.display = 'none'; return; }

  resultsEl.style.display = 'block';
  resultsEl.innerHTML = matches.map(kb => `
    <div class="kb-search-result" onclick="openKBModal('${kb.id}'); document.getElementById('kb-search-input').value=''; document.getElementById('kb-search-results').style.display='none'">
      <span style="font-size:13px">${sysEmoji(kb.systems)}</span>
      <div>
        <div style="font-size:12.5px;font-weight:600;color:var(--ink)">${esc(kb.name)}</div>
        <div style="font-size:10px;color:var(--ink4)">${esc(kb.icd10||'')} · ${(kb.gl_sources||[]).slice(0,1).map(s=>s.name).join('')}</div>
      </div>
    </div>`).join('');
}



/**
 * Map condition IDs from CONDITIONS array to CLINICAL_KB keys
 */
const KB_ID_MAP = {
  asthma: 'asthma', asthma_exac: 'asthma',
  hypertension: 'hypertension',
  pcos: 'pcos',
  nstemi_ua: 'nstemi', stemi: 'nstemi',
  hypothyroid: 'hypothyroidism',
  t2dm: 't2dm',
};

// Extend KB_ID_MAP
Object.assign(KB_ID_MAP, {
  copd_exac: 'copd', gout: 'gout', uti: 'uti', anxiety: 'anxiety', sepsis: 'sepsis',
  dengue: 'dengue', leptospira: 'leptospirosis', leptospirosis: 'leptospirosis',
  scrub_typhus: 'scrub_typhus', typhoid: 'typhoid', enteric_fever: 'typhoid',
  gastroenteritis: 'acute_gastroenteritis', diarrhoea: 'acute_gastroenteritis',
  oa_knee: 'osteoarthritis', osteoarthritis: 'osteoarthritis',
  back_pain: 'low_back_pain', low_back_pain: 'low_back_pain',
  sah: 'sah', meningitis: 'meningitis', nstemi_ua: 'nstemi', stemi: 'nstemi',
  pneumonia: 'pneumonia', iron_deficiency: 'iron_deficiency_anaemia',
  iron_deficiency_anaemia: 'iron_deficiency_anaemia',
  migraine: 'migraine', heart_failure: 'heart_failure', depression: 'depression',
});


function lookupKB(conditionId) {
  const kbKey = KB_ID_MAP[conditionId] || conditionId;
  return CLINICAL_KB[kbKey] || null;
}

function openKBModal(conditionId) {
  const kb = lookupKB(conditionId);
  if (!kb) { notify('No detailed protocol available for this condition', 'warn'); return; }

  const modal = document.getElementById('kb-modal');
  const title = document.getElementById('kb-modal-title');
  const sub   = document.getElementById('kb-modal-sub');
  const body  = document.getElementById('kb-modal-body');

  title.textContent = kb.name;
  sub.textContent   = `ICD-10: ${kb.icd10 || '—'} · ${(kb.gl_sources||[]).map(s=>s.name).join(' · ')}`;
  body.innerHTML    = renderKBDetail(kb);
  modal.classList.add('open');
}

function openKBBrowser() {
  const modal = document.getElementById('kb-browser-modal');
  const list  = document.getElementById('kb-browser-list');
  list.innerHTML = Object.values(CLINICAL_KB).map(kb => `
    <div class="kb-search-result" onclick="openKBModal('${kb.id}'); document.getElementById('kb-browser-modal').classList.remove('open')">
      <span style="font-size:14px">${sysEmoji(kb.systems)}</span>
      <div style="flex:1">
        <div style="font-size:13px;font-weight:600;color:var(--ink)">${esc(kb.name)}</div>
        <div style="font-size:11px;color:var(--ink4);font-family:var(--font-mono)">${esc(kb.icd10||'—')} · ${(kb.gl_sources||[]).slice(0,2).map(s=>s.name).join(' · ')}</div>
      </div>
      <div style="font-size:10px;color:var(--ink4)">→</div>
    </div>`).join('');
  modal.classList.add('open');
}

function sysEmoji(systems) {
  const map = { cv:'❤️', rs:'🫁', en:'⚗️', nr:'🧠', gi:'🫄', hm:'🩸', ms:'🦴', ps:'🧠' };
  return (systems||[]).map(s => map[s]||'💊').join('');
}

function filterKBBrowser(query) {
  const q = (query||'').toLowerCase();
  const list = document.getElementById('kb-browser-list');
  if (!list) return;
  if (!q) { openKBBrowser(); return; }
  list.innerHTML = Object.values(CLINICAL_KB).filter(kb =>
    kb.name.toLowerCase().includes(q) ||
    (kb.key_symptoms||[]).some(s=>s.toLowerCase().includes(q)) ||
    (kb.icd10||'').toLowerCase().includes(q)
  ).map(kb => `
    <div class="kb-search-result" onclick="openKBModal('${kb.id}'); document.getElementById('kb-browser-modal').classList.remove('open')">
      <span style="font-size:14px">${sysEmoji(kb.systems)}</span>
      <div style="flex:1"><div style="font-size:13px;font-weight:600">${esc(kb.name)}</div><div style="font-size:11px;color:var(--ink4)">${esc(kb.icd10||'')} · ${(kb.gl_sources||[]).slice(0,2).map(s=>s.name).join(' · ')}</div></div>
      <div style="font-size:10px;color:var(--ink4)">→</div>
    </div>`).join('') || '<div style="padding:20px;text-align:center;color:var(--ink4);font-size:12.5px">No conditions found.</div>';
}

function closeKBModal() {
  document.getElementById('kb-modal').classList.remove('open');
}

function renderKBDetail(kb) {
  if (!kb) return '';

  // Source badges
  const sourceBadges = (kb.gl_sources||[]).map(s => {
    const cls = ['','gl-1','gl-2','gl-3','gl-4'][s.level] || 'gl-4';
    return `<span class="gl-source ${cls}">L${s.level} ${esc(s.name)}</span>`;
  }).join('');

  // Red flags
  const rfHtml = (kb.red_flags||[]).map(r =>
    `<div style="display:flex;gap:7px;font-size:12px;padding:5px 0;border-bottom:1px solid var(--border);color:var(--ink2)"><span style="color:var(--danger);flex-shrink:0">⚑</span>${esc(r)}</div>`).join('');

  // Diagnostic criteria
  let dxHtml = '';
  if (kb.dx_criteria) {
    dxHtml = `<div class="criteria-block"><div class="criteria-title">${esc(kb.dx_criteria.name)}</div>
      ${(kb.dx_criteria.criteria||[]).map(c=>`<div class="criteria-item">${esc(c)}</div>`).join('')}</div>`;
  }

  // Treatment lines
  let txHtml = '';
  for (const [lineKey, line] of Object.entries(kb.treatment||{})) {
    txHtml += `<div style="margin-bottom:16px">
      <div style="font-size:10px;font-weight:700;color:var(--ink3);text-transform:uppercase;letter-spacing:.8px;margin-bottom:8px;padding:5px 8px;background:var(--surface2);border-radius:3px">${esc(line.label)}</div>
      ${(line.drugs||[]).map(d => renderDrugCard(d)).join('')}
    </div>`;
  }

  // Monitoring table
  let monHtml = '';
  if (kb.monitoring?.length) {
    monHtml = `<table class="monitor-table">
      <tr><th>Parameter</th><th>Frequency</th><th>Target</th><th>Action if abnormal</th></tr>
      ${kb.monitoring.map(m => `<tr><td><strong>${esc(m.parameter)}</strong></td><td>${esc(m.frequency)}</td><td style="color:var(--ok)">${esc(m.target)}</td><td style="color:var(--warn)">${esc(m.action)}</td></tr>`).join('')}
    </table>`;
  }

  // Referral
  const referralHtml = (kb.referral||[]).map(r => `<div class="refer-item">${esc(r)}</div>`).join('');

  // Contraindications
  let contraHtml = '';
  if (kb.contraindications_class) {
    contraHtml = Object.entries(kb.contraindications_class).map(([k,v]) =>
      `<div class="contra-item"><strong style="color:var(--danger);min-width:140px;display:inline-block">${esc(k.replace(/_/g,' '))}</strong> ${esc(v)}</div>`).join('');
  }

  // India context
  let indiaHtml = '';
  if (kb.india_context) {
    indiaHtml = `<div class="india-box">
      <div class="india-box-title">🇮🇳 India Context</div>
      ${Object.entries(kb.india_context).map(([k,v]) =>
        `<div style="font-size:12px;color:var(--ink2);padding:4px 0;border-bottom:1px solid rgba(10,122,110,.1)"><span style="font-family:var(--font-mono);font-size:9px;color:var(--accent);text-transform:uppercase;letter-spacing:.5px;margin-right:6px">${esc(k.replace(/_/g,' '))}</span>${esc(v)}</div>`).join('')}
    </div>`;
  }

  return `
    <div class="kb-section">
      <div class="kb-section-head">Evidence Sources</div>
      <div style="flex-wrap:wrap;display:flex">${sourceBadges}</div>
    </div>
    <div class="kb-section">
      <div class="kb-section-head">Key Symptoms</div>
      <div style="display:flex;flex-wrap:wrap;gap:5px">${(kb.key_symptoms||[]).map(s=>`<span class="tag tag-ok" style="font-size:11px">${esc(s)}</span>`).join('')}</div>
    </div>
    ${rfHtml ? `<div class="kb-section"><div class="kb-section-head">🚨 Red Flags</div>${rfHtml}</div>` : ''}
    ${dxHtml ? `<div class="kb-section"><div class="kb-section-head">Diagnostic Criteria</div>${dxHtml}</div>` : ''}
    <div class="kb-section"><div class="kb-section-head">Treatment Protocols</div>${txHtml}</div>
    ${contraHtml ? `<div class="kb-section"><div class="kb-section-head">Class Contraindications</div>${contraHtml}</div>` : ''}
    ${monHtml ? `<div class="kb-section"><div class="kb-section-head">Monitoring Parameters</div>${monHtml}</div>` : ''}
    ${referralHtml ? `<div class="kb-section"><div class="kb-section-head">Referral / Escalation Criteria</div>${referralHtml}</div>` : ''}
    ${indiaHtml ? `<div class="kb-section">${indiaHtml}</div>` : ''}
  `;
}

function renderDrugCard(d) {
  const riskCls = d.risk === 'high' ? 'drug-risk-high' : d.risk === 'moderate' ? 'drug-risk-moderate' : 'drug-risk-low';
  return `<div class="drug-card" style="margin-bottom:8px">
    <div class="drug-card-head">
      <div>
        <div class="drug-name-generic">${esc(d.generic)}</div>
        ${d.brand_india ? `<div class="drug-brand-india"><span class="india-tag">🇮🇳 India</span> ${esc(d.brand_india)}</div>` : ''}
      </div>
      <div style="display:flex;flex-direction:column;align-items:flex-end;gap:4px">
        <span class="${riskCls}" style="font-family:var(--font-mono);font-size:8px;padding:2px 6px;border-radius:2px;font-weight:500">${(d.risk||'').toUpperCase()}</span>
        ${d.gl ? `<span class="gl-source gl-1" style="font-size:8px">${esc(d.gl.split(';')[0].trim())}</span>` : ''}
      </div>
    </div>
    <div class="drug-card-body">
      <div class="drug-detail-grid">
        <div class="drug-detail-item"><span class="drug-detail-label">Dose</span><span class="drug-detail-val">${esc(d.dose||'—')}</span></div>
        <div class="drug-detail-item"><span class="drug-detail-label">Route</span><span class="drug-detail-val">${esc(d.route||'—')}</span></div>
        <div class="drug-detail-item"><span class="drug-detail-label">Frequency</span><span class="drug-detail-val">${esc(d.freq||'—')}</span></div>
        <div class="drug-detail-item"><span class="drug-detail-label">Duration</span><span class="drug-detail-val">${esc(d.duration||'—')}</span></div>
        ${d.class ? `<div class="drug-detail-item"><span class="drug-detail-label">Class</span><span class="drug-detail-val">${esc(d.class)}</span></div>` : ''}
        ${d.monitoring ? `<div class="drug-detail-item" style="grid-column:1/-1"><span class="drug-detail-label">Monitor</span><span class="drug-detail-val">${esc(d.monitoring)}</span></div>` : ''}
      </div>
      <div class="drug-notes">${esc(d.notes||'')}</div>
      ${d.contra ? `<div class="drug-contra">⛔ ${esc(d.contra)}</div>` : ''}
      ${d.india ? `<div class="drug-india"><span class="india-tag" style="margin-right:5px">🇮🇳</span>${esc(d.india)}</div>` : ''}
    </div>
  </div>`;
}

function injectTreatmentProtocols() {
  buildTreatmentTab();
  buildFullReport();
  unlockStep(7);
  unlockStep(8);
  buildPrescriptionSelector();
}


// ── DISPOSITION DATABASE ──────────────────────────────────────────
// Maps condition ID → disposition decision
const DISPOSITION_MAP = {
  // Emergency — immediate hospital
  nstemi:           { tag:'🚨 Emergency Refer', level:'emergency', msg:'12-lead ECG + IV access + 108 ambulance' },
  nstemi_ua:        { tag:'🚨 Emergency Refer', level:'emergency', msg:'12-lead ECG + IV access + 108 ambulance' },
  stemi:            { tag:'🚨 Emergency Refer', level:'emergency', msg:'STEMI — 108 now. Door-to-balloon <90 min' },
  pe:               { tag:'🚨 Emergency Refer', level:'emergency', msg:'CT-PA + anticoagulation + hospital' },
  sah:              { tag:'🚨 Emergency Refer', level:'emergency', msg:'CT brain STAT — call 108' },
  meningitis:       { tag:'🚨 Emergency Refer', level:'emergency', msg:'IV ceftriaxone now + 108 ambulance' },
  sepsis:           { tag:'🚨 Emergency Refer', level:'emergency', msg:'Sepsis 6 bundle + 108 ambulance' },
  ectopic_pregnancy:{ tag:'🚨 Emergency Refer', level:'emergency', msg:'Surgical emergency — 108 now' },

  // Admit — hospital required but not immediately life-threatening
  dengue:           { tag:'🏥 Consider Admit', level:'admit', msg:'If warning signs: admit. No warning signs: daily platelet monitoring at home' },
  leptospirosis:    { tag:'🏥 Admit If Severe', level:'admit', msg:'Jaundice or renal failure: admit. Mild: outpatient doxycycline' },
  scrub_typhus:     { tag:'🏥 Admit If Complications', level:'admit', msg:'Neuro/renal/pulmonary involvement: admit. Mild: outpatient doxycycline' },
  typhoid:          { tag:'🏥 Admit If Complications', level:'admit', msg:'Perforation/encephalopathy: emergency surgery. Uncomplicated: oral azithromycin at home' },
  heart_failure:    { tag:'🏥 Admit', level:'admit', msg:'Decompensated HF: hospital admission. Stable: outpatient optimisation' },
  pneumonia:        { tag:'🏥 Assess CURB-65', level:'admit', msg:'CURB-65 ≥2: admit. Score 0-1: community management' },
  pulmonary_tb:     { tag:'🏥 Notify + Refer', level:'refer', msg:'RNTCP notification mandatory. Refer to TB unit for DOTS initiation' },

  // Refer — specialist needed but not emergency
  pcos:             { tag:'↗ Refer If Needed', level:'refer', msg:'Fertility concerns: gynaecology. Metabolic: manage here' },
  copd:             { tag:'↗ Refer If Severe', level:'refer', msg:'GOLD 3-4: respiratory specialist. GOLD 1-2: manage in primary care' },
  ckd:              { tag:'↗ Refer To Nephrology', level:'refer', msg:'eGFR <30 or rapidly falling: nephrology. eGFR 30-60: manage here with monitoring' },
  depression:       { tag:'↗ Refer If Severe', level:'refer', msg:'Active SI: psychiatric emergency. Moderate/severe: consider psychiatry referral' },
  migraine:         { tag:'✓ Manage Here', level:'manage', msg:'Unless first/worst/atypical — manage in primary care' },

  // Manage here
  hypertension:     { tag:'✓ Manage Here', level:'manage', msg:'Uncomplicated: primary care management. Hypertensive emergency (BP >180/120 + organ damage): hospital' },
  t2dm:             { tag:'✓ Manage Here', level:'manage', msg:'Uncomplicated T2DM: primary care. DKA/HHS: hospital emergency' },
  hypothyroidism:   { tag:'✓ Manage Here', level:'manage', msg:'Start levothyroxine. Myxoedema coma: ICU emergency' },
  asthma:           { tag:'✓ Manage Here', level:'manage', msg:'Mild-moderate: primary care. Severe: hospital. Life-threatening: 108' },
  gout:             { tag:'✓ Manage Here', level:'manage', msg:'Acute: analgesics. Cannot exclude septic joint: orthopaedic same day' },
  uti:              { tag:'✓ Manage Here', level:'manage', msg:'Uncomplicated LUTI: 5-day nitrofurantoin. Pyelonephritis: consider hospital' },
  anxiety:          { tag:'✓ Manage Here', level:'manage', msg:'CBT + SSRI in primary care. Suicidal ideation: psychiatric emergency' },
  iron_deficiency_anaemia: { tag:'✓ Manage Here', level:'manage', msg:'Iron replacement. Hb <70 or haemodynamically unstable: hospital' },
  osteoarthritis:   { tag:'✓ Manage Here', level:'manage', msg:'Conservative: exercise + analgesia. TKR consideration: orthopaedic referral if severe' },
  low_back_pain:    { tag:'✓ Manage Here', level:'manage', msg:'Stay active, analgesia. Red flags: urgent MRI + neurosurgery' },
  acute_gastroenteritis: { tag:'✓ Manage Here', level:'manage', msg:'ORS + zinc. Severe dehydration: hospital IV fluids. Signs of sepsis: hospital' },

  // Observe
  viral_fever_urti: { tag:'⏱ Observe 48-72h', level:'observe', msg:'Symptomatic management. Return if fever >5 days — dengue/typhoid/leptospira screen' },
};

function getDisposition(condId) {
  const kbKey = KB_ID_MAP[condId] || condId;
  return DISPOSITION_MAP[kbKey] || DISPOSITION_MAP[condId] || null;
}


// ══════════════════════════════════════════════════════════════
// UTILITY
// ══════════════════════════════════════════════════════════════

// Patch: add KB buttons to diff cond items
function renderDiffCondWithKB(cond, reason) {
  const kb = lookupKB(cond.id);
  const glTags = (cond.gl ? `<span class="badge badge-gray" style="font-size:8.5px">${esc(cond.gl.split('/')[0].trim())}</span>` : '');
  return `<div>
    <div style="display:flex;align-items:center;gap:7px;margin-bottom:3px">
      <div class="diff-cond-name">${esc(cond.name)}</div>
      ${glTags}
      ${kb ? `<button class="btn btn-xs btn-secondary" onclick="openKBModal('${esc(cond.id)}')" style="margin-left:auto">📖 Protocol</button>` : ''}
    </div>
    <div class="diff-cond-reason">${esc((reason||'').slice(0,140))}</div>
    ${cond.missing ? `<div class="diff-cond-missing">⟳ Missing: ${esc(cond.missing)}</div>` : ''}
  </div>`;
}

function kbBrowserSearch(q) { filterKBBrowser(q); }

function esc(s) {
  if (s === null || s === undefined) return '';
  return String(s).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;');
}

let notifTimer;
function notify(msg, type) {
  const el = document.getElementById('notif');
  if (!el) return;
  el.textContent = msg;
  el.className = `notif show${type ? ' '+type : ''}`;
  clearTimeout(notifTimer);
  notifTimer = setTimeout(() => el.classList.remove('show'), 3000);
}

function resetAll() {
  if (!confirm('Start a new case? Current data will be cleared.')) return;
  Object.assign(S, {
    step:1, unlockedSteps:new Set([1]),
    patient:{age:null,gender:'',comorbid:''},
    rawInput:'', corpus:'', normalizations:[], activeSystems:{},
    redFlags:[], scored:[], gaps:[], examFindings:{},
    drugs:[], interactions:[], labs:{}, labAlerts:{},
    differential:{t1:[],t2:[],t3:[]}, nextSteps:[],
    certainty:0, certaintyNote:'',
  });
  ['pt-age','pt-gender','pt-comorbid','intake-text','drug-name','drug-dose','drug-dur'].forEach(id => {
    const el = document.getElementById(id);
    if (el) el.value = '';
  });
  document.getElementById('normalizer-output').style.display='none';
  document.getElementById('drug-list-card').style.display='none';
  document.getElementById('drug-interactions-content').innerHTML='<div class="empty-state"><div class="empty-state-icon">✅</div>No medications added.</div>';
  [2,3,4,5,6,7,8].forEach(n => {
    const navEl = document.getElementById(`nav-${n}`);
    if (navEl) { navEl.classList.add('locked'); navEl.classList.remove('active','done'); }
    updateBadge(n, null);
  });
  goStep(1);
  /* updateLivePanel() */
  notify('New case started', 'ok');
}

// ══════════════════════════════════════════════════════════════
// INITIALISATION
// ══════════════════════════════════════════════════════════════

function init() {
  // Build lab input grids
  buildLabInputs('labs-cbc', LAB_DEFS.cbc);
  buildLabInputs('labs-metabolic', LAB_DEFS.metabolic);
  buildLabInputs('labs-cardiac', LAB_DEFS.cardiac);
  buildLabInputs('labs-thyroid', LAB_DEFS.thyroid);
  buildLabInputs('labs-lft', LAB_DEFS.lft);
  buildLabInputs('labs-inflam', LAB_DEFS.inflam);

  updateProgressDots();
  /* updateLivePanel() */
  renderVitalsPanel();
  renderAllergyList();
  updateArchiveCount();

  // Archive modal close on background click
  const archiveModal = document.getElementById('archive-modal');
  if (archiveModal) {
    archiveModal.addEventListener('click', e => {
      if (e.target === archiveModal) closeArchiveModal();
    });
  }

  // Keyboard shortcut: Enter in drug name field
  document.getElementById('drug-name').addEventListener('keydown', e => {
    if (e.key === 'Enter') addDrug();
  });

  // Close notes overlay on background click
  const notesOverlay = document.getElementById('notes-overlay');
  if (notesOverlay) {
    notesOverlay.addEventListener('click', e => {
      if (e.target === notesOverlay) closeNotesPanel();
    });
  }

  // Keyboard shortcut: Ctrl+N for notes
  document.addEventListener('keydown', e => {
    if ((e.ctrlKey || e.metaKey) && e.key === 'n') {
      e.preventDefault();
      openNotesPanel();
    }
    if (e.key === 'Escape') {
      closeNotesPanel();
      closeKBModal();
      closeArchiveModal();
      const bm = document.getElementById('kb-browser-modal');
      if (bm) bm.classList.remove('open');
    }
  });
}

// ══════════════════════════════════════════════════════════════
// MODULE R — EXPANDED KB: CKD, TB, AF/STROKE, DVT
// ══════════════════════════════════════════════════════════════

Object.assign(CLINICAL_KB, {

  ckd: {
    id:'ckd', name:'Chronic Kidney Disease (CKD)', icd10:'N18',
    systems:['rn','cv'],
    gl_sources:[{name:'KDIGO 2022',level:1},{name:'NICE NG203 2021',level:1},{name:'BNF 86',level:4}],
    key_symptoms:['Often asymptomatic (early)','Fatigue / anaemia','Hypertension','Oedema (legs, periorbital)','Nocturia','Decreased urine output (late)','Nausea, vomiting (uraemia — late)','Pruritus (uraemia)','Bone pain (renal osteodystrophy)'],
    red_flags:['eGFR <15 — stage 5 CKD (imminent dialysis)','K+ >6.5 — hyperkalaemia (cardiac arrest risk)','Rapid eGFR decline >5 mL/min/year','Urine ACR >300 mg/mmol (nephrotic range)','Uncontrolled BP despite 3 agents','Haematuria + proteinuria — glomerulonephritis'],
    dx_criteria:{name:'KDIGO 2022 CKD Classification',criteria:['CKD: kidney damage markers OR eGFR <60 mL/min/1.73m² for >3 months','Stage G1: eGFR ≥90 + kidney damage markers','Stage G2: eGFR 60-89','Stage G3a: eGFR 45-59 (mild-moderate)','Stage G3b: eGFR 30-44 (moderate-severe)','Stage G4: eGFR 15-29 (severe)','Stage G5: eGFR <15 (kidney failure)','Albuminuria: A1 <3 mg/mmol, A2 3-30 (microalbuminuria), A3 >30 (macroalbuminuria)','KDIGO heat map: G×A category determines progression risk']},
    treatment:{
      reno_protective:{label:'Reno-protective Therapy (All CKD stages)',drugs:[
        {generic:'Ramipril (ACEi)',brand_india:'Cardace, Hopace',dose:'2.5-10mg OD (titrate slowly)',route:'Oral',freq:'OD',duration:'Lifelong unless K+>5.5 or AKI',class:'ACE inhibitor',risk:'moderate',notes:'KDIGO 2022 / NICE NG203: ACEi or ARB for CKD with diabetes OR urine ACR >30 mg/mmol regardless of BP. Reduces proteinuria progression and CV events. Expect 10-15% creatinine rise (acceptable up to 30% — do not stop). Monitor K+.',monitoring:'K+ and creatinine at 1-2 weeks post-initiation. If K+ >5.5: halve dose or switch to lowest dose. If creatinine rises >30% from baseline: investigate bilateral RAS.',gl:'KDIGO 2022 Class 1A; NICE NG203',contra:'Bilateral RAS, K+>5.5, pregnancy, prior angioedema',india:'Cardace 2.5mg ≈ ₹6-12/tablet. Most prescribed ACEi for CKD protection in India.'},
        {generic:'Dapagliflozin',brand_india:'Forxiga (generic dapagliflozin)',dose:'10mg OD',route:'Oral',freq:'OD (morning)',duration:'Lifelong',class:'SGLT2 inhibitor',risk:'moderate',notes:'KDIGO 2022 / NICE NG203: SGLT2i recommended for CKD with T2DM (eGFR ≥20). DAPA-CKD trial: 39% ↓ primary composite of worsening renal function/death — ALSO in non-diabetic CKD. Class effect extends to CKD without DM. Do not initiate if eGFR <20.',monitoring:'eGFR and genital hygiene. Do not start <eGFR 20. Continue even if eGFR falls below 45 once started.',gl:'KDIGO 2022 Class 1A for CKD+DM; Class 2B for CKD without DM',contra:'eGFR <20 (initiation), T1DM, recurrent genital infections',india:'Generic dapagliflozin ≈ ₹30-40/tablet. PMBJP listing in progress.'},
        {generic:'Finerenone',brand_india:'Kerendia',dose:'10mg OD (eGFR 25-60); 20mg OD (eGFR ≥60)',route:'Oral',freq:'OD',duration:'Lifelong',class:'Non-steroidal MRA',risk:'high',notes:'KDIGO 2022: finerenone for CKD with T2DM on maximum ACEi/ARB. FIDELIO-DKD: 18% ↓ CKD progression. Lower hyperkalaemia risk than spironolactone.',monitoring:'K+ at 4 weeks. Avoid if K+>4.8 at initiation. Avoid concurrent spironolactone.',gl:'KDIGO 2022 — specialist-initiated',contra:'K+>4.8, concurrent potassium-raising agents without monitoring, Addison\'s',india:'Kerendia not yet widely available in India. Expected to be available 2024-2025.'},
      ]},
      bp_control:{label:'BP Target and Antihypertensive',drugs:[
        {generic:'Amlodipine',brand_india:'Stamlo, Amlodac',dose:'5-10mg OD',route:'Oral',freq:'OD',duration:'Lifelong',class:'CCB',risk:'low',notes:'KDIGO 2022: BP target <120/80 (systolic) in CKD (based on SPRINT trial). CCB add-on to ACEi/ARB. Amlodipine does not require dose adjustment in CKD.',monitoring:'BP. Ankle oedema (dose-dependent).',gl:'KDIGO 2022 BP management',india:'Amlodac 5mg ≈ ₹3-5/tablet.'},
      ]},
      anaemia_ckd:{label:'Renal Anaemia Management',drugs:[
        {generic:'Ferrous sulphate (oral iron)',brand_india:'Orofer-S, Ferrium',dose:'200mg TDS (if tolerated)',route:'Oral',freq:'TDS with meals',duration:'Ongoing',class:'Iron supplementation',risk:'low',notes:'KDIGO: check ferritin and transferrin saturation before ESA. Target ferritin 100-500 ng/mL and TSAT >20% before ESA. Oral iron first unless IV needed (absorption poor in CKD — IV often better).',monitoring:'Ferritin, TSAT monthly during loading, then 3-monthly.',gl:'KDIGO 2012 Anaemia (updated 2020)',india:'Ferrous sulphate ≈ ₹1-2/tablet. IV FCM preferred in dialysis patients.'},
        {generic:'Erythropoietin alfa (ESA)',brand_india:'Epofit, Erykine, Zyrop',dose:'50-150 IU/kg SC 3×/week (dialysis); 20-50 IU/kg SC 3×/week (pre-dialysis)',route:'SC injection',freq:'3× weekly',duration:'Ongoing',class:'Erythropoiesis-stimulating agent',risk:'high',notes:'KDIGO: start ESA when Hb <100 g/L AND iron replete. Target Hb 100-115 g/L (NOT >130 — increases CV events, stroke risk). Requires specialist initiation in India.',monitoring:'Hb monthly. BP (ESA raises BP). Iron stores monthly. Reticulocyte count.',gl:'KDIGO 2012 Anaemia',contra:'Uncontrolled hypertension, haemoglobinopathy, malignancy',india:'Epofit 4000 IU ≈ ₹180-250/vial. Available at nephrology centres.'},
      ]},
      phosphate_bone:{label:'CKD-Mineral Bone Disorder (MBD)',drugs:[
        {generic:'Calcium carbonate (phosphate binder)',brand_india:'Calcium Carbonate 500mg',dose:'500mg-1g with meals',route:'Oral',freq:'With each meal',duration:'Ongoing (CKD G3b+)',class:'Phosphate binder',risk:'low',notes:'KDIGO 2017 MBD: phosphate binder with meals to reduce dietary phosphate absorption. Calcium-based binders increase serum calcium — avoid if hypercalcaemia.',monitoring:'Serum phosphate, calcium 3-monthly.',gl:'KDIGO 2017 CKD-MBD',india:'Calcium carbonate 500mg ≈ ₹2-5/tablet.'},
        {generic:'Alfacalcidol (active vitamin D)',brand_india:'Alfacal, One-Alpha',dose:'0.25-1 mcg OD',route:'Oral',freq:'OD',duration:'Ongoing',class:'Active vitamin D analogue',risk:'moderate',notes:'For CKD patients with vitamin D deficiency and secondary hyperparathyroidism. Monitor calcium closely — hypercalcaemia risk.',monitoring:'Calcium monthly. PTH 3-6 monthly.',gl:'KDIGO 2017',contra:'Hypercalcaemia, vitamin D toxicity',india:'One-Alpha 0.25mcg ≈ ₹8-15/capsule.'},
      ]},
    },
    monitoring:[
      {parameter:'eGFR (CKD-EPI equation)',frequency:'3-6 monthly (G3a+); 1-2 yearly (G1-2)',target:'Stable or slow decline <5mL/min/year',action:'Rapid decline or eGFR <20: nephrology referral'},
      {parameter:'Urine ACR',frequency:'Annual (G1-2); 6-monthly (G3+)',target:'ACR <30 on ACEi/ARB therapy',action:'ACR >300 despite treatment: glomerulonephritis workup, nephrology'},
      {parameter:'Serum K+ and creatinine',frequency:'1-2 weeks after ACEi/ARB initiation; 3-6 monthly stable',target:'K+ <5.5, creatinine stable',action:'K+>5.5: reduce ACEi, low-K diet, consider patiromer or sodium zirconium cyclosilicate'},
      {parameter:'Haemoglobin',frequency:'3-6 monthly',target:'Hb 100-115 g/L (on ESA)',action:'Hb <100: iron replete → ESA'},
      {parameter:'Serum phosphate',frequency:'3-6 monthly (G3b+)',target:'Phosphate 0.9-1.5 mmol/L',action:'Elevated: low-phosphate diet + phosphate binder'},
      {parameter:'Blood pressure',frequency:'Every clinic visit',target:'<120/80 (SPRINT criteria)',action:'Uncontrolled despite 3 agents: 24h ABPM + nephrology'},
    ],
    referral:['eGFR <30: nephrology referral (planning for RRT)','eGFR <15: urgent nephrology + dialysis/transplant planning','K+>6.0: emergency ED (hyperkalaemia — cardiac arrest risk)','Rapid decline (>5mL/min/year): nephrology + renal biopsy consideration','CKD in pregnancy: renal obstetrics'],
    india_context:{prevalence:'CKD affects ~17% of adults in India (SEEK study). Kerala: diabetic nephropathy and hypertensive nephrosclerosis are leading causes.',cost:'Ramipril 5mg ≈ ₹6-12/tablet. Dapagliflozin 10mg ≈ ₹30-40/tablet. Erythropoietin 4000IU ≈ ₹180-250/vial.',icmr:'Pradhan Mantri National Dialysis Programme (PMNDP) provides free dialysis at government hospitals in India. Coverage varies by state — Kerala has good coverage.',prescribing:'ACEi+ARB dual use still seen in India despite ONTARGET evidence of harm. SGLT2i for CKD without DM is underutilised — DAPA-CKD trial results have not yet fully reached Indian nephrology practice.'},
  },

  pulmonary_tb: {
    id:'pulmonary_tb', name:'Pulmonary Tuberculosis', icd10:'A15.0',
    systems:['rs','hm'],
    gl_sources:[{name:'WHO TB 2022',level:1},{name:'RNTCP/NTEP India 2020',level:1},{name:'NICE NG33',level:1},{name:'BNF 86',level:4}],
    key_symptoms:['Cough >2 weeks','Haemoptysis','Night sweats (drenching)','Unexplained weight loss >5%','Low-grade fever','Fatigue','Lymphadenopathy (cervical/mediastinal)','Pleuritic chest pain'],
    red_flags:['Massive haemoptysis (>200mL/24h) — life-threatening','Respiratory failure (SpO2 <90%)','Multi-drug resistant TB (MDR-TB) — specialist mandatory','Military TB — diffuse nodular CXR pattern','CNS involvement (TB meningitis) — steroids + anti-TB','Immunocompromised (HIV, steroids, biologics)'],
    dx_criteria:{name:'NTEP/WHO 2022 Diagnostic Algorithm',criteria:['Screen trigger: cough >2 weeks + ANY constitutional symptom → mandatory investigation','Sputum smear microscopy (AFB): two early morning samples','GeneXpert MTB/RIF Ultra: higher sensitivity than smear (now preferred in India)','GeneXpert also detects rifampicin resistance (MDR-TB detection)','CXR: upper lobe infiltrates, cavitation, lymphadenopathy','HIV test mandatory in all suspected TB','Microbiological confirmation before starting treatment (culture if GeneXpert negative + high suspicion)']},
    treatment:{
      category1:{label:'Category 1 ATT (New Pulmonary TB) — NTEP/WHO Fixed-dose combinations',drugs:[
        {generic:'2HRZE / 4HR (WHO/NTEP FDC regime)',brand_india:'NTEP FDC tablets (free through DOTS)',dose:'Intensive phase: Isoniazid 75mg + Rifampicin 150mg + Pyrazinamide 400mg + Ethambutol 275mg (weight-based daily doses).\nContinuation phase: Isoniazid 75mg + Rifampicin 150mg daily',route:'Oral (daily DOTS — directly observed therapy)',freq:'Daily (DOT preferred for compliance)',duration:'Intensive phase: 2 months. Continuation: 4 months (total 6 months)',class:'First-line Anti-tuberculosis Therapy (ATT)',risk:'high',notes:'NTEP 2020: daily FDC regime replaced intermittent regime. FDC improves adherence and reduces resistance. Weight-based: 25-34kg: 2 tabs; 35-49kg: 3 tabs; ≥50kg: 4 tabs. All treatment under NIKSHAY (digital notification system).',monitoring:'LFT before start and at 2 weeks (hepatotoxicity). Eye exam before ethambutol (optic neuritis). Urine turns orange (rifampicin) — warn patient. Sputum smear at end of 2 months.',gl:'NTEP 2020; WHO TB 2022 Module 1',contra:'Active hepatic disease (relative — monitor LFT). Pregnancy (use streptomycin-free regimen). Optic nerve disease (ethambutol cautioned)'},
        {generic:'Pyridoxine (Vitamin B6)',brand_india:'B6 supplement, Pyridoxine 10mg',dose:'10-25mg OD',route:'Oral',freq:'OD throughout ATT',duration:'Throughout ATT course',class:'Vitamin B6 supplement',risk:'low',notes:'NTEP 2020: add pyridoxine to all patients on isoniazid to prevent peripheral neuropathy. Especially important in: HIV, DM, alcoholism, pregnancy, malnutrition, elderly.',monitoring:'Symptoms of peripheral neuropathy (tingling, numbness in hands/feet).',gl:'NTEP 2020; WHO recommendation',india:'Pyridoxine 10mg ≈ ₹1/tablet. Dispensed free with DOTS kit in India.'},
      ]},
      steroid_adjunct:{label:'Adjunct Corticosteroid (TB Meningitis or Pericarditis)',drugs:[
        {generic:'Dexamethasone',brand_india:'Decadron, Dexona',dose:'0.4mg/kg/day IV in week 1, tapering over 6-8 weeks',route:'IV → oral',freq:'Divided doses',duration:'6-8 weeks tapering course',class:'Corticosteroid adjunct',risk:'moderate',notes:'WHO TB 2022 Grade 1A: dexamethasone for TB meningitis and pericarditis reduces mortality and disability. NOT indicated for pulmonary TB alone.',monitoring:'BP, glucose, GI symptoms during steroid course.',gl:'WHO TB 2022 Grade 1A — meningitis and pericarditis ONLY'},
      ]},
    },
    contraindications_class:{
      rifampicin_interactions:'Rifampicin is a powerful CYP450 inducer — reduces blood levels of: warfarin (increase INR monitoring), OCP (use barrier method), HIV antiretrovirals (switch to rifabutin with certain regimens), anticonvulsants, azoles.',
      pyrazinamide_gout:'Pyrazinamide inhibits uric acid excretion — can precipitate gout. Monitor urate in at-risk patients.',
    },
    monitoring:[
      {parameter:'Sputum smear / GeneXpert',frequency:'End of intensive phase (month 2)',target:'Smear-negative = treatment success on track',action:'Smear-positive at month 2: extend intensive phase 1 month, culture + DST for MDR-TB'},
      {parameter:'LFT',frequency:'Baseline + 2 weeks + monthly if abnormal',target:'ALT <3× ULN (continue with monitoring); <5× ULN (stop ATT)',action:'>5× ULN or symptomatic hepatitis: stop ALL ATT, restart sequentially when LFT normalises'},
      {parameter:'Weight',frequency:'Monthly',target:'Weight gain throughout therapy',action:'Weight loss despite treatment: non-adherence, MDR-TB, HIV, malabsorption — investigate'},
      {parameter:'Visual acuity (ethambutol)',frequency:'Before treatment + monthly',target:'No visual change',action:'Visual deterioration: stop ethambutol immediately — optic neuritis risk'},
      {parameter:'NIKSHAY notification',frequency:'At diagnosis and every 2 months',target:'100% notification compliance',action:'All TB must be notified on NIKSHAY (India digital TB database) — legal requirement under RNTCP'},
    ],
    referral:['MDR-TB (rifampicin resistance on GeneXpert): specialist TB unit immediately','TB+HIV co-infection: HIV/infectious disease specialist','TB meningitis: neurology + intensivist','Non-resolving TB after 6 months: specialist re-evaluation + drug susceptibility testing','Paediatric TB: paediatric TB specialist'],
    india_context:{prevalence:'India has the highest TB burden globally: 2.1 million new cases/year (WHO 2022). Kerala: declining TB rates but still endemic. National TB Elimination Programme (NTEP) targets elimination by 2025.',cost:'All ATT free under NTEP/DOTS. Patient also receives DBT cash benefit (₹500/month nutritional support — Nikshay Poshan Yojana).',notification:'All TB cases MUST be notified on NIKSHAY — failure to notify is an offence under Epidemic Diseases Act. Includes private sector notification.',dots:'DOTS (Directly Observed Therapy Short-course) remains standard in India. Community health workers (ASHAs) observe treatment in rural areas.',nikshay:'NIKSHAY — national TB digital platform tracks treatment adherence and outcomes. Private practitioners must register and report.'},
  },

  af_stroke_prevention: {
    id:'af_stroke_prevention', name:'Atrial Fibrillation — Stroke Prevention', icd10:'I48',
    systems:['cv','nr'],
    gl_sources:[{name:'ESC AF 2020',level:1},{name:'AHA/ACC AF 2023',level:1},{name:'NICE NG196 2021',level:1},{name:'BNF 86',level:4}],
    key_symptoms:['Palpitations (irregular, "irregularly irregular")','Dyspnoea on exertion','Fatigue','Presyncope / syncope','Stroke or TIA symptoms (embolic)','Chest discomfort','Often asymptomatic (incidental finding on ECG or pulse)'],
    red_flags:['AF + haemodynamic instability (SBP <90) — DC cardioversion immediately','New AF + stroke symptoms — CT brain before anticoagulation','AF + WPW — DO NOT use AV nodal blocking drugs (adenosine, digoxin, verapamil) — risk of VF','AF + fast rate + decompensated heart failure — urgent rate control + diuresis','CHA₂DS₂-VASc ≥2 (female) or ≥3 (male) — anticoagulation mandatory'],
    dx_criteria:{name:'CHA₂DS₂-VASc Stroke Risk Score (ESC AF 2020)',criteria:['C — Congestive heart failure: 1','H — Hypertension: 1','A₂ — Age ≥75: 2','D — Diabetes: 1','S₂ — Stroke/TIA/thromboembolism: 2','V — Vascular disease (MI, PVD): 1','A — Age 65-74: 1','Sc — Sex category (Female): 1','Male: anticoagulate if ≥2 points','Female: anticoagulate if ≥3 points','Score 0 (male) or 1 (female): no antithrombotic therapy needed','HAS-BLED bleeding risk — assess before anticoagulating (high score = modify reversible risk factors, NOT withhold anticoagulation)']},
    treatment:{
      anticoagulation:{label:'Stroke Prevention — Anticoagulation',drugs:[
        {generic:'Apixaban',brand_india:'Eliquis',dose:'5mg BD (2.5mg BD if ≥2 of: age ≥80, weight ≤60kg, creatinine ≥133 μmol/L)',route:'Oral',freq:'BD',duration:'Lifelong (unless CHA₂DS₂-VASc falls to 0/1)',class:'DOAC — Factor Xa inhibitor',risk:'moderate',notes:'ESC 2020 / NICE NG196 PREFERRED over warfarin: DOACs have lower intracranial haemorrhage, similar or superior stroke prevention, no INR monitoring. ARISTOTLE trial: apixaban 21% ↓ stroke, 31% ↓ ICH vs warfarin. Twice daily ensures better trough levels. Dose-reduce criteria (2 of 3): age ≥80 OR weight ≤60kg OR Cr ≥133.',monitoring:'Renal function annually (or 3-6 monthly if CrCl <50). Hb. Signs of bleeding.',gl:'ESC AF 2020 Class IA preferred; NICE NG196',contra:'eGFR <15, active major bleeding, prosthetic heart valve (use warfarin instead)',india:'Eliquis 5mg ≈ ₹55-80/tablet — expensive at ₹3000-5000/month. Generic apixaban not yet widely available in India.'},
        {generic:'Rivaroxaban',brand_india:'Xarelto',dose:'20mg OD with evening meal (15mg OD if CrCl 15-49)',route:'Oral (must take with food)',freq:'OD',duration:'Lifelong',class:'DOAC — Factor Xa inhibitor',risk:'moderate',notes:'ROCKET-AF trial: non-inferior to warfarin. Once-daily dosing — improved adherence. MUST be taken with main meal (bioavailability drops 40% without food). Renal dose-adjust: CrCl <50 → 15mg OD.',monitoring:'Renal function annually. Hb. Signs of bleeding.',gl:'ESC AF 2020 Class IA; NICE NG196',contra:'eGFR <15, active bleeding, prosthetic valve',india:'Xarelto 20mg ≈ ₹90-120/tablet — more expensive than warfarin but no INR testing costs.'},
        {generic:'Warfarin',brand_india:'Warf, Warfarin',dose:'Individualised: start 5mg OD, adjust by INR (target INR 2.0-3.0)',route:'Oral',freq:'OD (same time daily)',duration:'Lifelong',class:'Vitamin K antagonist',risk:'high',notes:'ESC 2020: warfarin acceptable where DOACs not available or affordability is an issue. Requires regular INR testing. Time-in-therapeutic-range (TTR) target >65%. In India, warfarin widely used due to lower cost. Mandatory for mechanical prosthetic heart valves.',monitoring:'INR at 1 week post-initiation, then weekly until stable, then every 4-6 weeks. Dietary vitamin K consistency important.',gl:'ESC AF 2020 — acceptable if DOAC unavailable; mandatory for mechanical valves',contra:'Haemorrhagic stroke, active GI bleeding, pregnancy (Category X), liver disease',india:'Warf 5mg ≈ ₹5-8/tablet — very affordable. INR monitoring ≈ ₹100-200/test at NABL labs in India.'},
      ]},
      rate_control:{label:'Rate Control (Most AF patients)',drugs:[
        {generic:'Bisoprolol',brand_india:'Concor, Corbis',dose:'2.5-10mg OD',route:'Oral',freq:'OD',duration:'Ongoing',class:'Beta-blocker (rate control)',risk:'moderate',notes:'ESC 2020: rate control target HR <110/min at rest (lenient control). Beta-blocker first-line for rate control. RACE II trial: lenient rate control (<110) non-inferior to strict control (<80) for outcomes.',monitoring:'HR (resting + exercise). BP. Symptoms of HF decompensation.',gl:'ESC AF 2020 Class IA rate control',contra:'Asthma, decompensated HF, complete HB',india:'Concor 5mg ≈ ₹8-20/tablet.'},
        {generic:'Digoxin',brand_india:'Lanoxin, Digoxin',dose:'125-250 mcg OD (adjust for renal function and weight)',route:'Oral',freq:'OD',duration:'Ongoing',class:'Cardiac glycoside (rate control)',risk:'high',notes:'ESC 2020: use digoxin for rate control only in sedentary patients or heart failure with reduced EF. Narrow therapeutic index — levels 0.6-1.2 ng/mL. Less effective during exercise. Avoid in WPW. Multiple drug interactions.',monitoring:'Digoxin level 5 days post-start. RFT (renally cleared). ECG (toxicity: bradycardia, heart block, bigeminy).',gl:'ESC AF 2020 — second/add-on line rate control',contra:'WPW syndrome (can cause VF), ventricular tachycardia, complete HB, hypertrophic cardiomyopathy',india:'Lanoxin 125mcg ≈ ₹3-5/tablet.'},
      ]},
      rhythm_control:{label:'Rhythm Control (Selected Patients — Specialist)',drugs:[
        {generic:'Flecainide (pill-in-pocket or maintenance)',brand_india:'Flecaine, Tambocor',dose:'100-200mg BD (maintenance); 200-300mg single dose (pill-in-pocket)',route:'Oral',freq:'BD or PRN',duration:'As directed by cardiologist',class:'Class Ic antiarrhythmic',risk:'high',notes:'ESC 2020: rhythm control reduces symptoms and improves QoL (EAST-AFNET 4 trial). Flecainide only in structurally normal hearts — proarrhythmic in ischaemic/structural heart disease. Pill-in-pocket for paroxysmal AF.',monitoring:'ECG (QRS widening >25%). HR. Echo before starting (structural heart).',gl:'ESC AF 2020 — specialist rhythm control',contra:'Structural heart disease, ischaemic heart disease, HF, LVH',india:'Tambocor 100mg ≈ ₹30-50/tablet. Specialist initiated.'},
      ]},
    },
    monitoring:[
      {parameter:'CHA₂DS₂-VASc score',frequency:'Annually (recalculate if new risk factors)',target:'Anticoagulate if score ≥2 (male) or ≥3 (female)',action:'New DM, HTN, or HF: score rises → initiate/continue anticoagulation'},
      {parameter:'INR (if warfarin)',frequency:'Weekly until stable TTR, then 4-6 weekly',target:'INR 2.0-3.0, TTR >65%',action:'TTR <65%: consider switch to DOAC'},
      {parameter:'Renal function (DOAC)',frequency:'Annually (CrCl >50); 6 monthly (CrCl 30-50); 3 monthly (<30)',target:'Stable eGFR',action:'eGFR <15: switch from apixaban/rivaroxaban to warfarin'},
      {parameter:'Heart rate',frequency:'Every clinic visit + patient self-monitoring',target:'<110/min resting (lenient) or <80/min (strict if symptomatic)',action:'HR >110 despite beta-blocker: add digoxin or refer for rhythm control/ablation'},
      {parameter:'Bleeding assessment (HAS-BLED)',frequency:'Annually',target:'Modify reversible risk factors (BP, alcohol, NSAIDs)',action:'High HAS-BLED does NOT justify stopping anticoagulation — address reversible factors'},
    ],
    referral:['Haemodynamically unstable AF — ED immediately (DC cardioversion)','AF + stroke symptoms — CT brain STAT (stroke team)','Paroxysmal AF considering rhythm control or catheter ablation — electrophysiology','AF in pregnancy — cardiology (specialist AF management with fetal safety considerations)','Newly diagnosed AF in young patient (<50y) — cardiology (structural and thyroid workup)'],
    india_context:{prevalence:'AF affects 1-2% of India\'s adult population — 10-13 million patients. Underdiagnosed (opportunistic pulse assessment in all clinic visits recommended).',cost:'Warfarin ≈ ₹150-200/month + INR tests ₹200-400/month. Apixaban ≈ ₹3000-5000/month. Significant cost barrier to DOAC use in India.',prescribing:'Warfarin remains most used anticoagulant for AF in India due to cost. INR monitoring infrastructure established at district hospitals. Generic DOACs expected to reduce cost significantly.',icmr:'Indian Heart Rhythm Society (IHRS) AF Guidelines 2022 recommend DOACs as preferred but acknowledge cost barrier. Warfarin with good INR monitoring (TTR>65%) is acceptable.'},
  },

  ectopic_pregnancy: {
    id:'ectopic_pregnancy', name:'Ectopic Pregnancy', icd10:'O00.9',
    systems:['gi','cv'],
    gl_sources:[{name:'NICE NG126 2019',level:1},{name:'RCOG GTG 21 2016',level:1},{name:'FOGSI',level:1}],
    key_symptoms:['Amenorrhoea (missed period)','Unilateral lower abdominal/pelvic pain','Vaginal bleeding (often light)','Shoulder tip pain (diaphragmatic irritation from haemoperitoneum)','Syncope / collapse (tubal rupture)','Positive urine/serum hCG','Cervical excitation on bimanual (pain with cervical movement)'],
    red_flags:['Haemodynamic instability (collapsed patient) — surgical emergency','Shoulder tip pain — haemoperitoneum indicating tubal rupture','Sudden severe pelvic pain + syncopal episode — ALWAYS exclude ectopic in woman of reproductive age'],
    dx_criteria:{name:'NICE NG126 / RCOG 2016',criteria:['Positive urine or serum hCG (beta-hCG)','Transvaginal USS: no intrauterine pregnancy (empty uterus) + adnexal mass OR free fluid in pouch of Douglas','Serum hCG >1500 IU/L without intrauterine sac = ectopic until proven otherwise','Serum hCG doubling time <48h suggests viable IUP; non-doubling suggests ectopic or non-viable IUP','Discriminatory zone: hCG >3000 IU/L with empty uterus on TVUSS = ectopic']},
    treatment:{
      surgical:{label:'Surgical (Haemodynamically unstable OR large ectopic)',drugs:[
        {generic:'Laparoscopic salpingectomy',brand_india:'Surgical procedure',dose:'N/A',route:'Surgical',freq:'Emergency',duration:'Single procedure',class:'Definitive surgical treatment',risk:'high',notes:'RCOG/NICE: salpingectomy preferred over salpingotomy (lower re-ectopic rate). Immediate surgical intervention for ruptured ectopic or haemodynamic instability. Do NOT delay for investigations.',monitoring:'Hb, blood group, coagulation before theatre if time allows. IV access × 2 and crossmatch.',gl:'RCOG GTG 21 Grade A first-line for haemodynamic instability'},
      ]},
      methotrexate:{label:'Medical (Stable, small, unruptured ectopic)',drugs:[
        {generic:'Methotrexate',brand_india:'Methocel, Folitrax',dose:'50mg/m² IM single dose (single-dose protocol)',route:'IM injection',freq:'Single dose (repeat at day 7 if hCG not declining ≥15%)',duration:'Single dose; follow-up hCG monitoring',class:'Antimetabolite (anti-ectopic)',risk:'high',notes:'NICE NG126: methotrexate for haemodynamically stable unruptured ectopic, hCG <3000 IU/L, adnexal mass <3.5cm, no cardiac activity. Success rate 90% if hCG <1000, 65-70% if >3000. MUST have folic acid avoidance during and 3 months after. Avoid NSAIDs during methotrexate.',monitoring:'hCG on day 4, 7 (expect rise days 1-4 = normal). Days 1 and 7 hCG: if not declining ≥15% = repeat dose or surgery. RFT, LFT, FBC before. Lung function baseline.',gl:'NICE NG126 Grade A medical management criteria',contra:'hCG >5000 IU/L, cardiac activity in ectopic, adnexal mass >3.5cm, haemodynamic instability, immunocompromised, lung disease, renal/hepatic impairment, breastfeeding, inability to attend follow-up'},
      ]},
    },
    monitoring:[
      {parameter:'Serum hCG',frequency:'Days 4 and 7 after methotrexate, then weekly until <5 IU/L',target:'≥15% decline day 4→7 = treatment success',action:'<15% decline: repeat methotrexate or surgical management'},
      {parameter:'Haemoglobin + haemodynamic status',frequency:'At presentation + repeated if abdominal pain worsens',target:'Hb stable, haemodynamically stable',action:'Falling Hb or haemodynamic compromise = ruptured ectopic → emergency theatre'},
      {parameter:'Ultrasound',frequency:'Day 7 post-methotrexate + until resolution',target:'Resolving adnexal mass',action:'Increasing size or free fluid = surgical management'},
    ],
    referral:['Haemodynamically unstable: emergency gynaecology + theatres IMMEDIATELY','All suspected ectopic: early pregnancy assessment unit (EPAU) same day'],
    india_context:{prevalence:'Ectopic pregnancy affects 1-2% of pregnancies in India. Rising incidence — associated with PID (Chlamydia, gonorrhoea), IUD use, previous tubal surgery.',cost:'Methotrexate injection ≈ ₹200-500 (50mg). Laparoscopic salpingectomy under PMJAY scheme — available at empanelled hospitals free of charge.',fogsi:'FOGSI guidelines align with RCOG — methotrexate for stable unruptured ectopic is standard of care in India at tertiary centres.'},
  },

});

// ── Update KB_ID_MAP for new conditions ────────────────────────
Object.assign(KB_ID_MAP, {
  ckd: 'ckd',
  pulmonary_tb: 'pulmonary_tb',
  tb: 'pulmonary_tb',
  af_stroke_prevention: 'af_stroke_prevention',
  af: 'af_stroke_prevention',
  ectopic_pregnancy: 'ectopic_pregnancy',
});

// ── Add scoring CONDITIONS for new KB entries ─────────────────
[
  { id:'ckd_new', name:'Chronic Kidney Disease', systems:['rn','cv'], tier:'t2', danger:false,
    triggers:['oedema','haematuria'], w:{'oedema':2,'haematuria':2,'polyuria':2,'fatigue':1,'hypertension':1,'bilateral oedema':2,'pruritus':1},
    age:[40,90], gw:{M:1.1,F:0.95}, kerala:1.2,
    reason:'Oedema + haematuria + hypertension in a middle-aged patient with DM — CKD must be screened with eGFR + urine ACR.',
    missing:'eGFR result, urine ACR, BP readings, DM history, duration of symptoms.',
    gl:'KDIGO 2022 / NICE NG203' },
  { id:'tb', name:'Pulmonary Tuberculosis', systems:['rs','hm'], tier:'t3', danger:true,
    triggers:['cough','haemoptysis','night sweats'], w:{'cough':2,'haemoptysis':3,'night sweats':3,'weight loss':3,'fever':2,'fatigue':1,'lymphadenopathy':1},
    age:[15,70], gw:{M:1.0,F:1.0}, kerala:1.0,
    danger_why:'Notifiable disease — untreated TB spreads and develops drug resistance. RNTCP mandatory notification.',
    reason:'Cough >2 weeks + constitutional symptoms = TB until microbiologically excluded (NTEP mandate).',
    missing:'Cough duration, haemoptysis, contacts, HIV status, AFB smear + GeneXpert.',
    gl:'WHO TB 2022 / NTEP India 2020' },
  { id:'af', name:'Atrial Fibrillation', systems:['cv'], tier:'t2', danger:false,
    triggers:['palpitations','irregular'], w:{'palpitations':3,'dyspnoea':1,'fatigue':1,'syncope':1,'stroke':2,'atrial fibrillation':3},
    age:[55,90], gw:{M:1.2,F:0.9}, kerala:1.1,
    reason:'Irregular palpitations + dyspnoea in an older patient — irregular pulse mandates ECG for AF.',
    missing:'ECG result, stroke history, CHA₂DS₂-VASc risk factors, current anticoagulation.',
    gl:'ESC AF 2020 / NICE NG196' },
].forEach(c => {
  if (!CONDITIONS.find(x => x.id === c.id)) CONDITIONS.push(c);
});
Object.assign(CMAP, Object.fromEntries(CONDITIONS.map(c => [c.id, c])));

// ══════════════════════════════════════════════════════════════
// MODULE S — VITALS QUICK-ENTRY PANEL
// Inline vital signs entry with automated normalcy classification
// ══════════════════════════════════════════════════════════════

const VITALS_DEFS = [
  { key:'hr',   label:'Heart Rate',         unit:'bpm',   norm:[60,100],  warn_lo:50, warn_hi:110, crit_lo:40, crit_hi:150 },
  { key:'sbp',  label:'Systolic BP',        unit:'mmHg',  norm:[90,139],  warn_lo:80, warn_hi:160, crit_lo:70, crit_hi:180 },
  { key:'dbp',  label:'Diastolic BP',       unit:'mmHg',  norm:[60,89],   warn_lo:50, warn_hi:100, crit_lo:40, crit_hi:120 },
  { key:'rr',   label:'Resp Rate',          unit:'/min',  norm:[12,20],   warn_lo:10, warn_hi:25,  crit_lo:8,  crit_hi:30  },
  { key:'spo2', label:'SpO2',               unit:'%',     norm:[94,100],  warn_lo:90, warn_hi:null,crit_lo:85, crit_hi:null},
  { key:'temp', label:'Temperature',        unit:'°C',    norm:[36.1,37.2],warn_lo:35,warn_hi:38,  crit_lo:34, crit_hi:40  },
  { key:'gcs',  label:'GCS',                unit:'/15',   norm:[15,15],   warn_lo:13, warn_hi:null,crit_lo:8,  crit_hi:null},
  { key:'wt',   label:'Weight',             unit:'kg',    norm:[null,null],warn_lo:null,warn_hi:null,crit_lo:null,crit_hi:null},
  { key:'bmi',  label:'BMI',                unit:'kg/m²', norm:[18.5,24.9],warn_lo:17, warn_hi:30, crit_lo:15, crit_hi:40  },
];

const S_VITALS = {};

function isAbnormalVital(key, value) {
  const def = VITALS_DEFS.find(d => d.key === key);
  if (!def || !value) return 'normal';
  const v = parseFloat(value);
  if (isNaN(v)) return 'normal';
  if (def.crit_lo !== null && v <= def.crit_lo) return 'critical';
  if (def.crit_hi !== null && v >= def.crit_hi) return 'critical';
  if (def.warn_lo !== null && v < def.warn_lo)  return 'warning';
  if (def.warn_hi !== null && v > def.warn_hi)  return 'warning';
  if (def.norm[0] !== null && v < def.norm[0])  return 'low';
  if (def.norm[1] !== null && v > def.norm[1])  return 'high';
  return 'normal';
}

function renderVitalsPanel() {
  const el = document.getElementById('vitals-quick-grid');
  if (!el) return;
  el.innerHTML = VITALS_DEFS.map(def => {
    const val = S_VITALS[def.key] || '';
    const status = val ? isAbnormalVital(def.key, val) : 'empty';
    const color = status==='critical'?'var(--danger)':status==='warning'?'var(--warn)':status==='high'?'var(--warn)':status==='low'?'var(--info)':'var(--ink)';
    const bg    = status==='critical'?'var(--cv-t)':status==='warning'||status==='high'?'var(--warn-t)':status==='low'?'var(--rs-t)':'var(--surface2)';
    const border= status==='critical'?'rgba(192,57,43,.3)':status==='warning'||status==='high'?'rgba(184,106,0,.3)':status==='low'?'rgba(26,92,158,.25)':'var(--border)';
    const normText = (def.norm[0]!==null&&def.norm[1]!==null)?`${def.norm[0]}-${def.norm[1]}`:def.norm[0]!==null?`≥${def.norm[0]}`:'—';
    return `<div style="background:${bg};border:1.5px solid ${border};border-radius:var(--r);padding:8px 10px" id="vdiv-${def.key}">
      <div style="font-size:9.5px;font-weight:600;color:var(--ink3);text-transform:uppercase;letter-spacing:.4px;margin-bottom:3px">${esc(def.label)}</div>
      <div style="display:flex;align-items:center;gap:5px">
        <input type="text" value="${esc(val)}" placeholder="—"
          style="width:56px;border:none;background:transparent;font-family:var(--font-mono);font-size:15px;font-weight:600;color:${color};outline:none"
          oninput="updateVital('${def.key}',this.value)" onblur="updateVital('${def.key}',this.value)">
        <span style="font-family:var(--font-mono);font-size:9.5px;color:var(--ink4)">${esc(def.unit)}</span>
      </div>
      <div style="font-size:9px;color:var(--ink4);margin-top:1px">ref: ${normText}</div>
      ${status!=='normal'&&status!=='empty'?`<div style="font-family:var(--font-mono);font-size:8px;text-transform:uppercase;color:${color};margin-top:2px;font-weight:600">${status}</div>`:''}
    </div>`;
  }).join('');
}

function updateVital(key, value) {
  // Store value immediately (no delay for state)
  S_VITALS[key] = value;

  // Sync to exam findings (cardiovascular) — immediate for state, render debounced
  if (!S.examFindings.cv) S.examFindings.cv = {};
  if (key === 'hr')   S.examFindings.cv['cv_heart_rate__bpm_'] = value;
  if (key === 'sbp')  S.examFindings.cv['cv_blood_pressure__mmhg_'] = value + (S_VITALS.dbp ? '/'+S_VITALS.dbp : '');
  if (key === 'spo2') S.examFindings.cv['cv_spo2___'] = value;
  if (key === 'rr')   S.examFindings.rs = S.examFindings.rs || {};

  // Debounce all rendering and re-scoring — fires 600ms after LAST keystroke
  // This prevents "loading on every digit" while still being responsive
  kbeDebounce('vital_update', () => {
    renderVitalsPanel();
    // Check for critical vitals
    const criticals = VITALS_DEFS.filter(d => S_VITALS[d.key] && isAbnormalVital(d.key, S_VITALS[d.key]) === 'critical');
    if (criticals.length) {
      notify(`⚠ Critical vital: ${criticals.map(d=>d.label+'='+S_VITALS[d.key]+d.unit).join(', ')}`, 'danger');
    }
    if (S.corpus) {
      S.scored       = kbeScoreAll(S.corpus, S.patient, S.examFindings, S.labs, S.gaps);
      S.differential = kbeBuildDifferential(S.scored, S.redFlags);
      /* updateLivePanel() */
    } else {
      /* updateLivePanel() */
    }
  }, 600);
}

function getVitalsSummary() {
  return VITALS_DEFS.filter(d => S_VITALS[d.key]).map(d => ({
    label: d.label, value: S_VITALS[d.key], unit: d.unit,
    status: isAbnormalVital(d.key, S_VITALS[d.key]),
  }));
}

// ══════════════════════════════════════════════════════════════
// MODULE T — CASE ARCHIVE (localStorage persistence)
// ══════════════════════════════════════════════════════════════

const CASE_ARCHIVE_KEY = 'cureocity_v4_cases';

function archiveCurrentCase() {
  if (!S.corpus && !S.rawInput) { notify('No case data to save.', 'warn'); return; }
  try {
    const cases = JSON.parse(localStorage.getItem(CASE_ARCHIVE_KEY) || '[]');
    const snapshot = {
      id: 'C' + Date.now(),
      ts: new Date().toISOString(),
      patient: { ...S.patient },
      rawInput: S.rawInput,
      vitals: { ...S_VITALS },
      redFlags: S.redFlags.length,
      topDiff: [...S.differential.t3, ...S.differential.t1].slice(0,3).map(c=>c.name),
      certainty: S.certainty,
      drugs: S.drugs.map(d=>d.name).join(', '),
      notes: { ...CLINICAL_NOTES },
      rxDrugs: S_RX.selectedDrugs.map(d=>d.drug.generic),
    };
    cases.unshift(snapshot);
    localStorage.setItem(CASE_ARCHIVE_KEY, JSON.stringify(cases.slice(0, 30)));
    notify('Case saved to archive ✓', 'ok');
    updateArchiveCount();
  } catch(e) {
    notify('Save failed: ' + e.message, 'warn');
  }
}

function loadCaseArchive() {
  try { return JSON.parse(localStorage.getItem(CASE_ARCHIVE_KEY) || '[]'); }
  catch { return []; }
}

function updateArchiveCount() {
  const el = document.getElementById('archive-count');
  if (!el) return;
  const n = loadCaseArchive().length;
  el.textContent = n > 0 ? `${n} saved` : 'Empty';
}

function openCaseArchive() {
  const cases = loadCaseArchive();
  const modal = document.getElementById('archive-modal');
  const list = document.getElementById('archive-list');
  if (!modal || !list) return;
  list.innerHTML = cases.length ? cases.map(c => `
    <div style="display:flex;gap:10px;padding:11px 16px;border-bottom:1px solid var(--border);cursor:pointer;transition:background .1s" onmouseover="this.style.background='var(--bg)'" onmouseout="this.style.background=''">
      <div style="width:7px;height:7px;border-radius:50%;background:${c.redFlags>0?'var(--cv)':'var(--ok)'};flex-shrink:0;margin-top:5px"></div>
      <div style="flex:1;min-width:0">
        <div style="font-size:12.5px;font-weight:600;color:var(--ink);white-space:nowrap;overflow:hidden;text-overflow:ellipsis">${esc(c.rawInput.slice(0,60))}…</div>
        <div style="font-family:var(--font-mono);font-size:9.5px;color:var(--ink3);margin-top:2px">
          ${c.patient.age||'?'}y ${c.patient.gender||'?'} ·
          ${new Date(c.ts).toLocaleString('en-IN',{day:'2-digit',month:'short',hour:'2-digit',minute:'2-digit'})} ·
          certainty ${c.certainty}% ·
          ${c.topDiff.slice(0,2).join(', ')||'—'}
        </div>
        ${c.rxDrugs?.length?`<div style="font-size:10px;color:var(--en);margin-top:2px">Rx: ${esc(c.rxDrugs.slice(0,3).join(', '))}</div>`:''}
      </div>
      <button class="btn btn-xs btn-secondary" onclick="exportCase('${c.id}');event.stopPropagation()">↓ Export</button>
    </div>`) .join('')
    : '<div style="text-align:center;padding:40px;color:var(--ink4);font-style:italic;font-size:13px">No saved cases yet.<br>Complete a case and click "Save to Archive".</div>';
  modal.classList.add('open');
}

function closeArchiveModal() {
  const el = document.getElementById('archive-modal');
  if (el) el.classList.remove('open');
}

function exportCase(caseId) {
  const cases = loadCaseArchive();
  const c = cases.find(x => x.id === caseId);
  if (!c) return;
  const json = JSON.stringify(c, null, 2);
  const blob = new Blob([json], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url; a.download = `cureocity_case_${caseId}.json`;
  a.click(); URL.revokeObjectURL(url);
  notify('Case exported as JSON', 'ok');
}

function exportCurrentCase() {
  if (!S.rawInput) { notify('No active case to export.', 'warn'); return; }
  const snapshot = {
    exportedAt: new Date().toISOString(),
    patient: { ...S.patient },
    rawInput: S.rawInput,
    corpus: S.corpus,
    vitals: { ...S_VITALS },
    activeSystems: Object.keys(S.activeSystems),
    redFlags: S.redFlags.map(f => f.msg),
    differential: {
      mustNotMiss: S.differential.t3.map(c=>c.name),
      mostLikely:  S.differential.t1.map(c=>c.name),
      possible:    S.differential.t2.map(c=>c.name),
    },
    certainty: S.certainty,
    gaps: S.gaps.filter(g=>g.value).map(g=>({field:g.label, value:g.value})),
    drugs: S.drugs,
    interactions: S.interactions.length,
    labAlerts: S.labAlerts.map(a=>({name:a.name,value:a.value,status:a.status})),
    nextSteps: S.nextSteps.map(s=>s.action),
    prescription: S_RX.selectedDrugs.map(d=>({drug:d.drug.generic,dose:d.drug.dose,freq:d.drug.freq})),
    notes: { ...CLINICAL_NOTES },
  };
  const json = JSON.stringify(snapshot, null, 2);
  const blob = new Blob([json], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url; a.download = `cureocity_case_${new Date().toISOString().slice(0,10)}.json`;
  a.click(); URL.revokeObjectURL(url);
  notify('Case exported as JSON ✓', 'ok');
}

// ══════════════════════════════════════════════════════════════
// MODULE U — REFERRAL LETTER GENERATOR
// ══════════════════════════════════════════════════════════════

const SPECIALIST_MAP = {
  cv:  { name:'Cardiologist',          urgency_flag: true  },
  rs:  { name:'Respiratory Physician', urgency_flag: false },
  en:  { name:'Endocrinologist',       urgency_flag: false },
  nr:  { name:'Neurologist',           urgency_flag: true  },
  gi:  { name:'Gastroenterologist',    urgency_flag: false },
  hm:  { name:'Haematologist',         urgency_flag: false },
  ms:  { name:'Rheumatologist',        urgency_flag: false },
  rn:  { name:'Nephrologist',          urgency_flag: false },
  ps:  { name:'Psychiatrist',          urgency_flag: false },
};

function generateReferralLetter() {
  const el = document.getElementById('referral-output');
  if (!el) return;

  const pt = S.patient;
  const today = new Date().toLocaleDateString('en-IN',{day:'2-digit',month:'long',year:'numeric'});
  const topCond = [...S.differential.t3,...S.differential.t1][0];
  const primarySys = Object.keys(S.activeSystems)[0];
  const specialist = SPECIALIST_MAP[primarySys] || { name:'Specialist', urgency_flag: false };
  const isUrgent = S.redFlags.length > 0 || specialist.urgency_flag;

  const historyItems = S.gaps.filter(g=>g.value).map(g=>`${g.label}: ${g.value}`).join('\n');
  const examItems = Object.entries(S.examFindings).flatMap(([sysId,f])=>Object.entries(f).filter(([,v])=>v).map(([k,v])=>`${k.replace(/_/g,' ')}: ${v}`)).join('\n');
  const drugsText = S.drugs.map(d=>`${d.name} ${d.dose||''}`).join(', ') || 'None documented';
  const labText = S.labAlerts.map(a=>`${a.name}: ${a.value} ${a.unit} (${a.status})`).join('\n') || 'No abnormalities';
  const diffText = [...S.differential.t3,...S.differential.t1].map((c,i)=>`${i===0?'Primary working diagnosis':'Also consider'}: ${c.name}`).join('\n');
  const rxText = S_RX.selectedDrugs.map(d=>`${d.drug.generic} ${d.drug.dose} ${d.drug.freq} for ${d.drug.duration}`).join('\n') || 'No prescription generated yet';
  const vitalsText = getVitalsSummary().map(v=>`${v.label}: ${v.value} ${v.unit}${v.status!=='normal'?' ['+v.status.toUpperCase()+']':''}`).join('\n') || 'Not recorded';
  const notes_impression = CLINICAL_NOTES.impression || '[Add clinical impression above in Notes panel]';

  const letter = `${isUrgent ? 'URGENT REFERRAL' : 'REFERRAL LETTER'}

Date: ${today}
To: The ${specialist.name}
From: ${S_RX.doctorName || 'Dr. [Name]'}
Re: ${pt.age||'?'}y ${pt.gender==='F'?'Female':pt.gender==='M'?'Male':'Patient'}

${isUrgent ? '*** URGENT — Please review at the earliest opportunity ***\n' : ''}
Dear Colleague,

Thank you for seeing this patient. I am referring for specialist assessment and management of the following:

PRIMARY CONCERN
${diffText || 'See below for differential diagnosis'}

PRESENTING COMPLAINT
${S.rawInput || '[Not documented]'}

CLINICAL HISTORY
${historyItems || '[History not yet documented in system]'}

VITAL SIGNS
${vitalsText}

EXAMINATION
${examItems || '[Examination not yet documented]'}

INVESTIGATIONS
${labText}

CURRENT MEDICATIONS
${drugsText}

${S.interactions.length ? `DRUG INTERACTIONS NOTED\n${S.interactions.map(i=>`• ${i.matchedDrugs.join('+')} — ${i.desc}`).join('\n')}\n` : ''}CURRENT TREATMENT INITIATED
${rxText}

CLINICAL IMPRESSION
${notes_impression}

${S.redFlags.length ? `RED FLAGS NOTED\n${S.redFlags.map(f=>`• ${f.msg}`).join('\n')}\n` : ''}
I would appreciate your expert opinion regarding:
1. Confirmation of diagnosis and further specialist investigation
2. Optimisation of management
3. Long-term follow-up recommendations

Please do not hesitate to contact me if you require further information.

Yours sincerely,

${S_RX.doctorName || 'Dr. [Name]'}
${S_RX.clinicName || 'Cureocity Clinical'}`;

  el.innerHTML = `<div class="card" style="border:2px solid var(--accent)">
    <div class="card-head" style="background:linear-gradient(135deg,var(--en-t),var(--surface2))">
      <div class="card-title">${isUrgent?'⚡ URGENT':'📧'} Referral Letter — ${esc(specialist.name)}</div>
      <div style="display:flex;gap:8px">
        <button class="btn btn-sm btn-secondary" onclick="copyReferralLetter()">📋 Copy</button>
        <button class="btn btn-sm btn-primary" onclick="window.print()">🖨️ Print</button>
      </div>
    </div>
    <div class="card-body">
      <pre id="referral-letter-text" style="font-family:var(--font-sans);font-size:12.5px;color:var(--ink2);line-height:1.75;white-space:pre-wrap;word-wrap:break-word">${esc(letter)}</pre>
    </div>
  </div>`;
  el.style.display = 'block';
  notify('Referral letter generated ✓', 'ok');
}

function copyReferralLetter() {
  const el = document.getElementById('referral-letter-text');
  if (!el) return;
  navigator.clipboard.writeText(el.textContent || '').then(() => {
    notify('Referral letter copied to clipboard ✓', 'ok');
  }).catch(() => notify('Copy failed — please select text manually', 'warn'));
}

// ══════════════════════════════════════════════════════════════
// MODULE V — DRUG ALLERGY ENGINE
// ══════════════════════════════════════════════════════════════

const S_ALLERGIES = [];

const ALLERGY_CROSS_REACTIVITY = {
  penicillin:   { cross: ['amoxicillin','co-amoxiclav','flucloxacillin','ampicillin'], rate: '1-10%', note: 'True penicillin allergy confirmed by skin test warrants class avoidance. Use cephalosporins with caution (1-3% cross-reactivity). Use carbapenems or azithromycin as alternatives.' },
  cephalosporin:{ cross: ['cefuroxime','ceftriaxone','cefalexin'], rate: '1-3%', note: 'If penicillin-allergic: cephalosporins may be used with caution if penicillin allergy is not anaphylaxis. If anaphylaxis to penicillin: avoid cephalosporins.' },
  sulfonamide:  { cross: ['trimethoprim-sulfamethoxazole','furosemide','thiazides'], rate: '<5%', note: 'True sulfonamide antibiotic allergy may not predict cross-reactivity to sulfonamide non-antibiotics (furosemide, thiazides). Assess individually.' },
  nsaid:        { cross: ['aspirin','ibuprofen','diclofenac','naproxen','celecoxib'], rate: '20-30%', note: 'NSAID hypersensitivity: AERD (aspirin-exacerbated respiratory disease) common. Cross-reactivity between non-selective NSAIDs up to 30%. COX-2 inhibitors (celecoxib) lower cross-reactivity.' },
  quinolone:    { cross: ['ciprofloxacin','levofloxacin','moxifloxacin'], rate: '40-90%', note: 'Class cross-reactivity within quinolones is high. If allergic to one quinolone, avoid the class.' },
  macrolide:    { cross: ['azithromycin','clarithromycin','erythromycin'], rate: '5-10%', note: 'Some cross-reactivity within macrolide class. Azithromycin sometimes tolerated by erythromycin-allergic patients.' },
};

function addAllergy(allergen, reaction, severity) {
  if (!allergen) return;
  const existing = S_ALLERGIES.findIndex(a => a.allergen.toLowerCase() === allergen.toLowerCase());
  if (existing >= 0) { S_ALLERGIES[existing] = { allergen, reaction, severity }; }
  else { S_ALLERGIES.push({ allergen: allergen.trim(), reaction: reaction || 'Unknown reaction', severity: severity || 'unknown' }); }
  renderAllergyList();
  checkAllergyConflicts();
  notify(`Allergy recorded: ${allergen}`, severity === 'severe' ? 'danger' : 'warn');
}

function removeAllergy(idx) {
  S_ALLERGIES.splice(idx, 1);
  renderAllergyList();
  checkAllergyConflicts();
}

function renderAllergyList() {
  const el = document.getElementById('allergy-list');
  if (!el) return;
  if (!S_ALLERGIES.length) { el.innerHTML = '<div style="color:var(--ink4);font-size:12px;padding:6px 0">No allergies recorded.</div>'; return; }
  el.innerHTML = S_ALLERGIES.map((a,i) => `
    <div style="display:flex;align-items:center;gap:8px;padding:6px 0;border-bottom:1px solid var(--border)">
      <span style="font-size:14px">${a.severity==='severe'?'🚨':a.severity==='moderate'?'⚠️':'ℹ️'}</span>
      <div style="flex:1"><strong style="font-size:12.5px;color:${a.severity==='severe'?'var(--danger)':'var(--warn)'}">${esc(a.allergen)}</strong>
        <span style="font-size:11px;color:var(--ink3);margin-left:6px">${esc(a.reaction)}</span>
        <span class="badge ${a.severity==='severe'?'badge-danger':a.severity==='moderate'?'badge-warn':'badge-gray'}" style="margin-left:6px;font-size:8px">${esc(a.severity)}</span>
      </div>
      <button class="btn btn-xs btn-secondary" onclick="removeAllergy(${i})">✕</button>
    </div>`).join('');
}

function checkAllergyConflicts() {
  const el = document.getElementById('allergy-conflicts');
  if (!el) return;
  const conflicts = [];
  for (const allergy of S_ALLERGIES) {
    const aLow = allergy.allergen.toLowerCase();
    // Check against current drugs
    for (const drug of S.drugs) {
      const dLow = drug.name.toLowerCase();
      if (dLow.includes(aLow) || aLow.includes(dLow)) {
        conflicts.push({ type:'direct', msg:`${drug.name} conflicts with documented ${allergy.allergen} allergy (${allergy.reaction})`, severity:'critical' });
      }
    }
    // Check cross-reactivity
    for (const [cls, data] of Object.entries(ALLERGY_CROSS_REACTIVITY)) {
      if (aLow.includes(cls) || data.cross.some(c => aLow.includes(c))) {
        for (const drug of S.drugs) {
          const dLow = drug.name.toLowerCase();
          if (data.cross.some(c => dLow.includes(c))) {
            conflicts.push({ type:'cross', msg:`${drug.name}: possible cross-reactivity with ${allergy.allergen} allergy. ${data.note}`, severity:'warning' });
          }
        }
      }
    }
    // Check against RX selected drugs
    for (const sel of S_RX.selectedDrugs) {
      const gLow = sel.drug.generic.toLowerCase();
      if (gLow.includes(aLow) || aLow.includes(gLow)) {
        conflicts.push({ type:'rx-direct', msg:`Prescription: ${sel.drug.generic} conflicts with ${allergy.allergen} allergy`, severity:'critical' });
      }
    }
  }

  if (!conflicts.length) { el.style.display='none'; return; }
  el.style.display = 'block';
  el.innerHTML = `<div class="card" style="border-color:var(--danger)">
    <div class="card-head" style="background:var(--cv-t)"><div class="card-title" style="color:var(--danger)">⛔ Allergy Conflict Detected</div></div>
    <div class="card-body">
      ${conflicts.map(c=>`<div style="display:flex;gap:8px;padding:7px 0;border-bottom:1px solid var(--border);font-size:12.5px">
        <span>${c.severity==='critical'?'🚨':'⚠️'}</span>
        <span style="color:${c.severity==='critical'?'var(--danger)':'var(--warn)'}">${esc(c.msg)}</span>
      </div>`).join('')}
    </div>
  </div>`;
}

// ══════════════════════════════════════════════════════════════
// MODULE R — CLINICAL RISK SCORE CALCULATORS
// Calculators: GRACE · CURB-65 · Wells PE · Wells DVT ·
//              CHA₂DS₂-VASc · FINDRISC · NEWS2 · PHQ-9 · GAD-7
// Each: fields, auto-fill from state, scoring, interpretation
// ══════════════════════════════════════════════════════════════

// State for calculator values
const CALC_STATE = {};

const CALCULATORS = [

  {
    id: 'curb65',
    name: 'CURB-65 — Pneumonia Severity',
    source: 'BTS CAP 2009',
    relevant_conds: ['pneumonia'],
    fields: [
      { id:'confusion',    label:'Confusion (new disorientation)',           type:'check', points:1 },
      { id:'urea',         label:'Urea >7 mmol/L',                          type:'check', points:1 },
      { id:'rr',           label:'Respiratory rate ≥30/min',                type:'check', points:1 },
      { id:'bp',           label:'BP systolic <90 OR diastolic ≤60 mmHg',   type:'check', points:1 },
      { id:'age65',        label:'Age ≥65 years',                           type:'check', points:1 },
    ],
    interpret: (score) => {
      if (score <= 1) return { level:'low',      label:'Low Severity',      detail:'30-day mortality ~1.5%. Likely outpatient treatment.', action:'Consider outpatient oral antibiotics (amoxicillin). Review in 48h.' };
      if (score === 2) return { level:'moderate', label:'Moderate Severity', detail:'30-day mortality ~9.2%. Short inpatient admission may be needed.', action:'Consider hospital admission or closely supervised outpatient. Oral or IV antibiotics.' };
      return                  { level:'high',     label:'High Severity',     detail:'Score ≥3 — 30-day mortality ~22%. Hospital admission required.', action:'Hospital admission. Score 4-5: consider ICU. IV antibiotics + respiratory support.' };
    },
    autofill: (pt) => {
      const age65 = pt.age >= 65;
      const rr_present = termPresent(S.corpus || '', 'tachypnoea') || termPresent(S.corpus || '', 'respiratory rate');
      return { age65: age65 ? 1 : 0 };
    },
  },

  {
    id: 'wells_pe',
    name: 'Wells Score — Pulmonary Embolism',
    source: 'Wells et al. 2000 / ESC PE 2019',
    relevant_conds: ['pe'],
    fields: [
      { id:'dvt_signs',    label:'Clinical signs/symptoms of DVT',           type:'check', points:3 },
      { id:'alt_dx',       label:'PE more likely than alternative diagnosis', type:'check', points:3 },
      { id:'hr_100',       label:'Heart rate >100/min',                      type:'check', points:1.5 },
      { id:'immobility',   label:'Immobility ≥3 days OR surgery in last 4 weeks', type:'check', points:1.5 },
      { id:'prev_pe_dvt',  label:'Previous PE or DVT',                       type:'check', points:1.5 },
      { id:'haemoptysis',  label:'Haemoptysis',                              type:'check', points:1 },
      { id:'malignancy',   label:'Malignancy (on treatment/palliated/last 6m)', type:'check', points:1 },
    ],
    interpret: (score) => {
      if (score < 2)  return { level:'low',      label:'Low Probability',      detail:'PE prevalence ~3.6%. D-dimer can rule out.', action:'D-dimer test. If negative: PE excluded (PERC/Wells algorithm).' };
      if (score <= 6) return { level:'moderate', label:'Moderate Probability', detail:'PE prevalence ~20.5%. D-dimer or CT-PA required.', action:'D-dimer. If elevated: CT pulmonary angiogram. Start LMWH if clinical PE likely.' };
      return                  { level:'high',     label:'High Probability',     detail:'PE prevalence ~66.7%. CT-PA required immediately.', action:'CT pulmonary angiogram STAT. Start anticoagulation empirically while awaiting.' };
    },
    autofill: (pt) => {
      const haemo = termPresent(S.corpus || '', 'haemoptysis') ? 1 : 0;
      return { haemoptysis: haemo };
    },
  },

  {
    id: 'wells_dvt',
    name: 'Wells Score — DVT',
    source: 'Wells et al. 2003',
    relevant_conds: ['pe'],
    fields: [
      { id:'active_cancer',    label:'Active cancer (treatment ongoing or within 6m)', type:'check', points:1 },
      { id:'paralysis',        label:'Paralysis, paresis, or recent plaster immobilisation', type:'check', points:1 },
      { id:'bedridden',        label:'Recently bedridden >3 days OR major surgery within 12 weeks', type:'check', points:1 },
      { id:'tenderness',       label:'Localised tenderness along deep venous system', type:'check', points:1 },
      { id:'entire_leg',       label:'Entire leg swollen',                     type:'check', points:1 },
      { id:'calf_swelling',    label:'Calf swelling >3cm vs asymptomatic side', type:'check', points:1 },
      { id:'pitting_oedema',   label:'Pitting oedema (symptomatic leg only)',  type:'check', points:1 },
      { id:'collateral_veins', label:'Collateral superficial veins (non-varicose)', type:'check', points:1 },
      { id:'prev_dvt',         label:'Previously documented DVT',              type:'check', points:1 },
      { id:'alt_dx_likely',    label:'Alternative diagnosis AS or MORE likely', type:'check', points:-2 },
    ],
    interpret: (score) => {
      if (score < 1)  return { level:'low',      label:'Low Probability (DVT unlikely)', detail:'DVT prevalence ~5%. D-dimer to exclude.', action:'D-dimer. If negative: DVT excluded. If positive: Doppler USS.' };
      if (score <= 2) return { level:'moderate', label:'Moderate Probability', detail:'DVT prevalence ~17%. Doppler USS required.', action:'Doppler USS. Start LMWH prophylaxis while awaiting if symptomatic.' };
      return                  { level:'high',     label:'High Probability',     detail:'DVT prevalence ~53%. Doppler USS + anticoagulation.', action:'Doppler USS urgently. Commence LMWH (enoxaparin 1mg/kg BD) empirically.' };
    },
    autofill: () => ({}),
  },

  {
    id: 'grace',
    name: 'GRACE Score — ACS Risk Stratification',
    source: 'ESC ACS 2023 / GRACE 2.0',
    relevant_conds: ['stemi','nstemi_ua'],
    fields: [
      { id:'age_y',      label:'Age (years)',                   type:'number', min:18, max:110,  placeholder:'e.g. 58' },
      { id:'hr_bpm',     label:'Heart Rate (bpm)',              type:'number', min:20, max:250,  placeholder:'e.g. 88' },
      { id:'sbp_mmhg',   label:'Systolic BP (mmHg)',            type:'number', min:50, max:260,  placeholder:'e.g. 130' },
      { id:'creat_umol', label:'Creatinine (μmol/L)',           type:'number', min:20, max:1500, placeholder:'e.g. 90' },
      { id:'killip',     label:'Killip Class (1-4)',            type:'select', options:['1 — No HF','2 — Rales/JVD','3 — Pulmonary oedema','4 — Cardiogenic shock'] },
      { id:'st_change',  label:'ST deviation on ECG',          type:'check', points:28 },
      { id:'cardiac_arrest', label:'Cardiac arrest on admission', type:'check', points:39 },
      { id:'elevated_enzymes', label:'Elevated cardiac enzymes', type:'check', points:14 },
    ],
    interpret: (score) => {
      if (score < 109)  return { level:'low',      label:'Low Risk (GRACE <109)',      detail:'In-hospital mortality <1%. 6-month mortality ~3%.', action:'Conservative management. Angiography within 72h if troponin positive. Early discharge possible.' };
      if (score <= 140) return { level:'moderate', label:'Intermediate Risk (109-140)', detail:'In-hospital mortality 1-3%. 6-month mortality ~3-8%.', action:'Early invasive strategy within 24h (ESC Class I). Dual antiplatelet + anticoagulation.' };
      return                    { level:'high',     label:'High Risk (GRACE >140)',     detail:'In-hospital mortality >3%. High 6-month event rate.', action:'Urgent invasive strategy within 24h (ESC Class I Level A). ICU/HDU monitoring.' };
    },
    autofill: (pt) => {
      const age = pt.age || '';
      const hrVal = S.examFindings?.cv?.['cv_heart rate (bpm)'] || '';
      const bpVal = S.examFindings?.cv?.['cv_blood pressure (mmhg)'] || '';
      return { age_y: age, hr_bpm: hrVal ? hrVal.split('/')[0] : '', sbp_mmhg: bpVal ? bpVal.split('/')[0] : '' };
    },
    score_fn: (vals) => {
      let s = 0;
      const age = parseInt(vals.age_y) || 0;
      if (age < 30) s += 0; else if (age < 40) s += 8; else if (age < 50) s += 25;
      else if (age < 60) s += 41; else if (age < 70) s += 58; else if (age < 80) s += 75;
      else if (age < 90) s += 91; else s += 100;
      const hr = parseInt(vals.hr_bpm) || 0;
      if (hr < 50) s += 0; else if (hr < 70) s += 3; else if (hr < 90) s += 9;
      else if (hr < 110) s += 15; else if (hr < 150) s += 24; else if (hr < 200) s += 38; else s += 46;
      const sbp = parseInt(vals.sbp_mmhg) || 0;
      if (sbp < 80) s += 58; else if (sbp < 100) s += 53; else if (sbp < 120) s += 43;
      else if (sbp < 140) s += 34; else if (sbp < 160) s += 24; else if (sbp < 200) s += 10; else s += 0;
      const cr = parseInt(vals.creat_umol) || 0;
      if (cr < 36) s += 1; else if (cr < 71) s += 4; else if (cr < 106) s += 7;
      else if (cr < 141) s += 10; else if (cr < 177) s += 13; else if (cr < 354) s += 21; else s += 28;
      const killip = parseInt(vals.killip) || 1;
      if (killip === 2) s += 20; else if (killip === 3) s += 39; else if (killip === 4) s += 59;
      if (vals.st_change) s += 28;
      if (vals.cardiac_arrest) s += 39;
      if (vals.elevated_enzymes) s += 14;
      return s;
    },
  },

  {
    id: 'chads_vasc',
    name: 'CHA₂DS₂-VASc — AF Stroke Risk',
    source: 'ESC AF 2020 / NICE NG196',
    relevant_conds: ['arrhythmia','heart_failure'],
    fields: [
      { id:'hf',          label:'Congestive Heart Failure (or EF ≤40%)',  type:'check', points:1 },
      { id:'htn',         label:'Hypertension',                           type:'check', points:1 },
      { id:'age75',       label:'Age ≥75 years',                          type:'check', points:2 },
      { id:'dm',          label:'Diabetes mellitus',                      type:'check', points:1 },
      { id:'stroke_tia',  label:'Stroke or TIA or thromboembolism',       type:'check', points:2 },
      { id:'vasc_disease',label:'Vascular disease (MI, peripheral artery, aortic plaque)', type:'check', points:1 },
      { id:'age65_74',    label:'Age 65-74 years',                        type:'check', points:1 },
      { id:'female',      label:'Female sex category',                    type:'check', points:1 },
    ],
    interpret: (score, pt) => {
      const adjustedScore = pt?.gender === 'F' ? score - 1 : score; // female sex doesn\'t add stroke risk unless other factors
      if (score === 0 && pt?.gender === 'M') return { level:'low', label:'Score 0 (Male) — Very Low Risk', detail:'Annual stroke risk ~0%. No anticoagulation recommended.', action:'No anticoagulation. Review annually and reassess risk.' };
      if (score <= 1 && pt?.gender === 'F') return { level:'low', label:'Score 1 (Female only) — Low Risk', detail:'Female sex alone does not indicate anticoagulation.', action:'No anticoagulation if only risk factor is female sex. Reassess annually.' };
      if (adjustedScore === 1) return { level:'moderate', label:'Score 1 — Low-Moderate Risk', detail:'Annual stroke risk ~1.3%.', action:'Anticoagulation may be considered. Assess bleeding risk (HAS-BLED). Discuss patient preference.' };
      return { level:'high', label:`Score ${score} — High Risk`, detail:`Annual stroke risk ~${score >= 4 ? '4-10' : '2-3'}%.`, action:'Oral anticoagulation recommended (DOAC preferred over warfarin — ESC Grade IA). Choose: apixaban, rivaroxaban, or edoxaban.' };
    },
    autofill: (pt) => {
      const comorbid = (S.patient.comorbid || '').toLowerCase();
      const corpus = S.corpus || '';
      return {
        hf:     termPresent(corpus, 'heart failure') ? 1 : 0,
        htn:    (comorbid.includes('htn') || comorbid.includes('hypertension') || termPresent(corpus, 'hypertension')) ? 1 : 0,
        age75:  (pt.age >= 75) ? 1 : 0,
        age65_74: (pt.age >= 65 && pt.age < 75) ? 1 : 0,
        dm:     (comorbid.includes('dm') || comorbid.includes('diabetes') || termPresent(corpus, 'diabetes')) ? 1 : 0,
        female: (pt.gender === 'F') ? 1 : 0,
      };
    },
  },

  {
    id: 'findrisc',
    name: 'FINDRISC — Type 2 Diabetes Risk',
    source: 'Finnish Diabetes Association / ADA 2024',
    relevant_conds: ['t2dm'],
    fields: [
      { id:'age_cat',    label:'Age',           type:'select', options:['Under 45','45-54 (2 pts)','55-64 (3 pts)','Over 64 (4 pts)'] },
      { id:'bmi_cat',    label:'BMI',           type:'select', options:['<25 kg/m² (0)','25-30 kg/m² (1 pt)','Over 30 kg/m² (3 pts)'] },
      { id:'waist_cat',  label:'Waist circumference', type:'select', options:['Low (0)','Elevated (3 pts)','Very elevated (4 pts)'] },
      { id:'exercise',   label:'Physical activity <30 min daily AND sedentary <4h/day', type:'check', points:2 },
      { id:'vegfruit',   label:'Eats vegetables/fruit less than daily',     type:'check', points:1 },
      { id:'bp_meds',    label:'On antihypertensive medication',            type:'check', points:2 },
      { id:'hbg_hist',   label:'History of high blood glucose (gestational DM counts)', type:'check', points:5 },
      { id:'fam_dm',     label:'Family member with DM (1st/2nd degree)',    type:'check', points:3 },
    ],
    interpret: (score) => {
      if (score < 7)  return { level:'low',      label:'Low Risk (<7)',          detail:'10-year T2DM risk ~1%.', action:'Maintain healthy lifestyle. Screen every 3-5 years.' };
      if (score <= 11) return { level:'low',     label:'Slightly Elevated (7-11)', detail:'10-year risk ~4%.', action:'Lifestyle advice + annual fasting glucose.' };
      if (score <= 14) return { level:'moderate',label:'Moderate (12-14)',        detail:'10-year risk ~17%.', action:'HbA1c + fasting glucose now. Intensive lifestyle intervention.' };
      if (score <= 20) return { level:'high',    label:'High (15-20)',            detail:'10-year risk ~33%.', action:'HbA1c + OGTT. Intensive lifestyle or metformin intervention. 6-monthly monitoring.' };
      return                   { level:'high',   label:'Very High (>20)',          detail:'10-year risk ~50%.', action:'OGTT urgently. High likelihood of existing pre-diabetes/DM. Immediate intervention.' };
    },
    autofill: (pt) => {
      const comorbid = (S.patient.comorbid || '').toLowerCase();
      const corpus = S.corpus || '';
      return {
        fam_dm: (termPresent(corpus, 'family history') && termPresent(corpus, 'diabetes')) ? 1 : 0,
        age_cat: pt.age >= 65 ? 3 : pt.age >= 55 ? 2 : pt.age >= 45 ? 1 : 0,
        bp_meds: (comorbid.includes('htn') || comorbid.includes('hypertension')) ? 1 : 0,
      };
    },
  },

  {
    id: 'news2',
    name: 'NEWS2 — National Early Warning Score',
    source: 'RCP NEWS2 2017 / NICE Sepsis NG51',
    relevant_conds: ['sepsis'],
    fields: [
      { id:'resp_rate', label:'Respiratory Rate (/min)',         type:'number', min:0, max:60, placeholder:'e.g. 18' },
      { id:'spo2',      label:'SpO2 (%)',                       type:'number', min:50, max:100, placeholder:'e.g. 97' },
      { id:'copd_o2',   label:'On supplemental O₂ (including COPD scale)', type:'check', points:2 },
      { id:'temp_c',    label:'Temperature (°C)',               type:'number', min:30, max:43, placeholder:'e.g. 37.4' },
      { id:'sbp_n',     label:'Systolic BP (mmHg)',             type:'number', min:40, max:280, placeholder:'e.g. 120' },
      { id:'hr_n',      label:'Heart Rate (bpm)',               type:'number', min:20, max:250, placeholder:'e.g. 80' },
      { id:'avpu',      label:'AVPU / Consciousness',           type:'select', options:['A — Alert (0)','New confusion (3 pts)','V — Voice response (3 pts)','P — Pain response (3 pts)','U — Unresponsive (3 pts)'] },
    ],
    score_fn: (vals) => {
      let s = 0;
      const rr = parseInt(vals.resp_rate) || 0;
      if (rr <= 8) s += 3; else if (rr <= 11) s += 1; else if (rr <= 20) s += 0; else if (rr <= 24) s += 2; else s += 3;
      const spo2 = parseInt(vals.spo2) || 100;
      if (spo2 <= 91) s += 3; else if (spo2 <= 93) s += 2; else if (spo2 <= 95) s += 1;
      if (vals.copd_o2) s += 2;
      const temp = parseFloat(vals.temp_c) || 37;
      if (temp <= 35) s += 3; else if (temp <= 36) s += 1; else if (temp <= 38) s += 0; else if (temp <= 39) s += 1; else s += 2;
      const sbp = parseInt(vals.sbp_n) || 120;
      if (sbp <= 90) s += 3; else if (sbp <= 100) s += 2; else if (sbp <= 110) s += 1; else if (sbp <= 219) s += 0; else s += 3;
      const hr = parseInt(vals.hr_n) || 80;
      if (hr <= 40) s += 3; else if (hr <= 50) s += 1; else if (hr <= 90) s += 0; else if (hr <= 110) s += 1; else if (hr <= 130) s += 2; else s += 3;
      const avpu = parseInt(vals.avpu) || 0;
      if (avpu > 0) s += 3;
      return s;
    },
    interpret: (score) => {
      if (score < 5)  return { level:'low',      label:'NEWS2 0-4 — Low Risk',          detail:'Low risk of deterioration. Routine monitoring.', action:'Routine observations. Reassess in 12h.' };
      if (score < 7)  return { level:'moderate', label:'NEWS2 5-6 — Medium Risk',        detail:'Medium risk. Increased monitoring needed.', action:'Urgent clinical review within 1 hour. Increase monitoring frequency. Consider HDU.' };
      if (score < 9)  return { level:'high',     label:'NEWS2 7-8 — High Risk',          detail:'High risk of deterioration. Senior review needed.', action:'Urgent senior clinical review. Consider HDU/ICU. Activate sepsis pathway if suspected.' };
      return                   { level:'critical', label:'NEWS2 ≥9 — Critical Risk',       detail:'Critical — emergency medical team (EMT) response required.', action:'Emergency team activation. ICU/HDU. Sepsis 6 bundle if infection suspected.' };
    },
    autofill: (pt) => {
      const vitals = S.examFindings?.cv || {};
      const spo2 = Object.entries(vitals).find(([k]) => k.includes('spo2'));
      const hr = Object.entries(vitals).find(([k]) => k.includes('heart rate'));
      const bp = Object.entries(vitals).find(([k]) => k.includes('blood pressure'));
      return {
        spo2: spo2 ? spo2[1].replace(/[^0-9]/g,'') : '',
        hr_n: hr ? hr[1].replace(/[^0-9]/g,'') : '',
        sbp_n: bp ? bp[1].split('/')[0].replace(/[^0-9]/g,'') : '',
      };
    },
  },

  {
    id: 'phq9',
    name: 'PHQ-9 — Depression Severity',
    source: 'Kroenke et al. 2001 / NICE NG222',
    relevant_conds: ['depression'],
    fields: [
      { id:'p1',  label:'Little interest or pleasure in doing things',               type:'select', options:['Not at all (0)','Several days (1)','More than half the days (2)','Nearly every day (3)'] },
      { id:'p2',  label:'Feeling down, depressed, or hopeless',                     type:'select', options:['Not at all (0)','Several days (1)','More than half the days (2)','Nearly every day (3)'] },
      { id:'p3',  label:'Trouble falling/staying asleep, or sleeping too much',      type:'select', options:['Not at all (0)','Several days (1)','More than half the days (2)','Nearly every day (3)'] },
      { id:'p4',  label:'Feeling tired or having little energy',                     type:'select', options:['Not at all (0)','Several days (1)','More than half the days (2)','Nearly every day (3)'] },
      { id:'p5',  label:'Poor appetite or overeating',                               type:'select', options:['Not at all (0)','Several days (1)','More than half the days (2)','Nearly every day (3)'] },
      { id:'p6',  label:'Feeling bad about yourself — or that you are a failure',    type:'select', options:['Not at all (0)','Several days (1)','More than half the days (2)','Nearly every day (3)'] },
      { id:'p7',  label:'Trouble concentrating on things',                           type:'select', options:['Not at all (0)','Several days (1)','More than half the days (2)','Nearly every day (3)'] },
      { id:'p8',  label:'Moving/speaking so slowly others could have noticed, or being fidgety', type:'select', options:['Not at all (0)','Several days (1)','More than half the days (2)','Nearly every day (3)'] },
      { id:'p9',  label:'Thoughts that you would be better off dead, or of hurting yourself', type:'select', options:['Not at all (0)','Several days (1)','More than half the days (2)','Nearly every day (3)'] },
    ],
    interpret: (score) => {
      if (score < 5)  return { level:'low',      label:'Minimal Depression (0-4)',    detail:'No significant depressive symptoms.', action:'No treatment needed. Supportive guidance.' };
      if (score < 10) return { level:'low',      label:'Mild Depression (5-9)',       detail:'Mild depressive symptoms. Watchful waiting.', action:'Watchful waiting + psychoeducation. Exercise prescription. Review in 2-4 weeks.' };
      if (score < 15) return { level:'moderate', label:'Moderate Depression (10-14)', detail:'Moderate depression — treatment indicated.', action:'SSRI (sertraline 50mg) + CBT referral. Review at 4 weeks.' };
      if (score < 20) return { level:'high',     label:'Moderately Severe (15-19)',  detail:'Moderately severe — active treatment required.', action:'SSRI + active CBT. Safety assessment (item 9). Review in 2 weeks.' };
      return                   { level:'critical', label:'Severe Depression (20-27)',   detail:'Severe depression — urgent psychiatric assessment if item 9 positive.', action:'URGENT: if item 9 ≥2: psychiatric referral same day. Start SSRI + CBT. Crisis safety plan.' };
    },
    autofill: () => ({}),
    special_check: (vals) => {
      const p9 = parseInt(vals.p9) || 0;
      if (p9 >= 1) return { type:'danger', msg: `⚠ PHQ-9 Item 9 (suicidality) score: ${p9}. Direct suicidality assessment is MANDATORY. If score ≥2: psychiatric emergency referral.` };
      return null;
    },
  },

  {
    id: 'gad7',
    name: 'GAD-7 — Anxiety Severity',
    source: 'Spitzer et al. 2006 / NICE NG197',
    relevant_conds: ['anxiety'],
    fields: [
      { id:'g1', label:'Feeling nervous, anxious, or on edge',               type:'select', options:['Not at all (0)','Several days (1)','More than half the days (2)','Nearly every day (3)'] },
      { id:'g2', label:'Not being able to stop or control worrying',         type:'select', options:['Not at all (0)','Several days (1)','More than half the days (2)','Nearly every day (3)'] },
      { id:'g3', label:'Worrying too much about different things',           type:'select', options:['Not at all (0)','Several days (1)','More than half the days (2)','Nearly every day (3)'] },
      { id:'g4', label:'Trouble relaxing',                                   type:'select', options:['Not at all (0)','Several days (1)','More than half the days (2)','Nearly every day (3)'] },
      { id:'g5', label:'Being so restless it is hard to sit still',          type:'select', options:['Not at all (0)','Several days (1)','More than half the days (2)','Nearly every day (3)'] },
      { id:'g6', label:'Becoming easily annoyed or irritable',               type:'select', options:['Not at all (0)','Several days (1)','More than half the days (2)','Nearly every day (3)'] },
      { id:'g7', label:'Feeling afraid as if something awful might happen',  type:'select', options:['Not at all (0)','Several days (1)','More than half the days (2)','Nearly every day (3)'] },
    ],
    interpret: (score) => {
      if (score < 5)  return { level:'low',      label:'Minimal Anxiety (0-4)',    detail:'Below threshold for GAD.', action:'Reassurance. Stress management advice.' };
      if (score < 10) return { level:'low',      label:'Mild Anxiety (5-9)',       detail:'Mild anxiety symptoms.', action:'Watchful waiting + psychoeducation + exercise. Review 2-4 weeks.' };
      if (score < 15) return { level:'moderate', label:'Moderate Anxiety (10-14)', detail:'Probable GAD — treatment indicated.', action:'CBT referral + consider sertraline 50mg. Review 4 weeks.' };
      return                   { level:'high',   label:'Severe Anxiety (15-21)',   detail:'Severe GAD — active treatment and monitoring.', action:'SSRI + active CBT. Review 2 weeks. If panic attacks: consider pregabalin or beta-blocker add-on.' };
    },
    autofill: () => ({}),
  },

];

// ── Calculator rendering ────────────────────────────────────

function initCalcState() {
  CALCULATORS.forEach(calc => {
    if (!CALC_STATE[calc.id]) CALC_STATE[calc.id] = {};
    // Auto-fill from patient/clinical data
    if (calc.autofill) {
      const fills = calc.autofill(S.patient || {});
      Object.assign(CALC_STATE[calc.id], fills);
    }
  });
}

function renderCalculators() {
  const el = document.getElementById('calc-scores-content');
  if (!el) return;

  initCalcState();

  // Determine which calculators to show prominently
  const activeConds = new Set([
    ...S.differential.t3.map(d => d.id),
    ...S.differential.t1.map(d => d.id),
  ]);

  let html = '';

  // Relevant calculators first (based on differential)
  const relevant = CALCULATORS.filter(c => c.relevant_conds?.some(rc => activeConds.has(rc)));
  const others   = CALCULATORS.filter(c => !c.relevant_conds?.some(rc => activeConds.has(rc)));
  const ordered  = [...relevant, ...others];

  for (const calc of ordered) {
    const isRelevant = relevant.includes(calc);
    html += renderCalcCard(calc, isRelevant);
  }

  el.innerHTML = html || '<div class="empty-state">No calculators loaded.</div>';
}

function renderCalcCard(calc, isRelevant) {
  const state = CALC_STATE[calc.id] || {};
  const score = computeCalcScore(calc, state);
  const result = score !== null ? calc.interpret(score, S.patient || {}) : null;

  const fields = calc.fields.map((f, fi) => {
    const val = state[f.id] !== undefined ? state[f.id] : '';
    let inputHtml = '';

    if (f.type === 'check') {
      const checked = val == 1 || val === true;
      inputHtml = `<div class="calc-checkbox-row ${checked ? 'checked' : ''}" onclick="toggleCalcCheck('${calc.id}','${f.id}')">
        <div class="calc-checkbox">${checked ? '✓' : ''}</div>
        <span>${esc(f.label)}</span>
        <span class="calc-points">+${f.points}</span>
      </div>`;
    } else if (f.type === 'number') {
      inputHtml = `<div class="calc-field">
        <label>${esc(f.label)}</label>
        <input class="calc-input" type="number" min="${f.min||0}" max="${f.max||999}" placeholder="${esc(f.placeholder||'')}" value="${esc(val)}" oninput="updateCalc('${calc.id}','${f.id}',this.value)">
      </div>`;
    } else if (f.type === 'select') {
      inputHtml = `<div class="calc-field">
        <label>${esc(f.label)}</label>
        <select class="calc-select" onchange="updateCalc('${calc.id}','${f.id}',this.selectedIndex)">
          ${(f.options || []).map((opt, oi) => `<option value="${oi}" ${parseInt(val) === oi ? 'selected' : ''}>${esc(opt)}</option>`).join('')}
        </select>
      </div>`;
    }

    return inputHtml;
  }).join('');

  // Separate checks from number/select fields
  const checkFields  = calc.fields.filter(f => f.type === 'check');
  const inputFields  = calc.fields.filter(f => f.type !== 'check');
  const checkHtml    = checkFields.map(f => {
    const val = state[f.id] !== undefined ? state[f.id] : '';
    const checked = val == 1 || val === true;
    return `<div class="calc-checkbox-row ${checked ? 'checked' : ''}" onclick="toggleCalcCheck('${calc.id}','${f.id}')">
      <div class="calc-checkbox">${checked ? '✓' : ''}</div>
      <span>${esc(f.label)}</span>
      <span class="calc-points">+${f.points || 1}</span>
    </div>`;
  }).join('');

  const inputHtmlBlock = inputFields.length ? `<div class="calc-grid" style="grid-template-columns:repeat(${Math.min(inputFields.length,3)},1fr)">
    ${inputFields.map(f => {
      const val = state[f.id] !== undefined ? state[f.id] : '';
      if (f.type === 'number') {
        return `<div class="calc-field"><label>${esc(f.label)}</label><input class="calc-input" type="number" min="${f.min||0}" max="${f.max||999}" placeholder="${esc(f.placeholder||'')}" value="${esc(val)}" oninput="updateCalc('${calc.id}','${f.id}',this.value)"></div>`;
      } else if (f.type === 'select') {
        return `<div class="calc-field"><label>${esc(f.label)}</label><select class="calc-select" onchange="updateCalc('${calc.id}','${f.id}',this.selectedIndex)">${(f.options||[]).map((opt,oi)=>`<option value="${oi}" ${parseInt(val)===oi?'selected':''}>${esc(opt)}</option>`).join('')}</select></div>`;
      }
      return '';
    }).join('')}
  </div>` : '';

  const special = (calc.special_check && result) ? calc.special_check(state) : null;

  const resultHtml = result ? `<div class="calc-result ${result.level}">
    <div class="calc-score-num">${score !== null ? score : '—'}</div>
    <div class="calc-result-label">${esc(result.label)}</div>
    <div class="calc-result-detail">${esc(result.detail)}</div>
    <div class="calc-action">${esc(result.action)}</div>
  </div>` : '';

  const specialHtml = special ? `<div class="process-banner ${special.type}" style="margin-top:10px">${esc(special.msg)}</div>` : '';

  return `<div class="calc-card">
    <div class="calc-head" onclick="toggleCalcBody('${calc.id}')">
      <div class="calc-title">
        ${isRelevant ? '<span style="color:var(--accent)">●</span>' : '<span style="color:var(--border2)">○</span>'}
        ${esc(calc.name)}
        ${isRelevant ? '<span class="badge badge-ok" style="font-size:8px">Relevant</span>' : ''}
        ${result ? `<span class="badge badge-${result.level === 'low' ? 'ok' : result.level === 'moderate' ? 'warn' : 'danger'}" style="margin-left:4px">${score !== null ? score : '—'}</span>` : ''}
      </div>
      <div style="display:flex;align-items:center;gap:8px">
        <span class="calc-source">${esc(calc.source)}</span>
        <span id="calc-toggle-${calc.id}" style="font-size:11px;color:var(--ink4)">${isRelevant ? '▲' : '▼'}</span>
      </div>
    </div>
    <div class="calc-body ${isRelevant ? '' : 'collapsed'}" id="calc-body-${calc.id}">
      ${inputHtmlBlock}
      ${checkHtml ? `<div style="display:flex;flex-direction:column;gap:5px;margin-bottom:12px">${checkHtml}</div>` : ''}
      ${resultHtml}
      ${specialHtml}
    </div>
  </div>`;
}

function toggleCalcBody(calcId) {
  const body = document.getElementById(`calc-body-${calcId}`);
  const toggle = document.getElementById(`calc-toggle-${calcId}`);
  if (body) {
    body.classList.toggle('collapsed');
    if (toggle) toggle.textContent = body.classList.contains('collapsed') ? '▼' : '▲';
  }
}

function toggleCalcCheck(calcId, fieldId) {
  if (!CALC_STATE[calcId]) CALC_STATE[calcId] = {};
  CALC_STATE[calcId][fieldId] = CALC_STATE[calcId][fieldId] ? 0 : 1;
  reRenderCalc(calcId);
}

function updateCalc(calcId, fieldId, value) {
  if (!CALC_STATE[calcId]) CALC_STATE[calcId] = {};
  CALC_STATE[calcId][fieldId] = value;
  reRenderCalc(calcId);
}

function reRenderCalc(calcId) {
  const calc = CALCULATORS.find(c => c.id === calcId);
  if (!calc) return;
  const relevant = CALCULATORS.filter(c => c.relevant_conds?.some(rc =>
    new Set([...S.differential.t3.map(d=>d.id),...S.differential.t1.map(d=>d.id)]).has(rc)));
  const isRelevant = relevant.includes(calc);
  const parent = document.querySelector(`.calc-card [id="calc-body-${calcId}"]`)?.closest('.calc-card');
  if (!parent) return;
  const wasOpen = !parent.querySelector('.calc-body')?.classList.contains('collapsed');
  parent.outerHTML = renderCalcCard(calc, isRelevant);
  // Restore open state
  if (wasOpen) {
    const newBody = document.getElementById(`calc-body-${calcId}`);
    if (newBody) newBody.classList.remove('collapsed');
    const toggle = document.getElementById(`calc-toggle-${calcId}`);
    if (toggle) toggle.textContent = '▲';
  }
}

function computeCalcScore(calc, vals) {
  if (calc.score_fn) return calc.score_fn(vals);
  // Default: sum checkboxes + select values
  let total = 0;
  for (const f of calc.fields) {
    const v = vals[f.id];
    if (f.type === 'check') {
      if (v == 1 || v === true) total += (f.points || 1);
    } else if (f.type === 'select') {
      total += parseInt(v) || 0;
    }
  }
  return total;
}

function switchCalcTab(tab, btn) {
  document.querySelectorAll('#step-8 .assess-tab').forEach(b => b.classList.remove('active'));
  document.querySelectorAll('#step-8 .assess-tab-pane').forEach(p => p.classList.remove('active'));
  if (btn) btn.classList.add('active');
  const pane = document.getElementById(`calc-${tab}`);
  if (pane) pane.classList.add('active');
  if (tab === 'scores' && !document.getElementById('calc-scores-content')?.children.length) renderCalculators();
  if (tab === 'soap') buildSOAPNote();
  if (tab === 'icd') renderICDSuggested();
}

// ══════════════════════════════════════════════════════════════
// MODULE S — SOAP NOTE GENERATOR
// Auto-fills Subjective, Objective, Assessment, Plan from case data
// ══════════════════════════════════════════════════════════════

function buildSOAPNote() {
  const soapEl = document.getElementById('soap-content');
  const soapGen = document.getElementById('soap-generated');
  const soapOut = document.getElementById('soap-output');
  if (!soapEl || !soapOut) return;

  if (!S.corpus) {
    soapEl.innerHTML = '<div class="empty-state"><div class="empty-state-icon">📋</div>Run intake analysis first to auto-generate SOAP note.</div>';
    return;
  }

  soapEl.style.display = 'none';
  soapGen.style.display = 'block';

  const pt = S.patient;
  const today = new Date().toLocaleDateString('en-IN', { weekday:'long', year:'numeric', month:'long', day:'numeric' });
  const filled = S.gaps.filter(g => g.value);

  // ── S: Subjective ──────────────────────────────────────────
  const symptoms = Object.keys(S.activeSystems).map(id => SYSTEMS[id]?.activators.filter(a => termPresent(S.corpus, a))).flat().filter(Boolean);
  const uniqueSymptoms = [...new Set(symptoms)];
  const duration = filled.find(g => g.key === 'duration')?.value || 'duration not specified';
  const onset = filled.find(g => g.key === 'onset')?.value || '';
  const historyItems = filled.filter(g => !['duration','onset'].includes(g.key)).map(g => `${g.label}: ${g.value}`).join('. ');

  let subjective = `Chief complaint: ${esc(S.rawInput?.slice(0,200) || '—')}\n\n`;
  subjective += `The patient presents with ${uniqueSymptoms.slice(0,5).join(', ')}`;
  if (duration) subjective += ` for ${duration}`;
  if (onset) subjective += `. Onset: ${onset}`;
  subjective += '.\n\n';
  if (historyItems) subjective += `History: ${historyItems}.\n\n`;
  if (S.patient.comorbid) subjective += `Background: ${S.patient.comorbid}.\n`;
  if (CLINICAL_NOTES.intake) subjective += `\nAdditional notes: ${CLINICAL_NOTES.intake}`;

  // ── O: Objective ───────────────────────────────────────────
  let objective = '';
  const examEntries = Object.entries(S.examFindings).flatMap(([sysId, findings]) =>
    Object.entries(findings).filter(([,v]) => v).map(([k, v]) => `${k.replace(/_/g,' ').replace(sysId+'_','')}: ${v}`)
  );
  if (examEntries.length) objective += `Examination:\n${examEntries.join('\n')}\n\n`;
  const labEntries = Object.entries(S.labs).filter(([,v]) => v).map(([k,v]) => {
    const def = Object.values(LAB_DEFS).flat().find(d => d.key === k);
    return `${def?.name || k}: ${v} ${def?.unit || ''}`;
  });
  if (labEntries.length) objective += `Investigations:\n${labEntries.join('\n')}\n\n`;
  if (!objective) objective = 'Examination and investigations pending documentation.\n';
  if (CLINICAL_NOTES.history) objective += `\nClinical notes: ${CLINICAL_NOTES.history}`;

  // ── A: Assessment ──────────────────────────────────────────
  const diff = S.differential;
  const mnm = diff.must_not_miss || diff.t3 || [];
  const ml  = diff.most_likely   || diff.t1 || [];
  let assessment = '';
  if (mnm.length) assessment += `Must not miss: ${mnm.map(c => c.name || c.cond?.name).filter(Boolean).join('; ')}.\n\n`;
  if (ml.length)  assessment += `Most likely diagnoses:\n${ml.map((c,i) => `${i+1}. ${c.name || c.cond?.name} — ${(c.reason || '').slice(0,80)}`).filter(Boolean).join('\n')}\n\n`;
  assessment += `Diagnostic certainty: ${S.certainty}%.\n`;
  if (S.redFlags.length) assessment += `\nRed flags identified: ${S.redFlags.map(f => f.msg.slice(0,60)).join('; ')}.\n`;
  if (CLINICAL_NOTES.impression) assessment += `\nClinical impression: ${CLINICAL_NOTES.impression}`;

  // ── P: Plan ────────────────────────────────────────────────
  let plan = '';
  const urgent = S.nextSteps.filter(s => s.urgency === 'urgent');
  const routine = S.nextSteps.filter(s => s.urgency !== 'urgent');
  if (urgent.length)  plan += `Immediate:\n${urgent.map((s,i) => `${i+1}. ${s.action}`).join('\n')}\n\n`;
  if (routine.length) plan += `Investigations/Follow-up:\n${routine.slice(0,4).map((s,i) => `${i+1}. ${s.action}`).join('\n')}\n\n`;
  if (S_RX.selectedDrugs.length) {
    plan += `Prescription:\n${S_RX.selectedDrugs.map((sel,i) => `${i+1}. ${sel.drug.generic} ${sel.drug.dose} ${sel.drug.freq} for ${sel.drug.duration}`).join('\n')}\n\n`;
  }
  const topCond = ml[0] || mnm[0];
  if (topCond) {
    const kb = lookupKB(topCond.id || topCond.cond?.id || '');
    if (kb?.referral?.length) plan += `Referral consideration: ${kb.referral[0]}\n`;
  }
  plan += `\nFollow up in ${S.redFlags.length > 0 ? '3-5' : '14'} days or sooner if symptoms worsen.`;

  soapOut.innerHTML = `
    <div class="soap-section soap-s">
      <div class="soap-section-head">
        <div class="soap-letter">S</div>
        <div class="soap-section-title">Subjective — Chief Complaint &amp; History</div>
      </div>
      <textarea class="soap-editable" id="soap-s-text" rows="6">${subjective.trim()}</textarea>
    </div>
    <div class="soap-section soap-o" style="margin-top:14px">
      <div class="soap-section-head">
        <div class="soap-letter">O</div>
        <div class="soap-section-title">Objective — Examination &amp; Investigations</div>
      </div>
      <textarea class="soap-editable" id="soap-o-text" rows="6">${objective.trim()}</textarea>
    </div>
    <div class="soap-section soap-a" style="margin-top:14px">
      <div class="soap-section-head">
        <div class="soap-letter">A</div>
        <div class="soap-section-title">Assessment — Diagnosis &amp; Reasoning</div>
      </div>
      <textarea class="soap-editable" id="soap-a-text" rows="6">${assessment.trim()}</textarea>
    </div>
    <div class="soap-section soap-p" style="margin-top:14px">
      <div class="soap-section-head">
        <div class="soap-letter">P</div>
        <div class="soap-section-title">Plan — Investigations, Treatment &amp; Follow-up</div>
      </div>
      <textarea class="soap-editable" id="soap-p-text" rows="7">${plan.trim()}</textarea>
    </div>
    <div style="margin-top:12px;padding-top:10px;border-top:1px solid var(--border);font-size:11px;color:var(--ink4)">
      Generated: ${today} · ${pt.age||'?'}y ${pt.gender==='F'?'Female':pt.gender==='M'?'Male':''} · Certainty: ${S.certainty}%
    </div>`;
}

function copySoap() {
  const parts = ['S','O','A','P'].map(letter => {
    const el = document.getElementById(`soap-${letter.toLowerCase()}-text`);
    return el ? `=== ${letter}: ===\n${el.value}` : '';
  }).filter(Boolean).join('\n\n');
  navigator.clipboard?.writeText(parts).then(() => notify('SOAP note copied to clipboard ✓', 'ok')).catch(() => notify('Copy failed — select text manually', 'warn'));
}

// ══════════════════════════════════════════════════════════════
// MODULE T — ICD-10 CODING ASSISTANT
// ══════════════════════════════════════════════════════════════

const ICD10_DB = [
  // Cardiovascular
  { code:'I21.0', desc:'ST elevation (STEMI) myocardial infarction of anterior wall', chapter:'Cardiovascular' },
  { code:'I21.1', desc:'STEMI of inferior wall', chapter:'Cardiovascular' },
  { code:'I21.4', desc:'Non-ST elevation (NSTEMI) myocardial infarction', chapter:'Cardiovascular' },
  { code:'I20.0', desc:'Unstable angina', chapter:'Cardiovascular' },
  { code:'I20.9', desc:'Angina pectoris, unspecified', chapter:'Cardiovascular' },
  { code:'I26.9', desc:'Pulmonary embolism without acute cor pulmonale', chapter:'Cardiovascular' },
  { code:'I71.0', desc:'Dissection of aorta (any part)', chapter:'Cardiovascular' },
  { code:'I50.0', desc:'Congestive heart failure', chapter:'Cardiovascular' },
  { code:'I50.9', desc:'Heart failure, unspecified', chapter:'Cardiovascular' },
  { code:'I48.0', desc:'Paroxysmal atrial fibrillation', chapter:'Cardiovascular' },
  { code:'I48.2', desc:'Chronic atrial fibrillation', chapter:'Cardiovascular' },
  { code:'I10',   desc:'Essential (primary) hypertension', chapter:'Cardiovascular' },
  { code:'I47.2', desc:'Ventricular tachycardia', chapter:'Cardiovascular' },
  // Respiratory
  { code:'J18.9', desc:'Pneumonia, unspecified', chapter:'Respiratory' },
  { code:'J44.1', desc:'COPD with acute exacerbation', chapter:'Respiratory' },
  { code:'J44.0', desc:'COPD with acute lower respiratory infection', chapter:'Respiratory' },
  { code:'J45.9', desc:'Asthma, unspecified', chapter:'Respiratory' },
  { code:'J45.0', desc:'Predominantly allergic asthma', chapter:'Respiratory' },
  { code:'A15.0', desc:'Pulmonary tuberculosis, confirmed bacteriologically', chapter:'Respiratory/Infectious' },
  { code:'A16.0', desc:'Pulmonary tuberculosis, bacteriologically and histologically negative', chapter:'Respiratory/Infectious' },
  // Endocrine
  { code:'E11.9', desc:'Type 2 diabetes mellitus, without complications', chapter:'Endocrine' },
  { code:'E11.0', desc:'Type 2 diabetes mellitus with hyperosmolarity', chapter:'Endocrine' },
  { code:'E10.1', desc:'Type 1 diabetes mellitus with ketoacidosis', chapter:'Endocrine' },
  { code:'E03.9', desc:'Hypothyroidism, unspecified', chapter:'Endocrine' },
  { code:'E05.0', desc:'Thyrotoxicosis with diffuse goitre (Graves)', chapter:'Endocrine' },
  { code:'E28.2', desc:'Polycystic ovarian syndrome (PCOS)', chapter:'Endocrine' },
  { code:'E78.5', desc:'Hyperlipidaemia, unspecified (dyslipidaemia)', chapter:'Endocrine' },
  // Neurological
  { code:'I60.9', desc:'Subarachnoid haemorrhage, unspecified', chapter:'Neurological' },
  { code:'I63.9', desc:'Cerebral infarction, unspecified (ischaemic stroke)', chapter:'Neurological' },
  { code:'I64',   desc:'Stroke, not specified as haemorrhage or infarction (TIA)', chapter:'Neurological' },
  { code:'G03.9', desc:'Meningitis, unspecified', chapter:'Neurological' },
  { code:'G43.9', desc:'Migraine, unspecified', chapter:'Neurological' },
  { code:'G43.0', desc:'Migraine without aura', chapter:'Neurological' },
  { code:'G43.1', desc:'Migraine with aura', chapter:'Neurological' },
  { code:'G44.2', desc:'Tension-type headache', chapter:'Neurological' },
  // Gastrointestinal
  { code:'K92.0', desc:'Haematemesis (upper GI bleeding)', chapter:'Gastrointestinal' },
  { code:'K92.1', desc:'Melaena', chapter:'Gastrointestinal' },
  { code:'K25.0', desc:'Gastric ulcer, acute with haemorrhage', chapter:'Gastrointestinal' },
  { code:'K57.3', desc:'Diverticular disease of large intestine', chapter:'Gastrointestinal' },
  { code:'K80.0', desc:'Calculus of gallbladder with acute cholecystitis', chapter:'Gastrointestinal' },
  { code:'K85.9', desc:'Acute pancreatitis, unspecified', chapter:'Gastrointestinal' },
  { code:'K21.0', desc:'Gastro-oesophageal reflux disease (GERD) with oesophagitis', chapter:'Gastrointestinal' },
  { code:'K74.6', desc:'Other and unspecified cirrhosis of liver', chapter:'Gastrointestinal' },
  // Haematological
  { code:'D50.9', desc:'Iron deficiency anaemia, unspecified', chapter:'Haematological' },
  { code:'D51.0', desc:'Vitamin B12 deficiency anaemia due to intrinsic factor deficiency', chapter:'Haematological' },
  { code:'C81.9', desc:'Hodgkin lymphoma, unspecified', chapter:'Haematological' },
  { code:'C85.9', desc:'Non-Hodgkin lymphoma, unspecified', chapter:'Haematological' },
  // Musculoskeletal
  { code:'M10.9', desc:'Gout, unspecified', chapter:'Musculoskeletal' },
  { code:'M05.9', desc:'Seropositive rheumatoid arthritis, unspecified', chapter:'Musculoskeletal' },
  { code:'M06.9', desc:'Rheumatoid arthritis, unspecified', chapter:'Musculoskeletal' },
  { code:'M00.9', desc:'Pyogenic arthritis (septic arthritis), unspecified', chapter:'Musculoskeletal' },
  { code:'M15.9', desc:'Polyosteoarthritis, unspecified', chapter:'Musculoskeletal' },
  // Renal / Urinary
  { code:'N39.0', desc:'Urinary tract infection, site not specified', chapter:'Renal' },
  { code:'N10',   desc:'Acute pyelonephritis (upper UTI)', chapter:'Renal' },
  { code:'N18.3', desc:'Chronic kidney disease, stage 3', chapter:'Renal' },
  { code:'N18.5', desc:'Chronic kidney disease, stage 5', chapter:'Renal' },
  // Psychiatric
  { code:'F32.0', desc:'Mild depressive episode', chapter:'Psychiatric' },
  { code:'F32.1', desc:'Moderate depressive episode', chapter:'Psychiatric' },
  { code:'F32.2', desc:'Severe depressive episode without psychotic symptoms', chapter:'Psychiatric' },
  { code:'F32.9', desc:'Depressive episode, unspecified', chapter:'Psychiatric' },
  { code:'F41.1', desc:'Generalised anxiety disorder (GAD)', chapter:'Psychiatric' },
  { code:'F41.0', desc:'Panic disorder', chapter:'Psychiatric' },
  // Sepsis / Infectious
  { code:'A41.9', desc:'Sepsis, unspecified organism', chapter:'Infectious' },
  { code:'A41.0', desc:'Sepsis due to Staphylococcus aureus', chapter:'Infectious' },
  { code:'R65.20',desc:'Severe sepsis without septic shock', chapter:'Infectious' },
  { code:'R65.21',desc:'Severe sepsis with septic shock', chapter:'Infectious' },
  // Symptoms (when diagnosis not confirmed)
  { code:'R05',   desc:'Cough', chapter:'Symptoms' },
  { code:'R06.0', desc:'Dyspnoea', chapter:'Symptoms' },
  { code:'R07.9', desc:'Chest pain, unspecified', chapter:'Symptoms' },
  { code:'R51',   desc:'Headache', chapter:'Symptoms' },
  { code:'R10.9', desc:'Abdominal pain, unspecified', chapter:'Symptoms' },
  { code:'R53',   desc:'Malaise and fatigue', chapter:'Symptoms' },
  { code:'R11',   desc:'Nausea and vomiting', chapter:'Symptoms' },
  { code:'R00.0', desc:'Tachycardia, unspecified', chapter:'Symptoms' },
  { code:'R00.1', desc:'Bradycardia, unspecified', chapter:'Symptoms' },
  { code:'R42',   desc:'Dizziness and giddiness', chapter:'Symptoms' },
  { code:'R55',   desc:'Syncope and collapse', chapter:'Symptoms' },
  { code:'R80',   desc:'Proteinuria, unspecified', chapter:'Symptoms' },
];

// Map condition IDs to ICD codes
const COND_ICD_MAP = {
  stemi:               ['I21.0','I21.1'],
  nstemi_ua:           ['I21.4','I20.0'],
  pe:                  ['I26.9'],
  aortic_dissection:   ['I71.0'],
  heart_failure:       ['I50.0','I50.9'],
  arrhythmia:          ['I47.2','I48.0'],
  hypertension:        ['I10'],
  pneumonia:           ['J18.9'],
  copd_exac:           ['J44.1','J44.0'],
  asthma:              ['J45.9','J45.0'],
  tb:                  ['A15.0','A16.0'],
  pulmonary_tb:        ['A15.0'],
  t2dm:                ['E11.9'],
  dka:                 ['E10.1'],
  hypothyroid:         ['E03.9'],
  hyperthyroid:        ['E05.0'],
  pcos:                ['E28.2'],
  sah:                 ['I60.9'],
  stroke:              ['I63.9'],
  meningitis:          ['G03.9'],
  migraine:            ['G43.9','G43.0'],
  gi_bleed:            ['K92.0','K92.1'],
  acute_abdomen:       ['K85.9'],
  lymphoma:            ['C85.9','C81.9'],
  iron_deficiency:     ['D50.9'],
  iron_deficiency_anaemia: ['D50.9'],
  septic_arthritis:    ['M00.9'],
  rheumatoid:          ['M05.9','M06.9'],
  gout:                ['M10.9'],
  depression:          ['F32.9','F32.1'],
  anxiety:             ['F41.1'],
  uti:                 ['N39.0','N10'],
  sepsis:              ['A41.9','R65.20'],
};

const S_ICD = { selected: new Set() };

function renderICDSuggested() {
  const el = document.getElementById('icd-suggested');
  if (!el) return;

  const allConds = [...(S.differential.must_not_miss||S.differential.t3||[]), ...(S.differential.most_likely||S.differential.t1||[])];
  const suggestedCodes = [];
  const seenCodes = new Set();

  for (const item of allConds.slice(0,5)) {
    const condId = item.id || item.cond?.id;
    const codes = COND_ICD_MAP[condId] || [];
    for (const code of codes.slice(0,2)) {
      if (!seenCodes.has(code)) {
        const entry = ICD10_DB.find(e => e.code === code);
        if (entry) { suggestedCodes.push({ ...entry, condName: item.name || item.cond?.name }); seenCodes.add(code); }
      }
    }
  }

  if (!suggestedCodes.length) {
    el.innerHTML = '<div style="color:var(--ink4);font-size:12px">Run analysis to get ICD-10 suggestions.</div>';
    return;
  }

  el.innerHTML = `<div style="font-size:10px;font-weight:700;color:var(--ink4);text-transform:uppercase;letter-spacing:.8px;margin-bottom:8px">Suggested from Differential</div>
    ${suggestedCodes.map(e => {
      const isSelected = S_ICD.selected.has(e.code);
      return `<div class="icd-result ${isSelected ? 'selected' : ''}" onclick="toggleICD('${e.code}')">
        <div class="icd-code">${esc(e.code)}</div>
        <div class="icd-desc">${esc(e.desc)}</div>
        <div class="icd-chapter">${esc(e.chapter)}</div>
        <span style="font-size:16px;color:${isSelected?'var(--ok)':'var(--border2)'}">${isSelected?'✓':'+'}</span>
      </div>`;
    }).join('')}`;

  renderICDSelected();
}

function searchICD(query) {
  const resultsEl = document.getElementById('icd-search-results');
  if (!resultsEl) return;
  if (!query || query.length < 2) { resultsEl.innerHTML = ''; return; }
  const q = query.toLowerCase();
  const matches = ICD10_DB.filter(e =>
    e.code.toLowerCase().includes(q) ||
    e.desc.toLowerCase().includes(q) ||
    e.chapter.toLowerCase().includes(q)
  ).slice(0, 12);

  if (!matches.length) { resultsEl.innerHTML = '<div style="color:var(--ink4);font-size:12px;padding:8px">No ICD-10 codes found matching your search.</div>'; return; }

  resultsEl.innerHTML = `<div style="font-size:10px;font-weight:700;color:var(--ink4);text-transform:uppercase;letter-spacing:.8px;margin-bottom:8px">Search Results</div>
    ${matches.map(e => {
      const isSelected = S_ICD.selected.has(e.code);
      return `<div class="icd-result ${isSelected ? 'selected' : ''}" onclick="toggleICD('${e.code}')">
        <div class="icd-code">${esc(e.code)}</div>
        <div class="icd-desc">${esc(e.desc)}</div>
        <div class="icd-chapter">${esc(e.chapter)}</div>
        <span style="font-size:16px;color:${isSelected?'var(--ok)':'var(--border2)'}">${isSelected?'✓':'+'}</span>
      </div>`;
    }).join('')}`;
}

function toggleICD(code) {
  if (S_ICD.selected.has(code)) S_ICD.selected.delete(code);
  else S_ICD.selected.add(code);
  renderICDSuggested();
  const query = document.getElementById('icd-search-input')?.value || '';
  if (query.length >= 2) searchICD(query);
}

function renderICDSelected() {
  const container = document.getElementById('icd-selected-list');
  const el = document.getElementById('icd-selected-items');
  if (!container || !el) return;

  if (!S_ICD.selected.size) { container.style.display = 'none'; return; }
  container.style.display = 'block';

  el.innerHTML = [...S_ICD.selected].map((code, i) => {
    const entry = ICD10_DB.find(e => e.code === code);
    if (!entry) return '';
    return `<div class="icd-selected-item">
      <span style="font-family:var(--font-mono);font-size:10px;color:var(--ink4)">${i+1}</span>
      <span class="icd-code">${esc(entry.code)}</span>
      <span style="font-size:12.5px;flex:1;color:var(--ink2)">${esc(entry.desc)}</span>
      <span style="font-size:10.5px;color:var(--ink4);font-family:var(--font-mono)">${esc(entry.chapter)}</span>
      <button class="rx-item-remove" onclick="toggleICD('${code}')">✕</button>
    </div>`;
  }).join('');
}

function copyICDCodes() {
  const codes = [...S_ICD.selected].map(code => {
    const entry = ICD10_DB.find(e => e.code === code);
    return entry ? `${entry.code} — ${entry.desc}` : code;
  }).join('\n');
  navigator.clipboard?.writeText(codes)
    .then(() => notify('ICD-10 codes copied ✓', 'ok'))
    .catch(() => notify('Copy failed', 'warn'));
}

document.addEventListener('DOMContentLoaded', () => {
  // Defer to after init
  setTimeout(() => {
    renderAllergyList();
    renderVitalsPanel();
    updateArchiveCount();
    renderSeasonalAlert();
  }, 200);
});



// ══════════════════════════════════════════════════════════════════════

// KBE debounce utility — prevents re-scoring on every keystroke
const _kbeTimers = {};
function kbeDebounce(key, fn, delay) {
  clearTimeout(_kbeTimers[key]);
  _kbeTimers[key] = setTimeout(fn, delay);
}
// MODULE KBE — KNOWLEDGE-BASE-DRIVEN CLINICAL ENGINE  v1.0
// ══════════════════════════════════════════════════════════════════════
// Design principle: "Think like a doctor, not a search engine."
//
// A doctor does NOT:
//   - Count keyword matches
//   - Return a flat score with no meaning
//
// A doctor DOES:
//   1. Build a problem representation
//   2. Generate a prior probability for each diagnosis
//   3. Update probability UP when supporting evidence found
//   4. Update probability DOWN when contradicting evidence found
//   5. Incorporate exam findings + labs into the posterior
//   6. Apply patient context (age/sex/comorbid) as likelihood ratios
//   7. Flag emergency conditions first regardless of score
//   8. Generate treatment DIRECTLY from KB, modified by patient context
//
// All scoring now derives exclusively from CLINICAL_KB.
// The old CONDITIONS array is used only for fallback (non-KB conditions).
// ══════════════════════════════════════════════════════════════════════

// ── KBE SCHEMA EXTENSION ───────────────────────────────────────────
// Each KB condition gets these new fields (added via kbeExtendKB()):
//
// scoring: {
//   core_symptoms:       { symptom: weight },  // +3 to +5 — high specificity
//   supporting_symptoms: { symptom: weight },  // +1 to +2 — sensitive but not specific
//   contradictions:      { symptom: weight },  // negative — makes diagnosis LESS likely
//   exam_clues:          { finding_keyword: weight }, // from examFindings
//   lab_patterns:        [{ test, direction:'high'|'low'|'present', weight, critical }],
//   risk_factors:        { factor_keyword: multiplier }, // age/sex/comorbid
//   typical_age:         [min, max],
//   gender_weight:       { M: float, F: float },  // likelihood ratio by sex
//   kerala_prior:        float,  // Kerala-specific baseline multiplier
// }
// context_mods: {
//   pregnancy:  [{ drug_generic, action:'avoid'|'reduce'|'switch', note, alternative }],
//   renal:      [{ drug_generic, egfr_threshold, action, note }],
//   hepatic:    [{ drug_generic, action, note }],
//   elderly:    [{ drug_generic, action, note, age_threshold }],
// }
// ──────────────────────────────────────────────────────────────────────


Object.assign(CLINICAL_KB, {

  dengue: {
    id:'dengue', name:'Dengue Fever', icd10:'A90',
    systems:['hm','cv'],
    gl_sources:[{name:'WHO Dengue 2024',level:1},{name:'NHM Kerala Dengue SOP',level:1}],
    key_symptoms:['Sudden high fever >38.5°C','Severe headache + retro-orbital pain','Myalgia / arthralgia','Nausea/vomiting','Rash (maculopapular)','Positive tourniquet test'],
    red_flags:['Abdominal pain or tenderness','Persistent vomiting','Mucosal bleeding','Platelet <50,000/μL','Haematocrit rise ≥20%','Rapid clinical deterioration','Lethargy or restlessness','Liver enlargement >2cm'],
    dx_criteria:{name:'WHO Dengue 2024',criteria:['Febrile phase Day 1-5: NS1 Ag positive (high sensitivity Days 1-5)','CBC: leucopenia + rising haematocrit = dengue','Dengue IgM positive (Day 5+)','WARNING SIGNS mandate hospital admission — do NOT discharge','Platelets <100,000: daily monitoring mandatory']},
    treatment:{
      no_warning:{label:'No Warning Signs — Manage at Home',drugs:[
        {generic:'Paracetamol',brand_india:'Crocin 500mg, Calpol',dose:'500-1000mg (adults); 15mg/kg/dose (children)',route:'Oral',freq:'Every 4-6h PRN',duration:'Until fever settles',class:'Antipyretic',risk:'low',notes:'ONLY safe antipyretic in dengue. NEVER prescribe aspirin, ibuprofen, diclofenac or any NSAID — causes fatal haemorrhage in dengue. Maintain oral fluids 2-3L/day. ORS + coconut water.',monitoring:'Platelet + haematocrit daily from Day 3. Warning signs screen every visit.',gl:'WHO Dengue 2024 | NHM Kerala',india:'Crocin 500mg ≈ ₹10/strip. NSAIDs freely available OTC — WARN patient explicitly not to take.'},
        {generic:'Oral Rehydration Solution',brand_india:'Electral, NHM ORS (free at PHC)',dose:'2-3L/day; extra 200mL per fever episode',route:'Oral',freq:'Continuous sipping',duration:'Duration of fever',class:'Hydration',risk:'low',notes:'Adequate oral hydration is the most effective intervention to prevent plasma leakage progression. Continue normal food. Do NOT fast.',monitoring:'Urine output (target: urinating every 4-6h)',gl:'WHO Dengue 2024',india:'Free ORS sachets at NHM/PHC/ASHA workers.'},
      ]},
      warning_signs:{label:'Warning Signs Present — ADMIT',drugs:[
        {generic:'IV Normal Saline 0.9% (Crystalloid bolus)',brand_india:'B.Braun/Baxter NS 500mL',dose:'5-7 mL/kg over 1 hour; reassess and repeat',route:'IV',freq:'Titrate to urine output 0.5mL/kg/h',duration:'Until haematocrit stable and clinical improvement',class:'IV crystalloid resuscitation',risk:'moderate',notes:'HOSPITAL ADMISSION MANDATORY for warning signs. Target: urine output, resolution of distress, haematocrit stabilisation. DO NOT OVER-HYDRATE — pulmonary oedema risk in critical phase.',monitoring:'Haematocrit 4-6 hourly. Platelet 12-hourly. Strict fluid balance.',gl:'WHO Dengue 2024 Class A',contra:'Do not use colloids as first line. Cautious fluid in elderly and cardiac patients.'},
      ]},
    },
    monitoring:[
      {parameter:'NS1 Antigen',frequency:'Presentation (Day 1-5)',target:'Positive = dengue confirmed',action:'Positive + warning signs: admit. Positive without warning signs: daily platelet monitoring.'},
      {parameter:'Platelet count',frequency:'Daily from Day 3 (or presentation if Day 3+)',target:'>100,000/μL safe for home',action:'<100,000: daily; <50,000 + symptoms: ADMIT; <20,000: transfusion assessment'},
      {parameter:'Haematocrit',frequency:'Every 12h from Day 3',target:'±20% of baseline',action:'>20% rise = plasma leakage = critical phase = ADMIT immediately'},
      {parameter:'Warning signs',frequency:'Every clinical contact',target:'Absent',action:'ANY warning sign = immediate hospital admission'},
    ],
    referral:['Any warning sign present — hospital admission SAME DAY (DO NOT WAIT)','Platelet <50,000 — admit','Haematocrit rise >20% — admit immediately','Mucosal bleeding, severe abdominal pain, altered consciousness — A&E EMERGENCY','Dengue + diabetes / heart disease / pregnancy — admit from Day 1'],
    india_context:{season:'Kerala dengue peak: June–November. High-burden: Ernakulam, Thrissur, Malappuram, Kozhikode, Thiruvananthapuram.',notifiable:'NOTIFIABLE disease — all confirmed cases must be reported to District Health Officer.',warning:'FATAL ERROR: NSAIDs (aspirin, ibuprofen, diclofenac) in dengue cause GI haemorrhage and death. Deaths have occurred in Kerala from NSAID prescribing in dengue.'},
  },

  leptospirosis: {
    id:'leptospirosis', name:'Leptospirosis (Rat Fever)', icd10:'A27.9',
    systems:['rs','gi'],
    gl_sources:[{name:'WHO Leptospirosis 2021',level:1},{name:'Kerala Health Dept SOP',level:1},{name:'NVBDCP Protocol',level:1}],
    key_symptoms:['Fever with severe chills (abrupt onset)','Severe calf muscle pain (pathognomonic)','Headache','Conjunctival suffusion (red eyes, no discharge)','Jaundice (Weil\'s disease)','Oliguria/anuria','Exposure: flood/waterlogged area/soil/rodents'],
    red_flags:['Jaundice + oliguria (Weil\'s disease)','Haemoptysis or pulmonary haemorrhage','Creatinine rising','Thrombocytopenia <50,000','Myocarditis / arrhythmia','Uveitis (late)'],
    dx_criteria:{name:'Clinical + Leptospira IgM ELISA + MAT',criteria:['Clinical suspicion: fever + myalgia + exposure in Kerala monsoon season = treat empirically','Leptospira IgM ELISA (Day 5+): sensitive and available at GMCH/Medical colleges','MAT titre ≥1:100 = confirmatory','Weil\'s disease: jaundice + renal failure = TREAT WITHOUT WAITING FOR CONFIRMATION','Do NOT delay treatment for serology result in clinically obvious case']},
    treatment:{
      mild:{label:'Mild — No Jaundice / No Renal Failure (Outpatient)',drugs:[
        {generic:'Doxycycline',brand_india:'Doxt SL, Biodoxi',dose:'100mg BD',route:'Oral (with food)',freq:'BD',duration:'7 days',class:'Tetracycline antibiotic',risk:'low',notes:'KERALA GOVT PROTOCOL first-line for mild leptospirosis. Start immediately on clinical suspicion — do not wait for serology. Excellent response if started early. Proven to prevent Weil\'s disease progression.',monitoring:'Temperature. Renal function Day 3 and Day 7. Urine output daily.',gl:'WHO Leptospirosis 2021 | Kerala Health Dept SOP',contra:'Pregnancy (use amoxicillin 500mg TDS × 7 days), children <8y (use amoxicillin)',india:'Doxycycline 100mg ≈ ₹5/capsule. PROPHYLAXIS: Doxycycline 200mg once weekly for high-risk persons (paddy workers, flood rescue) — NHM Kerala free distribution during season.'},
      ]},
      severe:{label:'Severe / Weil\'s Disease — ADMIT',drugs:[
        {generic:'IV Benzylpenicillin',brand_india:'Crystapen injection',dose:'1.5 million units IV every 6h',route:'IV',freq:'6-hourly',duration:'7 days',class:'Penicillin antibiotic',risk:'moderate',notes:'WEIL\'S DISEASE (jaundice + renal failure): IV benzylpenicillin. Hospital admission mandatory. Manage AKI (IV fluids, consider dialysis). ARDS: ICU ventilation. Late uveitis: ophthalmology steroid management.',monitoring:'Daily RFT, LFT, platelet, haematocrit. Urine output hourly.',gl:'WHO Leptospirosis 2021 Class A',india:'Kerala has highest leptospirosis mortality in India. Weil\'s disease mortality 5-20% without treatment. Preventable with early doxycycline.'},
        {generic:'IV Ceftriaxone (penicillin allergy)',brand_india:'Monocef 1g',dose:'1g IV OD',route:'IV',freq:'OD',duration:'7 days',class:'3rd gen cephalosporin',risk:'moderate',notes:'Alternative to IV penicillin if penicillin allergy.',monitoring:'RFT, LFT daily.',gl:'WHO Leptospirosis 2021',india:'Monocef 1g ≈ ₹80-150/vial.'},
      ]},
    },
    monitoring:[
      {parameter:'Renal function (creatinine)',frequency:'Day 0, Day 3, Day 7',target:'Stable creatinine',action:'Rising creatinine: hospital admission, IV fluids; oliguria: nephrology; anuric: dialysis'},
      {parameter:'Bilirubin (jaundice)',frequency:'At presentation',target:'Bilirubin <34 μmol/L',action:'Jaundice present = Weil\'s disease = ADMIT for IV antibiotics'},
      {parameter:'Platelet count',frequency:'At presentation + Day 3',target:'>100,000',action:'<50,000: admit; bleeding: supportive care'},
    ],
    referral:['Jaundice present — hospital admission (Weil\'s disease protocol)','Rising creatinine / oliguria — hospital admission','Haemoptysis — ICU emergency','Platelet <50,000 — admit'],
    india_context:{season:'Kerala peak: August–November (post-monsoon). Agricultural workers, plumbers, sewer workers, flood rescue teams highest risk.',notifiable:'NOTIFIABLE in Kerala. Report all confirmed cases to DMO.',chemoprophylaxis:'NHM Kerala distributes free Doxycycline 200mg weekly to high-risk flood-affected communities during outbreak season.'},
  },

  scrub_typhus: {
    id:'scrub_typhus', name:'Scrub Typhus', icd10:'A75.3',
    systems:['rs','nr'],
    gl_sources:[{name:'NVBDCP Scrub Typhus Protocol',level:1},{name:'WHO Rickettsia Guidelines',level:1}],
    key_symptoms:['Fever >5-7 days duration (continuous)','Eschar — painless black scab at bite site (search: groin, axilla, scalp, behind ears)','Regional lymphadenopathy near eschar','Headache','Myalgia','Maculopapular rash (trunk)'],
    red_flags:['Altered sensorium / confusion (meningoencephalitis)','Respiratory failure (interstitial pneumonitis)','Creatinine rising (renal involvement)','Myocarditis','Platelet <50,000'],
    dx_criteria:{name:'Clinical + Weil-Felix OXK + Scrub Typhus IgM ELISA',criteria:['Eschar present = HIGHLY SPECIFIC — diagnose and treat immediately without waiting for serology','Weil-Felix OXK titre ≥1:80 = screening positive','Scrub Typhus IgM ELISA = confirmatory (available at GMC/district hospitals in Kerala)','THERAPEUTIC TRIAL: give doxycycline — fever settles in 24-48h = confirms diagnosis','In Kerala: any fever >7 days without clear source = check for eschar before labelling PUO']},
    treatment:{
      treatment:{label:'All Scrub Typhus (Mild and Severe)',drugs:[
        {generic:'Doxycycline',brand_india:'Doxt SL, Biodoxi',dose:'100mg BD',route:'Oral',freq:'BD',duration:'7-14 days (continue 3 days after fever settles)',class:'Tetracycline antibiotic',risk:'low',notes:'RESPONSE IN 24-48H = confirms diagnosis. No response at 48h: reconsider. Hospitalise if altered consciousness, respiratory distress, or renal involvement.',monitoring:'Temperature chart. If no response 48h: check for complications, alternative diagnosis.',gl:'NVBDCP Scrub Typhus Protocol | WHO Rickettsia',contra:'Pregnancy (use azithromycin 500mg OD × 7 days), children <8y (use azithromycin)',india:'Scrub typhus common in Wayanad, Idukki, Palakkad, Thrissur. MASSIVELY under-diagnosed as PUO or "viral fever". Doxycycline ≈ ₹5/capsule.'},
        {generic:'Azithromycin (pregnancy/children)',brand_india:'Azithral 500mg, Zithromax',dose:'500mg OD (adults); 10mg/kg OD (children)',route:'Oral',freq:'OD',duration:'7 days',class:'Macrolide',risk:'low',notes:'Use in pregnancy and children <8y. Slightly inferior to doxycycline but safe.',monitoring:'Clinical response 48h.',gl:'WHO Rickettsia | NVBDCP',india:'Azithral 500mg ≈ ₹60-80/tablet.'},
      ]},
    },
    monitoring:[{parameter:'Clinical response (fever)',frequency:'48h after starting doxycycline',target:'Temperature normalising',action:'No improvement at 48h: hospitalise, check for complications, consider meningitis/pneumonitis'}],
    referral:['Altered consciousness — hospital IMMEDIATELY','Respiratory distress — ICU','Renal impairment — nephrology','Severe thrombocytopenia + bleeding — hospital'],
    india_context:{endemic:'Hot spots: Wayanad, Idukki, Kasaragod, Palakkad, Thrissur forest/plantation areas. Monsoon and post-monsoon peak.',common_error:'Most common error: missing eschar during examination. ALWAYS systematically examine: groin, axilla, scalp hairline, posterior ear, popliteal fossa. Eschar is painless — patient will not report it.'},
  },

  typhoid: {
    id:'typhoid', name:'Typhoid / Enteric Fever', icd10:'A01.0',
    systems:['gi','hm'],
    gl_sources:[{name:'WHO Typhoid 2018',level:1},{name:'IAP Typhoid 2022',level:1},{name:'NVBDCP India Protocol',level:1}],
    key_symptoms:['Step-ladder fever (rises daily, peak by end of week)','Relative bradycardia (pulse-temperature dissociation)','Severe headache','Abdominal pain (RIF)','Constipation early then diarrhoea','Coated tongue','Hepatosplenomegaly'],
    red_flags:['Sudden severe abdominal pain + rigidity (perforation)','Melaena / rectal bleeding (intestinal haemorrhage)','Altered sensorium (typhoid encephalitis)','Persistent fever >2 weeks'],
    dx_criteria:{name:'Clinical + Widal + Blood Culture + Typhidot',criteria:['Blood culture (gold standard): positive 60-80% in Week 1-2 — TAKE BEFORE ANTIBIOTICS','Widal test: OT ≥1:160 + OAH ≥1:80 = positive in Kerala context (but false positives common due to prior exposure/vaccination)','Typhidot IgM (Day 5+): more specific than Widal','In endemic area: clinical step-ladder fever >5 days = treat empirically while awaiting culture']},
    treatment:{
      outpatient:{label:'Uncomplicated Typhoid',drugs:[
        {generic:'Azithromycin',brand_india:'Azithral 500mg, Zithromax',dose:'500mg OD (20mg/kg/day in children)',route:'Oral',freq:'OD',duration:'7 days',class:'Macrolide antibiotic',risk:'low',notes:'IAP/WHO 2022 FIRST LINE in India. Fluoroquinolone resistance in Kerala: >50-60%. Chloramphenicol resistance: >40%. Do NOT use ciprofloxacin routinely without sensitivity. No improvement Day 5-7: change antibiotic, blood culture.',monitoring:'Temperature chart daily. Abdominal examination every visit.',gl:'WHO Typhoid 2018 | IAP 2022',india:'Azithral 500mg ≈ ₹60-80/tablet. Kerala: fluoroquinolone-resistant typhoid is very common — azithromycin is now first-line.'},
        {generic:'Cefixime',brand_india:'Taxim-O 200mg, Cefolac',dose:'400mg/day in 2 divided doses (adults)',route:'Oral',freq:'BD',duration:'14 days',class:'3rd gen cephalosporin oral',risk:'low',notes:'Alternative for azithromycin-resistant or intolerant. Longer course needed. Oral step-down after IV ceftriaxone.',monitoring:'Clinical response Day 5-7.',gl:'WHO Typhoid | IAP 2022',india:'Taxim-O 200mg ≈ ₹25-35/tablet.'},
      ]},
      severe:{label:'Complicated Typhoid — ADMIT',drugs:[
        {generic:'IV Ceftriaxone',brand_india:'Monocef, Rocephin',dose:'2g IV OD (60mg/kg in children)',route:'IV',freq:'OD',duration:'14 days or 5 days after fever settles',class:'3rd gen cephalosporin IV',risk:'moderate',notes:'ADMIT for: perforation (surgical emergency), haemorrhage, encephalopathy. Encephalopathy: dexamethasone 3mg/kg loading + 1mg/kg 6-hourly × 48h (IAP/WHO protocol). Perforation: emergency laparotomy.',monitoring:'Temperature. Abdominal examination twice daily. Stool chart.',gl:'WHO Typhoid 2018 Class A'},
      ]},
    },
    monitoring:[
      {parameter:'Temperature chart',frequency:'4-hourly',target:'Afebrile by Day 5-7 of treatment',action:'Fever persists Day 7: blood culture, reconsider diagnosis, check complications'},
      {parameter:'Abdominal examination',frequency:'Every clinical contact',target:'Soft abdomen, no rigidity',action:'Rigidity + acute pain: perforation = surgical emergency A&E'},
    ],
    referral:['Suspected perforation — surgical A&E IMMEDIATELY','Encephalopathy / confusion — hospital ICU','Intestinal haemorrhage — hospital admission','Failure of oral antibiotics Day 5-7 — hospital for IV ceftriaxone'],
    india_context:{resistance:'Kerala: fluoroquinolone-resistant typhoid >50-60%. Do NOT prescribe ciprofloxacin without sensitivity testing. Azithromycin is now the community standard.',season:'Year-round, peaks post-monsoon and summer. Ernakulam, Thrissur high burden.',widal_caveat:'Widal false positives common in Kerala due to past exposure and prior vaccination. Typhidot IgM (Day 5+) is more reliable for recent infection.'},
  },

  acute_gastroenteritis: {
    id:'acute_gastroenteritis', name:'Acute Gastroenteritis / Diarrhoeal Disease', icd10:'A09',
    systems:['gi'],
    gl_sources:[{name:'WHO Diarrhoea Management 2017',level:1},{name:'IAP Gastroenteritis Guidelines',level:1},{name:'NHM ORS Protocol India',level:1}],
    key_symptoms:['Loose stools ≥3/day','Vomiting','Abdominal cramps','Fever','Nausea'],
    red_flags:['Severe dehydration (sunken eyes, dry mouth, absent skin turgor, oliguria)','Bloody diarrhoea (dysentery)','Fever >38.5°C','Cannot tolerate ORS','Infant <6 months','Signs of sepsis'],
    dx_criteria:{name:'WHO Dehydration Classification',criteria:['No dehydration: home management with ORS + zinc','Some dehydration: ORS 75mL/kg over 4h in clinic/hospital','Severe dehydration: IV Ringer\'s Lactate 100mL/kg over 3h','Dysentery (bloody stool): investigate — Shigella / Entamoeba / HUS in children','Cholera suspect: rice water stools + rapid severe dehydration = IV fluids + doxycycline/azithromycin']},
    treatment:{
      ors:{label:'FIRST LINE: Oral Rehydration (All Severity)',drugs:[
        {generic:'ORS — Low Osmolarity (WHO Standard)',brand_india:'Electral, Gastrolyte; NHM ORS (FREE at PHC)',dose:'Moderate dehydration: 75mL/kg over 4h. Maintenance: 10mL/kg per stool + normal intake.',route:'Oral (small frequent sips — do NOT give large bolus)',freq:'Continuous',duration:'Until diarrhoea stops',class:'Rehydration',risk:'low',notes:'WHO GOLD STANDARD. Small sips every 2-5 minutes — large volumes trigger vomiting. Continue breastfeeding in infants. Do NOT stop food after 4 hours. Continue normal feeding.',monitoring:'Urine output. Dehydration signs every 30 minutes (moderate-severe). Stool frequency.',gl:'WHO Diarrhoea 2017 Grade I | NHM India',india:'NHM ORS free at all government facilities. ASHA trained. Electral sachet ≈ ₹5. Tender coconut widely available in Kerala — excellent hydration drink for mild cases.'},
        {generic:'Zinc sulphate (children under 5)',brand_india:'Zinconia drops, Zincovit syrup, NHM Zinc (FREE)',dose:'Children >6mo: 20mg/day; Infants <6mo: 10mg/day',route:'Oral',freq:'OD',duration:'14 days MANDATORY',class:'Zinc supplementation',risk:'low',notes:'WHO/IAP/NHM MANDATORY for ALL children with diarrhoea. Reduces duration 25%, severity 30%, recurrence next 3 months. DO NOT prescribe diarrhoea in children without zinc. NHM provides free.',monitoring:'None required.',gl:'WHO Grade A | IAP | NHM India',india:'Free at NHM facilities. Zinconia drops ≈ ₹40-60. Dispensed free with ORS kit at PHC.'},
      ]},
      antibiotic:{label:'Antibiotic (ONLY When Indicated — Not Routine)',drugs:[
        {generic:'Azithromycin (dysentery/Shigella/cholera)',brand_india:'Azithral 500mg',dose:'Adults: 500mg OD; Children: 20mg/kg/day',route:'Oral',freq:'OD',duration:'3-5 days',class:'Macrolide',risk:'low',notes:'ONLY for: bloody diarrhoea (dysentery), cholera suspect, systemic features. DO NOT prescribe antibiotics for all diarrhoea — major antibiotic resistance driver. Metronidazole 400mg TDS × 5-7 days for proven amoebiasis (stool microscopy shows trophozoites/cysts).',monitoring:'Clinical response 48h.',gl:'WHO Diarrhoea | IAP | NHM',india:'Most common clinical error in Kerala primary care: prescribing tinidazole/metronidazole for ALL diarrhoea without stool examination. Incorrect — reserve for proven amoebiasis.'},
      ]},
    },
    monitoring:[
      {parameter:'Dehydration assessment',frequency:'Every 30 min (moderate-severe), every visit (mild)',target:'Improving',action:'No improvement 4h ORT: IV Ringer\'s Lactate; worsening: hospital'},
    ],
    referral:['Severe dehydration — hospital for IV Ringer\'s Lactate','Bloody diarrhoea not improving 48h — hospital','Infant <6 months with diarrhoea — hospital','Signs of sepsis — A&E emergency','Cannot tolerate ORS — hospital IV rehydration'],
    india_context:{key_message:'ORS + Zinc = complete treatment for childhood diarrhoea. Loperamide CONTRAINDICATED under 12 years.',govt:'NHM ORS+Zinc kits free at all government health facilities via ASHA.',season:'Monsoon peak June-September. Report cluster outbreaks (≥5 cases same area) to District Health Department — cholera/outbreak protocol.',common_error:'Prescribing antibiotics + antispasmodics + antiemetics + antidiarrhoeals for all diarrhoea is incorrect, costly, and harmful.'},
  },

  osteoarthritis: {
    id:'osteoarthritis', name:'Osteoarthritis (Knee / Hip / Hand)', icd10:'M19.9',
    systems:['ms'],
    gl_sources:[{name:'NICE NG226 2022',level:1},{name:'OARSI Guidelines 2019',level:1}],
    key_symptoms:['Joint pain worsening with activity, better with rest','Morning stiffness <30 minutes','Crepitus on movement','Bony enlargement','Reduced range of motion','No fever, no rash, no systemic features'],
    red_flags:['Night pain (malignancy until excluded)','Fever + hot joint (septic arthritis — emergency)','Systemic features (RA, crystal arthropathy)','Age <40y — secondary cause to investigate'],
    dx_criteria:{name:'Clinical Diagnosis (NICE NG226) — No investigations needed for typical presentation',criteria:['Age >45 + activity-related joint pain + morning stiffness <30 minutes = OA — clinical diagnosis','X-ray only if doubt about diagnosis (not routine)','Do NOT request ESR/CRP/RF for typical OA — unnecessary cost and anxiety']},
    treatment:{
      nonpharm:{label:'Step 1: Non-Pharmacological (MANDATORY FIRST)',drugs:[
        {generic:'Exercise therapy — Quadriceps strengthening',dose:'30 minutes moderate exercise 3-4×/week; land-based or water-based',route:'Lifestyle prescription',freq:'3-4 times/week',duration:'Lifelong',class:'Exercise therapy',risk:'low',notes:'NICE NG226 GRADE A: Single most effective OA treatment. Quadriceps strengthening = NSAIDs in pain relief WITHOUT side effects. Weight loss target: >5% if BMI >25 (1kg weight loss = 4kg less knee load).',monitoring:'Pain score (0-10) monthly. ROM.',gl:'NICE NG226 Grade A | OARSI 2019',india:'Physiotherapy at government hospitals: free. Private: ₹200-400/session. Yoga widely available in Kerala. Swimming at community pools. Walking programmes.'},
        {generic:'Paracetamol',brand_india:'Crocin 500mg, Calpol',dose:'500-1000mg TDS-QDS PRN',route:'Oral',freq:'TDS-QDS as needed',duration:'PRN for pain days',class:'Analgesic',risk:'low',notes:'First pharmacological option. Safe in elderly, CKD, cardiac disease. Adequate for mild-moderate OA. Always with exercise programme — not instead of it.',monitoring:'Liver function if >3 months continuous daily use.',gl:'NICE NG226',india:'Crocin 500mg ≈ ₹10/strip.'},
      ]},
      topical:{label:'Step 2: Topical NSAID (Before Oral NSAIDs)',drugs:[
        {generic:'Diclofenac gel 1%',brand_india:'Voveran Emulgel, Dynapar Gel',dose:'2-4g (pea-sized amount) to affected joint',route:'Topical — apply and rub in gently',freq:'BD-TDS',duration:'4-6 weeks; reassess',class:'Topical NSAID',risk:'low',notes:'NICE NG226: prefer topical NSAIDs over oral for knee/hand OA. Equivalent efficacy, minimal systemic absorption, no GI/renal/cardiac risk. Try for 4-6 weeks BEFORE stepping to oral NSAIDs.',monitoring:'Local skin reaction.',gl:'NICE NG226 — topical before oral NSAIDs',india:'Voveran gel ≈ ₹60-90/tube.'},
      ]},
      oral_nsaid:{label:'Step 3: Oral NSAID (If Steps 1-2 Insufficient)',drugs:[
        {generic:'Etoricoxib',brand_india:'Nucoxia 60mg, Etoricox',dose:'60mg OD (max 90mg for severe pain)',route:'Oral',freq:'OD',duration:'Minimum duration — not indefinite',class:'COX-2 selective NSAID',risk:'moderate',notes:'ALWAYS prescribe with PPI (omeprazole 20mg OD). Use minimum effective dose. Avoid in CKD eGFR <30, uncontrolled HTN, cardiac failure, post-CABG. Monitor BP and renal function in elderly every 3 months.',monitoring:'BP, RFT every 3 months if on long-term NSAIDs.',gl:'NICE NG226 | OARSI 2019',contra:'CKD eGFR <30, active GI ulcer, uncontrolled HTN, cardiac failure, post-CABG',india:'Nucoxia 60mg ≈ ₹8-12/tablet.'},
      ]},
    },
    monitoring:[
      {parameter:'Pain score (0-10 VAS)',frequency:'Every clinic visit',target:'VAS <4',action:'VAS ≥7 despite Step 3: orthopaedic referral for surgical assessment'},
      {parameter:'Renal function if on oral NSAIDs',frequency:'Every 3 months',target:'eGFR stable',action:'Declining eGFR: stop NSAID immediately, switch to paracetamol'},
    ],
    referral:['Severe pain + loss of function after 3-6 months conservative management — orthopaedic for TKR/THR assessment','Suspected septic joint (fever + acute hot joint) — orthopaedic emergency SAME DAY'],
    india_context:{prevalence:'Knee OA affects 28-30% of adults >50y in Kerala — most common joint disease. Major disability cause.',cost:'Conservative management: <₹500/month. TKR at government medical college: ₹1-2L (KASP covered). Private: ₹3-5L.',common_error:'IV diclofenac + IM corticosteroid as first-line OA treatment in Kerala private practice. Incorrect — causes GI ulcers, glucose elevation, osteoporosis without addressing root cause.'},
  },

  low_back_pain: {
    id:'low_back_pain', name:'Non-Specific Low Back Pain', icd10:'M54.5',
    systems:['ms'],
    gl_sources:[{name:'NICE NG59 2016 Low Back Pain',level:1},{name:'AAFP Low Back Pain Guidelines',level:1}],
    key_symptoms:['Low back pain','Pain worse with movement','Stiffness','May radiate to buttocks or thighs (non-specific)','No neurological deficit'],
    red_flags:['Red flags (CAUDA EQUINA): bilateral leg weakness, saddle anaesthesia, bladder/bowel dysfunction — MRI URGENT','Cancer history (metastases)','Fever (discitis/TB spine)','Age <20y (ankylosing spondylitis, Pott\'s)','Unrelenting night pain (malignancy)','Recent trauma (fracture)'],
    dx_criteria:{name:'Clinical Diagnosis — No Imaging for Non-Specific LBP',criteria:['Non-specific LBP: pain without neurological signs, no red flags = clinical diagnosis ONLY','Do NOT request X-ray/MRI for non-specific LBP < 6 weeks duration — changes management in <5%','SLR positive: sciatica — consider disc herniation','Red flags: MRI urgently — same day if cauda equina suspected']},
    treatment:{
      first_line:{label:'First Line',drugs:[
        {generic:'Reassurance + Advice to Stay Active',dose:'Written information: keep moving, avoid bed rest',route:'Patient education',freq:'Every visit',duration:'Reinforce each consultation',class:'First-line intervention',risk:'low',notes:'NICE NG59 GRADE A: Staying active is MORE effective than rest. Bed rest is harmful and prolongs LBP. Reassure: 90% of non-specific LBP improves in 4-6 weeks. Psychological factors (fear-avoidance) are major drivers of chronic LBP.',monitoring:'Review at 4 weeks.',gl:'NICE NG59 Grade A',india:'Most common error: prescribing bed rest and multiple analgesics for all LBP. Counterproductive.'},
        {generic:'Paracetamol',brand_india:'Crocin 500mg',dose:'500-1000mg TDS-QDS PRN',route:'Oral',freq:'TDS-QDS as needed',duration:'Maximum 2-4 weeks regular then PRN',class:'Analgesic',risk:'low',notes:'NICE NG59 first-line for acute LBP. Adequate for most cases when combined with activity.',monitoring:'Review pain at 4 weeks.',gl:'NICE NG59',india:'Crocin 500mg ≈ ₹10/strip.'},
        {generic:'Naproxen (if paracetamol insufficient)',brand_india:'Naprosyn 500mg, Xenobid',dose:'250-500mg BD with food',route:'Oral',freq:'BD',duration:'Max 2-3 weeks',class:'NSAID',risk:'moderate',notes:'Short course NSAID if paracetamol inadequate. Always with omeprazole. Avoid in elderly, CKD, GI ulcer.',monitoring:'GI symptoms. BP. RFT.',gl:'NICE NG59',contra:'CKD, active peptic ulcer, anticoagulants'},
      ]},
      physiotherapy:{label:'Physiotherapy (If Not Improving 4 Weeks)',drugs:[
        {generic:'Structured physiotherapy / Yoga / Exercise',dose:'8-12 supervised sessions',route:'Physiotherapy',freq:'2-3 sessions/week',duration:'6-8 weeks',class:'Exercise therapy',risk:'low',notes:'NICE NG59: offer supervised exercise programme at 4 weeks if not improving. Yoga, pilates, tai chi all evidence-based. Core strengthening exercises.',monitoring:'Pain VAS, functional score at 6 weeks.',gl:'NICE NG59 Grade A',india:'Government physiotherapy: free. Yoga: widely available in Kerala ₹500-1000/month.'},
      ]},
    },
    monitoring:[
      {parameter:'Red flag screen',frequency:'Every visit',target:'None present',action:'Any red flag: urgent MRI (cauda equina = same-day neurosurgery)'},
      {parameter:'Pain and function at 4 weeks',frequency:'4-week review',target:'Improving',action:'Not improving at 6-8 weeks: physiotherapy. Not improving at 12 weeks: specialist referral'},
    ],
    referral:['Cauda equina syndrome — NEUROSURGICAL EMERGENCY SAME DAY','Sciatica not improving 6-8 weeks — orthopaedic/neurosurgery','Suspected malignancy/infection — urgent MRI + oncology/spine surgery'],
    india_context:{common:'Low back pain 2nd most common cause of OPD visit in Kerala after respiratory infections.',key_message:'Most LBP resolves in 4-6 weeks with activity. Do NOT prescribe bed rest, extensive investigations, or prolonged NSAID courses for non-specific LBP.'},
  },

}); // END Kerala KB Extension

const KBE_SCORING_EXTENSION = {

  asthma: {
    scoring: {
      core_symptoms:       { 'wheeze':5, 'episodic wheeze':5, 'dyspnoea on exertion':4, 'nocturnal cough':4, 'chest tightness':4, 'chest heaviness':3, 'breathing tightness':4 },
      supporting_symptoms: { 'dyspnoea':2, 'cough':2, 'chest tightness':2, 'chest pain':1, 'allergy history':2, 'atopy':2, 'triggers':2 },
      contradictions:      { 'fever':(-2), 'purulent sputum':(-2), 'weight loss':(-2), 'haemoptysis':(-3), 'smoking history':(-1) },
      exam_clues:          { 'wheeze':4, 'bilateral wheeze':4, 'poor air entry':2, 'hyperinflation':2, 'eczema':1 },
      lab_patterns:        [
        { test:'spo2', direction:'low',     threshold:95, weight:2, critical:true  },
        { test:'esr',  direction:'normal',  threshold:20, weight:1, critical:false },
      ],
      risk_factors:        { 'atopy':1.5, 'family asthma':1.4, 'hay fever':1.3, 'eczema':1.3 },
      typical_age:         [5, 55],
      gender_weight:       { M:1.1, F:1.0 },
      kerala_prior:        1.1,
    },
    context_mods: {
      pregnancy:  [{ drug:'aspirin',    action:'avoid', note:'Aspirin-exacerbated respiratory disease — use paracetamol' },
                   { drug:'beta-blocker', action:'avoid', note:'Can precipitate bronchospasm' }],
      renal:      [],
      hepatic:    [],
      elderly:    [{ drug:'beta-2 agonist (high dose)', action:'monitor', note:'Hypokalaemia risk at high doses in elderly — check K+' }],
    },
  },

  hypertension: {
    scoring: {
      core_symptoms:       { 'hypertension':5, 'elevated blood pressure':5 },
      supporting_symptoms: { 'headache':1, 'dizziness':1, 'epistaxis':1, 'visual disturbance':2, 'chest pain':1 },
      contradictions:      { 'hypotension':(-5), 'shock':(-5) },
      exam_clues:          { 'blood pressure >140':5, 'bp >160':5, 'papilloedema':3, 'av nipping':2, 'cotton wool spots':3 },
      lab_patterns:        [
        { test:'cr',   direction:'high', threshold:110, weight:2, critical:false },
        { test:'k',    direction:'low',  threshold:3.5, weight:1, critical:false },
        { test:'urine_albumin', direction:'present', threshold:0, weight:2, critical:false },
      ],
      risk_factors:        { 'diabetes mellitus':1.4, 'coronary artery disease':1.5, 'smoking':1.3, 'obesity':1.3, 'family hypertension':1.4, 'salt excess':1.2, 'alcohol':1.2 },
      typical_age:         [30, 90],
      gender_weight:       { M:1.2, F:1.0 },
      kerala_prior:        1.5,
    },
    context_mods: {
      pregnancy:  [{ drug:'ace inhibitor',  action:'avoid',  note:'Teratogenic (Category D) — use methyldopa or labetalol instead', alternative:'methyldopa 250mg TDS or labetalol 100mg BD' },
                   { drug:'arb',            action:'avoid',  note:'Absolutely contraindicated in pregnancy', alternative:'methyldopa or nifedipine SR' },
                   { drug:'indapamide',     action:'avoid',  note:'Thiazide diuretics — risk of neonatal electrolyte disturbance', alternative:'labetalol or methyldopa' }],
      renal:      [{ drug:'ace inhibitor',  action:'reduce_monitor', egfr_threshold:30, note:'Reduce dose if eGFR 15-30; stop if eGFR <15. Monitor K+ and Cr weekly until stable.' },
                   { drug:'arb',            action:'reduce_monitor', egfr_threshold:30, note:'Same caution as ACEi. K+ >5.5 = stop.' },
                   { drug:'spironolactone', action:'avoid',  egfr_threshold:30, note:'Avoid if eGFR <30 — hyperkalaemia risk (PATHWAY-2 exclusion criterion)' }],
      hepatic:    [{ drug:'amlodipine',     action:'reduce', note:'Hepatic metabolism — reduce dose to 2.5mg in severe hepatic impairment' }],
      elderly:    [{ drug:'amlodipine',     action:'start_low', note:'Start 2.5mg in frail elderly — postural hypotension risk', age_threshold:75 },
                   { drug:'indapamide',     action:'monitor', note:'Hyponatraemia risk in elderly — check Na+ at 2 weeks', age_threshold:70 }],
    },
  },

  pcos: {
    scoring: {
      core_symptoms:       { 'menstrual irregularity':5, 'oligomenorrhoea':5, 'amenorrhoea':4, 'hirsutism':4, 'acne':3, 'weight gain':3, 'infertility':4 },
      supporting_symptoms: { 'hair loss':2, 'acanthosis nigricans':3, 'polydipsia':1, 'fatigue':1, 'depression':1 },
      contradictions:      { 'male':(-10), 'post-menopausal':(-5), 'regular periods':(-3), 'age >50':(-3) },
      exam_clues:          { 'acanthosis nigricans':3, 'hirsutism':4, 'elevated bmi':2, 'ovarian enlargement':3 },
      lab_patterns:        [
        { test:'ft3',  direction:'normal', threshold:0,   weight:1, critical:false },
        { test:'tsh',  direction:'normal', threshold:0,   weight:1, critical:false },
        { test:'hba1c',direction:'high',   threshold:5.7, weight:2, critical:false },
      ],
      risk_factors:        { 'family diabetes':1.4, 'insulin resistance':1.6, 'south asian ethnicity':1.3, 'obesity':1.5 },
      typical_age:         [14, 45],
      gender_weight:       { M:0, F:1.0 },
      kerala_prior:        1.6,
    },
    context_mods: {
      pregnancy:  [{ drug:'metformin',     action:'continue_with_monitoring', note:'ESHRE 2023: continue metformin in first trimester if started for fertility — reduces miscarriage risk in PCOS', alternative:'continue with folic acid 5mg' },
                   { drug:'spironolactone',action:'avoid',  note:'Absolute CI — feminisation of male foetus', alternative:'switch to OCP-free management; post-partum restart' },
                   { drug:'letrozole',     action:'avoid',  note:'Teratogenic — stop before confirmed pregnancy', alternative:'refer to reproductive medicine' },
                   { drug:'ocp',           action:'avoid',  note:'Combined OCP is contraindicated in pregnancy' }],
      renal:      [{ drug:'metformin', action:'reduce_stop', egfr_threshold:45, note:'Reduce dose if eGFR 30-45 (500mg OD). Stop if eGFR <30 (lactic acidosis risk).' }],
      hepatic:    [{ drug:'metformin', action:'avoid', note:'Avoid in significant hepatic impairment — lactic acidosis risk' }],
      elderly:    [],
    },
  },

  t2dm: {
    scoring: {
      core_symptoms:       { 'polyuria':5, 'polydipsia':5, 'unexplained weight loss':4 },
      supporting_symptoms: { 'fatigue':2, 'blurred vision':3, 'tingling':3, 'numbness':2, 'recurrent infections':3, 'acanthosis nigricans':3 },
      contradictions:      { 'type 1 diabetes features':(-3), 'ketosis':(-2), 'young lean patient':(-1) },
      exam_clues:          { 'acanthosis nigricans':3, 'peripheral neuropathy':4, 'retinopathy':4, 'elevated bmi':2, 'foot ulcer':4 },
      lab_patterns:        [
        { test:'glu',   direction:'high',  threshold:7.0,  weight:5, critical:true  },
        { test:'hba1c', direction:'high',  threshold:6.5,  weight:5, critical:true  },
        { test:'cr',    direction:'high',  threshold:120,  weight:2, critical:false },
      ],
      risk_factors:        { 'family diabetes':1.8, 'obesity':1.7, 'hypertension':1.4, 'gestational diabetes history':2.0, 'sedentary lifestyle':1.3 },
      typical_age:         [30, 90],
      gender_weight:       { M:1.1, F:1.0 },
      kerala_prior:        1.9,
    },
    context_mods: {
      pregnancy:  [{ drug:'metformin',     action:'continue_category_b', note:'Category B — continue if already on; monitor closely. Insulin preferred for tight control in pregnancy' },
                   { drug:'sglt2 inhibitor', action:'avoid', note:'Insufficient safety data in pregnancy — discontinue' },
                   { drug:'glp-1 agonist', action:'avoid', note:'Contraindicated in pregnancy' },
                   { drug:'sulfonylurea',  action:'avoid', note:'Risk of neonatal hypoglycaemia — switch to insulin', alternative:'insulin + metformin' }],
      renal:      [{ drug:'metformin',     action:'reduce_stop', egfr_threshold:45, note:'Reduce dose 45-60; stop at <30. Check eGFR before every prescription.' },
                   { drug:'empagliflozin', action:'reduce_stop', egfr_threshold:20, note:'Initiation not recommended if eGFR <30. Stop if eGFR <20.' },
                   { drug:'sitagliptin',   action:'reduce', egfr_threshold:50, note:'Reduce to 50mg OD if eGFR 30-50; 25mg OD if eGFR <30' },
                   { drug:'glimepiride',   action:'avoid',  egfr_threshold:30, note:'Avoid in significant renal impairment — prolonged hypoglycaemia risk' }],
      hepatic:    [{ drug:'metformin',     action:'avoid', note:'Hepatic failure — lactic acidosis risk' },
                   { drug:'glimepiride',   action:'avoid', note:'Avoid in significant hepatic impairment' }],
      elderly:    [{ drug:'glimepiride',   action:'avoid',  note:'High hypoglycaemia risk in >70y — prefer sitagliptin (weight-neutral, low hypo risk)', age_threshold:70, alternative:'sitagliptin 100mg OD (reduce if CKD)' },
                   { drug:'empagliflozin', action:'monitor', note:'UTI and dehydration risk in frail elderly — monitor BP and U&E', age_threshold:75 },
                   { drug:'insulin',       action:'careful_titration', note:'Risk of severe hypoglycaemia — check driving, vision, cognition. Use basal-only first.', age_threshold:70 }],
    },
  },

  hypothyroidism: {
    scoring: {
      core_symptoms:       { 'fatigue':3, 'weight gain':4, 'cold intolerance':5, 'constipation':3, 'depression':2, 'hair loss':3, 'dry skin':3 },
      supporting_symptoms: { 'bradycardia':3, 'hoarse voice':3, 'menstrual irregularity':2, 'muscle cramps':2, 'delayed reflexes':4, 'periorbital puffiness':3, 'goitre':3 },
      contradictions:      { 'heat intolerance':(-4), 'weight loss':(-3), 'diarrhoea':(-2), 'palpitations':(-2), 'tremor':(-3), 'tachycardia':(-3) },
      exam_clues:          { 'goitre':3, 'bradycardia':4, 'dry skin':2, 'delayed relaxation reflexes':4, 'periorbital puffiness':3, 'hoarse voice':3 },
      lab_patterns:        [
        { test:'tsh',  direction:'high',  threshold:4.0,  weight:6, critical:true  },
        { test:'ft4',  direction:'low',   threshold:12,   weight:5, critical:true  },
        { test:'hb',   direction:'low',   threshold:120,  weight:1, critical:false },
        { test:'cr',   direction:'high',  threshold:110,  weight:1, critical:false },
      ],
      risk_factors:        { 'autoimmune disease':1.8, 'family thyroid':1.6, 'previous radioiodine':2.0, 'female sex':1.7, 'amiodarone':1.5, 'lithium':1.5 },
      typical_age:         [20, 80],
      gender_weight:       { M:0.5, F:1.7 },
      kerala_prior:        1.8,
    },
    context_mods: {
      pregnancy:  [{ drug:'levothyroxine', action:'increase_dose', note:'Dose requirement increases 25-50% in pregnancy. Target TSH <2.5 (T1), <3.0 (T2/T3). Check TSH every 4 weeks first trimester then every 4-8 weeks.' }],
      renal:      [{ drug:'levothyroxine', action:'standard_dose_monitor', note:'No dose adjustment needed — but absorption affected by chronic dialysis. Monitor TSH 6-weekly.' }],
      hepatic:    [],
      elderly:    [{ drug:'levothyroxine', action:'start_very_low', note:'Start 12.5-25mcg in >70y or known cardiac disease — risk of precipitating angina or AF if started too high', age_threshold:70 }],
    },
  },

  heart_failure: {
    scoring: {
      core_symptoms:       { 'dyspnoea':3, 'orthopnoea':5, 'paroxysmal nocturnal dyspnoea':5, 'bilateral oedema':5, 'exertional dyspnoea':4 },
      supporting_symptoms: { 'fatigue':2, 'palpitations':1, 'weight gain':2, 'abdominal distension':2, 'nocturia':2, 'cough':1 },
      contradictions:      { 'no oedema':(-3), 'pleuritic pain':(-3), 'fever':(-2), 'haemoptysis':(-2), 'wheeze':(-2), 'no orthopnoea':(-2), 'no ankle swelling':(-3) },
      exam_clues:          { 'raised jvp':5, 'bilateral crackles':4, 'third heart sound':5, 'bilateral pitting oedema':4, 'displaced apex beat':4, 'hepatomegaly':3, 'ascites':3 },
      lab_patterns:        [
        { test:'bnp',  direction:'high',  threshold:100,  weight:6, critical:true  },
        { test:'na',   direction:'low',   threshold:135,  weight:2, critical:true  },
        { test:'k',    direction:'high',  threshold:5.0,  weight:2, critical:true  },
        { test:'cr',   direction:'high',  threshold:120,  weight:2, critical:false },
      ],
      risk_factors:        { 'coronary artery disease':2.0, 'hypertension':1.8, 'diabetes mellitus':1.5, 'previous heart failure':3.0, 'valve disease':1.8, 'alcohol excess':1.5 },
      typical_age:         [50, 95],
      gender_weight:       { M:1.1, F:0.95 },
      kerala_prior:        1.2,
    },
    context_mods: {
      pregnancy:  [{ drug:'ace inhibitor',  action:'avoid', note:'Teratogenic in 2nd/3rd trimester — switch to methyldopa + furosemide with caution', alternative:'methyldopa, hydralazine, labetalol under specialist care' },
                   { drug:'spironolactone', action:'avoid', note:'Anti-androgenic effects on male foetus' },
                   { drug:'arb',            action:'avoid', note:'Absolutely contraindicated' }],
      renal:      [{ drug:'ace inhibitor',  action:'reduce_monitor', egfr_threshold:30, note:'Start at half dose; K+ and Cr weekly. Accept up to 30% Cr rise.' },
                   { drug:'spironolactone', action:'avoid',          egfr_threshold:30, note:'Risk of life-threatening hyperkalaemia if eGFR <30' },
                   { drug:'empagliflozin',  action:'continue_if_ef_reduced', egfr_threshold:20, note:'ESC 2021 recommends continuing if eGFR ≥20 for HFrEF mortality benefit' },
                   { drug:'furosemide',     action:'increase_dose',  egfr_threshold:30, note:'Higher doses needed as GFR falls — titrate to fluid balance, not fixed dose' }],
      hepatic:    [{ drug:'furosemide', action:'reduce', note:'Risk of hepatorenal syndrome — start 20mg and titrate very carefully' }],
      elderly:    [{ drug:'bisoprolol',    action:'start_very_low', note:'Start 1.25mg and uptitrate very slowly (every 4 weeks not 2) in >75y', age_threshold:75 },
                   { drug:'ace inhibitor', action:'start_low',      note:'Start ramipril 1.25mg in frail elderly — high sensitivity to first dose hypotension', age_threshold:75 },
                   { drug:'spironolactone',action:'low_dose_only',  note:'Use 12.5-25mg only in elderly (K+ and AKI risk) with close monitoring', age_threshold:70 }],
    },
  },

  nstemi: {
    scoring: {
      core_symptoms:       { 'chest pain':4, 'crushing chest pain':5, 'chest pressure':5, 'diaphoresis':5, 'radiation left arm':5, 'radiation jaw':5, 'nausea':3 },
      supporting_symptoms: { 'dyspnoea':2, 'vomiting':2, 'syncope':3, 'palpitations':2, 'arm pain':3 },
      contradictions:      { 'pleuritic chest pain':(-3), 'positional chest pain':(-3), 'sharp stabbing pain':(-2), 'young fit no risk factors':(-1) },
      exam_clues:          { 'diaphoresis':4, 'pallor':2, 'new murmur':3, 'hypotension':3, 'tachycardia':3, 'raised jvp':2 },
      lab_patterns:        [
        { test:'trop',  direction:'high', threshold:14,   weight:7, critical:true  },
        { test:'bnp',   direction:'high', threshold:100,  weight:2, critical:false },
        { test:'glu',   direction:'high', threshold:11,   weight:2, critical:false },
      ],
      risk_factors:        { 'coronary artery disease':3.0, 'diabetes mellitus':1.8, 'hypertension':1.6, 'smoking':1.8, 'family cardiac history':1.7, 'male sex over 45':1.5, 'hyperlipidaemia':1.5 },
      typical_age:         [40, 95],
      gender_weight:       { M:1.4, F:0.9 },
      kerala_prior:        1.0,
    },
    context_mods: {
      pregnancy:  [{ drug:'statin',         action:'avoid', note:'Statins contraindicated in pregnancy — stop atorvastatin', alternative:'manage lipids by diet' },
                   { drug:'ticagrelor',      action:'avoid', note:'Insufficient data — use aspirin alone or clopidogrel under specialist guidance', alternative:'aspirin + specialist review' }],
      renal:      [{ drug:'fondaparinux',    action:'avoid',          egfr_threshold:20, note:'Contraindicated if eGFR <20 — use UFH instead' },
                   { drug:'enoxaparin',      action:'reduce',         egfr_threshold:30, note:'Use 1mg/kg OD (not BD) if eGFR <30; monitor anti-Xa levels' },
                   { drug:'ticagrelor',      action:'standard',       egfr_threshold:0,  note:'No dose adjustment needed; preferred over clopidogrel for renal patients (ESC 2023)' }],
      hepatic:    [{ drug:'ticagrelor',      action:'avoid_severe', note:'Avoid in severe hepatic impairment — increased bleeding risk' },
                   { drug:'clopidogrel',     action:'avoid_severe', note:'Requires hepatic metabolism to active form — may be less effective in liver disease' }],
      elderly:    [{ drug:'ticagrelor',      action:'standard_bleeding_assessment', note:'Higher bleeding risk in >75y — GRACE score + HAS-BLED before prescribing', age_threshold:75 },
                   { drug:'statin (high intensity)', action:'reduce_intensity', note:'Consider moderate-intensity statin in frail elderly (>80y) due to myopathy risk', age_threshold:80, alternative:'rosuvastatin 10-20mg (less myopathy)' }],
    },
  },

  depression: {
    scoring: {
      core_symptoms:       { 'low mood':5, 'anhedonia':5, 'depressed mood':5 },
      supporting_symptoms: { 'fatigue':2, 'insomnia':3, 'poor concentration':3, 'weight loss':2, 'weight gain':1, 'guilt':3, 'worthlessness':3, 'hopelessness':4, 'psychomotor slowing':3 },
      contradictions:      { 'mania':(-4), 'elation':(-4), 'hyperthyroid features':(-2), 'substance intoxication':(-2) },
      exam_clues:          { 'psychomotor retardation':3, 'poor eye contact':2, 'tearful':2, 'flat affect':3 },
      lab_patterns:        [
        { test:'tsh', direction:'high', threshold:4.0, weight:(-2), critical:false },
        { test:'hb',  direction:'low',  threshold:110, weight:1,    critical:false },
      ],
      risk_factors:        { 'previous depression':2.5, 'family depression':1.6, 'chronic illness':1.5, 'bereavement':1.8, 'social isolation':1.6, 'kerala migration stress':1.4 },
      typical_age:         [15, 85],
      gender_weight:       { M:0.7, F:1.4 },
      kerala_prior:        1.1,
    },
    context_mods: {
      pregnancy:  [{ drug:'sertraline',    action:'continue_lowest_effective', note:'SSRI use in pregnancy — weigh risk vs untreated depression. Sertraline has best safety data. Discuss with patient.' },
                   { drug:'venlafaxine',   action:'avoid_if_possible', note:'Higher rates of neonatal discontinuation syndrome — prefer sertraline or fluoxetine' },
                   { drug:'tricyclics',    action:'avoid', note:'Risk of neonatal toxicity and arrhythmia — switch to SSRI under specialist review' }],
      renal:      [{ drug:'sertraline',    action:'standard', note:'No dose adjustment needed in renal impairment — safest SSRI in CKD' },
                   { drug:'lithium',       action:'avoid',    egfr_threshold:30, note:'Contraindicated in severe renal impairment — narrow therapeutic index; accumulates with declining GFR' }],
      hepatic:    [{ drug:'sertraline',    action:'reduce_50pc', note:'Halve dose in significant hepatic impairment — increased plasma levels' },
                   { drug:'mirtazapine',   action:'reduce',     note:'Reduce dose in hepatic impairment' }],
      elderly:    [{ drug:'sertraline',    action:'start_25mg',    note:'Start at 25mg in >65y (not 50mg) — increased SIADH risk. Check Na+ at 2 weeks.', age_threshold:65, alternative:'start 25mg OD, increase slowly' },
                   { drug:'tricyclics',    action:'avoid',         note:'Avoid in >65y — falls, anticholinergic, cardiac conduction risk', age_threshold:65 },
                   { drug:'lithium',       action:'reduce_monitor',note:'Lower doses required in elderly — dehydration and NSAID use make toxicity more likely', age_threshold:65 }],
    },
  },

  pneumonia: {
    scoring: {
      core_symptoms:       { 'fever':4, 'productive cough':4, 'dyspnoea':3, 'pleuritic pain':4, 'rigors':4 },
      supporting_symptoms: { 'cough':2, 'sputum':2, 'night sweats':2, 'fatigue':1, 'confusion':3 },
      contradictions:      { 'wheeze':(-3), 'chronic cough':(-1), 'no fever':(-5), 'no cough':(-4), 'positional dyspnoea':(-2), 'gradual onset':(-1) },
      exam_clues:          { 'crackles':4, 'bronchial breathing':5, 'dullness to percussion':4, 'raised respiratory rate':3, 'fever >38':4 },
      lab_patterns:        [
        { test:'wbc',  direction:'high',  threshold:11,   weight:4, critical:false },
        { test:'crp',  direction:'high',  threshold:10,   weight:4, critical:false },
        { test:'pct',  direction:'high',  threshold:0.25, weight:4, critical:true  },
      ],
      risk_factors:        { 'elderly':1.5, 'immunosuppressed':2.0, 'copd':1.8, 'alcohol excess':1.5, 'aspiration risk':1.8, 'smoker':1.4 },
      typical_age:         [5, 95],
      gender_weight:       { M:1.0, F:1.0 },
      kerala_prior:        1.0,
    },
    context_mods: {
      pregnancy:  [{ drug:'doxycycline', action:'avoid', note:'Contraindicated in pregnancy — use amoxicillin or azithromycin', alternative:'amoxicillin 500mg TDS + azithromycin 500mg OD if atypical' },
                   { drug:'fluoroquinolone', action:'avoid', note:'Avoid quinolones in pregnancy — cartilage risk', alternative:'amoxicillin-clavulanate' }],
      renal:      [{ drug:'levofloxacin', action:'reduce', egfr_threshold:50, note:'Reduce dose by 50% if eGFR <50' },
                   { drug:'piperacillin-tazobactam', action:'reduce', egfr_threshold:20, note:'Reduce frequency to 6-hourly (not 8-hourly) in severe renal impairment' }],
      hepatic:    [],
      elderly:    [{ drug:'levofloxacin', action:'qTc_check', note:'Check ECG for QTc before prescribing in >65y — increased arrhythmia risk', age_threshold:65 }],
    },
  },

  copd: {
    scoring: {
      core_symptoms:       { 'exertional dyspnoea':5, 'progressive dyspnoea':4, 'chronic productive cough':4, 'wheeze':3 },
      supporting_symptoms: { 'dyspnoea':2, 'cough':2, 'sputum production':3, 'frequent respiratory infections':3, 'reduced exercise tolerance':3 },
      contradictions:      { 'no smoking history':(-2), 'age <35':(-2), 'episodic wheeze':(-2), 'known allergies':(-1), 'reversible obstruction':(-3) },
      exam_clues:          { 'barrel chest':4, 'hyperresonance':3, 'reduced air entry':3, 'pursed lip breathing':4, 'accessory muscle use':3, 'clubbing':2 },
      lab_patterns:        [
        { test:'spo2', direction:'low',  threshold:94,   weight:3, critical:true  },
        { test:'pct',  direction:'normal', threshold:0,  weight:1, critical:false },
      ],
      risk_factors:        { 'smoking history':3.0, 'biomass fuel exposure':2.5, 'occupational dust':1.8, 'alpha-1 antitrypsin deficiency':2.5, 'age >45':1.5 },
      typical_age:         [45, 95],
      gender_weight:       { M:1.3, F:0.9 },
      kerala_prior:        1.0,
    },
    context_mods: {
      pregnancy:  [{ drug:'prednisolone', action:'short_course_ok', note:'Short course prednisolone acceptable for AECOPD — monitor glucose. Avoid prolonged courses.' }],
      renal:      [{ drug:'theophylline', action:'avoid',   note:'Narrow therapeutic index amplified in renal impairment — avoid' }],
      hepatic:    [{ drug:'theophylline', action:'avoid',   note:'Hepatic clearance impaired — very high toxicity risk' }],
      elderly:    [{ drug:'oral prednisolone', action:'limit_course', note:'5-day courses only in elderly — fracture risk, glucose, confusion', age_threshold:70 },
                   { drug:'tiotropium',        action:'standard',     note:'Preferred in elderly — once daily dosing, good safety profile' }],
    },
  },

  sepsis: {
    scoring: {
      core_symptoms:       { 'fever':4, 'tachycardia':5, 'confusion':4, 'hypotension':5, 'rigors':4, 'oliguria':5 },
      supporting_symptoms: { 'vomiting':2, 'dyspnoea':1, 'peripheral cyanosis':4, 'mottled skin':5, 'diaphoresis':3, 'cold peripheries':3, 'reduced consciousness':4 },
      contradictions:      { 'no fever':(-5),'afebrile':(-4),'wheeze':(-3),'exertional dyspnoea':(-2),'no rigors':(-2),'no confusion':(-2),'no tachycardia':(-2),'no hypotension':(-3) },
      exam_clues:          { 'hypotension':5, 'tachycardia >100':4, 'respiratory rate >22':4, 'capillary refill >3 sec':4, 'reduced consciousness':4, 'cold peripheries':3 },
      lab_patterns:        [
        { test:'wbc',  direction:'high',  threshold:12,   weight:3, critical:false },
        { test:'wbc',  direction:'low',   threshold:4,    weight:3, critical:false },
        { test:'crp',  direction:'high',  threshold:20,   weight:3, critical:false },
        { test:'pct',  direction:'high',  threshold:0.5,  weight:5, critical:true  },
        { test:'lact', direction:'high',  threshold:2.0,  weight:5, critical:true  },
        { test:'cr',   direction:'high',  threshold:150,  weight:3, critical:false },
      ],
      risk_factors:        { 'immunosuppressed':2.0, 'elderly':1.5, 'diabetes mellitus':1.4, 'recent procedure':1.6, 'indwelling catheter':1.5, 'dialysis':1.8 },
      typical_age:         [1, 99],
      gender_weight:       { M:1.0, F:1.0 },
      kerala_prior:        1.0,
    },
    context_mods: {
      pregnancy:  [{ drug:'piperacillin-tazobactam', action:'safe', note:'Category B — appropriate for sepsis in pregnancy. Discuss with obstetric team immediately.' }],
      renal:      [{ drug:'gentamicin',        action:'avoid', note:'Nephrotoxic — use alternative in CKD. Extended interval gentamicin only under TDM.' },
                   { drug:'vancomycin',         action:'tdm_mandatory', note:'TDM essential in CKD — area-under-curve dosing target 400-600 mg.h/L' }],
      hepatic:    [{ drug:'metronidazole',      action:'reduce', note:'Reduce dose by 50% in significant hepatic impairment (if anaerobic cover needed)' }],
      elderly:    [{ drug:'aminoglycosides',    action:'avoid',  note:'High risk of nephrotoxicity and ototoxicity in >70y — use beta-lactam alternatives', age_threshold:70 },
                   { drug:'iv fluid 30ml/kg',   action:'careful_titration', note:'Frail elderly: 30mL/kg may cause fluid overload — use dynamic fluid responsiveness assessment', age_threshold:70 }],
    },
  },

  uti: {
    scoring: {
      core_symptoms:       { 'dysuria':5, 'frequency':4, 'urgency':4 },
      supporting_symptoms: { 'haematuria':3, 'suprapubic pain':3, 'cloudy urine':3, 'offensive urine':3, 'polyuria':1 },
      contradictions:      { 'fever >38 without loin pain':(-1), 'no urinary symptoms':(-3), 'vomiting':(-1) },
      exam_clues:          { 'suprapubic tenderness':4, 'loin pain':4, 'costovertebral angle tenderness':5, 'fever':3 },
      lab_patterns:        [
        { test:'wbc',    direction:'high',    threshold:11,  weight:2, critical:false },
        { test:'urine_nitrites', direction:'present', threshold:0, weight:5, critical:false },
        { test:'urine_leucocytes', direction:'present', threshold:0, weight:4, critical:false },
      ],
      risk_factors:        { 'female sex':2.0, 'sexual activity':1.5, 'pregnancy':2.0, 'catheter':2.5, 'diabetes mellitus':1.4, 'recurrent uti history':2.0, 'post-menopausal':1.5, 'structural anomaly':2.0 },
      typical_age:         [15, 85],
      gender_weight:       { M:0.5, F:1.7 },
      kerala_prior:        1.0,
    },
    context_mods: {
      pregnancy:  [{ drug:'nitrofurantoin',  action:'avoid_term', note:'Avoid at term (38+ weeks) — risk of neonatal haemolysis. Safe in T1 and T2.', alternative:'cefalexin 500mg TDS × 7 days' },
                   { drug:'trimethoprim',    action:'avoid_t1',   note:'Avoid in first trimester (folate antagonist)', alternative:'cefalexin or nitrofurantoin (T2)' },
                   { drug:'quinolone',       action:'avoid',      note:'Avoid all fluoroquinolones in pregnancy — cartilage risk', alternative:'cefalexin or nitrofurantoin' }],
      renal:      [{ drug:'nitrofurantoin',  action:'avoid',      egfr_threshold:30, note:'Inadequate urinary drug concentration if eGFR <30 — ineffective and peripheral neuropathy risk', alternative:'cefalexin 500mg TDS (adjust if eGFR <10)' }],
      hepatic:    [],
      elderly:    [{ drug:'trimethoprim',    action:'check_k',    note:'Raises potassium — check K+ before prescribing in >65y on ACEi/ARB/spironolactone', age_threshold:65 }],
    },
  },

  migraine: {
    scoring: {
      core_symptoms:       { 'headache':2, 'unilateral headache':4, 'pulsating headache':4, 'nausea':3, 'photophobia':4, 'phonophobia':4 },
      supporting_symptoms: { 'vomiting':2, 'aura':3, 'visual disturbance':3, 'tingling':2, 'worsened by activity':3 },
      contradictions:      { 'thunderclap headache':(-5), 'fever':(-3), 'neck stiffness':(-4), 'first ever headache':(-3), 'progressive headache':(-3), 'age >50 new onset':(-2) },
      exam_clues:          { 'normal neurology':2, 'photosensitive':2, 'phonosensitive':2 },
      lab_patterns:        [],
      risk_factors:        { 'female sex':1.4, 'previous migraine':3.0, 'family migraine':1.7, 'ocp use':1.3, 'hormonal changes':1.5 },
      typical_age:         [15, 55],
      gender_weight:       { M:0.7, F:1.4 },
      kerala_prior:        1.0,
    },
    context_mods: {
      pregnancy:  [{ drug:'sumatriptan', action:'avoid_if_possible', note:'Limited data — avoid in first trimester, use only if severe in T2/T3 under supervision', alternative:'paracetamol 1g + antiemetic (metoclopramide cautiously)' },
                   { drug:'ergotamine',  action:'absolutely_avoid', note:'Powerful vasoconstrictor — absolutely contraindicated in pregnancy', alternative:'paracetamol + rest + cold compress' },
                   { drug:'topiramate',  action:'avoid', note:'Category D teratogen — stop immediately if pregnancy confirmed', alternative:'paracetamol prophylaxis + magnesium supplement under supervision' },
                   { drug:'nsaid',       action:'avoid_third_trimester', note:'NSAIDs risk premature ductus arteriosus closure in T3', alternative:'paracetamol only after 28 weeks' }],
      renal:      [{ drug:'topiramate', action:'reduce', egfr_threshold:30, note:'Reduce prophylactic dose by 50% in severe renal impairment' },
                   { drug:'nsaid',      action:'avoid', egfr_threshold:30,  note:'NSAIDs worsen renal function in CKD — use paracetamol' }],
      hepatic:    [{ drug:'valproate',  action:'avoid', note:'Hepatotoxic — contraindicated in significant hepatic impairment' }],
      elderly:    [{ drug:'triptan',    action:'check_cardiac', note:'Ensure no undiagnosed cardiac disease before prescribing triptans in >65y — vasoconstriction risk', age_threshold:65 }],
    },
  },

  gout: {
    scoring: {
      core_symptoms:       { 'joint pain':3, 'podagra':5, 'sudden severe joint pain':5, 'hot joint':4, 'swollen joint':4 },
      supporting_symptoms: { 'tophi':4, 'fever':2, 'previous gout attack':4, 'hyperuricaemia':4, 'metatarsophalangeal joint':4 },
      contradictions:      { 'symmetrical':(-3), 'morning stiffness >1 hour':(-2), 'multiple small joints':(-2), 'female premenopausal':(-2) },
      exam_clues:          { 'erythema':3, 'warmth':4, 'swelling':3, 'tophi':5, 'first mtp tenderness':5 },
      lab_patterns:        [
        { test:'urea', direction:'high', threshold:7.5,  weight:2, critical:false },
        { test:'cr',   direction:'high', threshold:110,  weight:2, critical:false },
        { test:'wbc',  direction:'high', threshold:11,   weight:1, critical:false },
      ],
      risk_factors:        { 'alcohol excess':2.0, 'diuretic use':1.8, 'seafood diet':1.4, 'red meat diet':1.4, 'fructose drinks':1.3, 'hypertension':1.3, 'renal impairment':1.6 },
      typical_age:         [30, 80],
      gender_weight:       { M:1.8, F:0.4 },
      kerala_prior:        1.1,
    },
    context_mods: {
      pregnancy:  [{ drug:'nsaid', action:'avoid_t3', note:'NSAIDs contraindicated in third trimester. Colchicine: limited data — low-dose short course if benefit outweighs risk.', alternative:'prednisolone 30mg OD × 3-5 days (preferred in pregnancy for acute gout)' },
                   { drug:'allopurinol', action:'avoid', note:'Insufficient safety data in pregnancy — discontinue ULT' }],
      renal:      [{ drug:'nsaid',       action:'avoid',  egfr_threshold:30, note:'NSAIDs contraindicated in significant CKD — use colchicine or prednisolone', alternative:'colchicine 500mcg BD (halve if eGFR 10-30)' },
                   { drug:'colchicine',  action:'halve',  egfr_threshold:30, note:'Reduce colchicine to 500mcg OD (not BD) if eGFR <30; avoid if eGFR <10' },
                   { drug:'allopurinol', action:'reduce', egfr_threshold:60, note:'Reduce allopurinol dose: eGFR 30-60 → max 100mg OD; eGFR <30 → 50mg OD' }],
      hepatic:    [{ drug:'colchicine', action:'halve', note:'Halve dose in significant hepatic impairment — impaired biliary excretion' }],
      elderly:    [{ drug:'nsaid',      action:'avoid', note:'High GI bleeding and AKI risk in >70y on NSAIDs — use colchicine or prednisolone', age_threshold:70, alternative:'colchicine 500mcg BD or prednisolone 30mg × 3-5 days' }],
    },
  },


  sah: {
    scoring: {
      core_symptoms:       { 'thunderclap headache':7, 'worst headache of life':6, 'sudden severe headache':6 },
      supporting_symptoms: { 'headache':2, 'neck stiffness':3, 'photophobia':3, 'vomiting':2, 'syncope':2, 'confusion':2 },
      contradictions:      {
        'no headache':(-6), 'gradual onset':(-3), 'wheeze':(-3),
        'dyspnoea on exertion':(-3), 'chest pain':(-2), 'exertional':(-2),
        'no neck stiffness':(-3), 'cough':(-1),
      },
      exam_clues:          { 'neck stiffness':4, 'kernig sign':4, 'papilloedema':3, 'photophobia':3 },
      lab_patterns:        [],
      risk_factors:        { 'hypertension':1.3, 'family aneurysm':1.8, 'smoking':1.4, 'polycystic kidney disease':1.6 },
      typical_age:         [30, 70],
      gender_weight:       { M:0.8, F:1.2 },
      kerala_prior:        1.0,
    },
    context_mods: { pregnancy:[], renal:[], hepatic:[], elderly:[] },
  },

  meningitis: {
    scoring: {
      core_symptoms:       { 'fever':3, 'neck stiffness':5, 'photophobia':4, 'non-blanching rash':6, 'petechiae':5 },
      supporting_symptoms: { 'headache':2, 'vomiting':2, 'confusion':3, 'seizure':3, 'rigors':2 },
      contradictions:      {
        'no fever':(-5), 'no headache':(-3), 'no neck stiffness':(-4),
        'wheeze':(-4), 'dyspnoea on exertion':(-4), 'chest pain':(-3),
        'exertional symptoms':(-3), 'chronic symptoms':(-2),
      },
      exam_clues:          { 'neck stiffness':5, 'kernig sign':5, 'brudzinski sign':5, 'photophobia':4, 'petechiae':5 },
      lab_patterns:        [
        { test:'wbc',  direction:'high', threshold:15,   weight:3, critical:true  },
        { test:'crp',  direction:'high', threshold:100,  weight:3, critical:false },
        { test:'pct',  direction:'high', threshold:2.0,  weight:4, critical:true  },
      ],
      risk_factors:        { 'unvaccinated':1.5, 'young adult':1.4, 'close contacts':1.8, 'immunosuppressed':2.0 },
      typical_age:         [1, 35],
      gender_weight:       { M:1.0, F:1.0 },
      kerala_prior:        1.0,
    },
    context_mods: { pregnancy:[], renal:[], hepatic:[], elderly:[] },
  },

  dengue: {
    scoring: {
      core_symptoms:       { 'fever':4,'sudden fever':5,'retro-orbital pain':5,'myalgia':4,'arthralgia':3,'rash':3,'thrombocytopenia':5 },
      supporting_symptoms: { 'headache':2,'nausea':2,'vomiting':2,'fatigue':2,'flushing':2 },
      contradictions:      { 'no fever':(-5),'productive cough':(-3),'neck stiffness':(-3),'jaundice':(-2),'purulent sputum':(-2),'localised infection':(-2) },
      exam_clues:          { 'tourniquet test positive':5,'petechiae':4,'hepatomegaly':3,'flushed face':2 },
      lab_patterns:        [
        { test:'wbc',  direction:'low',   threshold:4.0,  weight:4, critical:false },
        { test:'hb',   direction:'high',  threshold:150,  weight:2, critical:false },
        { test:'pct',  direction:'normal',threshold:0.5,  weight:2, critical:false },
      ],
      risk_factors:        { 'kerala monsoon season':2.5,'urban area':1.5,'previous dengue':1.8,'no vaccination':1.2 },
      typical_age:         [5, 70],
      gender_weight:       { M:1.0, F:1.0 },
      kerala_prior:        3.0,
    },
    context_mods: {
      pregnancy:  [{ drug:'any nsaid', action:'absolutely_avoid', note:'NSAIDs absolutely contraindicated in dengue — fatal haemorrhage risk' }],
      renal:      [],
      hepatic:    [],
      elderly:    [{ drug:'oral rehydration', action:'monitor', note:'Elderly at higher risk of fluid overload in critical phase — careful fluid management', age_threshold:65 }],
    },
  },
  leptospirosis: {
    scoring: {
      core_symptoms:       { 'calf muscle pain':6,'conjunctival suffusion':6,'fever rigors':4,'exposure flood water':5,'exposure rodents':4,'abrupt onset fever':4 },
      supporting_symptoms: { 'fever':3,'headache':2,'myalgia':2,'nausea':2,'jaundice':3,'oliguria':4 },
      contradictions:      { 'no exposure history':(-3),'gradual onset':(-2),'sore throat':(-2),'no myalgia':(-2),'productive cough':(-1) },
      exam_clues:          { 'conjunctival suffusion':6,'jaundice':5,'calf tenderness':5,'hepatomegaly':3,'oliguria':4 },
      lab_patterns:        [
        { test:'cr',   direction:'high',  threshold:120,  weight:4, critical:true  },
        { test:'tbil', direction:'high',  threshold:21,   weight:5, critical:true  },
        { test:'wbc',  direction:'high',  threshold:11,   weight:2, critical:false },
      ],
      risk_factors:        { 'paddy worker':3.0,'flood exposure':3.0,'sewer worker':2.5,'monsoon season kerala':2.5,'agricultural work':2.0 },
      typical_age:         [15, 65],
      gender_weight:       { M:1.5, F:0.8 },
      kerala_prior:        2.5,
    },
    context_mods: {
      pregnancy:  [{ drug:'doxycycline', action:'avoid', note:'Contraindicated in pregnancy — use amoxicillin 500mg TDS × 7 days', alternative:'amoxicillin 500mg TDS × 7 days' }],
      renal:      [{ drug:'doxycycline', action:'standard', note:'No dose adjustment — excretion not affected by renal impairment' }],
      hepatic:    [],
      elderly:    [{ drug:'doxycycline', action:'standard', note:'Standard dose in elderly. Monitor renal function carefully — Weil\'s AKI risk higher in elderly.', age_threshold:65 }],
    },
  },
  scrub_typhus: {
    scoring: {
      core_symptoms:       { 'eschar':8,'fever 7 days':5,'regional lymphadenopathy':4,'prolonged fever':4 },
      supporting_symptoms: { 'fever':3,'headache':2,'myalgia':2,'rash':3,'rigors':2 },
      contradictions:      { 'no fever':(-5),'productive cough':(-2),'sore throat':(-2),'diarrhoea':(-1) },
      exam_clues:          { 'eschar present':8,'lymphadenopathy':4,'macular rash trunk':3,'hepatosplenomegaly':2 },
      lab_patterns:        [
        { test:'wbc',  direction:'low',   threshold:4.0,  weight:2, critical:false },
        { test:'pct',  direction:'low',   threshold:0.5,  weight:2, critical:false },
      ],
      risk_factors:        { 'wayanad':2.5,'idukki':2.5,'forest area':2.0,'plantation worker':2.5,'monsoon exposure':1.8 },
      typical_age:         [15, 70],
      gender_weight:       { M:1.3, F:0.9 },
      kerala_prior:        2.0,
    },
    context_mods: {
      pregnancy:  [{ drug:'doxycycline', action:'avoid', note:'Use azithromycin 500mg OD × 7 days in pregnancy', alternative:'azithromycin 500mg OD × 7 days' }],
      renal:      [],
      hepatic:    [],
      elderly:    [],
    },
  },
  typhoid: {
    scoring: {
      core_symptoms:       { 'step ladder fever':5,'prolonged fever':4,'relative bradycardia':5,'coated tongue':4,'RIF pain':4 },
      supporting_symptoms: { 'fever':3,'headache':2,'constipation':3,'diarrhoea':2,'hepatomegaly':3,'splenomegaly':3,'nausea':2 },
      contradictions:      { 'no fever':(-5),'wheeze':(-3),'chest pain':(-2),'rash petechiae':(-2),'sudden onset':(-2),'myalgia severe':(-2) },
      exam_clues:          { 'hepatosplenomegaly':4,'relative bradycardia':5,'coated tongue':4,'rose spots':5 },
      lab_patterns:        [
        { test:'wbc',  direction:'low',   threshold:4.0,  weight:3, critical:false },
        { test:'crp',  direction:'high',  threshold:20,   weight:2, critical:false },
      ],
      risk_factors:        { 'contaminated water exposure':2.5,'poor sanitation':2.0,'travel endemic area':1.8,'unvaccinated':1.4 },
      typical_age:         [5, 50],
      gender_weight:       { M:1.0, F:1.0 },
      kerala_prior:        1.8,
    },
    context_mods: {
      pregnancy:  [{ drug:'azithromycin', action:'category_b_acceptable', note:'Azithromycin acceptable in pregnancy for typhoid. Avoid fluoroquinolones.' }],
      renal:      [{ drug:'cefixime', action:'reduce', egfr_threshold:30, note:'Reduce dose in severe renal impairment' }],
      hepatic:    [],
      elderly:    [],
    },
  },
  acute_gastroenteritis: {
    scoring: {
      core_symptoms:       { 'diarrhoea':5,'vomiting':3,'loose stools':5,'gastroenteritis':5 },
      supporting_symptoms: { 'nausea':2,'abdominal cramps':2,'fever':2,'bloating':1 },
      contradictions:      { 'constipation':(-3),'bloody stool without diarrhoea':(-1),'no GI symptoms':(-4),'chest pain':(-3),'dyspnoea':(-3) },
      exam_clues:          { 'dehydration signs':4,'hyperactive bowel sounds':3,'diffuse mild tenderness':2 },
      lab_patterns:        [],
      risk_factors:        { 'monsoon season':2.0,'contaminated water':2.5,'food handler':1.8,'outbreak exposure':3.0 },
      typical_age:         [1, 90],
      gender_weight:       { M:1.0, F:1.0 },
      kerala_prior:        1.5,
    },
    context_mods: {
      pregnancy:  [{ drug:'azithromycin', action:'category_b', note:'Azithromycin acceptable if antibiotic needed. Avoid fluoroquinolones.' }],
      renal:      [],
      hepatic:    [],
      elderly:    [{ drug:'ors high volume', action:'careful_monitoring', note:'Elderly: risk of electrolyte imbalance — check Na+/K+ if prolonged diarrhoea', age_threshold:65 }],
    },
  },
  osteoarthritis: {
    scoring: {
      core_symptoms:       { 'knee pain':4,'hip pain':4,'joint pain activity':5,'morning stiffness <30 minutes':5,'crepitus':4 },
      supporting_symptoms: { 'joint pain':2,'stiffness':2,'swelling':2,'bony enlargement':3,'restricted movement':3 },
      contradictions:      { 'fever':(-4),'hot joint':(-3),'morning stiffness >1 hour':(-4),'rash':(-3),'young patient':(-2),'systemic features':(-3),'night pain':(-2) },
      exam_clues:          { 'bony swelling':4,'crepitus':4,'restricted rom':3,'mild soft tissue swelling':2,'varus deformity':3 },
      lab_patterns:        [],
      risk_factors:        { 'age >55':2.0,'obesity':1.8,'female sex':1.4,'previous joint injury':1.6,'manual labour':1.5 },
      typical_age:         [45, 90],
      gender_weight:       { M:0.8, F:1.3 },
      kerala_prior:        1.4,
    },
    context_mods: {
      pregnancy:  [{ drug:'nsaid', action:'avoid_t3', note:'NSAIDs contraindicated in third trimester' }],
      renal:      [{ drug:'etoricoxib', action:'avoid', egfr_threshold:30, note:'Avoid NSAIDs in CKD eGFR <30', alternative:'paracetamol + topical diclofenac' }],
      hepatic:    [],
      elderly:    [{ drug:'etoricoxib', action:'start_low_monitor', note:'Start with paracetamol + topical NSAID in >70y before oral NSAID; GI and renal risk high', age_threshold:70 }],
    },
  },
  low_back_pain: {
    scoring: {
      core_symptoms:       { 'low back pain':5,'back pain':4,'lumbar pain':5 },
      supporting_symptoms: { 'stiffness':2,'leg pain':2,'limited movement':3,'pain with movement':3 },
      contradictions:      { 'fever':(-3),'saddle anaesthesia':(-3),'bladder dysfunction':(-3),'bowel dysfunction':(-3),'age <25':(-2),'cancer history':(-3) },
      exam_clues:          { 'limited lumbar flexion':3,'slr positive':4,'paraspinal tenderness':3 },
      lab_patterns:        [],
      risk_factors:        { 'sedentary work':1.4,'manual labour':1.5,'previous back pain':2.0,'obesity':1.3 },
      typical_age:         [25, 80],
      gender_weight:       { M:1.0, F:1.0 },
      kerala_prior:        1.2,
    },
    context_mods: {
      pregnancy:  [{ drug:'nsaid', action:'avoid_t3', note:'NSAIDs contraindicated in T3; paracetamol safe throughout', alternative:'paracetamol + physiotherapy' }],
      renal:      [{ drug:'naproxen', action:'avoid', egfr_threshold:30, note:'Avoid NSAIDs in significant renal impairment', alternative:'paracetamol' }],
      hepatic:    [],
      elderly:    [{ drug:'naproxen', action:'avoid_if_possible', note:'GI bleeding risk very high in >70y on NSAIDs — use paracetamol + topical diclofenac', age_threshold:70 }],
    },
  },

  // ── NEW v5 SCORING EXTENSIONS ─────────────────────────────────────────────

  viral_fever_urti: {
    scoring: {
      core_symptoms:       { 'fever':4,'sore throat':4,'cough':3,'myalgia':3 },
      supporting_symptoms: { 'fatigue':2,'headache':2,'runny nose':3,'sneezing':2,'nausea':1,'vomiting':1 },
      contradictions:      { 'rigors':(-1),'productive cough':(-1),'dyspnoea':(-2),'chest pain':(-3),'no fever':(-5),'rash petechiae':(-2) },
      exam_clues:          { 'pharyngeal erythema':3,'lymphadenopathy':2,'fever >38':3 },
      lab_patterns:        [{ test:'wbc', direction:'low', threshold:4.0, weight:2, critical:false }],
      risk_factors:        { 'monsoon season':1.5,'school contact':1.5,'family exposure':1.8 },
      typical_age:         [1, 90], gender_weight:{ M:1.0, F:1.0 }, kerala_prior:1.5,
    },
    context_mods: { pregnancy:[], renal:[], hepatic:[], elderly:[] },
  },

  peptic_ulcer: {
    scoring: {
      core_symptoms:       { 'epigastric pain':5,'heartburn':3,'dyspepsia':4 },
      supporting_symptoms: { 'nausea':2,'vomiting':2,'anorexia':2,'bloating':2,'worse lying':2,'worse fasting':2 },
      contradictions:      { 'fever':(-2),'right iliac fossa pain':(-3),'diarrhoea':(-2) },
      exam_clues:          { 'epigastric tenderness':4,'no peritonism':2 },
      lab_patterns:        [{ test:'hb', direction:'low', threshold:110, weight:2, critical:false }],
      risk_factors:        { 'nsaid use':2.5,'aspirin use':2.0,'alcohol excess':1.8,'previous ulcer':2.5,'h pylori infection':2.0,'smoking':1.4 },
      typical_age:         [20, 70], gender_weight:{ M:1.3, F:0.8 }, kerala_prior:1.4,
    },
    context_mods: {
      pregnancy:  [{ drug:'nsaid', action:'avoid', note:'NSAIDs contraindicated in pregnancy', alternative:'antacids + alginate' }],
      renal:      [{ drug:'nsaid', action:'avoid', egfr_threshold:30, note:'Avoid NSAIDs in CKD' }],
      hepatic:    [],
      elderly:    [{ drug:'nsaid', action:'avoid_if_possible', note:'High GI bleed risk >65y; PPI cover if NSAID mandatory', age_threshold:65 }],
    },
  },

  uti_dysuria: {
    scoring: {
      core_symptoms:       { 'burning micturition':6,'dysuria':5,'urinary frequency':5 },
      supporting_symptoms: { 'haematuria':3,'lower abdominal pain':3,'nocturia':2,'dark urine':2,'urgency':3,'cloudy urine':3 },
      contradictions:      { 'fever >38.5':(-1),'loin pain':(-2),'no urinary symptoms':(-5),'diarrhoea':(-3) },
      exam_clues:          { 'suprapubic tenderness':4 },
      lab_patterns:        [],
      risk_factors:        { 'female sex':2.0,'sexually active':1.5,'catheter':2.5,'previous uti':1.8,'diabetes':1.6 },
      typical_age:         [15, 80], gender_weight:{ M:0.3, F:2.0 }, kerala_prior:1.5,
    },
    context_mods: {
      pregnancy:  [{ drug:'nitrofurantoin', action:'avoid_t3', note:'Avoid nitrofurantoin at term; use cefalexin in T3', alternative:'cefalexin 500mg TDS × 7 days' },
                   { drug:'trimethoprim', action:'avoid_t1', note:'Avoid in T1 (folate antagonist)', alternative:'cefalexin' }],
      renal:      [{ drug:'nitrofurantoin', action:'avoid', egfr_threshold:30, note:'Ineffective and toxic if eGFR <30', alternative:'amoxicillin or co-amoxiclav' }],
      hepatic:    [],
      elderly:    [{ drug:'trimethoprim', action:'monitor', note:'Risk of hyperkalaemia in elderly on ACEi/ARB', age_threshold:65 }],
    },
  },

  dengue_fever: {
    scoring: {
      core_symptoms:       { 'fever':4,'myalgia':4,'retro-orbital headache':6,'bone pain':5 },
      supporting_symptoms: { 'headache':2,'nausea':2,'vomiting':2,'fatigue':2,'arthralgia':3,'rash':3 },
      contradictions:      { 'productive cough':(-2),'sore throat':(-2),'no fever':(-5) },
      exam_clues:          { 'tourniquet test positive':4,'petechiae':4,'hepatomegaly':2 },
      lab_patterns:        [
        { test:'plt', direction:'low',  threshold:150, weight:5, critical:true  },
        { test:'wbc', direction:'low',  threshold:4.0, weight:3, critical:false },
      ],
      risk_factors:        { 'monsoon season':2.5,'stagnant water exposure':2.0,'previous dengue':1.6 },
      typical_age:         [5, 60], gender_weight:{ M:1.0, F:1.0 }, kerala_prior:2.0,
    },
    context_mods: {
      pregnancy:  [{ drug:'nsaid', action:'absolutely_avoid', note:'NSAIDs absolutely contraindicated in dengue — haemorrhage risk', alternative:'paracetamol ONLY' }],
      renal:[], hepatic:[], elderly:[],
    },
  },

  hyperthyroidism: {
    scoring: {
      core_symptoms:       { 'heat intolerance':5,'weight loss':4,'tremor':4,'palpitations':3 },
      supporting_symptoms: { 'diarrhoea':2,'anxiety':2,'hair loss':2,'exophthalmos':5,'goitre':4,'tachycardia':3,'sweating':2,'insomnia':2 },
      contradictions:      { 'cold intolerance':(-5),'weight gain':(-4),'constipation':(-3),'bradycardia':(-4) },
      exam_clues:          { 'exophthalmos':5,'lid lag':4,'goitre':4,'tachycardia':3,'fine tremor':4,'warm moist skin':3 },
      lab_patterns:        [
        { test:'tsh', direction:'low',  threshold:0.4, weight:6, critical:true  },
        { test:'ft4', direction:'high', threshold:22,  weight:5, critical:true  },
      ],
      risk_factors:        { 'autoimmune disease':1.8,'family thyroid':1.6,'amiodarone':2.0 },
      typical_age:         [15, 60], gender_weight:{ M:0.4, F:2.0 }, kerala_prior:1.6,
    },
    context_mods: {
      pregnancy:  [{ drug:'propylthiouracil', action:'preferred_t1', note:'PTU preferred in T1; switch to carbimazole in T2/T3', alternative:'carbimazole T2/T3' }],
      renal:[], hepatic:[{ drug:'propylthiouracil', action:'avoid', note:'PTU hepatotoxic — use carbimazole', alternative:'carbimazole' }],
      elderly:    [{ drug:'radioiodine', action:'consider_first_line', note:'Radioiodine preferred in elderly', age_threshold:65 }],
    },
  },

  hepatitis: {
    scoring: {
      core_symptoms:       { 'jaundice':5,'dark urine':4,'anorexia':4,'right upper quadrant pain':4 },
      supporting_symptoms: { 'nausea':2,'vomiting':2,'fatigue':3,'fever':2,'pale stools':3,'pruritus':2 },
      contradictions:      { 'no jaundice':(-3),'chest pain':(-3),'bilateral oedema':(-2) },
      exam_clues:          { 'jaundice':5,'hepatomegaly':4,'tender liver':3,'splenomegaly':2 },
      lab_patterns:        [
        { test:'alt',  direction:'high', threshold:40,  weight:5, critical:true  },
        { test:'tbil', direction:'high', threshold:21,  weight:4, critical:false },
      ],
      risk_factors:        { 'contaminated water exposure':2.0,'raw shellfish':2.0,'unvaccinated':1.8,'travel endemic area':1.5 },
      typical_age:         [10, 50], gender_weight:{ M:1.2, F:0.9 }, kerala_prior:1.6,
    },
    context_mods: { pregnancy:[], renal:[], hepatic:[], elderly:[] },
  },

  urolithiasis: {
    scoring: {
      core_symptoms:       { 'loin pain':5,'renal colic':6,'colicky pain':4,'radiation to groin':5 },
      supporting_symptoms: { 'haematuria':4,'vomiting':2,'nausea':2,'lower abdominal pain':2 },
      contradictions:      { 'fever rigors':(-1),'bilateral pain':(-2),'diarrhoea':(-3) },
      exam_clues:          { 'loin tenderness':4,'renal angle tenderness':4 },
      lab_patterns:        [],
      risk_factors:        { 'previous stones':2.5,'dehydration':1.8,'low fluid intake':1.6 },
      typical_age:         [20, 60], gender_weight:{ M:1.5, F:0.7 }, kerala_prior:1.3,
    },
    context_mods: {
      pregnancy:  [{ drug:'nsaid', action:'avoid_t3', note:'Avoid NSAIDs in T3; paracetamol + low-dose opioid under supervision', alternative:'paracetamol + opioid under supervision' }],
      renal:      [{ drug:'nsaid', action:'avoid', egfr_threshold:30, note:'NSAIDs worsen AKI in renal stones', alternative:'IV paracetamol or morphine' }],
      hepatic:[], elderly:[],
    },
  },

};  // END KBE_SCORING_EXTENSION


// ══════════════════════════════════════════════════════════════════════
// KBE INITIALISER: Merge scoring extension into CLINICAL_KB at runtime
// ══════════════════════════════════════════════════════════════════════

function kbeInit() {
  for (const [id, ext] of Object.entries(KBE_SCORING_EXTENSION)) {
    if (CLINICAL_KB[id]) {
      if (ext.scoring)      CLINICAL_KB[id].scoring      = ext.scoring;
      if (ext.context_mods) CLINICAL_KB[id].context_mods = ext.context_mods;
    }
  }
  console.log('[KBE] Scoring extension merged into CLINICAL_KB for', Object.keys(KBE_SCORING_EXTENSION).length, 'conditions');
}


// ══════════════════════════════════════════════════════════════════════
// KBE SCORING ENGINE
// Replaces scoreConditions() — all scoring flows through KB
// ══════════════════════════════════════════════════════════════════════

/**
 * KBE_SCORE_CONDITION(conditionId, corpus, patient, examFindings, labs, gaps)
 * Returns a score object with evidence breakdown
 */
function kbeScoreCondition(condId, corpus, patient, examFindings, labs, gaps) {
  const kb = CLINICAL_KB[condId];
  if (!kb || !kb.scoring) return null;

  const sc = kb.scoring;
  const evidence_for    = [];
  const evidence_against = [];
  let raw = 0;

  // ── STEP 1: Core symptoms (high weight) ─────────────────────────
  for (const [sym, w] of Object.entries(sc.core_symptoms || {})) {
    if (termPresent(corpus, sym)) {
      raw += w;
      evidence_for.push({ type:'core_symptom', text: sym, weight: w });
    }
  }

  // ── STEP 2: Supporting symptoms ──────────────────────────────────
  for (const [sym, w] of Object.entries(sc.supporting_symptoms || {})) {
    if (termPresent(corpus, sym)) {
      raw += w;
      evidence_for.push({ type:'supporting_symptom', text: sym, weight: w });
    }
  }

  // ── STEP 3: Contradictions (NEGATIVE scoring) ─────────────────────
  for (const [sym, w] of Object.entries(sc.contradictions || {})) {
    if (termPresent(corpus, sym) || (sym === 'age >50 new onset' && patient.age > 50)) {
      raw += w;  // w is already negative
      evidence_against.push({ type:'contradiction', text: sym, weight: Math.abs(w) });
    }
  }

  // ── STEP 4: Exam findings ─────────────────────────────────────────
  const allExamText = Object.values(examFindings || {})
    .flatMap(sys => Object.values(sys))
    .join(' ')
    .toLowerCase();

  for (const [finding, w] of Object.entries(sc.exam_clues || {})) {
    if (allExamText.includes(finding.toLowerCase())) {
      raw += w;
      evidence_for.push({ type:'exam_finding', text: finding, weight: w });
    }
  }

  // ── STEP 5: Lab patterns ──────────────────────────────────────────
  for (const lab of sc.lab_patterns || []) {
    const val = parseFloat(labs[lab.test] || '');
    if (isNaN(val)) continue;

    let lab_match = false;
    if (lab.direction === 'high'    && val > lab.threshold)  lab_match = true;
    if (lab.direction === 'low'     && val < lab.threshold)  lab_match = true;
    if (lab.direction === 'normal'  && Math.abs(val - lab.threshold) < 2) lab_match = true;
    if (lab.direction === 'present' && val > 0)             lab_match = true;

    if (lab_match) {
      raw += lab.weight;
      if (lab.weight >= 0) evidence_for.push({ type:'lab_pattern', text: `${lab.test} ${lab.direction}${lab.critical ? ' (critical)' : ''}`, weight: lab.weight });
      else evidence_against.push({ type:'lab_contradict', text: `${lab.test} ${lab.direction}`, weight: Math.abs(lab.weight) });
    }
  }

  // ── STEP 6: Risk factor multipliers ──────────────────────────────
  const comorbidText = ((patient.comorbid || '') + ' ' + corpus).toLowerCase();
  let risk_mult = 1.0;
  const risk_reasons = [];

  for (const [factor, mult] of Object.entries(sc.risk_factors || {})) {
    if (comorbidText.includes(factor.replace(/[^a-z ]/g, ''))) {
      risk_mult *= mult;
      risk_reasons.push({ factor, mult });
      evidence_for.push({ type:'risk_factor', text: factor, weight: Math.round((mult - 1.0) * 10) / 10 });
    }
  }

  // ── STEP 7: Age multiplier ────────────────────────────────────────
  const [ageMin, ageMax] = sc.typical_age || [0, 100];
  let age_mult = 1.0;
  if (patient.age) {
    if (patient.age >= ageMin && patient.age <= ageMax) {
      // In peak range — scale by how central
      const mid = (ageMin + ageMax) / 2;
      const range = (ageMax - ageMin) / 2;
      const centrality = 1 - Math.abs(patient.age - mid) / (range * 1.5);
      age_mult = 1.0 + (centrality * 0.4);
    } else if (patient.age < ageMin - 15 || patient.age > ageMax + 10) {
      age_mult = 0.4;  // Well outside range
    } else {
      age_mult = 0.75;  // Just outside range
    }
  }

  // ── STEP 8: Gender multiplier ─────────────────────────────────────
  const gw = sc.gender_weight || { M:1.0, F:1.0 };
  const gender_mult = (patient.gender && gw[patient.gender] !== undefined)
    ? gw[patient.gender]
    : 1.0;

  if (gender_mult === 0) return null;  // Biologically impossible

  // ── STEP 9: Kerala prior ──────────────────────────────────────────
  const kerala_mult = sc.kerala_prior || 1.0;

  // ── STEP 10: Compute final score ───────────────────────────────────
  const final_raw = Math.max(0, raw) * age_mult * gender_mult * kerala_mult * risk_mult;

  if (final_raw === 0 && evidence_for.length === 0) return null;  // No evidence at all

  // ── STEP 11: Missing data (what would change this score) ──────────
  const missing = [];
  if (!patient.age)    missing.push('Patient age (critical for age-adjusted probability)');
  if (!patient.gender) missing.push('Patient sex (affects prior probability)');

  for (const gap of (gaps || []).filter(g => !g.value).slice(0, 3)) {
    missing.push(gap.label);
  }

  return {
    condId,
    kb,
    raw_score:  parseFloat(raw.toFixed(2)),
    final_raw:  parseFloat(final_raw.toFixed(2)),
    evidence_for,
    evidence_against,
    missing,
    multipliers: { age_mult, gender_mult, kerala_mult, risk_mult },
  };
}

/**
 * KBE_SCORE_ALL — score every KB condition, return ranked array with
 * normalised % likelihood
 */
function kbeScoreAll(corpus, patient, examFindings, labs, gaps) {
  const results = [];

  // Score all KB conditions
  for (const condId of Object.keys(CLINICAL_KB)) {
    const r = kbeScoreCondition(condId, corpus, patient, examFindings, labs, gaps);
    if (r && r.final_raw > 0) results.push(r);
  }

  // Also score fallback CONDITIONS that aren't in KB
  // Minimum score of 3 to prevent non-specific symptoms triggering danger conditions
  for (const cond of CONDITIONS) {
    if (CLINICAL_KB[KB_ID_MAP[cond.id] || cond.id]) continue;  // Already scored via KB

    let score = 0;
    const weights = cond.w || {};
    for (const [sym, w] of Object.entries(weights)) {
      if (termPresent(corpus, sym)) { score += w; }
    }
    // Higher threshold for danger conditions (prevent false T3 from non-specific symptoms)
    const minScore = cond.danger ? 4 : 2;
    if (score >= minScore) {
      results.push({
        condId: cond.id,
        kb: { id: cond.id, name: cond.name, systems: cond.systems || [],
               key_symptoms: Object.keys(weights), icd10: '' },
        raw_score: score,
        final_raw: score,
        evidence_for: Object.entries(weights)
          .filter(([s]) => termPresent(corpus, s))
          .map(([s, w]) => ({ type:'symptom', text: s, weight: w })),
        evidence_against: [],
        missing: [],
        multipliers: { age_mult:1, gender_mult:1, kerala_mult:1, risk_mult:1 },
        _fallback: true,
      });
    }
  }

  // Sort by final_raw descending
  results.sort((a, b) => b.final_raw - a.final_raw);

  // Normalise to % likelihood using softmax-style normalisation
  // Top score gets up to 92%, others scale proportionally
  const topScore = results[0]?.final_raw || 1;
  const minShow  = results.length > 0 ? Math.max(topScore * 0.05, 0.5) : 0;

  const visible = results.filter(r => r.final_raw >= minShow).slice(0, 12);

  // Bayesian-style normalisation: assign % that sum to ~100 within top results
  const totalRaw = visible.reduce((s, r) => s + r.final_raw, 0) || 1;
  for (const r of visible) {
    // Cap top at 92% (a doctor is never 100% certain without investigation)
    r.likelihood_pct = Math.min(92, Math.round((r.final_raw / totalRaw) * 100 * 1.8));
    r.likelihood_pct = Math.max(r.likelihood_pct, 3);
  }

  return visible;
}


// ══════════════════════════════════════════════════════════════════════
// KBE DIFFERENTIAL ENGINE
// Replaces buildDifferential() — uses evidence-based tiering
// ══════════════════════════════════════════════════════════════════════

function kbeBuildDifferential(kbeScored, redFlags) {
  const t3 = [], t1 = [], t2 = [];  // must-not-miss, most-likely, possible
  const seen = new Set();

  // T3 — must not miss (red flags + danger conditions)
  for (const rf of redFlags) {
    const cond = rf.cond && CMAP[rf.cond];
    const kb   = rf.cond && (CLINICAL_KB[rf.cond] || CLINICAL_KB[KB_ID_MAP[rf.cond] || '']);
    if (!seen.has(rf.cond)) {
      const scored = kbeScored.find(r => r.condId === rf.cond || r.condId === (KB_ID_MAP[rf.cond] || ''));
      t3.push({
        id:         rf.cond,
        name:       kb?.name || cond?.name || rf.cond,
        systems:    kb?.systems || cond?.systems || [],
        reason:     kb?.key_symptoms?.slice(0,3).join(', ') || rf.msg,
        missing:    (scored?.missing || []).join('; ') || '',
        score:      scored?.final_raw || 999,
        likelihood_pct: scored?.likelihood_pct || null,
        evidence_for:   scored?.evidence_for || [],
        evidence_against: scored?.evidence_against || [],
        danger:     true,
        tier:       't3',
        gl:         kb?.gl_sources?.[0]?.name || '',
        icd10:      kb?.icd10 || '',
      });
      seen.add(rf.cond);
    }
  }

  // Additional danger from KB — only if MEANINGFUL score
  // Threshold: raw_score >= 4 prevents non-specific symptoms (dyspnoea alone)
  // from triggering unrelated dangerous conditions (sepsis, meningitis, SAH)
  const T3_MIN_SCORE = 4.0;
  for (const r of kbeScored) {
    if (seen.has(r.condId)) continue;
    const cond = CMAP[r.condId] || CMAP[KB_ID_MAP[r.condId] || ''];
    // Only include danger conditions with meaningful supporting evidence AND likelihood
    if (cond?.danger && t3.length < 5 && r.final_raw >= T3_MIN_SCORE && (r.likelihood_pct || 0) >= 8) {
      t3.push(kbeFormatResult(r));
      seen.add(r.condId);
    }
  }

  // T1 — most likely (highest scored non-danger)
  for (const r of kbeScored) {
    if (seen.has(r.condId) || t1.length >= 5) continue;
    const cond = CMAP[r.condId] || CMAP[KB_ID_MAP[r.condId] || ''];
    if (!cond?.danger && r.likelihood_pct >= 8 && r.final_raw >= 2) {
      t1.push(kbeFormatResult(r));
      seen.add(r.condId);
    }
  }

  // Guarantee ≥2 in t1
  for (const r of kbeScored) {
    if (t1.length >= 2) break;
    if (seen.has(r.condId)) continue;
    const cond = CMAP[r.condId] || CMAP[KB_ID_MAP[r.condId] || ''];
    if (!cond?.danger) {
      t1.push(kbeFormatResult(r));
      seen.add(r.condId);
    }
  }

  // T2 — possible (moderate likelihood)
  for (const r of kbeScored) {
    if (seen.has(r.condId) || t2.length >= 4) continue;
    if (r.likelihood_pct >= 5) {
      t2.push(kbeFormatResult(r));
      seen.add(r.condId);
    }
  }

  return { t3, t1, t2,
    must_not_miss: t3,
    most_likely:   t1,
    less_likely:   t2 };
}

function kbeFormatResult(r) {
  const cond = CMAP[r.condId] || CMAP[KB_ID_MAP[r.condId] || ''];
  const kb   = CLINICAL_KB[KB_ID_MAP[r.condId] || r.condId] || r.kb;
  return {
    id:             r.condId,
    name:           r.kb?.name || cond?.name || r.condId,
    systems:        r.kb?.systems || cond?.systems || [],
    reason:         r.kb?.key_symptoms?.slice(0,3).join(', ') + (r.evidence_for.length ? ` — supported by: ${r.evidence_for.slice(0,2).map(e=>e.text).join(', ')}` : ''),
    missing:        (r.missing || []).slice(0,2).join('; '),
    score:          r.final_raw,
    likelihood_pct: r.likelihood_pct,
    evidence_for:   r.evidence_for,
    evidence_against: r.evidence_against,
    danger:         !!cond?.danger,
    tier:           cond?.tier || 't1',
    gl:             r.kb?.gl_sources?.[0]?.name || cond?.gl || '',
    icd10:          r.kb?.icd10 || '',
    multipliers:    r.multipliers,
  };
}


// ══════════════════════════════════════════════════════════════════════
// KBE LAB INTERPRETATION ENGINE
// Converts abnormal lab values into clinical diagnosis suggestions
// ══════════════════════════════════════════════════════════════════════

const LAB_INTERPRETATION_RULES = [
  // Cardiac
  { test:'trop',  direction:'high', threshold:14,   msg:'Elevated troponin → Acute Myocardial Injury. Rule out ACS (NSTEMI/STEMI) first. Serial troponin at 3h.', conditions:['nstemi'], urgency:'critical', gl:'ESC 0h/3h algorithm' },
  { test:'bnp',   direction:'high', threshold:100,  msg:'Elevated BNP → Heart Failure likely. Echocardiogram required to assess EF and structure.', conditions:['heart_failure'], urgency:'urgent', gl:'ESC HF 2021' },
  // Metabolic
  { test:'glu',   direction:'high', threshold:11.1, msg:'Random glucose ≥11.1 mmol/L → Diabetes mellitus until excluded. Confirm with HbA1c.', conditions:['t2dm'], urgency:'important', gl:'ADA 2024' },
  { test:'hba1c', direction:'high', threshold:6.5,  msg:'HbA1c ≥6.5% (48 mmol/mol) → Diagnostic of Type 2 Diabetes Mellitus if confirmed on second occasion.', conditions:['t2dm'], urgency:'important', gl:'ADA 2024 / WHO 2023' },
  { test:'hba1c', direction:'range', low:5.7, high:6.5, msg:'HbA1c 5.7-6.4% → Pre-diabetes (impaired fasting glucose). Intensive lifestyle intervention + annual monitoring.', conditions:['t2dm'], urgency:'routine', gl:'ADA 2024' },
  // Renal
  { test:'cr',    direction:'high', threshold:120,  msg:'Elevated creatinine → AKI or CKD. Calculate eGFR (CKD-EPI 2021). Review nephrotoxic medications.', conditions:['uti'], urgency:'important', gl:'KDIGO 2022' },
  { test:'k',     direction:'high', threshold:5.5,  msg:'Hyperkalaemia ≥5.5 mmol/L → STOP ACEi/ARB/spironolactone. ECG immediately (peaked T waves). Diet review.', conditions:[], urgency:'critical', gl:'BNF / ACC/AHA' },
  { test:'k',     direction:'low',  threshold:3.0,  msg:'Hypokalaemia <3.0 mmol/L → IV/oral KCl replacement. Review diuretics. ECG (flattened T, U waves).', conditions:[], urgency:'urgent', gl:'BNF' },
  { test:'na',    direction:'low',  threshold:130,  msg:'Hyponatraemia <130 mmol/L → May indicate SIADH, hypothyroidism, or heart failure. Check TFT, cortisol, urine Na+.', conditions:['hypothyroidism','heart_failure'], urgency:'urgent', gl:'ESE Hyponatraemia 2014' },
  // Thyroid
  { test:'tsh',   direction:'high', threshold:4.5,  msg:'Elevated TSH → Primary hypothyroidism. Measure Free T4. If TSH >10: treat. Anti-TPO for Hashimoto\'s.', conditions:['hypothyroid'], urgency:'routine', gl:'NICE CG132' },
  { test:'tsh',   direction:'low',  threshold:0.4,  msg:'Suppressed TSH → Hyperthyroidism or over-replacement. Measure Free T4 and T3. TRAb if Graves suspected.', conditions:[], urgency:'important', gl:'ETA 2018' },
  // Haematology
  { test:'hb',    direction:'low',  threshold:100,  msg:'Anaemia Hb <100 g/L → Iron studies + B12/folate + reticulocyte count. Urgency based on symptoms.', conditions:['iron_deficiency_anaemia'], urgency:'important', gl:'BSH 2022' },
  { test:'hb',    direction:'low',  threshold:70,   msg:'Severe anaemia Hb <70 g/L → Consider transfusion trigger. Symptomatic? Investigate source urgently.', conditions:['iron_deficiency_anaemia'], urgency:'critical', gl:'BSH Transfusion 2017' },
  { test:'wbc',   direction:'high', threshold:11,   msg:'Leukocytosis → Infection (neutrophilia), inflammation, or rarely haematological malignancy. Differential WBC required.', conditions:['pneumonia','sepsis'], urgency:'important', gl:'Harrison\'s 21e' },
  { test:'wbc',   direction:'low',  threshold:4,    msg:'Leucopenia → Viral infection, autoimmune disease, or drug effect. Repeat FBC + viral screen (EBV, CMV).', conditions:[], urgency:'important', gl:'Harrison\'s 21e' },
  // Inflammation
  { test:'crp',   direction:'high', threshold:50,   msg:'CRP >50 mg/L → Significant acute inflammation. Bacterial infection more likely than viral. Source workup needed.', conditions:['pneumonia','sepsis'], urgency:'urgent', gl:'NICE evidence review' },
  { test:'pct',   direction:'high', threshold:0.5,  msg:'Procalcitonin >0.5 ng/mL → Bacterial infection highly likely. Supports antibiotic initiation. Repeat at 48h for stewardship.', conditions:['sepsis','pneumonia'], urgency:'urgent', gl:'Surviving Sepsis 2021' },
  // Liver
  { test:'alt',   direction:'high', threshold:40,   msg:'Elevated ALT → Hepatocellular damage. Consider: NAFLD, viral hepatitis (HBsAg, anti-HCV), alcohol, drugs. USS liver.', conditions:[], urgency:'routine', gl:'BSG Liver 2021' },
  { test:'tbil',  direction:'high', threshold:21,   msg:'Elevated bilirubin → Jaundice workup: USS liver + LFT pattern (obstructive vs hepatocellular) + viral screen.', conditions:[], urgency:'important', gl:'BSG' },
  // Lactate
  { test:'lact',  direction:'high', threshold:2.0,  msg:'Lactate >2 mmol/L → Tissue hypoperfusion (cryptic shock). Aggressive fluid resuscitation + sepsis workup. Target clearance ≥10%/2h.', conditions:['sepsis'], urgency:'critical', gl:'Surviving Sepsis 2021' },
];

function kbeInterpretLabs(labs) {
  const alerts = [];
  const condBoosts = {};  // condId: additional score boost from labs

  for (const rule of LAB_INTERPRETATION_RULES) {
    const val = parseFloat(labs[rule.test] || '');
    if (isNaN(val)) continue;

    let matched = false;
    if (rule.direction === 'high'  && val >= rule.threshold) matched = true;
    if (rule.direction === 'low'   && val <= rule.threshold) matched = true;
    if (rule.direction === 'range' && val >= rule.low && val < rule.high) matched = true;

    if (matched) {
      alerts.push({
        test:       rule.test.toUpperCase(),
        value:      val,
        msg:        rule.msg,
        urgency:    rule.urgency,
        conditions: rule.conditions,
        gl:         rule.gl,
      });
      // Boost condition scores
      for (const condId of rule.conditions) {
        condBoosts[condId] = (condBoosts[condId] || 0) + 3;
      }
    }
  }

  return { alerts, condBoosts };
}


// ══════════════════════════════════════════════════════════════════════
// KBE TREATMENT ENGINE
// Diagnosis → treatment plan from KB, modified by patient context
// ══════════════════════════════════════════════════════════════════════

function kbeGetPatientContext(patient, corpus, labs) {
  const ctx = {
    pregnancy:  false,
    renal:      false,
    renal_egfr: null,
    hepatic:    false,
    elderly:    false,
    elderly_age: null,
  };

  const comorbid = (patient.comorbid || '').toLowerCase();
  const c = (corpus || '').toLowerCase();

  // Pregnancy
  if (termPresent(c, 'pregnancy') || termPresent(c, 'pregnant') ||
      comorbid.includes('preg') || patient.gender === 'F' && patient.age >= 15 && patient.age <= 50 &&
      (termPresent(c, 'amenorrhoea') || termPresent(c, 'missed period'))) {
    ctx.pregnancy = true;
  }

  // Renal
  const crVal = parseFloat(labs?.cr || '');
  const egfrApprox = crVal > 0 ?
    (140 - (patient.age || 50)) * 72 / crVal * (patient.gender === 'F' ? 0.85 : 1.0) : null;

  if (comorbid.includes('ckd') || comorbid.includes('renal') ||
      termPresent(c, 'chronic kidney disease') || (egfrApprox && egfrApprox < 60)) {
    ctx.renal    = true;
    ctx.renal_egfr = egfrApprox ? Math.round(egfrApprox) : null;
  }

  // Hepatic
  const altVal = parseFloat(labs?.alt || '');
  const tbilVal = parseFloat(labs?.tbil || '');
  if (comorbid.includes('hepatic') || comorbid.includes('liver') || comorbid.includes('cirrhosis') ||
      (altVal > 100) || (tbilVal > 35)) {
    ctx.hepatic = true;
  }

  // Elderly
  if (patient.age >= 75) {
    ctx.elderly     = true;
    ctx.elderly_age = patient.age;
  }

  return ctx;
}

/**
 * Given a KB condition ID and patient context, return a treatment plan
 * with context-specific modifications flagged.
 */
function kbeGetTreatmentPlan(condId, patient, corpus, labs, gaps) {
  const kbKey = KB_ID_MAP[condId] || condId;
  const kb    = CLINICAL_KB[kbKey];
  if (!kb || !kb.treatment) return null;

  const ctx = kbeGetPatientContext(patient, corpus, labs);
  const plan = {
    conditionName: kb.name,
    conditionId:   condId,
    context:       ctx,
    lines:         [],  // { label, drugs: [{...drug, modifications:[]}] }
    contraindications_active: [],
    monitoring:    kb.monitoring || [],
    referral:      kb.referral   || [],
    india_context: kb.india_context || {},
    gl_sources:    kb.gl_sources  || [],
    nbq:           null,
  };

  // Copy treatment lines and annotate each drug with context modifications
  for (const [lineKey, line] of Object.entries(kb.treatment || {})) {
    const planLine = { label: line.label, lineKey, drugs: [] };

    for (const drug of (line.drugs || [])) {
      const planDrug = { ...drug, modifications: [], warnings: [], ctx_safe: true };

      // Check context modifications
      const ctx_mods = kb.context_mods || {};

      for (const [ctxKey, modList] of Object.entries(ctx_mods)) {
        if (!ctx[ctxKey]) continue;

        for (const mod of modList) {
          const drugLower = (planDrug.generic || '').toLowerCase();
          const modDrug   = (mod.drug || '').toLowerCase();

          // Fuzzy match drug name
          if (drugLower.includes(modDrug) || modDrug.includes(drugLower.split(' ')[0])) {
            const modification = {
              context: ctxKey,
              action:  mod.action,
              note:    mod.note,
              alternative: mod.alternative || null,
              egfr_threshold: mod.egfr_threshold || null,
            };

            // For renal: check if eGFR actually crosses threshold
            if (ctxKey === 'renal' && mod.egfr_threshold && ctx.renal_egfr) {
              if (ctx.renal_egfr > mod.egfr_threshold) continue;  // eGFR OK, skip warning
            }

            // For elderly: check age threshold
            if (ctxKey === 'elderly' && mod.age_threshold) {
              if (ctx.elderly_age < mod.age_threshold) continue;
            }

            planDrug.modifications.push(modification);

            const isUnsafe = ['avoid','absolutely_avoid','avoid_if_possible','avoid_t1','avoid_t3','avoid_term'].includes(mod.action);
            if (isUnsafe) {
              planDrug.ctx_safe = false;
              planDrug.warnings.push(`⛔ ${ctxKey.toUpperCase()}: ${mod.note}`);
              if (mod.alternative) planDrug.warnings.push(`→ Alternative: ${mod.alternative}`);
            } else {
              planDrug.warnings.push(`⚠ ${ctxKey.toUpperCase()}: ${mod.note}`);
            }
          }
        }
      }

      planLine.drugs.push(planDrug);
    }

    plan.lines.push(planLine);
  }

  // Add diagnostics from KB
  if (kb.dx_criteria) plan.dx_criteria = kb.dx_criteria;

  // Active contraindications from context
  if (ctx.pregnancy)    plan.contraindications_active.push('Patient may be pregnant — review all medications for Category A/B safety');
  if (ctx.renal && ctx.renal_egfr) plan.contraindications_active.push(`Renal impairment (estimated eGFR ~${ctx.renal_egfr} mL/min) — dose-adjust or avoid nephrotoxic drugs`);
  if (ctx.hepatic)      plan.contraindications_active.push('Hepatic impairment — avoid hepatotoxic drugs, reduce doses of hepatically-metabolised drugs');
  if (ctx.elderly)      plan.contraindications_active.push(`Elderly patient (${patient.age}y) — start low, go slow. Fall risk, polypharmacy, renal function`);

  return plan;
}


// ══════════════════════════════════════════════════════════════════════
// KBE CERTAINTY ENGINE
// Evidence-weighted certainty calculation (replaces calcCertainty)
// ══════════════════════════════════════════════════════════════════════

function kbeCalcCertainty(kbeScored, redFlags, gaps, examFindings, labs, patient) {
  let score = 20;  // Base

  // Data completeness
  if (patient.age)    score += 8;
  if (patient.gender) score += 7;

  const filledGaps    = (gaps || []).filter(g => g.value).length;
  const totalGaps     = (gaps || []).length || 1;
  const gapCompletion = filledGaps / totalGaps;
  score += Math.round(gapCompletion * 20);

  // Lab data quality
  const labsEntered = Object.values(labs || {}).filter(v => v).length;
  score += Math.min(labsEntered * 1.5, 12);

  // Exam findings
  const examEntered = Object.values(examFindings || {})
    .reduce((a, sys) => a + Object.values(sys).filter(v => v).length, 0);
  score += Math.min(examEntered, 8);

  // Diagnostic confidence from scored conditions
  if (kbeScored.length > 0) {
    const top = kbeScored[0];
    const topPct = top.likelihood_pct || 0;

    if (topPct >= 60) score += 15;
    else if (topPct >= 40) score += 10;
    else if (topPct >= 20) score += 5;

    // Separation from 2nd (clear leader = more certain)
    if (kbeScored.length > 1) {
      const gap = topPct - (kbeScored[1]?.likelihood_pct || 0);
      if (gap > 30) score += 8;
      else if (gap > 15) score += 4;
    }
  }

  // Red flags reduce certainty (emergency conditions = uncertainty)
  score -= Math.min(redFlags.length * 4, 14);

  score = Math.max(15, Math.min(92, Math.round(score)));

  let note = '';
  if (score < 35)       note = 'Very low confidence — critical data missing. History, examination, and investigations needed before any diagnosis.';
  else if (score < 50)  note = 'Low-moderate confidence. Key investigations will substantially change this differential.';
  else if (score < 65)  note = 'Moderate confidence. Targeted investigations recommended to confirm leading diagnosis.';
  else if (redFlags.length > 0) note = 'Moderate confidence — emergency conditions MUST be formally excluded first.';
  else                  note = 'Reasonable diagnostic confidence. Confirmatory investigations appropriate.';

  return { score, note };
}


// ══════════════════════════════════════════════════════════════════════
// KBE NEXT STEPS ENGINE
// Replaces buildNextSteps — derives all steps from KB
// ══════════════════════════════════════════════════════════════════════

function kbeBuildNextSteps(differential, redFlags, kbeScored, labs, patient, corpus) {
  const steps = [];
  const seenActions = new Set();

  const addStep = (type, urgency, icon, action, why) => {
    const key = action.slice(0, 40);
    if (!seenActions.has(key)) {
      steps.push({ type, urgency, icon, action, why });
      seenActions.add(key);
    }
  };

  // ── 1. Red flag immediate actions ────────────────────────────────
  for (const rf of redFlags) {
    addStep('immediate', 'urgent', '⚡', rf.msg, `Red flag: ${(rf.combo||[]).join(' + ')}`);
  }

  // ── 2. Lab-driven next steps ──────────────────────────────────────
  const { alerts: labAlerts } = kbeInterpretLabs(labs);
  for (const alert of labAlerts.filter(a => a.urgency === 'critical' || a.urgency === 'urgent').slice(0, 3)) {
    addStep('lab_action', alert.urgency === 'critical' ? 'urgent' : 'important',
            '🔬', alert.msg.split('→')[0].trim() + ' — ' + (alert.msg.split('→')[1] || '').trim(),
            `Abnormal lab: ${alert.test} — ${alert.gl}`);
  }

  // ── 3. Investigations from KB for top conditions ──────────────────
  const topConds = [
    ...differential.t3.slice(0, 2),
    ...differential.t1.slice(0, 2),
  ].filter(Boolean);

  for (const cond of topConds) {
    const kbKey = KB_ID_MAP[cond.id] || cond.id;
    const kb    = CLINICAL_KB[kbKey];
    if (!kb?.treatment) continue;

    // Use the immediate investigations from KB
    const firstLine = Object.values(kb.treatment)[0];
    if (firstLine?.drugs?.length) {
      const isDanger = !!CMAP[cond.id]?.danger;
      addStep('investigation', isDanger ? 'urgent' : 'routine', '🔬',
              `${cond.name}: ${firstLine.drugs[0].generic || ''} — see Treatment Protocols`,
              `For: ${cond.name} (${kb.gl_sources?.[0]?.name || ''})`);
    }
  }

  // ── 4. Next Best Question from KB ────────────────────────────────
  const topForNBQ = [...differential.t3, ...differential.t1][0];
  if (topForNBQ) {
    const kbKey = KB_ID_MAP[topForNBQ.id] || topForNBQ.id;
    const kb    = CLINICAL_KB[kbKey];
    if (kb?.dx_criteria?.criteria?.length) {
      // Use first unmet criterion as question
      const question = kb.dx_criteria.criteria[0];
      addStep('question', 'important', '❓',
              `"${question}"`,
              `Diagnostic criterion for ${topForNBQ.name} (${kb.dx_criteria.name})`);
    }
  }

  // ── 5. Context-specific safety checks ────────────────────────────
  const ctx = kbeGetPatientContext(patient, corpus, labs);
  if (ctx.pregnancy) addStep('safety', 'urgent', '🤰', 'Confirm pregnancy status — check urine βHCG before prescribing teratogenic medications', 'Patient context: reproductive age female');
  if (ctx.renal)     addStep('safety', 'important', '🩺', `Renal impairment detected (est. eGFR ~${ctx.renal_egfr || '?'} mL/min) — dose-adjust or avoid nephrotoxic drugs`, 'Patient context: CKD');
  if (ctx.elderly)   addStep('safety', 'important', '👴', 'Elderly patient — review polypharmacy, falls risk, and anticholinergic burden before prescribing', `Age ${patient.age} years`);

  return steps;
}


// ══════════════════════════════════════════════════════════════════════
// OVERRIDE: Replace old scoring/differential/nextsteps/certainty
// These are the ONLY integration points — no UI changes needed
// ══════════════════════════════════════════════════════════════════════

// Override scoreConditions — now returns KBE results
// KBE overrides scoreConditions (original is in kbeScoreAll)
function scoreConditions(corpus, patient) {
  // Use KBE engine
  const examFindings = S.examFindings || {};
  const labs         = S.labs || {};
  const gaps         = S.gaps || [];
  return kbeScoreAll(corpus, patient, examFindings, labs, gaps);
}

// Override buildDifferential — now uses KBE evidence-based tiering
// KBE overrides buildDifferential
function buildDifferential(scored, redFlags) {
  return kbeBuildDifferential(scored, redFlags);
}

// Override buildNextSteps — now derives from KB + labs + context
// KBE overrides buildNextSteps
function buildNextSteps(differential, redFlags, labs) {
  return kbeBuildNextSteps(differential, redFlags, S.scored || [],
    labs, S.patient || {}, S.corpus || '');
}

// Override calcCertainty — evidence-weighted
// KBE overrides calcCertainty
function calcCertainty(gaps, scored, redFlags, labs) {
  const c = kbeCalcCertainty(scored, redFlags, gaps,
    S.examFindings || {}, labs, S.patient || {});
  S.certainty = c.score;
  return c.score;
}


// ══════════════════════════════════════════════════════════════════════
// KBE EVIDENCE PANEL RENDERER
// Called from buildAssessment — adds evidence breakdown to differential
// ══════════════════════════════════════════════════════════════════════

function kbeRenderEvidencePanel(scored) {
  const topConds = scored.slice(0, 3);
  if (!topConds.length) return '';

  return topConds.map(r => {
    const name = r.kb?.name || r.condId;
    const pct  = r.likelihood_pct || 0;
    const color = pct >= 50 ? 'var(--ok)' : pct >= 25 ? 'var(--warn)' : 'var(--info)';

    const forList  = (r.evidence_for || []).slice(0,5).map(e =>
      `<div style="display:flex;align-items:center;gap:6px;padding:4px 0;border-bottom:1px solid var(--border);font-size:12px">
        <span style="color:var(--ok);font-size:10px">+${e.weight}</span>
        <span style="color:var(--ink2)">${esc(e.text)}</span>
        <span class="badge badge-gray" style="font-size:8px;margin-left:auto">${esc(e.type.replace('_',' '))}</span>
      </div>`).join('');

    const againstList = (r.evidence_against || []).slice(0,3).map(e =>
      `<div style="display:flex;align-items:center;gap:6px;padding:4px 0;border-bottom:1px solid var(--border);font-size:12px">
        <span style="color:var(--danger);font-size:10px">−${e.weight}</span>
        <span style="color:var(--ink3)">${esc(e.text)}</span>
        <span class="badge badge-gray" style="font-size:8px;margin-left:auto">contra</span>
      </div>`).join('');

    const missList = (r.missing || []).slice(0,2).map(m =>
      `<div style="padding:3px 0;font-size:11.5px;color:var(--warn)">⟳ ${esc(m)}</div>`).join('');

    const mults = r.multipliers || {};
    const multHtml = Object.entries(mults)
      .filter(([, v]) => Math.abs(v - 1.0) > 0.05)
      .map(([k,v]) => `<span class="badge badge-gray" style="font-size:8px">${esc(k.replace('_mult',''))}: ×${v.toFixed(2)}</span>`)
      .join(' ');

    return `<div style="border:1.5px solid var(--border);border-radius:var(--r);overflow:hidden;margin-bottom:10px">
      <div style="display:flex;align-items:center;gap:10px;padding:10px 14px;background:var(--surface2)">
        <div style="flex:1">
          <div style="font-size:13px;font-weight:700;color:var(--ink)">${esc(name)}</div>
          ${r.kb?.icd10 ? `<div style="font-family:var(--font-mono);font-size:9.5px;color:var(--ink4)">${esc(r.kb.icd10)}</div>` : ''}
        </div>
        <div style="text-align:right">
          <div style="font-family:var(--font-mono);font-size:22px;font-weight:700;color:${color}">${pct}%</div>
          <div style="font-size:9.5px;color:var(--ink4)">likelihood</div>
        </div>
      </div>
      <div style="padding:10px 14px">
        ${forList    ? `<div style="margin-bottom:8px"><div style="font-size:9px;font-weight:700;color:var(--ok);text-transform:uppercase;letter-spacing:.8px;margin-bottom:4px">Supporting Evidence</div>${forList}</div>` : ''}
        ${againstList? `<div style="margin-bottom:8px"><div style="font-size:9px;font-weight:700;color:var(--danger);text-transform:uppercase;letter-spacing:.8px;margin-bottom:4px">Contradicting Evidence</div>${againstList}</div>` : ''}
        ${missList   ? `<div style="margin-bottom:6px"><div style="font-size:9px;font-weight:700;color:var(--warn);text-transform:uppercase;letter-spacing:.8px;margin-bottom:4px">Missing Data</div>${missList}</div>` : ''}
        ${multHtml   ? `<div style="margin-top:6px;display:flex;flex-wrap:wrap;gap:4px">${multHtml}</div>` : ''}
      </div>
    </div>`;
  }).join('');
}


// ══════════════════════════════════════════════════════════════════════
// KBE LAB ALERT PANEL — integrated lab interpretation display
// ══════════════════════════════════════════════════════════════════════

function kbeRenderLabAlerts(labs) {
  const { alerts } = kbeInterpretLabs(labs);
  if (!alerts.length) return '';

  const urgencyOrder = { critical:0, urgent:1, important:2, routine:3 };
  alerts.sort((a,b) => (urgencyOrder[a.urgency]||3) - (urgencyOrder[b.urgency]||3));

  return alerts.map(a => {
    const color = a.urgency === 'critical' ? 'var(--danger)' :
                  a.urgency === 'urgent'   ? 'var(--warn)'   : 'var(--info)';
    const bg    = a.urgency === 'critical' ? 'var(--danger-t)' :
                  a.urgency === 'urgent'   ? 'var(--warn-t)'   : 'var(--info-t)';
    return `<div style="display:flex;gap:9px;padding:9px 12px;background:${bg};border-left:3px solid ${color};border-radius:0 var(--r) var(--r) 0;margin-bottom:6px;font-size:12.5px;line-height:1.5">
      <span style="color:${color};flex-shrink:0;font-weight:700">${a.test}</span>
      <span style="color:var(--ink2)">${esc(a.msg)}</span>
      <span style="font-family:var(--font-mono);font-size:9px;color:var(--ink4);flex-shrink:0;margin-left:auto;align-self:center">${esc(a.gl)}</span>
    </div>`;
  }).join('');
}


// ══════════════════════════════════════════════════════════════════════
// KBE CONTEXT-AWARE TREATMENT RENDERER
// Injected into Treatment tab — shows context modifications prominently
// ══════════════════════════════════════════════════════════════════════

function kbeRenderTreatmentWithContext(condId) {
  const plan = kbeGetTreatmentPlan(condId, S.patient || {}, S.corpus || '', S.labs || {}, S.gaps || []);
  if (!plan) return '';

  const ctx = plan.context;
  const hasContextWarnings = ctx.pregnancy || ctx.renal || ctx.hepatic || ctx.elderly;

  let html = '';

  // Context banner
  if (hasContextWarnings) {
    const ctxTags = [
      ctx.pregnancy ? '<span class="badge badge-danger">🤰 Pregnancy</span>' : '',
      ctx.renal     ? `<span class="badge badge-warn">🩺 Renal (est. eGFR ~${ctx.renal_egfr || '?'})</span>` : '',
      ctx.hepatic   ? '<span class="badge badge-warn">⚠ Hepatic</span>' : '',
      ctx.elderly   ? `<span class="badge badge-info">👴 Elderly (${ctx.elderly_age}y)</span>` : '',
    ].filter(Boolean).join(' ');

    html += `<div style="background:var(--warn-t);border:1.5px solid rgba(184,106,0,.3);border-radius:var(--r);padding:10px 14px;margin-bottom:14px">
      <div style="font-size:10px;font-weight:700;color:var(--warn);text-transform:uppercase;letter-spacing:.8px;margin-bottom:6px">⚠ Active Patient Context Modifiers</div>
      <div style="display:flex;flex-wrap:wrap;gap:6px;margin-bottom:6px">${ctxTags}</div>
      <div style="font-size:12px;color:var(--ink2)">Drugs marked ⛔ are contraindicated. Drugs marked ⚠ require modification.</div>
      ${plan.contraindications_active.map(c => `<div style="font-size:12px;color:var(--danger);padding:3px 0">• ${esc(c)}</div>`).join('')}
    </div>`;
  }

  // Treatment lines
  for (const line of plan.lines) {
    const lineLabel = line.label || line.lineKey;
    html += `<div style="margin-bottom:14px">
      <div style="font-size:9.5px;font-weight:700;color:var(--ink3);text-transform:uppercase;letter-spacing:.8px;margin-bottom:8px;padding:5px 8px;background:var(--surface2);border-radius:3px">${esc(lineLabel)}</div>`;

    for (const drug of line.drugs) {
      const hasMods    = drug.modifications.length > 0;
      const isUnsafe   = !drug.ctx_safe;
      const borderColor = isUnsafe ? 'var(--danger)' : hasMods ? 'var(--warn)' : 'var(--border)';

      html += `<div style="border:1.5px solid ${borderColor};border-radius:var(--r);overflow:hidden;margin-bottom:8px;${isUnsafe ? 'opacity:.85' : ''}">
        <div style="display:flex;align-items:flex-start;justify-content:space-between;padding:9px 12px;background:var(--surface2)">
          <div>
            <div style="font-size:13px;font-weight:700;color:${isUnsafe ? 'var(--danger)' : 'var(--ink)'}">${isUnsafe ? '⛔ ' : ''}${esc(drug.generic)}</div>
            ${drug.brand_india ? `<div style="font-size:11px;color:var(--ink3)">🇮🇳 ${esc(drug.brand_india.split(',')[0])}</div>` : ''}
          </div>
          <span class="badge badge-${drug.risk==='high'?'danger':drug.risk==='moderate'?'warn':'ok'}">${(drug.risk||'').toUpperCase()}</span>
        </div>
        <div style="padding:10px 12px">
          <div style="display:grid;grid-template-columns:1fr 1fr 1fr;gap:6px;margin-bottom:8px">
            <div style="background:var(--surface2);border-radius:3px;padding:4px 7px"><span style="font-family:var(--font-mono);font-size:8.5px;text-transform:uppercase;color:var(--ink4);display:block;margin-bottom:1px">Dose</span><span style="font-size:11.5px;font-weight:500">${esc(drug.dose||'—')}</span></div>
            <div style="background:var(--surface2);border-radius:3px;padding:4px 7px"><span style="font-family:var(--font-mono);font-size:8.5px;text-transform:uppercase;color:var(--ink4);display:block;margin-bottom:1px">Frequency</span><span style="font-size:11.5px;font-weight:500">${esc(drug.freq||'—')}</span></div>
            <div style="background:var(--surface2);border-radius:3px;padding:4px 7px"><span style="font-family:var(--font-mono);font-size:8.5px;text-transform:uppercase;color:var(--ink4);display:block;margin-bottom:1px">Duration</span><span style="font-size:11.5px;font-weight:500">${esc(drug.duration||'—')}</span></div>
          </div>
          ${drug.notes ? `<div style="font-size:11.5px;color:var(--ink3);line-height:1.5;margin-bottom:6px">${esc(drug.notes)}</div>` : ''}
          ${drug.warnings.map(w => `<div style="font-size:11.5px;padding:5px 8px;background:${w.startsWith('⛔')?'var(--danger-t)':'var(--warn-t)'};border-radius:3px;color:${w.startsWith('⛔')?'var(--danger)':'var(--warn)'};margin-top:4px">${esc(w)}</div>`).join('')}
        </div>
      </div>`;
    }
    html += '</div>';
  }

  return html;
}


// ══════════════════════════════════════════════════════════════════════
// PATCH: processIntake — extend pipeline with KBE lab integration
// ══════════════════════════════════════════════════════════════════════

function processIntake() {
  _base_processIntake();

  // After base pipeline runs — feed lab interpretation back into scoring
  if (Object.keys(S.labs || {}).some(k => S.labs[k])) {
    const { condBoosts } = kbeInterpretLabs(S.labs);

    // Re-score with lab boosts applied
    if (Object.keys(condBoosts).length > 0) {
      S.scored = kbeScoreAll(S.corpus, S.patient, S.examFindings, S.labs, S.gaps);
      S.differential = kbeBuildDifferential(S.scored, S.redFlags);
      S.nextSteps    = kbeBuildNextSteps(S.differential, S.redFlags,
        S.scored, S.labs, S.patient, S.corpus);
      /* updateLivePanel() */
    }
  }

  // Store lab alerts in state for rendering
  S.kbeLabAlerts = kbeInterpretLabs(S.labs).alerts;
  // Critical value check on every analysis run
  checkCriticalValues(S.labs);
}


// ══════════════════════════════════════════════════════════════════════
// PATCH: updateLab — re-score whenever a lab value changes
// ══════════════════════════════════════════════════════════════════════

function updateLab(key, value, sectionId) {
  _base_updateLab(key, value, sectionId);

  // Debounce re-scoring — wait 600ms after last keystroke
  if (S.corpus) {
    kbeDebounce('lab_rescore', () => {
      S.scored       = kbeScoreAll(S.corpus, S.patient, S.examFindings, S.labs, S.gaps);
      S.differential = kbeBuildDifferential(S.scored, S.redFlags);
      S.nextSteps    = kbeBuildNextSteps(S.differential, S.redFlags,
        S.scored, S.labs, S.patient, S.corpus);
      S.kbeLabAlerts = kbeInterpretLabs(S.labs).alerts;
      /* updateLivePanel() */
      checkCriticalValues(S.labs);
    }, 600);
  }
}


// ══════════════════════════════════════════════════════════════════════
// PATCH: fillExam — re-score whenever exam findings change
// ══════════════════════════════════════════════════════════════════════

function fillExam(sysId, key, value) {
  _base_fillExam(sysId, key, value);

  // Debounce re-scoring — wait 400ms after last keystroke
  if (S.corpus) {
    kbeDebounce('exam_rescore', () => {
      S.scored       = kbeScoreAll(S.corpus, S.patient, S.examFindings, S.labs, S.gaps);
      S.differential = kbeBuildDifferential(S.scored, S.redFlags);
      /* updateLivePanel() */
    }, 400);
  }
}


// ══════════════════════════════════════════════════════════════════════
// PATCH: buildAssessment — inject KBE evidence panels
// ══════════════════════════════════════════════════════════════════════

function buildAssessment() {
  _base_buildAssessment();

  const el = document.getElementById('assessment-content');
  if (!el) return;

  const existing = el.innerHTML;

  // Inject evidence panel after differential section
  const diffMarker = '04 · 3-Tier Differential Diagnosis';
  if (existing.includes(diffMarker)) {
    const evidenceHtml = `
      <div class="card">
        <div class="card-head">
          <div class="card-title">04b · Evidence Analysis
            <span class="badge badge-ok" style="margin-left:6px">KBE</span>
          </div>
          <div class="card-sub">Supporting · Contradicting · Missing · % Likelihood</div>
        </div>
        <div class="card-body">
          ${kbeRenderEvidencePanel(S.scored || [])}
        </div>
      </div>`;

    // Inject after the diff card
    const insertPoint = existing.indexOf('05 · Drug Safety');
    if (insertPoint >= 0) {
      el.innerHTML = existing.slice(0, insertPoint) +
        evidenceHtml.replace(/\n/g, '') +
        existing.slice(insertPoint);
    }
  }

  // Inject lab interpretation if labs entered
  const labAlerts = kbeRenderLabAlerts(S.labs || {});
  if (labAlerts) {
    const labMarker = '06 · Abnormal Lab Results';
    const afterLabs = existing.indexOf('07 · Next Steps');
    if (afterLabs >= 0) {
      // Add KBE lab interpretation block
      const labInterpHtml = `
        <div class="card">
          <div class="card-head">
            <div class="card-title">06b · Lab Clinical Interpretation
              <span class="badge badge-ok" style="margin-left:6px">KBE</span>
            </div>
            <div class="card-sub">Evidence-based interpretation of abnormal values</div>
          </div>
          <div class="card-body">${labAlerts}</div>
        </div>`;
      el.innerHTML = el.innerHTML.replace(
        /<div class="card"><div class="card-head"><div class="card-title">07 · Next Steps/,
        labInterpHtml.replace(/\n/g,'') + '<div class="card"><div class="card-head"><div class="card-title">07 · Next Steps'
      );
    }
  }
}


// ══════════════════════════════════════════════════════════════════════
// PATCH: buildTreatmentTab — use KBE context-aware treatment renderer
// ══════════════════════════════════════════════════════════════════════

function buildTreatmentTab() {
  const el = document.getElementById('treatment-content');
  if (!el) return;

  const allConds = [...(S.differential.t3||[]), ...(S.differential.t1||[]), ...(S.differential.t2||[])].slice(0,3);
  let html = getPaedWarningHtml(S.patient || {});

  for (const cond of allConds) {
    const kbKey = KB_ID_MAP[cond.id] || cond.id;
    const kb    = CLINICAL_KB[kbKey];
    if (!kb) continue;

    const sources = (kb.gl_sources||[]).map(s =>
      `<span class="gl-source ${'gl-'+s.level}" style="font-size:8.5px">L${s.level} ${esc(s.name)}</span>`).join('');

    const ctx = kbeGetPatientContext(S.patient || {}, S.corpus || '', S.labs || {});
    const ctxFlags = [ctx.pregnancy?'🤰 Pregnancy':null, ctx.renal?`🩺 Renal ~${ctx.renal_egfr||'?'}`:null, ctx.elderly?`👴 ${ctx.elderly_age}y`:null, ctx.hepatic?'⚠ Hepatic':null].filter(Boolean);

    html += `<div class="card" style="margin-bottom:14px">
      <div class="card-head">
        <div class="card-title">${sysEmoji(kb.systems)} ${esc(kb.name)}
          ${ctxFlags.length ? `<span style="font-size:10px;color:var(--warn);margin-left:8px">${ctxFlags.join(' · ')}</span>` : ''}
        </div>
        <div style="display:flex;flex-wrap:wrap;gap:3px">${sources}</div>
      </div>
      <div class="card-body p0" style="padding:12px">
        ${kbeRenderTreatmentWithContext(cond.id)}
      </div>`;

    // Monitoring
    if (kb.monitoring?.length) {
      html += `<div style="margin:14px">
        <div style="font-size:9.5px;font-weight:700;color:var(--ink3);text-transform:uppercase;letter-spacing:.8px;margin-bottom:8px">Monitoring Parameters</div>
        <table class="monitor-table">
          <tr><th>Parameter</th><th>Frequency</th><th>Target</th><th>If Abnormal</th></tr>
          ${kb.monitoring.map(m=>`<tr><td><strong>${esc(m.parameter)}</strong></td><td>${esc(m.frequency)}</td><td style="color:var(--ok)">${esc(m.target)}</td><td style="color:var(--warn)">${esc(m.action)}</td></tr>`).join('')}
        </table>
      </div>`;
    }

    html += '</div></div>';
  }

  if (!html) html = '<div class="empty-state"><div class="empty-state-icon">💊</div>No KB treatment protocols found for current differential.</div>';
  el.innerHTML = html;
}


// ══════════════════════════════════════════════════════════════════════
// INITIALISE KBE on DOMContentLoaded
// ══════════════════════════════════════════════════════════════════════


// ── CRITICAL VALUE DETECTOR ─────────────────────────────────────
const CRITICAL_LAB_RULES = [
  { test:'k',    op:'>', threshold:6.0,  name:'Hyperkalaemia K⁺ > 6.0 mmol/L',
    msg:'Risk of fatal cardiac arrhythmia — peaked T waves, widened QRS, ventricular fibrillation.',
    action:'1. ECG immediately\n2. STOP all ACEi/ARB/spironolactone/potassium supplements NOW\n3. If ECG changes: IV calcium gluconate + hospital transfer\n4. Dietary potassium restriction\n5. Repeat K+ in 2-4 hours' },
  { test:'k',    op:'<', threshold:2.5,  name:'Severe Hypokalaemia K⁺ < 2.5 mmol/L',
    msg:'Risk of cardiac arrhythmia, muscle weakness, respiratory paralysis.',
    action:'1. ECG immediately\n2. IV or high-dose oral KCl replacement\n3. Monitor cardiac rhythm\n4. Hospital admission for K+ < 2.5' },
  { test:'na',   op:'<', threshold:120,  name:'Severe Hyponatraemia Na⁺ < 120 mmol/L',
    msg:'Risk of cerebral oedema, seizures, and death. Do NOT correct too rapidly.',
    action:'1. ADMIT to hospital\n2. Restrict free water\n3. Identify cause (SIADH/hypothyroidism/HF)\n4. Neurologist / nephrologist review\n5. Target correction: ≤8-10 mmol/L per 24h' },
  { test:'glu',  op:'>', threshold:25,   name:'Severe Hyperglycaemia > 25 mmol/L',
    msg:'Possible Diabetic Ketoacidosis (DKA) or Hyperosmolar Hyperglycaemic State (HHS). Medical emergency.',
    action:'1. Check ketones + arterial pH\n2. If ketones positive + pH <7.3 = DKA — IV insulin protocol, ADMIT\n3. IV fluid resuscitation (0.9% NS)\n4. Monitor every 1-2 hours\n5. Call 108 if drowsy or vomiting' },
  { test:'hb',   op:'<', threshold:60,   name:'Severe Anaemia Hb < 60 g/L',
    msg:'Risk of cardiac failure, organ ischaemia. Transfusion threshold likely reached.',
    action:'1. Assess for haemodynamic instability\n2. Blood group and cross-match\n3. If symptomatic (chest pain, dyspnoea, syncope): TRANSFUSE\n4. ADMIT for investigation of cause\n5. IV iron if iron deficiency confirmed' },
  { test:'trop', op:'>', threshold:14,   name:'Elevated Troponin — Acute Myocardial Injury',
    msg:'Elevated troponin indicates myocardial injury. Must exclude NSTEMI/STEMI urgently.',
    action:'1. 12-lead ECG IMMEDIATELY\n2. IV access × 2 + aspirin 300mg loading dose\n3. Repeat troponin at 3 hours (0h/3h algorithm)\n4. Call 108 — hospital transfer for angiography\n5. Do NOT send patient home with elevated troponin' },
  { test:'lact', op:'>', threshold:4.0,  name:'Severe Lactic Acidosis > 4 mmol/L',
    msg:'Severe tissue hypoperfusion. Septic shock / cardiogenic shock / ischaemia.',
    action:'1. EMERGENCY — call 108 immediately\n2. IV fluid resuscitation\n3. High-flow oxygen\n4. Identify and treat source (sepsis, cardiac, bowel ischaemia)\n5. ICU admission required' },
  { test:'pct',  op:'>', threshold:10,   name:'Procalcitonin > 10 ng/mL — Severe Bacterial Sepsis',
    msg:'PCT >10 indicates severe bacterial infection / sepsis. Organ failure likely.',
    action:'1. Blood cultures × 2 BEFORE antibiotics\n2. IV broad-spectrum antibiotics within 1 hour\n3. Sepsis 6 bundle\n4. ADMIT to hospital — HDU/ICU consideration\n5. Lactate measurement' },
];

function checkCriticalValues(labs) {
  for (const rule of CRITICAL_LAB_RULES) {
    const val = parseFloat(labs[rule.test] || '');
    if (isNaN(val)) continue;
    const triggered = (rule.op === '>' && val > rule.threshold) ||
                      (rule.op === '<' && val < rule.threshold);
    if (triggered) {
      fireCriticalAlert(rule, val);
      return; // Show one at a time — most critical first
    }
  }
}

function fireCriticalAlert(rule, value) {
  const overlay = document.getElementById('critical-value-overlay');
  if (!overlay) return;
  document.getElementById('critical-value-name').textContent =
    rule.name + ' (Value: ' + value + ')';
  document.getElementById('critical-value-msg').textContent = rule.msg;
  document.getElementById('critical-value-action').textContent = rule.action;
  overlay.style.display = 'flex';
}



// ── INDIAN PRESCRIPTION TIMING MAPPER ───────────────────────────
// Converts frequency strings to India-standard 1-0-1 grid format
function mapToIndianTiming(freq, route) {
  if (!freq) return '1-0-0';
  const f = freq.toLowerCase().trim();
  const isInjection = route && (route.toLowerCase().includes('iv') || route.toLowerCase().includes('im') || route.toLowerCase().includes('sc') || route.toLowerCase().includes('injection'));
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

function getFormPrefix(route, genericName) {
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



// ── SEASONAL DISEASE ALERT (Kerala) ─────────────────────────────
function renderSeasonalAlert() {
  const month = new Date().getMonth(); // 0=Jan, 5=June, 10=Nov
  const isMonsoonsPostmonsoon = month >= 5 && month <= 10; // June–November
  const bannerEl = document.getElementById('seasonal-alert-banner');
  if (!bannerEl) return;
  if (isMonsoonsPostmonsoon) {
    bannerEl.style.display = 'flex';
    bannerEl.innerHTML = `
      <div style="display:flex;align-items:center;gap:10px;flex:1;flex-wrap:wrap">
        <span style="font-size:16px">🦟</span>
        <div>
          <div style="font-size:11.5px;font-weight:700;color:var(--warn)">KERALA SEASONAL ALERT — Monsoon / Post-Monsoon</div>
          <div style="font-size:11px;color:var(--ink2)">Fever >5 days: Screen for <strong>Dengue</strong> (NS1 + Platelet) · <strong>Leptospirosis</strong> (exposure + calf pain) · <strong>Scrub Typhus</strong> (eschar search) · <strong>Typhoid</strong> (step-ladder fever). <strong>NSAID ban in suspected dengue.</strong></div>
        </div>
      </div>
      <button onclick="document.getElementById('seasonal-alert-banner').style.display='none'" style="background:none;border:none;color:var(--ink3);font-size:16px;cursor:pointer;padding:4px">✕</button>`;
  }
}



// ── PAEDIATRIC SAFETY WARNING ────────────────────────────────────
function getPaedWarningHtml(patient) {
  if (!patient || !patient.age) return '';
  const age = parseInt(patient.age);
  if (isNaN(age) || age >= 18) return '';
  const weightField = '<input type="number" id="paed-weight" placeholder="kg" style="width:70px;padding:4px 8px;border:1.5px solid var(--warn);border-radius:4px;font-family:var(--font-sans)" oninput="updatePaedWeight(this.value)">';
  return `<div style="background:rgba(184,106,0,.12);border:2px solid var(--warn);border-radius:var(--r);padding:12px 16px;margin-bottom:14px">
    <div style="font-size:12px;font-weight:700;color:var(--warn);margin-bottom:6px">⚠ PAEDIATRIC PATIENT — ${age}y</div>
    <div style="font-size:12px;color:var(--ink2);margin-bottom:8px">Adult drug doses are shown. ALL doses must be recalculated by child weight (mg/kg). Weight-based dosing is mandatory for patients under 18.</div>
    <div style="display:flex;align-items:center;gap:8px">
      <span style="font-size:12px;color:var(--ink2)">Child weight:</span>
      ${weightField}
      <span style="font-size:12px;color:var(--ink3)">kg (enter to calculate doses)</span>
    </div>
    <div id="paed-dose-note" style="font-size:11.5px;color:var(--warn);margin-top:6px"></div>
    <div style="font-size:11px;color:var(--ink3);margin-top:6px">Refer to IAP drug formulary for paediatric dosing. Doxycycline contraindicated <8y. Fluoroquinolones contraindicated <18y. Codeine contraindicated <12y.</div>
  </div>`;
}

function updatePaedWeight(val) {
  const noteEl = document.getElementById('paed-dose-note');
  if (!noteEl) return;
  const w = parseFloat(val);
  if (isNaN(w) || w <= 0) { noteEl.textContent = ''; return; }
  noteEl.textContent = '✓ Weight recorded: ' + w + ' kg. Common doses: Paracetamol ' + (w*15).toFixed(0) + 'mg/dose · Amoxicillin ' + (w*40/3).toFixed(0) + 'mg TDS · ORS 75mL/kg over 4h = ' + (w*75).toFixed(0) + 'mL';
}


document.addEventListener('DOMContentLoaded', () => {
  setTimeout(kbeInit, 300);
  console.log('[KBE v1.0] Knowledge-Base Engine loaded. All scoring flows through CLINICAL_KB.');
  console.log('[KBE] Capabilities: Evidence scoring · Negative scoring · Lab interpretation · Context-aware treatment');
});


// ══════════════════════════════════════════════════════════════════════
// AI CLINICAL REASONING ENGINE — v5
// Sends structured patient data to Claude API with strict KB-only prompt
// Streams response and renders structured sections live
// ══════════════════════════════════════════════════════════════════════

function buildPatientDataPacket() {
  const pt = S.patient || {};
  const filled = (S.gaps || []).filter(g => g.value);
  const labs = S.labs || {};
  const vitals = Object.entries(S_VITALS || {}).filter(([,v])=>v).map(([k,v])=>{ const d=VITALS_DEFS.find(x=>x.key===k); return d ? `${d.label}: ${v} ${d.unit}` : ''; }).filter(Boolean);
  const examEntries = Object.entries(S.examFindings || {}).flatMap(([sysId, findings]) =>
    Object.entries(findings).filter(([,v])=>v).map(([k,v]) => `${k.replace(/_/g,' ')}: ${v}`)
  );
  const labEntries = Object.values(LAB_DEFS).flat().filter(d => labs[d.key]).map(d => {
    const status = getLabStatus(labs[d.key], d);
    return `${d.name}: ${labs[d.key]} ${d.unit} [ref ${d.ref[0]}–${d.ref[1]}]${status!=='normal'?' ⚠ '+status.replace('-',' ').toUpperCase():''}`;
  });
  const structured = (S.structuredSymptoms || []);
  const differential = [...(S.differential.t3||[]), ...(S.differential.t1||[]), ...(S.differential.t2||[])];
  const redFlags = (S.redFlags || []).map(r=>r.msg);

  return {
    age:          pt.age || 'Not provided',
    gender:       pt.gender === 'F' ? 'Female' : pt.gender === 'M' ? 'Male' : 'Not provided',
    comorbidities: pt.comorbid || 'None documented',
    chief_complaint: S.rawInput || 'Not provided',
    structured_symptoms: structured.length ? structured.join(', ') : 'None selected',
    history_gaps: filled.map(g => `${g.label}: ${g.value}`).join('\n') || 'None filled',
    vital_signs:  vitals.join(', ') || 'Not recorded',
    examination:  examEntries.join('\n') || 'Not recorded',
    lab_results:  labEntries.join('\n') || 'Not recorded',
    medications:  (S.drugs||[]).map(d => `${d.name} ${d.dose||''}`).join(', ') || 'None',
    allergies:    (S.allergies||[]).map(a => a.drug).join(', ') || 'None',
    cureocity_differential: differential.map((c,i) => `${i+1}. ${c.name} [${c.tier==='t3'?'MUST NOT MISS':c.tier==='t1'?'MOST LIKELY':'POSSIBLE'}] score:${(c.score||0).toFixed(1)}`).join('\n') || 'None generated',
    red_flags_detected: redFlags.join('\n') || 'None',
    active_systems: Object.keys(S.activeSystems||{}).map(id => SYSTEMS[id]?.name || id).join(', ') || 'None',
  };
}

function buildAIPrompt(data) {
  return `You are a STRICT clinical reasoning engine embedded in Cureocity v5 — a clinical decision support tool for Kerala, India.

CRITICAL RULES:
1. You MUST ONLY use the following knowledge bases: WHO, NICE, ESC, AHA, ADA, GINA, GOLD, AAN, ICMR, MoHFW India, Davidson's Principles of Medicine, BMJ Best Practice.
2. You MUST NOT use any knowledge outside these sources.
3. You MUST use ALL provided patient symptoms — do not skip any.
4. If data is insufficient for a step, state "INSUFFICIENT DATA" for that section only — do not fabricate.
5. You are NOT a replacement for clinical judgment — flag uncertainty explicitly.
6. For India-specific conditions (dengue, TB, leptospirosis, scrub typhus, typhoid, PCOS, anaemia), always reference ICMR/MoHFW guidelines specifically.
7. Always include ICD-10 codes for all diagnoses.

PATIENT DATA (from Cureocity v5 — live case):
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
Age: ${data.age}
Gender: ${data.gender}
Comorbidities: ${data.comorbidities}
Chief Complaint / Free Text: ${data.chief_complaint}
Structured Symptoms (clicked): ${data.structured_symptoms}
History Details: ${data.history_gaps}
Vital Signs: ${data.vital_signs}
Examination Findings: ${data.examination}
Lab Results: ${data.lab_results}
Current Medications: ${data.medications}
Known Allergies: ${data.allergies}
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
Cureocity KBE Pre-Screening (for cross-check only):
Active Systems: ${data.active_systems}
Red Flags Detected: ${data.red_flags_detected}
KBE Differential: ${data.cureocity_differential}

REQUIRED OUTPUT — use EXACTLY these section headers in order:

## 🚨 RED FLAG SCREEN
List any immediately life-threatening possibilities based on the symptoms. For each: state the flag, the condition it points to, and the immediate action (per guideline).

## 📊 DIFFERENTIAL DIAGNOSIS
For each diagnosis (maximum 6), provide:
- Condition name + ICD-10 code
- Tier: MUST-NOT-MISS / MOST-LIKELY / POSSIBLE
- Confidence: HIGH / MODERATE / LOW
- Guideline source used (e.g. NICE CG132, WHO, ICMR)
- Evidence FOR: list each matching symptom/sign/lab with the weight it carries
- Evidence AGAINST: list any contradicting features
- Missing data that would change this diagnosis

## ✅ SYMPTOM COVERAGE MATRIX
List EVERY symptom provided. For each:
- ✅ MATCHED — state which diagnosis it supports
- ⚠️ PARTIAL — partially explained
- ❌ UNMATCHED — not explained by any current diagnosis (flag as unexplained — may indicate missing diagnosis)

## ❓ MISSING DATA & TARGETED QUESTIONS
List the most important missing clinical data. For each:
- What is missing
- Why it matters (which diagnosis it would confirm or exclude)
- The specific question to ask the patient
- Priority: CRITICAL / IMPORTANT / ROUTINE

## 🎯 CONFIDENCE SCORE
Overall diagnostic confidence as a percentage (0–100%).
Explain what is driving confidence up and what is limiting it.
Format: CONFIDENCE: [XX]%

## 💊 TREATMENT PLAN (KB-SOURCED ONLY)
For the top 1–2 most likely diagnoses:
- First-line treatment per guideline (drug, dose, duration)
- India-specific notes (availability, Jan Aushadhi, brand names where relevant)
- Contraindications to check given this patient's profile
- Monitoring parameters
- Referral criteria

## ⚕️ CLINICAL BOTTOM LINE
One paragraph. Summarise the most likely diagnosis, the most urgent action, and the single most important next investigation — written as a concise clinical handover note.`;
}

async function runAIReasoningEngine() {
  const emptyState = document.getElementById('ai-empty-state');
  const outputArea = document.getElementById('ai-output-area');
  const statusBar = document.getElementById('ai-status-bar');
  const statusDot = document.getElementById('ai-status-dot');
  const statusText = document.getElementById('ai-status-text');
  const tokenCount = document.getElementById('ai-token-count');
  const sectionsEl = document.getElementById('ai-reasoning-sections');
  const runBtn = document.getElementById('ai-run-btn');
  const dataCheck = document.getElementById('ai-data-check');

  // Validate minimum data
  if (!S.rawInput && !(S.structuredSymptoms||[]).length) {
    dataCheck.innerHTML = `<div style="background:var(--warn-t);border:1.5px solid rgba(184,106,0,.3);border-radius:var(--r);padding:12px 16px;font-size:12.5px;color:var(--warn)">
      <strong>⚠ Insufficient data to run reasoning engine.</strong><br>
      Please complete at minimum: Step 1 (enter a complaint) and Step 2 (select symptoms or fill history).
    </div>`;
    return;
  }
  dataCheck.innerHTML = '';

  // Build data packet and prompt
  const data = buildPatientDataPacket();
  const prompt = buildAIPrompt(data);

  // Show preview of data being sent
  document.getElementById('ai-data-preview').textContent =
    `Sending: ${data.age}y ${data.gender} · ${(S.structuredSymptoms||[]).length} symptoms · ${Object.values(S.labs||{}).filter(v=>v).length} labs`;

  // UI: show output area, hide empty state
  emptyState.style.display = 'none';
  outputArea.style.display = 'block';
  sectionsEl.innerHTML = '';
  runBtn.disabled = true;
  runBtn.textContent = '⏳ Reasoning…';

  // Section tracking for live render
  const sectionConfig = [
    { header:'## 🚨 RED FLAG SCREEN',   icon:'🚨', title:'Red Flag Screen',         color:'var(--danger)',  bg:'var(--danger-t)'  },
    { header:'## 📊 DIFFERENTIAL',       icon:'📊', title:'Differential Diagnosis',  color:'var(--info)',    bg:'var(--info-t)'    },
    { header:'## ✅ SYMPTOM COVERAGE',   icon:'✅', title:'Symptom Coverage Matrix', color:'var(--ok)',      bg:'var(--ok-t)'      },
    { header:'## ❓ MISSING DATA',        icon:'❓', title:'Missing Data & Questions',color:'var(--warn)',    bg:'var(--warn-t)'    },
    { header:'## 🎯 CONFIDENCE',         icon:'🎯', title:'Confidence Score',        color:'var(--accent)',  bg:'var(--en-t)'      },
    { header:'## 💊 TREATMENT',          icon:'💊', title:'Treatment Plan (KB)',     color:'var(--ok)',      bg:'var(--ok-t)'      },
    { header:'## ⚕️ CLINICAL BOTTOM',    icon:'⚕️', title:'Clinical Bottom Line',   color:'var(--ink2)',    bg:'var(--surface2)'  },
  ];

  let fullText = '';
  let currentSectionEl = null;
  let currentSectionBodyEl = null;
  let charCount = 0;

  const updateStatus = (text, color='var(--accent)') => {
    statusText.textContent = text;
    statusText.style.color = color;
  };

  const findOrCreateSection = (text) => {
    for (const cfg of sectionConfig) {
      if (text.includes(cfg.header.slice(3))) {
        // Check if this section already exists
        let sec = document.getElementById('ai-sec-' + cfg.icon.replace(/[^a-z0-9]/gi,''));
        if (!sec) {
          sec = document.createElement('div');
          sec.className = 'ai-section';
          sec.id = 'ai-sec-' + cfg.icon.replace(/[^a-z0-9]/gi,'');
          sec.innerHTML = `<div class="ai-section-head" style="border-left:4px solid ${cfg.color}">
            <span class="ai-section-icon">${cfg.icon}</span>
            <span class="ai-section-title" style="color:${cfg.color}">${cfg.title}</span>
          </div>
          <div class="ai-section-body" id="ai-body-${cfg.icon.replace(/[^a-z0-9]/gi,'')}"></div>`;
          sectionsEl.appendChild(sec);
        }
        return document.getElementById('ai-body-' + cfg.icon.replace(/[^a-z0-9]/gi,''));
      }
    }
    return null;
  };

  try {
    updateStatus('Connecting to Claude Sonnet…');

    const response = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        model: 'claude-sonnet-4-20250514',
        max_tokens: 3000,
        stream: true,
        messages: [{ role: 'user', content: prompt }]
      })
    });

    if (!response.ok) {
      const err = await response.json().catch(() => ({}));
      throw new Error(err.error?.message || `API error ${response.status}`);
    }

    updateStatus('Reasoning in progress…');

    const reader = response.body.getReader();
    const decoder = new TextDecoder();
    let buffer = '';

    // Create a default catch-all section for unsectioned text
    let defaultBodyEl = null;

    while (true) {
      const { value, done } = await reader.read();
      if (done) break;

      buffer += decoder.decode(value, { stream: true });
      const lines = buffer.split('\n');
      buffer = lines.pop();

      for (const line of lines) {
        if (!line.startsWith('data: ')) continue;
        const raw = line.slice(6).trim();
        if (raw === '[DONE]') continue;

        let parsed;
        try { parsed = JSON.parse(raw); } catch { continue; }

        if (parsed.type === 'content_block_delta' && parsed.delta?.type === 'text_delta') {
          const chunk = parsed.delta.text || '';
          fullText += chunk;
          charCount += chunk.length;

          tokenCount.textContent = `~${Math.round(charCount/4)} tokens`;

          // Check for new section headers
          for (const cfg of sectionConfig) {
            const hdrSlice = cfg.header.slice(3);
            if (fullText.includes(hdrSlice) && !document.getElementById('ai-sec-' + cfg.icon.replace(/[^a-z0-9]/gi,''))) {
              const bodyEl = findOrCreateSection(fullText);
              if (bodyEl) {
                currentSectionBodyEl = bodyEl;
                updateStatus(`Writing: ${cfg.title}`, cfg.color);
              }
              break;
            }
          }

          // Render current text into active section
          if (currentSectionBodyEl) {
            // Get text for current section
            const lines = fullText.split('\n');
            let inSection = false;
            let sectionText = [];
            for (const line of lines) {
              const isSectionHeader = sectionConfig.some(c => line.includes(c.header.slice(3)));
              if (isSectionHeader) {
                const thisSection = sectionConfig.find(c => line.includes(c.header.slice(3)));
                if (thisSection) {
                  const bodyId = 'ai-body-' + thisSection.icon.replace(/[^a-z0-9]/gi,'');
                  if (bodyId === currentSectionBodyEl.id) { inSection = true; sectionText = []; continue; }
                  else inSection = false;
                }
              }
              if (inSection) sectionText.push(line);
            }
            currentSectionBodyEl.innerHTML = renderAIMarkdown(sectionText.join('\n')) +
              '<span class="ai-streaming-cursor"></span>';
          }
        }

        if (parsed.type === 'message_stop') {
          // Final render — remove cursors, do final pass
          updateStatus('✓ Analysis complete', 'var(--ok)');
          statusDot.style.animation = 'none';
          statusDot.style.background = 'var(--ok)';
          finaliseAIRender(fullText, sectionConfig);
        }
      }
    }

    // Handle case where message_stop event not caught in stream
    updateStatus('✓ Analysis complete', 'var(--ok)');
    statusDot.style.animation = 'none';
    statusDot.style.background = 'var(--ok)';
    finaliseAIRender(fullText, sectionConfig);

  } catch (err) {
    updateStatus('⚠ Error: ' + err.message, 'var(--danger)');
    statusDot.style.background = 'var(--danger)';
    statusDot.style.animation = 'none';
    sectionsEl.innerHTML += `<div style="padding:14px;background:var(--danger-t);border:1.5px solid rgba(192,57,43,.25);border-radius:var(--r);font-size:12.5px;color:var(--danger)">
      <strong>Error running AI reasoning engine:</strong> ${esc(err.message)}<br>
      <span style="color:var(--ink3);font-size:11px">Check browser console for details. Ensure you are running this on claude.ai where the API is available.</span>
    </div>`;
  } finally {
    runBtn.disabled = false;
    runBtn.textContent = '⚡ Run AI Reasoning Engine';
  }
}

function finaliseAIRender(fullText, sectionConfig) {
  // Parse the full text into sections and do a clean final render
  const lines = fullText.split('\n');
  let currentCfg = null;
  let currentLines = [];

  const flushSection = () => {
    if (!currentCfg || !currentLines.length) return;
    const bodyEl = document.getElementById('ai-body-' + currentCfg.icon.replace(/[^a-z0-9]/gi,''));
    if (bodyEl) bodyEl.innerHTML = renderAIMarkdown(currentLines.join('\n'));
  };

  for (const line of lines) {
    const matchedCfg = sectionConfig.find(c => line.includes(c.header.slice(3)));
    if (matchedCfg) {
      flushSection();
      currentCfg = matchedCfg;
      currentLines = [];
      // Ensure section exists
      if (!document.getElementById('ai-sec-' + matchedCfg.icon.replace(/[^a-z0-9]/gi,''))) {
        const sec = document.createElement('div');
        sec.className = 'ai-section';
        sec.id = 'ai-sec-' + matchedCfg.icon.replace(/[^a-z0-9]/gi,'');
        sec.innerHTML = `<div class="ai-section-head" style="border-left:4px solid ${matchedCfg.color}">
          <span class="ai-section-icon">${matchedCfg.icon}</span>
          <span class="ai-section-title" style="color:${matchedCfg.color}">${matchedCfg.title}</span>
        </div>
        <div class="ai-section-body" id="ai-body-${matchedCfg.icon.replace(/[^a-z0-9]/gi,'')}"></div>`;
        document.getElementById('ai-reasoning-sections').appendChild(sec);
      }
    } else if (currentCfg) {
      currentLines.push(line);
    }
  }
  flushSection();
}

function renderAIMarkdown(text) {
  if (!text) return '';
  return text
    // Bold
    .replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>')
    // Inline code
    .replace(/`([^`]+)`/g, '<code style="font-family:var(--font-mono);font-size:11px;background:var(--surface3);padding:1px 5px;border-radius:3px">$1</code>')
    // Headers h3
    .replace(/^### (.+)$/gm, '<div style="font-size:12px;font-weight:700;color:var(--ink);margin:10px 0 5px;padding-bottom:4px;border-bottom:1px solid var(--border)">$1</div>')
    // Headers h4
    .replace(/^#### (.+)$/gm, '<div style="font-size:11.5px;font-weight:700;color:var(--ink2);margin:8px 0 3px">$1</div>')
    // Confidence line special rendering
    .replace(/CONFIDENCE:\s*(\d+)%/g, (m, pct) => {
      const p = parseInt(pct);
      const col = p>=70?'var(--ok)':p>=45?'var(--warn)':'var(--danger)';
      return `<div style="margin:10px 0">
        <div style="font-size:24px;font-weight:800;color:${col};font-family:var(--font-mono)">${pct}%</div>
        <div class="ai-conf-bar"><div class="ai-conf-fill" style="width:${pct}%;background:${col}"></div></div>
      </div>`;
    })
    // ✅ ⚠️ ❌ coverage rows
    .replace(/^(✅|⚠️|❌)\s*(.+)$/gm, (m, icon, rest) => {
      const cls = icon==='✅'?'ai-coverage-matched':icon==='⚠️'?'ai-coverage-unmatched':'ai-coverage-against';
      return `<div class="${cls} ai-coverage-row"><span>${icon}</span><span>${rest}</span></div>`;
    })
    // Bullet points
    .replace(/^[-•]\s+(.+)$/gm, '<div style="display:flex;gap:7px;padding:3px 0;font-size:12px"><span style="color:var(--accent);flex-shrink:0">•</span><span>$1</span></div>')
    // Numbered list
    .replace(/^(\d+)\.\s+(.+)$/gm, '<div style="display:flex;gap:7px;padding:3px 0;font-size:12px"><span style="font-family:var(--font-mono);color:var(--ink4);flex-shrink:0;min-width:16px">$1.</span><span>$2</span></div>')
    // Horizontal rules
    .replace(/^━+$/gm, '<hr style="border:none;border-top:1.5px solid var(--border);margin:10px 0">')
    // Tier badges inline
    .replace(/\bMUST-NOT-MISS\b/g, '<span class="badge badge-danger">MUST NOT MISS</span>')
    .replace(/\bMOST-LIKELY\b/g, '<span class="badge badge-ok">MOST LIKELY</span>')
    .replace(/\bPOSSIBLE\b/g, '<span class="badge badge-info">POSSIBLE</span>')
    .replace(/\bCRITICAL\b/g, '<span class="badge badge-danger">CRITICAL</span>')
    .replace(/\bIMPORTANT\b/g, '<span class="badge badge-warn">IMPORTANT</span>')
    .replace(/\bROUTINE\b/g, '<span class="badge badge-gray">ROUTINE</span>')
    // Line breaks
    .replace(/\n/g, '<br>');
}

function resetAIPanel() {
  document.getElementById('ai-output-area').style.display = 'none';
  document.getElementById('ai-empty-state').style.display = 'block';
  document.getElementById('ai-reasoning-sections').innerHTML = '';
  document.getElementById('ai-data-check').innerHTML = '';
  document.getElementById('ai-data-preview').textContent = '';
}

// ── AI tab data preview is handled inside switchAssessTab above ─────

// ==== EXPORTS FOR REACT ====
export { S, processIntake, updateLab, kbeScoreAll, kbeScoreCondition, CLINICAL_KB };

// Slice 1 — Patient/Vitals/Allergies/Demos data + helpers
export {
  VITALS_DEFS, S_VITALS, isAbnormalVital, getVitalsSummary,
  S_ALLERGIES, ALLERGY_CROSS_REACTIVITY,
  DEMOS,
  termPresent,
};

// Slice 2 — Symptom Builder data + helpers
export { SYMPTOM_BUILDER_GROUPS };

// Slice 3 — Clinical notes + case reset
export { CLINICAL_NOTES };

// Slice 4 — Live panel data: follow-up questions + KB id mapping
export { FOLLOW_UP_QUESTIONS_DB, KB_ID_MAP, LAB_DEFS, getLabStatus };

// Slice 5 — Calculators, ICD-10, SOAP
export { CALCULATORS, ICD10_DB, COND_ICD_MAP };

// Slice 7 — Prescription Builder (Indian timing, cost estimate, specialist map)
export {
  mapToIndianTiming, getFormPrefix, getCostEstimate, INDIA_COST_DB,
  SPECIALIST_MAP, checkInteractions,
};

export const EngineCore = {
  getScore: () => S.scored,
  getDifferential: () => S.differential,
  getRedFlags: () => S.redFlags,
  getMissingData: () => S.gaps,
  getSystems: () => S.activeSystems,
  setRawInput: (text) => { S.rawInput = text; }, fillGap: (key, value) => { fillGap(key, value); }, toggleExamFinding: (sysId, term) => { toggleExamFinding(sysId, term); }, fillExam: (sysId, key, value) => { fillExam(sysId, key, value); }, getSystemsConfig: () => SYSTEMS,
  getLabDefs: () => LAB_DEFS,
  getLabStatus: (val, def) => getLabStatus(val, def),
  addDrugDirect: (name, dose, dur) => {
    S.drugs.push({ name, dose, duration: dur });
    S.interactions = checkInteractions(S.drugs);
  },
  removeDrug: (index) => {
    S.drugs.splice(index, 1);
    S.interactions = checkInteractions(S.drugs);
  },
  getDrugs: () => S.drugs,
  getInteractions: () => S.interactions,
  buildAssessment: () => { if (typeof buildAssessment === 'function') buildAssessment(); },
  getScored: () => S.scored,
  getNextSteps: () => S.nextSteps,

  // Slice 1 — patient field setters that mutate engine state directly.
  // Triggers re-score on next analyze; does NOT touch DOM.
  setPatient: ({ age, gender, comorbid }) => {
    if (age !== undefined)      S.patient.age      = age === '' || age == null ? null : parseInt(age) || null;
    if (gender !== undefined)   S.patient.gender   = gender || '';
    if (comorbid !== undefined) S.patient.comorbid = comorbid || '';
  },
  getPatient: () => ({ ...S.patient }),

  // Vitals — mutate S_VITALS + S.examFindings without DOM render
  setVital: (key, value) => {
    S_VITALS[key] = value;
    if (!S.examFindings.cv) S.examFindings.cv = {};
    if (key === 'hr')   S.examFindings.cv['cv_heart_rate__bpm_'] = value;
    if (key === 'sbp')  S.examFindings.cv['cv_blood_pressure__mmhg_'] = value + (S_VITALS.dbp ? '/' + S_VITALS.dbp : '');
    if (key === 'spo2') S.examFindings.cv['cv_spo2___'] = value;
    if (key === 'rr') { if (!S.examFindings.rs) S.examFindings.rs = {}; }
  },
  getVitals: () => ({ ...S_VITALS }),
  clearVital: (key) => { delete S_VITALS[key]; },

  // Allergies — same pattern
  addAllergy: (allergen, reaction, severity) => {
    if (!allergen) return;
    const idx = S_ALLERGIES.findIndex(a => a.allergen.toLowerCase() === allergen.toLowerCase());
    const entry = { allergen: allergen.trim(), reaction: reaction || 'Unknown reaction', severity: severity || 'unknown' };
    if (idx >= 0) S_ALLERGIES[idx] = entry; else S_ALLERGIES.push(entry);
  },
  removeAllergy: (idx) => { S_ALLERGIES.splice(idx, 1); },
  getAllergies: () => [...S_ALLERGIES],

  // Slice 2 — Structured symptoms. Toggle re-runs the corpus rebuild +
  // re-score in-place. React reads the new differential via syncState().
  getStructuredSymptoms: () => [...(S.structuredSymptoms || [])],
  toggleStructuredSymptom: (sym) => {
    if (!S.structuredSymptoms) S.structuredSymptoms = [];
    const idx = S.structuredSymptoms.indexOf(sym);
    if (idx >= 0) S.structuredSymptoms.splice(idx, 1);
    else S.structuredSymptoms.push(sym);
    if (typeof rebuildCorpusAndRescore === 'function') rebuildCorpusAndRescore();
    return [...S.structuredSymptoms];
  },

  // Slice 3 — Clinical notes
  getNotes: () => ({ ...CLINICAL_NOTES }),
  saveNotes: (next) => {
    Object.assign(CLINICAL_NOTES, next || {});
    return { ...CLINICAL_NOTES };
  },

  // Slice 3 — full case reset (no DOM, no confirm; React owns the prompt)
  resetCase: () => {
    S.step = 1;
    S.unlockedSteps = new Set([1]);
    S.patient = { age: null, gender: '', comorbid: '' };
    S.rawInput = '';
    S.corpus = '';
    S.normalizations = [];
    S.activeSystems = {};
    S.redFlags = [];
    S.scored = [];
    S.gaps = [];
    S.examFindings = {};
    S.activeExamFindings = {};
    S.drugs = [];
    S.interactions = [];
    S.labs = {};
    S.labAlerts = [];
    S.differential = { t1: [], t2: [], t3: [] };
    S.nextSteps = [];
    S.certainty = 0;
    S.certaintyNote = '';
    S.structuredSymptoms = [];
    Object.keys(S_VITALS).forEach((k) => delete S_VITALS[k]);
    S_ALLERGIES.length = 0;
    Object.keys(CLINICAL_NOTES).forEach((k) => { CLINICAL_NOTES[k] = ''; });
  },

  // ── Slice 5 — Calculators / SOAP / ICD ──────────────────────
  // Active condition IDs from current differential (T3+T1) for "relevant" calc detection
  getActiveConditionIds: () => {
    const t3 = S.differential?.t3 || S.differential?.must_not_miss || [];
    const t1 = S.differential?.t1 || S.differential?.most_likely   || [];
    return new Set([...t3, ...t1].map(d => d.id || d.cond?.id).filter(Boolean));
  },

  // Compute a calculator score from a values dict (mirrors v4 computeCalcScore)
  computeCalcScore: (calc, vals) => {
    if (!calc) return 0;
    if (calc.score_fn) return calc.score_fn(vals || {});
    let total = 0;
    for (const f of (calc.fields || [])) {
      const v = (vals || {})[f.id];
      if (f.type === 'check') { if (v == 1 || v === true) total += (f.points || 1); }
      else if (f.type === 'select') { total += parseInt(v) || 0; }
    }
    return total;
  },

  // Run a calculator's autofill against current S to seed defaults
  getCalcAutofill: (calc) => {
    if (!calc?.autofill) return {};
    try { return calc.autofill(S.patient || {}) || {}; } catch { return {}; }
  },

  // Pure SOAP builder — returns { subjective, objective, assessment, plan, meta }
  // No DOM, no engine mutation. React renders into editable textareas.
  buildSOAPText: () => {
    if (!S.corpus) {
      return {
        empty: true,
        subjective: '', objective: '', assessment: '', plan: '',
        meta: '',
      };
    }
    const pt = S.patient || {};
    const today = new Date().toLocaleDateString('en-IN', { weekday:'long', year:'numeric', month:'long', day:'numeric' });
    const filled = (S.gaps || []).filter(g => g.value);

    // Subjective
    const symptoms = Object.keys(S.activeSystems || {})
      .map(id => (SYSTEMS[id]?.activators || []).filter(a => termPresent(S.corpus, a)))
      .flat().filter(Boolean);
    const uniqueSymptoms = [...new Set(symptoms)];
    const duration = filled.find(g => g.key === 'duration')?.value || '';
    const onset    = filled.find(g => g.key === 'onset')?.value || '';
    const historyItems = filled.filter(g => !['duration','onset'].includes(g.key))
      .map(g => `${g.label}: ${g.value}`).join('. ');

    let subjective = `Chief complaint: ${(S.rawInput || '—').slice(0, 200)}\n\n`;
    subjective += `The patient presents with ${uniqueSymptoms.slice(0, 5).join(', ') || 'symptoms as documented'}`;
    if (duration) subjective += ` for ${duration}`;
    if (onset)    subjective += `. Onset: ${onset}`;
    subjective += '.\n\n';
    if (historyItems) subjective += `History: ${historyItems}.\n\n`;
    if (pt.comorbid)  subjective += `Background: ${pt.comorbid}.\n`;
    if (CLINICAL_NOTES.intake) subjective += `\nAdditional notes: ${CLINICAL_NOTES.intake}`;

    // Objective
    let objective = '';
    const examEntries = Object.entries(S.examFindings || {}).flatMap(([sysId, findings]) =>
      Object.entries(findings || {}).filter(([,v]) => v).map(([k, v]) => `${String(k).replace(/_/g,' ').replace(sysId+' ','')}: ${v}`)
    );
    if (examEntries.length) objective += `Examination:\n${examEntries.join('\n')}\n\n`;
    const labEntries = Object.entries(S.labs || {}).filter(([,v]) => v).map(([k, v]) => {
      const def = Object.values(LAB_DEFS).flat().find(d => d.key === k);
      return `${def?.name || k}: ${v} ${def?.unit || ''}`;
    });
    if (labEntries.length) objective += `Investigations:\n${labEntries.join('\n')}\n\n`;
    if (!objective) objective = 'Examination and investigations pending documentation.\n';
    if (CLINICAL_NOTES.history) objective += `\nClinical notes: ${CLINICAL_NOTES.history}`;

    // Assessment
    const diff = S.differential || {};
    const mnm = diff.must_not_miss || diff.t3 || [];
    const ml  = diff.most_likely   || diff.t1 || [];
    let assessment = '';
    if (mnm.length) assessment += `Must not miss: ${mnm.map(c => c.name || c.cond?.name).filter(Boolean).join('; ')}.\n\n`;
    if (ml.length)  assessment += `Most likely diagnoses:\n${ml.map((c,i) => `${i+1}. ${c.name || c.cond?.name} — ${(c.reason || '').slice(0,80)}`).filter(Boolean).join('\n')}\n\n`;
    assessment += `Diagnostic certainty: ${S.certainty || 0}%.\n`;
    if ((S.redFlags || []).length) assessment += `\nRed flags identified: ${S.redFlags.map(f => (f.msg || '').slice(0,60)).join('; ')}.\n`;
    if (CLINICAL_NOTES.impression) assessment += `\nClinical impression: ${CLINICAL_NOTES.impression}`;

    // Plan
    let plan = '';
    const urgent  = (S.nextSteps || []).filter(s => s.urgency === 'urgent');
    const routine = (S.nextSteps || []).filter(s => s.urgency !== 'urgent');
    if (urgent.length)  plan += `Immediate:\n${urgent.map((s,i) => `${i+1}. ${s.action}`).join('\n')}\n\n`;
    if (routine.length) plan += `Investigations/Follow-up:\n${routine.slice(0,4).map((s,i) => `${i+1}. ${s.action}`).join('\n')}\n\n`;
    if ((S.drugs || []).length) {
      plan += `Prescription:\n${S.drugs.map((d,i) => `${i+1}. ${d.name}${d.dose ? ' ' + d.dose : ''}${d.duration ? ' for ' + d.duration : ''}`).join('\n')}\n\n`;
    }
    const topCond = ml[0] || mnm[0];
    if (topCond) {
      const kb = lookupKB(topCond.id || topCond.cond?.id || '');
      if (kb?.referral?.length) plan += `Referral consideration: ${kb.referral[0]}\n`;
    }
    plan += `\nFollow up in ${(S.redFlags || []).length > 0 ? '3-5' : '14'} days or sooner if symptoms worsen.`;

    const meta = `Generated: ${today} · ${pt.age || '?'}y ${pt.gender === 'F' ? 'Female' : pt.gender === 'M' ? 'Male' : ''} · Certainty: ${S.certainty || 0}%`;

    return {
      empty: false,
      subjective: subjective.trim(),
      objective:  objective.trim(),
      assessment: assessment.trim(),
      plan:       plan.trim(),
      meta,
    };
  },

  // ── Slice 6 — Treatment Protocols + Full Report data ───────
  // Returns top 3 differential conditions with their KB entries spread for
  // direct React rendering. No HTML — components own presentation.
  getTopKBProtocols: () => {
    const all = [
      ...(S.differential?.t3 || []),
      ...(S.differential?.t1 || []),
      ...(S.differential?.t2 || []),
    ].slice(0, 3);
    return all.map(c => {
      const kb = lookupKB(c.id || c.cond?.id || '');
      return {
        condId: c.id || c.cond?.id,
        condName: c.name || c.cond?.name,
        tier: c.tier,
        kb,
      };
    }).filter(x => x.kb);
  },

  // Full report data — pure object, no markup. React renders.
  getFullReport: () => {
    const pt = S.patient || {};
    const filled = (S.gaps || []).filter(g => g.value);
    const allConds = [
      ...(S.differential?.t3 || []),
      ...(S.differential?.t1 || []),
      ...(S.differential?.t2 || []),
    ];

    const examEntries = Object.entries(S.examFindings || {}).flatMap(([sysId, findings]) =>
      Object.entries(findings || {}).filter(([, v]) => v)
        .map(([k, v]) => ({ sysId, key: String(k).replace(/_/g, ' '), value: v }))
    );

    const labRows = Object.entries(S.labs || {}).filter(([, v]) => v).map(([k, v]) => {
      const def = Object.values(LAB_DEFS).flat().find(d => d.key === k);
      return {
        key: k,
        name: def?.name || k,
        value: v,
        unit: def?.unit || '',
        ref: def?.ref ? def.ref.join(' – ') : '—',
        status: def ? getLabStatus(v, def) : 'normal',
      };
    });

    const activeSystemNames = Object.keys(S.activeSystems || {})
      .map(id => SYSTEMS[id]?.name || id);

    const vitalsSummary = (typeof getVitalsSummary === 'function')
      ? getVitalsSummary()
      : [];

    return {
      generatedAt: new Date().toLocaleString('en-IN'),
      pt: {
        age: pt.age ?? null,
        gender: pt.gender || '',
        comorbid: pt.comorbid || '',
      },
      rawInput: S.rawInput || '',
      activeSystemNames,
      certainty: S.certainty || 0,
      redFlags: [...(S.redFlags || [])],
      filledGaps: filled.map(g => ({ key: g.key, label: g.label, value: g.value })),
      examEntries,
      vitalsSummary,
      differentialAll: allConds.map(c => ({
        id: c.id || c.cond?.id,
        name: c.name || c.cond?.name,
        tier: c.tier,
        score: c.score,
      })),
      drugs: [...(S.drugs || [])],
      interactions: [...(S.interactions || [])],
      labRows,
      nextSteps: [...(S.nextSteps || [])],
      notes: { ...CLINICAL_NOTES },
    };
  },

  // ── Slice 7 — Prescription Builder ──────────────────────────
  // Returns drug-selector tree: top 4 differential conditions, each with
  // their KB treatment lines, each with drugs flattened with stable IDs.
  getRxDrugOptions: () => {
    const allConds = [
      ...(S.differential?.t3 || []),
      ...(S.differential?.t1 || []),
      ...(S.differential?.t2 || []),
    ].slice(0, 4);
    const out = [];
    for (const cond of allConds) {
      const condId = cond.id || cond.cond?.id || '';
      const kb = lookupKB(condId);
      if (!kb || !kb.treatment) continue;
      const lines = [];
      for (const [lineKey, line] of Object.entries(kb.treatment)) {
        const drugs = (line.drugs || []).map((d, i) => ({
          drugId: `${condId}_${lineKey}_${i}`,
          drug: d,
          condId,
          condName: kb.name,
          lineKey,
          lineLabel: line.label,
        }));
        lines.push({ lineKey, lineLabel: line.label, drugs });
      }
      out.push({ condId, condName: kb.name, kbSystems: kb.systems, sources: kb.gl_sources || [], lines });
    }
    return out;
  },

  // Safety check for a list of selected drug entries (the shape the panel
  // tracks): combines the existing checkInteractions() with patient-specific
  // contraindications inferred from the corpus (renal, pregnancy, asthma+β-blocker).
  getRxSafetyAlerts: (selectedDrugs = []) => {
    const fakeDrugs = selectedDrugs.map(s => ({ name: s.drug?.generic || s.drug?.name || '' })).filter(d => d.name);
    const interactions = checkInteractions(fakeDrugs);
    // Contraindications
    const contraAlerts = [];
    const corpus = (S.corpus || '').toLowerCase();
    for (const sel of selectedDrugs) {
      const drug = sel.drug || {};
      if (!drug.contra) continue;
      const c = String(drug.contra).toLowerCase();
      if ((c.includes('renal') || c.includes('egfr') || c.includes('ckd')) && (corpus.includes('chronic kidney disease') || corpus.includes('ckd'))) {
        contraAlerts.push({ drug: drug.generic, severity: 'danger', msg: `Renal contraindication: ${drug.contra.slice(0, 120)}` });
      }
      if (c.includes('pregnancy') && S.patient?.gender === 'F' && corpus.includes('pregnant')) {
        contraAlerts.push({ drug: drug.generic, severity: 'danger', msg: `Pregnancy contraindication: ${drug.contra.slice(0, 120)}` });
      }
      if (c.includes('asthma') && corpus.includes('asthma') && (drug.generic || '').toLowerCase().includes('beta')) {
        contraAlerts.push({ drug: drug.generic, severity: 'danger', msg: 'Asthma contraindication: beta-blockers can precipitate bronchospasm.' });
      }
    }
    return { interactions, contraAlerts };
  },

  // Builds advice items + follow-up days for the printable prescription.
  buildRxAdvice: (selectedDrugs = []) => {
    const items = [];
    const seen = new Set();
    for (const sel of selectedDrugs) {
      const kb = lookupKB(sel.condId);
      if (!kb) continue;
      if (kb.india_context?.dietary && !seen.has('diet')) {
        items.push(kb.india_context.dietary);
        seen.add('diet');
      }
      if (sel.drug?.monitoring) {
        const first = String(sel.drug.monitoring).split('.')[0].trim();
        if (first) items.push(`Monitor: ${first}.`);
      }
      if (items.length >= 4) break;
    }
    const followupDays = (S.redFlags || []).length > 0 ? '3-5' : '14';
    return { items, followupDays, urgent: (S.redFlags || []).length > 0 };
  },

  // Returns a referral letter as plain text + metadata. React inserts into UI.
  buildReferralLetter: ({ selectedDrugs = [], patientName = '', doctorName = 'Dr.', clinicName = 'Cureocity Clinical' } = {}) => {
    const pt = S.patient || {};
    const today = new Date().toLocaleDateString('en-IN', { day: '2-digit', month: 'long', year: 'numeric' });
    const primarySys = Object.keys(S.activeSystems || {})[0];
    const specialist = SPECIALIST_MAP[primarySys] || { name: 'Specialist', urgency_flag: false };
    const isUrgent = (S.redFlags || []).length > 0 || specialist.urgency_flag;

    const filled = (S.gaps || []).filter(g => g.value);
    const historyItems = filled.map(g => `${g.label}: ${g.value}`).join('\n');
    const examItems = Object.entries(S.examFindings || {})
      .flatMap(([sysId, f]) => Object.entries(f || {}).filter(([, v]) => v).map(([k, v]) => `${String(k).replace(/_/g, ' ')}: ${v}`))
      .join('\n');
    const drugsText = (S.drugs || []).map(d => `${d.name} ${d.dose || ''}`).join(', ') || 'None documented';
    const labText = (S.labAlerts || []).map(a => `${a.name}: ${a.value} ${a.unit || ''} (${a.status})`).join('\n') || 'No abnormalities noted';
    const diffList = [...(S.differential?.t3 || []), ...(S.differential?.t1 || [])];
    const diffText = diffList.map((c, i) => `${i === 0 ? 'Primary working diagnosis' : 'Also consider'}: ${c.name || c.cond?.name}`).join('\n');
    const rxText = selectedDrugs.length
      ? selectedDrugs.map(s => `${s.drug.generic} ${s.drug.dose || ''} ${s.drug.freq || ''} for ${s.drug.duration || ''}`).join('\n')
      : 'No prescription generated yet';
    const vitalsText = (typeof getVitalsSummary === 'function' ? getVitalsSummary() : [])
      .map(v => `${v.label}: ${v.value} ${v.unit || ''}${v.status !== 'normal' ? ' [' + String(v.status).toUpperCase() + ']' : ''}`)
      .join('\n') || 'Not recorded';
    const impression = CLINICAL_NOTES.impression || '[Add clinical impression in Notes panel]';
    const ptDemo = `${pt.age || '?'}y ${pt.gender === 'F' ? 'Female' : pt.gender === 'M' ? 'Male' : 'Patient'}`;

    const text = `${isUrgent ? 'URGENT REFERRAL' : 'REFERRAL LETTER'}

Date: ${today}
To: The ${specialist.name}
From: ${doctorName || 'Dr. [Name]'}
Re: ${ptDemo}${patientName ? ' — ' + patientName : ''}

${isUrgent ? '*** URGENT — Please review at the earliest opportunity ***\n\n' : ''}Dear Colleague,

Thank you for seeing this patient. I am referring for specialist assessment and management of the following:

PRIMARY CONCERN
${diffText || 'See below for differential diagnosis'}

PRESENTING COMPLAINT
${S.rawInput || '[Not documented]'}

CLINICAL HISTORY
${historyItems || '[History not yet documented]'}

VITAL SIGNS
${vitalsText}

EXAMINATION
${examItems || '[Examination not yet documented]'}

INVESTIGATIONS
${labText}

CURRENT MEDICATIONS
${drugsText}

${(S.interactions || []).length ? `DRUG INTERACTIONS NOTED\n${S.interactions.map(i => `• ${(i.matchedDrugs || []).join(' + ')} — ${i.desc}`).join('\n')}\n\n` : ''}CURRENT TREATMENT INITIATED
${rxText}

CLINICAL IMPRESSION
${impression}

${(S.redFlags || []).length ? `RED FLAGS NOTED\n${S.redFlags.map(f => `• ${f.msg}`).join('\n')}\n\n` : ''}I would appreciate your expert opinion regarding:
1. Confirmation of diagnosis and further specialist investigation
2. Optimisation of management
3. Long-term follow-up recommendations

Please do not hesitate to contact me if you require further information.

Yours sincerely,

${doctorName || 'Dr. [Name]'}
${clinicName || 'Cureocity Clinical'}`;

    return { text, specialistName: specialist.name, isUrgent };
  },

  // ICD-10 suggestions from current differential (top 5 conditions, top 2 codes each)
  getSuggestedICD: () => {
    const allConds = [
      ...(S.differential?.must_not_miss || S.differential?.t3 || []),
      ...(S.differential?.most_likely   || S.differential?.t1 || []),
    ];
    const seen = new Set();
    const out = [];
    for (const item of allConds.slice(0, 5)) {
      const condId = item.id || item.cond?.id;
      const codes  = COND_ICD_MAP[condId] || [];
      for (const code of codes.slice(0, 2)) {
        if (!seen.has(code)) {
          const entry = ICD10_DB.find(e => e.code === code);
          if (entry) { out.push({ ...entry, condName: item.name || item.cond?.name }); seen.add(code); }
        }
      }
    }
    return out;
  },

  // Allergy conflict checker — pure function, no DOM
  getAllergyConflicts: () => {
    const conflicts = [];
    for (const allergy of S_ALLERGIES) {
      const aLow = allergy.allergen.toLowerCase();
      for (const drug of S.drugs) {
        const dLow = drug.name.toLowerCase();
        if (dLow.includes(aLow) || aLow.includes(dLow)) {
          conflicts.push({ type:'direct', drug: drug.name, allergen: allergy.allergen, severity:'critical',
            msg:`${drug.name} conflicts with documented ${allergy.allergen} allergy (${allergy.reaction}).` });
        }
      }
      for (const [cls, data] of Object.entries(ALLERGY_CROSS_REACTIVITY)) {
        if (aLow.includes(cls) || data.cross.some(c => aLow.includes(c))) {
          for (const drug of S.drugs) {
            const dLow = drug.name.toLowerCase();
            if (data.cross.some(c => dLow.includes(c))) {
              conflicts.push({ type:'cross', drug: drug.name, allergen: allergy.allergen, severity:'warning',
                msg:`${drug.name}: cross-reactivity with ${allergy.allergen} allergy. ${data.note}` });
            }
          }
        }
      }
    }
    return conflicts;
  },
};
