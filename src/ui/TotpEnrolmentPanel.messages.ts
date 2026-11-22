/**
 * Message catalogue for `TotpEnrolmentPanel.tsx` (#1500). The wording is the owner-approved draft copy table on #1500
 * (approved as drafted, 2026-11-22); change it only through a new owner decision on that issue.
 */
/**
 * @module TotpEnrolmentPanel.messages
 * @purpose English/Dutch strings for the two-step sign-in (TOTP) enrolment panel: the setup steps, the QR code and manual key, the code and password errors, the recovery-code screen and the success message.
 * @conventions Co-located i18n file exporting `{ en, nl }`, consumed by `TotpEnrolmentPanel.tsx` via `useMessages(totpEnrolmentPanelMessages)`; `nl` is typed as `typeof en`, so both locales have the same keys.
 * @exports totpEnrolmentPanelMessages
 */
const en = {
  title: 'Two-step sign-in',
  intro:
    "Add a code from an authenticator app to your sign-in. You'll need your password and the app each time you sign in.",
  passwordLabel: 'Current password',
  start: 'Set up',
  scanStep: 'Scan this QR code with your authenticator app, or enter the key by hand.',
  qrAlt: 'QR code for your authenticator app',
  manualKeyLabel: 'Key',
  openInApp: 'Open in authenticator app',
  codeLabel: '6-digit code from the app',
  confirm: 'Confirm',
  wrongCode: "That code didn't match. Check the time on your device and try the newest code.",
  wrongPassword: "That password isn't right.",
  throttled: 'Too many attempts. Try again in a few minutes.',
  recoveryTitle: 'Save your recovery codes',
  recoveryWarning:
    'Each code works once, if you lose your authenticator app. They are shown only now: store them somewhere safe.',
  copyCodes: 'Copy codes',
  downloadCodes: 'Download as text file',
  savedThem: "I've saved them",
  enabled: 'Two-step sign-in is on. Other devices have been signed out.',
};

const nl: typeof en = {
  title: 'Inloggen in twee stappen',
  intro:
    'Voeg een code uit een authenticator-app toe aan het inloggen. Je hebt dan elke keer je wachtwoord en de app nodig.',
  passwordLabel: 'Huidig wachtwoord',
  start: 'Instellen',
  scanStep: 'Scan deze QR-code met je authenticator-app, of voer de sleutel met de hand in.',
  qrAlt: 'QR-code voor je authenticator-app',
  manualKeyLabel: 'Sleutel',
  openInApp: 'Openen in authenticator-app',
  codeLabel: 'Code van 6 cijfers uit de app',
  confirm: 'Bevestigen',
  wrongCode: 'Die code klopt niet. Controleer de tijd op je apparaat en probeer de nieuwste code.',
  wrongPassword: 'Dat wachtwoord klopt niet.',
  throttled: 'Te veel pogingen. Probeer het over een paar minuten opnieuw.',
  recoveryTitle: 'Bewaar je herstelcodes',
  recoveryWarning:
    'Elke code werkt één keer, als je je authenticator-app kwijt bent. Ze worden alleen nu getoond: bewaar ze op een veilige plek.',
  copyCodes: 'Codes kopiëren',
  downloadCodes: 'Downloaden als tekstbestand',
  savedThem: 'Ik heb ze bewaard',
  enabled: 'Inloggen in twee stappen staat aan. Andere apparaten zijn uitgelogd.',
};

export const totpEnrolmentPanelMessages = { en, nl };
