/**
 * The grouped, ranked relationship summary above Synastry's existing aspects table (#422):
 * the strongest contacts by theme, the house overlays, a harmonious/challenging count, and
 * an opt-in Tier 2 panel for an AI-customised relationship reading — the two-chart analogue
 * of `FocusInterpretation.tsx`, which this component's structure (consent, generate, saved
 * history) follows.
 *
 * Free (no-LLM) content is always shown; the Tier 2 part needs its own per-request consent,
 * same as every other AI-customised panel in this app (ADR 0003) — spent the moment the
 * request is sent, never remembered.
 */
/**
 * @module RelationshipSummary
 * @purpose Grouped, ranked relationship-themes summary for a synastry pairing, with house overlays and an opt-in Tier 2 AI-customised relationship reading.
 * @conventions Follows FocusInterpretation.tsx's consent/generate/saved-history structure for the Tier 2 panel; uses RelationshipSummary.messages.ts for en/nl text via useMessages().
 * @exports RelationshipSummary
 */
import { useEffect, useId, useState } from 'react';
import { bodyById } from '../astrology/bodies.js';
import { housesAreDefined } from '../domain/chart-compute.js';
import { houseOverlays, type HouseOverlay } from '../domain/house-overlays.js';
import {
  aspectValence,
  groupedRelationshipContacts,
  relationshipAngleContacts,
  RELATIONSHIP_THEMES,
  type RelationshipContact,
} from '../domain/relationship-themes.js';
import type { SynastryData } from '../domain/synastry.js';
import type { Locale } from '../interpretation/schema.js';
import {
  generateTier2Interpretation,
  getSavedInterpretation,
  listSavedInterpretations,
  Tier2Error,
  toTier2RelationshipPayload,
  type SavedInterpretationSummary,
  type Tier2Section,
} from '../interpretation/tier2-client.js';
import { aspectDisplayName, bodyDisplayName } from './astro-names.messages.js';
import { useMessages } from './messages.js';
import { ordinal } from './placement-label.js';
import { relationshipSummaryMessages } from './RelationshipSummary.messages.js';
import { basisLabel } from './result-basis-label.js';
import { formatSavedTime } from './saved-time.js';
import { useSessionUserOrUndefined } from './session-context.js';

const bodyKeyOf = (id: number): string => bodyById(id)?.key ?? String(id);

function ContactLine({
  contact,
  nameA,
  nameB,
  locale,
}: {
  readonly contact: RelationshipContact;
  readonly nameA: string;
  readonly nameB: string;
  readonly locale: Locale;
}): React.JSX.Element {
  const t = useMessages(relationshipSummaryMessages);
  const bodyA = bodyDisplayName(bodyKeyOf(contact.aspect.bodyA), locale);
  const bodyB = bodyDisplayName(bodyKeyOf(contact.aspect.bodyB), locale);
  const aspect = aspectDisplayName(contact.aspect.aspect.key, locale);
  return (
    <li className={`relationship-contact relationship-contact-${aspectValence(contact.aspect.aspect.key)}`}>
      {t.contactSentence(`${nameA}’s ${bodyA}`, aspect, `${nameB}’s ${bodyB}`, contact.aspect.orb.toFixed(1))}
    </li>
  );
}

function HouseOverlayLine({
  overlay,
  nameA,
  nameB,
  locale,
}: {
  readonly overlay: HouseOverlay;
  readonly nameA: string;
  readonly nameB: string;
  readonly locale: Locale;
}): React.JSX.Element {
  const t = useMessages(relationshipSummaryMessages);
  const [owner, into] = overlay.direction === 'a-in-b' ? [nameA, nameB] : [nameB, nameA];
  const body = bodyDisplayName(overlay.bodyKey, locale);
  const theme = t.houseThemes[overlay.house - 1] ?? '';
  return <li>{t.houseOverlaySentence(owner, body, into, ordinal(overlay.house, locale), theme)}</li>;
}

export function RelationshipSummary({
  data,
  nameA,
  nameB,
  locale,
}: {
  readonly data: SynastryData;
  readonly nameA: string;
  readonly nameB: string;
  readonly locale: Locale;
}): React.JSX.Element {
  const t = useMessages(relationshipSummaryMessages);
  const user = useSessionUserOrUndefined();
  const [consent, setConsent] = useState(false);
  const [generating, setGenerating] = useState(false);
  const [sections, setSections] = useState<readonly Tier2Section[] | undefined>(undefined);
  const [error, setError] = useState<string | undefined>(undefined);
  const [saved, setSaved] = useState<readonly SavedInterpretationSummary[]>([]);
  const [openingId, setOpeningId] = useState<string | undefined>(undefined);
  const reasonId = useId();

  useEffect(() => {
    if (user === undefined) return;
    void listSavedInterpretations()
      .then(setSaved)
      .catch(() => undefined);
  }, [user]);

  const groups = groupedRelationshipContacts(data);
  const angleContacts = relationshipAngleContacts(data);
  const overlays = houseOverlays(data);

  let harmonious = 0;
  let challenging = 0;
  for (const contacts of groups.values()) {
    for (const contact of contacts) {
      const valence = aspectValence(contact.aspect.aspect.key);
      if (valence === 'harmonious') harmonious++;
      else if (valence === 'challenging') challenging++;
    }
  }

  const disabledReason = user === undefined ? t.tier2SignIn : !consent ? t.tier2DisabledConsent : undefined;

  function generate(): void {
    setGenerating(true);
    setError(undefined);
    setSections(undefined);
    // Consent authorizes this one request: spent as it is sent, as every other Tier 2 panel does (#391).
    setConsent(false);
    generateTier2Interpretation({
      mode: 'relationship',
      relationshipData: toTier2RelationshipPayload(
        data,
        overlays.map((overlay) => ({ bodyKey: overlay.bodyKey, house: overlay.house, direction: overlay.direction })),
      ),
      locale,
    })
      .then((generated) => {
        setSections(generated);
        void listSavedInterpretations()
          .then(setSaved)
          .catch(() => undefined);
      })
      .catch((caught: unknown) => {
        setError(caught instanceof Tier2Error ? caught.message : String(caught));
      })
      .finally(() => {
        setGenerating(false);
      });
  }

  function openSaved(id: string): void {
    setOpeningId(id);
    setError(undefined);
    getSavedInterpretation(id)
      .then((detail) => {
        setSections(detail.sections);
      })
      .catch((caught: unknown) => {
        setError(caught instanceof Tier2Error ? caught.message : String(caught));
      })
      .finally(() => {
        setOpeningId(undefined);
      });
  }

  const history = saved.filter((entry) => entry.basis?.kind === 'relationship');
  const housesUsable = housesAreDefined(data.chartA.houses) || housesAreDefined(data.chartB.houses);

  return (
    <section className="relationship-summary" aria-label={t.heading}>
      <h3>{t.heading}</h3>
      <p className="hint">{t.hint}</p>
      <p>{t.balanceSentence(harmonious, challenging)}</p>

      {RELATIONSHIP_THEMES.filter((theme) => theme !== 'angles').map((theme) => {
        const contacts = groups.get(theme) ?? [];
        if (contacts.length === 0) return null;
        return (
          <div key={theme}>
            <h4>{t.themeLabels[theme]}</h4>
            <ul>
              {contacts.map((contact) => (
                <ContactLine
                  key={`${contact.aspect.bodyA}-${contact.aspect.aspect.key}-${contact.aspect.bodyB}`}
                  contact={contact}
                  nameA={nameA}
                  nameB={nameB}
                  locale={locale}
                />
              ))}
            </ul>
          </div>
        );
      })}

      {angleContacts.length > 0 && (
        <div>
          <h4>{t.themeLabels.angles}</h4>
          <ul>
            {angleContacts.map((contact) => {
              const [owner, other] = contact.side === 'a' ? [nameA, nameB] : [nameB, nameA];
              return (
                <li key={`${contact.side}-${contact.body}-${contact.angle}-${contact.aspect.key}`}>
                  {t.angleContactSentence(
                    owner,
                    bodyDisplayName(bodyKeyOf(contact.body), locale),
                    aspectDisplayName(contact.aspect.key, locale),
                    t.angleNames[contact.angle],
                    other,
                  )}
                </li>
              );
            })}
          </ul>
        </div>
      )}

      {housesUsable && overlays.length > 0 && (
        <div>
          <h4>{t.overlaysHeading}</h4>
          <ul>
            {overlays.map((overlay, index) => (
              <HouseOverlayLine
                key={`${overlay.direction}-${overlay.bodyKey}-${String(index)}`}
                overlay={overlay}
                nameA={nameA}
                nameB={nameB}
                locale={locale}
              />
            ))}
          </ul>
        </div>
      )}

      <h4>{t.tier2Heading}</h4>
      {user !== undefined && (
        <label>
          <input
            type="checkbox"
            checked={consent}
            onChange={(event) => {
              setConsent(event.target.checked);
            }}
          />{' '}
          {t.tier2Consent}
        </label>
      )}
      <button
        type="button"
        disabled={disabledReason !== undefined || generating}
        aria-describedby={disabledReason === undefined ? undefined : reasonId}
        onClick={generate}
      >
        {generating ? t.tier2Generating : t.tier2Generate}
      </button>
      {disabledReason !== undefined && (
        <span id={reasonId} className="hint">
          {' '}
          {user === undefined ? disabledReason : `(${disabledReason})`}
        </span>
      )}
      {error !== undefined && <p role="alert">{t.tier2Error(error)}</p>}
      {sections !== undefined && (
        <div className="tier2-result" aria-live="polite">
          {sections.map((section) => (
            <article key={section.heading}>
              <h5>{section.heading}</h5>
              <p>{section.body}</p>
            </article>
          ))}
        </div>
      )}
      {history.length > 0 && (
        <div className="tier2-saved-results">
          <h5>{t.tier2SavedHeading}</h5>
          <ul>
            {history.map((entry) => (
              <li key={entry.id}>
                <button
                  type="button"
                  className="quiet"
                  disabled={openingId !== undefined}
                  onClick={() => {
                    openSaved(entry.id);
                  }}
                >
                  {formatSavedTime(entry.createdAt, locale)}
                  {entry.description === null ? '' : ` (${entry.description})`}
                  {entry.basis === null ? '' : ` (${basisLabel(entry.basis, locale)})`}
                </button>
              </li>
            ))}
          </ul>
        </div>
      )}
    </section>
  );
}
