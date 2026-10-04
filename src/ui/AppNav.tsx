/**
 * The header's navigation (#234, #417, #421): one labelled `<nav>` that replaces the bordered tab
 * strip that used to sit above each person's screens.
 *
 * What it holds, left to right:
 * - on a person's screen, **whose chart** this is (the person chip) and that person's tabs: Birth
 *   record, Natal chart, Interpretation, Astrocartography and the four grouped dropdowns
 *   (Transits & Forecast, Progressions & Directions, Relationship Charts, Chart Variants);
 * - **Tools**, on every screen: the calculators that are not about one person's chart
 *   (`tools-nav.ts`);
 * - **Admin**, for an admin only. Purely navigation: each admin route is guarded on the server.
 *
 * Marked up as plain navigation links, not `role="tablist"`: these are links to different routes,
 * not same-page panels, so the WAI-ARIA tab pattern (roving tabindex, arrow keys) does not fit.
 *
 * Dropdowns share one `useExclusiveOpen` (#417): one open at a time, closed by choosing something,
 * by a click elsewhere, by Escape and by changing page. Below 1024px the whole nav folds behind a
 * Menu button and opens as a panel under the header; choosing anything, Escape or changing page
 * closes it. The dropdowns then open in place inside that panel rather than floating over it.
 */
import { useEffect, useRef, useState } from 'react';
import { ADMIN_HOME_HREF, activeAdminTabKey } from './admin-nav.js';
import { appNavMessages } from './AppNav.messages.js';
import { useMessages } from './messages.js';
import { activeTabKey, isTabEnabled, PERSON_TAB_FAMILIES, PERSON_TABS } from './person-nav.js';
import type { PersonTab } from './person-nav.js';
import type { Route } from './route.js';
import { useSessionUserOrUndefined } from './session-context.js';
import { useOptionalStore, useStoreState } from './store-context.js';
import { activeToolKey, TOOLS } from './tools-nav.js';
import { useExclusiveOpen, type ExclusiveOpen } from './use-exclusive-open.js';

const UNGROUPED_KEYS = new Set(['birth-record', 'chart', 'report', 'astrocartography']);
const TOOLS_GROUP = 'tools';

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

  const name = person?.displayName ?? '';
  return (
    <>
      {name !== '' && (
        <span className="app-nav-person" title={t.personChipLabel(name)}>
          {name}
        </span>
      )}
      {PERSON_TABS.filter((tab) => UNGROUPED_KEYS.has(tab.key)).map((tab) => renderTab(tab, 'app-nav-item'))}
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
  const sessionUser = useSessionUserOrUndefined();
  const store = useOptionalStore();
  const personId = 'personId' in route ? route.personId : undefined;
  // Closed on every page change: the route's kind and person identify the page.
  const pageKey = `${route.kind}:${personId ?? ''}`;
  const dropdown = useExclusiveOpen<string>(pageKey);
  const [menuOpen, setMenuOpen] = useState(false);
  const toggleRef = useRef<HTMLButtonElement>(null);
  const activeTool = activeToolKey(route);

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
        {/* Admin area (#414): only for an admin. Purely navigation — each admin route is guarded by
            `requireAdmin` on the server whatever this shows. */}
        {sessionUser?.isAdmin === true && (
          <a
            href={ADMIN_HOME_HREF}
            className={
              activeAdminTabKey(route) === null ? 'app-nav-item app-nav-admin' : 'app-nav-item app-nav-admin active'
            }
            aria-current={activeAdminTabKey(route) === null ? undefined : 'page'}
            onClick={closeAll}
          >
            {t.adminTabLabel}
          </a>
        )}
      </nav>
    </div>
  );
}
