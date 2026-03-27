import { useEffect, useMemo, useState } from 'react';

type LastSession = { fileName: string; ieds: number; issues: number; ts: number };

export interface StartupScreenProps {
  onLoadFile: () => void;
  onLoadCompare: () => void;
  onLoadExample: (path: string) => void;
  onDropFile: (file: File) => void;
  lastSession?: LastSession;
}

function clamp(n: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, n));
}

function formatRecentSubtitle(ts: number): string {
  const days = Math.floor((Date.now() - ts) / (24 * 60 * 60 * 1000));
  if (days <= 0) return 'Today';
  if (days === 1) return 'Yesterday';
  return `${days} days ago`;
}

function hexagonPoints(cx: number, cy: number, size: number): string {
  // Flat-topped hexagon
  const r = size;
  const angles = [0, 60, 120, 180, 240, 300].map((deg) => (deg * Math.PI) / 180);
  const pts = angles.map((a) => `${(cx + Math.cos(a) * r).toFixed(1)},${(cy + Math.sin(a) * r).toFixed(1)}`);
  return pts.join(' ');
}

export default function StartupScreen({
  onLoadFile,
  onLoadCompare,
  onLoadExample,
  onDropFile,
  lastSession,
}: StartupScreenProps): JSX.Element {
  const [isDragging, setIsDragging] = useState(false);
  const [recentSession, setRecentSession] = useState<LastSession | null>(null);

  useEffect(() => {
    try {
      const raw = lastSession ?? localStorage.getItem('vm-last-session');
      if (!raw) return;

      const parsed = typeof raw === 'string' ? (JSON.parse(raw) as LastSession) : (raw as LastSession);
      if (!parsed?.ts || !parsed.fileName) return;

      const ageDays = (Date.now() - parsed.ts) / (24 * 60 * 60 * 1000);
      if (ageDays < 30) setRecentSession(parsed);
    } catch {
      // Ignore malformed stored session
    }
  }, [lastSession]);

  const subtitle = useMemo(() => {
    if (!recentSession) return '';
    return formatRecentSubtitle(recentSession.ts);
  }, [recentSession]);

  // Fixed scatter layout for hex nodes (viewBox coordinates)
  const hexes = useMemo(
    () => [
      { x: 140, y: 120 },
      { x: 260, y: 70 },
      { x: 410, y: 140 },
      { x: 560, y: 90 },
      { x: 710, y: 150 },
      { x: 860, y: 95 },
      { x: 180, y: 300 },
      { x: 360, y: 430 },
      { x: 640, y: 430 },
      { x: 860, y: 355 },
    ],
    [],
  );

  const connections = useMemo(() => {
    const out: Array<[number, number]> = [];
    for (let i = 0; i < hexes.length; i += 1) {
      for (let j = i + 1; j < hexes.length; j += 1) {
        const dx = hexes[i].x - hexes[j].x;
        const dy = hexes[i].y - hexes[j].y;
        const dist = Math.sqrt(dx * dx + dy * dy);
        if (dist < 300) out.push([i, j]);
      }
    }
    return out;
  }, [hexes]);

  const pulses = useMemo(
    () => [
      // 3 x GOOSE
      { from: 0, to: 2, colorVar: '--goose', ms: 2400, delayMs: 0 },
      { from: 1, to: 3, colorVar: '--goose', ms: 2400, delayMs: 520 },
      { from: 6, to: 8, colorVar: '--goose', ms: 2400, delayMs: 980 },
      // 2 x SV
      { from: 2, to: 4, colorVar: '--sv', ms: 1800, delayMs: 240 },
      { from: 5, to: 9, colorVar: '--sv', ms: 1800, delayMs: 760 },
      // 1 x MMS
      { from: 7, to: 9, colorVar: '--mms', ms: 3100, delayMs: 360 },
    ],
    [],
  );

  return (
    <div
      className={`startup-screen ${isDragging ? 'startup-drag-active' : ''}`}
      onDragOver={(e) => {
        e.preventDefault();
        setIsDragging(true);
      }}
      onDragLeave={() => setIsDragging(false)}
      onDrop={(e) => {
        e.preventDefault();
        setIsDragging(false);
        const f = e.dataTransfer.files?.[0];
        if (f) onDropFile(f);
      }}
    >
      <svg className="startup-bg-svg" viewBox="0 0 1000 600" aria-hidden="true">
        {connections.map(([a, b], idx) => (
          <line
            key={`ln:${idx}`}
            x1={hexes[a].x}
            y1={hexes[a].y}
            x2={hexes[b].x}
            y2={hexes[b].y}
            stroke="currentColor"
            opacity={0.35}
            strokeWidth={1}
          />
        ))}
        {hexes.map((h, idx) => (
          <polygon
            key={`hx:${idx}`}
            points={hexagonPoints(h.x, h.y, 16)}
            fill="var(--surface-alt)"
            stroke="var(--line)"
            strokeWidth={1}
            opacity={0.75}
          />
        ))}

        {pulses.map((p, idx) => {
          const a = hexes[p.from];
          const b = hexes[p.to];
          const offsetPath = `path("M ${a.x} ${a.y} L ${b.x} ${b.y}")`;
          // Keep pulses slightly varying size and opacity.
          const size = clamp(3.5 + idx * 0.15, 3.6, 4.3);
          return (
            <circle
              key={`pulse:${idx}`}
              r={size}
              fill={`var(${p.colorVar})`}
              className="startup-pulse"
              style={{
                offsetPath,
                animationDuration: `${p.ms}ms`,
                animationDelay: `${p.delayMs}ms`,
              }}
            />
          );
        })}
      </svg>

      <div className="startup-screen-inner">
        <div className="startup-logo">◆ SCD Visualizer</div>
        <p className="startup-subtitle">IEC 61850 SCL/SCD file viewer and validator</p>

        <div className="startup-cards">
          <button className="startup-card" onClick={onLoadFile} type="button">
            <span className="startup-card-icon">⬡</span>
            <span className="startup-card-title">Open SCD file</span>
            <span className="startup-card-desc">View, validate and analyse a single IEC 61850 SCD file</span>
          </button>
          <button className="startup-card startup-card-compare" onClick={onLoadCompare} type="button">
            <span className="startup-card-icon">⟷</span>
            <span className="startup-card-title">Compare files</span>
            <span className="startup-card-desc">Load two versions of an SCD file to see what has changed between them</span>
          </button>
        </div>

        <p className={`startup-drop-hint ${isDragging ? 'startup-drop-hint-active' : ''}`}>
          or drag &amp; drop an .scd file here
        </p>

        {recentSession ? (
          <div className="startup-cards">
            <button
              className="startup-card startup-card-recent"
              type="button"
              onClick={onLoadFile}
              title={recentSession.fileName}
            >
              <span className="startup-card-icon">↩</span>
              <span className="startup-card-title">Continue last session</span>
              <span className="startup-card-desc">
                {recentSession.fileName} — {recentSession.ieds} IEDs · {recentSession.issues} issues
              </span>
              <span className="startup-card-subtitle">{subtitle}</span>
            </button>
          </div>
        ) : null}

        <div className="startup-examples">
          <span className="hint">Or try an example:</span>
          <button className="btn" onClick={() => onLoadExample('/examples/example-basic.scd')} type="button">
            Example 1 – Basic GOOSE/SV
          </button>
          <button className="btn" onClick={() => onLoadExample('/examples/example-unresolved.scd')} type="button">
            Example 2 – Unresolved links
          </button>
        </div>
        <div className="startup-bottom-spacer" aria-hidden="true" />
      </div>
    </div>
  );
}

