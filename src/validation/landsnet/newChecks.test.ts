import { describe, expect, it } from 'vitest';
import { parseSclDocument } from '../../parser/sclParser';
import { runLandsnetValidation } from './runLandsnetValidation';

function scl(body: string): string {
  return `<?xml version="1.0" encoding="UTF-8"?>\n<SCL>\n${body}\n</SCL>`;
}

function run(xml: string) {
  return runLandsnetValidation(parseSclDocument(xml).model!);
}

const PUB = `
  <IED name="PUB_A">
    <AccessPoint name="P1"><Server><LDevice inst="LD0"><LN0 lnClass="LLN0">
      <DataSet name="PhsMeas1"><FCDA ldInst="LD0" lnClass="TCTR" lnInst="1" doName="AmpSv" daName="instMag.i"/></DataSet>
      <DataSet name="gInd"><FCDA ldInst="LD0" lnClass="CSWI" lnInst="1" doName="Pos" daName="stVal"/></DataSet>
      <GSEControl name="gcInd" datSet="gInd" appID="0011" confRev="1"/>
      <GSEControl name="gcPtrp" datSet="gInd" appID="8011" confRev="1"/>
      <SampledValueControl name="MSVCB01" datSet="PhsMeas1" smvID="AP" confRev="1" smpRate="4800"/>
    </LN0></LDevice></Server></AccessPoint>
  </IED>`;

function subscriber(lgosCount: number, lsvsCount: number): string {
  const lgos = Array.from({ length: lgosCount }, (_, i) => `<LN lnClass="LGOS" inst="${i + 1}" lnType="LGOS_T"/>`).join('');
  const lsvs = Array.from({ length: lsvsCount }, (_, i) => `<LN lnClass="LSVS" inst="${i + 1}" lnType="LSVS_T"/>`).join('');
  return `
  <IED name="SUB_B">
    <AccessPoint name="P1"><Server><LDevice inst="LD0"><LN0 lnClass="LLN0">
      <Inputs>
        <ExtRef iedName="PUB_A" ldInst="LD0" lnClass="CSWI" lnInst="1" doName="Pos" daName="stVal" serviceType="GOOSE" srcLDInst="LD0" srcCBName="gcInd"/>
        <ExtRef iedName="PUB_A" ldInst="LD0" lnClass="CSWI" lnInst="1" doName="Pos" daName="q" serviceType="GOOSE" srcLDInst="LD0" srcCBName="gcPtrp"/>
        <ExtRef iedName="PUB_A" ldInst="LD0" lnClass="TCTR" lnInst="1" doName="AmpSv" daName="instMag.i" serviceType="SMV" srcLDInst="LD0" srcCBName="MSVCB01"/>
      </Inputs>
    </LN0>${lgos}${lsvs}</LDevice></Server></AccessPoint>
  </IED>`;
}

describe('IEC_014 GOOSE/SV supervision LNs', () => {
  it('warns when LGOS/LSVS instances are fewer than subscriptions', () => {
    const report = run(scl(PUB + subscriber(1, 0)));
    const issues = report.issues.filter((i) => i.code.startsWith('IEC_014'));
    expect(issues.some((i) => i.code.includes('LGOS') && i.message.includes('SUB_B'))).toBe(true);
    expect(issues.some((i) => i.code.includes('LSVS') && i.message.includes('SUB_B'))).toBe(true);
    expect(issues.every((i) => i.severity === 'warn')).toBe(true);
  });

  it('passes when enough LGOS and LSVS instances exist', () => {
    const report = run(scl(PUB + subscriber(2, 1)));
    expect(report.issues.filter((i) => i.code.startsWith('IEC_014'))).toEqual([]);
  });
});

describe('IEC_015 SV sample rate', () => {
  it('accepts 4800 and flags deprecated 12800 and invalid rates', () => {
    const bad = PUB.replace('smpRate="4800"', 'smpRate="9600"');
    const deprecated = PUB.replace('smpRate="4800"', 'smpRate="12800"');
    expect(run(scl(PUB)).issues.filter((i) => i.code.startsWith('IEC_015'))).toEqual([]);
    const badIssues = run(scl(bad)).issues.filter((i) => i.code.startsWith('IEC_015'));
    expect(badIssues.length).toBe(1);
    expect(badIssues[0].severity).toBe('warn');
    const depIssues = run(scl(deprecated)).issues.filter((i) => i.code.startsWith('IEC_015'));
    expect(depIssues.length).toBe(1);
    expect(depIssues[0].message.toLowerCase()).toContain('deprecated');
  });
});

describe('LNET_019 MMS report naming', () => {
  const reportIed = (rptName: string) => `
  <IED name="IED_R">
    <AccessPoint name="P1"><Server><LDevice inst="LD0"><LN0 lnClass="LLN0">
      <DataSet name="Ev"><FCDA ldInst="LD0" lnClass="LLN0" doName="Mod"/></DataSet>
      <ReportControl name="${rptName}" rptID="R1" datSet="Ev" indexed="true" confRev="1"><RptEnabled max="5"/></ReportControl>
    </LN0></LDevice></Server></AccessPoint>
  </IED>`;

  it('accepts r-prefixed name matching the dataset', () => {
    expect(run(scl(reportIed('rEv'))).issues.filter((i) => i.code.startsWith('LNET_019'))).toEqual([]);
  });

  it('accepts a numeric suffix for multiple report instances on the same dataset', () => {
    expect(run(scl(reportIed('rEv2'))).issues.filter((i) => i.code.startsWith('LNET_019'))).toEqual([]);
  });

  it('warns when the name does not follow r + dataset', () => {
    const issues = run(scl(reportIed('urcbA'))).issues.filter((i) => i.code.startsWith('LNET_019'));
    expect(issues.length).toBe(1);
    expect(issues[0].severity).toBe('warn');
    expect(issues[0].message).toContain('urcbA');
  });
});
