/**
 * The header's navigation (#234, #417, #421): one labelled `<nav>` that replaces the bordered tab
 * strip that used to sit above each person's screens.
 *
 * What it holds, left to right:
 * - on a person's screen, **whose chart** this is (the person chip) and that person's tabs: Birth
 *   record, Charts (one plain link; the chart type is chosen on the page by `ChartTypeSelector.tsx`:
 *   natal, draconic, harmonic, solar and lunar return),
 *   Interpretation, Astrocartography and the three sections (Transits & Forecast, Progressions &
 *   Directions, Relationship Charts), each one plain link to its first sub-view (#882). With no person
 *   selected these same entries are still shown, disabled with a "Select a person first" tooltip (#1697);
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
import { lazy, Suspense, useEffect, useId, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
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
import { useNarrowViewport } from './use-narrow-viewport.js';
import { useWorkspaceUtilityTarget } from './workspace-utility-slot.js';
import { Button } from './primitives/Button.js';

// Charts is one destination (#511): the chart type is chosen on the page, not in this navigation.
// 'consultation' (#563) is here too, not in LEADING_KEYS below — it needs a complete birth
// moment (isTabEnabled), unlike the two tabs that are always reachable.
const UNGROUPED_KEYS = new Set(['overview', 'consultation', 'birth-record', 'chart', 'report', 'astrocartography']);
// Rendered first (Birth record, then Overview, #1347) — the two tabs a person can land on
// regardless of completeness. The order comes from PERSON_TABS, which is filtered below.
const LEADING_KEYS = new Set(['overview', 'birth-record']);

/**
 * A disabled sidebar entry (#1697, reusing the birth-record pattern): a `disabled` button with its own accessible
 * name and the tooltip that says why it is off. Both the birth-record and the no-person cases render through it.
 */
function disabledEntry(
  key: string,
  label: string,
  className: string,
  accessibleName: string,
  hint: string,
): React.JSX.Element {
  return (
    <button
      key={key}
      type="button"
      disabled
      className={`${className} disabled`}
      aria-label={accessibleName}
      title={hint}
    >
      {label}
    </button>
  );
}

/**
 * The person's tab entries (#1697). With no person (`personId` undefined, e.g. the People list) every
 * entry is still shown, disabled, with the "Select a person first" tooltip, so the sidebar is the same
 * on every screen. With a person, a tab that needs a complete birth record is disabled as before.
 */
function PersonTabEntries({
  personId,
  hasBirthMoment,
  route,
  onNavigate,
}: {
  readonly personId: string | undefined;
  readonly hasBirthMoment: boolean;
  readonly route: Route;
  readonly onNavigate: () => void;
}): React.JSX.Element {
  const t = useMessages(appNavMessages);
  const active = activePersonTabKey(route);
  const tabsByKey = new Map(PERSON_TABS.map((tab) => [tab.key, tab]));

  function renderTab(tab: PersonTab, className: string): React.JSX.Element {
    const label = t.tabLabels[tab.key];
    if (personId === undefined) {
      return disabledEntry(tab.key, label, className, t.disabledNoPersonSuffix(label), t.selectPersonFirstHint);
    }
    if (!isTabEnabled(tab.key, hasBirthMoment)) {
      return disabledEntry(tab.key, label, className, t.disabledTabSuffix(label), t.completeBirthRecordHint);
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

  return (
    <>
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
        if (personId === undefined) {
          return disabledEntry(
            family.key,
            familyLabel,
            'app-nav-item',
            t.disabledNoPersonSuffix(familyLabel),
            t.selectPersonFirstHint,
          );
        }
        if (!isTabEnabled(first.key, hasBirthMoment)) {
          return disabledEntry(
            family.key,
            familyLabel,
            'app-nav-item',
            t.disabledTabSuffix(familyLabel),
            t.completeBirthRecordHint,
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

/** The person chip, then that person's tabs. Needs the store, so it is only rendered once one is open. */
function PersonMenu({
  personId,
  route,
  dropdown,
  onNavigate,
}: {
  readonly personId: string;
  readonly route: Route;
  readonly dropdown: ExclusiveOpen<string>;
  readonly onNavigate: () => void;
}): React.JSX.Element {
  const t = useMessages(appNavMessages);
  const state = useStoreState();
  const person = state.people.get(personId);
  const name = person?.displayName ?? '';
  return (
    <>
      {person !== undefined && (
        <PersonSwitcher
          personId={personId}
          name={name === '' ? t.unnamedPerson : name}
          route={route}
          dropdown={dropdown}
          onNavigate={onNavigate}
        />
      )}
      <PersonTabEntries
        personId={personId}
        hasBirthMoment={person?.moment !== undefined}
        route={route}
        onNavigate={onNavigate}
      />
    </>
  );
}

// App-scoped screens that keep the last-viewed person's sections in the sidebar (#965), so the
// sidebar is the same on every screen. The People list is one of them (#1730, owner answer 2026-11-18,
// reversing the #914 exclusion): the root is now People, so it shows the last-viewed person's sections
// as the root did. Without a live last-viewed person, the person entries are shown disabled with the
// "Select a person first" tooltip (#1697).
const KEEP_PERSON_SECTIONS_KINDS: ReadonlySet<Route['kind']> = new Set([
  'people',
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
 * The search trigger (#1654, moved to the workspace utility row by #1769): on a wide screen it sits alone in the
 * workspace's slim top-right utility row, above every page header, at the same coordinates on every route, whether or
 * not the page has a header (`WorkspaceShell.tsx`, portalled through `workspace-utility-slot.tsx`), so the sidebar holds no search.
 * It is the same icon-only circle at every width (#1769), with a CSS tooltip naming the shortcut. At 40rem and below it sits beside the Menu button.
 * It opens the command palette, and Ctrl+K or Cmd+K opens it from anywhere outside a text field.
 * The shortcut only calls `preventDefault` on its own key, so other keydown handlers still receive it.
 * The palette loads on its first open and stays mounted after that, hidden while closed, so `StagedDialog`
 * can return focus here when it closes (#1654). Unmounting on close would run that focus return too late.
 */
function PaletteTrigger(): React.JSX.Element {
  const t = useMessages(appNavMessages);
  const [paletteLoaded, setPaletteLoaded] = useState(false);
  const [paletteOpen, setPaletteOpen] = useState(false);
  const triggerRef = useRef<HTMLButtonElement>(null);
  // The tooltip names the shortcut and is linked to the trigger; Escape hides it until the pointer leaves or focus moves (#1769).
  const tooltipId = useId();
  const [tipDismissed, setTipDismissed] = useState(false);
  // The narrow and wide triggers are the same icon-only circle, so the trigger keeps its place at every width (#1769).
  const narrow = useNarrowViewport();
  // The workspace's top-right utility row, where the desktop trigger renders (#1769); null when no shell is mounted.
  const utilityRow = useWorkspaceUtilityTarget();

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

  const shortcut = isApplePlatform() ? t.shortcutHintApple : t.shortcutHintOther;
  const searchButton = (
    <span
      className={tipDismissed ? 'app-nav-search-wrap is-tip-dismissed' : 'app-nav-search-wrap'}
      onPointerLeave={() => {
        setTipDismissed(false);
      }}
    >
      <Button
        variant="plain"
        ref={triggerRef}
        className="app-nav-search primitive-button-circle"
        aria-label={t.searchLabel}
        aria-haspopup="dialog"
        aria-describedby={tooltipId}
        onClick={openPalette}
        onKeyDown={(event) => {
          // Escape hides the tooltip until the pointer leaves or focus moves on (#1769).
          if (event.key === 'Escape') setTipDismissed(true);
        }}
        onBlur={() => {
          setTipDismissed(false);
        }}
      >
        {/* Search icon geometry from Lucide (lucide.dev), ISC licence; inlined, no dependency (#1769). */}
        <svg viewBox="0 0 24 24" width="18" height="18" aria-hidden="true" focusable="false">
          <circle cx="11" cy="11" r="8" />
          <path d="m21 21-4.34-4.34" />
        </svg>
      </Button>
      <span role="tooltip" id={tooltipId} className="app-nav-search-tip">
        {t.searchTooltip(shortcut)}
      </span>
    </span>
  );
  const palette = paletteLoaded && (
    <Suspense fallback={null}>
      <LazyCommandPalette open={paletteOpen} onClose={closePalette} returnFocusTo={triggerRef} />
    </Suspense>
  );

  // Below 40rem the trigger is the icon-only circle beside Menu, in the nav (#1650). On desktop it is in the workspace
  // utility row above the page (#1769), so the sidebar holds no search. With no shell mounted there is no desktop
  // trigger; Ctrl+K still opens the palette.
  if (narrow) {
    return (
      <>
        {searchButton}
        {palette}
      </>
    );
  }
  return (
    <>
      {utilityRow !== null && createPortal(searchButton, utilityRow)}
      {palette}
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
  // Tool pages (#453), the Documents workspace (#914) and the other app-scoped
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
        {/* Without a person the person entries stay, disabled with a tooltip (#1697), so the sidebar is the same on every screen. */}
        {personId !== undefined && store !== undefined ? (
          <PersonMenu personId={personId} route={route} dropdown={dropdown} onNavigate={closeAll} />
        ) : (
          <PersonTabEntries personId={undefined} hasBirthMoment={false} route={route} onNavigate={closeAll} />
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
