import {
  childrenByTag,
  childrenByTagLocal,
  firstByTag,
  getAttr,
  getAttrByLocalName,
  parseXml,
  snippetFor,
} from './xml';
import { parseSld } from '../sld/parseSld';
import type {
  AccessPointModel,
  BayModel,
  ConnectedApModel,
  DataSetModel,
  DataTypeTemplatesModel,
  EdgeModel,
  EquipmentModel,
  ExtRefModel,
  FcdaModel,
  GooseControlModel,
  GseCommModel,
  HitemModel,
  IedModel,
  LDeviceModel,
  LnModel,
  LNodeRefModel,
  ParseErrorInfo,
  ReportControlModel,
  SclHeaderModel,
  SclModel,
  SmvCommModel,
  SubNetworkModel,
  SubstationModel,
  SvControlModel,
  VoltageLevelModel,
} from '../model/types';

export interface ParseResult {
  model?: SclModel;
  error?: ParseErrorInfo;
}

export function parseSclDocument(xmlText: string, onProgress?: (stage: string, count?: number) => void): ParseResult {
  try {
    const doc = parseXml(xmlText);
    const root = doc.documentElement;
    if (!root || root.tagName !== 'SCL') {
      return { error: { message: 'Root element must be <SCL>' } };
    }

    const snippets: Record<string, string> = {};
    const header = parseHeader(root);
    const ieds = parseIeds(root, snippets);
    onProgress?.('ieds', ieds.length);
    const { bays, substations } = parseBaysFromSubstation(root, snippets);
    hydrateIedBayInfo(ieds, bays);
    const dataSets = parseDataSets(root, snippets);
    const dataTypeTemplates = parseDataTypeTemplates(root);
    const gseControls = parseGooseControls(root, snippets);
    const svControls = parseSvControls(root, snippets);
    const reportControls = parseReportControls(root, snippets);
    const extRefs = parseExtRefs(root, snippets);
    const communication = parseCommunication(root, snippets);

    hydrateAccessPointNetworkInfo(ieds, communication.subNetworks);

    const edges = buildEdges({
      ieds,
      dataSets,
      gseControls,
      svControls,
      reportControls,
      extRefs,
      gseComms: communication.gseComms,
    });

    let sld: ReturnType<typeof parseSld> | undefined;
    try { sld = parseSld(doc) ?? undefined; } catch { sld = undefined; }

    return {
      model: {
        ieds,
        bays,
        substations,
        dataSets,
        dataTypeTemplates,
        sld,
        gseControls,
        svControls,
        reportControls,
        extRefs,
        subNetworks: communication.subNetworks,
        gseComms: communication.gseComms,
        smvComms: communication.smvComms,
        edges,
        snippets,
        header,
      },
    };
  } catch (error) {
    const typedError = error as Error & { info?: ParseErrorInfo };
    return {
      error: typedError.info || { message: typedError.message || 'Unknown parse error' },
    };
  }
}

function parseHeader(root: Element): SclHeaderModel | undefined {
  const headerEl = firstByTag(root, 'Header');
  if (!headerEl) return undefined;
  const historyEl = firstByTag(headerEl, 'History');
  const history: HitemModel[] = historyEl
    ? childrenByTag(historyEl, 'Hitem').map((el) => ({
        version: getAttr(el, 'version') ?? undefined,
        revision: getAttr(el, 'revision') ?? undefined,
        when: getAttr(el, 'when') ?? undefined,
        who: getAttr(el, 'who') ?? undefined,
        what: getAttr(el, 'what') ?? undefined,
        why: getAttr(el, 'why') ?? undefined,
      }))
    : [];
  const helinksNs = root.lookupNamespaceURI('hlx');
  const helinksLocked = helinksNs === 'http://www.helinks.com/SCL/Private';
  return {
    id: getAttr(headerEl, 'id') ?? undefined,
    version: getAttr(headerEl, 'version') ?? undefined,
    revision: getAttr(headerEl, 'revision') ?? undefined,
    toolID: getAttr(headerEl, 'toolID') ?? undefined,
    nameStructure: getAttr(headerEl, 'nameStructure') ?? undefined,
    history,
    helinksLocked,
  };
}

function parseIeds(root: Element, snippets: Record<string, string>): IedModel[] {
  return childrenByTag(root, 'IED').map((iedEl) => {
    const name = getAttr(iedEl, 'name') || 'unnamed-ied';
    const accessPoints = childrenByTag(iedEl, 'AccessPoint').map((apEl): AccessPointModel => {
      const apName = getAttr(apEl, 'name') || 'AP';
      const serverEl = firstByTag(apEl, 'Server');
      const lDevices = serverEl ? childrenByTag(serverEl, 'LDevice') : [];
      const ldInsts = lDevices.map((ld) => getAttr(ld, 'inst') || 'LD');

      const apKey = `ied:${name}:ap:${apName}`;
      snippets[apKey] = snippetFor(apEl);

      return {
        name: apName,
        ldInsts,
        hasServer: Boolean(serverEl),
        clock: (getAttr(apEl, 'clock') || '').toLowerCase() === 'true' || undefined,
        clientLnClasses: childrenByTag(apEl, 'LN')
          .map((lnEl) => getAttr(lnEl, 'lnClass') || '')
          .filter(Boolean),
      };
    });

    const lDevices: LDeviceModel[] = [];
    for (const apEl of childrenByTag(iedEl, 'AccessPoint')) {
      const serverEl = firstByTag(apEl, 'Server');
      if (!serverEl) {
        continue;
      }
      for (const ldEl of childrenByTag(serverEl, 'LDevice')) {
        const inst = getAttr(ldEl, 'inst') || 'LD';
        const ln0El = firstByTag(ldEl, 'LN0');
        const ln0 = ln0El ? parseLnLike(ln0El) : undefined;
        const lns = childrenByTag(ldEl, 'LN').map(parseLnLike);

        const ldKey = `ied:${name}:ld:${inst}`;
        snippets[ldKey] = snippetFor(ldEl);

        lDevices.push({
          inst,
          ln0,
          lns,
        });
      }
    }

    const iedKey = `ied:${name}`;
    snippets[iedKey] = snippetFor(iedEl);

    return {
      name,
      desc: getAttr(iedEl, 'desc'),
      accessPoints,
      lDevices,
      bayNames: [],
    };
  });
}

function parseBaysFromSubstation(root: Element, snippets: Record<string, string>): { bays: BayModel[]; substations: SubstationModel[] } {
  const bays: BayModel[] = [];
  const substations: SubstationModel[] = [];

  for (const substationEl of childrenByTag(root, 'Substation')) {
    const substationName = getAttr(substationEl, 'name');
    const voltageLevels: VoltageLevelModel[] = [];

    for (const vlEl of childrenByTag(substationEl, 'VoltageLevel')) {
      const voltageLevelName = getAttr(vlEl, 'name');
      const vlBays: BayModel[] = [];

      for (const bayEl of childrenByTag(vlEl, 'Bay')) {
        const name = getAttr(bayEl, 'name') || 'Bay';
        const iedNames = new Set<string>();
        for (const lNode of Array.from(bayEl.getElementsByTagName('LNode'))) {
          const iedName = getAttr(lNode, 'iedName');
          if (iedName) {
            iedNames.add(iedName);
          }
        }

        // Parse ConductingEquipment per bay
        const equipment: EquipmentModel[] = [];
        const eqTags = ['ConductingEquipment', 'PowerTransformer', 'TransformerWinding'];
        for (const tag of eqTags) {
          for (const eqEl of childrenByTag(bayEl, tag)) {
            const eqName = getAttr(eqEl, 'name');
            const eqType = getAttr(eqEl, 'type') || tag;
            const lnodes: LNodeRefModel[] = [];
            for (const lnEl of Array.from(eqEl.getElementsByTagName('LNode'))) {
              lnodes.push({
                iedName: getAttr(lnEl, 'iedName') || undefined,
                ldInst: getAttr(lnEl, 'ldInst') || undefined,
                lnClass: getAttr(lnEl, 'lnClass') || undefined,
                lnInst: getAttr(lnEl, 'lnInst') || undefined,
                prefix: getAttr(lnEl, 'prefix') || undefined,
              });
              const eqIed = getAttr(lnEl, 'iedName');
              if (eqIed) iedNames.add(eqIed);
            }
            if (eqName) {
              equipment.push({ name: eqName, type: eqType, lnodes });
            }
          }
        }

        const key = `bay:${substationName || 'Substation'}:${voltageLevelName || 'VL'}:${name}`;
        snippets[key] = snippetFor(bayEl);
        const bay: BayModel = {
          key,
          name,
          substationName,
          voltageLevelName,
          iedNames: Array.from(iedNames),
          equipment,
        };
        bays.push(bay);
        vlBays.push(bay);
      }

      voltageLevels.push({
        name: voltageLevelName || '',
        desc: getAttr(vlEl, 'desc') || undefined,
        nomFreq: getAttr(vlEl, 'nomFreq') || undefined,
        numPhases: getAttr(vlEl, 'numPhases') || undefined,
        bays: vlBays,
      });
    }

    substations.push({
      name: substationName || '',
      desc: getAttr(substationEl, 'desc') || undefined,
      voltageLevels,
    });
  }

  return { bays, substations };
}

function parseLnLike(lnEl: Element): LnModel {
  return {
    lnClass: getAttr(lnEl, 'lnClass') || (lnEl.tagName === 'LN0' ? 'LLN0' : 'LN'),
    inst: getAttr(lnEl, 'inst') || '',
    prefix: getAttr(lnEl, 'prefix'),
    lnType: getAttr(lnEl, 'lnType'),
  };
}

function parseDataSets(root: Element, snippets: Record<string, string>): DataSetModel[] {
  const results: DataSetModel[] = [];

  for (const iedEl of childrenByTag(root, 'IED')) {
    const iedName = getAttr(iedEl, 'name') || 'unnamed-ied';

    for (const apEl of childrenByTag(iedEl, 'AccessPoint')) {
      const serverEl = firstByTag(apEl, 'Server');
      if (!serverEl) {
        continue;
      }

      for (const ldEl of childrenByTag(serverEl, 'LDevice')) {
        const ldInst = getAttr(ldEl, 'inst') || 'LD';

        for (const lnEl of [
          ...childrenByTag(ldEl, 'LN0'),
          ...childrenByTag(ldEl, 'LN'),
        ]) {
          const lnClass = getAttr(lnEl, 'lnClass') || (lnEl.tagName === 'LN0' ? 'LLN0' : 'LN');
          const lnInst = getAttr(lnEl, 'inst') || undefined;

          for (const dsEl of childrenByTag(lnEl, 'DataSet')) {
            const name = getAttr(dsEl, 'name') || 'DataSet';
            const key = `dataset:${iedName}:${ldInst}:${lnClass}:${lnInst || ''}:${name}`;
            const fcdas = [
              ...childrenByTag(dsEl, 'FCDA').map(parseFcda),
              ...(childrenByTag(dsEl, 'FCD').length ? childrenByTag(dsEl, 'FCD') : childrenByTagLocal(dsEl, 'FCD')).map(parseFcd),
            ];

            snippets[key] = snippetFor(dsEl);
            results.push({
              key,
              name,
              iedName,
              ldInst,
              lnClass,
              lnInst,
              fcdas,
            });
          }
        }
      }
    }
  }

  return results;
}

function parseFcda(fcdaEl: Element): FcdaModel {
  return {
    ldInst: getAttr(fcdaEl, 'ldInst') ?? getAttrByLocalName(fcdaEl, 'ldInst'),
    prefix: getAttr(fcdaEl, 'prefix') ?? getAttrByLocalName(fcdaEl, 'prefix'),
    lnClass: getAttr(fcdaEl, 'lnClass') ?? getAttrByLocalName(fcdaEl, 'lnClass'),
    lnInst: getAttr(fcdaEl, 'lnInst') ?? getAttrByLocalName(fcdaEl, 'lnInst'),
    doName: getAttr(fcdaEl, 'doName') ?? getAttrByLocalName(fcdaEl, 'doName'),
    daName: getAttr(fcdaEl, 'daName') ?? getAttrByLocalName(fcdaEl, 'daName'),
    fc: getAttr(fcdaEl, 'fc') ?? getAttrByLocalName(fcdaEl, 'fc'),
  };
}

/** FCD = whole DO reference (no daName). Same attributes as FCDA except daName. */
function parseFcd(fcdEl: Element): FcdaModel {
  const base = parseFcda(fcdEl);
  return { ...base, daName: undefined };
}

function parseDataTypeTemplates(root: Element): DataTypeTemplatesModel | undefined {
  const dt = childrenByTagLocal(root, 'DataTypeTemplates')[0] ?? firstByTag(root, 'DataTypeTemplates');
  if (!dt) return undefined;

  const lNodeTypes = new Map<string, { id: string; lnClass?: string; dos: { name: string; type: string }[] }>();
  for (const lnEl of childrenByTagLocal(dt, 'LNodeType')) {
    const id = getAttr(lnEl, 'id') ?? getAttrByLocalName(lnEl, 'id') ?? '';
    if (!id) continue;
    const lnClass = getAttr(lnEl, 'lnClass') ?? getAttrByLocalName(lnEl, 'lnClass');
    const dos = childrenByTagLocal(lnEl, 'DO').map((doEl) => ({
      name: getAttr(doEl, 'name') ?? getAttrByLocalName(doEl, 'name') ?? '',
      type: getAttr(doEl, 'type') ?? getAttrByLocalName(doEl, 'type') ?? '',
    })).filter((d) => d.name && d.type);
    lNodeTypes.set(id, { id, lnClass, dos });
  }

  const seenIds = new Map<string, number>();
  const trackId = (id: string) => seenIds.set(id, (seenIds.get(id) ?? 0) + 1);

  for (const lnEl of childrenByTagLocal(dt, 'LNodeType')) {
    const id = getAttr(lnEl, 'id') ?? getAttrByLocalName(lnEl, 'id') ?? '';
    if (id) trackId(id);
  }

  const doTypes = new Map<string, { id: string; cdc?: string; das: { name: string; fc?: string; bType?: string; type?: string }[] }>();
  for (const doTypeEl of childrenByTagLocal(dt, 'DOType')) {
    const id = getAttr(doTypeEl, 'id') ?? getAttrByLocalName(doTypeEl, 'id') ?? '';
    if (!id) continue;
    trackId(id);
    const cdc = getAttr(doTypeEl, 'cdc') ?? getAttrByLocalName(doTypeEl, 'cdc') ?? undefined;
    const das = childrenByTagLocal(doTypeEl, 'DA').map((daEl) => ({
      name: getAttr(daEl, 'name') ?? getAttrByLocalName(daEl, 'name') ?? '',
      fc: getAttr(daEl, 'fc') ?? getAttrByLocalName(daEl, 'fc'),
      bType: getAttr(daEl, 'bType') ?? getAttrByLocalName(daEl, 'bType') ?? undefined,
      type: getAttr(daEl, 'type') ?? getAttrByLocalName(daEl, 'type') ?? undefined,
    })).filter((d) => d.name);
    doTypes.set(id, { id, cdc, das });
  }

  const daTypes = new Map<string, { id: string; bType?: string; bdas: { name: string; bType?: string }[] }>();
  for (const daTypeEl of childrenByTagLocal(dt, 'DAType')) {
    const id = getAttr(daTypeEl, 'id') ?? getAttrByLocalName(daTypeEl, 'id') ?? '';
    if (!id) continue;
    trackId(id);
    const bType = getAttr(daTypeEl, 'bType') ?? getAttrByLocalName(daTypeEl, 'bType') ?? undefined;
    const bdas = childrenByTagLocal(daTypeEl, 'BDA').map((bdaEl) => ({
      name: getAttr(bdaEl, 'name') ?? getAttrByLocalName(bdaEl, 'name') ?? '',
      bType: getAttr(bdaEl, 'bType') ?? getAttrByLocalName(bdaEl, 'bType') ?? undefined,
    })).filter((d) => d.name);
    daTypes.set(id, { id, bType, bdas });
  }

  const enumTypes = new Map<string, { id: string; enumValCount: number }>();
  for (const enumEl of childrenByTagLocal(dt, 'EnumType')) {
    const id = getAttr(enumEl, 'id') ?? getAttrByLocalName(enumEl, 'id') ?? '';
    if (!id) continue;
    trackId(id);
    const enumValCount = childrenByTagLocal(enumEl, 'EnumVal').length;
    enumTypes.set(id, { id, enumValCount });
  }

  const duplicateTypeIds = Array.from(seenIds.entries())
    .filter(([, count]) => count > 1)
    .map(([id]) => id);

  return { lNodeTypes, doTypes, daTypes, enumTypes, duplicateTypeIds };
}

function parseGooseControls(root: Element, snippets: Record<string, string>): GooseControlModel[] {
  const controls: GooseControlModel[] = [];

  walkLnElements(root, (context) => {
    for (const gseEl of childrenByTag(context.lnEl, 'GSEControl')) {
      const name = getAttr(gseEl, 'name') || 'GSEControl';
      const key = `goose:${context.iedName}:${context.ldInst}:${context.lnClass}:${context.lnInst || ''}:${name}`;
      snippets[key] = snippetFor(gseEl);

      controls.push({
        key,
        type: 'GOOSE',
        iedName: context.iedName,
        apName: context.apName,
        ldInst: context.ldInst,
        lnClass: context.lnClass,
        lnInst: context.lnInst,
        name,
        datSet: getAttr(gseEl, 'datSet'),
        appId: getAttr(gseEl, 'appID'),
        confRev: getAttr(gseEl, 'confRev'),
      });
    }
  });

  return controls;
}

function parseSvControls(root: Element, snippets: Record<string, string>): SvControlModel[] {
  const controls: SvControlModel[] = [];

  walkLnElements(root, (context) => {
    for (const svEl of [
      ...childrenByTag(context.lnEl, 'SMVControl'),
      ...childrenByTag(context.lnEl, 'SVControl'),
      ...childrenByTag(context.lnEl, 'SampledValueControl'),
    ]) {
      const name = getAttr(svEl, 'name') || 'SVControl';
      const key = `sv:${context.iedName}:${context.ldInst}:${context.lnClass}:${context.lnInst || ''}:${name}`;
      snippets[key] = snippetFor(svEl);

      controls.push({
        key,
        type: 'SV',
        iedName: context.iedName,
        apName: context.apName,
        ldInst: context.ldInst,
        lnClass: context.lnClass,
        lnInst: context.lnInst,
        name,
        datSet: getAttr(svEl, 'datSet'),
        smvId: getAttr(svEl, 'smvID'),
        nofASDU: getAttr(svEl, 'nofASDU'),
        confRev: getAttr(svEl, 'confRev'),
        smpRate: getAttr(svEl, 'smpRate') ?? getAttrByLocalName(svEl, 'smpRate'),
        smpMod: getAttr(svEl, 'smpMod') ?? getAttrByLocalName(svEl, 'smpMod'),
      });
    }
  });

  return controls;
}

function parseReportControls(root: Element, snippets: Record<string, string>): ReportControlModel[] {
  const controls: ReportControlModel[] = [];

  walkLnElements(root, (context) => {
    for (const rptEl of childrenByTag(context.lnEl, 'ReportControl')) {
      const name = getAttr(rptEl, 'name') || 'ReportControl';
      const key = `report:${context.iedName}:${context.ldInst}:${context.lnClass}:${context.lnInst || ''}:${name}`;
      snippets[key] = snippetFor(rptEl);

      const rptEnabled = firstByTag(rptEl, 'RptEnabled');
      const clients = rptEnabled
        ? childrenByTag(rptEnabled, 'ClientLN').map((clientEl) => ({
            iedName: getAttr(clientEl, 'iedName'),
            apRef: getAttr(clientEl, 'apRef'),
            ldInst: getAttr(clientEl, 'ldInst'),
            prefix: getAttr(clientEl, 'prefix'),
            lnClass: getAttr(clientEl, 'lnClass'),
            lnInst: getAttr(clientEl, 'lnInst'),
          }))
        : [];

      controls.push({
        key,
        type: 'REPORT',
        iedName: context.iedName,
        apName: context.apName,
        ldInst: context.ldInst,
        lnClass: context.lnClass,
        lnInst: context.lnInst,
        name,
        datSet: getAttr(rptEl, 'datSet'),
        rptId: getAttr(rptEl, 'rptID'),
        confRev: getAttr(rptEl, 'confRev'),
        buffered: (getAttr(rptEl, 'buffered') || '').toLowerCase() === 'true',
        indexed: parseBooleanAttr(getAttr(rptEl, 'indexed')),
        clients,
      });
    }
  });

  return controls;
}

function parseExtRefs(root: Element, snippets: Record<string, string>): Array<{ ownerIed: string; extRef: ExtRefModel }> {
  const refs: Array<{ ownerIed: string; extRef: ExtRefModel }> = [];

  for (const iedEl of childrenByTag(root, 'IED')) {
    const ownerIed = getAttr(iedEl, 'name') || 'unnamed-ied';

    for (const extRefEl of iedEl.getElementsByTagName('ExtRef')) {
      const extRef: ExtRefModel = {
        iedName: getAttr(extRefEl, 'iedName'),
        ldInst: getAttr(extRefEl, 'ldInst'),
        srcLDInst: getAttr(extRefEl, 'srcLDInst'),
        prefix: getAttr(extRefEl, 'prefix'),
        lnClass: getAttr(extRefEl, 'lnClass'),
        lnInst: getAttr(extRefEl, 'lnInst'),
        doName: getAttr(extRefEl, 'doName'),
        daName: getAttr(extRefEl, 'daName'),
        srcCBName: getAttr(extRefEl, 'srcCBName'),
        intAddr: getAttr(extRefEl, 'intAddr'),
        serviceType: getAttr(extRefEl, 'serviceType'),
      };

      const key = `extref:${ownerIed}:${refs.length}`;
      snippets[key] = snippetFor(extRefEl);

      refs.push({ ownerIed, extRef });
    }
  }

  return refs;
}

function parseCommunication(
  root: Element,
  snippets: Record<string, string>,
): {
  subNetworks: SubNetworkModel[];
  gseComms: GseCommModel[];
  smvComms: SmvCommModel[];
} {
  const subNetworks: SubNetworkModel[] = [];
  const gseComms: GseCommModel[] = [];
  const smvComms: SmvCommModel[] = [];

  const commEl = firstByTag(root, 'Communication');
  if (!commEl) {
    return { subNetworks, gseComms, smvComms };
  }

  for (const subnetEl of childrenByTag(commEl, 'SubNetwork')) {
    const subnetName = getAttr(subnetEl, 'name') || 'SubNetwork';
    const connectedAps: ConnectedApModel[] = [];

    for (const capEl of childrenByTag(subnetEl, 'ConnectedAP')) {
      const iedName = getAttr(capEl, 'iedName') || 'unnamed-ied';
      const apName = getAttr(capEl, 'apName') || 'AP';
      const physConns = childrenByTag(capEl, 'PhysConn').flatMap((physEl) =>
        childrenByTag(physEl, 'P').map((p) => ({
          pType: getAttr(p, 'type'),
          value: p.textContent?.trim() || '',
        })),
      );

      const capAddress = firstByTag(capEl, 'Address');
      const capAddressValues = capAddress
        ? childrenByTag(capAddress, 'P').map((p) => ({
            pType: getAttr(p, 'type'),
            value: p.textContent?.trim() || '',
          }))
        : [];

      const mergedConnValues = [...physConns, ...capAddressValues];
      const ip = selectPhysValue(mergedConnValues, ['IP', 'IPADDR', 'IPv4']);
      const netmask = selectPhysValue(mergedConnValues, ['Subnet', 'Subnet-Mask', 'NETMASK', 'MASK']);
      const gateway = selectPhysValue(mergedConnValues, ['Gateway', 'GW', 'GATEWAY-IP']);

      connectedAps.push({
        iedName,
        apName,
        ip,
        netmask,
        gateway,
        physConns: mergedConnValues,
      });

      for (const gseEl of childrenByTag(capEl, 'GSE')) {
        const comm: GseCommModel = {
          iedName,
          apName,
          ldInst: getAttr(gseEl, 'ldInst'),
          cbName: getAttr(gseEl, 'cbName'),
          minTime: getAttr(gseEl, 'MinTime') || getAttr(gseEl, 'minTime') || firstByTag(gseEl, 'MinTime')?.textContent?.trim() || undefined,
          maxTime: getAttr(gseEl, 'MaxTime') || getAttr(gseEl, 'maxTime') || firstByTag(gseEl, 'MaxTime')?.textContent?.trim() || undefined,
        };
        const address = firstByTag(gseEl, 'Address');
        if (address) {
          const pValues = childrenByTag(address, 'P').map((p) => ({
            type: getAttr(p, 'type') || '',
            value: p.textContent?.trim() || '',
          }));
          comm.mac = selectPhysValue(pValues, ['MAC-Address', 'MAC']);
          comm.appId = selectPhysValue(pValues, ['APPID']);
          comm.vlanId = selectPhysValue(pValues, ['VLAN-ID']);
          comm.vlanPriority = selectPhysValue(pValues, ['VLAN-PRIORITY', 'VLAN_PRIORITY', 'VLANPRIORITY']);
        }
        gseComms.push(comm);
      }

      for (const smvEl of childrenByTag(capEl, 'SMV')) {
        const comm: SmvCommModel = {
          iedName,
          apName,
          ldInst: getAttr(smvEl, 'ldInst'),
          cbName: getAttr(smvEl, 'cbName'),
        };
        const address = firstByTag(smvEl, 'Address');
        if (address) {
          const pValues = childrenByTag(address, 'P').map((p) => ({
            type: getAttr(p, 'type') || '',
            value: p.textContent?.trim() || '',
          }));
          comm.mac = selectPhysValue(pValues, ['MAC-Address', 'MAC']);
          comm.appId = selectPhysValue(pValues, ['APPID']);
          comm.vlanId = selectPhysValue(pValues, ['VLAN-ID']);
          comm.vlanPriority = selectPhysValue(pValues, ['VLAN-PRIORITY', 'VLAN_PRIORITY', 'VLANPRIORITY']);
          comm.smpRate = selectPhysValue(pValues, ['SampleRate', 'smpRate', 'SmpRate']);
          comm.smpMod = selectPhysValue(pValues, ['SmpMod', 'smpMod']);
          comm.nofASDU = selectPhysValue(pValues, ['NoASDU', 'nofASDU']);
        }
        smvComms.push(comm);
      }

      const capKey = `connectedap:${subnetName}:${iedName}:${apName}`;
      snippets[capKey] = snippetFor(capEl);
    }

    const subKey = `subnetwork:${subnetName}`;
    snippets[subKey] = snippetFor(subnetEl);
    subNetworks.push({
      name: subnetName,
      type: getAttr(subnetEl, 'type'),
      connectedAps,
    });
  }

  return { subNetworks, gseComms, smvComms };
}

function hydrateAccessPointNetworkInfo(ieds: IedModel[], subNetworks: SubNetworkModel[]): void {
  const connectedAps = subNetworks.flatMap((s) => s.connectedAps);

  for (const ied of ieds) {
    for (const ap of ied.accessPoints) {
      const cap = connectedAps.find((c) => c.iedName === ied.name && c.apName === ap.name);
      if (!cap) {
        continue;
      }

      ap.ip = cap.ip;
      ap.mac = selectPhysValue(cap.physConns, ['MAC', 'MAC-Address']);
    }
  }
}

function hydrateIedBayInfo(ieds: IedModel[], bays: BayModel[]): void {
  const map = new Map<string, Set<string>>();
  for (const bay of bays) {
    for (const iedName of bay.iedNames) {
      if (!map.has(iedName)) {
        map.set(iedName, new Set());
      }
      map.get(iedName)!.add(bay.name);
    }
  }

  for (const ied of ieds) {
    ied.bayNames = Array.from(map.get(ied.name) || []);
  }
}

function selectPhysValue(values: Array<{ pType?: string; type?: string; value: string }>, keys: string[]): string | undefined {
  const upperKeys = keys.map((k) => k.toUpperCase());
  const match = values.find((v) => {
    const t = (v.pType || v.type || '').toUpperCase();
    return upperKeys.includes(t);
  });
  return match?.value;
}

function parseBooleanAttr(value?: string): boolean | undefined {
  if (!value) {
    return undefined;
  }
  const normalized = value.trim().toLowerCase();
  if (normalized === 'true') {
    return true;
  }
  if (normalized === 'false') {
    return false;
  }
  return undefined;
}

function walkLnElements(
  root: Element,
  callback: (ctx: {
    iedName: string;
    apName: string;
    ldInst: string;
    lnClass: string;
    lnInst?: string;
    lnEl: Element;
  }) => void,
): void {
  for (const iedEl of childrenByTag(root, 'IED')) {
    const iedName = getAttr(iedEl, 'name') || 'unnamed-ied';
    for (const apEl of childrenByTag(iedEl, 'AccessPoint')) {
      const apName = getAttr(apEl, 'name') || 'AP';
      const serverEl = firstByTag(apEl, 'Server');
      if (!serverEl) {
        continue;
      }
      for (const ldEl of childrenByTag(serverEl, 'LDevice')) {
        const ldInst = getAttr(ldEl, 'inst') || 'LD';
        for (const lnEl of [...childrenByTag(ldEl, 'LN0'), ...childrenByTag(ldEl, 'LN')]) {
          const lnClass = getAttr(lnEl, 'lnClass') || (lnEl.tagName === 'LN0' ? 'LLN0' : 'LN');
          const lnInst = getAttr(lnEl, 'inst') || undefined;
          callback({ iedName, apName, ldInst, lnClass, lnInst, lnEl });
        }
      }
    }
  }
}

function buildEdges(input: {
  ieds: IedModel[];
  dataSets: DataSetModel[];
  gseControls: GooseControlModel[];
  svControls: SvControlModel[];
  reportControls: ReportControlModel[];
  extRefs: Array<{ ownerIed: string; extRef: ExtRefModel }>;
  gseComms: GseCommModel[];
}): EdgeModel[] {
  const edges: EdgeModel[] = [];
  const iedNames = input.ieds.map((i) => i.name);
  const dataSetMap = new Map(input.dataSets.map((ds) => [datasetKey(ds), ds]));

  for (const ctrl of input.gseControls) {
    const dataset = ctrl.datSet
      ? dataSetMap.get(datasetKeyFromControl(ctrl.iedName, ctrl.ldInst, ctrl.lnClass, ctrl.lnInst, ctrl.datSet))
      : undefined;
    const refs = findExtRefSubscribers(input.extRefs, ctrl, dataset?.fcdas || []);

    if (refs.length > 0) {
      for (const ref of refs) {
        edges.push({
          key: `edge:goose:${ctrl.key}:${ref.ownerIed}`,
          signalType: 'GOOSE',
          publisherIed: ctrl.iedName,
          subscriberIed: ref.ownerIed,
          controlBlockName: ctrl.name,
          dataSetName: ctrl.datSet,
          status: ref.quality,
          reason: ref.reason,
          fcdas: dataset?.fcdas || [],
        });
      }
    } else {
      const probable = iedNames.filter((name) => name !== ctrl.iedName).slice(0, 2);
      if (probable.length > 0) {
        for (const subscriber of probable) {
          edges.push({
            key: `edge:goose:${ctrl.key}:${subscriber}`,
            signalType: 'GOOSE',
            publisherIed: ctrl.iedName,
            subscriberIed: subscriber,
            controlBlockName: ctrl.name,
            dataSetName: ctrl.datSet,
            status: 'unresolved',
            reason: 'No ExtRef match found; probable subscriber.',
            fcdas: dataset?.fcdas || [],
          });
        }
      }
    }

    // If Comm GSE has explicit cbName link we can upgrade uncertainty wording.
    const comm = input.gseComms.find((c) => c.iedName === ctrl.iedName && c.cbName === ctrl.name);
    if (!comm) {
      continue;
    }
    for (const edge of edges) {
      if (edge.controlBlockName === ctrl.name && edge.publisherIed === ctrl.iedName && edge.status === 'unresolved') {
        edge.status = 'probable';
        edge.reason = 'Matched GSEControl to Communication GSE, subscriber still unresolved.';
      }
    }
  }

  // Guess-based SV fallback is only meaningful when the file carries no SV ExtRef info at all —
  // otherwise an unmatched control simply has no engineered subscribers.
  const anySvRefs = input.extRefs.some((r) => {
    const st = (r.extRef.serviceType || '').toLowerCase();
    return st.includes('smv') || st.includes('sv') || st.includes('sample');
  });

  for (const ctrl of input.svControls) {
    const dataset = ctrl.datSet
      ? dataSetMap.get(datasetKeyFromControl(ctrl.iedName, ctrl.ldInst, ctrl.lnClass, ctrl.lnInst, ctrl.datSet))
      : undefined;
    const refs = input.extRefs.filter((r) => {
      if (r.ownerIed === ctrl.iedName) {
        return false;
      }

      const st = (r.extRef.serviceType || '').toLowerCase();
      const svService = st.includes('smv') || st.includes('sv') || st.includes('sample');
      // Respect explicit service type if present; do not use GOOSE/Report refs for SV.
      if (st && !svService) {
        return false;
      }
      // If the ExtRef explicitly names a publisher or source CB, it must match this control —
      // a loose service-type match alone must not pair a subscriber with every SV control.
      if (r.extRef.iedName && r.extRef.iedName !== ctrl.iedName) {
        return false;
      }
      if (r.extRef.srcCBName && r.extRef.srcCBName !== ctrl.name) {
        return false;
      }
      if (!compareMaybe(r.extRef.srcLDInst || r.extRef.ldInst, ctrl.ldInst)) {
        return false;
      }

      return svService || Boolean(r.extRef.iedName) || Boolean(r.extRef.srcCBName);
    });

    if (refs.length > 0) {
      for (const ref of refs) {
        const resolved = ref.extRef.iedName === ctrl.iedName && (ref.extRef.srcCBName ? ref.extRef.srcCBName === ctrl.name : true);
        edges.push({
          key: `edge:sv:${ctrl.key}:${ref.ownerIed}`,
          signalType: 'SV',
          publisherIed: ctrl.iedName,
          subscriberIed: ref.ownerIed,
          controlBlockName: ctrl.name,
          dataSetName: ctrl.datSet,
          status: resolved ? 'resolved' : 'probable',
          reason: resolved ? undefined : 'SV subscriber inferred from ExtRef serviceType/srcCBName.',
          fcdas: dataset?.fcdas || [],
        });
      }
    } else if (!anySvRefs) {
      const probable = iedNames.filter((name) => name !== ctrl.iedName).slice(0, 2);
      for (const subscriber of probable) {
        edges.push({
          key: `edge:sv:${ctrl.key}:${subscriber}`,
          signalType: 'SV',
          publisherIed: ctrl.iedName,
          subscriberIed: subscriber,
          controlBlockName: ctrl.name,
          dataSetName: ctrl.datSet,
          status: 'unresolved',
          reason: 'No SV ExtRef match found.',
          fcdas: dataset?.fcdas || [],
        });
      }
    }
  }

  for (const ctrl of input.reportControls) {
    const dataset = ctrl.datSet
      ? dataSetMap.get(datasetKeyFromControl(ctrl.iedName, ctrl.ldInst, ctrl.lnClass, ctrl.lnInst, ctrl.datSet))
      : undefined;

    const explicitClients = ctrl.clients.filter((c) => c.iedName && c.iedName !== ctrl.iedName);
    if (explicitClients.length > 0) {
      for (const client of explicitClients) {
        edges.push({
          key: `edge:report:${ctrl.key}:${client.iedName}`,
          signalType: 'REPORT',
          publisherIed: ctrl.iedName,
          subscriberIed: client.iedName || 'unknown',
          controlBlockName: ctrl.name,
          dataSetName: ctrl.datSet,
          status: 'resolved',
          reason: ctrl.buffered ? 'Buffered report with explicit ClientLN.' : 'Unbuffered report with explicit ClientLN.',
          fcdas: dataset?.fcdas || [],
        });
      }
      continue;
    }

    const inferredByExtRef = input.extRefs
      .filter((ref) => ref.ownerIed !== ctrl.iedName && ref.extRef.serviceType?.toLowerCase().includes('report'))
      .map((ref) => ref.ownerIed);

    if (inferredByExtRef.length > 0) {
      for (const subscriber of inferredByExtRef) {
        edges.push({
          key: `edge:report:${ctrl.key}:${subscriber}`,
          signalType: 'REPORT',
          publisherIed: ctrl.iedName,
          subscriberIed: subscriber,
          controlBlockName: ctrl.name,
          dataSetName: ctrl.datSet,
          status: 'probable',
          reason: 'Subscriber inferred from ExtRef serviceType=Report.',
          fcdas: dataset?.fcdas || [],
        });
      }
    }
  }

  return dedupeEdges(edges);
}

function findExtRefSubscribers(
  refs: Array<{ ownerIed: string; extRef: ExtRefModel }>,
  publisher: Pick<GooseControlModel, 'iedName' | 'name' | 'ldInst'>,
  fcdas: FcdaModel[],
): Array<{ ownerIed: string; quality: 'resolved' | 'probable'; reason?: string }> {
  const matches = new Map<string, { ownerIed: string; quality: 'resolved' | 'probable'; reason?: string }>();

  for (const ref of refs) {
    if (ref.ownerIed === publisher.iedName) {
      continue;
    }

    const serviceType = (ref.extRef.serviceType || '').toLowerCase();
    const hasServiceType = serviceType.length > 0;
    const isGooseService = serviceType.includes('goose');
    const pointsToPublisher = ref.extRef.iedName === publisher.iedName;
    const sourceLdInst = ref.extRef.srcLDInst || ref.extRef.ldInst;

    // Respect explicit service type if present; do not use SMV/Report refs for GOOSE.
    if (hasServiceType && !isGooseService) {
      continue;
    }
    // If ExtRef explicitly names a source CB, it must match this GSEControl.
    if (ref.extRef.srcCBName && ref.extRef.srcCBName !== publisher.name) {
      continue;
    }
    // If ExtRef carries LD reference, keep publisher LD aligned.
    if (sourceLdInst && sourceLdInst !== publisher.ldInst) {
      continue;
    }

    if (pointsToPublisher) {
      const hasObjectSelector = Boolean(
        ref.extRef.ldInst || ref.extRef.lnClass || ref.extRef.lnInst || ref.extRef.doName || ref.extRef.daName,
      );
      const resolved =
        hasObjectSelector &&
        fcdas.some((fcda) =>
          matchesProvided(fcda.ldInst, ref.extRef.ldInst) &&
          matchesProvided(fcda.lnClass, ref.extRef.lnClass) &&
          matchesProvided(fcda.lnInst, ref.extRef.lnInst) &&
          matchesProvided(fcda.doName, ref.extRef.doName) &&
          matchesProvided(fcda.daName, ref.extRef.daName),
        );

      matches.set(ref.ownerIed, {
        ownerIed: ref.ownerIed,
        quality: resolved ? 'resolved' : 'probable',
        reason: resolved
          ? undefined
          : 'ExtRef points to publisher but exact FCDA/object selector mapping is incomplete.',
      });
      continue;
    }

    if (!ref.extRef.iedName && isGooseService) {
      matches.set(ref.ownerIed, {
        ownerIed: ref.ownerIed,
        quality: 'probable',
        reason: 'GOOSE ExtRef without iedName.',
      });
    }
  }

  return Array.from(matches.values());
}

function compareMaybe(left?: string, right?: string): boolean {
  if (!left || !right) {
    return true;
  }
  return left === right;
}

function matchesProvided(actual?: string, expected?: string): boolean {
  if (!expected) {
    return true;
  }
  return actual === expected;
}

function datasetKey(ds: DataSetModel): string {
  return datasetKeyFromControl(ds.iedName, ds.ldInst, ds.lnClass, ds.lnInst, ds.name);
}

function datasetKeyFromControl(
  iedName: string,
  ldInst: string,
  lnClass: string,
  lnInst: string | undefined,
  datasetName: string,
): string {
  return `${iedName}:${ldInst}:${lnClass}:${lnInst || ''}:${datasetName}`;
}

function dedupeEdges(edges: EdgeModel[]): EdgeModel[] {
  const map = new Map<string, EdgeModel>();
  for (const edge of edges) {
    const key = `${edge.signalType}:${edge.publisherIed}:${edge.subscriberIed}:${edge.controlBlockName || ''}`;
    const current = map.get(key);
    if (!current) {
      map.set(key, edge);
      continue;
    }

    const rank = { unresolved: 0, probable: 1, resolved: 2 };
    if (rank[edge.status] > rank[current.status]) {
      map.set(key, edge);
    }
  }
  return Array.from(map.values());
}
