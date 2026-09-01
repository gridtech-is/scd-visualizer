import { describe, expect, it } from 'vitest';
import { parseSclDocument } from '../parser/sclParser';
import { runValidation } from './runValidation';

const SAMPLE = `<?xml version="1.0" encoding="UTF-8"?>
<SCL>
  <IED name="IED_A">
    <AccessPoint name="AP1">
      <Server>
        <LDevice inst="LD0">
          <LN0 lnClass="LLN0">
            <GSEControl name="GCB1" datSet="MISSING_DATASET" />
            <Inputs>
              <ExtRef iedName="UNKNOWN_PUB" serviceType="GOOSE" />
            </Inputs>
          </LN0>
        </LDevice>
      </Server>
    </AccessPoint>
  </IED>
  <IED name="IED_A">
    <AccessPoint name="AP1">
      <Server>
        <LDevice inst="LD1"><LN0 lnClass="LLN0"/></LDevice>
      </Server>
    </AccessPoint>
  </IED>
</SCL>`;

const COMM_SAMPLE = `<?xml version="1.0" encoding="UTF-8"?>
<SCL>
  <IED name="IED_COMM">
    <AccessPoint name="P1">
      <Server><LDevice inst="LD0"><LN0 lnClass="LLN0"/></LDevice></Server>
    </AccessPoint>
  </IED>
  <Communication>
    <SubNetwork name="PROC">
      <ConnectedAP iedName="IED_COMM" apName="P1"/>
    </SubNetwork>
  </Communication>
</SCL>`;

const COMM_WITH_GSE_MAC = `<?xml version="1.0" encoding="UTF-8"?>
<SCL>
  <IED name="IED_GOOSE">
    <AccessPoint name="P1">
      <Server><LDevice inst="LD0"><LN0 lnClass="LLN0"/></LDevice></Server>
    </AccessPoint>
  </IED>
  <Communication>
    <SubNetwork name="PROC">
      <ConnectedAP iedName="IED_GOOSE" apName="P1">
        <GSE ldInst="LD0" cbName="GCB1">
          <Address>
            <P type="MAC-Address">01-0C-CD-01-00-01</P>
          </Address>
        </GSE>
      </ConnectedAP>
    </SubNetwork>
  </Communication>
</SCL>`;

const COMM_WITH_DUPLICATE_GSE_MAC = `<?xml version="1.0" encoding="UTF-8"?>
<SCL>
  <IED name="IED_A">
    <AccessPoint name="P1"><Server><LDevice inst="LD0"><LN0 lnClass="LLN0"><GSEControl name="GCB_A" datSet="gCB_A" appID="0001"/></LN0></LDevice></Server></AccessPoint>
  </IED>
  <IED name="IED_B">
    <AccessPoint name="P1"><Server><LDevice inst="LD0"><LN0 lnClass="LLN0"><GSEControl name="GCB_B" datSet="gCB_B" appID="0002"/></LN0></LDevice></Server></AccessPoint>
  </IED>
  <Communication>
    <SubNetwork name="PROC">
      <ConnectedAP iedName="IED_A" apName="P1">
        <GSE ldInst="LD0" cbName="GCB_A">
          <Address><P type="MAC-Address">01-0C-CD-01-00-01</P><P type="APPID">0001</P></Address>
        </GSE>
      </ConnectedAP>
      <ConnectedAP iedName="IED_B" apName="P1">
        <GSE ldInst="LD0" cbName="GCB_B">
          <Address><P type="MAC-Address">01-0C-CD-01-00-01</P><P type="APPID">0002</P></Address>
        </GSE>
      </ConnectedAP>
    </SubNetwork>
  </Communication>
</SCL>`;

const COMM_WITH_DUPLICATE_IP = `<?xml version="1.0" encoding="UTF-8"?>
<SCL>
  <IED name="IED_A"><AccessPoint name="P1"><Server><LDevice inst="LD0"><LN0 lnClass="LLN0"/></LDevice></Server></AccessPoint></IED>
  <IED name="IED_B"><AccessPoint name="P1"><Server><LDevice inst="LD0"><LN0 lnClass="LLN0"/></LDevice></Server></AccessPoint></IED>
  <Communication>
    <SubNetwork name="SB1">
      <ConnectedAP iedName="IED_A" apName="P1"><Address><P type="IP">192.168.10.11</P></Address></ConnectedAP>
      <ConnectedAP iedName="IED_B" apName="P1"><Address><P type="IP">192.168.10.11</P></Address></ConnectedAP>
    </SubNetwork>
  </Communication>
</SCL>`;

const COMM_WITH_DIFFERENT_SUBNETS = `<?xml version="1.0" encoding="UTF-8"?>
<SCL>
  <IED name="IED_A"><AccessPoint name="P1"><Server><LDevice inst="LD0"><LN0 lnClass="LLN0"/></LDevice></Server></AccessPoint></IED>
  <IED name="IED_B"><AccessPoint name="P1"><Server><LDevice inst="LD0"><LN0 lnClass="LLN0"/></LDevice></Server></AccessPoint></IED>
  <IED name="IED_C"><AccessPoint name="P1"><Server><LDevice inst="LD0"><LN0 lnClass="LLN0"/></LDevice></Server></AccessPoint></IED>
  <Communication>
    <SubNetwork name="SB1">
      <ConnectedAP iedName="IED_A" apName="P1"><Address><P type="IP">192.168.10.11</P></Address></ConnectedAP>
      <ConnectedAP iedName="IED_B" apName="P1"><Address><P type="IP">192.168.10.12</P></Address></ConnectedAP>
      <ConnectedAP iedName="IED_C" apName="P1"><Address><P type="IP">192.168.20.12</P></Address></ConnectedAP>
    </SubNetwork>
  </Communication>
</SCL>`;

const COMM_WITH_DUPLICATE_APPID = `<?xml version="1.0" encoding="UTF-8"?>
<SCL>
  <IED name="IED_A">
    <AccessPoint name="P1"><Server><LDevice inst="LD0"><LN0 lnClass="LLN0"><GSEControl name="GCB_A" datSet="gCB_A" appID="1001"/></LN0></LDevice></Server></AccessPoint>
  </IED>
  <IED name="IED_B">
    <AccessPoint name="P1"><Server><LDevice inst="LD0"><LN0 lnClass="LLN0"><GSEControl name="GCB_B" datSet="gCB_B" appID="1001"/></LN0></LDevice></Server></AccessPoint>
  </IED>
  <Communication>
    <SubNetwork name="PROC">
      <ConnectedAP iedName="IED_A" apName="P1">
        <GSE ldInst="LD0" cbName="GCB_A">
          <Address>
            <P type="MAC-Address">01-0C-CD-01-00-01</P>
            <P type="APPID">1001</P>
          </Address>
        </GSE>
      </ConnectedAP>
      <ConnectedAP iedName="IED_B" apName="P1">
        <GSE ldInst="LD0" cbName="GCB_B">
          <Address>
            <P type="MAC-Address">01-0C-CD-01-00-02</P>
            <P type="APPID">1001</P>
          </Address>
        </GSE>
      </ConnectedAP>
    </SubNetwork>
  </Communication>
</SCL>`;

const EMPTY_EXTREF_SAMPLE = `<?xml version="1.0" encoding="UTF-8"?>
<SCL>
  <IED name="SUB_A">
    <AccessPoint name="P1">
      <Server>
        <LDevice inst="LD0">
          <LN0 lnClass="LLN0">
            <Inputs>
              <ExtRef />
              <ExtRef serviceType="GOOSE" />
              <ExtRef intAddr="LOCAL_SIG_1" />
            </Inputs>
          </LN0>
        </LDevice>
      </Server>
    </AccessPoint>
  </IED>
</SCL>`;

describe('validation engine', () => {
  it('finds duplicate IED names (via IEC_009)', async () => {
    const parsed = parseSclDocument(SAMPLE);
    expect(parsed.model).toBeDefined();
    const issues = await runValidation(parsed.model!);
    // DUPLICATE_IED_NAME is now reported as IEC_009_DUPLICATE_IED
    expect(issues.some((i) => i.code === 'IEC_009_DUPLICATE_IED')).toBe(true);
  });

  it('finds missing dataset for GOOSE control', async () => {
    const parsed = parseSclDocument(SAMPLE);
    const issues = await runValidation(parsed.model!);
    expect(issues.some((i) => i.code === 'GOOSE_DATASET_MISSING')).toBe(true);
  });

  it('finds unresolved ExtRef publisher (via IEC_003)', async () => {
    const parsed = parseSclDocument(SAMPLE);
    const issues = await runValidation(parsed.model!);
    // EXTREF_UNRESOLVED is now reported as IEC_003_UNKNOWN_IED
    expect(issues.some((i) => i.code.startsWith('IEC_003_'))).toBe(true);
  });

  it('flags communication params missing for ConnectedAP', async () => {
    const parsed = parseSclDocument(COMM_SAMPLE);
    const issues = await runValidation(parsed.model!);
    expect(issues.some((i) => i.code === 'CONNECTEDAP_MISSING_ADDRESS')).toBe(true);
    expect(issues.some((i) => i.code === 'CONNECTEDAP_MISSING_IP')).toBe(true);
  });

  it('does not flag missing MAC when MAC exists under GSE/SMV communication blocks', async () => {
    const parsed = parseSclDocument(COMM_WITH_GSE_MAC);
    const issues = await runValidation(parsed.model!);
    expect(issues.some((i) => i.code === 'CONNECTEDAP_MISSING_MAC')).toBe(false);
    expect(issues.some((i) => i.code === 'CONNECTEDAP_MISSING_ADDRESS')).toBe(false);
  });

  it('flags duplicate MAC across GOOSE/SMV streams (via IEC_011)', async () => {
    const parsed = parseSclDocument(COMM_WITH_DUPLICATE_GSE_MAC);
    const issues = await runValidation(parsed.model!);
    // DUPLICATE_GSE_SMV_MAC is now reported as IEC_011_DUP_MAC
    expect(issues.some((i) => i.code === 'IEC_011_DUP_MAC')).toBe(true);
  });

  it('flags duplicate ConnectedAP IP addresses (via IEC_010)', async () => {
    const parsed = parseSclDocument(COMM_WITH_DUPLICATE_IP);
    const issues = await runValidation(parsed.model!);
    // DUPLICATE_CONNECTEDAP_IP is now reported as IEC_010_DUPLICATE_IP
    expect(issues.some((i) => i.code === 'IEC_010_DUPLICATE_IP')).toBe(true);
  });

  it('flags ConnectedAP addresses on different /24 network inside same SubNetwork', async () => {
    const parsed = parseSclDocument(COMM_WITH_DIFFERENT_SUBNETS);
    const issues = await runValidation(parsed.model!);
    expect(issues.some((i) => i.code === 'SUBNETWORK_IP_NETWORK_MISMATCH')).toBe(true);
  });

  it('flags duplicate APPID across GOOSE/SMV streams (via IEC_011)', async () => {
    const parsed = parseSclDocument(COMM_WITH_DUPLICATE_APPID);
    const issues = await runValidation(parsed.model!);
    // DUPLICATE_GSE_SMV_APPID is now reported as IEC_011_DUP_APPID
    expect(issues.some((i) => i.code === 'IEC_011_DUP_APPID')).toBe(true);
  });

  it('flags empty ExtRef entries with no binding fields', async () => {
    const parsed = parseSclDocument(EMPTY_EXTREF_SAMPLE);
    const issues = await runValidation(parsed.model!);
    const emptyExtRefIssues = issues.filter((i) => i.code === 'EXTREF_EMPTY');
    expect(emptyExtRefIssues).toHaveLength(2);
  });

  it('does not flag ExtRef with intAddr binding as empty', async () => {
    const parsed = parseSclDocument(EMPTY_EXTREF_SAMPLE);
    const issues = await runValidation(parsed.model!);
    const issuesForLocalIntAddr = issues.filter((i) => i.code === 'EXTREF_EMPTY' && i.path.includes('ExtRef[3]'));
    expect(issuesForLocalIntAddr).toHaveLength(0);
  });
});
