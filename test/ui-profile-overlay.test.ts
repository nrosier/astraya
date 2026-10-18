// @vitest-environment jsdom
/** The birth-record easter egg (#697): the check, and the overlay's lifecycle. */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { checkFeatureFlag, initProfileOverlay, type OverlayConfig } from '../src/ui/profile-overlay.js';

async function hex(text: string): Promise<string> {
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(text));
  return [...new Uint8Array(digest)].map((byte) => byte.toString(16).padStart(2, '0')).join('');
}

describe('checkFeatureFlag (#697)', () => {
  let config: OverlayConfig;
  beforeEach(async () => {
    config = { enabled: true, dateDigest: await hex('2001-02-03'), nameDigest: await hex('example') };
  });

  it('matches when the date and any one name word match', async () => {
    expect(await checkFeatureFlag('2001-02-03', 'Jo Example', config)).toBe(true);
    expect(await checkFeatureFlag('2001-02-03', 'EXAMPLE, Jo', config)).toBe(true);
    expect(await checkFeatureFlag('2001-02-03', '  Jo   Ex-ample  ', config)).toBe(true);
  });

  it('needs both', async () => {
    expect(await checkFeatureFlag('2001-02-04', 'Jo Example', config)).toBe(false);
    expect(await checkFeatureFlag('2001-02-03', 'Jo Sample', config)).toBe(false);
    expect(await checkFeatureFlag('2001-02-03', 'Jo Example', { enabled: false })).toBe(false);
  });
});

describe('initProfileOverlay (#697)', () => {
  const context = { clearRect: vi.fn(), fillRect: vi.fn(), globalAlpha: 1, fillStyle: '' };
  let reduced = false;

  beforeEach(() => {
    vi.useFakeTimers({ toFake: ['requestAnimationFrame', 'cancelAnimationFrame', 'performance'] });
    vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockReturnValue(context as unknown as CanvasRenderingContext2D);
    window.matchMedia = vi.fn().mockImplementation(() => ({ matches: reduced }));
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.restoreAllMocks();
    reduced = false;
  });

  it('covers the screen without taking clicks, then removes itself after the show and its last sparks', () => {
    initProfileOverlay();
    const canvas = document.querySelector('canvas.profile-overlay');
    expect(canvas?.getAttribute('aria-hidden')).toBe('true');
    vi.advanceTimersByTime(9_000);
    expect(document.querySelector('canvas.profile-overlay')).not.toBeNull();
    vi.advanceTimersByTime(10_000);
    expect(document.querySelector('canvas.profile-overlay')).toBeNull();
    expect(context.fillRect).toHaveBeenCalled();
  });

  it('stops at once when ended early', () => {
    const stop = initProfileOverlay();
    vi.advanceTimersByTime(500);
    stop();
    expect(document.querySelector('canvas.profile-overlay')).toBeNull();
  });

  it('does nothing when the reader asks for reduced motion', () => {
    reduced = true;
    initProfileOverlay();
    expect(document.querySelector('canvas.profile-overlay')).toBeNull();
  });
});
