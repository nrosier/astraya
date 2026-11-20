/**
 * @module ui/engine-error
 * @purpose Turns an error from an ephemeris calculation into the text a screen shows: the localised restart sentence for an engine abort the client recovered from (#1856), the error's own message otherwise.
 * @conventions Pure: the caller passes its localised `engineErrorMessages` (from `useMessages`), so this stays testable without React. Recognises the restart by the error's `name`, the one `EphemerisEngineRestartedError` sets, rather than by importing the client class into every screen.
 * @exports calculationErrorText
 */
import type { engineErrorMessages } from './engine-error.messages.js';

export function calculationErrorText(error: unknown, t: (typeof engineErrorMessages)['en']): string {
  if (error instanceof Error) return error.name === 'EphemerisEngineRestartedError' ? t.restarted : error.message;
  return String(error);
}
