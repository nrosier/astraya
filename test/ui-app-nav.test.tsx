// @vitest-environment jsdom
/**
 * The header navigation (#421, #882), on a screen with no person (so no store is needed): the
 * Tools entry (one link, no sub-menu) and the Menu button the nav folds behind on a small screen, with Escape and page
 * changes closing them. Admin is reached from the account area on the top bar, not from here
 * (#443), so it is not this file's concern. The person's own tabs need an open store and are
 * covered end to end (`e2e/app-nav.spec.ts`).
 */
import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { writeLastPersonId } from '../src/ui/last-person.js';
import { setLocale } from '../src/ui/locale.js';
import { parseRoute, type Route } from '../src/ui/route.js';

// The Export menu asks for the calculation engine; none is needed to open and close menus.
vi.mock('../src/ui/EphemerisProviderContext.js', () => ({
  useEphemerisProvider: () => ({ provider: undefined, error: undefined }),
}));

// The person's tabs read the open store (#914 tests); with no store, `fakeStore.current` stays undefined
// and the nav behaves as it does on a fresh device, so the other cases in this file are unaffected.
const fakeStore = vi.hoisted(() => ({
  current: undefined as { state: { people: ReadonlyMap<string, { displayName: string }> } } | undefined,
}));
vi.mock('../src/ui/store-context.js', () => ({
  useOptionalStore: () => fakeStore.current,
  useStoreState: () => {
    if (fakeStore.current === undefined) throw new Error('fixture bug: no fake store');
    return fakeStore.current.state;
  },
}));

const { AppNav } = await import('../src/ui/AppNav.js');
const { appNavMessages } = await import('../src/ui/AppNav.messages.js');

let mounted: { container: HTMLElement; root: Root } | undefined;

afterEach(() => {
  if (mounted !== undefined) {
    act(() => {
      mounted?.root.unmount();
    });
    mounted.container.remove();
    mounted = undefined;
  }
  setLocale('en');
});

async function mount(route: Route): Promise<(next: Route) => Promise<void>> {
  const container = document.createElement('div');
  document.body.append(container);
  const root = createRoot(container);
  const render = async (next: Route): Promise<void> => {
    await act(async () => {
      root.render(<AppNav route={next} />);
      await Promise.resolve();
    });
  };
  mounted = { container, root };
  await render(route);
  return render;
}

const box = (): HTMLElement => {
  if (mounted === undefined) throw new Error('fixture bug: not mounted');
  return mounted.container;
};
const button = (name: string): HTMLButtonElement => {
  const found = Array.from(box().querySelectorAll('button')).find(
    (b) => b.getAttribute('aria-label') === name || b.textContent === name,
  );
  if (found === undefined) throw new Error(`fixture bug: no button "${name}"`);
  return found;
};
async function click(element: HTMLElement): Promise<void> {
  await act(async () => {
    element.click();
    await Promise.resolve();
  });
}
const navLinks = (): string[] => Array.from(box().querySelectorAll('nav#app-nav a')).map((a) => a.textContent);
const linkNamed = (name: string): HTMLAnchorElement | undefined =>
  Array.from(box().querySelectorAll('a')).find((a) => a.textContent === name);

describe('the sidebar sections (#882)', () => {
  it('has Tools as one link to the first tool, on every screen, with no sub-menu markup', async () => {
    await mount(parseRoute('#/people'));
    expect(box().querySelector('nav[aria-label="Main"]')).not.toBeNull();
    expect(box().querySelector('.app-nav-group, .app-nav-menu, .app-nav-group-toggle')).toBeNull();
    // The palette trigger (#1654) is a button too, and the disabled person entries (#1697) are buttons
    // as well; this case covers the enabled menu buttons only, so no sub-menu button is among them.
    expect(
      Array.from(box().querySelectorAll('button:not(.app-nav-search):not(.disabled)')).map((b) => b.textContent),
    ).toEqual(['Menu']);
    expect(linkNamed('Tools')?.getAttribute('href')).toBe('#/explore/cycles');
    expect(navLinks()).toEqual(['Tools', 'PDF']);
  });

  it('marks Tools as the current page on any tool, and not elsewhere', async () => {
    const render = await mount(parseRoute('#/explore/eclipses'));
    expect(linkNamed('Tools')?.getAttribute('aria-current')).toBe('page');
    expect(linkNamed('Tools')?.classList.contains('active')).toBe(true);
    await render(parseRoute('#/about'));
    expect(linkNamed('Tools')?.getAttribute('aria-current')).toBeNull();
  });

  it('closes the folded menu when Tools is chosen', async () => {
    await mount(parseRoute('#/people'));
    await click(button('Menu'));
    const tools = linkNamed('Tools');
    if (tools === undefined) throw new Error('fixture bug: no Tools link');
    tools.addEventListener('click', (event) => {
      event.preventDefault();
    });
    await click(tools);
    expect(box().querySelector('#app-nav')?.classList.contains('open')).toBe(false);
  });

  it('is in Dutch when the language is Dutch', async () => {
    setLocale('nl');
    await mount(parseRoute('#/people'));
    expect(navLinks()).toEqual(['Hulpmiddelen', 'PDF']);
    expect(box().querySelector('nav[aria-label="Hoofdmenu"]')).not.toBeNull();
  });

  it('labels the Documents entry PDF in English and Dutch, keeping the documents route', async () => {
    await mount(parseRoute('#/people'));
    expect(linkNamed('PDF')?.getAttribute('href')).toBe('#/documents');
    expect(appNavMessages.en.documents).toBe('PDF');
    expect(appNavMessages.nl.documents).toBe('PDF');
  });
});

describe('the Menu button for a small screen', () => {
  it('opens and closes the nav, naming its state, and Escape closes it', async () => {
    await mount(parseRoute('#/people'));
    const nav = box().querySelector('#app-nav');
    expect(nav?.classList.contains('open')).toBe(false);
    expect(button('Menu').getAttribute('aria-controls')).toBe('app-nav');
    await click(button('Menu'));
    expect(nav?.classList.contains('open')).toBe(true);
    expect(button('Close menu').getAttribute('aria-expanded')).toBe('true');
    await act(async () => {
      document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
      await Promise.resolve();
    });
    expect(nav?.classList.contains('open')).toBe(false);
  });

  it('closes when the page changes', async () => {
    const render = await mount(parseRoute('#/people'));
    await click(button('Menu'));
    await render(parseRoute('#/about'));
    expect(box().querySelector('#app-nav')?.classList.contains('open')).toBe(false);
  });
});

describe('the person sections on a route with no person (#914)', () => {
  afterEach(() => {
    fakeStore.current = undefined;
    window.localStorage.clear();
  });

  const openStoreWithPerson = (personId: string): void => {
    fakeStore.current = { state: { people: new Map([[personId, { displayName: 'Test' }]]) } };
  };

  it('shows the last-viewed person sections on the Documents route', async () => {
    openStoreWithPerson('p-abcdefghijklmnop');
    writeLastPersonId('p-abcdefghijklmnop');
    await mount(parseRoute('#/documents'));
    expect(linkNamed('Overview')?.getAttribute('href')).toBe('#/people/p-abcdefghijklmnop/overview');
    expect(linkNamed('PDF')?.getAttribute('aria-current')).toBe('page');
    // The sidebar is the same everywhere (#1696): no "Return to" heading, even though a person is shown.
    expect(box().querySelector('nav#app-nav .app-nav-history')).toBeNull();
  });

  it('shows no person sections on the Documents route when no person was viewed', async () => {
    openStoreWithPerson('p-abcdefghijklmnop');
    await mount(parseRoute('#/documents'));
    expect(linkNamed('Overview')).toBeUndefined();
    expect(box().querySelector('nav#app-nav .app-nav-history')).toBeNull();
  });

  it('shows the last-viewed person sections on the People list (#1730)', async () => {
    openStoreWithPerson('p-abcdefghijklmnop');
    writeLastPersonId('p-abcdefghijklmnop');
    await mount(parseRoute('#/people'));
    expect(linkNamed('Overview')?.getAttribute('href')).toBe('#/people/p-abcdefghijklmnop/overview');
  });

  it('disables the person entries on the People list when the last-viewed person is gone (#1730, #1697)', async () => {
    openStoreWithPerson('p-abcdefghijklmnop');
    writeLastPersonId('p-zzzzzzzzzzzzzzzz');
    await mount(parseRoute('#/people'));
    expect(linkNamed('Overview')).toBeUndefined();
    expect(navLinks()).toEqual(['Tools', 'PDF']);
    expect(disabledPersonLabels()).toEqual(EXPECTED_PERSON_LABELS_EN);
  });

  it('shows the person sections on the Documents route in English and in Dutch (#914)', async () => {
    openStoreWithPerson('p-abcdefghijklmnop');
    writeLastPersonId('p-abcdefghijklmnop');
    const render = await mount(parseRoute('#/documents'));
    expect(navLinks()).toContain('Overview');
    expect(navLinks()).toContain('Birth record');
    expect(linkNamed('PDF')?.getAttribute('aria-current')).toBe('page');

    setLocale('nl');
    await render(parseRoute('#/documents'));
    expect(navLinks()).toContain('Overzicht');
    expect(navLinks()).toContain('Geboortegegevens');
    expect(navLinks()).toContain('Hulpmiddelen');
    expect(linkNamed('PDF')?.getAttribute('aria-current')).toBe('page');
  });

  it('keeps the sidebar section list identical on a person page and on the Documents route (#914)', async () => {
    openStoreWithPerson('p-abcdefghijklmnop');
    writeLastPersonId('p-abcdefghijklmnop');
    const render = await mount(parseRoute('#/people/p-abcdefghijklmnop/overview'));
    const onPerson = navLinks();
    expect(onPerson).toContain('Overview');

    await render(parseRoute('#/documents'));
    expect(navLinks()).toEqual(onPerson);

    await render(parseRoute('#/people/p-abcdefghijklmnop/birth-record'));
    expect(navLinks()).toEqual(onPerson);
  });
});

describe('the full sidebar on app-scoped screens (#965)', () => {
  afterEach(() => {
    fakeStore.current = undefined;
    window.localStorage.clear();
  });

  const personId = 'p-abcdefghijklmnop';
  const openStoreWithLastPerson = (): void => {
    fakeStore.current = { state: { people: new Map([[personId, { displayName: 'Test' }]]) } };
    writeLastPersonId(personId);
  };

  it('lists the same sections on Admin and Preferences as on a person page', async () => {
    openStoreWithLastPerson();
    const render = await mount(parseRoute(`#/people/${personId}/overview`));
    const onPerson = navLinks();
    expect(onPerson).toContain('Overview');
    for (const hash of ['#/admin', '#/preferences']) {
      await render(parseRoute(hash));
      expect(navLinks(), hash).toEqual(onPerson);
    }
  });

  it('lists the same sidebar links, text and href, on a chart route, Admin and Preferences as on a person page (#965)', async () => {
    openStoreWithLastPerson();
    const render = await mount(parseRoute(`#/people/${personId}/overview`));
    const baseline = Array.from(box().querySelectorAll('nav#app-nav a')).map((a) => [
      a.textContent,
      a.getAttribute('href'),
    ]);
    const linkPairs = (): unknown[] =>
      Array.from(box().querySelectorAll('nav#app-nav a')).map((a) => [a.textContent, a.getAttribute('href')]);
    expect(baseline).toContainEqual(['Overview', `#/people/${personId}/overview`]);
    for (const hash of [`#/people/${personId}/charts/natal/wheel`, '#/admin', '#/preferences']) {
      await render(parseRoute(hash));
      expect(linkPairs(), hash).toEqual(baseline);
      // Only the active page is marked current, so no person tab is left highlighted elsewhere.
      const current = Array.from(box().querySelectorAll('nav#app-nav a[aria-current="page"]')).map((a) =>
        a.getAttribute('href'),
      );
      expect(current.length, hash).toBeLessThanOrEqual(1);
    }
  });

  it.each(['#/admin', '#/admin/usage', '#/preferences', '#/documents', '#/about', '#/changelog'])(
    'keeps the person sections on %s',
    async (hash) => {
      openStoreWithLastPerson();
      await mount(parseRoute(hash));
      expect(linkNamed('Overview')?.getAttribute('href')).toBe(`#/people/${personId}/overview`);
      expect(linkNamed('Tools')).toBeDefined();
      expect(linkNamed('PDF')).toBeDefined();
    },
  );

  it('keeps the person sections on the PDF creator', async () => {
    openStoreWithLastPerson();
    await mount({ kind: 'export-builder' });
    expect(linkNamed('Overview')).toBeDefined();
  });

  it('shows no person sections on the person picker, shared, or sign-in screens', async () => {
    openStoreWithLastPerson();
    const render = await mount(parseRoute('#/people'));
    for (const hash of ['#/shared', '#/set-password', '#/setup']) {
      await render(parseRoute(hash));
      expect(linkNamed('Overview'), hash).toBeUndefined();
    }
  });
});

// Every route the app defines (`Route['kind']` in `src/ui/route.ts`), each with a hash that `parseRoute`
// maps back to that kind. Typed as a full record, so a new route kind without a hash fails the type check.
const ROUTE_PERSON = 'p-abcdefghijklmnop';
const PERSON_HASH = `#/people/${ROUTE_PERSON}`;
const ROUTE_HASHES: Record<Route['kind'], string> = {
  about: '#/about',
  changelog: '#/changelog',
  people: '#/people',
  shared: '#/shared',
  documents: '#/documents',
  'export-builder': '#/documents/pdf',
  preferences: '#/preferences',
  admin: '#/admin',
  'admin-usage': '#/admin/usage',
  'corpus-overrides': '#/admin/corpus-overrides',
  'corpus-candidates': '#/admin/corpus-candidates',
  'set-password': '#/set-password',
  setup: '#/setup',
  person: `${PERSON_HASH}/birth-record`,
  'person-overview': `${PERSON_HASH}/overview`,
  consultation: `${PERSON_HASH}/consultation`,
  chart: `${PERSON_HASH}/charts/natal/wheel`,
  report: `${PERSON_HASH}/interpretation`,
  profections: `${PERSON_HASH}/timing/profections`,
  progressions: `${PERSON_HASH}/timing/progressions`,
  'solar-arc': `${PERSON_HASH}/timing/solar-arc`,
  'primary-directions': `${PERSON_HASH}/timing/primary-directions`,
  'timing-timeline': `${PERSON_HASH}/timing/timeline`,
  transit: `${PERSON_HASH}/timing/transits`,
  'periodic-transit': `${PERSON_HASH}/timing/forecast`,
  synastry: `${PERSON_HASH}/relationships/synastry`,
  composite: `${PERSON_HASH}/relationships/composite`,
  astrocartography: `${PERSON_HASH}/location/astrocartography`,
  cycles: '#/explore/cycles',
  'graphic-ephemeris': '#/explore/graphic-ephemeris',
  'event-search': '#/explore/event-search',
  eclipses: '#/explore/eclipses',
  horary: '#/explore/horary',
  electional: '#/explore/electional',
  rectification: '#/explore/rectification',
};

const EXPLICIT_NO_PERSON_SIDEBAR_KINDS = ['shared', 'set-password', 'setup'] as const;
const EXPECTED_NO_PERSON_SIDEBAR = [
  ['Tools', '#/explore/cycles'],
  ['PDF', '#/documents'],
];

describe('the sidebar on every route (#965)', () => {
  afterEach(() => {
    fakeStore.current = undefined;
    window.localStorage.clear();
  });

  const openStoreWithLastPerson = (): void => {
    fakeStore.current = { state: { people: new Map([[ROUTE_PERSON, { displayName: 'Test' }]]) } };
    writeLastPersonId(ROUTE_PERSON);
  };
  const sidebarPairs = (): unknown[] =>
    Array.from(box().querySelectorAll('nav#app-nav a')).map((a) => [a.textContent, a.getAttribute('href')]);

  it('maps every route kind to a hash that parseRoute reads back as that kind', () => {
    for (const [kind, hash] of Object.entries(ROUTE_HASHES)) {
      expect(parseRoute(hash).kind, hash).toBe(kind);
    }
    // The number of kinds in the Route union; a new kind must be added to ROUTE_HASHES and to this count.
    expect(Object.keys(ROUTE_HASHES)).toHaveLength(35);
  });

  it('keeps the exceptions to the person sidebar as exactly the #914 list', () => {
    expect([...EXPLICIT_NO_PERSON_SIDEBAR_KINDS]).toEqual(['shared', 'set-password', 'setup']);
  });

  it('shows the last-viewed person sections on the People list, which the root is (#1730)', async () => {
    openStoreWithLastPerson();
    await mount(parseRoute('#/'));
    expect(sidebarPairs()).toContainEqual(['Overview', `${PERSON_HASH}/overview`]);
    expect(sidebarPairs()).toContainEqual(['Tools', '#/explore/cycles']);
    expect(sidebarPairs()).toContainEqual(['PDF', '#/documents']);
  });

  it('lists Birth record before Overview in the person sidebar (#1347)', async () => {
    openStoreWithLastPerson();
    await mount(parseRoute(ROUTE_HASHES['person-overview']));
    const hrefs = sidebarPairs().map((pair) => (pair as string[])[1]);
    const birth = hrefs.indexOf(`${PERSON_HASH}/birth-record`);
    expect(birth).toBeGreaterThanOrEqual(0);
    expect(birth).toBeLessThan(hrefs.indexOf(`${PERSON_HASH}/overview`));
  });

  it('shows the person-page sidebar as the baseline', async () => {
    openStoreWithLastPerson();
    await mount(parseRoute(ROUTE_HASHES['person-overview']));
    expect(sidebarPairs()).toContainEqual(['Overview', `${PERSON_HASH}/overview`]);
    expect(sidebarPairs()).toContainEqual(['Tools', '#/explore/cycles']);
    expect(sidebarPairs()).toContainEqual(['PDF', '#/documents']);
  });

  const sameSidebarKinds = (Object.keys(ROUTE_HASHES) as Route['kind'][]).filter(
    (kind) => !(EXPLICIT_NO_PERSON_SIDEBAR_KINDS as readonly string[]).includes(kind),
  );
  it.each(sameSidebarKinds)(
    'shows the same sidebar links, text and href, on %s as on a person page (#965)',
    async (kind) => {
      const hash = ROUTE_HASHES[kind];
      openStoreWithLastPerson();
      const render = await mount(parseRoute(ROUTE_HASHES['person-overview']));
      const baseline = sidebarPairs();
      await render(parseRoute(hash));
      expect(sidebarPairs(), hash).toEqual(baseline);
      // Only the active page is marked current.
      const current = Array.from(box().querySelectorAll('nav#app-nav a[aria-current="page"]')).map((a) =>
        a.getAttribute('href'),
      );
      expect(current.length, hash).toBeLessThanOrEqual(1);
    },
  );

  it.each(EXPLICIT_NO_PERSON_SIDEBAR_KINDS)(
    'shows only Tools and PDF as enabled links on %s, with the person options disabled (#914, #1697)',
    async (kind) => {
      const hash = ROUTE_HASHES[kind];
      openStoreWithLastPerson();
      await mount(parseRoute(hash));
      expect(sidebarPairs(), hash).toEqual(EXPECTED_NO_PERSON_SIDEBAR);
      expect(linkNamed('Overview'), hash).toBeUndefined();
      expect(disabledPersonLabels(), hash).toEqual(EXPECTED_PERSON_LABELS_EN);
    },
  );
});

// The person options the sidebar lists for a person, in English (`PERSON_TABS` that are not in a
// family, then the three families), as `AppNav.tsx` renders them.
const EXPECTED_PERSON_LABELS_EN = [
  'Birth record',
  'Overview',
  'Consultation',
  'Charts',
  'Interpretation',
  'Astrocartography',
  'Transits & Forecast',
  'Progressions & Directions',
  'Relationship Charts',
];
const EXPECTED_PERSON_LABELS_NL = [
  'Geboortegegevens',
  'Overzicht',
  'Consultatie',
  'Horoscopen',
  'Interpretatie',
  'Astrocartografie',
  'Transits & prognose',
  'Progressies & directies',
  'Relatiehoroscopen',
];

/** The person options rendered as disabled buttons in the sidebar, by their visible text. */
const disabledPersonLabels = (): string[] =>
  Array.from(box().querySelectorAll<HTMLButtonElement>('nav#app-nav button.disabled')).map((b) => b.textContent ?? '');

describe('the person options with no person selected (#1697)', () => {
  afterEach(() => {
    fakeStore.current = undefined;
    window.localStorage.clear();
    setLocale('en');
  });

  it('shows every person option on the People page, disabled, with the tooltip (en)', async () => {
    await mount(parseRoute('#/people'));
    expect(disabledPersonLabels()).toEqual(EXPECTED_PERSON_LABELS_EN);
    for (const button of Array.from(box().querySelectorAll<HTMLButtonElement>('nav#app-nav button.disabled'))) {
      expect(button.disabled, button.textContent).toBe(true);
      expect(button.getAttribute('title'), button.textContent).toBe('Select a person first');
      expect(button.getAttribute('aria-label'), button.textContent).toContain('select a person first');
    }
    // Tools and PDF stay enabled links.
    expect(navLinks()).toEqual(['Tools', 'PDF']);
  });

  it('shows the same options disabled with the Dutch tooltip in Dutch (nl)', async () => {
    setLocale('nl');
    await mount(parseRoute('#/people'));
    expect(disabledPersonLabels()).toEqual(EXPECTED_PERSON_LABELS_NL);
    for (const button of Array.from(box().querySelectorAll<HTMLButtonElement>('nav#app-nav button.disabled'))) {
      expect(button.disabled, button.textContent).toBe(true);
      expect(button.getAttribute('title'), button.textContent).toBe('Selecteer eerst een persoon');
    }
    expect(navLinks()).toEqual(['Hulpmiddelen', 'PDF']);
  });

  it('keeps the disabled person options off the enabled links, so none is reached by click', async () => {
    await mount(parseRoute('#/people'));
    expect(linkNamed('Overview')).toBeUndefined();
    expect(linkNamed('Charts')).toBeUndefined();
  });
});

describe('the person options with a person selected (#1697)', () => {
  afterEach(() => {
    fakeStore.current = undefined;
    window.localStorage.clear();
    setLocale('en');
  });

  const personId = 'p-abcdefghijklmnop';
  // A person with a birth moment, so every tab is enabled (`isTabEnabled`).
  const openStoreWithCompletePerson = (): void => {
    fakeStore.current = {
      state: { people: new Map([[personId, { displayName: 'Test', moment: {} }]]) },
    };
    writeLastPersonId(personId);
  };

  it('shows the same options enabled, with no tooltip, once a person is selected', async () => {
    openStoreWithCompletePerson();
    await mount(parseRoute(`#/people/${personId}/overview`));
    expect(disabledPersonLabels()).toEqual([]);
    const enabled = Array.from(box().querySelectorAll('nav#app-nav a')).map((a) => a.textContent);
    for (const label of EXPECTED_PERSON_LABELS_EN) {
      expect(enabled, label).toContain(label);
    }
    const tooltips = Array.from(box().querySelectorAll('nav#app-nav [title]')).map((el) => el.getAttribute('title'));
    expect(tooltips).not.toContain('Select a person first');
  });

  it('shows the same options enabled in Dutch with no tooltip (nl)', async () => {
    setLocale('nl');
    openStoreWithCompletePerson();
    await mount(parseRoute(`#/people/${personId}/overview`));
    expect(disabledPersonLabels()).toEqual([]);
    const enabled = Array.from(box().querySelectorAll('nav#app-nav a')).map((a) => a.textContent);
    for (const label of EXPECTED_PERSON_LABELS_NL) {
      expect(enabled, label).toContain(label);
    }
  });
});

describe('a deleted person does not linger after #1697 (#914)', () => {
  afterEach(() => {
    fakeStore.current = undefined;
    window.localStorage.clear();
  });

  it('shows the person options disabled, not the deleted person’s enabled tabs, on a tool page', async () => {
    const deleted = 'p-deletedperson0000';
    // The store no longer holds this person, but it was the last one viewed.
    fakeStore.current = { state: { people: new Map([['p-otherperson000000', { displayName: 'Other' }]]) } };
    writeLastPersonId(deleted);
    await mount(parseRoute('#/explore/cycles'));
    expect(
      Array.from(box().querySelectorAll('nav#app-nav a')).some((a) => (a.getAttribute('href') ?? '').includes(deleted)),
    ).toBe(false);
    expect(disabledPersonLabels()).toEqual(EXPECTED_PERSON_LABELS_EN);
  });
});

describe('no "Return to" heading in the sidebar (#1696)', () => {
  afterEach(() => {
    fakeStore.current = undefined;
    window.localStorage.clear();
  });

  it.each([
    ['a tool page', '#/explore/cycles'],
    ['the PDF page', '#/documents'],
    ['Preferences', '#/preferences'],
    ['Admin', '#/admin'],
    ['a person page', ROUTE_HASHES['person-overview']],
  ])('renders no "Return to" text on %s, in English and in Dutch', async (_name, hash) => {
    for (const locale of ['en', 'nl'] as const) {
      setLocale(locale);
      fakeStore.current = { state: { people: new Map([[ROUTE_PERSON, { displayName: 'Test' }]]) } };
      writeLastPersonId(ROUTE_PERSON);
      await mount(parseRoute(hash));
      const text = box().querySelector('nav#app-nav')?.textContent ?? '';
      expect(text, `${hash} (${locale})`).not.toContain('Return to');
      expect(text, `${hash} (${locale})`).not.toContain('Terug naar');
      act(() => {
        mounted?.root.unmount();
      });
      mounted?.container.remove();
      mounted = undefined;
    }
  });
});
