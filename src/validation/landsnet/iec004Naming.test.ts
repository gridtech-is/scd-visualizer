import { describe, expect, it } from 'vitest';
import { parseSclDocument } from '../../parser/sclParser';
import { runLandsnetValidation } from './runLandsnetValidation';

function run(names: string[]) {
  const ieds = names.map((n) => `<IED name="${n}"><AccessPoint name="P1"><Server><LDevice inst="LD0"><LN0 lnClass="LLN0"/></LDevice></Server></AccessPoint></IED>`).join('\n');
  const xml = `<?xml version="1.0" encoding="UTF-8"?>\n<SCL xmlns="http://www.iec.ch/61850/2003/SCL" version="2007" revision="B">\n${ieds}\n</SCL>`;
  const report = runLandsnetValidation(parseSclDocument(xml).model!);
  return report.issues.filter((i) => i.code.startsWith('IEC_004')).map((i) => i.context.iedName);
}

describe('IEC_004 IED naming convention', () => {
  it('accepts bay devices, station-level devices, other device codes, GW and HMI', () => {
    expect(run([
      'MJO_F_TT2_EW050',   // bay device
      'MJO_E_EW991',       // station-level device on a voltage level (no bay)
      'MJO_K_MJO_EU200',   // RTU with EU device code
      'MJO_GW',            // gateway per Landsnet guideline
      'MJO_GW2',           // redundant gateway
      'MJO_HMI',           // HMI per Landsnet guideline
    ])).toEqual([]);
  });

  it('still flags non-KKS names', () => {
    expect(run(['Client1', 'SNTPServer_Primary', 'mjo_f_tt2_ew050'])).toEqual([
      'Client1',
      'SNTPServer_Primary',
      'mjo_f_tt2_ew050',
    ]);
  });
});
