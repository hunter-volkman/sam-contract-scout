/**
 * SAM Contract Scout
 * ------------------
 * Finds small government contracts for physical goods (office supplies,
 * electronics, equipment) on SAM.gov, enriches them with the full
 * solicitation text via Playwright, and uses Claude to score, rank, and
 * produce actionable briefs.
 *
 * Data flow:
 *   SAM.gov API   → fetch candidates
 *   → pre-filter  → drop confirmed over-budget opportunities
 *   → Playwright  → render the JS-heavy SAM.gov detail page to text
 *   → Claude      → scored brief + go/no-go + proposal outline
 *   → report      → CLI summary  (and optional JSON output)
 *
 * Parameters:
 *   Resolved from CLI flags > search.config.json > hardcoded defaults.
 *   Run `npm start -- --help` for the full flag list.
 */

import { writeFileSync }                           from 'fs';
import { fetchOpportunities }                      from './sam.js';
import { crawlOpportunityPage }                    from './crawl.js';
import { analyzeOpportunity }                      from './analyze.js';
import { formatReport }                            from './report.js';
import { resolveSearchParams, printSearchParams, printHelp } from './args.js';

// ─── Main pipeline ────────────────────────────────────────────────────────────

async function run() {
  const SEARCH = resolveSearchParams();

  if (SEARCH.help) {
    printHelp();
    process.exit(0);
  }

  console.log('\n╔══════════════════════════════════════════════╗');
  console.log('║        SAM Contract Scout  —  Starting       ║');
  console.log('╚══════════════════════════════════════════════╝\n');

  printSearchParams(SEARCH);

  // Step 1 — Pull structured opportunity metadata from SAM.gov
  console.log('▶ Step 1  Fetching opportunities from SAM.gov…');
  const opportunities = await fetchOpportunities(SEARCH);
  console.log(`  Found ${opportunities.length} active solicitations.\n`);

  if (opportunities.length === 0) {
    console.log('No opportunities matched. Try broadening the search params.');
    process.exit(0);
  }

  // Step 2 — Pre-filter: drop opportunities with a confirmed value above maxValue
  console.log(`▶ Step 2  Pre-filtering against $${SEARCH.maxValue.toLocaleString()} max value…`);
  const preFiltered = opportunities.filter((opp) => {
    if (opp.awardAmount === null || opp.awardAmount === undefined) {
      return true; // Value unknown — pass through for Claude to assess
    }
    const amount = Number(opp.awardAmount);
    if (isNaN(amount)) return true; // Unparseable — pass through
    if (amount > SEARCH.maxValue) {
      console.log(`  Dropped: ${opp.title.slice(0, 60)} ($${amount.toLocaleString()})`);
      return false;
    }
    return true;
  });
  console.log(`  ${preFiltered.length} of ${opportunities.length} passed the value filter.\n`);

  if (preFiltered.length === 0) {
    console.log('All opportunities exceeded the maxValue filter. Try raising --maxValue or broadening keywords.');
    process.exit(0);
  }

  // Step 3 — Enrich the top candidates with full page content via Playwright.
  // Demo opportunities (id starting with "MOCK-") have synthetic URLs, so we
  // skip the crawl for them to keep the demo run fast.
  const candidates = preFiltered.slice(0, SEARCH.topN);
  const realCandidates = candidates.filter((o) => !o.id?.startsWith('MOCK-'));

  if (realCandidates.length === 0) {
    console.log(`▶ Step 3  Skipping Playwright crawl — demo opportunities only.\n`);
  } else {
    console.log(`▶ Step 3  Crawling ${realCandidates.length} opportunity pages via Playwright…`);
  }

  const enriched = await Promise.all(
    candidates.map(async (opp) => {
      if (opp.id?.startsWith('MOCK-')) {
        return { ...opp, pageText: '' };
      }
      const pageText = await crawlOpportunityPage(opp.uiLink);
      return { ...opp, pageText };
    })
  );
  if (realCandidates.length > 0) console.log('  Crawl complete.\n');

  // Step 4 — Ask Claude to analyze each enriched opportunity
  console.log('▶ Step 4  Running Claude analysis on each opportunity…');
  const analyzed = [];

  for (const opp of enriched) {
    process.stdout.write(`  Analyzing: ${opp.title.slice(0, 60)}…`);
    const analysis = await analyzeOpportunity(opp);
    analyzed.push({ ...opp, analysis });
    console.log(` score ${analysis.score}/10`);
  }

  // Step 5 — Sort by score and emit the report
  analyzed.sort((a, b) => b.analysis.score - a.analysis.score);

  console.log('\n▶ Step 5  Generating report…\n');
  const report = formatReport(analyzed);
  console.log(report);

  // Step 6 — Optional JSON output for downstream tooling
  if (SEARCH.out) {
    writeFileSync(SEARCH.out, JSON.stringify(buildJsonPayload(analyzed, SEARCH), null, 2));
    console.log(`  Wrote ${analyzed.length} analyzed opportunities to ${SEARCH.out}\n`);
  }
  if (SEARCH.json) {
    console.log(JSON.stringify(buildJsonPayload(analyzed, SEARCH), null, 2));
  }

  return analyzed;
}

/**
 * Strip the bulky raw page text before serializing — it is not useful
 * downstream and bloats the output by an order of magnitude.
 */
function buildJsonPayload(analyzed, search) {
  return {
    generatedAt: new Date().toISOString(),
    search: {
      keywords:     search.keywords,
      naicsCode:    search.naicsCode,
      maxValue:     search.maxValue,
      postedWithin: search.postedWithin,
    },
    count: analyzed.length,
    opportunities: analyzed.map(({ pageText, ...rest }) => rest),
  };
}

run().catch((err) => {
  console.error('\n✗ Pipeline failed:', err.message);
  process.exit(1);
});
