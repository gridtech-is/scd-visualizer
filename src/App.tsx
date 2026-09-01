import { useEffect, useMemo, useRef, useState } from 'react';
import './styles.css';
import { parseSclDocument } from './parser/sclParser';
import type { ParseResult } from './parser/sclParser';
import { deserializeModel } from './workers/parseWorker';
import TopBar from './components/TopBar';
import { Button, Chip } from './components/ui';
import SubstationTree from './components/SubstationTree';
import GraphCanvas from './components/GraphCanvas';
import InspectorPanel from './components/InspectorPanel';
import CommandPalette from './components/CommandPalette';
import CompareBar from './components/CompareBar';
import CompareAssignDialog from './components/CompareAssignDialog';
import IssuesWorkspace from './components/IssuesWorkspace';
import StatisticsWorkspace from './components/StatisticsWorkspace';
import ChangesPanel from './components/ChangesPanel';
import NetworkVisualizerPanel from './components/NetworkVisualizerPanel';
import ValidationMatrix from './components/ValidationMatrix';
import AddressesTable from './components/AddressesTable';
import IedExplorer from './components/IedExplorer';
import SubscriptionMatrix from './components/SubscriptionMatrix';
import VersionPanel from './components/VersionPanel';
import SubstationDiagram from './components/SubstationDiagram';
import ThreePaneLayout from './components/ThreePaneLayout';
import { changesCsv, detailedFlowsCsv, gooseMatrixCsv, protocolSummaryCsv, validationCsv } from './utils/exportCsv';
import { downloadExcelIp, type ExportSheetsOption } from './utils/exportExcel';
import { landsnetJsonFiles } from './utils/exportLandsnetJson';
import { Toaster, useToast } from './components/ui/Toast';
import { deriveVisibleGraph } from './utils/graphVisibility';
import { UiStoreProvider, useUiStore } from './state/uiStore';
import { ValidationProvider, useValidationStore } from './state/validationStore';
import { useModelValidation } from './state/useModelValidation';
import { useSclFiles } from './state/useSclFiles';
import { useCompareState, type ChangeFilters } from './state/useCompareState';
import { buildDiffReport } from './diff/report';
import { buildReviewReportHtml, openReviewReportForPrint } from './utils/reviewReport';
import StartupScreen from './components/StartupScreen';
import DashboardWorkspace from './components/DashboardWorkspace';

export type AppMode =
  | 'dashboard'
  | 'visualizer'
  | 'network'
  | 'issues'
  | 'compare'
  | 'statistics'
  | 'addresses'
  | 'ied'
  | 'version'
  | 'sld';

export default function App(): JSX.Element {
  return (
    <UiStoreProvider>
      <ValidationProvider>
        <AppInner />
      </ValidationProvider>
    </UiStoreProvider>
  );
}

function AppInner(): JSX.Element {
  const [appMode, setAppMode] = useState<AppMode>('visualizer');
  const [graphSubView, setGraphSubView] = useState<'visualizer' | 'subscriptions'>('visualizer');
  const [commandOpen, setCommandOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [loadingMessage, setLoadingMessage] = useState('Parsing file…');
  const [fileSizeWarning, setFileSizeWarning] = useState<{ file: File; onResult: (result: ParseResult, name: string) => void; mb: string } | null>(null);
  const { toasts, showToast, dismiss } = useToast();

  const [rawXml, setRawXml] = useState<string>('');
  const [compareVariant, setCompareVariant] = useState<'single' | 'compare'>('single');
  const [showOnlyChanges, setShowOnlyChanges] = useState(false);
  const [selectedChangeId, setSelectedChangeId] = useState<string | null>(null);
  const [changeFilters, setChangeFilters] = useState<ChangeFilters>({ type: 'all', area: 'all', query: '' });

  const [waivedChecks, setWaivedChecks] = useState<Set<string>>(() => {
    try {
      const stored = localStorage.getItem('vm-waived-checks');
      return stored ? new Set(JSON.parse(stored) as string[]) : new Set<string>();
    } catch {
      return new Set<string>();
    }
  });

  function toggleWaive(code: string) {
    setWaivedChecks((prev) => {
      const next = new Set(prev);
      if (next.has(code)) next.delete(code);
      else next.add(code);
      localStorage.setItem('vm-waived-checks', JSON.stringify([...next]));
      return next;
    });
  }

  const [landsnetEnabled, setLandsnetEnabled] = useState<boolean>(() => {
    try {
      const stored = localStorage.getItem('vm-landsnet-enabled');
      return stored === null ? true : stored === 'true';
    } catch {
      return true;
    }
  });

  function toggleLandsnet() {
    setLandsnetEnabled((prev) => {
      const next = !prev;
      localStorage.setItem('vm-landsnet-enabled', String(next));
      return next;
    });
  }

  // Compare flow state
  const [assignDialog, setAssignDialog] = useState<{ fileName: string } | null>(null);
  const [pendingCompareSlot, setPendingCompareSlot] = useState<'A' | 'B' | null>(null);
  const [compareViewFile, setCompareViewFile] = useState<'A' | 'B' | null>(null);

  const [pendingCompareFirst, setPendingCompareFirst] = useState<{ result: import('./parser/sclParser').ParseResult; name: string } | null>(null);

  const fileInputRef = useRef<HTMLInputElement>(null);
  const baselineInputRef = useRef<HTMLInputElement>(null);
  const newInputRef = useRef<HTMLInputElement>(null);
  const compareSecondInputRef = useRef<HTMLInputElement>(null);
  const startupCompareInputRef = useRef<HTMLInputElement>(null);

  const { state: ui, dispatch } = useUiStore();
  const { state: vstate, dispatch: vdispatch } = useValidationStore();

  const {
    fileName,
    model,
    baselineModel,
    baselineName,
    newModel,
    newName,
    error,
    applyParsedMain,
    applyParsedBaseline,
    applyParsedNew,
  } = useSclFiles(dispatch);

  const fileType = useMemo(() => {
    if (!fileName) return undefined;
    const ext = fileName.split('.').pop()?.toLowerCase();
    const map: Record<string, string> = { scd: 'SCD', cid: 'CID', icd: 'ICD', iid: 'IID', ssd: 'SSD', xml: 'XML' };
    return ext ? (map[ext] ?? 'SCL') : undefined;
  }, [fileName]);

  const isCompareMode = appMode === 'compare' || compareViewFile !== null;
  const activeModel =
    compareViewFile === 'A' ? baselineModel :
    compareViewFile === 'B' ? newModel :
    appMode === 'compare' && compareVariant === 'compare' ? newModel :
    model;
  const locked = activeModel?.header?.helinksLocked ?? false;
  const landsnetReport = useModelValidation(activeModel, vdispatch, rawXml);

  const visibleBase = useMemo(() => deriveVisibleGraph(activeModel, ui), [activeModel, ui]);
  const { diff, selectedChange, compareChanges } = useCompareState({
    baselineModel,
    newModel,
    compareVariant,
    showOnlyChanges,
    selectedChangeId,
  });

  const visible = useMemo(() => {
    if (!activeModel) {
      return visibleBase;
    }
    if (visibleBase.visibleIeds.length > 0) {
      return visibleBase;
    }
    const fallbackIed = activeModel.ieds[0];
    if (!fallbackIed) {
      return visibleBase;
    }
    const fallbackEdges = activeModel.edges.filter(
      (edge) => edge.publisherIed === fallbackIed.name || edge.subscriberIed === fallbackIed.name,
    );
    return {
      ...visibleBase,
      visibleIeds: [fallbackIed],
      visibleEdges: fallbackEdges,
    };
  }, [activeModel, visibleBase]);

  const filteredIssues = useMemo(() => {
    return vstate.issues.filter((i) => {
      const parts = i.code.split('_');
      const baseCode = parts.length >= 2 ? `${parts[0]}_${parts[1]}` : i.code;
      if (!landsnetEnabled && baseCode.startsWith('LNET_')) return false;
      return !waivedChecks.has(baseCode);
    });
  }, [vstate.issues, waivedChecks, landsnetEnabled]);
  const stableIssues = filteredIssues;

  const [pendingLastSession, setPendingLastSession] = useState<{ fileName: string; ieds: number; ts: number } | null>(null);
  const latestIssuesCountRef = useRef<number>(0);
  useEffect(() => {
    latestIssuesCountRef.current = stableIssues.length;
  }, [stableIssues.length]);

  useEffect(() => {
    if (!pendingLastSession) return;
    const id = window.setTimeout(() => {
      try {
        localStorage.setItem(
          'vm-last-session',
          JSON.stringify({
            fileName: pendingLastSession.fileName,
            ieds: pendingLastSession.ieds,
            issues: latestIssuesCountRef.current,
            ts: pendingLastSession.ts,
          }),
        );
      } catch {
        // Ignore localStorage errors (quota / private mode)
      } finally {
        setPendingLastSession(null);
      }
    }, 800);
    return () => window.clearTimeout(id);
  }, [pendingLastSession]);

  useEffect(() => {
    function onKeyDown(event: KeyboardEvent) {
      const isCmdK = (event.metaKey || event.ctrlKey) && event.key.toLowerCase() === 'k';
      if (!isCmdK) {
        return;
      }
      event.preventDefault();
      setCommandOpen((v) => !v);
    }
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, []);

  useEffect(() => {
    if (!activeModel) {
      return;
    }
    const hasValidFocus = Boolean(ui.focusIedId && activeModel.ieds.some((ied) => ied.name === ui.focusIedId));
    if (hasValidFocus) {
      return;
    }
    const first = activeModel.ieds[0]?.name ?? null;
    dispatch({ type: 'set-focus', payload: first });
    if (first) {
      dispatch({ type: 'set-selected', payload: { type: 'ied', id: `ied:${first}` } });
      dispatch({ type: 'request-fit' });
    }
  }, [activeModel, ui.focusIedId, dispatch]);

  useEffect(() => {
    if (!activeModel) {
      return;
    }
    const noVisibleGraph = visibleBase.visibleIeds.length === 0 && visibleBase.visibleEdges.length === 0;
    if (!noVisibleGraph) {
      return;
    }
    if (!ui.hideIsolated || ui.searchQuery.trim().length > 0) {
      return;
    }
    if (activeModel.edges.length > 0) {
      dispatch({ type: 'set-hide-isolated', payload: false });
    }
  }, [
    activeModel,
    visibleBase.visibleIeds.length,
    visibleBase.visibleEdges.length,
    ui.hideIsolated,
    ui.searchQuery,
    dispatch,
  ]);

  async function loadExample(path: string): Promise<void> {
    const res = await fetch(path);
    const text = await res.text();
    const result = parseSclDocument(text);
    applyParsedMain(result, path.split('/').pop() || path);
    if (result.model) {
      setPendingLastSession({ fileName: path.split('/').pop() || path, ieds: result.model.ieds.length, ts: Date.now() });
      setAppMode('dashboard');
    }
  }

  const FILE_SIZE_WARN_BYTES = 50 * 1024 * 1024; // 50 MB

  function doReadFile(file: File, onResult: (result: ParseResult, name: string) => void): void {
    setLoading(true);
    setLoadingMessage('Reading file…');

    const reader = new FileReader();
    reader.onload = () => {
      const xml = String(reader.result);
      setLoadingMessage('Parsing…');

      const worker = new Worker(new URL('./workers/parseWorker.ts', import.meta.url), { type: 'module' });

      worker.onmessage = (event: MessageEvent) => {
        const msg = event.data as
          | { type: 'progress'; ieds: number }
          | { type: 'result'; result: { model: Parameters<typeof deserializeModel>[0]; name: string } }
          | { type: 'error'; message: string };

        if (msg.type === 'progress') {
          setLoadingMessage(`Parsing… ${msg.ieds} IEDs found`);
          return;
        }

        if (msg.type === 'result') {
          worker.terminate();
          try {
            const model = deserializeModel(msg.result.model);
            setRawXml(xml);
            onResult({ model }, msg.result.name);
          } catch (err) {
            const errMsg = err instanceof Error ? err.message : 'Deserialize failed';
            showToast(errMsg);
          } finally {
            setLoading(false);
          }
          return;
        }

        if (msg.type === 'error') {
          worker.terminate();
          // DOMParser is unavailable in Web Workers on Safari < 15.4 — fall back to main-thread parse
          if (msg.message.includes('DOMParser')) {
            setLoadingMessage('Parsing…');
            setTimeout(() => {
              try {
                const result = parseSclDocument(xml);
                setRawXml(xml);
                onResult(result, file.name);
              } catch (err) {
                showToast(`Parse error: ${err instanceof Error ? err.message : String(err)}`);
              } finally {
                setLoading(false);
              }
            }, 0);
          } else {
            showToast(`Parse error: ${msg.message}`);
            setLoading(false);
          }
        }
      };

      worker.onerror = (err) => {
        worker.terminate();
        // Same fallback for onerror (e.g. worker script fails to load on some browsers)
        if (err.message?.includes('DOMParser')) {
          setLoadingMessage('Parsing…');
          setTimeout(() => {
            try {
              const result = parseSclDocument(xml);
              onResult(result, file.name);
            } catch (parseErr) {
              showToast(`Parse error: ${parseErr instanceof Error ? parseErr.message : String(parseErr)}`);
            } finally {
              setLoading(false);
            }
          }, 0);
        } else {
          showToast(`Worker error: ${err.message}`);
          setLoading(false);
        }
      };

      worker.postMessage({ type: 'parse', xml, name: file.name });
    };
    reader.onerror = () => {
      showToast('Failed to read file');
      setLoading(false);
    };
    reader.readAsText(file);
  }

  function readFile(file: File, onResult: (result: ParseResult, name: string) => void): void {
    if (file.size > FILE_SIZE_WARN_BYTES) {
      const mb = (file.size / (1024 * 1024)).toFixed(1);
      setFileSizeWarning({ file, onResult, mb });
      return;
    }
    doReadFile(file, onResult);
  }

  function exportBlob(content: string, file: string, mime = 'text/plain;charset=utf-8;'): void {
    const blob = new Blob([content], { type: mime });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement('a');
    anchor.href = url;
    anchor.download = file;
    document.body.append(anchor);
    anchor.click();
    anchor.remove();
    URL.revokeObjectURL(url);
    showToast(`Exported ${file}`);
  }

  function exportGoose(): void {
    if (!activeModel) {
      return;
    }
    exportBlob(gooseMatrixCsv(activeModel.edges), `goose-matrix-${fileName || 'scl'}.csv`, 'text/csv;charset=utf-8;');
  }

  function exportGooseDetailed(): void {
    if (!activeModel) {
      return;
    }
    exportBlob(
      detailedFlowsCsv(activeModel, 'GOOSE'),
      `goose-detailed-${fileName || 'scl'}.csv`,
      'text/csv;charset=utf-8;',
    );
  }

  function exportAllFlows(): void {
    if (!activeModel) {
      return;
    }
    exportBlob(
      detailedFlowsCsv(activeModel, 'ALL'),
      `flows-all-${fileName || 'scl'}.csv`,
      'text/csv;charset=utf-8;',
    );
  }

  function exportProtocolSummary(): void {
    if (!activeModel) {
      return;
    }
    exportBlob(
      protocolSummaryCsv(activeModel),
      `protocol-summary-${fileName || 'scl'}.csv`,
      'text/csv;charset=utf-8;',
    );
  }

  function exportPdfReport(): void {
    if (!activeModel || !landsnetReport) {
      return;
    }
    const schemaCount = stableIssues.filter((i) => i.code.startsWith('SCL_XSD_001')).length;
    const checks = [
      { id: -1, code: 'SCL_XSD', title: 'XML Schema (IEC 61850-6 SCL)', passed: schemaCount === 0, issueCount: schemaCount },
      ...landsnetReport.checks.filter((c) => landsnetEnabled || !c.code.startsWith('LNET_')),
    ];
    const html = buildReviewReportHtml({
      fileName: fileName || 'untitled.scd',
      stationName: activeModel.substations[0]?.desc || activeModel.substations[0]?.name,
      counts: {
        ieds: activeModel.ieds.length,
        goose: activeModel.gseControls.length,
        sv: activeModel.svControls.length,
        reports: activeModel.reportControls.length,
      },
      checks,
      issues: stableIssues,
    });
    if (!openReviewReportForPrint(html)) {
      showToast('Popup blocked — allow popups to export the PDF report');
    }
  }

  function exportLandsnetJson(): void {
    if (!landsnetReport) {
      return;
    }
    const files = landsnetJsonFiles(landsnetReport);
    files.forEach((file, index) => {
      window.setTimeout(() => {
        exportBlob(file.content, file.fileName, file.mime);
      }, index * 80);
    });
  }

  function exportExcelIp(sheetsOption: ExportSheetsOption = 'all'): void {
    if (!activeModel) {
      return;
    }
    const baseName = (fileName || 'scl').replace(/\.(scd|xml|cid|icd)$/i, '');
    downloadExcelIp(activeModel, fileName || 'scl', sheetsOption);
    showToast(`Exported ${baseName}-export.xlsx`);
  }

  const selectedIedName = ui.selectedEntity.type === 'ied'
    ? ui.selectedEntity.id.replace('ied:', '')
    : ui.focusIedId ?? undefined;

  function selectIed(iedName: string) {
    dispatch({ type: 'set-selected', payload: { type: 'ied', id: `ied:${iedName}` } });
    dispatch({ type: 'set-focus', payload: iedName });
    dispatch({ type: 'request-fit' });
  }

  function filterEdgesByPair(publisherIed: string, subscriberIed: string) {
    dispatch({ type: 'set-ied-filter', payload: [publisherIed, subscriberIed] });
    setGraphSubView('visualizer');
  }

  const centerViewItems: Array<{ id: typeof appMode; label: string; icon: string }> = [
    { id: 'dashboard', label: 'Dashboard', icon: '◈' },
    { id: 'visualizer', label: 'Graph', icon: '⬡' },
    { id: 'issues', label: 'Validation', icon: '✓' },
    { id: 'network', label: 'Network', icon: '⋯' },
    { id: 'statistics', label: 'Statistics', icon: '≡' },
    { id: 'addresses', label: 'Addresses', icon: '⊞' },
    { id: 'ied', label: 'IED', icon: '◈' },
    { id: 'version', label: 'Version', icon: '◑' },
    { id: 'sld', label: 'Single Line', icon: '⏚' },
  ];

  function handleCompareClick() {
    if (model && fileName) {
      setAssignDialog({ fileName });
    }
  }

  function handleAssign(slot: 'A' | 'B') {
    const source = pendingCompareFirst ?? (model && fileName ? { result: { model }, name: fileName } : null);
    if (!source) return;
    setAssignDialog(null);
    setPendingCompareFirst(null);
    if (slot === 'A') {
      applyParsedBaseline(source.result, source.name, () => setSelectedChangeId(null));
      setPendingCompareSlot('B');
    } else {
      applyParsedNew(source.result, source.name, () => setSelectedChangeId(null));
      setPendingCompareSlot('A');
    }
    compareSecondInputRef.current?.click();
  }

  function handleViewCompareFile(which: 'A' | 'B') {
    setCompareViewFile(which);
    if (appMode === 'compare') setAppMode('visualizer');
  }

  function handleExitCompare() {
    setCompareViewFile(null);
    setCompareVariant('single');
    setAppMode('visualizer');
  }

  // canvas tabs keep sidebars; report tabs auto-collapse them
  // Network has its own internal ThreePaneLayout so outer sidebars waste space
  const isReportTab = appMode === 'issues' || appMode === 'compare' || appMode === 'statistics' || appMode === 'dashboard' || appMode === 'network' || appMode === 'addresses' || appMode === 'ied' || appMode === 'version' || appMode === 'sld';

  return (
    <div className="app-shell-v2">
      <input
        ref={fileInputRef}
        type="file"
        accept=".scd,.xml,.cid,.icd"
        hidden
        onChange={(e) => {
          const file = e.target.files?.[0];
          if (file) {
            readFile(file, (result, name) => {
              applyParsedMain(result, name);
              if (result.model) {
                setPendingLastSession({ fileName: name, ieds: result.model.ieds.length, ts: Date.now() });
                setAppMode('dashboard');
              }
            });
          }
        }}
      />
      <input
        ref={baselineInputRef}
        type="file"
        accept=".scd,.xml,.cid,.icd"
        hidden
        onChange={(e) => {
          const file = e.target.files?.[0];
          if (file) {
            readFile(file, (result, name) => applyParsedBaseline(result, name, () => setSelectedChangeId(null)));
          }
        }}
      />
      <input
        ref={newInputRef}
        type="file"
        accept=".scd,.xml,.cid,.icd"
        hidden
        onChange={(e) => {
          const file = e.target.files?.[0];
          if (file) {
            readFile(file, (result, name) => applyParsedNew(result, name, () => setSelectedChangeId(null)));
          }
        }}
      />
      {/* Second file for compare flow */}
      <input
        ref={compareSecondInputRef}
        type="file"
        accept=".scd,.xml,.cid,.icd"
        hidden
        onChange={(e) => {
          const file = e.target.files?.[0];
          if (!file) return;
          const slot = pendingCompareSlot;
          setPendingCompareSlot(null);
          readFile(file, (result, name) => {
            if (slot === 'B') {
              applyParsedNew(result, name, () => setSelectedChangeId(null));
            } else {
              applyParsedBaseline(result, name, () => setSelectedChangeId(null));
            }
            setCompareVariant('compare');
            setCompareViewFile(null);
            setAppMode('compare');
          });
        }}
      />

      <TopBar
        appMode={appMode}
        issueCount={filteredIssues.length}
        fileName={fileName}
        fileType={fileType}
        locked={locked}
        onSetAppMode={(mode) => {
          if (mode === 'issues') vdispatch({ type: 'set-validation-sub-view', payload: 'matrix' });
          setAppMode(mode);
        }}
        onOpenFile={() => fileInputRef.current?.click()}
        onLoadExample={(path) => void loadExample(path)}
        onOpenCommand={() => setCommandOpen(true)}
        onExportGooseCsv={exportGoose}
        onExportGooseDetailedCsv={exportGooseDetailed}
        onExportAllFlowsCsv={exportAllFlows}
        onExportProtocolSummaryCsv={exportProtocolSummary}
        onExportLandsnetJson={exportLandsnetJson}
        onExportPdfReport={exportPdfReport}
        onExportExcelIp={exportExcelIp}
        isCompareMode={isCompareMode}
        baselineName={baselineName}
        newName={newName}
        compareViewFile={compareViewFile}
        onCompare={handleCompareClick}
        onViewCompareFile={handleViewCompareFile}
        onExitCompare={handleExitCompare}
      />
      {assignDialog && (
        <CompareAssignDialog
          fileName={assignDialog.fileName}
          onAssign={handleAssign}
          onCancel={() => setAssignDialog(null)}
        />
      )}

      {/* Startup compare file input */}
      <input
        ref={startupCompareInputRef}
        type="file"
        accept=".scd,.xml,.cid,.icd"
        hidden
        onChange={(e) => {
          const file = e.target.files?.[0];
          if (!file) return;
          readFile(file, (result, name) => {
            setPendingCompareFirst({ result, name });
            setAssignDialog({ fileName: name });
          });
          e.target.value = '';
        }}
      />

      {!model && !error ? (
        <StartupScreen
          onLoadFile={() => fileInputRef.current?.click()}
          onLoadCompare={() => startupCompareInputRef.current?.click()}
          onLoadExample={(path) => void loadExample(path)}
          onDropFile={(file) => {
            readFile(file, (result, name) => {
              applyParsedMain(result, name);
              if (result.model) {
                setPendingLastSession({ fileName: name, ieds: result.model.ieds.length, ts: Date.now() });
                setAppMode('dashboard');
              }
            });
          }}
        />
      ) : (
        <div className="app-main">
          {error ? (
            <section className="error-box">
              <h2>Parsing error</h2>
              <p>{error.message}</p>
              {error.line ? (
                <p>Line: {error.line} {error.column ? `Column: ${error.column}` : ''}</p>
              ) : null}
              <div className="error-actions">
                <Button onClick={() => fileInputRef.current?.click()}>Load another file</Button>
              </div>
            </section>
          ) : null}

          <div className="visualizer-view">
            <ThreePaneLayout
              storageKey="v2-main"
              collapseKey={appMode}
              autoCollapse={isReportTab}
              leftIcon="❖"
              rightIcon="ℹ"
              left={(
                <SubstationTree
                  substations={activeModel?.substations ?? []}
                  ieds={activeModel?.ieds ?? []}
                  issues={stableIssues}
                  selectedIedName={selectedIedName}
                  onSelectIed={selectIed}
                />
              )}
              center={(
                <div className="center-panel-wrap">
                  {/* Compare: viewing A or B */}
                  {compareViewFile && (
                    <div className="compare-view-banner">
                      <span className={`compare-view-badge compare-view-badge-${compareViewFile.toLowerCase()}`}>
                        {compareViewFile === 'A' ? 'A — Old file' : 'B — New file'}
                      </span>
                      <span className="compare-view-name">
                        {compareViewFile === 'A' ? (baselineName || '') : (newName || '')}
                      </span>
                      <button className="btn compare-view-back" onClick={() => { setCompareViewFile(null); setAppMode('compare'); }}>
                        ← Back to diff
                      </button>
                    </div>
                  )}
                  {/* View switcher */}
                  <div className="center-view-bar">
                    {centerViewItems.map((item) => (
                      <button
                        key={item.id}
                        className={`center-view-btn ${appMode === item.id ? 'active' : ''}`}
                        onClick={() => setAppMode(item.id)}
                        title={item.label}
                      >
                        <span className="center-view-icon">{item.icon}</span>
                        {item.label}
                      </button>
                    ))}
                  </div>

                  {/* Graph view */}
                  {appMode === 'visualizer' ? (
                    <>
                      <div className="validation-view-tabs" style={{ display: 'flex', gap: 4, padding: '4px 8px', borderBottom: '1px solid var(--line)', flexShrink: 0 }}>
                        <button
                          className={`center-view-btn ${graphSubView === 'visualizer' ? 'active' : ''}`}
                          onClick={() => setGraphSubView('visualizer')}
                        >Flow graph</button>
                        <button
                          className={`center-view-btn ${graphSubView === 'subscriptions' ? 'active' : ''}`}
                          onClick={() => setGraphSubView('subscriptions')}
                        >Subscriptions</button>
                      </div>
                      {graphSubView === 'visualizer' ? (
                        <>
                          <section className="filter-strip">
                            <details className="ied-filter-dropdown" data-state={ui.iedFilter === 'all' ? 'all' : 'some'}>
                              <summary className="ied-filter-summary" title="Filter by IED">
                                {ui.iedFilter === 'all' ? 'IEDs: All' : `IEDs: ${ui.iedFilter.length} selected`}
                              </summary>
                              <div className="ied-filter-list" role="group" aria-label="Select IEDs">
                                <label className="ied-filter-option">
                                  <input
                                    type="checkbox"
                                    checked={ui.iedFilter === 'all'}
                                    onChange={(e) => {
                                      dispatch({ type: 'set-ied-filter', payload: e.target.checked ? 'all' : [] });
                                    }}
                                  />
                                  <span>All IEDs</span>
                                </label>
                                {(activeModel?.ieds ?? []).map((ied) => {
                                  const isChecked = ui.iedFilter === 'all' || ui.iedFilter.includes(ied.name);
                                  return (
                                    <label key={ied.name} className="ied-filter-option">
                                      <input
                                        type="checkbox"
                                        checked={isChecked}
                                        onChange={(e) => {
                                          if (e.target.checked) {
                                            const next = ui.iedFilter === 'all'
                                              ? (activeModel?.ieds ?? []).map((i) => i.name)
                                              : [...ui.iedFilter, ied.name];
                                            dispatch({ type: 'set-ied-filter', payload: next });
                                          } else {
                                            const next = ui.iedFilter === 'all'
                                              ? (activeModel?.ieds ?? []).filter((i) => i.name !== ied.name).map((i) => i.name)
                                              : ui.iedFilter.filter((n) => n !== ied.name);
                                            dispatch({ type: 'set-ied-filter', payload: next });
                                          }
                                        }}
                                      />
                                      <span>{ied.name}</span>
                                    </label>
                                  );
                                })}
                              </div>
                            </details>
                            <div className="chip-group">
                              <Chip active={ui.protocolFilter.GOOSE} onClick={() => dispatch({ type: 'toggle-protocol', payload: 'GOOSE' })}>GOOSE</Chip>
                              <Chip active={ui.protocolFilter.SV} onClick={() => dispatch({ type: 'toggle-protocol', payload: 'SV' })}>SV</Chip>
                              <Chip active={ui.protocolFilter.REPORT} onClick={() => dispatch({ type: 'toggle-protocol', payload: 'REPORT' })}>REPORT</Chip>
                            </div>
                            <input
                              className="input"
                              value={ui.searchQuery}
                              placeholder="Filter IED/LN/DataSet/Control..."
                              onChange={(e) => dispatch({ type: 'set-search', payload: e.target.value })}
                            />
                            <select
                              className="input"
                              value={ui.directionFilter}
                              onChange={(e) => dispatch({ type: 'set-direction', payload: e.target.value as typeof ui.directionFilter })}
                            >
                              <option value="both">Dir: both</option>
                              <option value="incoming">Dir: in</option>
                              <option value="outgoing">Dir: out</option>
                            </select>
                            <select
                              className="input"
                              value={ui.resolutionFilter}
                              onChange={(e) => dispatch({ type: 'set-resolution', payload: e.target.value as typeof ui.resolutionFilter })}
                            >
                              <option value="all">Res: all</option>
                              <option value="resolved">Res: resolved</option>
                              <option value="unresolved">Res: unresolved</option>
                            </select>
                            <select
                              className="input"
                              value={String(ui.neighborDepth)}
                              onChange={(e) => {
                                const value = e.target.value;
                                dispatch({ type: 'set-neighbor-depth', payload: value === 'all' ? 'all' : Number(value) as 1 | 2 });
                              }}
                            >
                              <option value="1">Depth: 1</option>
                              <option value="2">Depth: 2</option>
                              <option value="all">Depth: all</option>
                            </select>
                            <label className="toggle-check">
                              <input
                                type="checkbox"
                                checked={ui.hideIsolated}
                                onChange={(e) => dispatch({ type: 'set-hide-isolated', payload: e.target.checked })}
                              />
                              Hide isolated
                            </label>
                          </section>
                          <GraphCanvas
                            ieds={visible.visibleIeds}
                            edges={visible.visibleEdges}
                            focusIedId={ui.focusIedId}
                            selectedEntity={ui.selectedEntity}
                            fitToken={ui.fitToken}
                            layoutCacheKey={fileName || 'single'}
                            filtersSnapshot={{
                              appMode,
                              protocolFilter: ui.protocolFilter,
                              directionFilter: ui.directionFilter,
                              resolutionFilter: ui.resolutionFilter,
                              neighborDepth: ui.neighborDepth,
                              hideIsolated: ui.hideIsolated,
                              searchQuery: ui.searchQuery,
                            }}
                            onSelectNode={(iedName) => {
                              dispatch({ type: 'set-focus', payload: iedName });
                              dispatch({ type: 'set-selected', payload: { type: 'ied', id: `ied:${iedName}` } });
                            }}
                            onSelectEdge={(edge) => {
                              dispatch({ type: 'set-selected', payload: { type: 'edge', id: edge.key } });
                              dispatch({ type: 'set-focus', payload: edge.publisherIed });
                            }}
                          />
                        </>
                      ) : (
                        <SubscriptionMatrix
                          edges={activeModel?.edges ?? []}
                          ieds={activeModel?.ieds ?? []}
                          onFilterEdges={filterEdgesByPair}
                        />
                      )}
                    </>
                  ) : null}

                  {/* Dashboard */}
                  {appMode === 'dashboard' ? (
                    <DashboardWorkspace
                      model={activeModel}
                      issues={stableIssues}
                      fileName={fileName}
                      onNavigate={(mode) => {
                        if (mode === 'issues') vdispatch({ type: 'set-validation-sub-view', payload: 'matrix' });
                        setAppMode(mode);
                      }}
                    />
                  ) : null}

                  {/* Validation / Issues view */}
                  {appMode === 'issues' ? (
                    <div style={{ flex: '1 1 0', minHeight: 0, overflow: 'hidden', display: 'flex', flexDirection: 'column' }}>
                      <div className="validation-view-tabs" style={{ display: 'flex', gap: 4, padding: '4px 8px', borderBottom: '1px solid var(--line)', flexShrink: 0 }}>
                        <button
                          className={`center-view-btn ${vstate.validationSubView === 'matrix' ? 'active' : ''}`}
                          onClick={() => vdispatch({ type: 'set-validation-sub-view', payload: 'matrix' })}
                        >Matrix</button>
                        <button
                          className={`center-view-btn ${vstate.validationSubView !== 'matrix' ? 'active' : ''}`}
                          onClick={() => vdispatch({ type: 'set-validation-sub-view', payload: 'list' })}
                        >Issues list</button>
                      </div>
                      {vstate.validationSubView === 'matrix' && activeModel ? (
                        <ValidationMatrix
                          model={activeModel}
                          landsnetReport={landsnetReport}
                          schemaIssues={filteredIssues.filter(i => i.code.startsWith('SCL_XSD'))}
                          selectedIedName={selectedIedName}
                          onSelectIed={selectIed}
                          waivedChecks={waivedChecks}
                          onToggleWaive={toggleWaive}
                          landsnetEnabled={landsnetEnabled}
                          onToggleLandsnet={toggleLandsnet}
                          onDrillDown={(code) => {
                            vdispatch({ type: 'set-filter', payload: { query: code } });
                            vdispatch({ type: 'set-validation-sub-view', payload: 'list' });
                          }}
                        />
                      ) : (
                        <IssuesWorkspace
                          issues={filteredIssues}
                          selectedIssueId={vstate.selectedIssueId}
                          filters={vstate.filters}
                          onFilterChange={(next) => vdispatch({ type: 'set-filter', payload: next })}
                          onSelectIssue={(id) => {
                            vdispatch({ type: 'select-issue', payload: id });
                            const issue = filteredIssues.find((i) => i.id === id);
                            const iedName = issue?.entityRef.iedName || issue?.context.iedName;
                            if (iedName) {
                              dispatch({ type: 'set-focus', payload: iedName });
                              dispatch({ type: 'set-selected', payload: { type: 'ied', id: `ied:${iedName}` } });
                            }
                          }}
                          onOpenInGraph={(id) => {
                            const issue = filteredIssues.find((i) => i.id === id);
                            const iedName = issue?.entityRef.iedName || issue?.context.iedName;
                            if (!iedName) return;
                            dispatch({ type: 'set-focus', payload: iedName });
                            dispatch({ type: 'set-selected', payload: { type: 'ied', id: `ied:${iedName}` } });
                            dispatch({ type: 'request-fit' });
                            setAppMode('visualizer');
                          }}
                          onExportJson={() => exportBlob(JSON.stringify(filteredIssues, null, 2), 'validation-report.json', 'application/json')}
                          onExportCsv={() => exportBlob(validationCsv(filteredIssues), 'validation-report.csv', 'text/csv;charset=utf-8;')}
                          onExportLandsnetJson={exportLandsnetJson}
                          onShowToast={showToast}
                        />
                      )}
                    </div>
                  ) : null}

                  {/* Compare view */}
                  {appMode === 'compare' ? (
                    <div style={{ flex: '1 1 0', minHeight: 0, overflow: 'hidden', display: 'flex', flexDirection: 'column' }}>
                      <CompareBar
                        mode={compareVariant}
                        baselineName={baselineName}
                        newName={newName}
                        onModeChange={setCompareVariant}
                        onLoadBaseline={() => baselineInputRef.current?.click()}
                        onLoadNew={() => newInputRef.current?.click()}
                        showOnlyChanges={showOnlyChanges}
                        onToggleShowOnlyChanges={setShowOnlyChanges}
                      />
                      <section className="panel canvas-panel" style={{ flex: '1 1 0', minHeight: 0, overflow: 'hidden' }}>
                        <ChangesPanel
                          changes={compareChanges}
                          selectedIedName={ui.focusIedId}
                          selectedChangeId={selectedChangeId}
                          filters={changeFilters}
                          onFilterChange={(next) => setChangeFilters((prev) => ({ ...prev, ...next }))}
                          onSelectChange={(id) => {
                            setSelectedChangeId(id);
                            const change = diff.changes.find((c) => c.id === id);
                            if (change?.iedName) {
                              dispatch({ type: 'set-focus', payload: change.iedName });
                              dispatch({ type: 'set-selected', payload: { type: 'ied', id: `ied:${change.iedName}` } });
                            }
                          }}
                          onExportJson={() => exportBlob(JSON.stringify(buildDiffReport(diff), null, 2), 'changes-report.json', 'application/json')}
                          onExportCsv={() => exportBlob(changesCsv(diff.changes), 'changes.csv', 'text/csv;charset=utf-8;')}
                        />
                      </section>
                    </div>
                  ) : null}

                  {/* Network view */}
                  {appMode === 'network' ? (
                    <NetworkVisualizerPanel
                      model={activeModel}
                      fileName={fileName}
                      onExportBlob={exportBlob}
                    />
                  ) : null}

                  {/* Statistics view */}
                  {appMode === 'statistics' ? (
                    <StatisticsWorkspace model={activeModel ?? undefined} />
                  ) : null}

                  {/* Addresses view */}
                  {appMode === 'addresses' && activeModel ? (
                    <AddressesTable model={activeModel} />
                  ) : appMode === 'addresses' ? (
                    <div style={{ padding: 24 }}><p className="hint">Load an SCD file to view addresses.</p></div>
                  ) : null}

                  {/* IED Explorer */}
                  {appMode === 'ied' && activeModel ? (
                    <IedExplorer model={activeModel} />
                  ) : appMode === 'ied' ? (
                    <div style={{ padding: 24 }}><p className="hint">Load an SCD file to explore IEDs.</p></div>
                  ) : null}

                  {/* Version / History */}
                  {appMode === 'version' ? (
                    <VersionPanel
                      header={activeModel?.header}
                      fileName={compareViewFile === 'A' ? baselineName : compareViewFile === 'B' ? newName : fileName}
                      fileType={fileType}
                    />
                  ) : null}

                  {/* Single Line Diagram */}
                  {appMode === 'sld' ? (
                    <SubstationDiagram model={activeModel ?? null} />
                  ) : null}
                </div>
              )}
              right={<InspectorPanel model={activeModel} baselineModel={appMode === 'compare' ? baselineModel : undefined} selectedEntity={ui.selectedEntity} selectedChange={appMode === 'compare' ? selectedChange : undefined} onShowToast={showToast} />}
            />
          </div>
        </div>
      )}

      <CommandPalette
        open={commandOpen}
        onOpenChange={setCommandOpen}
        model={activeModel}
        onSelectItem={(item) => {
          dispatch({ type: 'set-selected', payload: { type: item.type, id: item.id, label: item.label } });
          if (item.focusIed) {
            dispatch({ type: 'set-focus', payload: item.focusIed });
          }
          dispatch({ type: 'request-fit' });
        }}
      />

      {fileSizeWarning && (
        <div className="file-size-warning-banner" role="alert">
          <span>This file is {fileSizeWarning.mb} MB and may be slow to load.</span>
          <button
            className="btn btn-primary"
            onClick={() => {
              const { file, onResult } = fileSizeWarning;
              setFileSizeWarning(null);
              doReadFile(file, onResult);
            }}
          >
            Load anyway
          </button>
          <button
            className="btn"
            onClick={() => setFileSizeWarning(null)}
          >
            Cancel
          </button>
        </div>
      )}

      {loading && (
        <div className="loading-overlay" role="status" aria-label="Parsing file">
          <div className="loading-card">
            <div className="loading-spinner" aria-hidden="true" />
            <p>{loadingMessage}</p>
          </div>
        </div>
      )}

      <Toaster toasts={toasts} onDismiss={dismiss} />
    </div>
  );
}
