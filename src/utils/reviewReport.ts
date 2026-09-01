import type { LandsnetCheckSummary } from '../validation/landsnet/types';
import type { ValidationIssue } from '../validation/types';
import { CHECK_DESCRIPTIONS } from '../validation/checkDescriptions';
import { compareCheckCodes } from '../components/ValidationMatrix';

export interface ReviewReportParams {
  fileName: string;
  stationName?: string;
  counts: { ieds: number; goose: number; sv: number; reports: number };
  checks: LandsnetCheckSummary[];
  issues: ValidationIssue[];
  /** Max issues rendered per failed check before eliding (default 15) */
  maxIssuesPerCheck?: number;
}

const MAX_ISSUES_DEFAULT = 15;

function esc(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function baseCode(code: string): string {
  const match = code.match(/^(LNET_\d{3}|IEC_\d{3}|SCL_XSD)/);
  return match ? match[1] : code;
}

/**
 * Self-contained printable HTML for a validation review of one SCD file.
 * Opened in a new window and printed to PDF by the browser — no PDF library needed.
 */
export function buildReviewReportHtml(params: ReviewReportParams): string {
  const { fileName, stationName, counts, issues } = params;
  const maxPer = params.maxIssuesPerCheck ?? MAX_ISSUES_DEFAULT;
  const checks = [...params.checks].sort(compareCheckCodes);
  const date = new Date().toISOString().slice(0, 10);

  const errors = issues.filter((i) => i.severity === 'error').length;
  const warnings = issues.length - errors;
  const byCheck = new Map<string, ValidationIssue[]>();
  for (const issue of issues) {
    const key = baseCode(issue.code);
    if (!byCheck.has(key)) byCheck.set(key, []);
    byCheck.get(key)!.push(issue);
  }

  const resultRows = checks
    .map((check) => {
      const state = check.passed
        ? '<td class="pass">PASS</td>'
        : `<td class="fail">${check.issueCount} issue${check.issueCount === 1 ? '' : 's'}</td>`;
      return `<tr><td class="mono">${esc(check.code)}</td><td>${esc(check.title)}</td>${state}</tr>`;
    })
    .join('\n');

  const findings = checks
    .filter((check) => !check.passed && (byCheck.get(check.code)?.length ?? 0) > 0)
    .map((check) => {
      const list = byCheck.get(check.code)!;
      const desc = CHECK_DESCRIPTIONS[check.code]?.detail;
      const items = list
        .slice(0, maxPer)
        .map((issue) => {
          const hint = issue.fixHint || issue.quickFix;
          return `<li><span class="sev sev-${issue.severity === 'error' ? 'error' : 'warn'}">${issue.severity === 'error' ? 'ERROR' : 'WARN'}</span> ${esc(issue.message)}${hint ? `<div class="fix">→ ${esc(hint)}</div>` : ''}</li>`;
        })
        .join('\n');
      const more = list.length > maxPer ? `<p class="more">… and ${list.length - maxPer} more of the same kind.</p>` : '';
      return `<section class="finding" id="findings-${esc(check.code)}">
  <h3><span class="mono">${esc(check.code)}</span> ${esc(check.title)} <span class="count">${list.length}</span></h3>
  ${desc ? `<p class="check-desc">${esc(desc)}</p>` : ''}
  <ul>${items}</ul>${more}
</section>`;
    })
    .join('\n');

  return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="utf-8">
<title>SCD Validation Review — ${esc(fileName)}</title>
<style>
  :root { color-scheme: light; }
  * { box-sizing: border-box; }
  body { margin: 32px auto; max-width: 800px; font: 13px/1.55 -apple-system, "Segoe UI", Helvetica, Arial, sans-serif; color: #1a2332; background: #fff; }
  .mono { font-family: ui-monospace, "SF Mono", Menlo, Consolas, monospace; }
  header { border-bottom: 3px solid #1a2332; padding-bottom: 12px; margin-bottom: 20px; }
  header h1 { margin: 0 0 2px; font-size: 22px; letter-spacing: 0.01em; }
  header .sub { color: #5a6472; font-size: 12px; }
  .summary { display: flex; gap: 10px; margin: 18px 0 26px; flex-wrap: wrap; }
  .card { border: 1px solid #d4d9e0; border-radius: 6px; padding: 8px 14px; min-width: 86px; }
  .card b { display: block; font-size: 20px; }
  .card span { font-size: 10px; text-transform: uppercase; letter-spacing: 0.06em; color: #5a6472; }
  .card.err b { color: #b91c1c; }
  .card.warn b { color: #b45309; }
  h2 { font-size: 15px; border-bottom: 1px solid #d4d9e0; padding-bottom: 4px; margin: 26px 0 10px; }
  table { border-collapse: collapse; width: 100%; font-size: 12px; }
  th, td { border-bottom: 1px solid #e4e8ee; padding: 4px 8px; text-align: left; vertical-align: top; }
  th { font-size: 10.5px; text-transform: uppercase; letter-spacing: 0.05em; color: #5a6472; }
  td.pass { color: #15803d; font-weight: 600; }
  td.fail { color: #b91c1c; font-weight: 600; }
  .finding { margin: 16px 0; break-inside: avoid-page; }
  .finding h3 { font-size: 13px; margin: 0 0 4px; }
  .finding .count { background: #f1f4f8; border-radius: 999px; padding: 1px 8px; font-size: 11px; font-weight: 600; }
  .check-desc { margin: 2px 0 6px; color: #5a6472; font-size: 11.5px; }
  .finding ul { margin: 4px 0; padding-left: 18px; }
  .finding li { margin: 3px 0; }
  .sev { font-size: 9.5px; font-weight: 700; border-radius: 3px; padding: 1px 5px; margin-right: 4px; }
  .sev-error { background: #fee2e2; color: #b91c1c; }
  .sev-warn { background: #fef3c7; color: #b45309; }
  .fix { color: #5a6472; font-size: 11.5px; margin-left: 2px; }
  .more { color: #5a6472; font-size: 11.5px; font-style: italic; }
  footer { margin-top: 30px; border-top: 1px solid #d4d9e0; padding-top: 8px; color: #5a6472; font-size: 10.5px; }
  @media print {
    body { margin: 0; max-width: none; }
    @page { margin: 18mm 16mm; }
  }
</style>
</head>
<body>
<header>
  <h1>SCD Validation Review</h1>
  <div class="sub">${esc(fileName)}${stationName ? ` · Station ${esc(stationName)}` : ''} · ${date} · SCD Visualizer</div>
</header>

<div class="summary">
  <div class="card"><b>${counts.ieds}</b><span>IEDs</span></div>
  <div class="card"><b>${counts.goose}</b><span>GOOSE CB</span></div>
  <div class="card"><b>${counts.sv}</b><span>SV CB</span></div>
  <div class="card"><b>${counts.reports}</b><span>Report CB</span></div>
  <div class="card err"><b>${errors}</b><span>Errors</span></div>
  <div class="card warn"><b>${warnings}</b><span>Warnings</span></div>
</div>

<h2>Check results</h2>
<table>
  <thead><tr><th>Check</th><th>Title</th><th>Result</th></tr></thead>
  <tbody>
${resultRows}
  </tbody>
</table>

${findings ? `<h2>Findings</h2>\n${findings}` : '<h2>Findings</h2>\n<p>No issues — all checks passed.</p>'}

<footer>Generated by SCD Visualizer · gridtech-is.github.io/scd-visualizer · All processing happens locally in the browser.</footer>
</body>
</html>`;
}

/** Open the review report in a new window and trigger the browser print dialog. */
export function openReviewReportForPrint(html: string): boolean {
  const win = window.open('', '_blank');
  if (!win) {
    return false;
  }
  win.document.open();
  win.document.write(html);
  win.document.close();
  win.focus();
  // Give the new document a beat to layout before printing.
  win.setTimeout(() => win.print(), 250);
  return true;
}
