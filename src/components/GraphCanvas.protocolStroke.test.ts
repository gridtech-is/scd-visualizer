import { describe, expect, it } from 'vitest';
import { PROTOCOL_STROKE } from './GraphCanvas';

// App background is dark (--bg #0f172a). Edge strokes must be visible against it.
const BG = 0x0f172a;

function luminance(hex: number): number {
  const channel = (v: number) => {
    const s = v / 255;
    return s <= 0.03928 ? s / 12.92 : Math.pow((s + 0.055) / 1.055, 2.4);
  };
  const r = channel((hex >> 16) & 0xff);
  const g = channel((hex >> 8) & 0xff);
  const b = channel(hex & 0xff);
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

function contrast(a: number, b: number): number {
  const [hi, lo] = [luminance(a), luminance(b)].sort((x, y) => y - x);
  return (hi + 0.05) / (lo + 0.05);
}

describe('PROTOCOL_STROKE visibility', () => {
  it.each(Object.entries(PROTOCOL_STROKE))('%s stroke is visible on the dark canvas', (_proto, color) => {
    const hex = parseInt(color.replace('#', ''), 16);
    expect(contrast(hex, BG)).toBeGreaterThanOrEqual(2);
  });
});
