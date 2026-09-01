import type {
  EdgeModel,
  GseCommModel,
  SclModel,
  SmvCommModel,
} from '../model/types';
import type {
  FlowCounter,
  NetworkPortFilterRow,
  NetworkPortSummaryRow,
  NetworkSwitchNode,
  NetworkTopologyView,
  NetworkTrafficFilters,
  PortFlowItem,
  PortTrafficLink,
  PortTrafficSummary,
  TrafficProtocol,
} from './types';

export const DEFAULT_NETWORK_FILTERS: NetworkTrafficFilters = {
  protocolFilter: {
    GOOSE: true,
    SV: true,
    REPORT: true,
  },
  direction: 'both',
  resolution: 'all',
};

export function discoverSubNetworks(model: SclModel | undefined): string[] {
  if (!model) {
    return [];
  }
  return model.subNetworks.map((s) => s.name);
}

export function buildNetworkTopologyView(
  model: SclModel,
  subNetworkName: string,
  filters: NetworkTrafficFilters,
): NetworkTopologyView {
  const subNetworks = discoverSubNetworks(model);
  const selected = model.subNetworks.find((s) => s.name === subNetworkName) || model.subNetworks[0];
  if (!selected) {
    return {
      selectedSubNetwork: '',
      subNetworks,
      model,
      switches: [],
      ports: [],
      links: [],
    };
  }

  const iedMap = new Map(model.ieds.map((ied) => [ied.name, ied]));
  const portSummaries = new Map<string, PortTrafficSummary>();
  const capsByPortKey = new Map<string, (typeof selected.connectedAps)[number]>();
  const switchCandidates = new Set<string>();

  for (const cap of selected.connectedAps) {
    const key = portKey(cap.iedName, cap.apName);
    const ied = iedMap.get(cap.iedName);
    if (isSwitchCandidate(model, cap.iedName, ied?.desc)) {
      switchCandidates.add(key);
      continue;
    }

    const ap = ied?.accessPoints.find((item) => item.name === cap.apName);
    const mac = cap.physConns.find((p) => isMacType(p.pType || ''))?.value || ap?.mac;
    const summary: PortTrafficSummary = {
      key,
      iedName: cap.iedName,
      iedDesc: ied?.desc,
      apName: cap.apName,
      subNetwork: selected.name,
      ip: cap.ip || ap?.ip,
      mac,
      flowItems: [],
      filteredFlowItems: [],
      counts: emptyCounter(),
      filteredCounts: emptyCounter(),
    };
    portSummaries.set(key, summary);
    capsByPortKey.set(key, cap);
  }

  const switches = buildSwitches(selected.name, selected.connectedAps, switchCandidates);

  for (const edge of model.edges) {
    const protocol = edge.signalType;
    const outgoingPort = resolvePortForEndpoint(
      model,
      selected.name,
      edge.publisherIed,
      edge,
      'out',
      switchCandidates,
    );
    if (outgoingPort) {
      const flow = buildPortFlowItem(model, selected.name, edge, protocol, 'out', outgoingPort);
      const summary = portSummaries.get(outgoingPort);
      if (summary) {
        summary.flowItems.push(flow);
      }
    }

    const incomingPort = resolvePortForEndpoint(
      model,
      selected.name,
      edge.subscriberIed,
      edge,
      'in',
      switchCandidates,
    );
    if (incomingPort) {
      const flow = buildPortFlowItem(model, selected.name, edge, protocol, 'in', incomingPort);
      const summary = portSummaries.get(incomingPort);
      if (summary) {
        summary.flowItems.push(flow);
      }
    }
  }

  const ports: PortTrafficSummary[] = Array.from(portSummaries.values()).map((port) => {
    const filtered = port.flowItems.filter((item) => flowMatches(item, filters));
    return {
      ...port,
      counts: countFlows(port.flowItems),
      filteredFlowItems: filtered,
      filteredCounts: countFlows(filtered),
    };
  });

  const links: PortTrafficLink[] = ports.map((port, index) => {
    const switchId = resolveSwitchForPort(switches, capsByPortKey.get(port.key), index);
    return {
      id: `netlink:${selected.name}:${port.iedName}:${port.apName}:${switchId}`,
      iedName: port.iedName,
      apName: port.apName,
      portKey: port.key,
      subNetwork: selected.name,
      switchId,
      flowItems: port.flowItems,
      filteredFlowItems: port.filteredFlowItems,
      counts: port.counts,
      filteredCounts: port.filteredCounts,
    };
  });

  return {
    selectedSubNetwork: selected.name,
    subNetworks,
    model,
    switches,
    ports,
    links,
  };
}

export function buildNetworkPortSummaryRows(view: NetworkTopologyView): NetworkPortSummaryRow[] {
  return view.ports.map((port) => ({
    ied: port.iedName,
    port: port.apName,
    subNetwork: port.subNetwork,
    ip: port.ip || '',
    mac: port.mac || '',
    gooseOutCount: port.counts.GOOSE.out,
    gooseInCount: port.counts.GOOSE.in,
    svOutCount: port.counts.SV.out,
    svInCount: port.counts.SV.in,
    reportOutCount: port.counts.REPORT.out,
    reportInCount: port.counts.REPORT.in,
    unresolvedCount: port.counts.unresolved,
  }));
}

export function buildNetworkPortFilterRows(view: NetworkTopologyView): NetworkPortFilterRow[] {
  return view.ports.flatMap((port) =>
    port.flowItems.map((item) => ({
      ied: port.iedName,
      port: port.apName,
      subNetwork: port.subNetwork,
      protocol: item.protocol,
      direction: item.direction,
      multicastDstMac: item.multicastDstMac || '',
      vlanId: item.vlanId || '',
      vlanPriority: item.vlanPriority || '',
      appId: item.appId || '',
      source: item.sourceIed,
      destination: item.destinationIed,
      controlBlock: item.controlBlockName || '',
      dataSet: item.dataSetName || '',
      status: item.status,
      message: item.message || '',
    })),
  );
}

function flowMatches(item: PortFlowItem, filters: NetworkTrafficFilters): boolean {
  if (!filters.protocolFilter[item.protocol]) {
    return false;
  }
  if (filters.direction !== 'both' && item.direction !== filters.direction) {
    return false;
  }
  if (filters.resolution === 'resolved') {
    return item.status === 'resolved';
  }
  if (filters.resolution === 'unresolved') {
    return item.status !== 'resolved';
  }
  return true;
}

function resolvePortForEndpoint(
  model: SclModel,
  subNetworkName: string,
  iedName: string,
  edge: EdgeModel,
  direction: 'in' | 'out',
  switchCandidates: Set<string>,
): string | undefined {
  const subnet = model.subNetworks.find((s) => s.name === subNetworkName);
  if (!subnet) {
    return undefined;
  }
  const connected = subnet.connectedAps.filter((cap) => cap.iedName === iedName);
  if (connected.length === 0) {
    return undefined;
  }

  const apName = direction === 'out' ? resolvePublisherApName(model, edge) : undefined;
  const preferred =
    (apName ? connected.find((cap) => cap.apName === apName) : undefined) ||
    connected[0];
  if (!preferred) {
    return undefined;
  }

  const key = portKey(preferred.iedName, preferred.apName);
  if (switchCandidates.has(key)) {
    return undefined;
  }
  return key;
}

function resolvePublisherApName(model: SclModel, edge: EdgeModel): string | undefined {
  if (!edge.controlBlockName) {
    return undefined;
  }
  if (edge.signalType === 'GOOSE') {
    return (
      model.gseControls.find((cb) => cb.iedName === edge.publisherIed && cb.name === edge.controlBlockName)?.apName ||
      model.gseComms.find((comm) => comm.iedName === edge.publisherIed && comm.cbName === edge.controlBlockName)?.apName
    );
  }
  if (edge.signalType === 'SV') {
    return (
      model.svControls.find((cb) => cb.iedName === edge.publisherIed && cb.name === edge.controlBlockName)?.apName ||
      model.smvComms.find((comm) => comm.iedName === edge.publisherIed && comm.cbName === edge.controlBlockName)?.apName
    );
  }
  return model.reportControls.find((cb) => cb.iedName === edge.publisherIed && cb.name === edge.controlBlockName)?.apName;
}

function buildPortFlowItem(
  model: SclModel,
  subNetwork: string,
  edge: EdgeModel,
  protocol: TrafficProtocol,
  direction: 'in' | 'out',
  portKeyValue: string,
): PortFlowItem {
  const [iedName, apName] = splitPortKey(portKeyValue);
  const comm = resolveComm(model, edge, apName);
  const summaryPort = findPortIp(model, subNetwork, iedName, apName);
  return {
    id: `flow:${edge.key}:${direction}:${iedName}:${apName}`,
    edgeKey: edge.key,
    protocol,
    direction,
    subNetwork,
    iedName,
    apName,
    peerIed: direction === 'out' ? edge.subscriberIed : edge.publisherIed,
    sourceIed: edge.publisherIed,
    destinationIed: edge.subscriberIed,
    controlBlockName: edge.controlBlockName,
    dataSetName: edge.dataSetName,
    status: edge.status,
    message: edge.status === 'resolved' ? undefined : edge.reason || 'Unresolved mapping.',
    multicastDstMac: comm?.mac,
    vlanId: comm?.vlanId,
    vlanPriority: comm?.vlanPriority,
    appId: comm?.appId,
    ip: protocol === 'REPORT' ? summaryPort?.ip : undefined,
  };
}

function resolveComm(
  model: SclModel,
  edge: EdgeModel,
  apName: string,
): GseCommModel | SmvCommModel | undefined {
  if (edge.signalType === 'GOOSE') {
    return (
      model.gseComms.find(
        (comm) =>
          comm.iedName === edge.publisherIed &&
          (!edge.controlBlockName || comm.cbName === edge.controlBlockName) &&
          comm.apName === apName,
      ) ||
      model.gseComms.find(
        (comm) =>
          comm.iedName === edge.publisherIed &&
          (!edge.controlBlockName || comm.cbName === edge.controlBlockName),
      ) ||
      model.gseComms.find((comm) => comm.iedName === edge.publisherIed && comm.apName === apName)
    );
  }
  if (edge.signalType === 'SV') {
    return (
      model.smvComms.find(
        (comm) =>
          comm.iedName === edge.publisherIed &&
          (!edge.controlBlockName || comm.cbName === edge.controlBlockName) &&
          comm.apName === apName,
      ) ||
      model.smvComms.find(
        (comm) =>
          comm.iedName === edge.publisherIed &&
          (!edge.controlBlockName || comm.cbName === edge.controlBlockName),
      ) ||
      model.smvComms.find((comm) => comm.iedName === edge.publisherIed && comm.apName === apName)
    );
  }
  return undefined;
}

function findPortIp(
  model: SclModel,
  subNetworkName: string,
  iedName: string,
  apName: string,
): { ip?: string } | undefined {
  const subnet = model.subNetworks.find((s) => s.name === subNetworkName);
  const cap = subnet?.connectedAps.find((item) => item.iedName === iedName && item.apName === apName);
  if (cap?.ip) {
    return { ip: cap.ip };
  }
  const ied = model.ieds.find((item) => item.name === iedName);
  const ap = ied?.accessPoints.find((item) => item.name === apName);
  if (!ap) {
    return undefined;
  }
  return { ip: ap.ip };
}

function buildSwitches(
  subNetworkName: string,
  connectedAps: SclModel['subNetworks'][number]['connectedAps'],
  switchCandidates: Set<string>,
): NetworkSwitchNode[] {
  const explicit = connectedAps
    .filter((cap) => switchCandidates.has(portKey(cap.iedName, cap.apName)))
    .map((cap) => ({
      id: `switch:${cap.iedName}:${cap.apName}`,
      name: `${cap.iedName}/${cap.apName}`,
      explicit: true,
      iedName: cap.iedName,
      apName: cap.apName,
    }));
  if (explicit.length > 0) {
    return explicit;
  }
  return [
    {
      id: `switch:subnetwork:${subNetworkName}`,
      name: `SubNetwork: ${subNetworkName}`,
      explicit: false,
    },
  ];
}

function resolveSwitchForPort(
  switches: NetworkSwitchNode[],
  cap: { physConns: Array<{ pType?: string; value: string }> } | undefined,
  index: number,
): string {
  if (switches.length === 1) {
    return switches[0].id;
  }
  const phys = (cap?.physConns || []).map((p) => p.value.toLowerCase()).join(' ');
  const matched = switches.find((s) => {
    const token = `${s.iedName || ''} ${s.apName || ''}`.trim().toLowerCase();
    return token.length > 0 && phys.includes(token);
  });
  if (matched) {
    return matched.id;
  }
  return switches[index % switches.length].id;
}

function isSwitchCandidate(model: SclModel, iedName: string, desc?: string): boolean {
  const ied = model.ieds.find((item) => item.name === iedName);
  const hasControls =
    model.gseControls.some((cb) => cb.iedName === iedName) ||
    model.svControls.some((cb) => cb.iedName === iedName) ||
    model.reportControls.some((cb) => cb.iedName === iedName);
  const hasFlows = model.edges.some((edge) => edge.publisherIed === iedName || edge.subscriberIed === iedName);
  const text = `${iedName} ${desc || ''}`.toLowerCase();
  const looksLikeSwitch = /(switch|scalance|ruggedcom|ethernet switch|sw[0-9_-])/.test(text);
  if (looksLikeSwitch) {
    return true;
  }
  // Clients (IHMI/ITCI access points) and clocks (clock="true") also have no LDevices/controls,
  // but they are endpoints — never infer them as switches. With no real switch in the file the
  // topology falls back to one dummy subnetwork switch instead.
  const isClientOrClock = (ied?.accessPoints || []).some(
    (ap) => ap.clock || ap.clientLnClasses.length > 0,
  );
  const noIedModelData = (ied?.lDevices.length || 0) === 0;
  return !hasControls && !hasFlows && noIedModelData && !isClientOrClock;
}

function countFlows(items: PortFlowItem[]): FlowCounter {
  const counter = emptyCounter();
  for (const item of items) {
    if (item.direction === 'in') {
      counter[item.protocol].in += 1;
    } else {
      counter[item.protocol].out += 1;
    }
    counter.total += 1;
    if (item.status !== 'resolved') {
      counter.unresolved += 1;
    }
  }
  return counter;
}

function emptyCounter(): FlowCounter {
  return {
    GOOSE: { in: 0, out: 0 },
    SV: { in: 0, out: 0 },
    REPORT: { in: 0, out: 0 },
    unresolved: 0,
    total: 0,
  };
}

function isMacType(type: string): boolean {
  const upper = type.toUpperCase();
  return upper.includes('MAC');
}

function portKey(iedName: string, apName: string): string {
  return `${iedName}::${apName}`;
}

function splitPortKey(key: string): [string, string] {
  const idx = key.indexOf('::');
  if (idx < 0) {
    return [key, ''];
  }
  return [key.slice(0, idx), key.slice(idx + 2)];
}
