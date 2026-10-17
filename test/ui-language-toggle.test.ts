/**
 * The language button shows "EN" / "NL" as its text, so its accessible name must start with that text
 * (WCAG 2.5.3 Label in Name, #644): a speech-control user who says "click EN" has to reach it.
 */
import { describe, expect, it } from 'vitest';
import { languageToggleMessages } from '../src/ui/LanguageToggle.messages.js';

describe('language toggle accessible name', () => {
  it.each([
    ['en', 'EN', 'English'],
    ['nl', 'NL', 'Nederlands'],
  ] as const)('starts with the visible code in %s and still names the language', (locale, code, label) => {
    const name = languageToggleMessages[locale].languageLabel(label, code);
    expect(name.startsWith(code)).toBe(true);
    expect(name).toContain(label);
  });
});
