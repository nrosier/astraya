// @vitest-environment jsdom
/**
 * #776 — `#/people/<id>/timing/timeline` must render the timing timeline screen. The route was
 * parsed but missing from `renderScreen`'s list of person routes, so it fell through to
 * `HomeRedirect` and bounced the user to `#/people`. The real App is mounted; only the lazy
 * person-screens chunk, the calculation engine and the store gate are stubbed (no network).
 */
import { act } from 'react';
import { createRoot } from 'react-dom/client';
import { describe, expect, it, vi } from 'vitest';
import type * as SessionContext from '../src/ui/session-context.js';

vi.mock('../src/ui/EphemerisProviderContext.js', () => ({
  EphemerisProviderProvider: ({ children }: { children: React.ReactNode }) => children,
  useEphemerisProvider: () => ({ provider: undefined, error: undefined }),
}));

vi.mock('../src/ui/session-context.js', async (importOriginal) => ({
  ...(await importOriginal<typeof SessionContext>()),
  // `Stored` renders its children only once the store is ready; the stub screen needs no store.
  useStoreStatus: () => ({ kind: 'ready', store: undefined }),
}));

vi.mock('../src/ui/person-screens.js', () => ({
  TimingTimelineView: ({ personId }: { personId: string }) => (
    <main data-testid="timing-timeline-stub">{personId}</main>
  ),
}));

const PERSON = 'p-abcdefghijklmnop';
const { App } = await import('../src/ui/App.js');

describe('timing timeline route (#776)', () => {
  it('renders the timeline screen and stays on its hash instead of redirecting to #/people', async () => {
    window.location.hash = `#/people/${PERSON}/timing/timeline`;
    const container = document.createElement('div');
    document.body.append(container);
    const root = createRoot(container);
    try {
      await act(async () => {
        root.render(<App />);
        await new Promise((resolve) => setTimeout(resolve, 50));
      });
      expect(window.location.hash).toBe(`#/people/${PERSON}/timing/timeline`);
      expect(container.querySelector('[data-testid="timing-timeline-stub"]')?.textContent).toBe(PERSON);
    } finally {
      act(() => {
        root.unmount();
      });
      container.remove();
    }
  });
});
