import { describe, expect, it } from 'vitest';
import { parseSclDocument } from '../../parser/sclParser';
import { runLandsnetValidation } from './runLandsnetValidation';

function run(aps: Array<[string, string]>) {
  const ieds = aps.map(([n]) => `<IED name="${n}"><AccessPoint name="P1"><Server><LDevice inst="LD0"><LN0 lnClass="LLN0"/></LDevice></Server></AccessPoint></IED>`).join('\n');
  const caps = aps.map(([n, ip]) => `<ConnectedAP iedName="${n}" apName="P1"><Address><P type="IP">${ip}</P><P type="Subnet-Mask">255.255.255.0</P><P type="Gateway">0.0.0.0</P></Address></ConnectedAP>`).join('\n');
  const xml = `<?xml version="1.0" encoding="UTF-8"?>\n<SCL xmlns="http://www.iec.ch/61850/2003/SCL" version="2007" revision="B">\n${ieds}\n<Communication><SubNetwork name="WA1">${caps}</SubNetwork></Communication>\n</SCL>`;
  const report = runLandsnetValidation(parseSclDocument(xml).model!);
  return report.issues.filter((i) => i.code.startsWith('IEC_010'));
}

describe('IEC_010 subnet IP rules', () => {
  it('still flags real duplicate addresses', () => {
    const issues = run([['IED_A', '192.168.100.11'], ['IED_B', '192.168.100.11'], ['IED_C', '192.168.100.12']]);
    expect(issues.some((i) => i.code.includes('DUPLICATE_IP') && i.message.includes('192.168.100.11'))).toBe(true);
  });

  it('reports loopback/unspecified as invalid station addresses, not duplicates', () => {
    const issues = run([['IED_A', '192.168.100.11'], ['CLK_1', '127.0.0.1'], ['CLK_2', '127.0.0.1']]);
    expect(issues.filter((i) => i.code.includes('DUPLICATE_IP'))).toEqual([]);
    const invalid = issues.filter((i) => i.code.includes('INVALID_IP'));
    expect(invalid.length).toBe(2);
    expect(invalid[0].message).toContain('127.0.0.1');
  });

  it('flags addresses outside the subnet majority network', () => {
    const issues = run([
      ['IED_A', '192.168.100.11'],
      ['IED_B', '192.168.100.12'],
      ['IED_C', '192.168.100.13'],
      ['IED_D', '192.168.101.14'],
    ]);
    const wrong = issues.filter((i) => i.code.includes('WRONG_NETWORK'));
    expect(wrong.length).toBe(1);
    expect(wrong[0].message).toContain('192.168.101.14');
    expect(wrong[0].message).toContain('192.168.100');
  });

  it('passes when all addresses share one network', () => {
    expect(run([['IED_A', '192.168.100.11'], ['IED_B', '192.168.100.12']])).toEqual([]);
  });
});
