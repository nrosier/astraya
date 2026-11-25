/**
 * Message catalogue for `FocusInterpretation.tsx` (#424).
 */
/**
 * @module FocusInterpretation.messages
 * @purpose English/Dutch i18n strings for the Tier 2 AI-interpretation-of-a-placement (and of a sign, #1998) feature: consent text, generate button, and errors.
 * @conventions Co-located i18n file exporting `{ en, nl }`, consumed by FocusInterpretation.tsx via `useMessages(focusInterpretationMessages)`; `nl` is typed as `typeof en`.
 * @exports focusInterpretationMessages
 */
const en = {
  heading: 'AI interpretation of this placement',
  generate: 'Interpret the tensions of this placement',
  generating: 'Interpreting…',
  consent:
    'Send this placement’s sign, house, rulerships and aspects (no name or birth data) to a third-party AI model for this one request.',
  signIn: 'Sign in to generate an AI interpretation of this placement.',
  disabledConsent: 'check the consent box first',
  error: (message: string) => `Could not generate: ${message}`,
  // A selected sign (#1998): the same control, saying what a sign request sends.
  signHeading: 'AI interpretation of this sign',
  signGenerate: 'Interpret how this sign operates',
  signConsent:
    'Send this sign’s house cusps, its ruler’s sign, house, rulerships and aspects, and the bodies in it (no name or birth data) to a third-party AI model for this one request.',
  signSignIn: 'Sign in to generate an AI interpretation of this sign.',
};

const nl: typeof en = {
  heading: 'AI-interpretatie van deze plaatsing',
  generate: 'Interpreteer de spanningen van deze plaatsing',
  generating: 'Bezig met interpreteren…',
  consent:
    'Verstuur het teken, het huis, de heerserschappen en de aspecten van deze plaatsing (geen naam of geboortegegevens) naar een AI-model van derden voor dit ene verzoek.',
  signIn: 'Log in om een AI-interpretatie van deze plaatsing te genereren.',
  disabledConsent: 'vink eerst het toestemmingsvakje aan',
  error: (message) => `Kon niet genereren: ${message}`,
  signHeading: 'AI-interpretatie van dit teken',
  signGenerate: 'Interpreteer hoe dit teken werkt',
  signConsent:
    'Verstuur de huiscuspen van dit teken, het teken, het huis, de heerserschappen en de aspecten van zijn heerser, en de hemellichamen erin (geen naam of geboortegegevens) naar een AI-model van derden voor dit ene verzoek.',
  signSignIn: 'Log in om een AI-interpretatie van dit teken te genereren.',
};

export const focusInterpretationMessages = { en, nl };
