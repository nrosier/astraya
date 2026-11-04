/**
 * @module Home
 * @purpose The home screen at `#/` (#1058): the last-viewed person's timing timeline, or a person picker with a first-use empty state when none is stored or the stored person no longer exists.
 * @conventions Renders in place, never redirects (no `#/` to `#/people` bounce, so Back and reload behave); the stored id is checked against the live store so a deleted person falls back to the picker; choosing a person only writes the last-person preference. Text from `Home.messages.ts`.
 * @exports Home
 */
import { useMessages } from './messages.js';
import { homeMessages } from './Home.messages.js';
import { useLastPersonId, writeLastPersonId } from './last-person.js';
import { PageHeader } from './PageHeader.js';
import { ordered } from './people-list.js';
import { EmptyState } from './primitives/EmptyState.js';
import { Select } from './primitives/Select.js';
import { useStoreState } from './store-context.js';
import { TimingTimelineView } from './TimingTimelineView.js';

export function Home(): React.JSX.Element {
  const t = useMessages(homeMessages);
  const state = useStoreState();
  const lastPersonId = useLastPersonId();
  if (lastPersonId !== undefined && state.people.has(lastPersonId)) {
    return <TimingTimelineView key={lastPersonId} personId={lastPersonId} />;
  }
  const people = ordered(state.people);
  return (
    <main className="shell">
      <PageHeader title={t.heading} />
      {people.length === 0 ? (
        <EmptyState message={t.noPeople}>
          <p>
            <a href="#/people">{t.addPerson}</a>
          </p>
        </EmptyState>
      ) : (
        <>
          <EmptyState message={t.pickerEmpty} />
          <Select
            label={t.pickerLabel}
            value=""
            options={[
              { value: '', label: t.pickerPlaceholder, disabled: true },
              ...people.map((person) => ({ value: person.id, label: person.displayName || t.unnamed })),
            ]}
            onChange={writeLastPersonId}
          />
          <p>
            <a href="#/people">{t.peopleLink}</a>
          </p>
        </>
      )}
    </main>
  );
}
