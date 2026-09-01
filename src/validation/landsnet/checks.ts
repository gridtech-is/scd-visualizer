import type { SclModel } from '../../model/types';
import type { ValidationIssue } from '../types';
import { buildIssueId } from '../utils';
import type { LandsnetCheckSummary, LandsnetDictionaries } from './types';

export const enum CheckCode {
  // IEC 61850 general rules (reclassified from LNET)
  IEC_009 = 'IEC_009',
  IEC_010 = 'IEC_010',
  IEC_011 = 'IEC_011',
  IEC_012 = 'IEC_012',
  // Landsnet-specific rules
  LNET_003 = 'LNET_003',
  LNET_004 = 'LNET_004',
  LNET_005 = 'LNET_005',
  LNET_006 = 'LNET_006',
  LNET_007 = 'LNET_007',
  LNET_008 = 'LNET_008',
  LNET_010 = 'LNET_010',
  LNET_011 = 'LNET_011',
  LNET_012 = 'LNET_012',
  LNET_013 = 'LNET_013',
  LNET_014 = 'LNET_014',
  LNET_016 = 'LNET_016',
  LNET_017 = 'LNET_017',
  LNET_018 = 'LNET_018',
  // General IEC 61850 rules
  IEC_001 = 'IEC_001',
  IEC_002 = 'IEC_002',
  IEC_003 = 'IEC_003',
  IEC_004 = 'IEC_004',
  IEC_005 = 'IEC_005',
  IEC_006 = 'IEC_006',
  IEC_007 = 'IEC_007',
  IEC_008 = 'IEC_008',
  IEC_013 = 'IEC_013',
  IEC_014 = 'IEC_014',
  IEC_015 = 'IEC_015',
  IEC_016 = 'IEC_016',
  LNET_019 = 'LNET_019',
  LNET_020 = 'LNET_020',
}

interface CheckInfo {
  id: number;
  code: CheckCode;
  title: string;
}

interface CapRecord {
  subNetwork: string;
  iedName: string;
  apName: string;
  ip?: string;
  netmask?: string;
  gateway?: string;
}

const CHECKS: CheckInfo[] = [
  // IEC general rules (reclassified)
  { id: 1,  code: CheckCode.IEC_009, title: 'No duplicate IED names' },
  { id: 2,  code: CheckCode.IEC_010, title: 'No duplicate IP addresses in each subnet' },
  { id: 9,  code: CheckCode.IEC_011, title: 'No duplicate GOOSE MAC or APPID' },
  { id: 15, code: CheckCode.IEC_012, title: 'No duplicate SV smvID, MAC, APPID' },
  // Landsnet-specific rules
  { id: 3,  code: CheckCode.LNET_003, title: 'Consistent 3rd IP octet per station/subnetwork (except 10.30.200.*)' },
  { id: 4,  code: CheckCode.LNET_004, title: '192.168.* uses mask 255.255.255.0 and gateway 0.0.0.0' },
  { id: 5,  code: CheckCode.LNET_005, title: '10.30.* uses mask 255.255.255.0 and gateway 0.0.0.0' },
  { id: 6,  code: CheckCode.LNET_006, title: '172.25.* uses mask 255.255.255.0 and gateway *.254' },
  { id: 7,  code: CheckCode.LNET_007, title: 'All MMS reports have indexed=true' },
  { id: 8,  code: CheckCode.LNET_008, title: 'GOOSE naming convention for control block and dataset' },
  { id: 10, code: CheckCode.LNET_010, title: 'GOOSE MAC station byte matches IP 3rd octet' },
  { id: 11, code: CheckCode.LNET_011, title: 'GOOSE P-profile APPID/VLAN/MinTime/MaxTime rule' },
  { id: 12, code: CheckCode.LNET_012, title: 'GOOSE non-P profile APPID/VLAN/MinTime/MaxTime rule' },
  { id: 13, code: CheckCode.LNET_013, title: 'IED EW0** includes gcPtrp*, gcPev*, gcInd*' },
  { id: 14, code: CheckCode.LNET_014, title: 'IED EW8** includes gcPtrp*, gcInd*' },
  { id: 16, code: CheckCode.LNET_016, title: 'All SV APPID starts with 4' },
  { id: 17, code: CheckCode.LNET_017, title: 'SV MAC station byte matches IP 3rd octet' },
  { id: 18, code: CheckCode.LNET_018, title: 'SV APPID/VLAN priority profile rule' },
  // General IEC 61850 rules
  { id: 19, code: CheckCode.IEC_001, title: 'GOOSE subscription completeness' },
  { id: 20, code: CheckCode.IEC_002, title: 'SV subscription completeness' },
  { id: 21, code: CheckCode.IEC_003, title: 'ExtRef fully resolved' },
  { id: 22, code: CheckCode.IEC_004, title: 'IED naming convention' },
  { id: 23, code: CheckCode.IEC_005, title: 'IED placed in substation hierarchy' },
  { id: 24, code: CheckCode.IEC_006, title: 'DataTypeTemplates completeness' },
  { id: 25, code: CheckCode.IEC_007, title: 'GOOSE/SV dataset not empty' },
  { id: 26, code: CheckCode.IEC_008, title: 'confRev consistency' },
  { id: 27, code: CheckCode.IEC_013, title: 'Report client binding' },
  { id: 28, code: CheckCode.IEC_014, title: 'GOOSE/SV supervision LNs (LGOS/LSVS)' },
  { id: 29, code: CheckCode.IEC_015, title: 'SV sample rate per IEC 61869-9' },
  { id: 30, code: CheckCode.LNET_019, title: 'MMS report naming convention (r + dataset)' },
  { id: 31, code: CheckCode.LNET_020, title: 'Substation section KKS naming' },
  { id: 32, code: CheckCode.IEC_016, title: 'ConductingEquipment has LNode binding' },
];

export function runLandsnetChecks(
  model: SclModel,
  dictionaries: LandsnetDictionaries,
): { issues: ValidationIssue[]; checks: LandsnetCheckSummary[] } {
  const issues: ValidationIssue[] = [];
  const issueCountByCheck = new Map<number, number>();

  const capRecords = flattenCaps(model);
  const capIndex = new Map(capRecords.map((cap) => [`${cap.iedName}:${cap.apName}`, cap]));

  const addIssue = (params: {
    checkId: number;
    codeSuffix: string;
    message: string;
    path: string;
    fixHint?: string;
    severity?: ValidationIssue['severity'];
    protocol?: ValidationIssue['protocol'];
    context?: ValidationIssue['context'];
    entityRef?: ValidationIssue['entityRef'];
  }): void => {
    const baseCode = checkCode(params.checkId);
    const code = `${baseCode}_${params.codeSuffix}`;
    const hint = params.fixHint ?? '';
    issues.push({
      id: buildIssueId(code, `${params.path}:${params.message}`),
      severity: params.severity ?? 'error',
      category: 'semantic',
      code,
      message: params.message,
      path: params.path,
      protocol: params.protocol || 'Generic',
      context: params.context || {},
      entityRef: params.entityRef || { type: 'Unknown', id: code },
      resolved: false,
      fixHint: hint,
      quickFix: hint,
    });
    issueCountByCheck.set(params.checkId, (issueCountByCheck.get(params.checkId) || 0) + 1);
  };

  // #1 duplicate IED names
  {
    const byName = new Map<string, number>();
    for (const ied of model.ieds) {
      byName.set(ied.name, (byName.get(ied.name) || 0) + 1);
    }
    for (const [name, count] of byName.entries()) {
      if (count <= 1) {
        continue;
      }
      addIssue({
        checkId: 1,
        codeSuffix: 'DUPLICATE_IED',
        message: `IED '${name}' appears ${count} times.`,
        path: `/SCL/IED[@name='${name}']`,
        fixHint: `Rename one of the IEDs so every IED has a unique name.`,
        context: { iedName: name },
        entityRef: { type: 'IED', id: `ied:${name}`, iedName: name },
      });
    }
  }

  // #2 duplicate IP in each subnet
  {
    const bySubnet = new Map<string, Map<string, CapRecord[]>>();
    for (const cap of capRecords) {
      if (!cap.ip) {
        continue;
      }
      if (!bySubnet.has(cap.subNetwork)) {
        bySubnet.set(cap.subNetwork, new Map());
      }
      const byIp = bySubnet.get(cap.subNetwork)!;
      if (!byIp.has(cap.ip)) {
        byIp.set(cap.ip, []);
      }
      byIp.get(cap.ip)!.push(cap);
    }

    for (const [subnet, ipMap] of bySubnet.entries()) {
      for (const [ip, caps] of ipMap.entries()) {
        if (caps.length <= 1) {
          continue;
        }
        addIssue({
          checkId: 2,
          codeSuffix: 'DUPLICATE_IP',
          message: `Duplicate IP '${ip}' found ${caps.length} times in SubNetwork '${subnet}'.`,
          path: `/SCL/Communication/SubNetwork[@name='${subnet}']`,
          fixHint: `Assign a unique IP address to each Access Point within SubNetwork '${subnet}'.`,
          context: { ip },
          entityRef: { type: 'Communication', id: `subnet:${subnet}` },
        });
      }
    }
  }

  // #3 third octet consistency per station/subnetwork
  {
    const stationMap = buildIedStationMap(model);
    const groupToOctets = new Map<string, Set<number>>();

    for (const cap of capRecords) {
      if (!cap.ip || cap.ip.startsWith('10.30.200.')) {
        continue;
      }
      const octets = parseIpv4(cap.ip);
      if (!octets) {
        continue;
      }
      const station = stationMap.get(cap.iedName) || cap.subNetwork;
      if (!groupToOctets.has(station)) {
        groupToOctets.set(station, new Set());
      }
      groupToOctets.get(station)!.add(octets[2]);
    }

    for (const [station, octets] of groupToOctets.entries()) {
      if (octets.size <= 1) {
        continue;
      }
      addIssue({
        checkId: 3,
        codeSuffix: 'OCTET_MISMATCH',
        message: `Station/SubNetwork '${station}' has multiple 3rd octets: ${Array.from(octets).sort((a, b) => a - b).join(', ')}.`,
        path: `/SCL/Communication`,
        fixHint: `All IEDs in '${station}' should share the same 3rd IP octet (e.g. all on 192.168.X.*). Check for misconfigured addresses.`,
        severity: 'warn',
        entityRef: { type: 'Communication', id: `station:${station}` },
      });
    }
  }

  // #4 #5 #6 IP profile checks
  for (const cap of capRecords) {
    if (!cap.ip) {
      continue;
    }
    const path = capPath(cap);

    if (cap.ip.startsWith('192.168.')) {
      if (cap.netmask !== '255.255.255.0' || cap.gateway !== '0.0.0.0') {
        addIssue({
          checkId: 4,
          codeSuffix: 'IP_PROFILE',
        fixHint: `Set netmask to 255.255.255.0 and gateway to 0.0.0.0 for this 192.168.* address.`,
          message: `${cap.iedName}/${cap.apName} with IP ${cap.ip} must use netmask 255.255.255.0 and gateway 0.0.0.0.`,
          path,
          context: { iedName: cap.iedName, apName: cap.apName, ip: cap.ip },
          entityRef: { type: 'ConnectedAP', id: `${cap.iedName}:${cap.apName}`, iedName: cap.iedName },
        });
      }
    }

    if (cap.ip.startsWith('10.30.')) {
      if (cap.netmask !== '255.255.255.0' || cap.gateway !== '0.0.0.0') {
        addIssue({
          checkId: 5,
          codeSuffix: 'IP_PROFILE',
        fixHint: `Set netmask to 255.255.255.0 and gateway to 0.0.0.0 for this 10.30.* address.`,
          message: `${cap.iedName}/${cap.apName} with IP ${cap.ip} must use netmask 255.255.255.0 and gateway 0.0.0.0.`,
          path,
          context: { iedName: cap.iedName, apName: cap.apName, ip: cap.ip },
          entityRef: { type: 'ConnectedAP', id: `${cap.iedName}:${cap.apName}`, iedName: cap.iedName },
        });
      }
    }

    if (cap.ip.startsWith('172.25.')) {
      const octets = parseIpv4(cap.ip);
      const expectedGw = octets ? `${octets[0]}.${octets[1]}.${octets[2]}.254` : undefined;
      if (cap.netmask !== '255.255.255.0' || !expectedGw || cap.gateway !== expectedGw) {
        addIssue({
          checkId: 6,
          codeSuffix: 'IP_PROFILE',
        fixHint: `Set netmask to 255.255.255.0 and gateway to the .254 address of this subnet (e.g. 172.25.X.254).`,
          message: `${cap.iedName}/${cap.apName} with IP ${cap.ip} must use netmask 255.255.255.0 and gateway ${expectedGw || '*.254'}.`,
          path,
          context: { iedName: cap.iedName, apName: cap.apName, ip: cap.ip },
          entityRef: { type: 'ConnectedAP', id: `${cap.iedName}:${cap.apName}`, iedName: cap.iedName },
        });
      }
    }
  }

  // #7 MMS indexed = true
  for (const ctrl of model.reportControls) {
    if (ctrl.indexed === true) {
      continue;
    }
    addIssue({
      checkId: 7,
      codeSuffix: 'MMS_INDEXED_FALSE',
        severity: 'warn',
        fixHint: `Add indexed="true" to the ReportControl to allow multiple simultaneous client connections.`,
      message: `ReportControl '${ctrl.name}' in '${ctrl.iedName}' must have indexed=true.`,
      path: `/SCL/IED[@name='${ctrl.iedName}']//ReportControl[@name='${ctrl.name}']`,
      protocol: 'REPORT',
      context: { iedName: ctrl.iedName, cbName: ctrl.name, dataSet: ctrl.datSet },
      entityRef: { type: 'ControlBlock', id: ctrl.key, iedName: ctrl.iedName },
    });
  }

  // #8 GOOSE naming
  for (const ctrl of model.gseControls) {
    if (!ctrl.name.startsWith('gc')) {
      addIssue({
        checkId: 8,
        codeSuffix: 'CB_NAME',
        severity: 'warn',
        fixHint: `Rename the GOOSE control block to start with 'gc' (e.g. gcPtrp1, gcInd1).`,
        message: `GOOSE control block '${ctrl.name}' in '${ctrl.iedName}' must start with 'gc'.`,
        path: `/SCL/IED[@name='${ctrl.iedName}']//GSEControl[@name='${ctrl.name}']`,
        protocol: 'GOOSE',
        context: { iedName: ctrl.iedName, cbName: ctrl.name, dataSet: ctrl.datSet },
        entityRef: { type: 'ControlBlock', id: ctrl.key, iedName: ctrl.iedName },
      });
    }
    const expectedDataset = ctrl.name.startsWith('gc') ? `g${ctrl.name.slice(2)}` : undefined;
    if (expectedDataset && ctrl.datSet && ctrl.datSet !== expectedDataset) {
      addIssue({
        checkId: 8,
        codeSuffix: 'DATASET_NAME',
        severity: 'warn',
        fixHint: `Rename the dataset to match the control block: replace leading 'gc' with 'g' (e.g. gcPtrp1 → gPtrp1).`,
        message: `GOOSE control block '${ctrl.name}' expects dataset '${expectedDataset}', found '${ctrl.datSet}'.`,
        path: `/SCL/IED[@name='${ctrl.iedName}']//GSEControl[@name='${ctrl.name}']`,
        protocol: 'GOOSE',
        context: { iedName: ctrl.iedName, cbName: ctrl.name, dataSet: ctrl.datSet },
        entityRef: { type: 'ControlBlock', id: ctrl.key, iedName: ctrl.iedName },
      });
    }
  }

  // #9 duplicate GOOSE MAC / APPID
  {
    const byMac = new Map<string, string[]>();
    const byAppId = new Map<string, string[]>();
    for (const ctrl of model.gseControls) {
      const comm = findGooseComm(model, ctrl.iedName, ctrl.apName, ctrl.name);
      if (!comm) {
        continue;
      }
      const id = `${ctrl.iedName}/${ctrl.name}`;
      const mac = normalizeMac(comm.mac);
      const appid = normalizeHex(comm.appId || ctrl.appId);
      if (mac) {
        pushMap(byMac, mac, id);
      }
      if (appid) {
        pushMap(byAppId, appid, id);
      }
    }
    for (const [mac, entries] of byMac.entries()) {
      if (entries.length > 1) {
        addIssue({
          checkId: 9,
          codeSuffix: 'DUP_MAC',
        fixHint: `Assign a unique MAC address to each GOOSE control block.`,
          message: `Duplicate GOOSE MAC '${mac}' found in: ${entries.join(', ')}.`,
          path: '/SCL/Communication',
          protocol: 'GOOSE',
          context: { mac },
          entityRef: { type: 'Communication', id: `goose:mac:${mac}` },
        });
      }
    }
    for (const [appid, entries] of byAppId.entries()) {
      if (entries.length > 1) {
        addIssue({
          checkId: 9,
          codeSuffix: 'DUP_APPID',
        fixHint: `Assign a unique APPID to each GOOSE control block.`,
          message: `Duplicate GOOSE APPID '${appid}' found in: ${entries.join(', ')}.`,
          path: '/SCL/Communication',
          protocol: 'GOOSE',
          context: { appid },
          entityRef: { type: 'Communication', id: `goose:appid:${appid}` },
        });
      }
    }
  }

  // #10 GOOSE MAC 2nd last byte == IP 3rd octet in hex
  for (const ctrl of model.gseControls) {
    const comm = findGooseComm(model, ctrl.iedName, ctrl.apName, ctrl.name);
    if (!comm?.mac) {
      continue;
    }
    const cap = ctrl.apName ? capIndex.get(`${ctrl.iedName}:${ctrl.apName}`) : undefined;
    const octets = parseIpv4(cap?.ip);
    const macBytes = parseMacBytes(comm.mac);
    if (!octets || !macBytes || macBytes.length < 6) {
      continue;
    }
    const expected = toHexByte(octets[2]);
    const actual = macBytes[4];
    if (actual !== expected) {
      addIssue({
        checkId: 10,
        codeSuffix: 'MAC_STATION_MISMATCH',
        fixHint: `The 5th byte of the GOOSE MAC must equal the 3rd octet of the IED IP in hex (e.g. IP .15. → MAC byte 0F).`,
        message: `GOOSE ${ctrl.iedName}/${ctrl.name} MAC station byte '${actual}' must equal IP 3rd octet hex '${expected}'.`,
        path: `/SCL/Communication//GSE[@cbName='${ctrl.name}']`,
        protocol: 'GOOSE',
        context: { iedName: ctrl.iedName, cbName: ctrl.name, mac: comm.mac, ip: cap?.ip },
        entityRef: { type: 'ControlBlock', id: ctrl.key, iedName: ctrl.iedName },
      });
    }
  }

  // #11 and #12 GOOSE profile rules
  for (const ctrl of model.gseControls) {
    const comm = findGooseComm(model, ctrl.iedName, ctrl.apName, ctrl.name);
    if (!comm) {
      continue;
    }

    const hasP = ctrl.name.toUpperCase().includes('P');
    const checkId = hasP ? 11 : 12;
    const appid = normalizeHex(comm.appId || ctrl.appId);
    const macBytes = parseMacBytes(comm.mac);
    const lastMacByte = macBytes?.[5];
    const vlan = toNumber(comm.vlanPriority);
    const minTime = toNumber(comm.minTime);
    const maxTime = toNumber(comm.maxTime);

    const startPrefix = hasP ? '80' : '00';
    const expectedVlan = hasP ? 7 : 4;
    const expectedMin = hasP ? 4 : 10;
    const expectedMax = hasP ? 2000 : 10000;

    const appidValid = Boolean(appid && /^[0-9A-F]{4}$/.test(appid) && appid.startsWith(startPrefix));
    const appidMacAligned = Boolean(appid && lastMacByte && appid.slice(-2) === lastMacByte);
    const vlanValid = vlan === expectedVlan;
    const minValid = minTime === expectedMin;
    const maxValid = maxTime === expectedMax;

    if (!appidValid || !appidMacAligned || !vlanValid || !minValid || !maxValid) {
      addIssue({
        checkId,
        codeSuffix: 'PROFILE_MISMATCH',
        message: `GOOSE ${ctrl.iedName}/${ctrl.name} profile mismatch: appid=${appid || '-'} vlan=${comm.vlanPriority || '-'} min=${comm.minTime || '-'} max=${comm.maxTime || '-'}.`,
        path: `/SCL/Communication//GSE[@cbName='${ctrl.name}']`,
        fixHint: hasP
          ? `P-profile GOOSE: APPID must start with 80xx, VLAN priority=7, MinTime=4 ms, MaxTime=2000 ms. Last APPID byte must match last MAC byte.`
          : `Non-P GOOSE: APPID must start with 00xx, VLAN priority=4, MinTime=10 ms, MaxTime=10000 ms. Last APPID byte must match last MAC byte.`,
        severity: hasP ? 'error' : 'warn',
        protocol: 'GOOSE',
        context: {
          iedName: ctrl.iedName,
          cbName: ctrl.name,
          appid: appid || undefined,
          mac: comm.mac,
        },
        entityRef: { type: 'ControlBlock', id: ctrl.key, iedName: ctrl.iedName },
      });
    }
  }

  // #13 #14 required GOOSE groups by IED naming
  for (const ied of model.ieds) {
    const controls = model.gseControls
      .filter((cb) => cb.iedName === ied.name)
      .map((cb) => cb.name.toLowerCase());

    if (/EW0\d\d/i.test(ied.name)) {
      const missing = [
        controls.some((name) => name.startsWith('gcptrp')) ? null : 'gcPtrp*',
        controls.some((name) => name.startsWith('gcpev')) ? null : 'gcPev*',
        controls.some((name) => name.startsWith('gcind')) ? null : 'gcInd*',
      ].filter(Boolean) as string[];
      if (missing.length > 0) {
        addIssue({
          checkId: 13,
          codeSuffix: 'MISSING_CB_GROUP',
        severity: 'warn',
        fixHint: `Add missing GOOSE groups to this EW0** IED: gcPtrp* (trip), gcPev* (event), gcInd* (indication).`,
          message: `IED '${ied.name}' is missing required GOOSE groups: ${missing.join(', ')}.`,
          path: `/SCL/IED[@name='${ied.name}']`,
          protocol: 'GOOSE',
          context: { iedName: ied.name },
          entityRef: { type: 'IED', id: `ied:${ied.name}`, iedName: ied.name },
        });
      }
    }

    if (/EW8\d\d/i.test(ied.name)) {
      const missing = [
        controls.some((name) => name.startsWith('gcptrp')) ? null : 'gcPtrp*',
        controls.some((name) => name.startsWith('gcind')) ? null : 'gcInd*',
      ].filter(Boolean) as string[];
      if (missing.length > 0) {
        addIssue({
          checkId: 14,
          codeSuffix: 'MISSING_CB_GROUP',
        severity: 'warn',
        fixHint: `Add missing GOOSE groups to this EW8** IED: gcPtrp* (trip), gcInd* (indication).`,
          message: `IED '${ied.name}' is missing required GOOSE groups: ${missing.join(', ')}.`,
          path: `/SCL/IED[@name='${ied.name}']`,
          protocol: 'GOOSE',
          context: { iedName: ied.name },
          entityRef: { type: 'IED', id: `ied:${ied.name}`, iedName: ied.name },
        });
      }
    }
  }

  // #15 #16 #17 #18 SV checks
  {
    const bySmvId = new Map<string, string[]>();
    const byMac = new Map<string, string[]>();
    const byAppId = new Map<string, string[]>();

    for (const ctrl of model.svControls) {
      const comm = findSvComm(model, ctrl.iedName, ctrl.apName, ctrl.name);
      const id = `${ctrl.iedName}/${ctrl.name}`;

      if (ctrl.smvId) {
        pushMap(bySmvId, ctrl.smvId.toUpperCase(), id);
      }

      const mac = normalizeMac(comm?.mac);
      const appid = normalizeHex(comm?.appId);
      if (mac) {
        pushMap(byMac, mac, id);
      }
      if (appid) {
        pushMap(byAppId, appid, id);
      }

      if (appid && !appid.startsWith('4')) {
        addIssue({
          checkId: 16,
          codeSuffix: 'APPID_PREFIX',
        fixHint: `SV APPID must start with 4 (hex range 4000-4FFF). Update the APPID in the SMV communication element.`,
          message: `SV ${id} APPID '${appid}' must start with '4'.`,
          path: `/SCL/Communication//SMV[@cbName='${ctrl.name}']`,
          protocol: 'SV',
          context: { iedName: ctrl.iedName, cbName: ctrl.name, appid },
          entityRef: { type: 'ControlBlock', id: ctrl.key, iedName: ctrl.iedName },
        });
      }

      const cap = ctrl.apName ? capIndex.get(`${ctrl.iedName}:${ctrl.apName}`) : undefined;
      const octets = parseIpv4(cap?.ip);
      const macBytes = parseMacBytes(comm?.mac);
      if (octets && macBytes && macBytes.length >= 6) {
        const expected = toHexByte(octets[2]);
        if (macBytes[4] !== expected) {
          addIssue({
            checkId: 17,
            codeSuffix: 'MAC_STATION_MISMATCH',
        fixHint: `The 5th byte of the SV MAC must equal the 3rd octet of the IED IP in hex.`,
            message: `SV ${id} MAC station byte '${macBytes[4]}' must equal IP 3rd octet hex '${expected}'.`,
            path: `/SCL/Communication//SMV[@cbName='${ctrl.name}']`,
            protocol: 'SV',
            context: { iedName: ctrl.iedName, cbName: ctrl.name, mac: comm?.mac, ip: cap?.ip },
            entityRef: { type: 'ControlBlock', id: ctrl.key, iedName: ctrl.iedName },
          });
        }
      }

      const appid4hex40 = Boolean(appid && /^[0-9A-F]{4}$/.test(appid) && appid.startsWith('40'));
      const lastMacByte = macBytes?.[5];
      const appidMacAligned = Boolean(appid && lastMacByte && appid.slice(-2) === lastMacByte);
      const smvId = ctrl.smvId || '';
      const expectedVlan = smvId.toUpperCase().endsWith('P') ? 7 : smvId.toUpperCase().endsWith('M') ? 4 : undefined;
      const vlan = toNumber(comm?.vlanPriority);
      const vlanMatches = expectedVlan === undefined || vlan === expectedVlan;

      if (!appid4hex40 || !appidMacAligned || !vlanMatches) {
        addIssue({
          checkId: 18,
          codeSuffix: 'PROFILE_MISMATCH',
        fixHint: `SV: APPID must start with 40xx, last APPID byte must match last MAC byte, VLAN priority must be 7 (P) or 4 (M).`,
          message: `SV ${id} profile mismatch: appid=${appid || '-'} mac=${comm?.mac || '-'} vlan=${comm?.vlanPriority || '-'}.`,
          path: `/SCL/Communication//SMV[@cbName='${ctrl.name}']`,
          protocol: 'SV',
          context: { iedName: ctrl.iedName, cbName: ctrl.name, appid: appid || undefined, mac: comm?.mac },
          entityRef: { type: 'ControlBlock', id: ctrl.key, iedName: ctrl.iedName },
        });
      }
    }

    for (const [smvId, entries] of bySmvId.entries()) {
      if (entries.length > 1) {
        addIssue({
          checkId: 15,
          codeSuffix: 'DUP_SMVID',
        fixHint: `Assign a unique smvID to each SampledValueControl.`,
          message: `Duplicate SV smvID '${smvId}' found in: ${entries.join(', ')}.`,
          path: '/SCL',
          protocol: 'SV',
          entityRef: { type: 'Communication', id: `sv:smvid:${smvId}` },
        });
      }
    }
    for (const [mac, entries] of byMac.entries()) {
      if (entries.length > 1) {
        addIssue({
          checkId: 15,
          codeSuffix: 'DUP_MAC',
        fixHint: `Assign a unique MAC address to each SampledValueControl.`,
          message: `Duplicate SV MAC '${mac}' found in: ${entries.join(', ')}.`,
          path: '/SCL/Communication',
          protocol: 'SV',
          context: { mac },
          entityRef: { type: 'Communication', id: `sv:mac:${mac}` },
        });
      }
    }
    for (const [appid, entries] of byAppId.entries()) {
      if (entries.length > 1) {
        addIssue({
          checkId: 15,
          codeSuffix: 'DUP_APPID',
        fixHint: `Assign a unique APPID to each SampledValueControl.`,
          message: `Duplicate SV APPID '${appid}' found in: ${entries.join(', ')}.`,
          path: '/SCL/Communication',
          protocol: 'SV',
          context: { appid },
          entityRef: { type: 'Communication', id: `sv:appid:${appid}` },
        });
      }
    }
  }

  // IEC_001: GOOSE subscription completeness — every GSEControl must have ≥1 subscriber
  {
    for (const ctrl of model.gseControls) {
      const hasSubscriber = model.edges.some(
        (e) => e.signalType === 'GOOSE' && e.publisherIed === ctrl.iedName && e.controlBlockName === ctrl.name && e.status === 'resolved',
      );
      if (!hasSubscriber) {
        addIssue({
          checkId: 19,
          codeSuffix: 'NO_SUBSCRIBER',
        severity: 'warn',
        fixHint: `Add an ExtRef in the subscribing IED pointing to this GSEControl, or confirm the subscription exists in another file.`,
          message: `GSEControl '${ctrl.name}' in '${ctrl.iedName}' has no confirmed subscribers.`,
          path: `/SCL/IED[@name='${ctrl.iedName}']//GSEControl[@name='${ctrl.name}']`,
          protocol: 'GOOSE',
          context: { iedName: ctrl.iedName, cbName: ctrl.name, dataSet: ctrl.datSet },
          entityRef: { type: 'ControlBlock', id: ctrl.key, iedName: ctrl.iedName },
        });
      }
    }
  }

  // IEC_002: SV subscription completeness — every SampledValueControl must have ≥1 subscriber
  {
    for (const ctrl of model.svControls) {
      const hasSubscriber = model.edges.some(
        (e) => e.signalType === 'SV' && e.publisherIed === ctrl.iedName && e.controlBlockName === ctrl.name && e.status === 'resolved',
      );
      if (!hasSubscriber) {
        addIssue({
          checkId: 20,
          codeSuffix: 'NO_SUBSCRIBER',
        severity: 'warn',
        fixHint: `Add an ExtRef in the subscribing IED pointing to this SampledValueControl, or confirm the subscription exists in another file.`,
          message: `SampledValueControl '${ctrl.name}' in '${ctrl.iedName}' has no confirmed subscribers.`,
          path: `/SCL/IED[@name='${ctrl.iedName}']//SampledValueControl[@name='${ctrl.name}']`,
          protocol: 'SV',
          context: { iedName: ctrl.iedName, cbName: ctrl.name, dataSet: ctrl.datSet },
          entityRef: { type: 'ControlBlock', id: ctrl.key, iedName: ctrl.iedName },
        });
      }
    }
  }

  // IEC_003: ExtRef fully resolved — all ExtRef with iedName must resolve to a real control block
  // serviceType values (per OpenSCD / IEC 61850-6): 'GOOSE', 'SMV', 'Report'
  // Report ExtRefs point to ReportControl elements — they must NOT be checked against GOOSE/SV sets.
  {
    const gseKeys = new Set(model.gseControls.map((c) => `${c.iedName}:${c.name}`));
    const svKeys = new Set(model.svControls.map((c) => `${c.iedName}:${c.name}`));
    const reportKeys = new Set(model.reportControls.map((c) => `${c.iedName}:${c.name}`));
    const iedNameSet = new Set(model.ieds.map((i) => i.name));

    for (const [index, extEntry] of model.extRefs.entries()) {
      const ext = extEntry.extRef;
      const publisher = ext.iedName;
      if (!publisher) continue;

      const path = `/SCL/IED[@name='${extEntry.ownerIed}']//ExtRef[${index + 1}]`;

      // Check publisher IED exists
      if (!iedNameSet.has(publisher)) {
        addIssue({
          checkId: 21,
          codeSuffix: 'UNKNOWN_IED',
        fixHint: `The iedName in this ExtRef does not exist in the file. Update it to match a real IED name or remove the ExtRef.`,
          message: `ExtRef in '${extEntry.ownerIed}' references unknown IED '${publisher}'.`,
          path,
          protocol: 'Generic',
          context: { iedName: extEntry.ownerIed, ldInst: ext.ldInst, lnClass: ext.lnClass },
          entityRef: { type: 'ExtRef', id: `${extEntry.ownerIed}:extref:${index}`, iedName: extEntry.ownerIed },
        });
        continue;
      }

      // If srcCBName given, check it resolves to a known control block of the correct service type
      if (ext.srcCBName) {
        const cbKey = `${publisher}:${ext.srcCBName}`;
        const service = (ext.serviceType || '').toLowerCase();

        let cbExists: boolean;
        let protocol: ValidationIssue['protocol'];

        if (service === 'report') {
          // Report subscriptions point to ReportControl — never check GOOSE/SV keys
          cbExists = reportKeys.has(cbKey);
          protocol = 'REPORT';
        } else if (service === 'smv' || service === 'sv') {
          cbExists = svKeys.has(cbKey);
          protocol = 'SV';
        } else if (service === 'goose') {
          cbExists = gseKeys.has(cbKey);
          protocol = 'GOOSE';
        } else {
          // serviceType absent or unknown — accept any matching control block type
          cbExists = gseKeys.has(cbKey) || svKeys.has(cbKey) || reportKeys.has(cbKey);
          protocol = 'Generic';
        }

        if (!cbExists) {
          addIssue({
            checkId: 21,
            codeSuffix: 'UNKNOWN_CB',
        fixHint: `The srcCBName in this ExtRef does not exist on the referenced IED. Verify the control block name and serviceType are correct.`,
            message: `ExtRef in '${extEntry.ownerIed}' references unknown control block '${ext.srcCBName}' on IED '${publisher}' (serviceType=${ext.serviceType ?? 'unset'}).`,
            path,
            protocol,
            context: { iedName: extEntry.ownerIed, cbName: ext.srcCBName, ldInst: ext.ldInst },
            entityRef: { type: 'ExtRef', id: `${extEntry.ownerIed}:extref:${index}`, iedName: extEntry.ownerIed },
          });
        }
      }
    }
  }

  // IEC_004: IED naming convention — names must match [A-Z]{2,5}_[A-Z]_[A-Z0-9]{1,5}_EW[0-9]{3}
  {
    const IED_NAME_RE = /^[A-Z]{2,5}_[A-Z]_[A-Z0-9]{1,5}_EW[0-9]{3}$/;
    for (const ied of model.ieds) {
      if (!IED_NAME_RE.test(ied.name)) {
        addIssue({
          checkId: 22,
          codeSuffix: 'NAMING',
        severity: 'warn',
        fixHint: `Rename the IED to follow the convention: [PREFIX]_[TYPE]_[ID]_EW[NNN] (e.g. NJA_D_SP1_EW811).`,
          message: `IED '${ied.name}' does not match naming convention [A-Z]{2,5}_[A-Z]_[A-Z0-9]{1,5}_EW[0-9]{3}.`,
          path: `/SCL/IED[@name='${ied.name}']`,
          context: { iedName: ied.name },
          entityRef: { type: 'IED', id: `ied:${ied.name}`, iedName: ied.name },
        });
      }
    }
  }

  // IEC_005: IED placed in substation — every IED must have ≥1 LNode reference in Substation hierarchy
  {
    const iEdsInSubstation = new Set<string>();
    for (const bay of model.bays) {
      for (const name of bay.iedNames) {
        iEdsInSubstation.add(name);
      }
    }
    for (const ied of model.ieds) {
      if (!iEdsInSubstation.has(ied.name)) {
        addIssue({
          checkId: 23,
          codeSuffix: 'NOT_IN_SUBSTATION',
        severity: 'warn',
        fixHint: `Add an LNode element referencing this IED within the Substation hierarchy (Bay or VoltageLevel).`,
          message: `IED '${ied.name}' has no LNode reference in the Substation hierarchy.`,
          path: `/SCL/IED[@name='${ied.name}']`,
          context: { iedName: ied.name },
          entityRef: { type: 'IED', id: `ied:${ied.name}`, iedName: ied.name },
        });
      }
    }
  }

  // IEC_006: DataTypeTemplates completeness — all lnType in LN/LN0 must exist in DataTypeTemplates
  {
    const dt = model.dataTypeTemplates;
    const knownTypes = dt?.lNodeTypes;
    if (dt && knownTypes) {
      // IEC_006 / MISSING_LNTYPE: LN references lnType that doesn't exist in DataTypeTemplates
      for (const ied of model.ieds) {
        for (const ld of ied.lDevices) {
          const lns = [ld.ln0, ...ld.lns].filter(Boolean);
          for (const ln of lns) {
            if (ln && ln.lnType && !knownTypes.has(ln.lnType)) {
              addIssue({
                checkId: 24,
                codeSuffix: 'MISSING_LNTYPE',
        fixHint: `Add a matching LNodeType[@id] to DataTypeTemplates, or correct the lnType attribute on this LN.`,
                message: `LN '${ln.lnClass}${ln.inst}' in '${ied.name}/${ld.inst}' references unknown lnType '${ln.lnType}'.`,
                path: `/SCL/IED[@name='${ied.name}']//LDevice[@inst='${ld.inst}']//LN[@lnType='${ln.lnType}']`,
                context: { iedName: ied.name, ldInst: ld.inst, lnClass: ln.lnClass },
                entityRef: { type: 'IED', id: `ied:${ied.name}`, iedName: ied.name },
              });
            }
          }
        }
      }

      // IEC_006 / MISSING_DOTYPE: DO inside LNodeType references a DOType that doesn't exist
      for (const [lnTypeId, lnType] of dt.lNodeTypes) {
        for (const doRef of lnType.dos) {
          if (doRef.type && !dt.doTypes.has(doRef.type)) {
            addIssue({
              checkId: 24,
              codeSuffix: 'MISSING_DOTYPE',
        fixHint: `Add a matching DOType[@id] to DataTypeTemplates, or correct the type attribute on this DO.`,
              message: `LNodeType '${lnTypeId}': DO '${doRef.name}' references unknown DOType '${doRef.type}'.`,
              path: `/SCL/DataTypeTemplates/LNodeType[@id='${lnTypeId}']/DO[@name='${doRef.name}']`,
              context: {},
              entityRef: { type: 'Unknown', id: `lntype:${lnTypeId}` },
            });
          }
        }
      }

      // IEC_006 / EMPTY_DOTYPE: DOType with no DA children — unusable by any LN
      for (const [doTypeId, doType] of dt.doTypes) {
        if (doType.das.length === 0) {
          addIssue({
            checkId: 24,
            codeSuffix: 'EMPTY_DOTYPE',
          severity: 'warn',
          fixHint: 'Add DA child elements to this DOType to define its data attributes.',
            message: `DOType '${doTypeId}' (cdc=${doType.cdc ?? '?'}) has no DA children.`,
            path: `/SCL/DataTypeTemplates/DOType[@id='${doTypeId}']`,
            context: {},
            entityRef: { type: 'Unknown', id: `dotype:${doTypeId}` },
          });
        }
      }

      // IEC_006 / EMPTY_ENUMTYPE: DA with bType=Enum references an EnumType with no EnumVal entries
      for (const [doTypeId, doType] of dt.doTypes) {
        for (const da of doType.das) {
          if (da.bType === 'Enum' && da.type) {
            const enumType = dt.enumTypes.get(da.type);
            if (enumType && enumType.enumValCount === 0) {
              addIssue({
                checkId: 24,
                codeSuffix: 'EMPTY_ENUMTYPE',
        severity: 'warn',
        fixHint: `Add EnumVal entries to this EnumType — without values it cannot be used.`,
                message: `DOType '${doTypeId}': DA '${da.name}' references EnumType '${da.type}' which has no EnumVal entries.`,
                path: `/SCL/DataTypeTemplates/DOType[@id='${doTypeId}']/DA[@name='${da.name}']`,
                context: {},
                entityRef: { type: 'Unknown', id: `dotype:${doTypeId}` },
              });
            }
          }
        }
      }

      // IEC_006 / DUPLICATE_ID: duplicate id across LNodeType/DOType/DAType/EnumType
      for (const dupId of dt.duplicateTypeIds) {
        addIssue({
          checkId: 24,
          codeSuffix: 'DUPLICATE_ID',
        fixHint: `Remove the duplicate or assign unique ids to each LNodeType/DOType/DAType/EnumType.`,
          message: `DataTypeTemplates id '${dupId}' is defined more than once — ids must be unique.`,
          path: `/SCL/DataTypeTemplates/*[@id='${dupId}']`,
          context: {},
          entityRef: { type: 'Unknown', id: `dtt:${dupId}` },
        });
      }
    }
  }

  // IEC_007: GOOSE/SV dataset not empty — every referenced dataset must have ≥1 FCDA
  {
    const dataSetMap = new Map(model.dataSets.map((d) => [`${d.iedName}:${d.name}`, d]));
    for (const ctrl of [...model.svControls]) {
      if (!ctrl.datSet) continue;
      const ds = dataSetMap.get(`${ctrl.iedName}:${ctrl.datSet}`);
      if (ds && ds.fcdas.length === 0) {
        addIssue({
          checkId: 25,
          codeSuffix: 'DATASET_EMPTY',
        fixHint: `Add at least one FCDA to the DataSet, or remove the control block reference.`,
          message: `DataSet '${ctrl.datSet}' referenced by SV '${ctrl.name}' in '${ctrl.iedName}' is empty.`,
          path: `/SCL/IED[@name='${ctrl.iedName}']//DataSet[@name='${ctrl.datSet}']`,
          protocol: 'SV',
          context: { iedName: ctrl.iedName, cbName: ctrl.name, dataSet: ctrl.datSet },
          entityRef: { type: 'ControlBlock', id: ctrl.key, iedName: ctrl.iedName },
        });
      }
    }
    for (const ctrl of model.gseControls) {
      if (!ctrl.datSet) continue;
      const ds = dataSetMap.get(`${ctrl.iedName}:${ctrl.datSet}`);
      if (ds && ds.fcdas.length === 0) {
        addIssue({
          checkId: 25,
          codeSuffix: 'DATASET_EMPTY',
        fixHint: `Add at least one FCDA to the DataSet, or remove the control block reference.`,
          message: `DataSet '${ctrl.datSet}' referenced by GOOSE '${ctrl.name}' in '${ctrl.iedName}' is empty.`,
          path: `/SCL/IED[@name='${ctrl.iedName}']//DataSet[@name='${ctrl.datSet}']`,
          protocol: 'GOOSE',
          context: { iedName: ctrl.iedName, cbName: ctrl.name, dataSet: ctrl.datSet },
          entityRef: { type: 'ControlBlock', id: ctrl.key, iedName: ctrl.iedName },
        });
      }
    }
  }

  // IEC_008: confRev consistency — control block confRev must be non-zero
  {
    for (const ctrl of [...model.gseControls, ...model.svControls]) {
      const rev = ctrl.confRev ? Number(ctrl.confRev) : undefined;
      if (rev === 0 || ctrl.confRev === '0') {
        const proto = ctrl.type === 'GOOSE' ? 'GOOSE' : 'SV';
        addIssue({
          checkId: 26,
          codeSuffix: 'ZERO_CONFREV',
        severity: 'warn',
        fixHint: `Set confRev to a non-zero value (e.g. 1) to indicate the control block has been configured.`,
          message: `${proto} control block '${ctrl.name}' in '${ctrl.iedName}' has confRev=0 indicating unconfigured state.`,
          path: `/SCL/IED[@name='${ctrl.iedName}']//GSEControl[@name='${ctrl.name}']`,
          protocol: proto,
          context: { iedName: ctrl.iedName, cbName: ctrl.name },
          entityRef: { type: 'ControlBlock', id: ctrl.key, iedName: ctrl.iedName },
        });
      }
    }
  }


  // IEC_013: report client binding — a client access point (LN under AccessPoint, no Server)
  // should be referenced by at least one ReportControl ClientLN. Dynamic MMS reporting is
  // legal, so this is a warning, not an error. Note: clock="true" does NOT exclude an AP —
  // vendor tools (e.g. Hitachi) set it on OPC clients too; SNTP clocks have no client LNs.
  {
    const boundClients = new Set<string>();
    for (const ctrl of model.reportControls) {
      for (const client of ctrl.clients) {
        if (client.iedName) {
          boundClients.add(client.iedName);
        }
      }
    }
    for (const ied of model.ieds) {
      const clientAps = ied.accessPoints.filter(
        (ap) => !ap.hasServer && ap.clientLnClasses.length > 0,
      );
      if (clientAps.length === 0 || boundClients.has(ied.name)) {
        continue;
      }
      addIssue({
        checkId: 27,
        codeSuffix: 'UNBOUND_CLIENT',
        severity: 'warn',
        message: `Client IED '${ied.name}' (${clientAps[0].clientLnClasses.join('/')}) is not referenced by any ReportControl ClientLN.`,
        path: `/SCL/IED[@name='${ied.name}']`,
        protocol: 'REPORT',
        fixHint: `Bind reports to '${ied.name}' via RptEnabled/ClientLN, or confirm dynamic MMS reporting is intended.`,
        context: { iedName: ied.name },
        entityRef: { type: 'IED', id: `ied:${ied.name}`, iedName: ied.name },
      });
    }
  }

  // IEC_014: GOOSE/SV supervision — one LGOS per GOOSE subscription and one LSVS per SV
  // stream subscription (Landsnet implementation guideline §2.2 #19, requirements §4.5).
  {
    const subsByIed = new Map<string, { goose: Set<string>; sv: Set<string> }>();
    for (const { ownerIed, extRef } of model.extRefs) {
      const st = (extRef.serviceType || '').toLowerCase();
      const key = `${extRef.iedName || ''}:${extRef.srcCBName || ''}`;
      if (key === ':') continue;
      let entry = subsByIed.get(ownerIed);
      if (!entry) {
        entry = { goose: new Set(), sv: new Set() };
        subsByIed.set(ownerIed, entry);
      }
      if (st.includes('goose')) entry.goose.add(key);
      else if (st.includes('smv') || st.includes('sv') || st.includes('sample')) entry.sv.add(key);
    }
    for (const ied of model.ieds) {
      const subs = subsByIed.get(ied.name);
      if (!subs) continue;
      const lnCount = (cls: string) =>
        ied.lDevices.reduce((n, ld) => n + ld.lns.filter((ln) => ln.lnClass === cls).length, 0);
      const lgos = lnCount('LGOS');
      const lsvs = lnCount('LSVS');
      if (subs.goose.size > 0 && lgos < subs.goose.size) {
        addIssue({
          checkId: 28,
          codeSuffix: 'LGOS_INSUFFICIENT',
          severity: 'warn',
          message: `IED '${ied.name}' subscribes to ${subs.goose.size} GOOSE control block(s) but models only ${lgos} LGOS instance(s).`,
          path: `/SCL/IED[@name='${ied.name}']`,
          protocol: 'GOOSE',
          fixHint: `Add one LGOS logical node per GOOSE subscription for supervision (Landsnet guideline).`,
          context: { iedName: ied.name },
          entityRef: { type: 'IED', id: `ied:${ied.name}`, iedName: ied.name },
        });
      }
      if (subs.sv.size > 0 && lsvs < subs.sv.size) {
        addIssue({
          checkId: 28,
          codeSuffix: 'LSVS_INSUFFICIENT',
          severity: 'warn',
          message: `IED '${ied.name}' subscribes to ${subs.sv.size} SV stream(s) but models only ${lsvs} LSVS instance(s).`,
          path: `/SCL/IED[@name='${ied.name}']`,
          protocol: 'SV',
          fixHint: `Add one LSVS logical node per subscribed SV stream for supervision (Landsnet guideline).`,
          context: { iedName: ied.name },
          entityRef: { type: 'IED', id: `ied:${ied.name}`, iedName: ied.name },
        });
      }
    }
  }

  // IEC_015: SV sample rate — smpRate must be one of the IEC 61869-9 rates; 12800 is deprecated.
  {
    const VALID_RATES = new Set(['4000', '4800', '12800', '14400']);
    for (const ctrl of model.svControls) {
      const rate = (ctrl.smpRate || '').trim();
      const path = `/SCL/IED[@name='${ctrl.iedName}']//SampledValueControl[@name='${ctrl.name}']`;
      const base = {
        checkId: 29,
        severity: 'warn' as const,
        path,
        protocol: 'SV' as const,
        context: { iedName: ctrl.iedName, cbName: ctrl.name, smpRate: rate },
        entityRef: { type: 'ControlBlock' as const, id: ctrl.key, iedName: ctrl.iedName },
      };
      if (!rate) {
        addIssue({
          ...base,
          codeSuffix: 'SMPRATE_MISSING',
          message: `SV control block '${ctrl.name}' in '${ctrl.iedName}' has no smpRate.`,
          fixHint: `Set smpRate to an IEC 61869-9 rate — 4800 is the preferred rate for protection and measurement.`,
        });
      } else if (!VALID_RATES.has(rate)) {
        addIssue({
          ...base,
          codeSuffix: 'SMPRATE_INVALID',
          message: `SV control block '${ctrl.name}' in '${ctrl.iedName}' uses smpRate=${rate}, not an IEC 61869-9 rate (4000/4800/14400).`,
          fixHint: `Use an IEC 61869-9 sample rate — 4800 for protection/measurement, 14400 for quality metering.`,
        });
      } else if (rate === '12800') {
        addIssue({
          ...base,
          codeSuffix: 'SMPRATE_DEPRECATED',
          message: `SV control block '${ctrl.name}' in '${ctrl.iedName}' uses smpRate=12800, deprecated in IEC 61869-9.`,
          fixHint: `Prefer 4800 (protection/measurement) or 14400 (quality metering) over the deprecated 12800 rate.`,
        });
      }
    }
  }

  // LNET_019: MMS report control blocks must be named after their dataset with an 'r' prefix
  // (rEv, rProt, rMeas — Landsnet implementation guideline §3.8.1).
  {
    for (const ctrl of model.reportControls) {
      if (!ctrl.datSet) continue;
      // Allow a numeric suffix for multiple report instances on the same dataset (rEv, rEv1, rEv2…).
      if (ctrl.name === `r${ctrl.datSet}` || new RegExp(`^r${escapeRegExp(ctrl.datSet)}\\d+$`).test(ctrl.name)) continue;
      addIssue({
        checkId: 30,
        codeSuffix: 'RPT_NAME',
        severity: 'warn',
        message: `ReportControl '${ctrl.name}' in '${ctrl.iedName}' does not follow the r+dataset naming (expected 'r${ctrl.datSet}').`,
        path: `/SCL/IED[@name='${ctrl.iedName}']//ReportControl[@name='${ctrl.name}']`,
        protocol: 'REPORT',
        fixHint: `Rename the report control block to 'r${ctrl.datSet}' to match its dataset (Landsnet naming convention).`,
        context: { iedName: ctrl.iedName, cbName: ctrl.name, dataSet: ctrl.datSet },
        entityRef: { type: 'ControlBlock', id: ctrl.key, iedName: ctrl.iedName },
      });
    }
  }

  // LNET_020: Substation section KKS naming — names derive from the KKS structure already
  // present in the IED names (<station>_<voltage>_<bay>_<device>), so the check is
  // self-consistent for any station without configuration.
  {
    const KKS_IED = /^([A-Z]{2,5})_([A-Z])_([A-Z0-9]{1,5})_[A-Z]{2}[0-9]{3}$/;
    const stationCodes = new Set<string>();
    const voltageLetters = new Set<string>();
    for (const ied of model.ieds) {
      const m = ied.name.match(KKS_IED);
      if (m) {
        stationCodes.add(m[1]);
        voltageLetters.add(m[2]);
      }
    }
    // Bay name forms: short KKS code (MJ1), full form (MJ1_2AEL10), or a bare busbar code (0AEA10).
    const BAY_SHORT = /^[A-Z]{2}[0-9]$/;
    const FULL_KKS = /[0-9][A-Z]{3,5}[0-9]{2}/;
    const BAY_FULL = /^[A-Z]{2}[0-9]_[0-9][A-Z]{3,5}[0-9]{2}$/;
    const BAY_BUSBAR = /^[0-9][A-Z]{3,5}[0-9]{2}$/;

    if (stationCodes.size > 0) {
      for (const substation of model.substations) {
        if (!stationCodes.has(substation.name)) {
          addIssue({
            checkId: 31,
            codeSuffix: 'SUBSTATION_NAME',
            severity: 'warn',
            message: `Substation name '${substation.name}' is not the station KKS code (expected ${[...stationCodes].join('/')}).`,
            path: `/SCL/Substation[@name='${substation.name}']`,
            fixHint: `Rename the Substation to the station KKS code (e.g. name="${[...stationCodes][0]}").`,
            context: { name: substation.name },
            entityRef: { type: 'Unknown', id: `substation:${substation.name}` },
          });
        }
        for (const vl of substation.voltageLevels) {
          if (!/^[A-Z]$/.test(vl.name) || !voltageLetters.has(vl.name)) {
            addIssue({
              checkId: 31,
              codeSuffix: 'VOLTAGELEVEL_NAME',
              severity: 'warn',
              message: `VoltageLevel name '${vl.name}' should be the voltage-class letter only (expected ${[...voltageLetters].join('/')}).`,
              path: `/SCL/Substation[@name='${substation.name}']/VoltageLevel[@name='${vl.name}']`,
              fixHint: `Rename the VoltageLevel to its KKS voltage letter (e.g. name="E" for 132 kV).`,
              context: { name: vl.name, substation: substation.name },
              entityRef: { type: 'Unknown', id: `vl:${substation.name}:${vl.name}` },
            });
          }
        }
      }
      for (const bay of model.bays) {
        const nameOk = BAY_SHORT.test(bay.name) || BAY_FULL.test(bay.name) || BAY_BUSBAR.test(bay.name);
        if (!nameOk) {
          addIssue({
            checkId: 31,
            codeSuffix: 'BAY_NAME',
            severity: 'warn',
            message: `Bay name '${bay.name}' is not a KKS bay code (expected e.g. MJ1, MJ1_2AEL10 or a busbar code like 0AEA10).`,
            path: `/SCL/Substation//Bay[@name='${bay.name}']`,
            fixHint: `Rename the bay to its KKS code (short form like SP1, or full form like SP1_1AET10).`,
            context: { name: bay.name },
            entityRef: { type: 'Unknown', id: bay.key },
          });
        }
        if (!FULL_KKS.test(bay.name) && !FULL_KKS.test(bay.desc || '')) {
          addIssue({
            checkId: 31,
            codeSuffix: 'BAY_FULL_KKS',
            severity: 'warn',
            message: `Bay '${bay.name}' carries no full KKS identifier in name or desc (e.g. MJ1_2AEL10).`,
            path: `/SCL/Substation//Bay[@name='${bay.name}']`,
            fixHint: `Put the full KKS identifier in the bay name or desc (e.g. desc="MJ1_2AEL10").`,
            context: { name: bay.name, desc: bay.desc || '' },
            entityRef: { type: 'Unknown', id: bay.key },
          });
        }
      }
    }
  }

  // IEC_016: every ConductingEquipment in the Substation section must be bound to at least
  // one LNode, so switchgear is traceable to the IEDs controlling/supervising it.
  {
    for (const bay of model.bays) {
      for (const eq of bay.equipment) {
        if (eq.lnodes.length === 0) {
          addIssue({
            checkId: 32,
            codeSuffix: 'NO_LNODE',
            severity: 'warn',
            message: `ConductingEquipment '${eq.name}' (${eq.type}) in bay '${bay.name}' has no LNode binding.`,
            path: `/SCL/Substation//Bay[@name='${bay.name}']/ConductingEquipment[@name='${eq.name}']`,
            fixHint: `Add <LNode iedName=… lnClass="CSWI"/"CILO"…> references binding the equipment to its controlling IED.`,
            context: { bay: bay.name, equipment: eq.name, type: eq.type },
            entityRef: { type: 'Unknown', id: `${bay.key}:eq:${eq.name}` },
          });
        }
      }
    }
  }

  const checks: LandsnetCheckSummary[] = CHECKS.map((check) => ({
    id: check.id,
    code: checkCode(check.id),
    title: check.title,
    passed: (issueCountByCheck.get(check.id) || 0) === 0,
    issueCount: issueCountByCheck.get(check.id) || 0,
  }));

  // include dictionary-driven sanity check to avoid empty output sections
  if (Object.keys(dictionaries.IED_dict).length === 0) {
    checks[0] = { ...checks[0], passed: false, issueCount: Math.max(1, checks[0].issueCount) };
  }

  return { issues, checks };
}

function flattenCaps(model: SclModel): CapRecord[] {
  const caps: CapRecord[] = [];
  for (const subnet of model.subNetworks) {
    for (const cap of subnet.connectedAps) {
      caps.push({
        subNetwork: subnet.name,
        iedName: cap.iedName,
        apName: cap.apName,
        ip: cap.ip,
        netmask: cap.netmask,
        gateway: cap.gateway,
      });
    }
  }
  return caps;
}

function buildIedStationMap(model: SclModel): Map<string, string> {
  const map = new Map<string, string>();
  for (const bay of model.bays) {
    if (!bay.substationName) {
      continue;
    }
    for (const iedName of bay.iedNames) {
      if (!map.has(iedName)) {
        map.set(iedName, bay.substationName);
      }
    }
  }
  return map;
}

function findGooseComm(model: SclModel, iedName: string, apName: string | undefined, cbName: string) {
  return (
    model.gseComms.find((comm) => comm.iedName === iedName && comm.cbName === cbName && (!apName || comm.apName === apName)) ||
    model.gseComms.find((comm) => comm.iedName === iedName && comm.cbName === cbName) ||
    model.gseComms.find((comm) => comm.iedName === iedName && (!apName || comm.apName === apName))
  );
}

function findSvComm(model: SclModel, iedName: string, apName: string | undefined, cbName: string) {
  return (
    model.smvComms.find((comm) => comm.iedName === iedName && comm.cbName === cbName && (!apName || comm.apName === apName)) ||
    model.smvComms.find((comm) => comm.iedName === iedName && comm.cbName === cbName) ||
    model.smvComms.find((comm) => comm.iedName === iedName && (!apName || comm.apName === apName))
  );
}

function pushMap(map: Map<string, string[]>, key: string, value: string): void {
  if (!map.has(key)) {
    map.set(key, []);
  }
  map.get(key)!.push(value);
}

function parseIpv4(value?: string): [number, number, number, number] | undefined {
  if (!value) {
    return undefined;
  }
  const parts = value.split('.').map((part) => Number(part));
  if (parts.length !== 4 || parts.some((part) => Number.isNaN(part) || part < 0 || part > 255)) {
    return undefined;
  }
  return [parts[0], parts[1], parts[2], parts[3]];
}

function parseMacBytes(value?: string): string[] | undefined {
  if (!value) {
    return undefined;
  }
  const parts = value.match(/[0-9a-fA-F]{2}/g);
  if (!parts || parts.length < 6) {
    return undefined;
  }
  return parts.map((part) => part.toUpperCase());
}

function normalizeMac(value?: string): string | undefined {
  const bytes = parseMacBytes(value);
  if (!bytes || bytes.length < 6) {
    return undefined;
  }
  return bytes.slice(0, 6).join('-');
}

function normalizeHex(value?: string): string | undefined {
  if (!value) {
    return undefined;
  }
  const normalized = value.trim().toUpperCase().replace(/^0X/, '');
  return normalized || undefined;
}

function toNumber(value?: string): number | undefined {
  if (!value) {
    return undefined;
  }
  const num = Number(value);
  return Number.isFinite(num) ? num : undefined;
}

function toHexByte(input: number): string {
  return input.toString(16).toUpperCase().padStart(2, '0');
}

function capPath(cap: CapRecord): string {
  return `/SCL/Communication/SubNetwork[@name='${cap.subNetwork}']/ConnectedAP[@iedName='${cap.iedName}'][@apName='${cap.apName}']`;
}

function checkCode(id: number): string {
  return CHECKS.find((c) => c.id === id)?.code ?? `LNET_${String(id).padStart(3, '0')}`;
}

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}
