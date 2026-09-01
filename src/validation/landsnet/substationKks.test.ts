import { describe, expect, it } from 'vitest';
import { parseSclDocument } from '../../parser/sclParser';
import { runLandsnetValidation } from './runLandsnetValidation';

function scl(substation: string): string {
  return `<?xml version="1.0" encoding="UTF-8"?>
<SCL xmlns="http://www.iec.ch/61850/2003/SCL" version="2007" revision="B">
${substation}
  <IED name="MJO_E_MJ1_EW020">
    <AccessPoint name="P1"><Server><LDevice inst="LD0"><LN0 lnClass="LLN0"/></LDevice></Server></AccessPoint>
  </IED>
</SCL>`;
}

function run(xml: string) {
  return runLandsnetValidation(parseSclDocument(xml).model!);
}

const BAD_SUBSTATION = `
  <Substation name="AA1" desc="MJO">
    <VoltageLevel name="E1" desc="132KV">
      <Bay name="Q01" desc="MJ1_2AEL10">
        <ConductingEquipment name="GS100" type="CBR">
          <LNode iedName="MJO_E_MJ1_EW020" ldInst="CTRL" lnClass="CSWI" lnInst="1"/>
        </ConductingEquipment>
        <ConductingEquipment name="GS210" type="DIS"/>
      </Bay>
    </VoltageLevel>
  </Substation>`;

const GOOD_SUBSTATION = `
  <Substation name="MJO" desc="Mjólká">
    <VoltageLevel name="E" desc="132KV">
      <Bay name="MJ1" desc="MJ1_2AEL10">
        <ConductingEquipment name="GS100" type="CBR">
          <LNode iedName="MJO_E_MJ1_EW020" ldInst="CTRL" lnClass="CSWI" lnInst="1"/>
        </ConductingEquipment>
      </Bay>
      <Bay name="0AEA10" desc="Busbar A">
        <ConductingEquipment name="GS310" type="DIS">
          <LNode iedName="MJO_E_MJ1_EW020" ldInst="CTRL" lnClass="CSWI" lnInst="2"/>
        </ConductingEquipment>
      </Bay>
      <Bay name="MJ1_2AEL10" desc="">
        <ConductingEquipment name="GS320" type="DIS">
          <LNode iedName="MJO_E_MJ1_EW020" ldInst="CTRL" lnClass="CSWI" lnInst="3"/>
        </ConductingEquipment>
      </Bay>
    </VoltageLevel>
  </Substation>`;

describe('LNET_020 substation KKS naming', () => {
  it('flags generic substation, numbered voltage level and Qxx bay names', () => {
    const issues = run(scl(BAD_SUBSTATION)).issues.filter((i) => i.code.startsWith('LNET_020'));
    expect(issues.every((i) => i.severity === 'warn')).toBe(true);
    expect(issues.some((i) => i.message.includes("'AA1'"))).toBe(true);   // substation name
    expect(issues.some((i) => i.message.includes("'E1'"))).toBe(true);    // voltage level name
    expect(issues.some((i) => i.message.includes("'Q01'"))).toBe(true);   // bay name
  });

  it('accepts KKS names: station code, voltage letter, bay code / full form / busbar code', () => {
    expect(run(scl(GOOD_SUBSTATION)).issues.filter((i) => i.code.startsWith('LNET_020'))).toEqual([]);
  });

  it('warns when neither bay name nor desc carries the full KKS form', () => {
    const sub = GOOD_SUBSTATION.replace('name="MJ1" desc="MJ1_2AEL10"', 'name="MJ1" desc=""');
    const issues = run(scl(sub)).issues.filter((i) => i.code.startsWith('LNET_020'));
    expect(issues.some((i) => i.message.includes('full KKS'))).toBe(true);
  });
});

describe('IEC_016 ConductingEquipment LNode binding', () => {
  it('flags equipment without any LNode', () => {
    const issues = run(scl(BAD_SUBSTATION)).issues.filter((i) => i.code.startsWith('IEC_016'));
    expect(issues.length).toBe(1);
    expect(issues[0].severity).toBe('warn');
    expect(issues[0].message).toContain('GS210');
  });

  it('passes when all equipment is bound', () => {
    expect(run(scl(GOOD_SUBSTATION)).issues.filter((i) => i.code.startsWith('IEC_016'))).toEqual([]);
  });
});
