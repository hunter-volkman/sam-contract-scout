/**
 * sam.js
 * ------
 * Wraps the SAM.gov Get Opportunities public API.
 * Docs: https://open.gsa.gov/api/get-opportunities-public-api/
 *
 * Rate limits:
 *   Public (no account): 10 req/day
 *   Registered user:     1,000 req/day  ← get a free key at sam.gov/profile/details
 */

import { config } from './config.js';

const BASE_URL = 'https://api.sam.gov/prod/opportunities/v2/search';

/**
 * Build a date string in the MM/DD/YYYY format SAM.gov requires.
 */
function samDate(daysAgo = 0) {
  const d = new Date();
  d.setDate(d.getDate() - daysAgo);
  const mm   = String(d.getMonth() + 1).padStart(2, '0');
  const dd   = String(d.getDate()).padStart(2, '0');
  const yyyy = d.getFullYear();
  return `${mm}/${dd}/${yyyy}`;
}

/**
 * Fetch active solicitations from SAM.gov.
 *
 * @param {object} opts
 * @param {string}  opts.keywords       - Full-text search string
 * @param {string}  [opts.naicsCode]    - 6-digit NAICS code filter
 * @param {number}  [opts.postedWithin] - Only return opps posted in last N days
 * @param {number}  [opts.maxResults]   - Max records to return (SAM.gov cap: 1,000)
 * @returns {Promise<OpportunityMetadata[]>}
 */
export async function fetchOpportunities(opts = {}) {
  const {
    keywords     = '',
    naicsCode    = '',
    postedWithin = 30,
    maxResults   = 25,
  } = opts;

  if (!config.SAM_API_KEY) {
    console.warn('  ⚠  SAM_API_KEY not set — using demo data.\n');
    return getDemoOpportunities();
  }

  const params = new URLSearchParams({
    api_key:    config.SAM_API_KEY,
    limit:      String(Math.min(maxResults, 100)),
    offset:     '0',
    ptype:      'o',          // solicitations only
    status:     'active',
    postedFrom: samDate(postedWithin),
    postedTo:   samDate(0),
    ...(keywords  && { q: keywords }),
    ...(naicsCode && { naicsCode }),
  });

  const res = await fetch(`${BASE_URL}?${params}`);

  if (!res.ok) {
    // Don't echo the response body — SAM.gov 4xx errors sometimes include
    // the request URL, which contains api_key as a query parameter.
    await res.text().catch(() => '');
    throw new Error(`SAM.gov API error ${res.status}`);
  }

  const data = await res.json();
  const opps = data.opportunitiesData ?? [];

  return opps.map(normalizeOpportunity);
}

/**
 * Normalize a raw SAM.gov record into the shape the agent uses internally.
 */
function normalizeOpportunity(raw) {
  return {
    id:               raw.noticeId,
    title:            raw.title ?? 'Untitled',
    solicitationNum:  raw.solicitationNumber ?? '',
    agency:           raw.department ?? '',
    subAgency:        raw.subTier ?? '',
    office:           raw.office ?? '',
    naicsCode:        raw.naicsCode ?? '',
    type:             raw.type ?? '',
    postedDate:       raw.postedDate ?? '',
    responseDeadline: raw.responseDeadLine ?? '',
    setAside:         raw.typeOfSetAsideDescription ?? 'None',
    uiLink:           `https://sam.gov/opp/${raw.noticeId}/view`,
    contactEmail:     raw.pointOfContact?.[0]?.email ?? '',
    awardAmount:      raw.award?.amount ?? null,
  };
}

// ─── Demo mode (no API key) ───────────────────────────────────────────────────

function getDemoOpportunities() {
  return [
    {
      id:               'MOCK-001',
      title:            'Cloud Migration and DevSecOps Support Services',
      solicitationNum:  'W911NF-26-R-0042',
      agency:           'DEPARTMENT OF THE ARMY',
      subAgency:        'ARMY RESEARCH LABORATORY',
      office:           'ARL-CISD',
      naicsCode:        '541511',
      type:             'Solicitation',
      postedDate:       '2026-03-01',
      responseDeadline: '2026-04-15',
      setAside:         'Small Business',
      uiLink:           'https://sam.gov/opp/MOCK-001/view',
      contactEmail:     'contracting@arl.army.mil',
      awardAmount:      null,
    },
    {
      id:               'MOCK-002',
      title:            'Enterprise Data Analytics Platform — Phase II',
      solicitationNum:  'FA8750-26-R-0019',
      agency:           'DEPARTMENT OF THE AIR FORCE',
      subAgency:        'AIR FORCE RESEARCH LABORATORY',
      office:           'AFRL/RISC',
      naicsCode:        '541511',
      type:             'Solicitation',
      postedDate:       '2026-03-05',
      responseDeadline: '2026-04-01',
      setAside:         '8(a)',
      uiLink:           'https://sam.gov/opp/MOCK-002/view',
      contactEmail:     'afrl.contracts@us.af.mil',
      awardAmount:      null,
    },
    {
      id:               'MOCK-003',
      title:            'Cybersecurity Assessment and Zero-Trust Architecture Consulting',
      solicitationNum:  'GS-35F-0001X',
      agency:           'GENERAL SERVICES ADMINISTRATION',
      subAgency:        'FAS',
      office:           'Region 6',
      naicsCode:        '541512',
      type:             'Solicitation',
      postedDate:       '2026-03-08',
      responseDeadline: '2026-03-28',
      setAside:         'WOSB',
      uiLink:           'https://sam.gov/opp/MOCK-003/view',
      contactEmail:     'gsa.contracts@gsa.gov',
      awardAmount:      null,
    },
  ];
}