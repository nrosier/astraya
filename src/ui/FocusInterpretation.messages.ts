/**
 * Message catalogue for `FocusInterpretation.tsx` (#424).
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
};

export const focusInterpretationMessages = { en, nl };
