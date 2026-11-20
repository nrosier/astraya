/**
 * The text a calculation screen shows for an error (#1856): an engine abort the client recovered from reads as the
 * localised restart sentence, never the raw Emscripten "Aborted(...)/-sASSERTIONS" text; any other error keeps its own
 * message.
 */
import { describe, expect, it } from 'vitest';
import { EphemerisEngineRestartedError } from '../src/ephemeris/client.js';
import { calculationErrorText } from '../src/ui/engine-error.js';
import { engineErrorMessages } from '../src/ui/engine-error.messages.js';

describe('calculationErrorText (#1856)', () => {
  it('shows the restart sentence for an engine restart, in English and Dutch', () => {
    const error = new EphemerisEngineRestartedError();
    expect(calculationErrorText(error, engineErrorMessages.en)).toBe(engineErrorMessages.en.restarted);
    expect(calculationErrorText(error, engineErrorMessages.nl)).toBe(
      'De rekenmotor stopte onverwacht en is opnieuw gestart. Probeer het nog eens.',
    );
    expect(calculationErrorText(error, engineErrorMessages.en)).not.toMatch(/Aborted|ASSERTIONS/);
  });

  it('keeps any other error message as it is', () => {
    expect(calculationErrorText(new Error('Unknown body "x"'), engineErrorMessages.en)).toBe('Unknown body "x"');
    expect(calculationErrorText('plain', engineErrorMessages.en)).toBe('plain');
  });

  it('has the same keys in both locales', () => {
    expect(Object.keys(engineErrorMessages.nl)).toEqual(Object.keys(engineErrorMessages.en));
  });
});
