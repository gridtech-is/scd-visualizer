import { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { Badge } from './ui';

type ViewMode = 'dashboard' | 'visualizer' | 'network' | 'issues' | 'compare' | 'statistics' | 'addresses' | 'ied' | 'version' | 'sld';

interface TopBarProps {
  fileName: string;
  appMode: ViewMode;
  issueCount: number;
  fileType?: string;
  locked?: boolean;
  onOpenFile: () => void;
  onLoadExample: (path: string) => void;
  onOpenCommand: () => void;
  onExportGooseCsv: () => void;
  onExportGooseDetailedCsv: () => void;
  onExportAllFlowsCsv: () => void;
  onExportProtocolSummaryCsv: () => void;
  onExportLandsnetJson: () => void;
  onExportExcelIp: (sheetsOption?: import('../utils/exportExcel').ExportSheetsOption) => void;
  onSetAppMode: (mode: ViewMode) => void;
  // Compare mode
  isCompareMode?: boolean;
  baselineName?: string;
  newName?: string;
  compareViewFile?: 'A' | 'B' | null;
  onCompare?: () => void;
  onViewCompareFile?: (which: 'A' | 'B') => void;
  onExitCompare?: () => void;
}

const EXAMPLES = [
  { label: 'Example 1 – Basic GOOSE/SV', path: '/examples/example-basic.scd' },
  { label: 'Example 2 – Unresolved links', path: '/examples/example-unresolved.scd' },
];

export default function TopBar({
  fileName,
  issueCount,
  fileType,
  locked,
  onOpenFile,
  onLoadExample,
  onOpenCommand,
  onExportGooseCsv,
  onExportGooseDetailedCsv,
  onExportAllFlowsCsv,
  onExportProtocolSummaryCsv,
  onExportLandsnetJson,
  onExportExcelIp,
  isCompareMode,
  baselineName,
  newName,
  compareViewFile,
  onCompare,
  onViewCompareFile,
  onExitCompare,
}: TopBarProps): JSX.Element {
  const hasFile = Boolean(fileName && fileName !== 'none');
  const [exportOpen, setExportOpen] = useState(false);
  const [menuPos, setMenuPos] = useState<{ top: number; right: number }>({ top: 0, right: 0 });
  const btnRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    if (!exportOpen) return;
    function handleClose(e: MouseEvent) {
      const target = e.target as Node;
      // Close if clicking outside the button and the portal menu
      const menu = document.getElementById('export-portal-menu');
      if (
        btnRef.current && !btnRef.current.contains(target) &&
        menu && !menu.contains(target)
      ) {
        setExportOpen(false);
      }
    }
    document.addEventListener('mousedown', handleClose);
    return () => document.removeEventListener('mousedown', handleClose);
  }, [exportOpen]);

  function openMenu() {
    if (btnRef.current) {
      const rect = btnRef.current.getBoundingClientRect();
      setMenuPos({ top: rect.bottom + 4, right: window.innerWidth - rect.right });
    }
    setExportOpen((o) => !o);
  }

  function handleExportItem(fn: () => void) {
    setExportOpen(false);
    fn();
  }

  const menu = exportOpen
    ? createPortal(
        <div
          id="export-portal-menu"
          style={{
            position: 'fixed',
            top: menuPos.top,
            right: menuPos.right,
            minWidth: 0,
            zIndex: 9999,
            background: 'var(--surface)',
            border: '1px solid var(--line-strong)',
            borderRadius: 'var(--radius-md)',
            boxShadow: 'var(--shadow)',
            padding: '4px',
          }}
        >
          <button className="menu-item" onClick={() => handleExportItem(onExportGooseCsv)}>GOOSE Matrix CSV</button>
          <button className="menu-item" onClick={() => handleExportItem(onExportGooseDetailedCsv)}>GOOSE Detailed CSV</button>
          <button className="menu-item" onClick={() => handleExportItem(onExportAllFlowsCsv)}>All Flows CSV</button>
          <button className="menu-item" onClick={() => handleExportItem(onExportProtocolSummaryCsv)}>Protocol Summary CSV</button>
          <button className="menu-item" onClick={() => handleExportItem(() => onExportExcelIp('all'))}>Excel: All sheets</button>
          <button className="menu-item" onClick={() => handleExportItem(() => onExportExcelIp('ip_only'))}>Excel: IP only</button>
          <button className="menu-item" onClick={() => handleExportItem(() => onExportExcelIp('signals_only'))}>Excel: Signals only</button>
          <button className="menu-item" onClick={() => handleExportItem(onExportLandsnetJson)}>Landsnet JSON</button>
        </div>,
        document.body,
      )
    : null;

  return (
    <header className="topbar-v2">
      <div className="topbar-left">
        <span className="topbar-logo">◆ SCD Visualizer</span>
      </div>

      <div className="topbar-center">
        {isCompareMode ? (
          <>
            <button
              className={`compare-file-chip compare-file-a ${compareViewFile === 'A' ? 'compare-file-active' : ''}`}
              title={baselineName || 'Old file (A)'}
              onClick={() => onViewCompareFile?.('A')}
            >
              <span className="compare-file-slot">A</span>
              <span className="compare-file-name">{baselineName ? (baselineName.length > 30 ? `…${baselineName.slice(-27)}` : baselineName) : 'Old file'}</span>
            </button>
            <span className="compare-file-arrow">⟷</span>
            <button
              className={`compare-file-chip compare-file-b ${compareViewFile === 'B' ? 'compare-file-active' : ''}`}
              title={newName || 'New file (B)'}
              onClick={() => onViewCompareFile?.('B')}
            >
              <span className="compare-file-slot">B</span>
              <span className="compare-file-name">{newName ? (newName.length > 30 ? `…${newName.slice(-27)}` : newName) : 'New file'}</span>
            </button>
          </>
        ) : (
          <>
            {hasFile ? (
              <Badge variant="accent" title={fileName}>
                {fileName.length > 40 ? `…${fileName.slice(-37)}` : fileName}
              </Badge>
            ) : (
              <Badge variant="default">No file loaded</Badge>
            )}
            {hasFile && fileType && (
              <span className="topbar-filetype-chip">{fileType}</span>
            )}
            {hasFile && (
              <span
                className={`topbar-lock-btn ${locked ? 'topbar-lock-btn-locked' : ''}`}
                title={locked ? 'Helinks-managed file — edit only in Helinks STS' : 'Not locked'}
              >
                {locked ? '🔒' : '🔓'}
              </span>
            )}
            {issueCount > 0 ? (
              <Badge variant="warn">
                {issueCount} issue{issueCount !== 1 ? 's' : ''}
              </Badge>
            ) : hasFile ? (
              <Badge variant="success">All checks passed</Badge>
            ) : null}
          </>
        )}
      </div>

      <div className="topbar-actions">
        {isCompareMode ? (
          <button className="btn" onClick={onExitCompare}>Exit Compare</button>
        ) : (
          <>
            <button className="btn" onClick={onCompare} disabled={!hasFile} title={hasFile ? 'Compare with another file' : 'Load a file first'}>
              Compare
            </button>
            <button className="btn btn-primary topbar-load-btn" onClick={onOpenFile}>
              Load File
            </button>
          </>
        )}
        <select
          className="input topbar-example-select"
          defaultValue=""
          onChange={(e) => {
            const value = e.target.value;
            if (!value) return;
            onLoadExample(value);
            e.target.value = '';
          }}
        >
          <option value="" disabled>Examples</option>
          {EXAMPLES.map((example) => (
            <option key={example.path} value={example.path}>
              {example.label}
            </option>
          ))}
        </select>

        <button ref={btnRef} className="btn" onClick={openMenu}>
          Export ▾
        </button>
        {menu}

        <button className="search-entry topbar-search" onClick={onOpenCommand}>
          <span>Search</span>
          <kbd>⌘K</kbd>
        </button>
      </div>
    </header>
  );
}
