/**
 * Content checks for `PreferencesView.messages.ts`'s restore strings (#587) that key-parity and
 * compile-time checks (`test/i18n-messages.test.ts`, `nl: typeof en`) can't catch: whether the
 * actual wording is right, not just whether both locales have the same keys and shapes.
 */
import { describe, expect, it } from 'vitest';
import { preferencesViewMessages } from '../src/ui/PreferencesView.messages.js';

describe('restoreConfirm/restoreApplied pluralization', () => {
  it('English: "person" for one, "people" for more than one', () => {
    expect(preferencesViewMessages.en.restoreConfirm(1, 0, 0)).toMatch(/1 new person\b/);
    expect(preferencesViewMessages.en.restoreConfirm(2, 0, 0)).toMatch(/2 new people\b/);
    expect(preferencesViewMessages.en.restoreConfirm(0, 1, 0)).toMatch(/1 existing person\b/);
    expect(preferencesViewMessages.en.restoreConfirm(0, 2, 0)).toMatch(/2 existing people\b/);
  });

  it('Dutch: "persoon" for one, "personen" for more than one', () => {
    expect(preferencesViewMessages.nl.restoreConfirm(1, 0, 0)).toMatch(/1 nieuwe persoon\b/);
    expect(preferencesViewMessages.nl.restoreConfirm(2, 0, 0)).toMatch(/2 nieuwe personen\b/);
    expect(preferencesViewMessages.nl.restoreConfirm(0, 1, 0)).toMatch(/1 bestaande persoon\b/);
    expect(preferencesViewMessages.nl.restoreConfirm(0, 2, 0)).toMatch(/2 bestaande personen\b/);
  });

  it('a nonzero deletedLocallyCount both folds into the "existing" count and names itself', () => {
    const text = preferencesViewMessages.en.restoreConfirm(0, 1, 1);
    expect(text).toMatch(/2 existing people\b/); // updated + deletedLocally
    expect(text).toContain('deleted on this device');
  });
});

describe('restoreStatusWord labels every status in both locales', () => {
  it('each status has its own non-English-coincidence Dutch word', () => {
    for (const status of ['new', 'updated', 'unchanged', 'deletedLocally'] as const) {
      expect(preferencesViewMessages.en.restoreStatusWord[status]).toBeTruthy();
      expect(preferencesViewMessages.nl.restoreStatusWord[status]).toBeTruthy();
      expect(preferencesViewMessages.nl.restoreStatusWord[status]).not.toBe(
        preferencesViewMessages.en.restoreStatusWord[status],
      );
    }
  });
});
