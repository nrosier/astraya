/**
 * @module interpretation/locales
 * @purpose The corpus locales (en, nl) and the `Locale` type, kept in a module with no imports so light UI and domain code can read them without loading the corpus schema (#1807).
 * @conventions No imports. `interpretation/schema.ts` re-exports both names, so existing importers keep working. Add a locale here, then update the corpus and i18n parity checks.
 * @exports CORPUS_LOCALES, Locale
 */

export const CORPUS_LOCALES = ['en', 'nl'] as const;
export type Locale = (typeof CORPUS_LOCALES)[number];
