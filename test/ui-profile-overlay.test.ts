// @vitest-environment jsdom
/** The birth-record easter egg (#697): the server check's client side (#1808), and the overlay's lifecycle. */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { checkFeatureFlag, initProfileOverlay, resetFeatureFlagCache } from '../src/ui/profile-overlay.js';

/** A stand-in for the server's answer: the route itself is covered by `server-profile-overlay.test.ts`. */
function answering(status: number, body: unknown = {}) {
  return vi.fn<typeof fetch>(() => Promise.resolve(new Response(JSON.stringify(body), { status })));
}

describe('checkFeatureFlag (#697, #1808)', () => {
  beforeEach(() => {
    resetFeatureFlagCache();
  });

  it('sends the date and name to the server and shows only on enabled and match', async () => {
    const fetchImpl = answering(200, { enabled: true, match: true });
    expect(await checkFeatureFlag('2001-02-03', 'Jo Example', fetchImpl)).toBe(true);
    const [url, init] = fetchImpl.mock.calls[0] ?? [];
    expect(url).toBe('/api/profile-overlay/check');
    expect(init?.method).toBe('POST');
    expect(typeof init?.body).toBe('string');
    expect(JSON.parse(typeof init?.body === 'string' ? init.body : '')).toEqual({
      date: '2001-02-03',
      name: 'Jo Example',
    });
  });

  it('is no match when the server says no match or off', async () => {
    expect(await checkFeatureFlag('2001-02-04', 'Jo Example', answering(200, { enabled: true, match: false }))).toBe(
      false,
    );
    expect(await checkFeatureFlag('2001-02-03', 'Jo Sample', answering(200, { enabled: false, match: false }))).toBe(
      false,
    );
  });

  it('stays silent on 401, 429 or a network failure, and does not keep that answer', async () => {
    expect(await checkFeatureFlag('2001-02-03', 'Jo Example', answering(401))).toBe(false);
    expect(await checkFeatureFlag('2001-02-03', 'Jo Example', answering(429))).toBe(false);
    const offline = vi.fn<typeof fetch>(() => Promise.reject(new TypeError('offline')));
    expect(await checkFeatureFlag('2001-02-03', 'Jo Example', offline)).toBe(false);
    expect(await checkFeatureFlag('2001-02-03', 'Jo Example', answering(200, { enabled: true, match: true }))).toBe(
      true,
    );
  });

  it('asks once per date and name for the page load', async () => {
    const fetchImpl = answering(200, { enabled: true, match: true });
    await checkFeatureFlag('2001-02-03', 'Jo Example', fetchImpl);
    await checkFeatureFlag('2001-02-03', 'Jo Example', fetchImpl);
    expect(fetchImpl).toHaveBeenCalledTimes(1);
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

  it('leaves a spark trail behind the cursor during the show, and still removes itself after (#706)', () => {
    initProfileOverlay();
    vi.advanceTimersByTime(100);
    const before = context.fillRect.mock.calls.length;
    window.dispatchEvent(new PointerEvent('pointermove', { clientX: 200, clientY: 150 }));
    vi.advanceTimersByTime(50);
    expect(context.fillRect.mock.calls.length).toBeGreaterThan(before);
    vi.advanceTimersByTime(20_000);
    expect(document.querySelector('canvas.profile-overlay')).toBeNull();
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
