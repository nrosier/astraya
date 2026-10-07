/**
 * Message catalogue for `RelationshipSummary.tsx` (#422): the grouped, ranked relationship
 * summary above Synastry's existing aspects table, and its own Tier 2 panel.
 */
/**
 * @module RelationshipSummary.messages
 * @purpose English/Dutch message catalogue for the grouped relationship-summary panel (themes, house overlays, Tier 2 AI reading).
 * @conventions Co-located i18n file exporting `{ en, nl }`, consumed via `useMessages()` by the sibling `RelationshipSummary.tsx`.
 * @exports relationshipSummaryMessages
 */
import type { RelationshipTheme } from '../domain/relationship-themes.js';

const en = {
  heading: 'Relationship summary',
  hint: 'The strongest contacts, grouped by theme — compatibility, strengths, weaknesses, caveats and dynamic, not a verdict on the relationship.',
  themeLabels: {
    bond: 'Emotional bond',
    attraction: 'Attraction',
    communication: 'Communication',
    commitment: 'Commitment and structure',
    growth: 'Growth',
    identity: 'Identity',
    angles: 'Contacts to the Ascendant and Midheaven',
    other: 'Other contacts',
  } satisfies Record<RelationshipTheme, string>,
  seenFrom: (name: string) => `${name}’s`,
  contactSentence: (bodyA: string, aspect: string, bodyB: string, orb: string) =>
    `${bodyA} ${aspect} ${bodyB} (orb ${orb}°)`,
  angleContactSentence: (name: string, body: string, aspect: string, angleName: string, otherName: string) =>
    `${name}’s ${body} ${aspect} ${otherName}’s ${angleName}`,
  angleNames: { asc: 'Ascendant', mc: 'Midheaven' },
  /** `house` is already a formatted ordinal (`ordinal()` from `placement-label.ts`), e.g. "3rd" or "3e" — never append a suffix here. */
  houseOverlaySentence: (name: string, body: string, otherName: string, house: string, theme: string) =>
    `${name}’s ${body} falls in ${otherName}’s ${house} house (${theme}).`,
  houseThemes: [
    'self and identity',
    'resources and values',
    'communication and the immediate environment',
    'home and roots',
    'creativity and self-expression',
    'daily routines and health',
    'partnership',
    'shared intimacy and transformation',
    'beliefs and horizons',
    'career and public role',
    'community and shared goals',
    'inner life and release',
  ],
  overlaysHeading: 'House overlays',
  balanceSentence: (harmonious: number, challenging: number) =>
    `${String(harmonious)} harmonious contact(s), ${String(challenging)} challenging — a starting point for reflection, not a score.`,
  noContactsInTheme: 'No contact in this theme.',
  tier2Heading: 'AI relationship reading',
  tier2Generate: 'Generate an AI-customised relationship reading',
  tier2Generating: 'Generating…',
  tier2Consent:
    'Send both people’s computed placements, the aspects between their charts, and the house overlays (no names, dates or places) to a third-party AI model for this one request.',
  tier2SignIn: 'Sign in to generate an AI-customised relationship reading.',
  tier2DisabledConsent: 'check the consent box first',
  tier2Error: (message: string) => `Could not generate: ${message}`,
  tier2SavedHeading: 'Past relationship readings for this pairing',
};

const nl: typeof en = {
  heading: 'Relatieoverzicht',
  hint: 'De sterkste contacten, gegroepeerd per thema — compatibiliteit, sterke en zwakke punten, aandachtspunten en dynamiek, geen oordeel over de relatie.',
  themeLabels: {
    bond: 'Emotionele band',
    attraction: 'Aantrekkingskracht',
    communication: 'Communicatie',
    commitment: 'Toewijding en structuur',
    growth: 'Groei',
    identity: 'Identiteit',
    angles: 'Contacten met de Ascendant en het Middenhemelpunt',
    other: 'Overige contacten',
  } satisfies Record<RelationshipTheme, string>,
  seenFrom: (name: string) => `${name}’s`,
  contactSentence: (bodyA, aspect, bodyB, orb) => `${bodyA} ${aspect} ${bodyB} (orb ${orb}°)`,
  angleContactSentence: (name, body, aspect, angleName, otherName) =>
    `${name}’s ${body} ${aspect} ${otherName}’s ${angleName}`,
  angleNames: { asc: 'Ascendant', mc: 'Middenhemelpunt' },
  houseOverlaySentence: (name, body, otherName, house, theme) =>
    `${name}’s ${body} valt in het ${house} huis van ${otherName} (${theme}).`,
  houseThemes: [
    'zelf en identiteit',
    'middelen en waarden',
    'communicatie en de directe omgeving',
    'thuis en wortels',
    'creativiteit en zelfexpressie',
    'dagelijkse routines en gezondheid',
    'partnerschap',
    'gedeelde intimiteit en transformatie',
    'overtuigingen en horizonnen',
    'carrière en publieke rol',
    'gemeenschap en gedeelde doelen',
    'binnenleven en loslaten',
  ],
  overlaysHeading: 'Huisoverlappingen',
  balanceSentence: (harmonious, challenging) =>
    `${String(harmonious)} harmonieus(e) contact(en), ${String(challenging)} uitdagend — een startpunt voor reflectie, geen score.`,
  noContactsInTheme: 'Geen contact binnen dit thema.',
  tier2Heading: 'AI-relatieduiding',
  tier2Generate: 'Genereer een AI-aangepaste relatieduiding',
  tier2Generating: 'Bezig met genereren…',
  tier2Consent:
    'Verstuur de berekende plaatsingen van beide personen, de aspecten tussen hun horoscopen en de huisoverlappingen (geen namen, data of plaatsen) naar een AI-model van derden voor dit ene verzoek.',
  tier2SignIn: 'Log in om een AI-aangepaste relatieduiding te genereren.',
  tier2DisabledConsent: 'vink eerst het toestemmingsvakje aan',
  tier2Error: (message) => `Kon niet genereren: ${message}`,
  tier2SavedHeading: 'Eerdere relatieduidingen voor dit koppel',
};

export const relationshipSummaryMessages = { en, nl };
