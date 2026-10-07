/**
 * Reads the current UI locale's half of a `{ en, nl }` message catalogue (#158).
 *
 * Catalogues are plain objects, not string keys into a runtime table: `chartViewMessages.nl`
 * is typed as `typeof chartViewMessages.en`, so a key missing from one locale is a compile
 * error, not a silent English fallback discovered at runtime.
 */
/**
 * @module ui/messages
 * @purpose Generic hook that reads the current UI locale's half of any `{ en, nl }` message catalogue (#158); the shared consumption-side counterpart to every co-located *.messages.ts file.
 * @conventions Catalogues are typed objects (not stringly-keyed lookups), so a key present in one locale but missing in the other is a compile error, enforcing en/nl parity.
 * @exports useMessages
 */
import { useLocale } from './locale.js';
import type { Locale } from '../interpretation/schema.js';

export function useMessages<T>(catalog: Readonly<Record<Locale, T>>): T {
  const [locale] = useLocale();
  return catalog[locale];
}
