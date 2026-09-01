import { describe, expect, it, vi } from 'vitest';
import { setupSwRefresh } from './swRefresh';

class FakeSw extends EventTarget {}

describe('setupSwRefresh', () => {
  it('reloads exactly once when a new service worker takes control', () => {
    const sw = new FakeSw();
    const reload = vi.fn();
    setupSwRefresh(sw, reload);
    sw.dispatchEvent(new Event('controllerchange'));
    sw.dispatchEvent(new Event('controllerchange'));
    expect(reload).toHaveBeenCalledTimes(1);
  });

  it('does nothing without a controllerchange event', () => {
    const sw = new FakeSw();
    const reload = vi.fn();
    setupSwRefresh(sw, reload);
    expect(reload).not.toHaveBeenCalled();
  });

  it('tolerates a missing serviceWorker container', () => {
    expect(() => setupSwRefresh(undefined, vi.fn())).not.toThrow();
  });
});
