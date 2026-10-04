/**
 * Prompt content for #56, transcribed from the issue's confirmed
 * generation-run settings (issue #56, comment 2026-09-07) rather than
 * re-derived — this is the one place that text should live so the real
 * batch runner and this demo script can't drift apart.
 */

/**
 * The voice of a corpus entry: no character, no signature style. (The advisor personas that once
 * sat beside it were removed in #429; the wording below is unchanged, so a regeneration reads
 * the same as before.)
 *
 * Three-part structure (gift / mechanism / shadow dilemma), not the earlier
 * plain "gift then pitfall" framing: a cross-check against ChatGPT's own
 * interpretation of the same placements (closing #368) found Gemini's
 * output defaulting to vivid emotional symptoms for the shadow side
 * ("harsh self-criticism", "exhausting burden") where ChatGPT's reads as a
 * functional tension instead ("establishing your own terms", "tension
 * between self-direction and obligation"). Gemini's own self-diagnosis,
 * cross-checked against the actual prompt: the old framing gave the model
 * nothing to anchor the shadow to except "pitfall," so under a tight word
 * budget it reached for a dramatic symptom instead of naming the underlying
 * tension. Naming the mechanism explicitly closes that gap; see
 * VOICE_GUIDE's "functional tension, not emotional symptom" rule
 * (src/interpretation/symbolism.ts) for the matching tone guardrail.
 * NEGATIVE_CONSTRAINTS' own word-count line widened from 40–60 to a 50–80
 * *target* (not a hard ceiling, deliberately — flagged as too strict a
 * reading of this same advice) for the same reason: three balanced parts
 * need more room than two did.
 */
export const NEUTRAL_SYSTEM_PROMPT = {
  en: "You are a psychologically grounded, even-handed astrologer writing the default entry in an interpretation corpus — the text every reader sees before picking a more particular voice. Describe the placement's standing disposition by balancing three things: the core drive or gift it inherently builds toward, the functional mechanism — how that drive navigates boundaries, control or independence — and the shadow dilemma that surfaces when it meets an external limit or dependence. Write in plain, warm-but-precise prose, without dramatizing either side. Adopt no persona or signature style of your own — this is the chart speaking, not a character.",
  nl: 'Je bent een psychologisch onderlegde, evenwichtige astroloog die de standaardtekst schrijft in een interpretatiecorpus — de tekst die elke lezer ziet voordat die een specifiekere stem kiest. Beschrijf de blijvende aanleg van de stand door drie dingen in evenwicht te brengen: de kerndrijfveer of gave waar de plaatsing vanzelf naar toe bouwt, het functionele mechanisme — hoe die drijfveer omgaat met grenzen, controle of onafhankelijkheid — en het schaduwdilemma dat ontstaat zodra ze een externe beperking of afhankelijkheid tegenkomt. Schrijf in heldere, warme maar precieze taal, zonder een van beide te dramatiseren. Neem geen eigen persona of stijl aan — dit is de horoscoop die spreekt, niet een personage.',
};

/**
 * Ollama models (unlike Gemini) have been observed to drift to English mid-batch
 * for non-English locales (#371) — a local model with no locale hint defaults toward
 * its dominant training language. Gemini stays on-locale without this, so it's opt-in
 * per `buildSystemInstruction`'s `forceLanguageDirective` param rather than always-on.
 */
export const FORCE_LANGUAGE_DIRECTIVE = {
  nl: 'BELANGRIJK: Schrijf uitsluitend in het Nederlands. Elke zin moet Nederlands zijn. Gebruik geen Engels.',
};

export const NEGATIVE_CONSTRAINTS = [
  'Do not use astrological jargon that duplicates what the chart data already states: cosmic, alignment, transit, energies, vibration, native, or the placement’s own terms (the planet name, sign name, house number).',
  'Do not state numbers or degrees. The rule engine owns every figure; a number in prose can contradict the chart.',
  'Do not use AI-tell vocabulary: tapestry, dance, delve, realm, intricate, navigate, testament, symphony, weave.',
  'Do not reduce a placement to its most common stereotype: Saturn to perfectionism or workaholism, Mars to anger or aggression, Venus to vanity or romance, Mercury or Gemini to anxious chatter.',
  'Do not predict a future event or give advice ("you will meet...", "you should..."). Describe a standing disposition, not a forecast.',
  "Aim for 50 to 80 words, across 2 to 3 sentences — a target, not a hard ceiling: go a little longer only when the placement genuinely needs the room for a balanced, unrushed sentence, never by default, and never toward paragraph length. Shorter reads as a stub; too long stops being one placement's contribution to a report that stacks a dozen of these. The corpus lint pass separately rejects anything under 40 or over 1600 characters regardless of quality, as a backstop, not the actual target.",
];

/** Builds the model-facing instruction block shared by every request. */
export function buildNegativeConstraintsBlock() {
  return [
    'HARD CONSTRAINTS (violating any of these makes the output unusable)',
    ...NEGATIVE_CONSTRAINTS.map((rule) => `- ${rule}`),
  ].join('\n');
}

/**
 * The "3 gold-standard hand-written fragments" #56 originally asked for,
 * sourced from the corpus's own `anchor: true` marking (#211) instead of a
 * hardcoded key list picked ad hoc per batch — the corpus itself says what's
 * an anchor, in whichever locale the request is for.
 *
 * Optional, not required (#368): originally this threw when a locale had no
 * anchors, on the theory that every model needs a few-shot example to match
 * house style against. `qwen2.5:14b`, used for a full from-scratch
 * regeneration, was judged capable of reasoning to the same tone/length/depth
 * constraints directly from the system instruction and negative constraints
 * alone, with no example text needed — the user's own call. Returns
 * `undefined` (not a thrown error) when a locale has no anchors, so
 * `buildUserContent` can simply omit the section rather than every caller
 * needing its own now-unnecessary "seed some anchors first" workaround.
 */
export function buildAnchorsBlock(corpusEntries, locale) {
  const anchors = corpusEntries.filter((entry) => entry.anchor === true && entry.locale === locale);
  if (anchors.length === 0) return undefined;
  const matchInstruction = 'match this tone, depth and length';
  return [
    `GOLD-STANDARD EXAMPLES (${matchInstruction} — do not copy their content)`,
    ...anchors.map((entry) => `- ${entry.text}`),
  ].join('\n');
}

/** Combines the voice with the rules every entry must obey. */
export function buildSystemInstruction({ symbolismContext, locale, forceLanguageDirective }) {
  const voicePrompt = NEUTRAL_SYSTEM_PROMPT[locale] ?? NEUTRAL_SYSTEM_PROMPT.en;
  const languageDirective = forceLanguageDirective ? FORCE_LANGUAGE_DIRECTIVE[locale] : undefined;
  return [
    ...(languageDirective ? [languageDirective, ''] : []),
    voicePrompt,
    '',
    'Even in this voice, the output feeds a structured interpretation corpus, not a chat reply — the constraints below override any instinct the voice above has to hedge, moralize or use extended metaphor.',
    '',
    buildNegativeConstraintsBlock(),
    '',
    symbolismContext,
  ].join('\n');
}

/**
 * #396: quintile/biquintile ("the quintile series" — aspects.ts's own doc comment) share a
 * traditional flavor distinct from a major aspect's tension/flow: a knack for creative synthesis.
 * Unlike a major aspect's feel, which models convey without being told (friction, harmony are
 * common-knowledge associations), this one isn't — ChatGPT's judge kept flagging quintile/
 * biquintile entries as generic for exactly this reason (#396), and Gemini kept (correctly)
 * declining to just name the aspect, since NEGATIVE_CONSTRAINTS already bans repeating what the
 * facts already state. This supplies the actual missing ingredient — what quality to aim for —
 * without lifting that ban.
 */
const QUINTILE_SERIES_ASPECTS = new Set(['quintile', 'biquintile']);
const QUINTILE_SERIES_FLAVOR_HINT = {
  en: "This pairing's aspect is part of the quintile series. Unlike a major aspect's tension or flow, its traditional flavor is a knack for creative synthesis: a specific talent, inventive workaround, or skillful way the two drives combine into something neither manages alone. Let that specific creative, integrative quality come through in what the combination actually produces or enables — without naming the aspect itself.",
  nl: 'Het aspect van deze combinatie hoort bij de quintielfamilie. Anders dan de spanning of vloeiendheid van een hoofdaspect is de traditionele kleur ervan een aanleg voor creatieve synthese: een specifiek talent, een vindingrijke oplossing, of een vaardige manier waarop de twee drijfveren samen iets opleveren dat geen van beide alleen voor elkaar krijgt. Laat die specifieke creatieve, integrerende kwaliteit doorklinken in wat de combinatie daadwerkelijk oplevert of mogelijk maakt — zonder het aspect zelf te noemen.',
};

/**
 * #437: the voice asks every entry for a "shadow dilemma", and the judge rejects a shadow written as an
 * extreme symptom. For the mild minor aspects the model dramatises the shadow (a "constant vigilance", an
 * "absolute need to defend autonomy") and gets flagged for overstating a subtle contact. So these aspects get
 * their own reminder that the contact is small and the shadow should be too.
 */
const MILD_ASPECTS = new Set(['semisextile', 'semisquare', 'quintile', 'biquintile']);
const MILD_SHADOW_HINT = {
  en: 'This aspect is a subtle contact, not a major one. Keep the shadow equally mild: a small friction or a habit of over-adjusting, never a defensive reflex, an absolute need, or an extreme behaviour.',
  nl: 'Dit aspect is een subtiel contact, geen hoofdaspect. Houd de schaduw even mild: een kleine wrijving of een neiging tot overbijsturen, nooit een afweerreflex, een absolute behoefte of extreem gedrag.',
};

/** The flavor hint for this aspect/locale: the quintile series' creative flavor and/or the mild-shadow reminder, or `undefined`. */
export function aspectFlavorHint(aspectKey, locale) {
  const parts = [];
  if (QUINTILE_SERIES_ASPECTS.has(aspectKey))
    parts.push(QUINTILE_SERIES_FLAVOR_HINT[locale] ?? QUINTILE_SERIES_FLAVOR_HINT.en);
  if (MILD_ASPECTS.has(aspectKey)) parts.push(MILD_SHADOW_HINT[locale] ?? MILD_SHADOW_HINT.en);
  return parts.length === 0 ? undefined : parts.join(' ');
}

export function buildUserContent({ placementDescription, corpusEntries, locale, aspectKey }) {
  const anchorsBlock = buildAnchorsBlock(corpusEntries, locale);
  const flavorHint = aspectKey === undefined ? undefined : aspectFlavorHint(aspectKey, locale);
  return [
    `TARGET PLACEMENT: ${placementDescription}`,
    '',
    ...(flavorHint ? [flavorHint, ''] : []),
    ...(anchorsBlock ? [anchorsBlock, ''] : []),
    'Write one corpus entry for the target placement, in the voice above, obeying every hard constraint.',
  ].join('\n');
}
