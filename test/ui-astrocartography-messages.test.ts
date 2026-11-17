/**
 * Content check for the nl astrocartography legend (#1649): the Nadir entry reads the Dutch
 * form `IC (Imum Coeli)`, matching the rest of the app. Key parity is covered by `test/i18n-messages.test.ts`.
 */
import { describe, expect, it } from 'vitest';
import { astrocartographyViewMessages } from '../src/ui/AstrocartographyView.messages.js';

describe('astrocartography legend (nl, #1649)', () => {
  it('names the IC line Imum Coeli in Dutch', () => {
    expect(astrocartographyViewMessages.nl.ic).toBe('IC (Imum Coeli)');
  });
});
