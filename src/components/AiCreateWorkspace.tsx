/**
 * AiCreateWorkspace.tsx
 *
 * AI-assisted SCD creation workspace.
 * Left: chat interface  |  Right: XML preview + validation results
 *
 * The mock generator is used when no API key is present.
 * To switch to real Claude API, update generateScdFromDescription in
 * src/ai/mockScdGenerator.ts (see the comment there).
 */

import { useRef, useState } from 'react';
import { parseSclDocument } from '../parser/sclParser';
import type { SclModel } from '../model/types';
import { generateScdFromDescription } from '../ai/mockScdGenerator';
import type { GeneratorResult } from '../ai/mockScdGenerator';

// ─── TYPES ────────────────────────────────────────────────────────────────────

type MessageRole = 'user' | 'assistant' | 'system';

interface ChatMessage {
  id: string;
  role: MessageRole;
  content: string;
  result?: GeneratorResult;
  timestamp: Date;
}

interface ValidationSummary {
  errors: number;
  warnings: number;
  passed: number;
}

interface AiCreateWorkspaceProps {
  onLoadScd: (xml: string, fileName: string) => void;
}

// ─── QUICK PROMPTS ────────────────────────────────────────────────────────────

const QUICK_PROMPTS = [
  {
    label: '3 IED — Grundvöllur',
    icon: '⚡',
    text: 'Búðu til SCD skrá fyrir 110kV substation með 3 IED: einn protection IED, einn bay controller og einn merging unit. Notaðu GOOSE tengingar og sampled values.',
  },
  {
    label: '5 IED — Stærri stöð',
    icon: '🏭',
    text: 'Ég þarf SCD skrá fyrir 220kV substation sem heitir GRINDAVIK með 5 IED: 2 protection, 2 bay controllers og 1 HMI. GOOSE tengingar milli allra protection IED.',
  },
  {
    label: 'Vindmælaverð',
    icon: '🌬️',
    text: 'Búðu til SCD fyrir vindmælaverksmiðju substation með 4 bay controllers, 2 merging units og 1 gateway IED. Nota SV og GOOSE á process bus.',
  },
  {
    label: 'Einfalt dæmi',
    icon: '🔋',
    text: 'Búðu til einfaldasta mögulegu SCD skrá með 2 IED og eina GOOSE tengingu.',
  },
];

// ─── HELPERS ──────────────────────────────────────────────────────────────────

function formatMarkdown(text: string): string {
  return text
    .replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>')
    .replace(/\*(.+?)\*/g, '<em>$1</em>')
    .replace(/`(.+?)`/g, '<code>$1</code>')
    .replace(/\n/g, '<br/>');
}

function countLines(xml: string): number {
  return xml.split('\n').length;
}

function getValidationSummary(model: SclModel | null): ValidationSummary {
  if (!model) return { errors: 0, warnings: 0, passed: 0 };
  // Lightweight structural count — full validation happens after load
  const iedCount = model.ieds.length;
  const gseCount = model.gseControls.length;
  const svCount = model.svControls.length;
  return {
    errors: 0,
    warnings: 0,
    passed: iedCount + gseCount + svCount,
  };
}

/**
 * Single-pass XML syntax highlighter.
 *
 * Splits the raw XML into tokens (text nodes, tags, PIs, comments) FIRST,
 * then applies HTML escaping and span wrapping to each token independently.
 * This avoids the classic regex-on-html bug where a second regex corrupts
 * the class="..." attributes of span elements added by the first regex.
 */
function syntaxHighlight(xml: string): string {
  function esc(s: string): string {
    return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
  }

  const out: string[] = [];
  let i = 0;

  while (i < xml.length) {
    if (xml[i] !== '<') {
      // Text node — find next '<' and escape the text content
      const next = xml.indexOf('<', i);
      const text = next === -1 ? xml.slice(i) : xml.slice(i, next);
      out.push(esc(text));
      i = next === -1 ? xml.length : next;
      continue;
    }

    // We're at '<' — find the end of this tag, honouring quoted attribute values
    let j = i + 1;
    let inQuote = false;
    let quoteChar = '';
    while (j < xml.length) {
      const ch = xml[j];
      if (inQuote) {
        if (ch === quoteChar) inQuote = false;
      } else if (ch === '"' || ch === "'") {
        inQuote = true; quoteChar = ch;
      } else if (ch === '>') {
        break;
      }
      j++;
    }
    // tag = full token including < and >
    const tag = xml.slice(i, j + 1);
    i = j + 1;

    // XML comment: <!-- ... -->
    if (tag.startsWith('<!--')) {
      out.push(`<span class="xml-comment">${esc(tag)}</span>`);
      continue;
    }
    // Processing instruction: <?xml ... ?>
    if (tag.startsWith('<?')) {
      out.push(`<span class="xml-pi">${esc(tag)}</span>`);
      continue;
    }

    // Regular element tag
    const isClose = tag.startsWith('</');
    const isSelfClose = tag.endsWith('/>');
    // Extract inner content (strip leading < or </ and trailing > or />)
    const inner = tag.slice(isClose ? 2 : 1, isSelfClose ? -2 : -1).trimEnd();

    // Split tagname from attribute string
    const spIdx = inner.search(/\s/);
    const tagname = spIdx === -1 ? inner : inner.slice(0, spIdx);
    // attrStr = everything after the tagname (raw, not yet escaped)
    const attrStr = spIdx === -1 ? '' : inner.slice(spIdx);

    // Highlight each name="value" pair in attrStr — operating on raw string,
    // NOT on already-HTML-encoded content, so span class attrs are never touched.
    const highlightedAttrs = attrStr.replace(
      /([\w:.-]+)="([^"]*)"/g,
      (_, name: string, value: string) =>
        `<span class="xml-attr">${esc(name)}</span>=<span class="xml-value">&quot;${esc(value)}&quot;</span>`,
    );

    const openBracket = isClose ? '&lt;/' : '&lt;';
    const closeBracket = isSelfClose ? '/&gt;' : '&gt;';
    out.push(`${openBracket}<span class="xml-tagname">${esc(tagname)}</span>${highlightedAttrs}${closeBracket}`);
  }

  return out.join('');
}

// ─── COMPONENT ────────────────────────────────────────────────────────────────

export default function AiCreateWorkspace({ onLoadScd }: AiCreateWorkspaceProps): JSX.Element {
  const [messages, setMessages] = useState<ChatMessage[]>([
    {
      id: 'welcome',
      role: 'assistant',
      content:
        '👋 **Velkomin/n í GridTech AI SCD Creator!**\n\nLýstu substation-inu þínu í einföldum orðum og ég myn SCD skrá samkvæmt IEC 61850. Þú getur sagt mér:\n\n• Hversu mörg IED eru\n• Tegund þeirra (protection, bay controller, merging unit...)\n• Spennustig (110kV, 220kV...)\n• Hvort nota eigi GOOSE og/eða Sampled Values\n\n*💡 Notaðu eitt af flýtiköstunum hér að neðan til að byrja.*',
      timestamp: new Date(),
    },
  ]);
  const [inputValue, setInputValue] = useState('');
  const [isGenerating, setIsGenerating] = useState(false);
  const [activeTab, setActiveTab] = useState<'xml' | 'summary' | 'validation'>('summary');
  const [latestResult, setLatestResult] = useState<GeneratorResult | null>(null);
  const [latestModel, setLatestModel] = useState<SclModel | null>(null);
  const [parseError, setParseError] = useState<string | null>(null);
  const [copyDone, setCopyDone] = useState(false);

  const chatEndRef = useRef<HTMLDivElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  function scrollToBottom() {
    setTimeout(() => {
      chatEndRef.current?.scrollIntoView({ behavior: 'smooth' });
    }, 50);
  }

  function addMessage(msg: Omit<ChatMessage, 'id' | 'timestamp'>) {
    const id = `msg-${Date.now()}-${Math.random().toString(36).slice(2)}`;
    setMessages((prev) => [...prev, { ...msg, id, timestamp: new Date() }]);
    scrollToBottom();
  }

  async function handleSend(text?: string) {
    const desc = (text ?? inputValue).trim();
    if (!desc || isGenerating) return;

    setInputValue('');
    setIsGenerating(true);

    addMessage({ role: 'user', content: desc });

    // Simulate AI thinking delay (will be real streaming with Claude API)
    await new Promise((resolve) => setTimeout(resolve, 1200));

    try {
      // 🔄 THIS IS THE MOCK — replace with Claude API call
      const result = generateScdFromDescription(desc);

      // Parse the generated XML with existing parser
      const parseResult = parseSclDocument(result.xml);

      if (parseResult.error && !parseResult.model) {
        setParseError(parseResult.error.message);
        addMessage({
          role: 'assistant',
          content: `⚠️ **Villa við þáttun á mynduðu XML:**\n\n\`${parseResult.error.message}\`\n\nÉg reyn aftur með breytta stillingu...`,
        });
      } else {
        setParseError(null);
        setLatestResult(result);
        setLatestModel(parseResult.model ?? null);
        setActiveTab('summary');

        const ieds = parseResult.model?.ieds ?? [];
        const gseCount = parseResult.model?.gseControls.length ?? 0;
        const svCount = parseResult.model?.svControls.length ?? 0;
        const lines = countLines(result.xml);

        const summaryNote =
          result.warnings.length > 0
            ? `\n\n⚠️ *Athugasemd: ${result.warnings[0]}*`
            : '\n\n✅ *XML þáttaðist án villna!*';

        addMessage({
          role: 'assistant',
          content:
            result.explanation +
            `\n\n📊 **Tölfræði:**  ${ieds.length} IED  ·  ${gseCount} GOOSE  ·  ${svCount} SV  ·  ${lines} línur XML` +
            summaryNote,
          result,
        });
      }
    } catch (err) {
      addMessage({
        role: 'assistant',
        content: `❌ **Villa:** ${err instanceof Error ? err.message : 'Óþekkt villa'}`,
      });
    } finally {
      setIsGenerating(false);
    }
  }

  function handleKeyDown(e: React.KeyboardEvent<HTMLTextAreaElement>) {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      void handleSend();
    }
  }

  function handleLoadIntoVisualizer() {
    if (!latestResult) return;
    const spec = latestResult.spec;
    onLoadScd(latestResult.xml, `${spec.name}_AI_generated.scd`);
  }

  function handleCopyXml() {
    if (!latestResult) return;
    void navigator.clipboard.writeText(latestResult.xml).then(() => {
      setCopyDone(true);
      setTimeout(() => setCopyDone(false), 2000);
    });
  }

  function handleDownloadXml() {
    if (!latestResult) return;
    const blob = new Blob([latestResult.xml], { type: 'application/xml' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `${latestResult.spec.name}_AI_generated.scd`;
    a.click();
    URL.revokeObjectURL(url);
  }

  const validationSummary = getValidationSummary(latestModel);

  // ─── RENDER ─────────────────────────────────────────────────────────────────

  return (
    <div className="ai-create-workspace">
      {/* ── LEFT: CHAT ── */}
      <div className="ai-chat-panel">
        <div className="ai-chat-header">
          <div className="ai-chat-header-left">
            <span className="ai-chat-logo">◆</span>
            <div>
              <div className="ai-chat-title">GridTech AI SCD Creator</div>
              <div className="ai-chat-subtitle">
                <span className="ai-mock-badge">MOCK MODE</span>
                <span className="ai-mock-hint"> — settu inn Anthropic API lykil til að nota raunverulegt AI</span>
              </div>
            </div>
          </div>
          {latestResult && (
            <button className="btn btn-primary ai-load-btn" onClick={handleLoadIntoVisualizer} title="Hlaða SCD skrá inn í myndræna framsetningu">
              Opna í Visualizer →
            </button>
          )}
        </div>

        <div className="ai-messages">
          {messages.map((msg) => (
            <div key={msg.id} className={`ai-message ai-message-${msg.role}`}>
              {msg.role === 'assistant' && (
                <div className="ai-message-avatar">◆</div>
              )}
              <div className="ai-message-bubble">
                <div
                  className="ai-message-content"
                  dangerouslySetInnerHTML={{ __html: formatMarkdown(msg.content) }}
                />
                {msg.result && (
                  <div className="ai-message-actions">
                    <button
                      className="ai-msg-action"
                      onClick={() => { setActiveTab('xml'); }}
                    >
                      📄 Sýna XML
                    </button>
                    <button
                      className="ai-msg-action"
                      onClick={() => { setActiveTab('summary'); }}
                    >
                      📊 Yfirlit
                    </button>
                  </div>
                )}
              </div>
              {msg.role === 'user' && (
                <div className="ai-message-avatar ai-message-avatar-user">T</div>
              )}
            </div>
          ))}

          {isGenerating && (
            <div className="ai-message ai-message-assistant">
              <div className="ai-message-avatar">◆</div>
              <div className="ai-message-bubble">
                <div className="ai-thinking">
                  <span className="ai-thinking-dot" />
                  <span className="ai-thinking-dot" />
                  <span className="ai-thinking-dot" />
                  <span className="ai-thinking-label">Mynda SCD...</span>
                </div>
              </div>
            </div>
          )}

          <div ref={chatEndRef} />
        </div>

        {/* Quick prompts */}
        {messages.length <= 1 && (
          <div className="ai-quick-prompts">
            {QUICK_PROMPTS.map((p) => (
              <button
                key={p.label}
                className="ai-quick-prompt"
                onClick={() => void handleSend(p.text)}
                disabled={isGenerating}
              >
                <span className="ai-qp-icon">{p.icon}</span>
                <span className="ai-qp-label">{p.label}</span>
              </button>
            ))}
          </div>
        )}

        {/* Input */}
        <div className="ai-input-area">
          <textarea
            ref={textareaRef}
            className="ai-textarea"
            value={inputValue}
            onChange={(e) => setInputValue(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder="Lýstu substation-inu þínu... (Enter = senda, Shift+Enter = nýlína)"
            rows={3}
            disabled={isGenerating}
          />
          <button
            className={`btn btn-primary ai-send-btn ${isGenerating ? 'loading' : ''}`}
            onClick={() => void handleSend()}
            disabled={!inputValue.trim() || isGenerating}
          >
            {isGenerating ? '⏳' : '→'}
          </button>
        </div>
      </div>

      {/* ── RIGHT: PREVIEW ── */}
      <div className="ai-preview-panel">
        {!latestResult ? (
          <div className="ai-preview-empty">
            <div className="ai-preview-empty-icon">◈</div>
            <div className="ai-preview-empty-title">SCD forskoðun</div>
            <div className="ai-preview-empty-sub">Þegar þú lýsir substation-inu mun SCD XML birtast hér, ásamt staðfestingarniðurstöðum.</div>
          </div>
        ) : (
          <>
            {/* Tab bar */}
            <div className="ai-preview-tabs">
              <button
                className={`ai-preview-tab ${activeTab === 'summary' ? 'active' : ''}`}
                onClick={() => setActiveTab('summary')}
              >
                📊 Yfirlit
              </button>
              <button
                className={`ai-preview-tab ${activeTab === 'xml' ? 'active' : ''}`}
                onClick={() => setActiveTab('xml')}
              >
                📄 XML
              </button>
              <button
                className={`ai-preview-tab ${activeTab === 'validation' ? 'active' : ''}`}
                onClick={() => setActiveTab('validation')}
              >
                ✓ Staðfesting
                {validationSummary.errors > 0 && (
                  <span className="ai-tab-badge error">{validationSummary.errors}</span>
                )}
              </button>

              <div className="ai-preview-actions">
                <button className="ai-action-btn" onClick={handleCopyXml} title="Afrita XML">
                  {copyDone ? '✅' : '📋'}
                </button>
                <button className="ai-action-btn" onClick={handleDownloadXml} title="Sækja SCD skrá">
                  ⬇
                </button>
                <button className="btn btn-primary" onClick={handleLoadIntoVisualizer}>
                  Opna í Visualizer →
                </button>
              </div>
            </div>

            {/* Summary tab */}
            {activeTab === 'summary' && latestResult && (
              <div className="ai-summary">
                <div className="ai-summary-header">
                  <div className="ai-summary-name">{latestResult.spec.name}</div>
                  <div className="ai-summary-subtitle">{latestResult.spec.desc}</div>
                </div>

                <div className="ai-stat-grid">
                  <div className="ai-stat">
                    <div className="ai-stat-num">{latestResult.spec.ieds.length}</div>
                    <div className="ai-stat-label">IED</div>
                  </div>
                  <div className="ai-stat">
                    <div className="ai-stat-num" style={{ color: 'var(--goose)' }}>{latestResult.spec.gooseLinks.length}</div>
                    <div className="ai-stat-label">GOOSE tengingar</div>
                  </div>
                  <div className="ai-stat">
                    <div className="ai-stat-num" style={{ color: 'var(--sv)' }}>{latestResult.spec.svLinks.length}</div>
                    <div className="ai-stat-label">SV tengingar</div>
                  </div>
                  <div className="ai-stat">
                    <div className="ai-stat-num">{countLines(latestResult.xml)}</div>
                    <div className="ai-stat-label">Línur XML</div>
                  </div>
                </div>

                <div className="ai-ied-list">
                  <div className="ai-section-title">IED listi</div>
                  {latestResult.spec.ieds.map((ied) => (
                    <div key={ied.name} className="ai-ied-row">
                      <div className="ai-ied-dot" style={{
                        background: ied.type === 'protection' ? 'var(--accent)' :
                          ied.type === 'merging-unit' ? 'var(--sv)' :
                            ied.type === 'bay-controller' ? 'var(--goose)' :
                              'var(--muted)'
                      }} />
                      <div className="ai-ied-name">{ied.name}</div>
                      <div className="ai-ied-desc">{ied.desc}</div>
                      <div className="ai-ied-ip">{ied.ipStation}</div>
                      <div className="ai-ied-chips">
                        {ied.hasGoose && <span className="ai-chip goose">GOOSE</span>}
                        {ied.hasSv && <span className="ai-chip sv">SV</span>}
                        {ied.hasReport && <span className="ai-chip report">REPORT</span>}
                      </div>
                    </div>
                  ))}
                </div>

                {latestResult.spec.gooseLinks.length > 0 && (
                  <div className="ai-links-list">
                    <div className="ai-section-title">GOOSE tengingar</div>
                    {latestResult.spec.gooseLinks.map((link) => (
                      <div key={link.cbName} className="ai-link-row">
                        <span className="ai-link-pub goose">{link.pub}</span>
                        <span className="ai-link-arrow">→</span>
                        <span className="ai-link-sub">{link.sub}</span>
                        <span className="ai-link-meta">APPID: {link.appid} · VLAN: {link.vlan}</span>
                      </div>
                    ))}
                  </div>
                )}

                {latestResult.spec.svLinks.length > 0 && (
                  <div className="ai-links-list">
                    <div className="ai-section-title">Sampled Values tengingar</div>
                    {latestResult.spec.svLinks.map((link) => (
                      <div key={link.cbName} className="ai-link-row">
                        <span className="ai-link-pub sv">{link.pub}</span>
                        <span className="ai-link-arrow">→</span>
                        <span className="ai-link-sub">{link.sub}</span>
                        <span className="ai-link-meta">APPID: {link.appid} · VLAN: {link.vlan}</span>
                      </div>
                    ))}
                  </div>
                )}

                {latestResult.warnings.length > 0 && (
                  <div className="ai-warnings">
                    {latestResult.warnings.map((w, i) => (
                      <div key={i} className="ai-warning-item">⚠️ {w}</div>
                    ))}
                  </div>
                )}

                {parseError && (
                  <div className="ai-parse-error">
                    <strong>⚠️ Þáttunarvilla:</strong> {parseError}
                  </div>
                )}

                {!parseError && latestModel && (
                  <div className="ai-parse-ok">
                    ✅ XML þáttaðist í SclModel — {latestModel.ieds.length} IED lesin
                  </div>
                )}
              </div>
            )}

            {/* XML tab */}
            {activeTab === 'xml' && latestResult && (
              <div className="ai-xml-view">
                <pre
                  className="ai-xml-pre"
                  dangerouslySetInnerHTML={{ __html: syntaxHighlight(latestResult.xml) }}
                />
              </div>
            )}

            {/* Validation tab */}
            {activeTab === 'validation' && (
              <div className="ai-validation-view">
                {!latestModel ? (
                  <div className="ai-val-error">
                    <div className="ai-val-error-icon">⚠️</div>
                    <div>Þáttunarvilla — ekki hægt að keyra staðfestingu</div>
                    {parseError && <div className="ai-val-error-detail">{parseError}</div>}
                  </div>
                ) : (
                  <>
                    <div className="ai-val-banner ok">
                      <div className="ai-val-banner-icon">✅</div>
                      <div>
                        <div className="ai-val-banner-title">XML þáttaðist!</div>
                        <div className="ai-val-banner-sub">
                          Hlauðu skránni inn í Visualizer til að keyra fulla 26-reglna LNET/IEC staðfestingu.
                        </div>
                      </div>
                    </div>

                    <div className="ai-val-stats">
                      <div className="ai-val-stat ok">
                        <div className="ai-val-stat-num">{latestModel.ieds.length}</div>
                        <div className="ai-val-stat-label">IED þáttaðar</div>
                      </div>
                      <div className="ai-val-stat ok">
                        <div className="ai-val-stat-num">{latestModel.gseControls.length}</div>
                        <div className="ai-val-stat-label">GSEControl</div>
                      </div>
                      <div className="ai-val-stat ok">
                        <div className="ai-val-stat-num">{latestModel.svControls.length}</div>
                        <div className="ai-val-stat-label">SV Control</div>
                      </div>
                      <div className="ai-val-stat ok">
                        <div className="ai-val-stat-num">{latestModel.subNetworks.length}</div>
                        <div className="ai-val-stat-label">SubNetworks</div>
                      </div>
                    </div>

                    <div className="ai-val-next">
                      <div className="ai-val-next-title">Næsta skref — Full staðfesting</div>
                      <div className="ai-val-next-body">
                        Smelltu á <strong>"Opna í Visualizer →"</strong> til að hlaða SCD-ið inn í staðfestingarkerfið og keyra allar 26 reglurnar (LNET 001–018, IEC 001–008).
                      </div>
                      <button className="btn btn-primary" style={{ marginTop: 12 }} onClick={handleLoadIntoVisualizer}>
                        Opna í Visualizer og staðfesta →
                      </button>
                    </div>
                  </>
                )}
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
}
