/**
 * Plain prose with its glossary terms explained in place (#902).
 */
/**
 * @module GlossaryText
 * @purpose `GlossaryText` renders one paragraph of plain text and turns the first mention of each glossary term into an inline `GlossaryTerm` tooltip.
 * @conventions Opt-in: a view wraps only the plain prose it renders (report paragraphs, interpretation text), one instance per paragraph, and never a heading, button, link or input. Text is split into React nodes, never HTML. Matching lives in glossary-match.ts and the popup is the shared Tooltip through `GlossaryTerm`.
 * @exports GlossaryText
 */
import { useMemo } from 'react';
import { GlossaryTerm } from './GlossaryTerm.js';
import { splitGlossaryText } from './glossary-match.js';
import { useLocale } from './locale.js';

export function GlossaryText({ text }: { readonly text: string }): React.JSX.Element {
  const [locale] = useLocale();
  const segments = useMemo(() => splitGlossaryText(text, locale), [text, locale]);
  return (
    <>
      {segments.map((segment, index) =>
        segment.kind === 'term' ? (
          <GlossaryTerm key={index} id={segment.id}>
            {segment.text}
          </GlossaryTerm>
        ) : (
          segment.text
        ),
      )}
    </>
  );
}
