import type { SldModel } from '../sld/types';
export type { SldModel };

export type ViewMode = 'tree' | 'network';
export type SignalMode = 'both' | 'goose' | 'sv' | 'report';

export interface HitemModel {
  version?: string;
  revision?: string;
  when?: string;
  who?: string;
  what?: string;
  why?: string;
}

export interface SclHeaderModel {
  id?: string;
  version?: string;
  revision?: string;
  toolID?: string;
  nameStructure?: string;
  history: HitemModel[];
  helinksLocked: boolean;
}

export interface ParseErrorInfo {
  message: string;
  line?: number;
  column?: number;
}

export interface AccessPointModel {
  name: string;
  ldInsts: string[];
  ip?: string;
  mac?: string;
  /** AccessPoint contains a <Server> element */
  hasServer: boolean;
  /** clock="true" on the AccessPoint (e.g. SNTP clock) */
  clock?: boolean;
  /** lnClass of LN elements directly under the AccessPoint (client LNs, e.g. IHMI/ITCI) */
  clientLnClasses: string[];
}

export interface LnModel {
  lnClass: string;
  inst: string;
  prefix?: string;
  lnType?: string;
}

export interface LDeviceModel {
  inst: string;
  ln0?: LnModel;
  lns: LnModel[];
}

export interface IedModel {
  name: string;
  desc?: string;
  accessPoints: AccessPointModel[];
  lDevices: LDeviceModel[];
  bayNames: string[];
}

export interface FcdaModel {
  ldInst?: string;
  prefix?: string;
  lnClass?: string;
  lnInst?: string;
  doName?: string;
  daName?: string;
  fc?: string;
}

export interface DataSetModel {
  key: string;
  name: string;
  iedName: string;
  ldInst: string;
  lnClass: string;
  lnInst?: string;
  fcdas: FcdaModel[];
}

export interface ControlBlockBase {
  key: string;
  iedName: string;
  apName?: string;
  ldInst: string;
  lnClass: string;
  lnInst?: string;
  name: string;
  datSet?: string;
}

export interface GooseControlModel extends ControlBlockBase {
  type: 'GOOSE';
  appId?: string;
  confRev?: string;
}

export interface SvControlModel extends ControlBlockBase {
  type: 'SV';
  smvId?: string;
  nofASDU?: string;
  confRev?: string;
  smpRate?: string;
  smpMod?: string;
}

export interface ReportClientModel {
  iedName?: string;
  apRef?: string;
  ldInst?: string;
  prefix?: string;
  lnClass?: string;
  lnInst?: string;
}

export interface ReportControlModel extends ControlBlockBase {
  type: 'REPORT';
  rptId?: string;
  confRev?: string;
  buffered: boolean;
  indexed?: boolean;
  clients: ReportClientModel[];
}

export interface GseCommModel {
  iedName: string;
  apName: string;
  ldInst?: string;
  cbName?: string;
  mac?: string;
  appId?: string;
  vlanId?: string;
  vlanPriority?: string;
  minTime?: string;
  maxTime?: string;
}

export interface SmvCommModel {
  iedName: string;
  apName: string;
  ldInst?: string;
  cbName?: string;
  mac?: string;
  appId?: string;
  vlanId?: string;
  vlanPriority?: string;
  smpRate?: string;
  smpMod?: string;
  nofASDU?: string;
}

export interface ConnectedApModel {
  iedName: string;
  apName: string;
  ip?: string;
  netmask?: string;
  gateway?: string;
  physConns: Array<{
    pType?: string;
    value: string;
  }>;
}

export interface SubNetworkModel {
  name: string;
  type?: string;
  connectedAps: ConnectedApModel[];
}

export interface ExtRefModel {
  iedName?: string;
  ldInst?: string;
  srcLDInst?: string;
  prefix?: string;
  lnClass?: string;
  lnInst?: string;
  doName?: string;
  daName?: string;
  srcCBName?: string;
  intAddr?: string;
  serviceType?: string;
}

export interface EdgeModel {
  key: string;
  signalType: 'GOOSE' | 'SV' | 'REPORT';
  publisherIed: string;
  subscriberIed: string;
  controlBlockName?: string;
  dataSetName?: string;
  status: 'resolved' | 'unresolved' | 'probable';
  reason?: string;
  fcdas: FcdaModel[];
}

export interface RawSnippet {
  key: string;
  xml: string;
}

export interface LNodeRefModel {
  iedName?: string;
  ldInst?: string;
  lnClass?: string;
  lnInst?: string;
  prefix?: string;
}

export interface EquipmentModel {
  name: string;
  type: string;
  lnodes: LNodeRefModel[];
}

export interface BayModel {
  key: string;
  name: string;
  substationName?: string;
  voltageLevelName?: string;
  iedNames: string[];
  equipment: EquipmentModel[];
}

export interface VoltageLevelModel {
  name: string;
  desc?: string;
  nomFreq?: string;
  numPhases?: string;
  bays: BayModel[];
}

export interface SubstationModel {
  name: string;
  desc?: string;
  voltageLevels: VoltageLevelModel[];
}

/** DataTypeTemplates: LNodeType id → DO list; DOType id → DA list; DAType id → BDA list. */
export interface DataTypeTemplatesModel {
  lNodeTypes: Map<string, { id: string; lnClass?: string; dos: { name: string; type: string }[] }>;
  doTypes: Map<string, { id: string; cdc?: string; das: { name: string; fc?: string; bType?: string; type?: string }[] }>;
  daTypes: Map<string, { id: string; bType?: string; bdas: { name: string; bType?: string }[] }>;
  enumTypes: Map<string, { id: string; enumValCount: number }>;
  duplicateTypeIds: string[];
}

export interface SclModel {
  ieds: IedModel[];
  bays: BayModel[];
  substations: SubstationModel[];
  subNetworks: SubNetworkModel[];
  gseControls: GooseControlModel[];
  svControls: SvControlModel[];
  reportControls: ReportControlModel[];
  dataSets: DataSetModel[];
  extRefs: Array<{
    ownerIed: string;
    extRef: ExtRefModel;
  }>;
  gseComms: GseCommModel[];
  smvComms: SmvCommModel[];
  edges: EdgeModel[];
  snippets: Record<string, string>;
  dataTypeTemplates?: DataTypeTemplatesModel;
  sld?: SldModel;
  header?: SclHeaderModel;
}

export interface TreeNodeModel {
  id: string;
  label: string;
  type: 'root' | 'ied' | 'access-point' | 'ldevice' | 'ln' | 'dataset' | 'control' | 'subnetwork';
  children?: TreeNodeModel[];
}
