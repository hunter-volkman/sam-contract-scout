# SAM Contract Scout

A small command-line tool that pulls active solicitations from
[SAM.gov](https://sam.gov), renders the JavaScript-heavy detail pages with
Playwright, and asks [Claude](https://www.anthropic.com/claude) to score
each opportunity, flag risks, and sketch a proposal outline.

It is **read-only**. It finds and scores opportunities. It does not
register your business, draft full proposals, or submit bids — those are
the obvious next steps for anyone forking this.

---

## What it actually does

```
SAM.gov API     →  Playwright       →  Claude         →  CLI report
─────────────      ─────────────       ────────────       ──────────
Structured         Renders the JS      Scores 1–10        Decision,
metadata: NAICS,   single-page-app     and produces a     score bar,
agency, deadline,  detail page so      go / no-go +       win factors,
posted date,       the full scope      proposal           risks,
set-aside.         of work is text.    outline.           and outline.
```

A single run takes ~1–3 minutes and costs roughly $0.01–0.05 in Claude
tokens, depending on how many opportunities you analyze (`--topN`).

---

## Quick start (no API keys required)

```bash
git clone <this-repo>
cd sam-contract-scout
npm install
npx playwright install chromium     # only the first time
npm start
```

With no `.env` file, the tool runs in **demo mode** with three
sample opportunities so you can see the report format before signing up
for anything.

```
══════════════════════════════════════════════════════════════
  SAM Contract Scout  —  Opportunity Report
  Generated: 2026-05-10 14:22:01
══════════════════════════════════════════════════════════════

  Scanned 3 • 2 GO • 1 MAYBE • 0 NO-GO


  #1  Cloud Migration and DevSecOps Support Services
  DEPARTMENT OF THE ARMY
  ────────────────────────────────────────────────────────────
  Decision:   ✓ GO
  Score:      ████████░░  8/10
  Value:      $2.4M
  Deadline:   2026-04-15
  Set-aside:  Small Business
  NAICS:      541511
  Link:       https://sam.gov/opp/MOCK-001/view

  Summary
    Strong opportunity with clear scope for cloud migration to
    AWS GovCloud. Small Business set-aside limits competition…
```

## Real-data mode

Copy `.env.example` to `.env` and fill in two keys:

| Variable            | Where to get it                                                       | Cost |
|---------------------|------------------------------------------------------------------------|------|
| `SAM_API_KEY`       | [sam.gov/profile/details](https://sam.gov/profile/details) — free      | $0   |
| `ANTHROPIC_API_KEY` | [console.anthropic.com](https://console.anthropic.com)                 | usage-based |

Optional:

| Variable            | Default               | Purpose                                  |
|---------------------|-----------------------|------------------------------------------|
| `MODEL`             | `claude-sonnet-4-5`   | Claude model id used for analysis        |

Then `npm start` again — same command, real data.

---

## Configuration

Three precedence levels, highest first:

1. **CLI flags** (per-run overrides)
2. **`search.config.json`** (project root, persistent defaults)
3. **Hardcoded defaults** in [src/args.js](src/args.js)

### CLI flags

```bash
npm start -- --keywords="laboratory equipment"
npm start -- --naics=334516 --maxValue=25000
npm start -- --keywords="office chairs" --postedWithin=7 --topN=5
npm start -- --json --out=results.json
npm start -- --help
```

| Flag             | Type    | Default                                              | Notes |
|------------------|---------|------------------------------------------------------|-------|
| `--keywords`     | string  | `"supply delivery office equipment electronics"`     | Full-text search passed to SAM.gov |
| `--naics`        | string  | `423430`                                             | 6-digit NAICS code |
| `--maxValue`     | number  | `50000`                                              | Drops opps with a confirmed award above this |
| `--postedWithin` | number  | `30`                                                 | Days back to search |
| `--maxResults`   | number  | `25`                                                 | Records to fetch (SAM cap: 100/page) |
| `--topN`         | number  | `3`                                                  | How many to render + analyze with Claude |
| `--json`         | bool    | `false`                                              | Also print the analyzed payload to stdout |
| `--out=<path>`   | string  | —                                                    | Write the analyzed payload to a JSON file |
| `--help`, `-h`   | —       | —                                                    | Show the help screen |

### `search.config.json`

```json
{
  "keywords":     "supply delivery office equipment electronics furnishings",
  "naicsCode":    "423430",
  "maxValue":     50000,
  "postedWithin": 30,
  "maxResults":   25,
  "topN":         3
}
```

Common NAICS codes for commodity/supply contracts:

| Code     | Description                                  |
|----------|----------------------------------------------|
| `423430` | Computer Equipment Merchant Wholesalers      |
| `337214` | Office Furniture Manufacturing               |
| `423210` | Furniture Merchant Wholesalers               |
| `334111` | Electronic Computer Manufacturing            |
| `334516` | Analytical Laboratory Instrument Mfg         |
| `541511` | Custom Computer Programming Services         |

---

## JSON output

For piping into another tool (a database loader, a dashboard, a follow-up
agent), use `--out` or `--json`:

```bash
npm start -- --keywords="office chairs" --out=results.json
```

```jsonc
{
  "generatedAt": "2026-05-10T18:22:01.123Z",
  "search": { "keywords": "office chairs", "naicsCode": "423430", "maxValue": 50000, "postedWithin": 30 },
  "count": 3,
  "opportunities": [
    {
      "id": "abc123…",
      "title": "Office Chairs — Camp Lejeune",
      "agency": "DEPARTMENT OF THE NAVY",
      "naicsCode": "423210",
      "uiLink": "https://sam.gov/opp/abc123/view",
      "responseDeadline": "2026-05-25",
      "analysis": {
        "score": 8,
        "goNoGo": "GO",
        "summary": "…",
        "winFactors": ["…"],
        "risks": ["…"],
        "proposalOutline": ["…"],
        "keyRequirements": ["…"]
      }
    }
  ]
}
```

The raw Playwright-rendered page text is intentionally stripped from the
JSON output — it's an order of magnitude larger than the structured
fields and was only needed as input to Claude.

---

## Project structure

```
src/
  agent.js    Main pipeline — orchestrates all 5 steps
  sam.js      SAM.gov Opportunities API client + demo data
  crawl.js    Playwright renderer with retry + backoff
  analyze.js  Claude prompt + response parser + demo data
  report.js   Colored CLI report formatter
  config.js   Environment-variable loader
  args.js     CLI flag + JSON config resolver
```

---

## SAM.gov API notes

- Free API key for any registered sam.gov user (10 req/day unauthenticated, 1,000/day registered).
- Opportunities update daily; awards weekly.
- The endpoint is hard-capped at 100 results per request. This tool does
  not paginate — set `--maxResults` accordingly, or fork and add a loop.
- Rate-limit responses (`429`) are surfaced as plain errors; there's no
  built-in backoff for the SAM.gov call itself (only for the Playwright crawl).

---

## Known limitations

This is deliberately a small, single-shot tool. It is **not**:

- a database — every run is independent; results live only as long as
  the process (or the file you pass to `--out`).
- a scheduler — there's no daemon, cron, or watcher. Wrap it yourself.
- a proposal writer — Claude produces an *outline* and risks, not a
  finished response.
- a bid-submission tool — SAM.gov submission requires authenticated
  flows that are intentionally outside scope.
- production-hardened — no test suite, no retries on the SAM API,
  no caching of prior analyses.

The Playwright crawl is the most fragile step. It depends on SAM.gov's
DOM structure staying stable; on failure it now retries 3× with
exponential backoff and falls through to metadata-only analysis if the
page never renders.

---

## Where to take this next

If you fork this and want to grow it into something bigger, the
obvious additions are:

1. **Persistence** — write `--out` JSON into SQLite or Postgres so you
   can track opportunities over time and avoid re-analyzing duplicates.
2. **Capability profile** — replace the generic system prompt in
   [src/analyze.js](src/analyze.js) with your firm's certifications,
   past performance, and pricing model so scores reflect *your*
   competitive position, not a hypothetical one.
3. **Prompt caching** — for repeated runs over the same solicitation
   text, [Anthropic's prompt caching](https://docs.claude.com/en/docs/build-with-claude/prompt-caching)
   can cut costs by ~90%.
4. **Pagination** — wrap [src/sam.js](src/sam.js) in a loop using
   `offset` to break past the 100-result cap.
5. **Adjacent sources** — state and local procurement portals (BidNet,
   Periscope) have lower competition and looser past-performance
   requirements than federal SAM.

---

## License

MIT — see [LICENSE](LICENSE). Contributions and forks welcome; see [CONTRIBUTING.md](CONTRIBUTING.md).
