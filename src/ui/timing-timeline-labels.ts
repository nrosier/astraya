/**
 * @module ui/timing-timeline-labels
 * @purpose Words a timing-timeline event's subject (`TimelineSubject`, #674) in the reader's language, for the Timing timeline and the consultation page.
 * @conventions Pure; names come from the shared astro-names catalogue, with the few keys it lacks (firdaria's nodes, the Descendant and IC of a primary direction) in TimingTimelineView.messages.ts. Technique names such as "solar return" stay English in Dutch, as on the Forecast screen.
 * @exports timelineSubjectLabel
 */
import type { TimelineSubject } from '../domain/timing-timeline.js';
import type { Locale } from '../interpretation/schema.js';
import { aspectDisplayName, bodyDisplayName, signDisplayName } from './astro-names.messages.js';
import { ordinal } from './placement-label.js';
import { timingTimelineViewMessages } from './TimingTimelineView.messages.js';

export function timelineSubjectLabel(subject: TimelineSubject, locale: Locale): string {
  const t = timingTimelineViewMessages[locale];
  const extraNames: Readonly<Record<string, string>> = t.extraNames;
  const name = (key: string): string => extraNames[key] ?? bodyDisplayName(key, locale);
  switch (subject.kind) {
    case 'releasing': {
      const label = (subject.level === 1 ? t.releasing : t.releasingLevel2)(
        t.lots[subject.lot],
        signDisplayName(subject.sign, locale),
        name(subject.ruler),
      );
      return subject.loosingOfBond ? `${label} (${t.loosingOfBond})` : label;
    }
    case 'firdaria':
      return name(subject.ruler);
    case 'profection':
      return t.profection(signDisplayName(subject.sign, locale), ordinal(subject.house, locale));
    case 'aspect':
      return t.aspect(name(subject.from), aspectDisplayName(subject.aspect, locale).toLowerCase(), name(subject.to));
    case 'station':
      return (subject.direction === 'retrograde' ? t.stationRetrograde : t.stationDirect)(name(subject.body));
    case 'return':
      return t.returns[subject.which];
  }
}
