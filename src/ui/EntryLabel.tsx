/**
 * A corpus entry named by what it means, with its key beside it as small secondary text (#428):
 * "Sun in the 3rd house" and `planet-in-house:sun:3` under it, so an admin can read the entry and
 * still copy or match its key. A key the schema cannot read is shown once, as it is.
 */
import type { Locale } from '../interpretation/schema.js';
import { labelForKey } from './placement-label.js';

export function EntryLabel({
  entryKey,
  locale,
}: {
  readonly entryKey: string;
  readonly locale: Locale;
}): React.JSX.Element {
  const label = labelForKey(entryKey, locale);
  if (label === entryKey) return <code className="entry-key">{entryKey}</code>;
  return (
    <>
      <span className="entry-meaning">{label}</span>
      <br />
      <code className="entry-key">{entryKey}</code>
    </>
  );
}
