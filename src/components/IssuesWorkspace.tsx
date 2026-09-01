import { useEffect, useMemo, useRef, useState } from 'react';
import type { ValidationFilters, ValidationIssue } from '../validation/types';
import { CHECK_DESCRIPTIONS } from '../validation/checkDescriptions';
import VirtualList from './network/VirtualList';
import { Button, Chip } from './ui';

/** Base check code from a full issue code: LNET_007_MMS_INDEXED_FALSE → LNET_007, SCL_XSD_001_* → SCL_XSD. */
export function issueBaseCode(code: string): string {
  const match = code.match(/^(LNET_\d{3}|IEC_\d{3}|SCL_XSD)/);
  return match ? match[1] : code;
}

/** Human-readable group label for a check: code plus its title when known. */
export function checkGroupLabel(baseCode: string): string {
  const summary = CHECK_DESCRIPTIONS[baseCode]?.summary;
  return summary ? `${baseCode} — ${summary}` : baseCode;
}

type GroupBy = 'check' | 'ied' | 'protocol' | 'category';
type GroupSort = 'count' | 'severity' | 'code';

/** Flattened row for virtualized list: either a group header or an issue row */
type FlattenedRow =
  | { type: 'group-header'; key: string; groupKey: string; label: string; errors: number; warns: number; collapsed: boolean }
  | { type: 'issue'; key: string; issue: ValidationIssue };

const ISSUE_ROW_HEIGHT = 54;
const VIRTUAL_LIST_MIN_HEIGHT = 200;
const VIRTUAL_LIST_MAX_HEIGHT = 520;

interface IssuesWorkspaceProps {
  issues: ValidationIssue[];
  selectedIssueId: string | null;
  filters: ValidationFilters;
  onFilterChange: (next: Partial<ValidationFilters>) => void;
  onSelectIssue: (id: string) => void;
  onOpenInGraph: (id: string) => void;
  onExportJson: () => void;
  onExportCsv: () => void;
  onExportLandsnetJson: () => void;
  onShowToast?: (message: string) => void;
}

interface GroupedIssues {
  key: string;
  label: string;
  issues: ValidationIssue[];
}

export default function IssuesWorkspace({
  issues,
  selectedIssueId,
  filters,
  onFilterChange,
  onSelectIssue,
  onOpenInGraph,
  onExportJson,
  onExportCsv,
  onExportLandsnetJson,
  onShowToast,
}: IssuesWorkspaceProps): JSX.Element {

  async function copyToClipboard(text: string): Promise<void> {
    try {
      await navigator.clipboard.writeText(text);
      onShowToast?.('Copied to clipboard');
    } catch {
      onShowToast?.('Copy failed — check browser permissions');
    }
  }
  const [groupBy, setGroupBy] = useState<GroupBy>('check');
  const [groupSort, setGroupSort] = useState<GroupSort>('count');
  const [onlyErrors, setOnlyErrors] = useState(false);
  const [onlyLandsnet, setOnlyLandsnet] = useState(false);
  const [onlyDuplicates, setOnlyDuplicates] = useState(false);
  const [onlyNetworkIds, setOnlyNetworkIds] = useState(false);
  // Groups start collapsed so the list reads as a report overview; a search expands everything.
  const [expandedGroups, setExpandedGroups] = useState<Set<string>>(new Set());
  const [allExpanded, setAllExpanded] = useState(false);

  const toggleGroup = (key: string): void => {
    setExpandedGroups((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  };

  const listContainerRef = useRef<HTMLDivElement>(null);
  const [listHeight, setListHeight] = useState(VIRTUAL_LIST_MAX_HEIGHT);

  // Measure the actual container height rather than guessing from window.innerHeight.
  // The container has overflow:hidden so clientHeight reflects the CSS-determined
  // flex height, not the content height — no circular dependency with VirtualList.
  useEffect(() => {
    const el = listContainerRef.current;
    if (!el) return;
    const update = (): void => {
      const h = el.clientHeight;
      if (h > 0) setListHeight(Math.max(VIRTUAL_LIST_MIN_HEIGHT, h));
    };
    update();
    if (typeof ResizeObserver !== 'undefined') {
      const observer = new ResizeObserver(update);
      observer.observe(el);
      return () => observer.disconnect();
    }
    window.addEventListener('resize', update);
    return () => window.removeEventListener('resize', update);
  }, []);

  const summary = useMemo(() => {
    const errors = issues.filter((issue) => issue.severity === 'error').length;
    const warnings = issues.filter((issue) => issue.severity === 'warn' || issue.severity === 'warning').length;
    const landsnet = issues.filter((issue) => issue.code.startsWith('LNET_')).length;
    const unresolved = issues.filter((issue) => !issue.resolved).length;
    return {
      total: issues.length,
      errors,
      warnings,
      landsnet,
      unresolved,
    };
  }, [issues]);

  const filtered = useMemo(() => {
    const q = filters.query.trim().toLowerCase();
    return issues.filter((issue) => {
      if (!matchesSeverity(issue, filters.severity)) {
        return false;
      }
      if (filters.category !== 'all' && issue.category !== filters.category) {
        return false;
      }
      if (filters.protocol !== 'all' && issue.protocol !== filters.protocol) {
        return false;
      }
      if (filters.status !== 'all') {
        const status = issue.resolved ? 'resolved' : 'unresolved';
        if (status !== filters.status) {
          return false;
        }
      }

      if (onlyErrors && issue.severity !== 'error') {
        return false;
      }
      if (onlyLandsnet && !issue.code.startsWith('LNET_')) {
        return false;
      }
      if (onlyDuplicates && !/DUPLICATE|DUP_/i.test(issue.code)) {
        return false;
      }
      if (onlyNetworkIds && !/(IP|MAC|APPID)/i.test(`${issue.code} ${issue.message}`)) {
        return false;
      }

      if (!q) {
        return true;
      }
      return (
        issue.message.toLowerCase().includes(q) ||
        issue.code.toLowerCase().includes(q) ||
        issue.path.toLowerCase().includes(q) ||
        (issue.context.iedName || '').toLowerCase().includes(q)
      );
    });
  }, [issues, filters, onlyErrors, onlyLandsnet, onlyDuplicates, onlyNetworkIds]);

  const grouped = useMemo(() => {
    const map = new Map<string, ValidationIssue[]>();
    for (const issue of filtered) {
      const key = groupKey(issue, groupBy);
      if (!map.has(key)) {
        map.set(key, []);
      }
      map.get(key)!.push(issue);
    }

    const groups: GroupedIssues[] = Array.from(map.entries()).map(([key, list]) => ({
      key,
      label: groupBy === 'check' ? checkGroupLabel(key) : key,
      issues: [...list].sort((a, b) => {
        const sev = severityRank(b.severity) - severityRank(a.severity);
        if (sev !== 0) {
          return sev;
        }
        return a.code.localeCompare(b.code);
      }),
    }));

    groups.sort((a, b) => {
      if (groupSort === 'count') {
        const count = b.issues.length - a.issues.length;
        if (count !== 0) {
          return count;
        }
      }
      if (groupSort === 'severity') {
        const sa = maxSeverity(a.issues);
        const sb = maxSeverity(b.issues);
        const bySeverity = severityRank(sb) - severityRank(sa);
        if (bySeverity !== 0) {
          return bySeverity;
        }
      }
      return a.label.localeCompare(b.label);
    });

    return groups;
  }, [filtered, groupBy, groupSort]);

  const selectedIssue = useMemo(
    () => filtered.find((issue) => issue.id === selectedIssueId) || issues.find((issue) => issue.id === selectedIssueId) || null,
    [filtered, issues, selectedIssueId],
  );

  const searchActive = filters.query.trim().length > 0;

  const flattenedRows = useMemo((): FlattenedRow[] => {
    const rows: FlattenedRow[] = [];
    for (const group of grouped) {
      const errors = group.issues.filter((i) => i.severity === 'error').length;
      const expanded = allExpanded || searchActive || expandedGroups.has(group.key);
      rows.push({
        type: 'group-header',
        key: `h:${group.key}`,
        groupKey: group.key,
        label: group.label,
        errors,
        warns: group.issues.length - errors,
        collapsed: !expanded,
      });
      if (expanded) {
        for (const issue of group.issues) {
          rows.push({ type: 'issue', key: issue.id, issue });
        }
      }
    }
    return rows;
  }, [grouped, expandedGroups, allExpanded, searchActive]);

  return (
    <section className="issues-workspace panel">
      <div className="issues-workspace-grid">
        <aside className="issues-sidebar">
          <div className="panel-title-row">
            <h2>Issues</h2>
            <span className="file-pill">{summary.total}</span>
          </div>

          <div className="issues-kpis">
            <button
              type="button"
              className="kpi-tile"
              title="Clear severity/status filters"
              onClick={() => { setOnlyErrors(false); setOnlyLandsnet(false); onFilterChange({ severity: 'all', status: 'all' }); }}
            >
              <h4>Total</h4><strong>{summary.total}</strong>
            </button>
            <button
              type="button"
              className={`kpi-tile danger ${onlyErrors ? 'active' : ''}`}
              title="Show only errors"
              onClick={() => setOnlyErrors((v) => !v)}
            >
              <h4>Errors</h4><strong>{summary.errors}</strong>
            </button>
            <button
              type="button"
              className={`kpi-tile warn ${filters.severity === 'warn' ? 'active' : ''}`}
              title="Show only warnings"
              onClick={() => onFilterChange({ severity: filters.severity === 'warn' ? 'all' : 'warn' })}
            >
              <h4>Warnings</h4><strong>{summary.warnings}</strong>
            </button>
            <button
              type="button"
              className={`kpi-tile ${onlyLandsnet ? 'active' : ''}`}
              title="Show only Landsnet (LNET) issues"
              onClick={() => setOnlyLandsnet((v) => !v)}
            >
              <h4>Landsnet</h4><strong>{summary.landsnet}</strong>
            </button>
            <button
              type="button"
              className={`kpi-tile ${filters.status === 'unresolved' ? 'active' : ''}`}
              title="Show only unresolved issues"
              onClick={() => onFilterChange({ status: filters.status === 'unresolved' ? 'all' : 'unresolved' })}
            >
              <h4>Unresolved</h4><strong>{summary.unresolved}</strong>
            </button>
          </div>

          <div className="issues-filter-box" role="group" aria-labelledby="issues-filters-heading">
            <h3 id="issues-filters-heading">Filters</h3>
            <input className="input filter-search" value={filters.query} aria-label="Search issues by code, message or IED" onChange={(e) => onFilterChange({ query: e.target.value })} placeholder="Search code / message / IED…" />
            <div className="filter-grid labeled">
              <label className="filter-field">
                <span>Severity</span>
                <select className="input" value={filters.severity} onChange={(e) => onFilterChange({ severity: e.target.value as ValidationFilters['severity'] })}>
                  <option value="all">All</option>
                  <option value="error">Error</option>
                  <option value="warn">Warning</option>
                  <option value="info">Info</option>
                </select>
              </label>
              <label className="filter-field">
                <span>Category</span>
                <select className="input" value={filters.category} onChange={(e) => onFilterChange({ category: e.target.value as ValidationFilters['category'] })}>
                  <option value="all">All</option>
                  <option value="syntax">Syntax</option>
                  <option value="semantic">Semantic</option>
                  <option value="interop">Interop</option>
                </select>
              </label>
              <label className="filter-field">
                <span>Protocol</span>
                <select className="input" value={filters.protocol} onChange={(e) => onFilterChange({ protocol: e.target.value as ValidationFilters['protocol'] })}>
                  <option value="all">All</option>
                  <option value="GOOSE">GOOSE</option>
                  <option value="SV">SV</option>
                  <option value="REPORT">REPORT</option>
                  <option value="Generic">Generic</option>
                </select>
              </label>
              <label className="filter-field">
                <span>Status</span>
                <select className="input" value={filters.status} onChange={(e) => onFilterChange({ status: e.target.value as ValidationFilters['status'] })}>
                  <option value="all">All</option>
                  <option value="resolved">Resolved</option>
                  <option value="unresolved">Unresolved</option>
                </select>
              </label>
            </div>

            <div className="chip-group">
              <Chip active={onlyDuplicates} onClick={() => setOnlyDuplicates((v) => !v)}>Only duplicates</Chip>
              <Chip active={onlyNetworkIds} onClick={() => setOnlyNetworkIds((v) => !v)}>Only IP/MAC/APPID</Chip>
            </div>
          </div>

          <div className="issues-filter-box" role="group" aria-labelledby="issues-grouping-heading">
            <h3 id="issues-grouping-heading">Grouping</h3>
            <div className="filter-grid labeled">
              <label className="filter-field">
                <span>Group by</span>
                <select className="input" value={groupBy} onChange={(e) => setGroupBy(e.target.value as GroupBy)}>
                  <option value="check">Check</option>
                  <option value="ied">IED</option>
                  <option value="protocol">Protocol</option>
                  <option value="category">Category</option>
                </select>
              </label>
              <label className="filter-field">
                <span>Sort groups</span>
                <select className="input" value={groupSort} onChange={(e) => setGroupSort(e.target.value as GroupSort)}>
                  <option value="count">By count</option>
                  <option value="severity">By severity</option>
                  <option value="code">By code</option>
                </select>
              </label>
            </div>
          </div>

          <div className="tabs-row wrap">
            <Button onClick={onExportJson}>Export validation JSON</Button>
            <Button onClick={onExportCsv}>Export validation CSV</Button>
            <Button onClick={onExportLandsnetJson}>Export Landsnet JSON</Button>
          </div>
        </aside>

        <section className="issues-main">
          <div className="issues-list-pane">
            <div className="panel-title-row">
              <h3>Grouped Issues</h3>
              <div className="issues-list-actions">
                <button
                  type="button"
                  className="link-btn"
                  onClick={() => { setAllExpanded((v) => !v); setExpandedGroups(new Set()); }}
                >
                  {allExpanded ? 'Collapse all' : 'Expand all'}
                </button>
                <span className="file-pill">{filtered.length} shown</span>
              </div>
            </div>

            {grouped.length === 0 ? <p className="hint">No issues match current filters.</p> : null}

            <div ref={listContainerRef} className="issues-group-list" role="region" aria-label="Grouped issues list">
              <VirtualList<FlattenedRow>
                items={flattenedRows}
                rowHeight={ISSUE_ROW_HEIGHT}
                height={listHeight}
                overscan={8}
                itemKey={(row) => row.key}
                renderRow={(row, _index) => {
                  if (row.type === 'group-header') {
                    const [code, title] = row.label.includes(' — ')
                      ? [row.label.slice(0, row.label.indexOf(' — ')), row.label.slice(row.label.indexOf(' — ') + 3)]
                      : [row.label, ''];
                    return (
                      <button
                        type="button"
                        className={`issues-group-toggle ${row.errors > 0 ? 'has-errors' : 'has-warns'}`}
                        onClick={() => toggleGroup(row.groupKey)}
                        aria-expanded={!row.collapsed}
                      >
                        <span className={`group-chevron ${row.collapsed ? '' : 'open'}`} aria-hidden="true">›</span>
                        <span className="group-code">{code}</span>
                        {title ? <span className="group-title">{title}</span> : null}
                        <span className="group-counts">
                          {row.errors > 0 ? <span className="group-count err">{row.errors} err</span> : null}
                          {row.warns > 0 ? <span className="group-count warn">{row.warns} warn</span> : null}
                        </span>
                      </button>
                    );
                  }
                  const { issue } = row;
                  const iedName = issue.context.iedName || issue.entityRef.iedName || '';
                  const suffix = issue.code.startsWith(`${issueBaseCode(issue.code)}_`)
                    ? issue.code.slice(issueBaseCode(issue.code).length + 1)
                    : issue.code;
                  return (
                    <button
                      type="button"
                      className={`issue-row ${selectedIssueId === issue.id ? 'active' : ''}`}
                      onClick={() => onSelectIssue(issue.id)}
                      title={`[${issue.code}] ${issue.message}`}
                    >
                      <span className={`sev-dot sev-${normalizeSeverity(issue.severity)}`} aria-label={normalizeSeverity(issue.severity)} />
                      <span className="issue-row-body">
                        <span className="issue-row-title">
                          {groupBy === 'check' ? issue.message : `[${issueBaseCode(issue.code)}] ${issue.message}`}
                        </span>
                        <span className="issue-row-meta">
                          {iedName ? <span className="issue-meta-ied">{iedName}</span> : null}
                          <span className="issue-meta-code">{suffix}</span>
                        </span>
                      </span>
                    </button>
                  );
                }}
              />
            </div>
          </div>

          <aside className="issues-details-pane">
            <div className="panel-title-row">
              <h3>Issue Details</h3>
            </div>

            {selectedIssue ? (
              <>
                <header className="issue-detail-header">
                  <div className="issue-detail-headline">
                    <span className={`sev-chip sev-${normalizeSeverity(selectedIssue.severity)}`}>
                      {normalizeSeverity(selectedIssue.severity)}
                    </span>
                    <span className="issue-detail-code">{issueBaseCode(selectedIssue.code)}</span>
                    {selectedIssue.protocol && selectedIssue.protocol !== 'Generic' ? (
                      <span className={`proto-chip proto-${selectedIssue.protocol.toLowerCase()}`}>{selectedIssue.protocol}</span>
                    ) : null}
                  </div>
                  {CHECK_DESCRIPTIONS[issueBaseCode(selectedIssue.code)] ? (
                    <p className="issue-detail-check-title">{CHECK_DESCRIPTIONS[issueBaseCode(selectedIssue.code)].summary}</p>
                  ) : null}
                  <p className="issue-detail-message">{selectedIssue.message}</p>
                </header>

                {(selectedIssue.fixHint || selectedIssue.quickFix) ? (
                  <article className="fix-callout">
                    <h4>How to fix</h4>
                    <p>{selectedIssue.fixHint || selectedIssue.quickFix}</p>
                  </article>
                ) : null}

                {Object.entries(selectedIssue.context).filter(([, v]) => v !== undefined && v !== null && v !== '').length > 0 ? (
                  <article className="info-card">
                    <h4>Context</h4>
                    <dl className="detail-grid">
                      {Object.entries(selectedIssue.context)
                        .filter(([, v]) => v !== undefined && v !== null && v !== '')
                        .map(([key, value]) => (
                          <div className="detail-grid-row" key={key}>
                            <dt>{key}</dt>
                            <dd>{typeof value === 'object' ? JSON.stringify(value) : String(value)}</dd>
                          </div>
                        ))}
                    </dl>
                  </article>
                ) : null}

                <article className="info-card">
                  <h4>Location</h4>
                  <button
                    type="button"
                    className="detail-path"
                    title="Copy SCL path"
                    onClick={() => void copyToClipboard(selectedIssue.path)}
                  >
                    {selectedIssue.path}
                  </button>
                  <p className="issue-detail-fullcode hint">Issue code: {selectedIssue.code} · {selectedIssue.category}</p>
                </article>

                <div className="tabs-row wrap">
                  <Button onClick={() => void copyToClipboard(JSON.stringify(selectedIssue, null, 2))}>Copy issue JSON</Button>
                  {(selectedIssue.context.iedName || selectedIssue.entityRef.iedName) ? (
                    <Button variant="primary" onClick={() => onOpenInGraph(selectedIssue.id)}>Open in graph</Button>
                  ) : null}
                </div>
              </>
            ) : (
              <p className="hint">Select an issue to inspect details.</p>
            )}
          </aside>
        </section>
      </div>
    </section>
  );
}

function matchesSeverity(issue: ValidationIssue, filter: ValidationFilters['severity']): boolean {
  if (filter === 'all') {
    return true;
  }
  if (filter === 'warn' || filter === 'warning') {
    return issue.severity === 'warn' || issue.severity === 'warning';
  }
  return issue.severity === filter;
}

function groupKey(issue: ValidationIssue, groupBy: GroupBy): string {
  if (groupBy === 'check') {
    return issueBaseCode(issue.code);
  }
  if (groupBy === 'ied') {
    return issue.context.iedName || issue.entityRef.iedName || 'Unknown IED';
  }
  if (groupBy === 'protocol') {
    return issue.protocol;
  }
  return issue.category;
}

function severityRank(severity: ValidationIssue['severity']): number {
  if (severity === 'error') {
    return 3;
  }
  if (severity === 'warn' || severity === 'warning') {
    return 2;
  }
  return 1;
}

function maxSeverity(issues: ValidationIssue[]): ValidationIssue['severity'] {
  return [...issues].sort((a, b) => severityRank(b.severity) - severityRank(a.severity))[0]?.severity || 'info';
}

function normalizeSeverity(severity: ValidationIssue['severity']): 'error' | 'warning' | 'info' {
  if (severity === 'error') {
    return 'error';
  }
  if (severity === 'warn' || severity === 'warning') {
    return 'warning';
  }
  return 'info';
}

