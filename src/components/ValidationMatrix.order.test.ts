import { describe, expect, it } from 'vitest';
import { compareCheckCodes } from './ValidationMatrix';

describe('validation matrix row order', () => {
  it('sorts IEC first in numeric order, then LNET', () => {
    const codes = ['LNET_003', 'IEC_009', 'LNET_019', 'IEC_001', 'IEC_015', 'LNET_004', 'IEC_002'];
    const sorted = codes.map((code) => ({ code })).sort(compareCheckCodes).map((c) => c.code);
    expect(sorted).toEqual(['IEC_001', 'IEC_002', 'IEC_009', 'IEC_015', 'LNET_003', 'LNET_004', 'LNET_019']);
  });
});
