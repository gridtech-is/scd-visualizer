import { describe, expect, it } from 'vitest';
import { parseSclDocument } from '../../parser/sclParser';
import { runLandsnetValidation } from './runLandsnetValidation';

function scl(body: string): string {
  return `<?xml version="1.0" encoding="UTF-8"?>\n<SCL>\n${body}\n</SCL>`;
}

const SERVER_IED = (rptEnabled: string) => `
  <IED name="IED_SRV">
    <AccessPoint name="P1">
      <Server>
        <LDevice inst="LD0">
          <LN0 lnClass="LLN0">
            <DataSet name="dsRpt">
              <FCDA ldInst="LD0" lnClass="LLN0" doName="Mod"/>
            </DataSet>
            <ReportControl name="r1" rptID="R1" datSet="dsRpt" indexed="true" confRev="1">
              ${rptEnabled}
            </ReportControl>
          </LN0>
        </LDevice>
      </Server>
    </AccessPoint>
  </IED>`;

const CLIENT_IED = `
  <IED name="Client1" type="OPC Server">
    <AccessPoint name="S1" clock="true">
      <LN lnClass="IHMI" inst="1" lnType="IHMI_T"/>
    </AccessPoint>
  </IED>`;

const SNTP_IED = `
  <IED name="SNTP1" type="SNTPClock">
    <AccessPoint name="AP1" clock="true"/>
  </IED>`;

function run(xml: string) {
  const model = parseSclDocument(xml).model!;
  return runLandsnetValidation(model);
}

describe('IEC_013 report client binding', () => {
  it('flags a client IED that no ReportControl ClientLN references', () => {
    const report = run(scl(SERVER_IED('<RptEnabled max="5"/>') + CLIENT_IED));
    const issues = report.issues.filter((i) => i.code.startsWith('IEC_013'));
    expect(issues.length).toBe(1);
    expect(issues[0].severity).toBe('warn');
    expect(issues[0].message).toContain('Client1');
    const check = report.checks.find((c) => c.code === 'IEC_013');
    expect(check?.passed).toBe(false);
  });

  it('passes when the client is bound via ClientLN', () => {
    const bound = '<RptEnabled max="5"><ClientLN iedName="Client1" apRef="S1" lnClass="IHMI" lnInst="1"/></RptEnabled>';
    const report = run(scl(SERVER_IED(bound) + CLIENT_IED));
    expect(report.issues.filter((i) => i.code.startsWith('IEC_013'))).toEqual([]);
    expect(report.checks.find((c) => c.code === 'IEC_013')?.passed).toBe(true);
  });

  it('does not flag IEDs without client LNs (e.g. SNTP clocks) or server IEDs', () => {
    const report = run(scl(SERVER_IED('<RptEnabled max="5"/>') + SNTP_IED));
    expect(report.issues.filter((i) => i.code.startsWith('IEC_013'))).toEqual([]);
  });
});
