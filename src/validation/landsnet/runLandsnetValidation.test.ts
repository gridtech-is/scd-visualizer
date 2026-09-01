import { describe, expect, it } from 'vitest';
import { parseSclDocument } from '../../parser/sclParser';
import { landsnetJsonFiles } from '../../utils/exportLandsnetJson';
import { runLandsnetValidation } from './runLandsnetValidation';

const SAMPLE = `<?xml version="1.0" encoding="UTF-8"?>
<SCL>
  <IED name="IED_A">
    <AccessPoint name="P1">
      <Server>
        <LDevice inst="LD0">
          <LN0 lnClass="LLN0">
            <DataSet name="gX">
              <FCDA ldInst="LD0" lnClass="PTOC" doName="Str" daName="stVal"/>
            </DataSet>
            <DataSet name="dsRpt">
              <FCDA ldInst="LD0" lnClass="LLN0" doName="Mod"/>
            </DataSet>
            <GSEControl name="gcPtrip1" datSet="gX" confRev="1"/>
            <ReportControl name="r1" rptID="R1" datSet="dsRpt" indexed="false" confRev="1"/>
            <SMVControl name="svcb1" datSet="dsRpt" smvID="MU1M" confRev="1"/>
          </LN0>
        </LDevice>
      </Server>
    </AccessPoint>
  </IED>
  <IED name="IED_A">
    <AccessPoint name="P1"><Server><LDevice inst="LD0"><LN0 lnClass="LLN0"/></LDevice></Server></AccessPoint>
  </IED>
  <Communication>
    <SubNetwork name="PROC">
      <ConnectedAP iedName="IED_A" apName="P1">
        <Address>
          <P type="IP">192.168.44.21</P>
          <P type="Subnet-Mask">255.255.255.0</P>
          <P type="Gateway">1.1.1.1</P>
        </Address>
        <GSE ldInst="LD0" cbName="gcPtrip1" MinTime="10" MaxTime="10000">
          <Address>
            <P type="MAC-Address">01-0C-CD-2C-FF-21</P>
            <P type="APPID">0011</P>
            <P type="VLAN-ID">001</P>
            <P type="VLAN-PRIORITY">4</P>
          </Address>
        </GSE>
        <SMV ldInst="LD0" cbName="svcb1">
          <Address>
            <P type="MAC-Address">01-0C-CD-2C-FF-11</P>
            <P type="APPID">3011</P>
            <P type="VLAN-ID">001</P>
            <P type="VLAN-PRIORITY">7</P>
          </Address>
        </SMV>
      </ConnectedAP>
    </SubNetwork>
  </Communication>
</SCL>`;

describe('runLandsnetValidation', () => {
  it('returns failed checks and issues for Landsnet compliance violations', () => {
    const parsed = parseSclDocument(SAMPLE);
    expect(parsed.model).toBeDefined();

    const report = runLandsnetValidation(parsed.model!);
    const codes = new Set(report.issues.map((issue) => issue.code));

    expect(Array.from(codes).some((code) => code.startsWith('IEC_009_'))).toBe(true);
    expect(Array.from(codes).some((code) => code.startsWith('LNET_004_'))).toBe(true);
    expect(Array.from(codes).some((code) => code.startsWith('LNET_007_'))).toBe(true);
    expect(Array.from(codes).some((code) => code.startsWith('LNET_008_'))).toBe(true);
    expect(Array.from(codes).some((code) => code.startsWith('LNET_011_'))).toBe(true);
    expect(Array.from(codes).some((code) => code.startsWith('LNET_016_'))).toBe(true);

    expect(report.checks.find((check) => check.id === 1)?.passed).toBe(false);
    expect(report.checks.find((check) => check.id === 7)?.passed).toBe(false);
  });

  it('builds expected output dictionaries', () => {
    const parsed = parseSclDocument(SAMPLE);
    const report = runLandsnetValidation(parsed.model!);

    expect(report.dictionaries.IED_dict.IED_A).toBeDefined();
    expect(report.dictionaries.GOOSE_dict.IED_A?.[0]?.controlBlockName).toBe('gcPtrip1');
    expect(report.dictionaries.SV_dict.IED_A?.[0]?.controlBlockName).toBe('svcb1');
    expect(report.outputs.out_goose.length).toBeGreaterThan(0);
  });

  it('exports Landsnet JSON file bundle', () => {
    const parsed = parseSclDocument(SAMPLE);
    const report = runLandsnetValidation(parsed.model!);
    const files = landsnetJsonFiles(report);

    const fileNames = files.map((file) => file.fileName);
    expect(fileNames).toContain('validation_results.json');
    expect(fileNames).toContain('out_goose.json');
    expect(fileNames).toContain('out_sv.json');
    expect(fileNames).toContain('IEDs_SW_filter_template.json');
  });
});
