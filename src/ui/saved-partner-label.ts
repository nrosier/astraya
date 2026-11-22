/**
 * @module ui/saved-partner-label
 * @purpose Builds the " · with {name}" suffix of a saved two-person interpretation's history entry from the partner's id and the local people list (#1852).
 * @conventions Pure; the id is the only thing stored on the server, the name is looked up here so a rename is followed and the name never leaves the device. A partner missing from the list, or with an empty name, gets the fallback phrase, never the id.
 * @exports partnerSuffix
 */
import type { Locale } from '../interpretation/schema.js';
import { savedPartnerLabelMessages } from './saved-partner-label.messages.js';

/** The text to append to a history entry's description (or kind): `''` when the entry has no partner. */
export function partnerSuffix(
  partnerPersonId: string | null | undefined,
  people: ReadonlyMap<string, { readonly displayName: string }> | undefined,
  locale: Locale,
): string {
  if (partnerPersonId === null || partnerPersonId === undefined) return '';
  const t = savedPartnerLabelMessages[locale];
  const name = people?.get(partnerPersonId)?.displayName.trim() ?? '';
  return name === '' ? t.gone : t.with(name);
}
