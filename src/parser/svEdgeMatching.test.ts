import { describe, expect, it } from 'vitest';
import { parseSclDocument } from './sclParser';

// Two SV publishers (PUB_A, PUB_C) with identical ldInst/cbName layout.
// SUB_B explicitly subscribes ONLY to PUB_A's MSVCB01 via ExtRef.
// The parser must NOT invent a probable edge PUB_C -> SUB_B.
const XML = `<?xml version="1.0" encoding="UTF-8"?>
<SCL>
  <IED name="PUB_A">
    <AccessPoint name="P1"><Server><LDevice inst="LD0"><LN0 lnClass="LLN0">
      <DataSet name="PhsMeas1"><FCDA ldInst="LD0" lnClass="TCTR" lnInst="1" doName="AmpSv" daName="instMag.i"/></DataSet>
      <SampledValueControl name="MSVCB01" datSet="PhsMeas1" smvID="AP" confRev="1" smpRate="4800"/>
    </LN0></LDevice></Server></AccessPoint>
  </IED>
  <IED name="PUB_C">
    <AccessPoint name="P1"><Server><LDevice inst="LD0"><LN0 lnClass="LLN0">
      <DataSet name="PhsMeas1"><FCDA ldInst="LD0" lnClass="TCTR" lnInst="1" doName="AmpSv" daName="instMag.i"/></DataSet>
      <SampledValueControl name="MSVCB01" datSet="PhsMeas1" smvID="CP" confRev="1" smpRate="4800"/>
    </LN0></LDevice></Server></AccessPoint>
  </IED>
  <IED name="SUB_B">
    <AccessPoint name="P1"><Server><LDevice inst="LD0"><LN0 lnClass="LLN0">
      <Inputs>
        <ExtRef iedName="PUB_A" ldInst="LD0" lnClass="TCTR" lnInst="1" doName="AmpSv" daName="instMag.i" serviceType="SMV" srcLDInst="LD0" srcCBName="MSVCB01"/>
      </Inputs>
    </LN0></LDevice></Server></AccessPoint>
  </IED>
</SCL>`;

describe('SV edge matching', () => {
  it('does not create cross-publisher probable edges when ExtRef names a publisher and CB', () => {
    const model = parseSclDocument(XML).model!;
    const svEdges = model.edges.filter((e) => e.signalType === 'SV');
    const toB = svEdges.filter((e) => e.subscriberIed === 'SUB_B');
    expect(toB.map((e) => e.publisherIed)).toEqual(['PUB_A']);
    expect(toB[0].status).toBe('resolved');
  });
});
