export type IssueSeverity = 'error' | 'warn' | 'warning' | 'info';
export type IssueCategory = 'syntax' | 'semantic' | 'interop';

export interface IssueEntityRef {
  type: 'IED' | 'AccessPoint' | 'ConnectedAP' | 'ControlBlock' | 'DataSet' | 'ExtRef' | 'Communication' | 'Unknown';
  id: string;
  iedName?: string;
}

export interface IssueContext {
  iedName?: string;
  apName?: string;
  ldInst?: string;
  lnClass?: string;
  lnInst?: string;
  cbName?: string;
  dataSet?: string;
  appid?: string;
  mac?: string;
  ip?: string;
  /** Check-specific extra context (e.g. substation/bay/equipment names) */
  [key: string]: string | undefined;
}

export interface ValidationIssue {
  id: string;
  severity: IssueSeverity;
  category: IssueCategory;
  code: string;
  message: string;
  path: string;
  protocol: 'GOOSE' | 'SV' | 'REPORT' | 'Generic';
  context: IssueContext;
  entityRef: IssueEntityRef;
  resolved: boolean;
  fixHint?: string;
  quickFix?: string;
}

export interface ValidationFilters {
  severity: 'all' | IssueSeverity;
  category: 'all' | IssueCategory;
  protocol: 'all' | 'GOOSE' | 'SV' | 'REPORT' | 'Generic';
  status: 'all' | 'resolved' | 'unresolved';
  query: string;
}
