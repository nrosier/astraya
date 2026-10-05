/**
 * Flat-paragraph rendering of the grouped, ranked relationship summary (#422) for the PDF
 * export's Synastry section — the same no-LLM facts `RelationshipSummary.tsx` renders as
 * headings and lists, reduced to one paragraph per group so they fit `PdfTextSectionPlan`'s
 * `paragraphs: readonly string[]` shape. The classification itself (`groupedRelationshipContacts`,
 * `relationshipAngleContacts`, `houseOverlays`, `aspectValence`) is never duplicated here — only
 * the sentence-per-contact-into-one-paragraph joining is PDF-specific.
 */
import { bodyById } from '../astrology/bodies.js';
import { housesAreDefined } from '../domain/chart-compute.js';
import { houseOverlays } from '../domain/house-overlays.js';
import {
  aspectValence,
  groupedRelationshipContacts,
  relationshipAngleContacts,
  RELATIONSHIP_THEMES,
  type RelationshipContact,
} from '../domain/relationship-themes.js';
import type { SynastryData } from '../domain/synastry.js';
import type { BodyId } from '../ephemeris/types.js';
import type { Locale } from '../interpretation/schema.js';
import { aspectDisplayName, bodyDisplayName } from './astro-names.messages.js';
import { ordinal } from './placement-label.js';
import { relationshipSummaryMessages } from './RelationshipSummary.messages.js';

const bodyKeyOf = (id: BodyId): string => bodyById(id)?.key ?? String(id);

function contactSentence(
  contact: RelationshipContact,
  nameA: string,
  nameB: string,
  locale: Locale,
  t: (typeof relationshipSummaryMessages)['en'],
): string {
  const bodyA = bodyDisplayName(bodyKeyOf(contact.aspect.bodyA), locale);
  const bodyB = bodyDisplayName(bodyKeyOf(contact.aspect.bodyB), locale);
  const aspect = aspectDisplayName(contact.aspect.aspect.key, locale);
  return t.contactSentence(`${nameA}’s ${bodyA}`, aspect, `${nameB}’s ${bodyB}`, contact.aspect.orb.toFixed(1));
}

/**
 * One paragraph per non-empty theme (contacts joined with "; "), one for angle contacts, one for
 * house overlays (when houses are usable on at least one side), led by a hint and balance
 * sentence — the exact text `RelationshipSummary.tsx` composes, just flattened for a PDF page.
 */
export function relationshipSummaryParagraphs(
  data: SynastryData,
  nameA: string,
  nameB: string,
  locale: Locale,
): readonly string[] {
  const t = relationshipSummaryMessages[locale];
  const groups = groupedRelationshipContacts(data);
  const angleContacts = relationshipAngleContacts(data);
  const overlays = houseOverlays(data);
  const housesUsable = housesAreDefined(data.chartA.houses) || housesAreDefined(data.chartB.houses);

  let harmonious = 0;
  let challenging = 0;
  for (const contacts of groups.values()) {
    for (const contact of contacts) {
      const valence = aspectValence(contact.aspect.aspect.key);
      if (valence === 'harmonious') harmonious++;
      else if (valence === 'challenging') challenging++;
    }
  }

  const paragraphs: string[] = [t.hint, t.balanceSentence(harmonious, challenging)];

  for (const theme of RELATIONSHIP_THEMES) {
    if (theme === 'angles') continue;
    const contacts = groups.get(theme) ?? [];
    if (contacts.length === 0) continue;
    const sentences = contacts.map((contact) => contactSentence(contact, nameA, nameB, locale, t));
    paragraphs.push(`${t.themeLabels[theme]}: ${sentences.join('; ')}.`);
  }

  if (angleContacts.length > 0) {
    const sentences = angleContacts.map((contact) => {
      const [owner, other] = contact.side === 'a' ? [nameA, nameB] : [nameB, nameA];
      return t.angleContactSentence(
        owner,
        bodyDisplayName(bodyKeyOf(contact.body), locale),
        aspectDisplayName(contact.aspect.key, locale),
        t.angleNames[contact.angle],
        other,
      );
    });
    paragraphs.push(`${t.themeLabels.angles}: ${sentences.join('; ')}.`);
  }

  if (housesUsable && overlays.length > 0) {
    const sentences = overlays.map((overlay) => {
      const [owner, into] = overlay.direction === 'a-in-b' ? [nameA, nameB] : [nameB, nameA];
      const theme = t.houseThemes[overlay.house - 1] ?? '';
      return t.houseOverlaySentence(
        owner,
        bodyDisplayName(overlay.bodyKey, locale),
        into,
        ordinal(overlay.house, locale),
        theme,
      );
    });
    paragraphs.push(`${t.overlaysHeading}: ${sentences.join(' ')}`);
  }

  return paragraphs;
}
