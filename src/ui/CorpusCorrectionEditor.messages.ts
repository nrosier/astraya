/**
 * Message catalogue for `CorpusCorrectionEditor.tsx` (#1338).
 */
/**
 * @module CorpusCorrectionEditor.messages
 * @purpose English/Dutch message catalogue for the editor in which a reader corrects the text of an interpretation entry.
 * @conventions Co-located i18n file exporting `{ en, nl }`, consumed via `useMessages()` by `CorpusCorrectionEditor.tsx` and `ReportView.tsx`; refusal codes from `store/corpus-corrections` are worded here.
 * @exports corpusCorrectionMessages
 */
const en = {
  editAction: 'Edit',
  editActionLabel: (what: string) => `Edit this text: ${what}`,
  editedBadge: 'Edited by you',
  suggestAction: 'Suggest to the admins',
  suggestActionLabel: (what: string) => `Suggest this text to the admins: ${what}`,
  suggestHeading: 'Suggest a correction',
  suggestTextLabel: 'Your suggested text',
  suggestHelp:
    'The admins read your suggestion and decide whether to use it. Nothing changes for anyone else until they approve it. Only this text is sent, nothing about you or your charts.',
  licenceNotice:
    'If your text is used, it becomes public under the project licence (AGPL-3.0). Only send text you wrote yourself.',
  licenceAccept: 'I agree that this text becomes public under the project licence.',
  licenceRequired: 'Tick the box to agree before you send.',
  submit: 'Send',
  submitting: 'Sending…',
  submitted: 'Thank you. Your suggestion is now with the admins.',
  submitClose: 'Close',
  pendingLimit: 'You already have 5 suggestions waiting for review. Wait until the admins have looked at them.',
  dailyLimit: 'You have reached the limit of 20 suggestions today. Try again tomorrow.',
  submitFailed: (message: string) => `Could not send your suggestion: ${message}`,
  heading: 'Correct this text',
  closeLabel: 'Close without saving',
  textLabel: 'Your version of this text',
  help: 'Only you see your version. It is saved on this device and, when you are signed in, on your other devices. It does not change the text for anyone else.',
  defaultTextLabel: 'Original text',
  save: 'Save',
  saving: 'Saving…',
  cancel: 'Cancel',
  reset: 'Reset to original',
  empty: 'Write some text, or use Reset to go back to the original.',
  tooShort: 'This text is too short. Write at least 40 characters.',
  tooLong: 'This text is too long. Use at most 1600 characters.',
  markup: 'Remove the HTML tags. Plain text only.',
  link: 'Remove the web address. Links are not allowed.',
  invalid: 'This text cannot be saved.',
  saveFailed: (message: string) => `Could not save your version: ${message}`,
  changedDefault: 'The original text has changed since you wrote your version. Yours is still shown.',
};

const nl: typeof en = {
  editAction: 'Bewerken',
  editActionLabel: (what: string) => `Deze tekst bewerken: ${what}`,
  editedBadge: 'Door jou aangepast',
  suggestAction: 'Stel voor aan de beheerders',
  suggestActionLabel: (what: string) => `Deze tekst voorstellen aan de beheerders: ${what}`,
  suggestHeading: 'Verbetering voorstellen',
  suggestTextLabel: 'Jouw voorgestelde tekst',
  suggestHelp:
    'De beheerders lezen je voorstel en kiezen of het wordt overgenomen. Er verandert niets voor anderen totdat zij het goedkeuren. Alleen deze tekst wordt verstuurd, geen gegevens over jou of je kaarten.',
  licenceNotice:
    'Als je tekst wordt overgenomen, wordt die openbaar onder de licentie van het project (AGPL-3.0). Verstuur alleen tekst die je zelf hebt geschreven.',
  licenceAccept: 'Ik ga ermee akkoord dat de tekst openbaar wordt onder de licentie van het project.',
  licenceRequired: 'Vink het vakje aan om akkoord te gaan voordat je verstuurt.',
  submit: 'Versturen',
  submitting: 'Versturen…',
  submitted: 'Bedankt. Je voorstel ligt nu bij de beheerders.',
  submitClose: 'Sluiten',
  pendingLimit: 'Je hebt al 5 voorstellen die op beoordeling wachten. Wacht tot de beheerders ze hebben bekeken.',
  dailyLimit: 'Je hebt vandaag het maximum van 20 voorstellen bereikt. Probeer het morgen opnieuw.',
  submitFailed: (message: string) => `Je voorstel kon niet worden verstuurd: ${message}`,
  heading: 'Deze tekst verbeteren',
  closeLabel: 'Sluiten zonder opslaan',
  textLabel: 'Jouw versie van deze tekst',
  help: 'Alleen jij ziet jouw versie. Die wordt op dit apparaat bewaard en, als je bent aangemeld, ook op je andere apparaten. De tekst verandert niet voor anderen.',
  defaultTextLabel: 'Oorspronkelijke tekst',
  save: 'Opslaan',
  saving: 'Opslaan…',
  cancel: 'Annuleren',
  reset: 'Terug naar het origineel',
  empty: 'Schrijf een tekst, of kies Terug naar het origineel.',
  tooShort: 'Deze tekst is te kort. Schrijf minstens 40 tekens.',
  tooLong: 'Deze tekst is te lang. Gebruik hoogstens 1600 tekens.',
  markup: 'Haal de HTML-tags weg. Alleen gewone tekst.',
  link: 'Haal het webadres weg. Links zijn niet toegestaan.',
  invalid: 'Deze tekst kan niet worden opgeslagen.',
  saveFailed: (message: string) => `Je versie kon niet worden opgeslagen: ${message}`,
  changedDefault: 'De oorspronkelijke tekst is veranderd sinds je jouw versie schreef. Jouw versie blijft zichtbaar.',
};

export const corpusCorrectionMessages = { en, nl };
