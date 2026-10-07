/**
 * In-app changelog.
 *
 * The version in the footer is a link here, so a user can see what changed in the
 * build they are actually running without leaving for GitHub — and without a
 * network request, since the changelog is bundled at build time.
 */
/**
 * @module Changelog
 * @purpose Renders the in-app changelog screen by rendering the project's CHANGELOG.md.
 * @conventions Bundled at build time (`?raw` import) rather than fetched, so viewing it needs no network request. Chrome text (heading, running-version line, commit-history link) comes from co-located `Changelog.messages.ts` via `useMessages()`; the release-note body itself stays in `CHANGELOG.md`'s own language.
 * @exports Changelog
 */
import changelogSource from '../../CHANGELOG.md?raw';
import { changelogMessages } from './Changelog.messages.js';
import { renderMarkdown } from './markdown.js';
import { useMessages } from './messages.js';
import { sharedMessages } from './shared.messages.js';
import { APP_VERSION, SOURCE_URL, sourceFileUrl } from '../version.js';

export function Changelog(): React.JSX.Element {
  const t = useMessages(changelogMessages);
  const shared = useMessages(sharedMessages);
  return (
    <main className="shell">
      <p className="back">
        <a href="#/">&larr; {shared.back}</a>
      </p>
      <h1>{t.heading}</h1>
      <p className="tagline">
        {t.runningBefore}
        <strong>{APP_VERSION}</strong>
        {t.runningAfter}
      </p>
      <div className="prose">{renderMarkdown(changelogSource, { resolveRelative: sourceFileUrl })}</div>
      <footer>
        <a href={`${SOURCE_URL}/commits/main`}>{t.commitHistoryLink}</a>
      </footer>
    </main>
  );
}
