/**
 * The header's navigation (#234, #417, #421): one labelled `<nav>` that replaces the bordered tab
 * strip that used to sit above each person's screens.
 *
 * What it holds, left to right:
 * - on a person's screen, **whose chart** this is (the person chip) and that person's tabs: Birth
 *   record, Charts (a dropdown of the chart types: natal, draconic, harmonic, solar and lunar return),
 *   Interpretation, Astrocartography and the three grouped dropdowns (Transits & Forecast, Progressions &
 *   Directions, Relationship Charts);
 * - **Tools**, on every screen: the calculators that are not about one person's chart
 *   (`tools-nav.ts`);
 * - **Export**, on every screen.
 *
 * Admin is reached from the account area on the top bar (`AccountPanel.tsx`), not from here (#443):
 * an administrator does not need the entry twice.
 *
 * Marked up as plain navigation links, not `role="tablist"`: these are links to different routes,
 * not same-page panels, so the WAI-ARIA tab pattern (roving tabindex, arrow keys) does not fit.
 *
 * Dropdowns share one `useExclusiveOpen` (#417): one open at a time, closed by choosing something,
 * by a click elsewhere, by Escape and by changing page. Below 1024px the whole nav folds behind a
 * Menu button and opens as a panel under the header; choosing anything, Escape or changing page
 * closes it. The dropdowns then open in place inside that panel rather than floating over it.
 */
/**
 * @module AppNav
 * @purpose Renders the sticky header's main navigation: a person's chart tabs/dropdowns, the Tools menu, and the Export menu.
 * @conventions Dropdowns share one `useExclusiveOpen` so only one is open at a time; folds behind a Menu button below 1024px; text comes from co-located `AppNav.messages.ts` via `useMessages()`.
 * @exports AppNav
 */
import { useEffect, useRef, useState } from 'react';
import { appNavMessages } from './AppNav.messages.js';
import { useMessages } from './messages.js';
import { activeTabKey, isTabEnabled, PERSON_TAB_FAMILIES, PERSON_TABS } from './person-nav.js';
import { CHART_TYPES, chartHref } from './chart-sections.js';
import { chartTypesMessages } from './ChartTypes.messages.js';
import type { PersonTab } from './person-nav.js';
import type { Route } from './route.js';
import { useOptionalStore, useStoreState } from './store-context.js';
import type { Person } from '../domain/person.js';
import { activeToolKey, TOOLS } from './tools-nav.js';
import { useEphemerisProvider } from './EphemerisProviderContext.js';
import { useExportItems, type ExportItem } from './export-registry.js';
import { useLastPersonId, writeLastPersonId } from './last-person.js';
import { PersonSwitcher } from './PersonSwitcher.js';
import { useRulershipChoice } from './rulership-setting.js';
import { useSymbolClass } from './symbol-setting.js';
import { downloadText } from './download.js';
import { APP_VERSION } from '../version.js';
import { buildFullExport, fullExportFilename, peopleCsvFilename, peopleToCsv } from '../domain/full-export.js';
import { useExclusiveOpen, type ExclusiveOpen } from './use-exclusive-open.js';

// The chart is not here: it is a menu of the chart types (below), not a single link.
const UNGROUPED_KEYS = new Set(['overview', 'birth-record', 'report', 'astrocartography']);
// Rendered first, in this fixed order, before the Charts dropdown — the two tabs a person can
// land on regardless of completeness (#506/#509's canonical Overview destination plus the
// existing Birth record tab), per docs/UI-UX_GUIDELINES.md §2's person-workspace order.
const LEADING_KEYS = new Set(['overview', 'birth-record']);
const CHARTS_GROUP = 'charts';
const TOOLS_GROUP = 'tools';
const EXPORT_GROUP = 'export';

interface ExportStatus {
  readonly kind: 'busy' | 'done' | 'error';
  readonly text: string;
}

/**
 * The Export menu (#export): everything the user can export, in one place, not scattered under each screen.
 * "Everything" is one file; the rest is split because it should be: the people as a spreadsheet, and the
 * current screen's own exports (a chart's image, its print version) as submenus of "This page", registered
 * by the screen (`export-registry.tsx`) while it is mounted. The status of a running export is announced in
 * `AppNav`, since the menu closes as soon as something is chosen.
 */
function ExportMenu({
  dropdown,
  run,
}: {
  readonly dropdown: ExclusiveOpen<string>;
  readonly run: (what: string, action: () => void | Promise<void>) => void;
}): React.JSX.Element {
  const t = useMessages(appNavMessages);
  const store = useOptionalStore();
  const { provider } = useEphemerisProvider();
  const [rulership] = useRulershipChoice();
  const [symbolClass] = useSymbolClass();
  const pageItems = useExportItems();
  const [openGroup, setOpenGroup] = useState<string | undefined>(undefined);
  const isOpen = dropdown.open === EXPORT_GROUP;
  useEffect(() => {
    if (!isOpen) setOpenGroup(undefined);
  }, [isOpen]);

  const people = (): readonly Person[] => (store === undefined ? [] : [...store.state.people.values()]);
  const everything = (): void => {
    run(t.exportEverythingName, async () => {
      if (provider === undefined) throw new Error(t.exportNeedsEngine);
      const now = new Date();
      const archive = await buildFullExport({
        people: people(),
        provider,
        appVersion: APP_VERSION,
        rulership,
        symbolClass,
        now,
      });
      downloadText(fullExportFilename(now), `${JSON.stringify(archive, null, 2)}\n`, 'application/json');
    });
  };
  const peopleCsv = (): void => {
    run(t.exportPeopleName, () => {
      const now = new Date();
      downloadText(peopleCsvFilename(now), peopleToCsv(people()), 'text/csv');
    });
  };

  const groups = new Map<string, ExportItem[]>();
  const ungrouped: ExportItem[] = [];
  for (const item of pageItems) {
    if (item.group === undefined) ungrouped.push(item);
    else groups.set(item.group, [...(groups.get(item.group) ?? []), item]);
  }
  const itemButton = (item: ExportItem): React.JSX.Element => (
    <button
      key={item.key}
      type="button"
      className="app-nav-menu-item"
      disabled={item.disabled === true}
      onClick={() => {
        run(item.label, item.run);
      }}
    >
      {item.label}
    </button>
  );

  return (
    <NavGroup
      groupKey={EXPORT_GROUP}
      label={t.exportLabel}
      popupAriaLabel={t.subtabsAriaLabel(t.exportLabel)}
      active={false}
      dropdown={dropdown}
    >
      <a
        href="#/export"
        className="app-nav-menu-item"
        title={t.exportPdfBuilderHint}
        onClick={() => {
          dropdown.close();
        }}
      >
        {t.exportPdfBuilder}
      </a>
      <button
        type="button"
        className="app-nav-menu-item"
        title={t.exportEverythingHint}
        disabled={store === undefined}
        onClick={everything}
      >
        {t.exportEverything}
      </button>
      <button type="button" className="app-nav-menu-item" disabled={store === undefined} onClick={peopleCsv}>
        {t.exportPeopleCsv}
      </button>
      {pageItems.length > 0 && <p className="app-nav-menu-heading">{t.exportThisPage}</p>}
      {ungrouped.map(itemButton)}
      {[...groups].map(([group, items]) => {
        const expanded = openGroup === group;
        return (
          <div key={group} className="app-nav-submenu">
            <button
              type="button"
              className="app-nav-menu-item app-nav-submenu-toggle"
              aria-label={group}
              aria-expanded={expanded}
              onClick={() => {
                setOpenGroup(expanded ? undefined : group);
              }}
            >
              {group}
            </button>
            {expanded && <div className="app-nav-submenu-items">{items.map(itemButton)}</div>}
          </div>
        );
      })}
    </NavGroup>
  );
}

/** One dropdown button and its popup of links. */
function NavGroup({
  groupKey,
  label,
  popupAriaLabel,
  active,
  dropdown,
  children,
}: {
  readonly groupKey: string;
  readonly label: string;
  readonly popupAriaLabel: string;
  readonly active: boolean;
  readonly dropdown: ExclusiveOpen<string>;
  readonly children: React.ReactNode;
}): React.JSX.Element {
  const isOpen = dropdown.open === groupKey;
  const popupId = `app-nav-menu-${groupKey}`;
  return (
    <div
      ref={dropdown.groupRef(groupKey)}
      className={`app-nav-group${active ? ' active' : ''}${isOpen ? ' open' : ''}`}
      onBlur={(event) => {
        dropdown.onGroupBlur(groupKey, event);
      }}
    >
      {/* A real button, opened and closed by `useExclusiveOpen` (#417). `aria-label` pins the
          accessible name to just the label: Chromium folds CSS-generated content such as the caret
          (`.app-nav-group-toggle::after`) into a name otherwise. */}
      <button
        type="button"
        ref={dropdown.buttonRef(groupKey)}
        className="app-nav-group-toggle"
        aria-label={label}
        aria-expanded={isOpen}
        aria-controls={isOpen ? popupId : undefined}
        onClick={() => {
          dropdown.toggle(groupKey);
        }}
      >
        {label}
      </button>
      {isOpen && (
        <nav id={popupId} className="app-nav-menu" aria-label={popupAriaLabel}>
          {children}
        </nav>
      )}
    </div>
  );
}

/** The person chip and that person's tabs. Needs the store, so it is only rendered once one is open. */
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
  const hasBirthMoment = person?.moment !== undefined;
  const active = activeTabKey(route);
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

  const typesT = useMessages(chartTypesMessages);
  const chartEnabled = isTabEnabled('chart', hasBirthMoment);
  const openType = route.kind === 'chart' ? (route.chartType ?? 'natal') : undefined;
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
      {PERSON_TABS.filter((tab) => LEADING_KEYS.has(tab.key)).map((tab) => renderTab(tab, 'app-nav-item'))}
      {/* One page for every chart cast for this person (natal, draconic, harmonic, returns); its sections
          (wheel, shape, tables) are tabs on the page. */}
      {chartEnabled ? (
        <NavGroup
          groupKey={CHARTS_GROUP}
          label={typesT.chartsLabel}
          popupAriaLabel={t.subtabsAriaLabel(typesT.chartsLabel)}
          active={route.kind === 'chart'}
          dropdown={dropdown}
        >
          {CHART_TYPES.map((type) => (
            <a
              key={type}
              href={chartHref(personId, undefined, type)}
              className={type === openType ? 'app-nav-menu-item active' : 'app-nav-menu-item'}
              aria-current={type === openType ? 'page' : undefined}
              onClick={onNavigate}
            >
              {typesT.typeLabels[type]}
            </a>
          ))}
        </NavGroup>
      ) : (
        <button
          type="button"
          disabled
          className="app-nav-item disabled"
          aria-label={t.disabledTabSuffix(typesT.chartsLabel)}
          title={t.completeBirthRecordHint}
        >
          {typesT.chartsLabel}
        </button>
      )}
      {PERSON_TABS.filter((tab) => UNGROUPED_KEYS.has(tab.key) && !LEADING_KEYS.has(tab.key)).map((tab) =>
        renderTab(tab, 'app-nav-item'),
      )}
      {PERSON_TAB_FAMILIES.map((family) => {
        const familyLabel = t.familyLabels[family.key];
        return (
          <NavGroup
            key={family.key}
            groupKey={family.key}
            label={familyLabel}
            popupAriaLabel={t.subtabsAriaLabel(familyLabel)}
            active={active !== null && family.members.includes(active)}
            dropdown={dropdown}
          >
            {family.members.map((memberKey) => {
              const tab = tabsByKey.get(memberKey);
              if (tab === undefined) throw new Error(`unreachable: "${memberKey}" is always one of PERSON_TABS`);
              return renderTab(tab, 'app-nav-menu-item');
            })}
          </NavGroup>
        );
      })}
    </>
  );
}

export function AppNav({ route }: { route: Route }): React.JSX.Element {
  const t = useMessages(appNavMessages);
  const store = useOptionalStore();
  const routePersonId = 'personId' in route ? route.personId : undefined;
  const activeTool = activeToolKey(route);
  const lastPersonId = useLastPersonId();
  // A tool page (#453) carries no person in its own route at all (`route.ts`) — falling back to
  // the last person seen there keeps their nav tabs showing instead of losing them, and lets a
  // link back to one of those tabs return to the same person rather than requiring they be
  // picked again. Scoped to tool pages specifically, not every person-less route (the People
  // list itself, say, should not show a stale person's tabs). Checked against the live store so
  // a since-deleted person doesn't linger here.
  const personId =
    routePersonId ??
    (activeTool !== null && lastPersonId !== undefined && store?.state.people.has(lastPersonId)
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
  const [exportStatus, setExportStatus] = useState<ExportStatus | undefined>(undefined);

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

  /** Runs an export, closing the menus and announcing what is happening, since the choice is gone from view. */
  const runExport = (what: string, action: () => void | Promise<void>): void => {
    closeAll();
    setExportStatus({ kind: 'busy', text: t.exportPreparing(what) });
    void Promise.resolve()
      .then(action)
      .then(() => {
        setExportStatus({ kind: 'done', text: t.exportDone(what) });
        window.setTimeout(() => {
          setExportStatus((current) => (current?.kind === 'done' ? undefined : current));
        }, 3000);
      })
      .catch((error: unknown) => {
        setExportStatus({
          kind: 'error',
          text: t.exportFailed(error instanceof Error ? error.message : String(error)),
        });
      });
  };

  return (
    <div className="app-nav-wrap">
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
          <PersonMenu personId={personId} route={route} dropdown={dropdown} onNavigate={closeAll} />
        )}
        <NavGroup
          groupKey={TOOLS_GROUP}
          label={t.toolsLabel}
          popupAriaLabel={t.subtabsAriaLabel(t.toolsLabel)}
          active={activeTool !== null}
          dropdown={dropdown}
        >
          {TOOLS.map((tool) => (
            <a
              key={tool.key}
              href={tool.href}
              className={tool.key === activeTool ? 'app-nav-menu-item active' : 'app-nav-menu-item'}
              aria-current={tool.key === activeTool ? 'page' : undefined}
              onClick={closeAll}
            >
              {t.toolLabels[tool.key]}
            </a>
          ))}
        </NavGroup>
        <ExportMenu dropdown={dropdown} run={runExport} />
      </nav>
      {exportStatus !== undefined && (
        <p
          className={`app-export-status ${exportStatus.kind}`}
          role={exportStatus.kind === 'error' ? 'alert' : 'status'}
        >
          {exportStatus.text}
          {exportStatus.kind === 'error' && (
            <button
              type="button"
              className="quiet"
              onClick={() => {
                setExportStatus(undefined);
              }}
            >
              ×
            </button>
          )}
        </p>
      )}
    </div>
  );
}
