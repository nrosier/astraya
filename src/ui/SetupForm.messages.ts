/**
 * Message catalogue for `SetupForm.tsx` (#158).
 */
/**
 * @module SetupForm.messages
 * @purpose English/Dutch message catalogue for the first-boot admin-account bootstrap form.
 * @conventions Co-located i18n file exporting `{ en, nl }`, consumed via `useMessages()` by the sibling `SetupForm.tsx`.
 * @exports setupFormMessages
 */
const en = {
  heading: 'Create the admin account',
  missingToken:
    'This link is missing its token, so it cannot be used. Check the server log for the current one — it expires 15 minutes after the server starts.',

  passwordLabel: 'Password',
  submitButton: 'Create admin account',
};

const nl: typeof en = {
  heading: 'Maak het beheerdersaccount aan',
  missingToken:
    'Deze link mist zijn token en kan daarom niet worden gebruikt. Bekijk het serverlog voor de huidige — die verloopt 15 minuten na het starten van de server.',

  passwordLabel: 'Wachtwoord',
  submitButton: 'Beheerdersaccount aanmaken',
};

export const setupFormMessages = { en, nl };
