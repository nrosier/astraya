/**
 * Inline glossary help (#456, #513): a term in running text, or a row of the terms a screen uses, each opening the
 * same definition on hover, click and keyboard focus through the shared Tooltip.
 */
/**
 * @module GlossaryTerm
 * @purpose `GlossaryTerm` explains one astrology term in place; `GlossaryTerms` lists the terms a screen relies on, so a newcomer can look each up without leaving the page.
 * @conventions Names and definitions come only from astro-glossary.messages.ts; the popup is the shared Tooltip primitive (a real button, never a native `title`).
 * @exports GlossaryTerm, GlossaryTerms
 */
import { astroGlossaryMessages, type GlossaryTermId } from './astro-glossary.messages.js';
import { glossaryTermMessages } from './GlossaryTerm.messages.js';
import { useMessages } from './messages.js';
import { Tooltip } from './primitives/Tooltip.js';

/** One term; its visible text defaults to the glossary name, or is the surrounding wording when given. */
export function GlossaryTerm({
  id,
  children,
}: {
  readonly id: GlossaryTermId;
  readonly children?: React.ReactNode;
}): React.JSX.Element {
  const glossary = useMessages(astroGlossaryMessages);
  const entry = glossary[id];
  return (
    <Tooltip text={entry.definition} className="glossary-term">
      {children ?? entry.name}
    </Tooltip>
  );
}

/** "Terms on this page": one GlossaryTerm per id, as a short quiet list under a screen's heading. */
export function GlossaryTerms({ terms }: { readonly terms: readonly GlossaryTermId[] }): React.JSX.Element {
  const t = useMessages(glossaryTermMessages);
  return (
    <ul className="glossary-terms" aria-label={t.listLabel}>
      {terms.map((id) => (
        <li key={id}>
          <GlossaryTerm id={id} />
        </li>
      ))}
    </ul>
  );
}
