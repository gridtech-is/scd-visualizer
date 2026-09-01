import { describe, expect, it } from 'vitest';
import { buildReviewReportHtml } from './reviewReport';
import type { LandsnetCheckSummary } from '../validation/landsnet/types';
import type { ValidationIssue } from '../validation/types';

const CHECKS: LandsnetCheckSummary[] = [
  { id: 4, code: 'LNET_004', title: '192.168.* mask/gateway rule', passed: false, issueCount: 2 },
  { id: 19, code: 'IEC_001', title: 'GOOSE subscription completeness', passed: true, issueCount: 0 },
  { id: 27, code: 'IEC_013', title: 'Report client binding', passed: false, issueCount: 1 },
];

function issue(code: string, message: string, severity: 'error' | 'warn' = 'warn'): ValidationIssue {
  return {
    id: `i:${code}:${message}`,
    severity,
    category: 'semantic',
    code,
    message,
    path: '/SCL',
    protocol: 'Generic',
    context: {},
    entityRef: { type: 'Unknown', id: code },
    resolved: false,
    fixHint: `Fix: ${message}`,
  };
}

const ISSUES = [
  issue('LNET_004_IP_PROFILE', 'IED_A/P1 wrong gateway', 'error'),
  issue('LNET_004_IP_PROFILE', 'IED_B/P1 wrong gateway', 'error'),
  issue('IEC_013_UNBOUND_CLIENT', 'Client1 not referenced'),
];

describe('buildReviewReportHtml', () => {
  const html = buildReviewReportHtml({
    fileName: 'MJO_20260831.scd',
    stationName: 'MJO',
    counts: { ieds: 30, goose: 86, sv: 22, reports: 256 },
    checks: CHECKS,
    issues: ISSUES,
  });

  it('carries the file header and summary counts', () => {
    expect(html).toContain('MJO_20260831.scd');
    expect(html).toContain('SCD Validation Review');
    expect(html).toContain('>30<'); // IED count
  });

  it('lists every check IEC-first with pass/fail state', () => {
    const iecPos = html.indexOf('IEC_001');
    const lnetPos = html.indexOf('LNET_004');
    expect(iecPos).toBeGreaterThan(-1);
    expect(lnetPos).toBeGreaterThan(iecPos);
    expect(html).toContain('PASS');
  });

  it('details failed checks with messages and fix hints, skips passed ones', () => {
    expect(html).toContain('IED_A/P1 wrong gateway');
    expect(html).toContain('Fix: Client1 not referenced');
    // passed check gets a table row but no findings section
    expect(html).not.toContain('id="findings-IEC_001"');
    expect(html).toContain('id="findings-LNET_004"');
  });

  it('escapes HTML in issue content', () => {
    const evil = buildReviewReportHtml({
      fileName: 'x<script>.scd',
      counts: { ieds: 1, goose: 0, sv: 0, reports: 0 },
      checks: [{ id: 19, code: 'IEC_001', title: 'GOOSE subscription completeness', passed: false, issueCount: 1 }],
      issues: [issue('IEC_001_X', 'msg with <b>tags</b> & ampersand')],
    });
    expect(evil).not.toContain('<script>');
    expect(evil).not.toContain('<b>tags</b>');
    expect(evil).toContain('&lt;b&gt;');
  });
});
