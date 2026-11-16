/**
 * The header's navigation (#234, #417, #421): one labelled `<nav>` that replaces the bordered tab
 * strip that used to sit above each person's screens.
 *
 * What it holds, left to right:
 * - on a person's screen, **whose chart** this is (the person chip) and that person's tabs: Birth
 *   record, Charts (one plain link; the chart type is chosen on the page by `ChartTypeSelector.tsx`:
 *   natal, draconic, harmonic, solar and lunar return),
 *   Interpretation, Astrocartography and the three sections (Transits & Forecast, Progressions &
 *   Directions, Relationship Charts), each one plain link to its first sub-view (#882);
 * - **Tools**, on every screen: one plain link to the first calculator (#882). The sub-views of each
 *   section, tools included, are tabs on the page (`SectionNav.tsx`), not a sub-menu here;
 * - **Build custom PDF…**, on every screen: a plain link, not a dropdown — it is the only export
 *   action left here. Full-data/people-CSV export moved to Preferences → Data & privacy (#510),
 *   and each screen's own exports (a chart's image, its print version) moved to that screen's own
 *   `PageHeader` (#506/#509), which reads the same registry (`PreferencesView.tsx`, `EventSearchView.tsx`,
 *   `CorpusOverridesPanel.tsx` and `SortableTable.tsx` register today). Moving
 *   this link itself to a future Documents destination is the one piece of that same plan item
 *   still outstanding.
 *
 * Admin is reached from the account area on the top bar (`AccountPanel.tsx`), not from here (#443):
 * an administrator does not need the entry twice.
 *
 * Marked up as plain navigation links, not `role="tablist"`: these are links to different routes,
 * not same-page panels, so the WAI-ARIA tab pattern (roving tabindex, arrow keys) does not fit.
 *
 * The person switcher is the one dropdown left; it shares `useExclusiveOpen` (#417) with nothing else.
 * Below 1024px the whole nav folds behind a Menu button and opens as a panel under the header;
 * choosing anything, Escape or changing page closes it.
 */
/**
 * @module AppNav
 * @purpose Renders the sticky header's main navigation: a person's tabs and one link per multi-view section (#882), the Tools link, and the PDF link.
 * @conventions No sub-menus for sections: sub-views are tabs on the page (SectionNav). The person switcher keeps one `useExclusiveOpen`; folds behind a Menu button below 1024px; text comes from co-located `AppNav.messages.ts` via `useMessages()`.
 * @exports AppNav
 */
import { lazy, Suspense, useEffect, useRef, useState } from 'react';
import { appNavMessages } from './AppNav.messages.js';
import { useMessages } from './messages.js';
import { activeFeatureKey, activePersonTabKey, activeToolKey } from './feature-registry.js';
import { isTabEnabled, PERSON_TAB_FAMILIES, PERSON_TABS } from './person-nav.js';
import type { PersonTab } from './person-nav.js';
import { routeHref, type Route } from './route.js';
import { useOptionalStore, useStoreState } from './store-context.js';
import { TOOLS } from './tools-nav.js';
import { useLastPersonId, writeLastPersonId } from './last-person.js';
import { PersonSwitcher } from './PersonSwitcher.js';
import { useExclusiveOpen, type ExclusiveOpen } from './use-exclusive-open.js';
import { Button } from './primitives/Button.js';

// Charts is one destination (#511): the chart type is chosen on the page, not in this navigation.
// 'consultation' (#563) is here too, not in LEADING_KEYS below — it needs a complete birth
// moment (isTabEnabled), unlike the two tabs that are always reachable.
const UNGROUPED_KEYS = new Set(['overview', 'consultation', 'birth-record', 'chart', 'report', 'astrocartography']);
// Rendered first (Birth record, then Overview, #1347) — the two tabs a person can land on
// regardless of completeness. The order comes from PERSON_TABS, which is filtered below.
const LEADING_KEYS = new Set(['overview', 'birth-record']);

/** The person chip and that person's tabs. Needs the store, so it is only rendered once one is open. */
function PersonMenu({
  personId,
  route,
  dropdown,
  onNavigate,
  history,
}: {
  readonly personId: string;
  readonly route: Route;
  /** True on a global tool page, where the person is only the way back, not the subject (docs/ui/UI-UX_GUIDELINES.md §2). */
  readonly history: boolean;
  readonly dropdown: ExclusiveOpen<string>;
  readonly onNavigate: () => void;
}): React.JSX.Element {
  const t = useMessages(appNavMessages);
  const state = useStoreState();
  const person = state.people.get(personId);
  const hasBirthMoment = person?.moment !== undefined;
  const active = activePersonTabKey(route);
  const tabsByKey = new Map(PERSON_TABS.map((tab) => [tab.key, tab]));

  function renderTab(tab: PersonTab, className: string): React.JSX.Element {
    const label = t.tabLabels[tab.key];
    if (!isTabEnabled(tab.key, hasBirthMoment)) {
      return (
        <button
          key={tab.key}
          type="button"
          disabled
          className={`${className} disabled`}
          aria-label={t.disabledTabSuffix(label)}
          title={t.completeBirthRecordHint}
        >
          {label}
        </button>
      );
    }
    const isActive = tab.key === active;
    return (
      <a
        key={tab.key}
        href={tab.buildHref(personId)}
        className={isActive ? `${className} active` : className}
        aria-current={isActive ? 'page' : undefined}
        onClick={onNavigate}
      >
        {label}
      </a>
    );
  }

  const name = person?.displayName ?? '';
  return (
    <>
      {person !== undefined && history && <p className="app-nav-menu-heading app-nav-history">{t.returnToLabel}</p>}
      {person !== undefined && (
        <PersonSwitcher
          personId={personId}
          name={name === '' ? t.unnamedPerson : name}
          route={route}
          dropdown={dropdown}
          onNavigate={onNavigate}
        />
      )}
      {PERSON_TABS.filter((tab) => LEADING_KEYS.has(tab.key)).map((tab) => renderTab(tab, 'app-nav-item'))}
      {PERSON_TABS.filter((tab) => UNGROUPED_KEYS.has(tab.key) && !LEADING_KEYS.has(tab.key)).map((tab) =>
        renderTab(tab, 'app-nav-item'),
      )}
      {PERSON_TAB_FAMILIES.map((family) => {
        const familyLabel = t.familyLabels[family.key];
        const firstKey = family.members[0];
        const first = firstKey === undefined ? undefined : tabsByKey.get(firstKey);
        if (first === undefined) throw new Error(`unreachable: family "${family.key}" always has a first member`);
        // One entry per section (#882): it opens the first sub-view, and `SectionNav` shows the rest as tabs.
        if (!isTabEnabled(first.key, hasBirthMoment)) {
          return (
            <button
              key={family.key}
              type="button"
              disabled
              className="app-nav-item disabled"
              aria-label={t.disabledTabSuffix(familyLabel)}
              title={t.completeBirthRecordHint}
            >
              {familyLabel}
            </button>
          );
        }
        const familyActive = active !== null && family.members.includes(active);
        return (
          <a
            key={family.key}
            href={first.buildHref(personId)}
            className={familyActive ? 'app-nav-item active' : 'app-nav-item'}
            aria-current={familyActive ? 'page' : undefined}
            onClick={onNavigate}
          >
            {familyLabel}
          </a>
        );
      })}
    </>
  );
}

// App-scoped screens that keep the last-viewed person's sections in the sidebar (#965), so the
// sidebar is the same on every screen. The home screen (#/) is one of them (#965 owner decision,
// reversing the #1058 Tools-and-PDF-only sidebar). Without a last-viewed person it shows no person
// sections, like the People list. The People list (the person picker; a stale person's tabs must not
// linger there, #914), shared charts and the sign-in/setup forms are deliberately not in this set.
const KEEP_PERSON_SECTIONS_KINDS: ReadonlySet<Route['kind']> = new Set([
  'home',
  'documents',
  'export-builder',
  'preferences',
  'admin',
  'admin-usage',
  'corpus-overrides',
  'corpus-candidates',
  'about',
  'changelog',
]);

/** Apple keyboards press Cmd, so the shortcut hint names ⌘K there and Ctrl K elsewhere (#1654). */
function isApplePlatform(): boolean {
  return /Mac|iPhone|iPad|iPod/.test(navigator.platform);
}

/** True for a field the reader types in, where Ctrl+K belongs to the text and must not open the palette. */
function isEditableTarget(target: EventTarget | null): boolean {
  if (!(target instanceof HTMLElement)) return false;
  if (
    target instanceof HTMLInputElement ||
    target instanceof HTMLSelectElement ||
    target instanceof HTMLTextAreaElement
  ) {
    return true;
  }
  const editable = target.closest('[contenteditable]');
  return editable !== null && editable.getAttribute('contenteditable') !== 'false';
}

// The palette loads on first open, so its code stays out of the header's first chunk (#1654).
const LazyCommandPalette = lazy(() =>
  import('./CommandPalette.js').then((module) => ({ default: module.CommandPalette })),
);

/**
 * The search trigger (#1654): a pill on a wide screen, an icon-only circle beside the Menu button below
 * 64rem. It opens the command palette, and Ctrl+K or Cmd+K opens it from anywhere outside a text field.
 * The shortcut only calls `preventDefault` on its own key, so other keydown handlers still receive it.
 * The palette loads on its first open and stays mounted after that, hidden while closed, so `StagedDialog`
 * can return focus here when it closes (#1654). Unmounting on close would run that focus return too late.
 */
function PaletteTrigger(): React.JSX.Element {
  const t = useMessages(appNavMessages);
  const [paletteLoaded, setPaletteLoaded] = useState(false);
  const [paletteOpen, setPaletteOpen] = useState(false);
  const triggerRef = useRef<HTMLButtonElement>(null);

  function openPalette(): void {
    setPaletteLoaded(true);
    setPaletteOpen(true);
  }

  function closePalette(): void {
    setPaletteOpen(false);
  }

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent): void => {
      if (!(event.ctrlKey || event.metaKey) || event.altKey || event.shiftKey) return;
      if (event.key.toLowerCase() !== 'k' || isEditableTarget(event.target)) return;
      event.preventDefault();
      setPaletteLoaded(true);
      setPaletteOpen(true);
    };
    window.addEventListener('keydown', onKeyDown);
    return () => {
      window.removeEventListener('keydown', onKeyDown);
    };
  }, []);

  return (
    <>
      <Button
        variant="plain"
        ref={triggerRef}
        className="app-nav-search"
        aria-label={`${t.searchPlaceholder} ${isApplePlatform() ? t.shortcutHintApple : t.shortcutHintOther}`}
        aria-haspopup="dialog"
        onClick={openPalette}
      >
        <svg viewBox="0 0 24 24" aria-hidden="true" focusable="false">
          <circle cx="11" cy="11" r="7" />
          <path d="M20 20l-3.5-3.5" />
        </svg>
        <span className="app-nav-search-text">{t.searchPlaceholder}</span>
        <kbd className="app-nav-search-hint" aria-hidden="true">
          {isApplePlatform() ? t.shortcutHintApple : t.shortcutHintOther}
        </kbd>
      </Button>
      {paletteLoaded && (
        <Suspense fallback={null}>
          <LazyCommandPalette open={paletteOpen} onClose={closePalette} returnFocusTo={triggerRef} />
        </Suspense>
      )}
    </>
  );
}

export function AppNav({ route }: { route: Route }): React.JSX.Element {
  const t = useMessages(appNavMessages);
  const store = useOptionalStore();
  const routePersonId = 'personId' in route ? route.personId : undefined;
  const activeTool = activeToolKey(route);
  // Documents workspace is app-scoped like Preferences; its active state comes from the registry.
  const documentsActive = activeFeatureKey(route, 'global') === 'documents';
  const lastPersonId = useLastPersonId();
  // Tool pages (#453), the Documents workspace (#914), the home screen (#965) and the other app-scoped
  // screens (#965: Preferences, Admin, PDF creator, About, Changelog) carry no person in their own route
  // (`route.ts`). On all of them, the last person seen is reused, so their nav tabs keep showing instead
  // of disappearing, and a link back to one of those tabs returns to the same person rather than
  // requiring they be picked again. The People list and other person-less routes are not in
  // that set, so a stale person's tabs do not linger there. Checked against the live store so a
  // since-deleted person doesn't linger here either.
  const personId =
    routePersonId ??
    ((activeTool !== null || KEEP_PERSON_SECTIONS_KINDS.has(route.kind)) &&
    lastPersonId !== undefined &&
    store?.state.people.has(lastPersonId)
      ? lastPersonId
      : undefined);

  useEffect(() => {
    if (routePersonId !== undefined) writeLastPersonId(routePersonId);
  }, [routePersonId]);

  // Closed on every page change: the route's kind and person identify the page.
  const pageKey = `${route.kind}:${personId ?? ''}`;
  const dropdown = useExclusiveOpen<string>(pageKey);
  const [menuOpen, setMenuOpen] = useState(false);
  const toggleRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    setMenuOpen(false);
  }, [pageKey]);

  useEffect(() => {
    if (!menuOpen) return undefined;
    const onKeyDown = (event: KeyboardEvent): void => {
      if (event.key !== 'Escape' || dropdown.open !== undefined) return;
      setMenuOpen(false);
      toggleRef.current?.focus();
    };
    document.addEventListener('keydown', onKeyDown);
    return () => {
      document.removeEventListener('keydown', onKeyDown);
    };
  }, [menuOpen, dropdown.open]);

  const closeAll = (): void => {
    dropdown.close();
    setMenuOpen(false);
  };

  return (
    <div className="app-nav-wrap">
      <PaletteTrigger />
      {/* Only shown below 1024px (`app.css`), where the nav is a panel under the header. */}
      <button
        type="button"
        ref={toggleRef}
        className="app-nav-toggle"
        aria-expanded={menuOpen}
        aria-controls="app-nav"
        onClick={() => {
          setMenuOpen((open) => !open);
        }}
      >
        {menuOpen ? t.menuButtonClose : t.menuButton}
      </button>
      <nav id="app-nav" className={`app-nav${menuOpen ? ' open' : ''}`} aria-label={t.mainNavAriaLabel}>
        {personId !== undefined && store !== undefined && (
          <PersonMenu
            personId={personId}
            route={route}
            dropdown={dropdown}
            onNavigate={closeAll}
            history={routePersonId === undefined}
          />
        )}
        {/* One entry (#882): opens the first tool; the other tools are tabs on the page (`SectionNav`). */}
        <a
          href={TOOLS[0]?.href ?? routeHref({ kind: 'cycles' })}
          className={activeTool !== null ? 'app-nav-item active' : 'app-nav-item'}
          aria-current={activeTool !== null ? 'page' : undefined}
          onClick={closeAll}
        >
          {t.toolsLabel}
        </a>
        {/* The current screen's own exports now live in its PageHeader (#506/#509), not here; this
            is the only export action that is not page-specific. A single-item dropdown would be
            worse than a plain link, so it is one — same as Overview/Birth record above. */}
        <a
          href={routeHref({ kind: 'documents' })}
          className={documentsActive ? 'app-nav-item active' : 'app-nav-item'}
          aria-current={documentsActive ? 'page' : undefined}
          title={t.documentsHint}
          onClick={closeAll}
        >
          {t.documents}
        </a>
      </nav>
    </div>
  );
}
