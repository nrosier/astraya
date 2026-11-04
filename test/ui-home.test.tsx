// @vitest-environment jsdom
/**
 * #1058 — `#/` renders in place: the last-viewed person's timing timeline, or a person picker with a
 * first-use empty state. Replaces the #234/#263 `HomeRedirect` tests. The timeline itself is stubbed;
 * the store is a fixed map.
 */
import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { readLastPersonId, writeLastPersonId } from '../src/ui/last-person.js';
import { setLocale } from '../src/ui/locale.js';
import { parseRoute } from '../src/ui/route.js';
import { homeMessages } from '../src/ui/Home.messages.js';

const fakeStore = vi.hoisted(() => ({
  people: new Map<string, { id: string; displayName: string }>(),
}));
vi.mock('../src/ui/store-context.js', () => ({
  useStoreState: () => ({ people: fakeStore.people }),
}));
vi.mock('../src/ui/TimingTimelineView.js', () => ({
  TimingTimelineView: ({ personId }: { personId: string }) => <main data-testid="timeline-stub">{personId}</main>,
}));
vi.mock('../src/ui/PageHeader.js', () => ({
  PageHeader: ({ title }: { title: string }) => <h1>{title}</h1>,
}));

const { Home } = await import('../src/ui/Home.js');

const ADA = 'p-abcdefghijklmnop';
let mounted: { container: HTMLElement; root: Root } | undefined;

function mount(): HTMLElement {
  const container = document.createElement('div');
  document.body.append(container);
  const root = createRoot(container);
  act(() => {
    root.render(<Home />);
  });
  mounted = { container, root };
  return container;
}

afterEach(() => {
  if (mounted !== undefined) {
    act(() => {
      mounted?.root.unmount();
    });
    mounted.container.remove();
    mounted = undefined;
  }
  window.localStorage.clear();
  fakeStore.people.clear();
  setLocale('en');
});

describe('Home (#1058)', () => {
  it('parses #/ as the home route', () => {
    expect(parseRoute('#/').kind).toBe('home');
  });

  it('renders the last-viewed person timeline in place, without moving the hash', () => {
    window.location.hash = '#/';
    fakeStore.people.set(ADA, { id: ADA, displayName: 'Ada' });
    writeLastPersonId(ADA);
    const container = mount();
    expect(container.querySelector('[data-testid="timeline-stub"]')?.textContent).toBe(ADA);
    expect(window.location.hash).toBe('#/');
  });

  it('shows the first-use empty state when nobody is stored', () => {
    const container = mount();
    expect(container.textContent).toContain(homeMessages.en.noPeople);
    expect(container.querySelector('[data-testid="timeline-stub"]')).toBeNull();
    expect(container.querySelector('select')).toBeNull();
  });

  it('shows the picker when no person was viewed, and choosing one shows their timeline', () => {
    fakeStore.people.set(ADA, { id: ADA, displayName: 'Ada' });
    const container = mount();
    expect(container.textContent).toContain(homeMessages.en.pickerEmpty);
    const select = container.querySelector('select');
    expect(select).not.toBeNull();
    expect(Array.from(select?.options ?? []).map((o) => o.textContent)).toContain('Ada');
    act(() => {
      writeLastPersonId(ADA);
    });
    expect(readLastPersonId()).toBe(ADA);
    expect(container.querySelector('[data-testid="timeline-stub"]')?.textContent).toBe(ADA);
  });

  it('falls back to the picker when the stored person no longer exists', () => {
    fakeStore.people.set(ADA, { id: ADA, displayName: 'Ada' });
    writeLastPersonId('p-zzzzzzzzzzzzzzzz');
    const container = mount();
    expect(container.querySelector('[data-testid="timeline-stub"]')).toBeNull();
    expect(container.querySelector('select')).not.toBeNull();
  });

  it('has en and nl catalogues with identical keys', () => {
    expect(Object.keys(homeMessages.nl)).toEqual(Object.keys(homeMessages.en));
  });
});
