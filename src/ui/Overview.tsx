/**
 * The canonical per-person Overview screen (#506/#509): a task launchpad, not a generic
 * dashboard (`docs/ui/UI-UX_GUIDELINES.md` §2). Shows record readiness, the person's
 * calculation basis (in the page header, with its Edit link, #1059), and a small set of real
 * next actions — not decorative metrics or a chart without a decision purpose.
 */
/**
 * @module ui/Overview
 * @purpose Canonical per-person Overview screen (#506/#509): record readiness, the calculation basis line in the page header, and real next actions.
 * @conventions Uses the feature registry (feature-registry.ts) for every next-action href rather than hand-written hashes; readiness line reuses people-list.ts's summary() so this screen and the People list can never disagree about what "complete" means; uses Overview.messages.ts for en/nl text via useMessages().
 * @exports Overview
 */
import { hrefFor } from './feature-registry.js';
import { useLocale } from './locale.js';
import { useMessages } from './messages.js';
import { overviewMessages } from './Overview.messages.js';
import { PersonNotFound } from './PersonNotFound.js';
import { orbSourceName, useCalculationBasisLine } from './calculation-basis.js';
import { useOrbContextSource, useOrbLibrary } from './orb-library-store.js';
import { useStoreState } from './store-context.js';
import { summary } from './people-list.js';
import { usePersonCalculationSettings } from './person-calculation-settings.js';
import { PageHeader } from './PageHeader.js';
import { UnreadableSettingsNotice } from './UnreadableSettingsNotice.js';

export function Overview({ personId }: { readonly personId: string }): React.JSX.Element {
  const state = useStoreState();
  const person = state.people.get(personId);
  const t = useMessages(overviewMessages);
  const [locale] = useLocale();
  const {
    settings: personSettings,
    unreadable: settingsUnreadable,
    rulership,
  } = usePersonCalculationSettings(personId);
  const orbLibrary = useOrbLibrary();
  const orbSources = useOrbContextSource();
  // The basis the person's natal chart is cast with, stated under the title as on every calculated page (#1059).
  const basisLine = useCalculationBasisLine(personSettings, rulership, orbSourceName(orbLibrary, orbSources, 'natal'));

  if (person === undefined) {
    return <PersonNotFound />;
  }

  if (settingsUnreadable) {
    return <UnreadableSettingsNotice name={person.displayName || ''} />;
  }

  const hasBirthMoment = person.moment !== undefined;

  // Every next action but editing the birth record itself needs a complete birth moment —
  // same gate person-nav.ts's isTabEnabled applies to every other tab (only "birth-record"
  // is exempt there too).
  const actions: readonly {
    readonly key: string;
    readonly label: string;
    readonly href: string;
    readonly alwaysEnabled: boolean;
  }[] = [
    { key: 'birth-record', label: t.editBirthRecord, href: hrefFor('birth-record', { personId }), alwaysEnabled: true },
    { key: 'chart', label: t.openChart, href: hrefFor('chart', { personId }), alwaysEnabled: false },
    { key: 'report', label: t.openInterpretation, href: hrefFor('report', { personId }), alwaysEnabled: false },
    { key: 'transit', label: t.viewTransits, href: hrefFor('transit', { personId }), alwaysEnabled: false },
  ];

  return (
    <main className="shell">
      <PageHeader title={t.heading(person.displayName || t.personFallback)} basis={basisLine} />
      <p>{summary(person, locale)}</p>

      <h2>{t.nextActionsHeading}</h2>
      {!hasBirthMoment && <p className="hint">{t.completeBirthRecordFirst}</p>}
      <ul className="overview-actions">
        {actions.map((action) => (
          <li key={action.key}>
            {action.alwaysEnabled || hasBirthMoment ? (
              <a href={action.href}>{action.label}</a>
            ) : (
              <span className="hint">{action.label}</span>
            )}
          </li>
        ))}
      </ul>
    </main>
  );
}
