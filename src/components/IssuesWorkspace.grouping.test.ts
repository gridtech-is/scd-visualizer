import { describe, expect, it } from 'vitest';
import { issueBaseCode, checkGroupLabel } from './IssuesWorkspace';

describe('issues list grouping', () => {
  it('extracts the base check code for all code families', () => {
    expect(issueBaseCode('LNET_007_MMS_INDEXED_FALSE')).toBe('LNET_007');
    expect(issueBaseCode('IEC_004_BAD_NAME')).toBe('IEC_004');
    expect(issueBaseCode('IEC_014_LGOS_INSUFFICIENT')).toBe('IEC_014');
    expect(issueBaseCode('SCL_XSD_001_SOMETHING')).toBe('SCL_XSD');
    expect(issueBaseCode('GOOSE_DATASET_MISSING')).toBe('GOOSE_DATASET_MISSING');
  });

  it('labels check groups with the check title', () => {
    expect(checkGroupLabel('LNET_007')).toBe('LNET_007 — All MMS reports have indexed=true');
    expect(checkGroupLabel('IEC_013')).toBe('IEC_013 — Report client binding');
    expect(checkGroupLabel('NO_SUCH_CODE')).toBe('NO_SUCH_CODE');
  });
});
