/**
 * Message catalogue for `ReportView.tsx` (#158).
 */
const en = {
  showProvenance: 'Show provenance (rule and corpus entry) for each paragraph',
  couldNotLoad: (message: string) => `Could not load the interpretation text: ${message}`,
  loadingInterpretation: 'Loading interpretation…',
  interpretationDisclaimer:
    'Read this as pieces of a whole, not standalone verdicts: a computer-generated interpretation describes one placement at a time, but no position or aspect means much on its own — only alongside everything else in the chart.',
  tocHeading: 'Contents',
  tocAriaLabel: 'Interpretation sections',
  interpretationTablist: 'Interpretation mode',
  standardTabLabel: 'Standard',
  aiTabLabel: 'AI-Customized',
  tier2Heading: 'AI-customized interpretation',
  tier2SignInPrompt: 'Sign in to generate an AI-customized interpretation in your own style and tone.',
  tier2ConsentLabel: (mode: 'grounded' | 'freeform'): string =>
    mode === 'grounded'
      ? 'Send the placements above (no name or birth data) to a third-party AI model for this one request.'
      : 'Send your exact positions, houses, and aspects (no name or birth data) to a third-party AI model for this one request.',
  tier2ModeLabel: 'Interpretation mode',
  tier2ModeGrounded: 'Restyle reviewed text',
  tier2ModeGroundedDescription: 'Rewrites the reviewed text in your style. Sends only the placements above.',
  tier2ModeFreeform: 'AI-written from your full chart',
  tier2ModeFreeformDescription:
    'The AI reasons across your whole chart, placements and how they interact, and writes its own interpretation. Your style, tone and focus instruction is optional. Sends your exact positions, houses, and aspects.',
  customPromptLabel: 'Style, tone, and focus instructions',
  customPromptOptional: ' (optional)',
  customPromptPlaceholder: 'e.g. warm and encouraging, focused on career growth',
  guardrailIssueLength: 'Keep this between 1 and 500 characters.',
  guardrailIssuePromptInjection:
    'This looks like it is trying to redirect the model rather than describe a style — please rephrase.',
  guardrailIssueFatalisticPhrasing: 'Avoid absolute, no-way-out phrasing (e.g. "you will never...").',
  guardrailIssueMedicalLegalFinancialClaim: 'Avoid asking for medical, legal, or financial advice.',
  guardrailIssuePiiShape: 'This looks like it contains a date or coordinate — describe style, tone, and focus only.',
  guardrailIssueOffTopic:
    'This is about files, systems, or access, not the interpretation — describe style, tone, and focus only.',
  guardrailIssueFabricationRequest:
    'This asks the model to invent or ignore facts rather than restyle the real chart — not allowed.',
  guardrailIssueRelationshipVerdict:
    'This asks for a verdict about a relationship rather than an observation about its dynamic — not allowed.',
  tier2Generate: 'Generate',
  tier2Generating: 'Generating…',
  tier2GenerateDisabledConsent: 'check the consent box first',
  tier2GenerateDisabledEmpty: 'enter style, tone, and focus instructions first',
  tier2GenerateDisabledGuardrail: 'fix the issues above first',
  tier2Error: (message: string) => `Could not generate: ${message}`,
  tier2CustomizationRejected:
    'These instructions violate the allowed customization rules. You can change the tone, style, or focus, but not ask the interpretation to lie, invent facts, or make promises.',
  tier2CustomizationRejectedReason: (reason: string) => `Reason: ${reason}`,
  tier2SavedHeading: 'Past interpretations',
  /** `Tuesday March 10 2026 @ 17:30 (Short and warm, focus on family) (AI interpretation of Mars (natal))`; the description is optional. The kind-and-basis phrase comes from `result-basis-label.ts`. */
  tier2SavedEntry: (time: string, kind: string, description: string | null) =>
    description === null ? `${time} (${kind})` : `${time} (${description}) (${kind})`,
};

const nl: typeof en = {
  showProvenance: 'Herkomst (regel en corpustekst) tonen voor elke paragraaf',
  couldNotLoad: (message: string) => `Kon de interpretatietekst niet laden: ${message}`,
  loadingInterpretation: 'Interpretatie wordt geladen…',
  interpretationDisclaimer:
    'Lees dit als onderdelen van een geheel, niet als losse oordelen: een door een computer gegenereerde interpretatie beschrijft één plaatsing per keer, maar geen enkele positie of aspect betekent veel op zichzelf — alleen samen met de rest van de horoscoop.',
  tocHeading: 'Inhoud',
  tocAriaLabel: 'Onderdelen van de interpretatie',
  interpretationTablist: 'Interpretatiemodus',
  standardTabLabel: 'Standaard',
  aiTabLabel: 'AI-gepersonaliseerd',
  tier2Heading: 'AI-gepersonaliseerde interpretatie',
  tier2SignInPrompt: 'Log in om een AI-gepersonaliseerde interpretatie in je eigen stijl en toon te genereren.',
  tier2ConsentLabel: (mode: 'grounded' | 'freeform') =>
    mode === 'grounded'
      ? 'Verstuur de bovenstaande plaatsingen (geen naam of geboortegegevens) naar een AI-model van derden voor dit ene verzoek.'
      : 'Verstuur je exacte posities, huizen en aspecten (geen naam of geboortegegevens) naar een AI-model van derden voor dit ene verzoek.',
  tier2ModeLabel: 'Interpretatiemodus',
  tier2ModeGrounded: 'Herschrijf beoordeelde tekst',
  tier2ModeGroundedDescription:
    'Herschrijft de beoordeelde tekst in jouw stijl. Verstuurt alleen de bovenstaande plaatsingen.',
  tier2ModeFreeform: 'Door AI geschreven vanuit je volledige horoscoop',
  tier2ModeFreeformDescription:
    'De AI redeneert over je hele horoscoop, de plaatsingen en hun samenspel, en schrijft een eigen interpretatie. Je instructie voor stijl, toon en focus is optioneel. Verstuurt je exacte posities, huizen en aspecten.',
  customPromptLabel: 'Instructies voor stijl, toon en focus',
  customPromptOptional: ' (optioneel)',
  customPromptPlaceholder: 'bijv. warm en aanmoedigend, gericht op carrièregroei',
  guardrailIssueLength: 'Houd dit tussen 1 en 500 tekens.',
  guardrailIssuePromptInjection:
    'Dit lijkt te proberen het model om te leiden in plaats van een stijl te beschrijven — formuleer het anders.',
  guardrailIssueFatalisticPhrasing: 'Vermijd absolute, uitzichtloze bewoordingen (bijv. "je zult nooit...").',
  guardrailIssueMedicalLegalFinancialClaim: 'Vraag niet om medisch, juridisch of financieel advies.',
  guardrailIssuePiiShape: 'Dit lijkt een datum of coördinaat te bevatten — beschrijf alleen stijl, toon en focus.',
  guardrailIssueOffTopic:
    'Dit gaat over bestanden, systemen of toegang, niet over de interpretatie — beschrijf alleen stijl, toon en focus.',
  guardrailIssueFabricationRequest:
    'Dit vraagt het model om feiten te verzinnen of te negeren in plaats van de echte horoscoop anders te verwoorden — niet toegestaan.',
  guardrailIssueRelationshipVerdict:
    'Dit vraagt om een oordeel over een relatie in plaats van een observatie over de dynamiek ervan — niet toegestaan.',
  tier2Generate: 'Genereren',
  tier2Generating: 'Genereren…',
  tier2GenerateDisabledConsent: 'vink eerst het toestemmingsvakje aan',
  tier2GenerateDisabledEmpty: 'voer eerst stijl-, toon- en focusinstructies in',
  tier2GenerateDisabledGuardrail: 'los eerst de bovenstaande problemen op',
  tier2Error: (message: string) => `Genereren mislukt: ${message}`,
  tier2CustomizationRejected:
    'Deze instructies overtreden de regels voor toegestane aanpassingen. Je kunt de toon, stijl of focus wijzigen, maar de interpretatie niet laten liegen, feiten laten verzinnen of beloftes laten doen.',
  tier2CustomizationRejectedReason: (reason: string) => `Reden: ${reason}`,
  tier2SavedHeading: 'Eerdere interpretaties',
  tier2SavedEntry: (time, kind, description) =>
    description === null ? `${time} (${kind})` : `${time} (${description}) (${kind})`,
};

export const reportViewMessages = { en, nl };
