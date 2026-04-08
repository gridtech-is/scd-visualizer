/**
 * mockScdGenerator.ts
 *
 * Generates a valid IEC 61850 SCD file from a natural-language description.
 *
 * ⚠️ THIS IS A MOCK — it uses template-based generation.
 *    When an Anthropic API key is available, replace `generateScdFromDescription`
 *    with a call to the Claude API using the prompt in `buildClaudePrompt()`.
 *    Everything else (parsing, validation, UI) stays the same.
 */

export interface IedSpec {
  name: string;
  desc: string;
  type: 'protection' | 'bay-controller' | 'merging-unit' | 'hmi' | 'gateway' | 'generic';
  hasGoose: boolean;
  hasSv: boolean;
  hasReport: boolean;
  ipStation: string;
  ipProcess?: string;
}

export interface SubstationSpec {
  name: string;
  desc: string;
  voltageKv: number;
  ieds: IedSpec[];
  gooseLinks: Array<{ pub: string; sub: string; cbName: string; appid: string; vlan: number; mac: string }>;
  svLinks: Array<{ pub: string; sub: string; cbName: string; appid: string; vlan: number; mac: string }>;
}

export interface GeneratorResult {
  xml: string;
  spec: SubstationSpec;
  explanation: string;
  warnings: string[];
}

// ─── PARSING ─────────────────────────────────────────────────────────────────

function extractNumber(text: string, pattern: RegExp, def: number): number {
  const m = text.match(pattern);
  return m ? parseInt(m[1], 10) : def;
}

function extractText(text: string, pattern: RegExp, def: string): string {
  const m = text.match(pattern);
  return m ? m[1].trim() : def;
}

function detectIedTypes(desc: string, count: number): IedSpec[] {
  const lower = desc.toLowerCase();
  const ieds: IedSpec[] = [];

  // Detect named types
  const types: Array<IedSpec['type']> = [];
  const typeKeywords: Array<[string[], IedSpec['type']]> = [
    [['protection', 'verndar', 'prot'], 'protection'],
    [['bay controller', 'bay ctrl', 'stöðvar', 'bay control', 'bcunit'], 'bay-controller'],
    [['merging unit', 'mu ', 'sampler', 'smu'], 'merging-unit'],
    [['hmi', 'scada', 'viðmót', 'operator'], 'hmi'],
    [['gateway', 'gæsluhlið', 'router', 'rtds'], 'gateway'],
  ];

  for (const [keywords, type] of typeKeywords) {
    for (const kw of keywords) {
      const matches = lower.split(kw).length - 1;
      for (let i = 0; i < matches; i++) types.push(type);
      break;
    }
  }

  // Fill remaining slots with generic
  while (types.length < count) types.push('generic');
  const limited = types.slice(0, count);

  const typeNames: Record<IedSpec['type'], string> = {
    'protection': 'PROT',
    'bay-controller': 'BCU',
    'merging-unit': 'MU',
    'hmi': 'HMI',
    'gateway': 'GW',
    'generic': 'IED',
  };

  const typeDescs: Record<IedSpec['type'], string> = {
    'protection': 'Protection IED',
    'bay-controller': 'Bay Control Unit',
    'merging-unit': 'Merging Unit',
    'hmi': 'HMI Station',
    'gateway': 'Communication Gateway',
    'generic': 'IED',
  };

  const typeCounts: Record<string, number> = {};
  for (const t of limited) typeCounts[t] = (typeCounts[t] || 0) + 1;
  const typeIdx: Record<string, number> = {};

  for (const t of limited) {
    typeIdx[t] = (typeIdx[t] || 0) + 1;
    const prefix = typeNames[t];
    const suffix = typeCounts[t] > 1 ? String(typeIdx[t]) : '';
    const idx = ieds.length + 1;
    const ip3 = 100 + idx;

    ieds.push({
      name: `${prefix}${suffix || String(idx)}`,
      desc: `${typeDescs[t]} ${suffix || String(idx)}`,
      type: t,
      hasGoose: t !== 'hmi' && t !== 'gateway',
      hasSv: t === 'merging-unit',
      hasReport: t === 'hmi' || t === 'bay-controller' || t === 'protection',
      ipStation: `10.0.1.${ip3}`,
      ipProcess: t !== 'hmi' ? `10.0.2.${ip3}` : undefined,
    });
  }

  return ieds;
}

export function parseDescription(desc: string): SubstationSpec {
  const lower = desc.toLowerCase();
  const warnings: string[] = [];

  // Extract substation name
  let substationName = extractText(desc, /substation\s+(?:named?|called|heita[rð]|nefnist)\s*[""']?(\w+)[""']?/i, '');
  if (!substationName) substationName = extractText(desc, /(?:stöð|substation|sub)\s*[""']?([A-Z][A-Z0-9_-]+)[""']?/i, '');
  if (!substationName) substationName = 'SUBSTATION1';

  // Extract voltage
  let voltageKv = 0;
  const voltageMatches = [...lower.matchAll(/(\d+)\s*kv/g)];
  if (voltageMatches.length > 0) {
    voltageKv = Math.max(...voltageMatches.map((m) => parseInt(m[1], 10)));
  }
  if (!voltageKv) voltageKv = 110;

  // Extract IED count
  let iedCount = extractNumber(lower, /(\d+)\s+(?:ied|stæki|tæki|device)/i, 0);
  if (!iedCount) iedCount = extractNumber(lower, /(?:ied|stæki|tæki|device)[^\d]*(\d+)/i, 0);
  if (!iedCount) {
    // Count type keywords
    const typeKeywords = ['protection', 'bay controller', 'merging unit', 'hmi', 'gateway', 'verndar', 'bcunit'];
    let count = 0;
    for (const kw of typeKeywords) {
      count += lower.split(kw).length - 1;
    }
    iedCount = count > 0 ? count : 3; // default to 3
  }
  iedCount = Math.min(Math.max(iedCount, 1), 12); // clamp 1–12

  const ieds = detectIedTypes(desc, iedCount);

  // Build GOOSE links between protection/BCU IEDs
  const gooseLinks: SubstationSpec['gooseLinks'] = [];
  const svLinks: SubstationSpec['svLinks'] = [];
  const hasGoose = lower.includes('goose') || lower.includes('gse') || ieds.some((i) => i.hasGoose);
  const hasSv = lower.includes('sampled value') || lower.includes('sv ') || lower.includes('smv') || lower.includes('merging unit') || ieds.some((i) => i.hasSv);

  if (hasGoose) {
    const publishers = ieds.filter((i) => i.hasGoose);
    const subscribers = ieds.filter((i) => i.hasGoose && i.type !== 'merging-unit');
    let appidNum = 1;
    for (const pub of publishers) {
      const subs = subscribers.filter((s) => s.name !== pub.name).slice(0, 2);
      for (const sub of subs) {
        const hex = appidNum.toString(16).toUpperCase().padStart(4, '0');
        const macEnd = appidNum.toString(16).toUpperCase().padStart(2, '0');
        gooseLinks.push({
          pub: pub.name,
          sub: sub.name,
          cbName: `gcPub${appidNum}`,
          appid: hex,   // no "0x" prefix — raw hex string per IEC 61850
          vlan: 100,
          mac: `01-0C-CD-01-00-${macEnd}`,
        });
        appidNum++;
      }
    }
  }

  if (hasSv) {
    const muIeds = ieds.filter((i) => i.hasSv);
    const protIeds = ieds.filter((i) => i.type === 'protection' || i.type === 'bay-controller');
    let svAppidNum = 0x4001;
    for (const mu of muIeds) {
      const subs = protIeds.slice(0, 2);
      for (const sub of subs) {
        const hex = svAppidNum.toString(16).toUpperCase().padStart(4, '0');
        const macEnd = (svAppidNum - 0x4000).toString(16).toUpperCase().padStart(2, '0');
        svLinks.push({
          pub: mu.name,
          sub: sub.name,
          cbName: `MSVCB${(svAppidNum - 0x4000).toString().padStart(2, '0')}`,
          appid: hex,   // no "0x" prefix — raw hex string per IEC 61850
          vlan: 200,
          mac: `01-0C-CD-04-00-${macEnd}`,
        });
        svAppidNum++;
      }
    }
  }

  void warnings;

  return {
    name: substationName.toUpperCase().replace(/[^A-Z0-9_]/g, '_'),
    desc: `${voltageKv}kV Substation`,
    voltageKv,
    ieds,
    gooseLinks,
    svLinks,
  };
}

// ─── XML GENERATION ───────────────────────────────────────────────────────────

function indent(level: number): string {
  return '  '.repeat(level);
}

function generateDataTypeTemplates(ieds: IedSpec[]): string {
  const lines: string[] = [];
  lines.push(`${indent(1)}<DataTypeTemplates>`);

  // LLN0 logical node type (shared)
  lines.push(`${indent(2)}<LNodeType id="LLN0_BASE" lnClass="LLN0">`);
  lines.push(`${indent(3)}<DO name="Mod" type="ENC_Mod"/>`);
  lines.push(`${indent(3)}<DO name="Beh" type="ENS_Beh"/>`);
  lines.push(`${indent(3)}<DO name="Health" type="ENS_Health"/>`);
  lines.push(`${indent(3)}<DO name="NamPlt" type="LPL_NamPlt"/>`);
  lines.push(`${indent(2)}</LNodeType>`);

  if (ieds.some((i) => i.hasGoose || i.type === 'protection')) {
    lines.push(`${indent(2)}<LNodeType id="XCBR_TYPE" lnClass="XCBR">`);
    lines.push(`${indent(3)}<DO name="Mod" type="ENC_Mod"/>`);
    lines.push(`${indent(3)}<DO name="Beh" type="ENS_Beh"/>`);
    lines.push(`${indent(3)}<DO name="Health" type="ENS_Health"/>`);
    lines.push(`${indent(3)}<DO name="NamPlt" type="LPL_NamPlt"/>`);
    lines.push(`${indent(3)}<DO name="Pos" type="DPC_Pos"/>`);
    lines.push(`${indent(3)}<DO name="BlkOpn" type="SPC_Blk"/>`);
    lines.push(`${indent(3)}<DO name="BlkCls" type="SPC_Blk"/>`);
    lines.push(`${indent(2)}</LNodeType>`);

    lines.push(`${indent(2)}<LNodeType id="CSWI_TYPE" lnClass="CSWI">`);
    lines.push(`${indent(3)}<DO name="Mod" type="ENC_Mod"/>`);
    lines.push(`${indent(3)}<DO name="Beh" type="ENS_Beh"/>`);
    lines.push(`${indent(3)}<DO name="Health" type="ENS_Health"/>`);
    lines.push(`${indent(3)}<DO name="NamPlt" type="LPL_NamPlt"/>`);
    lines.push(`${indent(3)}<DO name="Pos" type="DPC_Pos"/>`);
    lines.push(`${indent(2)}</LNodeType>`);

    lines.push(`${indent(2)}<LNodeType id="PTRC_TYPE" lnClass="PTRC">`);
    lines.push(`${indent(3)}<DO name="Mod" type="ENC_Mod"/>`);
    lines.push(`${indent(3)}<DO name="Beh" type="ENS_Beh"/>`);
    lines.push(`${indent(3)}<DO name="Health" type="ENS_Health"/>`);
    lines.push(`${indent(3)}<DO name="NamPlt" type="LPL_NamPlt"/>`);
    lines.push(`${indent(3)}<DO name="Tr" type="ACT_Tr"/>`);
    lines.push(`${indent(3)}<DO name="Op" type="ACT_Op"/>`);
    lines.push(`${indent(2)}</LNodeType>`);
  }

  if (ieds.some((i) => i.hasSv)) {
    lines.push(`${indent(2)}<LNodeType id="MMXU_TYPE" lnClass="MMXU">`);
    lines.push(`${indent(3)}<DO name="Mod" type="ENC_Mod"/>`);
    lines.push(`${indent(3)}<DO name="Beh" type="ENS_Beh"/>`);
    lines.push(`${indent(3)}<DO name="Health" type="ENS_Health"/>`);
    lines.push(`${indent(3)}<DO name="NamPlt" type="LPL_NamPlt"/>`);
    lines.push(`${indent(3)}<DO name="TotW" type="MV_TotW"/>`);
    lines.push(`${indent(3)}<DO name="TotVAr" type="MV_TotW"/>`);
    lines.push(`${indent(3)}<DO name="A" type="WYE_A"/>`);
    lines.push(`${indent(3)}<DO name="PhV" type="WYE_A"/>`);
    lines.push(`${indent(2)}</LNodeType>`);
  }

  // DOType definitions
  const dotypes = [
    ['ENC_Mod', 'ENC', [['ctlModel', 'ENUMERATED'], ['stVal', 'ENUMERATED'], ['q', 'Quality'], ['t', 'Timestamp']]],
    ['ENS_Beh', 'ENS', [['stVal', 'ENUMERATED'], ['q', 'Quality'], ['t', 'Timestamp']]],
    ['ENS_Health', 'ENS', [['stVal', 'ENUMERATED'], ['q', 'Quality'], ['t', 'Timestamp']]],
    ['LPL_NamPlt', 'LPL', [['vendor', 'VisString255'], ['swRev', 'VisString255'], ['d', 'VisString255']]],
    ['DPC_Pos', 'DPC', [['stVal', 'Dbpos'], ['q', 'Quality'], ['t', 'Timestamp'], ['ctlVal', 'BOOLEAN']]],
    ['SPC_Blk', 'SPC', [['stVal', 'BOOLEAN'], ['q', 'Quality'], ['t', 'Timestamp'], ['ctlVal', 'BOOLEAN']]],
    ['ACT_Tr', 'ACT', [['general', 'BOOLEAN'], ['q', 'Quality'], ['t', 'Timestamp']]],
    ['ACT_Op', 'ACT', [['general', 'BOOLEAN'], ['q', 'Quality'], ['t', 'Timestamp']]],
    ['MV_TotW', 'MV', [['mag', 'AnalogueValue'], ['q', 'Quality'], ['t', 'Timestamp']]],
    ['WYE_A', 'WYE', [['phsA', 'CMV'], ['phsB', 'CMV'], ['phsC', 'CMV']]],
  ] as const;

  for (const [id, cdc, das] of dotypes) {
    lines.push(`${indent(2)}<DOType id="${id}" cdc="${cdc}">`);
    for (const [name, bType] of das) {
      lines.push(`${indent(3)}<DA name="${name}" bType="${bType}" fc="ST"/>`);
    }
    lines.push(`${indent(2)}</DOType>`);
  }

  // DAType
  lines.push(`${indent(2)}<DAType id="AnalogueValue">`);
  lines.push(`${indent(3)}<BDA name="i" bType="INT32"/>`);
  lines.push(`${indent(3)}<BDA name="f" bType="FLOAT32"/>`);
  lines.push(`${indent(2)}</DAType>`);

  lines.push(`${indent(2)}<DAType id="CMV">`);
  lines.push(`${indent(3)}<BDA name="cVal" bType="STRUCT" type="Vector"/>`);
  lines.push(`${indent(3)}<BDA name="q" bType="Quality"/>`);
  lines.push(`${indent(3)}<BDA name="t" bType="Timestamp"/>`);
  lines.push(`${indent(2)}</DAType>`);

  lines.push(`${indent(2)}<DAType id="Vector">`);
  lines.push(`${indent(3)}<BDA name="mag" bType="STRUCT" type="AnalogueValue"/>`);
  lines.push(`${indent(3)}<BDA name="ang" bType="STRUCT" type="AnalogueValue"/>`);
  lines.push(`${indent(2)}</DAType>`);

  // EnumType
  lines.push(`${indent(2)}<EnumType id="BehaviourModeKind">`);
  lines.push(`${indent(3)}<EnumVal ord="1">on</EnumVal>`);
  lines.push(`${indent(3)}<EnumVal ord="2">blocked</EnumVal>`);
  lines.push(`${indent(3)}<EnumVal ord="3">test</EnumVal>`);
  lines.push(`${indent(3)}<EnumVal ord="4">test/blocked</EnumVal>`);
  lines.push(`${indent(3)}<EnumVal ord="5">off</EnumVal>`);
  lines.push(`${indent(2)}</EnumType>`);

  lines.push(`${indent(1)}</DataTypeTemplates>`);
  return lines.join('\n');
}

function generateIedXml(ied: IedSpec, gooseLinks: SubstationSpec['gooseLinks'], svLinks: SubstationSpec['svLinks']): string {
  const lines: string[] = [];
  const myGoosePublish = gooseLinks.filter((l) => l.pub === ied.name);
  const myGooseSubs = gooseLinks.filter((l) => l.sub === ied.name);
  const mySvPublish = svLinks.filter((l) => l.pub === ied.name);
  const mySvSubs = svLinks.filter((l) => l.sub === ied.name);

  lines.push(`${indent(1)}<IED name="${ied.name}" desc="${ied.desc}" type="${ied.type}" manufacturer="GridTech" configVersion="1" engRight="fix" originalSclRevision="B" originalSclVersion="2007" owner="">`);
  lines.push(`${indent(2)}<Services nameLength="64">`);
  lines.push(`${indent(3)}<DynAssociation/>`);
  lines.push(`${indent(3)}<GetDirectory/>`);
  lines.push(`${indent(3)}<GetDataObjectDefinition/>`);
  lines.push(`${indent(3)}<DataObjectDirectory/>`);
  lines.push(`${indent(3)}<GetDataSetValue/>`);
  lines.push(`${indent(3)}<SetDataSetValue/>`);
  lines.push(`${indent(3)}<DataSetDirectory/>`);
  lines.push(`${indent(3)}<ConfDataSet max="8" maxAttributes="200" modify="true"/>`);
  if (ied.hasReport) {
    lines.push(`${indent(3)}<ConfReportControl max="8"/>`);
    lines.push(`${indent(3)}<ReportSettings rptID="fix" datSet="fix" optFields="fix" bufTime="fix" trgOps="fix" intgPd="fix" resvTms="fix"/>`);
    lines.push(`${indent(3)}<ClientServices maxAttributes="200"/>`);
    lines.push(`${indent(3)}<SupSubscription max="20"/>`);
  }
  if (myGoosePublish.length > 0 || myGooseSubs.length > 0) {
    lines.push(`${indent(3)}<GSESettings cbName="fix" datSet="fix" appID="fix" dataLabel="fix"/>`);
    lines.push(`${indent(3)}<GOOSE max="${Math.max(myGoosePublish.length, 1)}"/>`);
  }
  if (mySvPublish.length > 0 || mySvSubs.length > 0) {
    lines.push(`${indent(3)}<SMVSettings cbName="fix" datSet="fix" svID="fix" optFields="fix" smpRate="fix" dataLabel="fix"/>`);
    lines.push(`${indent(3)}<SMV max="${Math.max(mySvPublish.length, 1)}"/>`);
  }
  lines.push(`${indent(2)}</Services>`);

  // Station access point
  lines.push(`${indent(2)}<AccessPoint name="S1">`);
  lines.push(`${indent(3)}<Server>`);
  // Authentication is required as the first child of Server per IEC 61850-6 XSD (tServer type)
  lines.push(`${indent(4)}<Authentication none="true"/>`);
  lines.push(`${indent(4)}<LDevice inst="LD0" desc="${ied.desc} - Main LD">`);
  lines.push(`${indent(5)}<LN0 lnClass="LLN0" inst="" lnType="LLN0_BASE">`);

  // ── LN0 content — strict IEC 61850-6 XSD ordering (tLN0 extends tAnyLN) ──
  // tAnyLN sequence: DataSet → ReportControl → LogControl → DOI → Inputs → Log
  // tLN0 adds after tAnyLN:  GSEControl → SampledValueControl → SettingControl

  // 1. DataSets (all datasets first, regardless of type)
  for (const link of myGoosePublish) {
    lines.push(`${indent(6)}<DataSet name="ds${link.cbName}" desc="GOOSE dataset for ${link.cbName}">`);
    lines.push(`${indent(7)}<FCDA ldInst="LD0" lnClass="XCBR" lnInst="1" prefix="" doName="Pos" daName="stVal" fc="ST"/>`);
    lines.push(`${indent(7)}<FCDA ldInst="LD0" lnClass="XCBR" lnInst="1" prefix="" doName="Pos" daName="q" fc="ST"/>`);
    lines.push(`${indent(7)}<FCDA ldInst="LD0" lnClass="XCBR" lnInst="1" prefix="" doName="Pos" daName="t" fc="ST"/>`);
    lines.push(`${indent(7)}<FCDA ldInst="LD0" lnClass="PTRC" lnInst="1" prefix="" doName="Tr" daName="general" fc="ST"/>`);
    lines.push(`${indent(7)}<FCDA ldInst="LD0" lnClass="PTRC" lnInst="1" prefix="" doName="Tr" daName="q" fc="ST"/>`);
    lines.push(`${indent(7)}<FCDA ldInst="LD0" lnClass="PTRC" lnInst="1" prefix="" doName="Tr" daName="t" fc="ST"/>`);
    lines.push(`${indent(6)}</DataSet>`);
  }
  for (const link of mySvPublish) {
    lines.push(`${indent(6)}<DataSet name="ds${link.cbName}" desc="SV dataset for ${link.cbName}">`);
    lines.push(`${indent(7)}<FCDA ldInst="LD0" lnClass="MMXU" lnInst="1" prefix="" doName="A" daName="phsA" fc="MX"/>`);
    lines.push(`${indent(7)}<FCDA ldInst="LD0" lnClass="MMXU" lnInst="1" prefix="" doName="A" daName="phsB" fc="MX"/>`);
    lines.push(`${indent(7)}<FCDA ldInst="LD0" lnClass="MMXU" lnInst="1" prefix="" doName="A" daName="phsC" fc="MX"/>`);
    lines.push(`${indent(7)}<FCDA ldInst="LD0" lnClass="MMXU" lnInst="1" prefix="" doName="PhV" daName="phsA" fc="MX"/>`);
    lines.push(`${indent(7)}<FCDA ldInst="LD0" lnClass="MMXU" lnInst="1" prefix="" doName="PhV" daName="phsB" fc="MX"/>`);
    lines.push(`${indent(7)}<FCDA ldInst="LD0" lnClass="MMXU" lnInst="1" prefix="" doName="PhV" daName="phsC" fc="MX"/>`);
    lines.push(`${indent(6)}</DataSet>`);
  }
  if (ied.hasReport) {
    lines.push(`${indent(6)}<DataSet name="dsReport" desc="Report dataset">`);
    lines.push(`${indent(7)}<FCDA ldInst="LD0" lnClass="XCBR" lnInst="1" prefix="" doName="Pos" daName="stVal" fc="ST"/>`);
    lines.push(`${indent(7)}<FCDA ldInst="LD0" lnClass="XCBR" lnInst="1" prefix="" doName="Pos" daName="q" fc="ST"/>`);
    lines.push(`${indent(6)}</DataSet>`);
  }

  // 2. ReportControl (per tAnyLN — must come before Inputs and GSEControl)
  if (ied.hasReport) {
    // rptID format: "IEDNameLDInst/LLN0.cbName" per IEC 61850-6
    const rptId = `${ied.name}LD0/LLN0.rEv1`;
    lines.push(`${indent(6)}<ReportControl name="rEv1" datSet="dsReport" rptID="${rptId}" confRev="10000" buffered="true" bufTime="100" intgPd="0" indexed="true">`);
    lines.push(`${indent(7)}<TrgOps period="false" dchg="true" dupd="false" gi="true" qchg="true"/>`);
    lines.push(`${indent(7)}<OptFields bufOvfl="true" configRef="false" dataRef="false" dataSet="true" entryID="true" reasonCode="true" seqNum="true" timeStamp="true"/>`);
    lines.push(`${indent(7)}<RptEnabled max="5">`);
    lines.push(`${indent(8)}<ClientLN apRef="S1" iedName="" ldInst="LD0" prefix="" lnClass="LLN0" lnInst=""/>`);
    lines.push(`${indent(7)}</RptEnabled>`);
    lines.push(`${indent(6)}</ReportControl>`);
  }

  // 3. Inputs with ExtRefs (per tAnyLN — must come before GSEControl/SampledValueControl)
  const gooseExtRefs = myGooseSubs;
  const svExtRefs = mySvSubs;
  if (gooseExtRefs.length > 0 || svExtRefs.length > 0) {
    lines.push(`${indent(6)}<Inputs>`);
    for (const link of gooseExtRefs) {
      lines.push(`${indent(7)}<ExtRef iedName="${link.pub}" ldInst="LD0" lnClass="LLN0" lnInst="" prefix="" doName="Pos" serviceType="GOOSE" srcCBName="${link.cbName}" srcLDInst="LD0" srcLNClass="LLN0" srcPrefix="" desc="GOOSE from ${link.pub}"/>`);
    }
    for (const link of svExtRefs) {
      lines.push(`${indent(7)}<ExtRef iedName="${link.pub}" ldInst="LD0" lnClass="MMXU" lnInst="1" prefix="" doName="A" serviceType="SMV" srcCBName="${link.cbName}" srcLDInst="LD0" srcLNClass="LLN0" srcPrefix="" desc="SV from ${link.pub}"/>`);
    }
    lines.push(`${indent(6)}</Inputs>`);
  }

  // 4. GSEControl (per tLN0 extension — must come AFTER tAnyLN children)
  for (const link of myGoosePublish) {
    // appID: "IEDName/LDInst/LLN0.cbName" format per Test.scd and IEC 61850-6
    const gooseAppId = `${ied.name}/LD0/LLN0.${link.cbName}`;
    lines.push(`${indent(6)}<GSEControl name="${link.cbName}" type="GOOSE" datSet="ds${link.cbName}" appID="${gooseAppId}" confRev="10000" securityEnable="None">`);
    lines.push(`${indent(7)}<IEDName apRef="S1" ldInst="LD0" lnClass="LLN0" lnInst="" prefix="">${link.sub}</IEDName>`);
    lines.push(`${indent(6)}</GSEControl>`);
  }

  // 5. SampledValueControl (per tLN0 extension — must come AFTER GSEControl)
  for (const link of mySvPublish) {
    const svSmvId = `${ied.name}/LD0/LLN0.${link.cbName}`;
    lines.push(`${indent(6)}<SampledValueControl name="${link.cbName}" datSet="ds${link.cbName}" smvID="${svSmvId}" confRev="10000" smpRate="80" nofASDU="1" multicast="true" smpMod="SmpPerPeriod">`);
    lines.push(`${indent(7)}<SmvOpts refreshTime="false" sampleSynchronized="true" sampleRate="false" dataSet="false" security="false" timestamp="false"/>`);
    const svSubs = svLinks.filter((l) => l.pub === ied.name && l.cbName === link.cbName);
    for (const sv of svSubs) {
      lines.push(`${indent(7)}<IEDName apRef="S1" ldInst="LD0" lnClass="LLN0" lnInst="" prefix="">${sv.sub}</IEDName>`);
    }
    lines.push(`${indent(6)}</SampledValueControl>`);
  }

  lines.push(`${indent(5)}</LN0>`);

  // Logical nodes depending on type
  if (ied.type === 'protection' || ied.type === 'bay-controller' || ied.type === 'generic') {
    lines.push(`${indent(5)}<LN lnClass="XCBR" inst="1" lnType="XCBR_TYPE" prefix="" desc="Circuit Breaker 1"/>`);
    lines.push(`${indent(5)}<LN lnClass="CSWI" inst="1" lnType="CSWI_TYPE" prefix="" desc="Switch Controller"/>`);
  }
  if (ied.type === 'protection') {
    lines.push(`${indent(5)}<LN lnClass="PTRC" inst="1" lnType="PTRC_TYPE" prefix="" desc="Protection Trip Condition"/>`);
  }
  if (ied.type === 'merging-unit') {
    lines.push(`${indent(5)}<LN lnClass="MMXU" inst="1" lnType="MMXU_TYPE" prefix="" desc="Measurement Unit"/>`);
  }

  lines.push(`${indent(4)}</LDevice>`);
  lines.push(`${indent(3)}</Server>`);
  lines.push(`${indent(2)}</AccessPoint>`);

  // Process access point for IEDs with process bus connection
  if (ied.ipProcess) {
    lines.push(`${indent(2)}<AccessPoint name="P1">`);
    lines.push(`${indent(3)}<Server>`);
    lines.push(`${indent(4)}<Authentication none="true"/>`);
    lines.push(`${indent(4)}<LDevice inst="LDP" desc="${ied.desc} - Process LD">`);
    lines.push(`${indent(5)}<LN0 lnClass="LLN0" inst="" lnType="LLN0_BASE"/>`);
    lines.push(`${indent(4)}</LDevice>`);
    lines.push(`${indent(3)}</Server>`);
    lines.push(`${indent(2)}</AccessPoint>`);
  }

  lines.push(`${indent(1)}</IED>`);
  return lines.join('\n');
}

function generateSubstationXml(spec: SubstationSpec): string {
  const lines: string[] = [];
  lines.push(`${indent(1)}<Substation name="${spec.name}" desc="${spec.desc}">`);
  lines.push(`${indent(2)}<VoltageLevel name="VL${spec.voltageKv}" desc="${spec.voltageKv}kV Level" nomFreq="50" numPhases="3">`);
  lines.push(`${indent(3)}<Voltage unit="V" multiplier="k">${spec.voltageKv}</Voltage>`);

  // One bay per protection/BCU IED
  const bayIeds = spec.ieds.filter((i) => i.type === 'protection' || i.type === 'bay-controller' || i.type === 'generic');
  for (let i = 0; i < bayIeds.length; i++) {
    const ied = bayIeds[i];
    const bayNum = i + 1;
    lines.push(`${indent(3)}<Bay name="BAY${bayNum}" desc="Bay ${bayNum} - ${ied.desc}">`);
    lines.push(`${indent(4)}<ConductingEquipment name="QA${bayNum}" type="CBR" desc="Circuit Breaker ${bayNum}">`);
    lines.push(`${indent(5)}<LNode iedName="${ied.name}" ldInst="LD0" lnClass="XCBR" lnInst="1"/>`);
    lines.push(`${indent(5)}<LNode iedName="${ied.name}" ldInst="LD0" lnClass="CSWI" lnInst="1"/>`);
    lines.push(`${indent(4)}</ConductingEquipment>`);
    lines.push(`${indent(4)}<ConductingEquipment name="QB${bayNum}" type="DIS" desc="Disconnector ${bayNum}"/>`);
    lines.push(`${indent(3)}</Bay>`);
  }

  // Bay for MUs
  const muIeds = spec.ieds.filter((i) => i.type === 'merging-unit');
  if (muIeds.length > 0) {
    lines.push(`${indent(3)}<Bay name="BAY_MU" desc="Merging Units">`);
    for (const mu of muIeds) {
      lines.push(`${indent(4)}<ConductingEquipment name="CTR_${mu.name}" type="CTR" desc="Current Transformer for ${mu.name}">`);
      lines.push(`${indent(5)}<LNode iedName="${mu.name}" ldInst="LD0" lnClass="MMXU" lnInst="1"/>`);
      lines.push(`${indent(4)}</ConductingEquipment>`);
    }
    lines.push(`${indent(3)}</Bay>`);
  }

  lines.push(`${indent(2)}</VoltageLevel>`);
  lines.push(`${indent(1)}</Substation>`);
  return lines.join('\n');
}

function generateCommunicationXml(spec: SubstationSpec): string {
  const lines: string[] = [];
  lines.push(`${indent(1)}<Communication>`);

  // Station bus (MMS/Reports) — no BitRate element in real IEC 61850 SCD files
  lines.push(`${indent(2)}<SubNetwork name="SN_Station" desc="Station Bus - MMS" type="8-MMS">`);
  for (const ied of spec.ieds) {
    lines.push(`${indent(3)}<ConnectedAP iedName="${ied.name}" apName="S1">`);
    lines.push(`${indent(4)}<Address>`);
    lines.push(`${indent(5)}<P type="IP">${ied.ipStation}</P>`);
    lines.push(`${indent(5)}<P type="IP-SUBNET">255.255.255.0</P>`);
    lines.push(`${indent(5)}<P type="IP-GATEWAY">10.0.1.1</P>`);
    lines.push(`${indent(5)}<P type="MAC-Address">00-30-A7-${ied.ipStation.split('.').slice(-1)[0].padStart(2, '0')}-00-01</P>`);
    lines.push(`${indent(4)}</Address>`);
    lines.push(`${indent(3)}</ConnectedAP>`);
  }
  lines.push(`${indent(2)}</SubNetwork>`);

  // Process bus (GOOSE + SV)
  if (spec.gooseLinks.length > 0 || spec.svLinks.length > 0) {
    // Process bus — no BitRate element in standard SCD files
    lines.push(`${indent(2)}<SubNetwork name="SN_Process" desc="Process Bus - GOOSE/SV" type="8-MMS">`);

    const processIeds = spec.ieds.filter((i) => i.ipProcess);
    for (const ied of processIeds) {
      const iedGooseLinks = spec.gooseLinks.filter((l) => l.pub === ied.name);
      const iedSvLinks = spec.svLinks.filter((l) => l.pub === ied.name);

      lines.push(`${indent(3)}<ConnectedAP iedName="${ied.name}" apName="P1">`);
      lines.push(`${indent(4)}<Address>`);
      lines.push(`${indent(5)}<P type="IP">${ied.ipProcess}</P>`);
      lines.push(`${indent(5)}<P type="IP-SUBNET">255.255.255.0</P>`);
      lines.push(`${indent(5)}<P type="MAC-Address">00-30-A7-${ied.ipProcess!.split('.').slice(-1)[0].padStart(2, '0')}-00-02</P>`);
      lines.push(`${indent(4)}</Address>`);

      for (const link of iedGooseLinks) {
        // APPID: hex string without "0x" prefix, 4 chars, e.g. "0001"
        const gooseAppidHex = link.appid.replace(/^0x/i, '').toUpperCase().padStart(4, '0');
        lines.push(`${indent(4)}<GSE ldInst="LD0" cbName="${link.cbName}">`);
        lines.push(`${indent(5)}<Address>`);
        lines.push(`${indent(6)}<P type="MAC-Address">${link.mac}</P>`);
        lines.push(`${indent(6)}<P type="APPID">${gooseAppidHex}</P>`);
        lines.push(`${indent(6)}<P type="VLAN-ID">${link.vlan}</P>`);
        lines.push(`${indent(6)}<P type="VLAN-PRIORITY">4</P>`);
        lines.push(`${indent(5)}</Address>`);
        // MinTime/MaxTime: multiplier="m" unit="s" means milliseconds (milli-seconds)
        lines.push(`${indent(5)}<MinTime multiplier="m" unit="s">4</MinTime>`);
        lines.push(`${indent(5)}<MaxTime multiplier="m" unit="s">1000</MaxTime>`);
        lines.push(`${indent(4)}</GSE>`);
      }

      for (const link of iedSvLinks) {
        // SV APPID range: 0x4000–0x7FFF, hex without "0x" prefix
        const svAppidHex = link.appid.replace(/^0x/i, '').toUpperCase().padStart(4, '0');
        lines.push(`${indent(4)}<SMV ldInst="LD0" cbName="${link.cbName}">`);
        lines.push(`${indent(5)}<Address>`);
        lines.push(`${indent(6)}<P type="MAC-Address">${link.mac}</P>`);
        lines.push(`${indent(6)}<P type="APPID">${svAppidHex}</P>`);
        lines.push(`${indent(6)}<P type="VLAN-ID">${link.vlan}</P>`);
        lines.push(`${indent(6)}<P type="VLAN-PRIORITY">4</P>`);
        lines.push(`${indent(5)}</Address>`);
        lines.push(`${indent(4)}</SMV>`);
      }

      lines.push(`${indent(3)}</ConnectedAP>`);
    }
    lines.push(`${indent(2)}</SubNetwork>`);
  }

  lines.push(`${indent(1)}</Communication>`);
  return lines.join('\n');
}

function generateHeaderXml(spec: SubstationSpec): string {
  const now = new Date();
  const dateStr = now.toISOString().split('T')[0];
  const lines: string[] = [];
  lines.push(`${indent(1)}<Header id="${spec.name}-AI" version="1" revision="0" toolID="GridTech AI SCD Creator v1.0">`);
  lines.push(`${indent(2)}<History>`);
  lines.push(`${indent(3)}<Hitem version="1" revision="0" when="${dateStr}T00:00:00" who="GridTech AI" what="Initial configuration generated by AI" why="AI-assisted substation configuration"/>`);
  lines.push(`${indent(2)}</History>`);
  lines.push(`${indent(1)}</Header>`);
  return lines.join('\n');
}

// ─── MAIN EXPORT ──────────────────────────────────────────────────────────────

/**
 * Generate SCD XML from a natural language description.
 *
 * 🔄 REPLACE THIS FUNCTION WITH CLAUDE API CALL:
 *
 * ```typescript
 * import Anthropic from '@anthropic-ai/sdk';
 *
 * export async function generateScdFromDescription(description: string): Promise<GeneratorResult> {
 *   const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });
 *   const response = await client.messages.create({
 *     model: 'claude-sonnet-4-6',
 *     max_tokens: 8192,
 *     system: buildClaudeSystemPrompt(),
 *     messages: [{ role: 'user', content: description }],
 *   });
 *   const xml = extractXmlFromResponse(response.content[0].text);
 *   const spec = parseDescription(description); // keep for UI summary
 *   return { xml, spec, explanation: response.content[0].text, warnings: [] };
 * }
 * ```
 */
export function generateScdFromDescription(description: string): GeneratorResult {
  const spec = parseDescription(description);
  const warnings: string[] = [];

  const xmlParts = [
    `<?xml version="1.0" encoding="UTF-8"?>`,
    `<SCL revision="B" version="2007"`,
    `  xmlns="http://www.iec.ch/61850/2003/SCL"`,
    `  xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance">`,
    generateHeaderXml(spec),
    generateSubstationXml(spec),
    generateCommunicationXml(spec),
    ...spec.ieds.map((ied) => generateIedXml(ied, spec.gooseLinks, spec.svLinks)),
    generateDataTypeTemplates(spec.ieds),
    `</SCL>`,
  ];

  const xml = xmlParts.join('\n');

  // Build human-readable explanation
  const gooseCount = spec.gooseLinks.length;
  const svCount = spec.svLinks.length;
  const explanation = [
    `✅ SCD skrá mynduð fyrir **${spec.name}** (${spec.voltageKv}kV)`,
    ``,
    `**${spec.ieds.length} IED** búin til:`,
    ...spec.ieds.map((i) => `  • ${i.name} — ${i.desc}`),
    ``,
    gooseCount > 0 ? `**${gooseCount} GOOSE tengingar** stillt með VLAN 100` : '',
    svCount > 0 ? `**${svCount} Sampled Value tengingar** stillt með VLAN 200` : '',
    ``,
    `📋 Staðfesting keyrir...`,
  ]
    .filter(Boolean)
    .join('\n');

  if (spec.ieds.length < 2) {
    warnings.push('Mælt er með að minnsta kosti 2 IED í substation. GOOSE tengingar þurfa bæði publisher og subscriber.');
  }

  return { xml, spec, explanation, warnings };
}

/**
 * The system prompt to use when calling Claude API.
 * Keep this up to date as IEC 61850 knowledge improves.
 */
export function buildClaudeSystemPrompt(): string {
  return `You are an expert IEC 61850 substation configuration engineer.
Your task is to generate valid SCL (Substation Configuration Language) SCD files based on user descriptions.

CRITICAL RULES:
1. Always generate well-formed XML with proper IEC 61850 namespace: xmlns="http://www.iec.ch/61850/2003/SCL"
2. Every IED must have at least one LDevice with an LN0 logical node
3. GOOSE APPID must be in range 0x0000-0x3FFF
4. SV APPID must be in range 0x4000-0x7FFF
5. Every GSEControl must have a corresponding ConnectedAP/GSE in the Communication section
6. Every SampledValueControl must have a corresponding ConnectedAP/SMV
7. MAC addresses for GOOSE must start with 01-0C-CD-01 prefix
8. MAC addresses for SV must start with 01-0C-CD-04 prefix
9. DataSet FCDAs must reference existing LN instances within the same IED
10. Use SCL version="2007" revision="B" release="4"

OUTPUT FORMAT: Return ONLY the XML content, starting with <?xml version="1.0"...>
`;
}
