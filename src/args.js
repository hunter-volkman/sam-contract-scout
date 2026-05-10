/**
 * args.js
 * -------
 * Resolves search parameters from three sources in priority order:
 *
 *   1. Command line flags  (highest priority)
 *   2. search.config.json  (project root)
 *   3. Hardcoded defaults  (lowest priority)
 *
 * Usage examples:
 *   npm start
 *   npm start -- --keywords="laboratory equipment"
 *   npm start -- --naics=334516 --maxValue=25000
 *   npm start -- --keywords="office chairs" --postedWithin=7 --topN=5
 *   npm start -- --json                       (also print JSON to stdout)
 *   npm start -- --out=results.json           (write results to a file)
 *   npm start -- --help
 *
 * All flags are optional. Any flag not provided falls back to the
 * JSON config, then to the defaults below.
 */

import { readFileSync } from 'fs';
import { resolve }      from 'path';

// ─── Hardcoded defaults ───────────────────────────────────────────────────────

const DEFAULTS = {
  keywords:     'supply delivery office equipment electronics',
  naicsCode:    '423430',
  maxValue:     50_000,
  postedWithin: 30,
  maxResults:   25,
  topN:         3,
  json:         false,
  out:          '',
};

// ─── JSON config loader ───────────────────────────────────────────────────────

function loadJsonConfig() {
  const configPath = resolve(process.cwd(), 'search.config.json');
  try {
    const raw = readFileSync(configPath, 'utf8');
    return JSON.parse(raw);
  } catch {
    // File does not exist or is malformed — silently fall back to defaults
    return {};
  }
}

// ─── CLI flag parser ──────────────────────────────────────────────────────────

function parseCliArgs() {
  const args   = process.argv.slice(2);
  const result = {};

  for (const arg of args) {
    // Boolean flag: --json
    if (arg === '--json') {
      result.json = true;
      continue;
    }
    if (arg === '--help' || arg === '-h') {
      result.help = true;
      continue;
    }

    // key=value flag: --key=value
    const match = arg.match(/^--([\w-]+)=(.+)$/);
    if (!match) continue;

    const [, key, value] = match;

    switch (key) {
      case 'keywords':     result.keywords     = value;          break;
      case 'naics':        result.naicsCode    = value;          break;
      case 'maxValue':     result.maxValue     = Number(value);  break;
      case 'postedWithin': result.postedWithin = Number(value);  break;
      case 'maxResults':   result.maxResults   = Number(value);  break;
      case 'topN':         result.topN         = Number(value);  break;
      case 'out':          result.out          = value;          break;
      case 'json':         result.json         = value !== 'false'; break;
      default:
        console.warn(`  ⚠  Unknown flag --${key} ignored.`);
    }
  }

  return result;
}

// ─── Help text ────────────────────────────────────────────────────────────────

const HELP_TEXT = `
SAM Contract Scanner — find and score government contract opportunities

Usage:
  npm start                                     run with defaults / search.config.json
  npm start -- --keywords="office chairs"
  npm start -- --naics=423430 --maxValue=25000
  npm start -- --json --out=results.json
  npm start -- --help

Search flags:
  --keywords=<text>     Full-text search string passed to SAM.gov
  --naics=<code>        6-digit NAICS code filter
  --maxValue=<n>        Drop opportunities with a confirmed award above this dollar amount
  --postedWithin=<n>    Only return opportunities posted in the last N days
  --maxResults=<n>      Max records to fetch from SAM.gov  (cap: 100)
  --topN=<n>            How many top candidates to deeply analyze with Claude

Output flags:
  --json                Print machine-readable JSON to stdout in addition to the report
  --out=<path>          Write analyzed results to <path> as JSON
  --help, -h            Show this message

Demo mode:
  Runs automatically if SAM_API_KEY or ANTHROPIC_API_KEY is unset.
  No network calls are made; sample opportunities are used so you can
  preview the output shape.

Configuration precedence (highest first):
  1. CLI flags
  2. search.config.json (project root)
  3. Hardcoded defaults
`.trim();

export function printHelp() {
  console.log(HELP_TEXT);
}

// ─── Merge and export ─────────────────────────────────────────────────────────

export function resolveSearchParams() {
  const jsonConfig = loadJsonConfig();
  const cliArgs    = parseCliArgs();

  const params = {
    ...DEFAULTS,
    ...jsonConfig,
    ...cliArgs,
  };

  // Validate numeric fields — reject NaN from bad CLI input
  for (const key of ['maxValue', 'postedWithin', 'maxResults', 'topN']) {
    if (isNaN(params[key])) {
      console.warn(`  ⚠  Invalid value for --${key} — using default.`);
      params[key] = DEFAULTS[key];
    }
  }

  return params;
}

/**
 * Print the resolved parameters so the user can confirm what is being used.
 */
export function printSearchParams(params) {
  console.log('  Parameters in use:');
  console.log(`    keywords:     ${params.keywords}`);
  console.log(`    naicsCode:    ${params.naicsCode}`);
  console.log(`    maxValue:     $${params.maxValue.toLocaleString()}`);
  console.log(`    postedWithin: ${params.postedWithin} days`);
  console.log(`    maxResults:   ${params.maxResults}`);
  console.log(`    topN:         ${params.topN}`);
  if (params.out)  console.log(`    out:          ${params.out}`);
  if (params.json) console.log(`    json:         true`);
  console.log('');
}
