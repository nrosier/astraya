/**
 * The "no person with that id" screen shown when a route's personId doesn't resolve — the
 * same heading, paragraph and layout duplicated verbatim across every per-person view (#158).
 */
/**
 * @module PersonNotFound
 * @purpose Shared "no person with that id" fallback screen for per-person routes that fail to resolve.
 * @conventions Uses shared.messages.ts for en/nl text via useMessages().
 * @exports PersonNotFound
 */
import { useMessages } from './messages.js';
import { sharedMessages } from './shared.messages.js';
import { BackLink } from './BackLink.js';

export function PersonNotFound(): React.JSX.Element {
  const shared = useMessages(sharedMessages);
  return (
    <main className="shell">
      <BackLink fallback="#/people" label={shared.people} />
      <h1>{shared.notFoundHeading}</h1>
      <p>
        {shared.notFoundBody} <a href="#/people">{shared.peopleList}</a>.
      </p>
    </main>
  );
}
