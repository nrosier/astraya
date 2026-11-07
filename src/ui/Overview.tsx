/**
 * The canonical per-person Overview screen (#506/#509, #1173): a task launchpad, not a generic dashboard
 * (`docs/ui/UI-UX_GUIDELINES.md` §2). It shows what is missing or uncertain in the birth data with a fix for each,
 * where the reader left off, one line about what is current, and a small set of real next actions. The full computed
 * analysis stays on Consultation; nothing here repeats it.
 */
/**
 * @module ui/Overview
 * @purpose Canonical per-person Overview screen (#506/#509, #1173): the birth-data health checklist, "continue where you left off", one "now" line linking to Consultation, and real next actions.
 * @conventions Uses the feature registry (feature-registry.ts) for every href rather than hand-written hashes; the health checklist is `overview-health.ts` and its readiness line reuses people-list.ts's summary(), so this screen and the People list cannot disagree about what is wrong; the "now" line is the profected year from `computeProfections`, the same calculation the Profections and Consultation screens use, and is left out where it cannot be calculated (no engine, no birth time); a section with nothing to show is not rendered; uses Overview.messages.ts for en/nl text via useMessages().
 * @exports Overview
 */
import { useEffect, useState } from 'react';
import { bodyById } from '../astrology/bodies.js';
import { degreeParts } from '../domain/chart-tables.js';
import { computeProfections } from '../domain/profections.js';
import { bodyDisplayName, signDisplayName } from './astro-names.messages.js';
import { useEphemerisProvider } from './EphemerisProviderContext.js';
import { hrefFor } from './feature-registry.js';
import { readLastChart } from './last-chart.js';
import { useLocale } from './locale.js';
import { useMessages } from './messages.js';
import { overviewMessages } from './Overview.messages.js';
import { birthDataHealth, birthRecordFixHref, type HealthItem } from './overview-health.js';
import { PersonNotFound } from './PersonNotFound.js';
import { orbSourceName, useCalculationBasisLine } from './calculation-basis.js';
import { useOrbContextSource, useOrbLibrary } from './orb-library-store.js';
import { ordinal } from './placement-label.js';
import { useStoreState } from './store-context.js';
import { summary } from './people-list.js';
import { usePersonCalculationSettings } from './person-calculation-settings.js';
import { PageHeader } from './PageHeader.js';
import { UnreadableSettingsNotice } from './UnreadableSettingsNotice.js';
import { useStableMoment } from './use-stable-moment.js';

/** The current profected year: its sign, house and the planet that rules it. */
interface NowLine {
  readonly sign: string;
  readonly house: number;
  readonly lord: string;
}

export function Overview({ personId }: { readonly personId: string }): React.JSX.Element {
  const state = useStoreState();
  const person = state.people.get(personId);
  const personMoment = useStableMoment(person?.moment);
  const t = useMessages(overviewMessages);
  const [locale] = useLocale();
  const { provider } = useEphemerisProvider();
  const {
    settings: personSettings,
    unreadable: settingsUnreadable,
    rulership,
  } = usePersonCalculationSettings(personId);
  const orbLibrary = useOrbLibrary();
  const orbSources = useOrbContextSource();
  // The basis the person's natal chart is cast with, stated under the title as on every calculated page (#1059).
  const basisLine = useCalculationBasisLine(personSettings, rulership, orbSourceName(orbLibrary, orbSources, 'natal'));
  const knownTime = person !== undefined && person.timeAccuracy !== 'unknown';
  const [now, setNow] = useState<NowLine | undefined>(undefined);

  useEffect(() => {
    setNow(undefined);
    if (personMoment === undefined || provider === undefined || !knownTime) return undefined;
    const effect = { cancelled: false };
    void (async () => {
      try {
        const targetJd = await provider.julianDayFromUtc(
          new Date().getUTCFullYear(),
          new Date().getUTCMonth() + 1,
          new Date().getUTCDate(),
          12,
          0,
          0,
        );
        const data = await computeProfections(personMoment, targetJd, provider, { rulership });
        const lord = bodyById(data.year.ruler)?.key;
        if (!effect.cancelled && lord !== undefined) {
          setNow({ sign: degreeParts(data.year.longitude).sign, house: data.year.house, lord });
        }
      } catch {
        // No "now" line is better than a wrong one; Consultation reports the calculation's own failure.
      }
    })();
    return () => {
      effect.cancelled = true;
    };
  }, [personMoment, provider, knownTime, rulership]);

  if (person === undefined) {
    return <PersonNotFound />;
  }

  if (settingsUnreadable) {
    return <UnreadableSettingsNotice name={person.displayName || ''} />;
  }

  const hasBirthMoment = person.moment !== undefined;
  const health = birthDataHealth(person);
  const lastChart = readLastChart(personId);
  const consultationNotes = state.consultationNotes.get(personId)?.length ?? 0;
  const hasBirthNotes = person.notes.trim() !== '';
  const resume: readonly { readonly key: string; readonly label: string; readonly href: string }[] = [
    ...(lastChart === undefined ? [] : [{ key: 'chart', label: t.resumeChart, href: lastChart }]),
    ...(hasBirthNotes
      ? [{ key: 'birth-notes', label: t.resumeBirthNotes, href: hrefFor('birth-record', { personId }) }]
      : []),
    ...(consultationNotes === 0
      ? []
      : [
          {
            key: 'consultation-notes',
            label: t.resumeConsultationNotes(consultationNotes),
            href: hrefFor('consultation', { personId }),
          },
        ]),
  ];

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

      {now !== undefined && (
        <p className="overview-now">
          <a className="standalone-link" href={hrefFor('consultation', { personId })}>
            {t.nowLine(
              signDisplayName(now.sign, locale),
              ordinal(now.house, locale),
              bodyDisplayName(now.lord, locale),
            )}
          </a>
        </p>
      )}

      <section className="overview-section" aria-labelledby="overview-health-heading">
        <h2 id="overview-health-heading">{t.healthHeading}</h2>
        {health.length === 0 ? (
          <p className="hint">{t.healthClear}</p>
        ) : (
          <ul className="overview-health">
            {health.map((item) => (
              <li key={item.what}>
                <span>{healthText(t, item)}</span>{' '}
                <a className="standalone-link" href={birthRecordFixHref(personId, item.focus)}>
                  {t.healthFix[item.focus]}
                </a>
              </li>
            ))}
          </ul>
        )}
      </section>

      {resume.length > 0 && (
        <section className="overview-section" aria-labelledby="overview-resume-heading">
          <h2 id="overview-resume-heading">{t.resumeHeading}</h2>
          <ul className="overview-actions">
            {resume.map((item) => (
              <li key={item.key}>
                <a href={item.href}>{item.label}</a>
              </li>
            ))}
          </ul>
        </section>
      )}

      <section className="overview-section" aria-labelledby="overview-next-heading">
        <h2 id="overview-next-heading">{t.nextActionsHeading}</h2>
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
      </section>
    </main>
  );
}

function healthText(t: (typeof overviewMessages)['en'], item: HealthItem): string {
  return t.health[item.what];
}
