import { useEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import type { SclModel } from '../model/types';
import type { LandsnetValidationReport } from '../validation/landsnet/types';
import type { ValidationIssue } from '../validation/types';
import { CHECK_DESCRIPTIONS } from '../validation/checkDescriptions';

const COLUMN_VIRTUALIZE_THRESHOLD = 40;

/** Matrix row order: IEC checks first in numeric order, then Landsnet (LNET) checks. */
export function compareCheckCodes(a: { code: string }, b: { code: string }): number {
  const group = (code: string) => (code.startsWith('IEC_') ? 0 : code.startsWith('LNET_') ? 1 : 2);
  const num = (code: string) => Number(code.split('_')[1]) || 0;
  return group(a.code) - group(b.code) || num(a.code) - num(b.code);
}

interface ValidationMatrixProps {
  model: SclModel;
  landsnetReport: LandsnetValidationReport | null | undefined;
  schemaIssues: ValidationIssue[];
  selectedIedName?: string;
  onSelectIed: (iedName: string) => void;
  waivedChecks: Set<string>;
  onToggleWaive: (code: string) => void;
  landsnetEnabled: boolean;
  onToggleLandsnet: () => void;
  onDrillDown: (query: string) => void;
}

export default function ValidationMatrix({
  model,
  landsnetReport,
  schemaIssues,
  selectedIedName,
  onSelectIed,
  waivedChecks,
  onToggleWaive,
  landsnetEnabled,
  onToggleLandsnet,
  onDrillDown,
}: ValidationMatrixProps): JSX.Element {
  const iedNames = useMemo(
    () => [...model.ieds].sort((a, b) => a.name.localeCompare(b.name)).map((i) => i.name),
    [model.ieds],
  );

  // Synthetic schema check row from SCL_XSD issues
  const schemaCheck = useMemo(() => {
    const count = schemaIssues.filter(i => i.code.startsWith('SCL_XSD_001')).length;
    return { id: -1, code: 'SCL_XSD', title: 'XML Schema (IEC 61850-6 SCL)', passed: count === 0, issueCount: count };
  }, [schemaIssues]);

  const checks = useMemo(() => {
    const lnet = landsnetReport?.checks ?? [];
    return [schemaCheck, ...[...lnet].sort(compareCheckCodes)];
  }, [landsnetReport, schemaCheck]);

  // Map: checkCode → iedName → failCount
  // issue.code has a suffix (e.g. LNET_004_IP_PROFILE); extract base code LNET_004 for matching
  const cellData = useMemo(() => {
    const map = new Map<string, Map<string, number>>();
    // Schema check
    map.set('SCL_XSD', new Map<string, number>());
    for (const issue of schemaIssues) {
      if (!issue.code.startsWith('SCL_XSD_001')) continue;
      const checkMap = map.get('SCL_XSD')!;
      const iedName = issue.entityRef.iedName ?? issue.context.iedName ?? '__global__';
      checkMap.set(iedName, (checkMap.get(iedName) ?? 0) + 1);
    }
    if (!landsnetReport) return map;
    for (const check of landsnetReport.checks) {
      map.set(check.code, new Map<string, number>());
    }
    for (const issue of landsnetReport.issues) {
      // Extract base code: "LNET_004_IP_PROFILE" → "LNET_004", "IEC_001_FOO" → "IEC_001"
      const parts = issue.code.split('_');
      const baseCode = parts.length >= 2 ? `${parts[0]}_${parts[1]}` : issue.code;
      const checkMap = map.get(baseCode) ?? map.get(issue.code);
      if (!checkMap) continue;
      const iedName = issue.entityRef.iedName ?? issue.context.iedName ?? '__global__';
      checkMap.set(iedName, (checkMap.get(iedName) ?? 0) + 1);
    }
    return map;
  }, [landsnetReport, schemaIssues]);

  // Column virtualization: track which column indices are visible
  const shouldVirtualize = iedNames.length > COLUMN_VIRTUALIZE_THRESHOLD;
  const [visibleCols, setVisibleCols] = useState<Set<number>>(new Set());
  const headerThRefs = useRef<(HTMLTableCellElement | null)[]>([]);
  const [infoCheckCode, setInfoCheckCode] = useState<string | null>(null);

  useEffect(() => {
    if (!shouldVirtualize) {
      return;
    }

    const observers: IntersectionObserver[] = [];

    iedNames.forEach((_, colIdx) => {
      const el = headerThRefs.current[colIdx];
      if (!el) return;

      const observer = new IntersectionObserver(
        (entries) => {
          entries.forEach((entry) => {
            setVisibleCols((prev) => {
              const next = new Set(prev);
              if (entry.isIntersecting) {
                next.add(colIdx);
              } else {
                next.delete(colIdx);
              }
              return next;
            });
          });
        },
        { threshold: 0 },
      );

      observer.observe(el);
      observers.push(observer);
    });

    return () => {
      observers.forEach((obs) => obs.disconnect());
    };
  }, [iedNames, shouldVirtualize]);

  // Per-IED totals across all non-waived checks
  const iedTotals = useMemo(() => {
    const totals = new Map<string, number>();
    for (const check of checks) {
      if (waivedChecks.has(check.code)) continue;
      const checkMap = cellData.get(check.code);
      if (!checkMap) continue;
      for (const [ied, count] of checkMap) {
        if (ied === '__global__') continue;
        totals.set(ied, (totals.get(ied) ?? 0) + count);
      }
    }
    return totals;
  }, [checks, cellData, waivedChecks]);

  if (!landsnetReport) {
    return (
      <div className="validation-matrix-empty">
        <p className="hint">No validation results. Load an SCD file to run checks.</p>
      </div>
    );
  }

  const infoDesc = infoCheckCode ? CHECK_DESCRIPTIONS[infoCheckCode] : null;

  return (
    <>
    {infoCheckCode && infoDesc && createPortal(
      <div className="check-info-overlay" onClick={() => setInfoCheckCode(null)}>
        <div className="check-info-card" onClick={(e) => e.stopPropagation()}>
          <div className="check-info-header">
            <span className={`check-info-code ${infoCheckCode.startsWith('IEC_') ? 'vm-iec' : infoCheckCode.startsWith('SCL_') ? 'vm-scl' : 'vm-lnet'}`}>
              {infoCheckCode}
            </span>
            <span className="check-info-summary">{infoDesc.summary}</span>
          </div>
          <p className="check-info-detail">{infoDesc.detail}</p>
          {infoDesc.example && (
            <div className="check-info-example">{infoDesc.example}</div>
          )}
          <button className="check-info-close" onClick={() => setInfoCheckCode(null)}>Close</button>
        </div>
      </div>,
      document.body,
    )}
    <div className="validation-matrix-wrap">
      <div className="vm-toolbar">
        <button
          className={`vm-landsnet-toggle ${landsnetEnabled ? 'vm-landsnet-on' : 'vm-landsnet-off'}`}
          onClick={onToggleLandsnet}
          title={landsnetEnabled ? 'Landsnet rules enabled — click to disable' : 'Landsnet rules disabled — click to enable'}
        >
          <span className="vm-landsnet-dot" />
          Landsnet rules
        </button>
      </div>
      <div className="validation-matrix-scroll">
        <table className="validation-matrix-table">
          <thead>
            <tr>
              <th className="vm-check-col">Check</th>
              <th className="vm-title-col">Title</th>
              <th className="vm-global-col">Global</th>
              {iedNames.map((name, colIdx) => {
                const hasIssues = (iedTotals.get(name) ?? 0) > 0;
                return (
                  <th
                    key={name}
                    ref={(el) => { headerThRefs.current[colIdx] = el; }}
                    className={`vm-ied-col ${selectedIedName === name ? 'vm-ied-selected' : ''} ${hasIssues ? 'vm-ied-has-issues' : ''}`}
                    title={name}
                  >
                    <button
                      className={`vm-ied-header-btn ${hasIssues ? 'vm-ied-header-fail' : ''}`}
                      onClick={() => { onSelectIed(name); onDrillDown(name); }}
                    >
                      {name}
                    </button>
                  </th>
                );
              })}
            </tr>
          </thead>
          <tbody>
            {checks.filter((check) => landsnetEnabled || !check.code.startsWith('LNET_')).map((check) => {
              const checkMap = cellData.get(check.code);
              // Issues with no IED attribution at all (stored under __global__)
              const unattributedCount = checkMap?.get('__global__') ?? 0;
              const isWaived = waivedChecks.has(check.code);
              const isFailing = !check.passed && !isWaived;
              return (
                <tr
                  key={check.code}
                  className={`vm-row ${isFailing ? 'vm-row-fail' : ''} ${isWaived ? 'vm-row-waived' : ''}`}
                >
                  <td className="vm-code-cell">
                    <button
                      className={`vm-code-badge vm-code-link ${check.code.startsWith('IEC_') ? 'vm-iec' : check.code.startsWith('SCL_') ? 'vm-scl' : 'vm-lnet'}`}
                      onClick={() => onDrillDown(check.code)}
                      title="Show issues for this check"
                    >
                      {check.code}
                    </button>
                    <button
                      className={`vm-waive-btn ${isWaived ? 'vm-waive-active' : ''}`}
                      onClick={() => onToggleWaive(check.code)}
                      title={isWaived ? 'Marked as N/A — click to unmark' : 'Mark as not applicable'}
                    >
                      N/A
                    </button>
                  </td>
                  <td className="vm-title-cell">
                    <button
                      className="vm-title-btn"
                      onClick={() => setInfoCheckCode(check.code)}
                      title="Click to see explanation"
                    >
                      {check.title}
                    </button>
                  </td>
                  <td className="vm-global-cell">
                    {isWaived ? (
                      <span className="vm-cell vm-na">—</span>
                    ) : check.passed ? (
                      <span className="vm-cell vm-pass">✓</span>
                    ) : (
                      <button
                        className="vm-cell vm-fail vm-cell-btn"
                        onClick={() => onDrillDown(check.code)}
                        title={unattributedCount > 0 ? `${unattributedCount} of ${check.issueCount} issues have no IED attribution` : `${check.issueCount} issues — click to show`}
                      >
                        {check.issueCount}
                      </button>
                    )}
                  </td>
                  {iedNames.map((iedName, colIdx) => {
                    const isVisible =
                      !shouldVirtualize ||
                      visibleCols.has(colIdx) ||
                      selectedIedName === iedName;
                    if (!isVisible) {
                      return (
                        <td
                          key={iedName}
                          className={`vm-ied-cell vm-placeholder ${selectedIedName === iedName ? 'vm-ied-selected' : ''}`}
                        />
                      );
                    }
                    const count = checkMap?.get(iedName) ?? 0;
                    return (
                      <td
                        key={iedName}
                        className={`vm-ied-cell ${selectedIedName === iedName ? 'vm-ied-selected' : ''}`}
                      >
                        <CellBadge
                          count={count}
                          isWaived={isWaived}
                          onClick={() => { onSelectIed(iedName); onDrillDown(iedName); }}
                        />
                      </td>
                    );
                  })}
                </tr>
              );
            })}
          </tbody>
          <tfoot>
            <tr className="vm-totals-row">
              <td className="vm-code-cell" colSpan={2}><strong>Total</strong></td>
              <td className="vm-global-cell">
                <span className="vm-cell vm-total">
                  {checks.filter(c => !waivedChecks.has(c.code)).reduce((s, c) => s + c.issueCount, 0)}
                </span>
              </td>
              {iedNames.map((iedName, colIdx) => {
                const isVisible = !shouldVirtualize || visibleCols.has(colIdx) || selectedIedName === iedName;
                const total = iedTotals.get(iedName) ?? 0;
                return (
                  <td
                    key={iedName}
                    className={`vm-ied-cell ${selectedIedName === iedName ? 'vm-ied-selected' : ''}`}
                  >
                    {isVisible ? (
                      <span className={`vm-cell ${total > 0 ? 'vm-total-fail' : 'vm-total'}`}>
                        {total > 0 ? total : '·'}
                      </span>
                    ) : null}
                  </td>
                );
              })}
            </tr>
          </tfoot>
        </table>
      </div>
    </div>
    </>
  );
}

function CellBadge({
  count,
  isWaived,
  onClick,
}: {
  count: number;
  isWaived: boolean;
  onClick?: () => void;
}): JSX.Element {
  if (isWaived) {
    return <span className="vm-cell vm-na">—</span>;
  }
  if (count === 0) {
    return <span className="vm-cell vm-pass">✓</span>;
  }
  return (
    <button className="vm-cell vm-fail vm-cell-btn" onClick={onClick} title={`${count} issues — click to show`}>
      {count}
    </button>
  );
}
