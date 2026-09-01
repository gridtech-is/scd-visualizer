import { describe, expect, it } from 'vitest';
import { parseSclDocument } from '../parser/sclParser';
import { buildNetworkTopologyView, DEFAULT_NETWORK_FILTERS } from './buildNetworkView';

// Client and clock IEDs (no Server/LDevices) must NOT be promoted to switch nodes —
// with no real switch in the file, the topology collapses to ONE dummy subnetwork switch.
const SAMPLE = `<?xml version="1.0" encoding="UTF-8"?>
<SCL>
  <IED name="PUB_IED">
    <AccessPoint name="P1"><Server><LDevice inst="LD0"><LN0 lnClass="LLN0">
      <DataSet name="dsGoose"><FCDA ldInst="LD0" lnClass="PTOC" lnInst="1" doName="Str" daName="stVal"/></DataSet>
      <GSEControl name="GCB1" datSet="dsGoose"><IEDName>SUB_IED</IEDName></GSEControl>
    </LN0></LDevice></Server></AccessPoint>
  </IED>
  <IED name="SUB_IED">
    <AccessPoint name="P1"><Server><LDevice inst="LD1"><LN0 lnClass="LLN0">
      <Inputs><ExtRef iedName="PUB_IED" srcLDInst="LD0" srcCBName="GCB1" serviceType="GOOSE"/></Inputs>
    </LN0></LDevice></Server></AccessPoint>
  </IED>
  <IED name="Client1" type="OPC Server">
    <AccessPoint name="S1" clock="true">
      <LN lnClass="IHMI" inst="1" lnType="IHMI_T"/>
    </AccessPoint>
  </IED>
  <IED name="SNTPServer_Primary" type="SNTPClock">
    <AccessPoint name="SNTPap" clock="true"/>
  </IED>
  <Communication>
    <SubNetwork name="WA1">
      <ConnectedAP iedName="PUB_IED" apName="P1"><Address><P type="IP">192.168.1.10</P></Address></ConnectedAP>
      <ConnectedAP iedName="SUB_IED" apName="P1"><Address><P type="IP">192.168.1.11</P></Address></ConnectedAP>
      <ConnectedAP iedName="Client1" apName="S1"><Address><P type="IP">192.168.1.5</P></Address></ConnectedAP>
      <ConnectedAP iedName="SNTPServer_Primary" apName="SNTPap"><Address><P type="IP">192.168.1.100</P></Address></ConnectedAP>
    </SubNetwork>
  </Communication>
</SCL>`;

describe('network dummy switch', () => {
  it('uses one dummy subnetwork switch when no real switch exists', () => {
    const model = parseSclDocument(SAMPLE).model!;
    const view = buildNetworkTopologyView(model, 'WA1', DEFAULT_NETWORK_FILTERS);
    expect(view.switches.length).toBe(1);
    expect(view.switches[0].explicit).toBe(false);
    expect(view.switches[0].name).toContain('WA1');
    // every port links to the single dummy switch
    expect(new Set(view.links.map((l) => l.switchId)).size).toBe(1);
  });

  it('still promotes an IED that looks like a real switch by name', () => {
    const xml = SAMPLE.replace('name="SNTPServer_Primary" type="SNTPClock"', 'name="Station_Switch_A1" type="Switch"')
      .replace('clock="true"/>', '/>')
      .replace('iedName="SNTPServer_Primary" apName="SNTPap"', 'iedName="Station_Switch_A1" apName="SNTPap"');
    const model = parseSclDocument(xml).model!;
    const view = buildNetworkTopologyView(model, 'WA1', DEFAULT_NETWORK_FILTERS);
    expect(view.switches.some((s) => s.explicit && s.name.includes('Station_Switch_A1'))).toBe(true);
  });
});
