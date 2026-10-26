/**
 * The canonical per-person Overview screen (#506/#509): a task launchpad, not a generic
 * dashboard (`docs/ui/UI-UX_GUIDELINES.md` §2). Shows record readiness, the device's current
 * calculation basis, and a small set of real next actions — not decorative metrics or a chart
 * without a decision purpose.
 *
 * The calculation-basis line is deliberately minimal (zodiac kind + rulership model only) rather
 * than resolving a house-system/ayanamsa display name, which needs an async `EphemerisProvider`
 * call (`ExtendedSettingsPanel.tsx`'s own `useNameLookup`). Zodiac kind reads the device's saved
 * default calculation profile (#510) via `default-calculation-profile.ts`, falling back to
 * `DEFAULT_EXTENDED_SETTINGS` when none is saved.
 */
/**
 * @module ui/Overview
 * @purpose Canonical per-person Overview screen (#506/#509): record readiness, calculation basis, and real next actions.
 * @conventions Uses the feature registry (feature-registry.ts) for every next-action href rather than hand-written hashes; readiness line reuses people-list.ts's summary() so this screen and the People list can never disagree about what "complete" means; uses Overview.messages.ts for en/nl text via useMessages().
 * @exports Overview
 */
import { hrefFor } from './feature-registry.js';
import { useLocale } from './locale.js';
import { useMessages } from './messages.js';
import { overviewMessages } from './Overview.messages.js';
import { PersonNotFound } from './PersonNotFound.js';
import { rulershipSettingMessages } from './RulershipSetting.messages.js';
import { useStoreState } from './store-context.js';
import { summary } from './people-list.js';
import { usePersonCalculationSettings } from './person-calculation-settings.js';
import { BackLink } from './BackLink.js';
import { UnreadableSettingsNotice } from './UnreadableSettingsNotice.js';

export function Overview({ personId }: { readonly personId: string }): React.JSX.Element {
  const state = useStoreState();
  const person = state.people.get(personId);
  const t = useMessages(overviewMessages);
  const rulershipT = useMessages(rulershipSettingMessages);
  const [locale] = useLocale();
  const {
    settings: personSettings,
    unreadable: settingsUnreadable,
    rulership,
  } = usePersonCalculationSettings(personId);

  if (person === undefined) {
    return <PersonNotFound />;
  }

  if (settingsUnreadable) {
    return <UnreadableSettingsNotice personId={personId} name={person.displayName || ''} />;
  }

  const hasBirthMoment = person.moment !== undefined;
  const zodiac = personSettings.zodiac;
  const zodiacLabel = zodiac.kind === 'sidereal' ? t.sidereal : t.tropical;

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
      <BackLink fallback="#/people" />
      <h1>{t.heading(person.displayName || t.personFallback)}</h1>
      <p>{summary(person, locale)}</p>

      <h2>{t.basisHeading}</h2>
      <p>{t.basisLine(zodiacLabel, rulershipT.options[rulership])}</p>

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
