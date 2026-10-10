/**
 * The searchable person switcher (#506/#509) replacing the static person-name chip in
 * `AppNav.tsx`'s header: `docs/UI-UX_GUIDELINES.md` §2 is explicit that "the current person's
 * name is a searchable selector, not a static label. Switching people should preserve the
 * current feature when its prerequisites are met."
 *
 * Shares the exact `ExclusiveOpen` instance `AppNav.tsx`'s other dropdowns already use (one
 * open at a time, closed by choosing something, outside click, Escape, or a route change) —
 * registered as one more group under that same hook rather than building a second,
 * independently-behaving open/close system in the same header.
 */
/**
 * @module ui/PersonSwitcher
 * @purpose Searchable person-switcher dropdown for the header (#506/#509): preserves the current feature on switch when the target person meets its prerequisites, otherwise routes to Overview (which explains what's missing).
 * @conventions Reuses AppNav.tsx's shared ExclusiveOpen instance and NavGroup-equivalent markup/CSS classes rather than a second dropdown mechanism; uses feature-registry.ts to decide the destination href, never a hand-written hash.
 * @exports PersonSwitcher
 */
import { useId, useState } from 'react';
import { featureFor, hrefFor } from './feature-registry.js';
import { useMessages } from './messages.js';
import { ordered } from './people-list.js';
import { personSwitcherMessages } from './PersonSwitcher.messages.js';
import type { Route } from './route.js';
import { useStoreState } from './store-context.js';
import type { ExclusiveOpen } from './use-exclusive-open.js';

const GROUP_KEY = 'person-switcher';

/** Where switching to `targetPersonId` should land, preserving the current route's feature when its prerequisites are met and falling back to Overview (which explains what's missing) otherwise. */
function destinationHref(route: Route, targetPersonId: string, hasBirthMoment: boolean): string {
  const feature = featureFor(route);
  if (feature?.scope === 'person' && (!feature.requiresBirthMoment || hasBirthMoment)) {
    return feature.buildHref({ personId: targetPersonId });
  }
  return hrefFor('overview', { personId: targetPersonId });
}

export function PersonSwitcher({
  personId,
  name,
  route,
  dropdown,
  onNavigate,
}: {
  readonly personId: string;
  readonly name: string;
  readonly route: Route;
  readonly dropdown: ExclusiveOpen<string>;
  readonly onNavigate: () => void;
}): React.JSX.Element {
  const t = useMessages(personSwitcherMessages);
  const state = useStoreState();
  const [filter, setFilter] = useState('');
  const popupId = useId();
  const isOpen = dropdown.open === GROUP_KEY;

  const people = ordered(state.people).filter((candidate) =>
    candidate.displayName.toLowerCase().includes(filter.trim().toLowerCase()),
  );

  return (
    <div
      ref={dropdown.groupRef(GROUP_KEY)}
      className={`app-nav-group person-switcher${isOpen ? ' open' : ''}`}
      onBlur={(event) => {
        dropdown.onGroupBlur(GROUP_KEY, event);
      }}
    >
      <button
        type="button"
        ref={dropdown.buttonRef(GROUP_KEY)}
        className="app-nav-person person-switcher-trigger"
        aria-haspopup="true"
        aria-expanded={isOpen}
        aria-controls={isOpen ? popupId : undefined}
        title={t.triggerLabel(name)}
        onClick={() => {
          setFilter('');
          dropdown.toggle(GROUP_KEY);
        }}
      >
        {name}
      </button>
      {isOpen && (
        <div id={popupId} className="person-switcher-popup" role="dialog" aria-label={t.popupLabel}>
          <label className="person-switcher-filter-label">
            {t.filterLabel}
            <input
              type="text"
              value={filter}
              autoFocus
              placeholder={t.filterPlaceholder}
              onChange={(event) => {
                setFilter(event.target.value);
              }}
            />
          </label>
          <ul className="person-switcher-list">
            {people.length === 0 && <li className="hint">{t.noMatches}</li>}
            {people.map((candidate) => (
              <li key={candidate.id}>
                <a
                  href={destinationHref(route, candidate.id, candidate.moment !== undefined)}
                  aria-current={candidate.id === personId ? 'true' : undefined}
                  className={candidate.id === personId ? 'person-switcher-item active' : 'person-switcher-item'}
                  onClick={() => {
                    dropdown.close();
                    onNavigate();
                  }}
                >
                  {candidate.displayName || t.unnamed}
                </a>
              </li>
            ))}
          </ul>
          <a href="#/people" className="person-switcher-all">
            {t.allPeople}
          </a>
        </div>
      )}
    </div>
  );
}
