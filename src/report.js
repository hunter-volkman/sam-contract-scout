/**
 * report.js
 * ---------
 * Formats analyzed opportunities into a readable CLI report.
 * Designed to be skimmable in 30 seconds and actionable immediately.
 *
 * Color is auto-disabled when stdout is not a TTY (e.g., piped to a file)
 * or when the NO_COLOR environment variable is set.
 */

// ─── ANSI color helper (hand-rolled to avoid an extra dependency) ─────────────

const useColor = Boolean(process.stdout.isTTY) && !process.env.NO_COLOR;

const ansi = (open, close) => (s) =>
  useColor ? `\x1b[${open}m${s}\x1b[${close}m` : String(s);

const c = {
  bold:   ansi(1, 22),
  dim:    ansi(2, 22),
  red:    ansi(31, 39),
  green:  ansi(32, 39),
  yellow: ansi(33, 39),
  blue:   ansi(34, 39),
  cyan:   ansi(36, 39),
  gray:   ansi(90, 39),
};

const DECISION_LABEL = {
  'GO':    () => c.green(c.bold('✓ GO')),
  'NO-GO': () => c.red(c.bold('✗ NO-GO')),
  'MAYBE': () => c.yellow(c.bold('~ MAYBE')),
};

/**
 * @param {Array} analyzed - Sorted array of enriched + analyzed opportunities
 * @returns {string} - Formatted report string
 */
export function formatReport(analyzed) {
  const lines = [];
  const counts = tallyDecisions(analyzed);

  // ─── Header ───────────────────────────────────────────────────────────
  lines.push(c.cyan('═'.repeat(64)));
  lines.push(c.bold('  SAM Contract Scanner  —  Opportunity Report'));
  lines.push(c.dim(`  Generated: ${new Date().toLocaleString()}`));
  lines.push(c.cyan('═'.repeat(64)));
  lines.push('');
  lines.push(
    `  Scanned ${c.bold(analyzed.length)} • ` +
    `${c.green(`${counts.GO} GO`)} • ` +
    `${c.yellow(`${counts.MAYBE} MAYBE`)} • ` +
    `${c.red(`${counts['NO-GO']} NO-GO`)}`
  );
  lines.push('');

  // ─── Per-opportunity blocks ───────────────────────────────────────────
  analyzed.forEach((opp, i) => {
    const a    = opp.analysis;
    const rank = i + 1;

    lines.push('');
    lines.push(`  ${c.bold(`#${rank}`)}  ${c.bold(opp.title)}`);
    lines.push(`  ${c.dim(opp.agency)}`);
    lines.push('  ' + c.gray('─'.repeat(60)));

    lines.push(`  Decision:   ${labelFor(a.goNoGo)}`);
    lines.push(`  Score:      ${scoreBar(a.score)}  ${c.bold(`${a.score}/10`)}`);
    lines.push(`  Value:      ${a.estimatedValue ?? c.dim('Not specified')}`);
    lines.push(`  Deadline:   ${a.deadline ?? opp.responseDeadline ?? c.dim('TBD')}`);
    lines.push(`  Set-aside:  ${opp.setAside}`);
    lines.push(`  NAICS:      ${opp.naicsCode}`);
    lines.push(`  Link:       ${c.blue(opp.uiLink)}`);
    lines.push('');

    lines.push(c.bold('  Summary'));
    lines.push(wrapText(a.summary, 58, '    '));
    lines.push('');

    if (a.keyRequirements?.length) {
      lines.push(c.bold('  Key requirements'));
      a.keyRequirements.forEach((r) => lines.push(`    • ${r}`));
      lines.push('');
    }

    if (a.winFactors?.length) {
      lines.push(c.bold('  Win factors'));
      a.winFactors.forEach((f) => lines.push(`    ${c.green('✓')} ${f}`));
      lines.push('');
    }

    if (a.risks?.length) {
      lines.push(c.bold('  Risks'));
      a.risks.forEach((r) => lines.push(`    ${c.red('✗')} ${r}`));
      lines.push('');
    }

    if ((a.goNoGo === 'GO' || a.goNoGo === 'MAYBE') && a.proposalOutline?.length) {
      lines.push(c.bold('  Proposal outline'));
      a.proposalOutline.forEach((s, j) =>
        lines.push(`    ${j + 1}. ${s}`)
      );
      lines.push('');
    }

    lines.push('  ' + c.gray('─'.repeat(60)));
  });

  // ─── Footer ───────────────────────────────────────────────────────────
  lines.push('');
  lines.push(c.cyan('═'.repeat(64)));
  const top = analyzed[0];
  if (top) {
    lines.push(
      `  Top pick: ${c.bold(top.title.slice(0, 50))} ` +
      `(${c.bold(top.analysis.score)}/10, ${labelFor(top.analysis.goNoGo)})`
    );
  } else {
    lines.push('  No opportunities to rank.');
  }
  lines.push(c.cyan('═'.repeat(64)));
  lines.push('');

  return lines.join('\n');
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function tallyDecisions(analyzed) {
  const counts = { GO: 0, 'NO-GO': 0, MAYBE: 0 };
  for (const opp of analyzed) {
    const decision = opp.analysis?.goNoGo;
    if (decision in counts) counts[decision]++;
  }
  return counts;
}

function labelFor(decision) {
  const fn = DECISION_LABEL[decision];
  return fn ? fn() : String(decision ?? '—');
}

function scoreBar(score) {
  const n = Math.max(0, Math.min(10, Number(score) || 0));
  const filled  = '█'.repeat(n);
  const empty   = '░'.repeat(10 - n);
  // Color the bar by tier: red <4, yellow 4-6, green >=7
  const colorize = n >= 7 ? c.green : n >= 4 ? c.yellow : c.red;
  return colorize(filled) + c.gray(empty);
}

function wrapText(text, width, indent = '') {
  if (!text) return '';
  const words  = text.split(' ');
  const output = [];
  let   line   = indent;

  for (const word of words) {
    if (line.length + word.length + 1 > width + indent.length) {
      output.push(line);
      line = indent + word;
    } else {
      line += (line === indent ? '' : ' ') + word;
    }
  }
  if (line.trim()) output.push(line);
  return output.join('\n');
}
