/**
 * analyze.js
 * ----------
 * Uses Claude to evaluate an enriched government contract opportunity.
 *
 * Given structured metadata (from SAM.gov) + full solicitation text
 * (from Cloudflare /crawl), Claude returns a structured analysis:
 *
 *   score          — 1–10 profitability / win-probability score
 *   goNoGo         — 'GO' | 'NO-GO' | 'MAYBE'
 *   summary        — 2–3 sentence plain-English brief
 *   estimatedValue — extracted $ figure if available
 *   deadline       — response deadline
 *   winFactors     — what's in your favour
 *   risks          — what could hurt you
 *   proposalOutline — ordered list of sections to write
 *   keyRequirements — must-have qualifications or certifications
 */

import { config } from './config.js';

const CLAUDE_API = 'https://api.anthropic.com/v1/messages';

export async function analyzeOpportunity(opp) {
  if (!config.ANTHROPIC_API_KEY) {
    return getMockAnalysis(opp);
  }

  const res = await fetch(CLAUDE_API, {
    method:  'POST',
    headers: {
      'Content-Type':      'application/json',
      'anthropic-version': '2023-06-01',
      'x-api-key':         config.ANTHROPIC_API_KEY,
    },
    body: JSON.stringify({
      model:      config.MODEL,
      max_tokens: 1024,
      system:     SYSTEM_PROMPT,
      messages:   [{ role: 'user', content: buildPrompt(opp) }],
    }),
  });

  if (!res.ok) {
    // Read and discard the body so we don't echo any server-side detail
    // (which can include the request URL) into our own logs.
    await res.text().catch(() => '');
    throw new Error(`Claude API error ${res.status}`);
  }

  const data = await res.json();
  const text = data.content?.[0]?.text ?? '';
  return parseAnalysis(text, opp);
}

// ─── Prompts ──────────────────────────────────────────────────────────────────

const SYSTEM_PROMPT = `
You are a senior government contracting strategist with 20 years of experience
helping small and mid-sized IT firms win federal contracts.

You evaluate solicitations for profitability and winnability. Your analysis is
direct, practical, and free of corporate-speak. You respond ONLY with valid JSON.
`.trim();

function buildPrompt(opp) {
  return `
Analyze this government contract opportunity and return a JSON object with this exact shape:

{
  "score":           <integer 1-10, where 10 = highly profitable and very winnable>,
  "goNoGo":          <"GO" | "NO-GO" | "MAYBE">,
  "summary":         <2-3 sentence plain-English brief>,
  "estimatedValue":  <extracted dollar amount as a string e.g. "$2.4M", or null>,
  "deadline":        <response deadline as a plain date string, or null>,
  "winFactors":      <array of 3 strings — reasons this is winnable>,
  "risks":           <array of 3 strings — reasons this could be lost>,
  "proposalOutline": <array of 5-7 section titles for the proposal>,
  "keyRequirements": <array of must-have qualifications or certifications>
}

Return ONLY the JSON object. No explanation, no markdown fences.

---

Title:        ${opp.title}
Agency:       ${opp.agency} / ${opp.subAgency}
NAICS:        ${opp.naicsCode}
Set-aside:    ${opp.setAside}
Posted:       ${opp.postedDate}
Deadline:     ${opp.responseDeadline || 'Not specified'}
Solicitation: ${opp.solicitationNum}

---

${opp.pageText.slice(0, 6000)}
`.trim();
}

// ─── Response parsing ─────────────────────────────────────────────────────────

function parseAnalysis(text, opp) {
  try {
    const clean = text.replace(/```json|```/g, '').trim();
    return JSON.parse(clean);
  } catch {
    console.warn(`  ⚠  Could not parse Claude response for "${opp.title}" — using fallback.`);
    return {
      score: 5, goNoGo: 'MAYBE', summary: text.slice(0, 200),
      estimatedValue: null, deadline: opp.responseDeadline,
      winFactors: ['Parse error'], risks: ['Parse error'],
      proposalOutline: [], keyRequirements: [],
    };
  }
}

// ─── Demo mode (no API key) ───────────────────────────────────────────────────

function getMockAnalysis(opp) {
  const mockData = {
    'MOCK-001': {
      score: 8,
      goNoGo: 'GO',
      summary: 'Strong opportunity with clear scope for cloud migration to AWS GovCloud. Small Business set-aside limits competition, and the 12-month base + 2 option years provides long-term revenue. Clearance requirement (Secret) is a barrier that weeds out most competitors.',
      estimatedValue: '$2.4M',
      deadline: '2026-04-15',
      winFactors: [
        'Small Business set-aside reduces the competitor pool significantly',
        'Clear SOW with measurable deliverables — less ambiguity in pricing',
        'GovCloud migration is repeatable — strong past performance story',
      ],
      risks: [
        'Secret clearance for 2 key personnel may be hard to staff quickly',
        'CMMC Level 2 certification requires a third-party assessment',
        'Compressed timeline if you are starting the clearance process now',
      ],
      proposalOutline: [
        'Executive Summary — Mission alignment and differentiators',
        'Technical Approach — Migration methodology and phased execution plan',
        'Management Approach — Key personnel bios, org chart, PMO structure',
        'Past Performance — 3 relevant cloud migration case studies',
        'Security Plan — NIST 800-53 compliance strategy and tooling',
        'Pricing — Labor categories, hours, and fully-loaded rates',
      ],
      keyRequirements: [
        'Active Secret clearance for Project Manager and Lead Engineer',
        'CMMC Level 2 certification',
        'Demonstrated AWS GovCloud experience (past 3 years)',
      ],
    },
    'MOCK-002': {
      score: 6,
      goNoGo: 'MAYBE',
      summary: 'Phase II follow-on for an existing analytics platform — the incumbent almost always has a strong advantage here. Worth pursuing only if you have a relationship with AFRL or demonstrable differentiators over the Phase I awardee.',
      estimatedValue: null,
      deadline: '2026-04-01',
      winFactors: [
        '8(a) set-aside gives certified firms preferred access',
        'Data analytics is a strength area if your team has AFRL experience',
        'Phase II implies the government is satisfied and ready to fund further work',
      ],
      risks: [
        'Phase I incumbent almost certainly has an enormous advantage',
        'Tight deadline (April 1) leaves very little proposal-writing time',
        'Value not disclosed — difficult to price competitively without prior contract data',
      ],
      proposalOutline: [
        'Executive Summary',
        'Technical Understanding — Analysis of Phase I outcomes',
        'Technical Approach — How you build on Phase I work',
        'Key Personnel',
        'Past Performance',
        'Price',
      ],
      keyRequirements: [
        '8(a) certification required',
        'Understanding of Phase I deliverables preferred',
      ],
    },
    'MOCK-003': {
      score: 7,
      goNoGo: 'GO',
      summary: 'Cybersecurity and zero-trust work is in high demand across GSA. WOSB set-aside narrows competition substantially. The scope is well-defined and maps cleanly to standard NIST 800-207 work that most capable firms can deliver.',
      estimatedValue: null,
      deadline: '2026-03-28',
      winFactors: [
        'WOSB set-aside dramatically narrows the competitive field',
        'Zero-trust architecture is a well-scoped, repeatable engagement',
        'GSA is a sophisticated buyer — less risk of scope creep',
      ],
      risks: [
        'Response deadline is March 28 — very tight turnaround',
        'Estimated value not published — blind pricing is risky',
        'Strong incumbents in the GSA cybersecurity space (Booz Allen, Leidos)',
      ],
      proposalOutline: [
        'Executive Summary — Zero-trust alignment with EO 14028',
        'Technical Approach — Assessment methodology and ZTA roadmap',
        'Implementation Plan — Phased rollout and milestones',
        'Key Personnel — Credentials and certifications (CISSP, CISM)',
        'Past Performance — Prior federal cybersecurity assessments',
        'Price — Labor mix and T&M or FFP recommendation',
      ],
      keyRequirements: [
        'WOSB certification',
        'CISSP or equivalent for lead assessor',
        'Prior federal cybersecurity assessment experience',
      ],
    },
  };

  return mockData[opp.id] ?? {
    score: 5,
    goNoGo: 'MAYBE',
    summary: 'Analysis not available for this opportunity in demo mode.',
    estimatedValue: null,
    deadline: opp.responseDeadline,
    winFactors: ['Set-aside may limit competition'],
    risks: ['Incumbent advantage unknown', 'Value unclear'],
    proposalOutline: ['Executive Summary', 'Technical Approach', 'Past Performance', 'Pricing'],
    keyRequirements: ['Relevant clearances', 'Past performance in NAICS ' + opp.naicsCode],
  };
}