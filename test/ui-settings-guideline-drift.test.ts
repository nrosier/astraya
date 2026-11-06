/**
 * Drift guard for the device-settings list (#1165). `docs/ui/UI-UX_GUIDELINES.md` §3.3 names the
 * choices that belong to device scope in plain prose. The registry (`settings-registry.ts`) is
 * the source for which keys are device-scoped. This test fails when the two disagree:
 *
 * - a device-scoped registry key has no §3.3 bullet (via the explicit phrase map) and is not on
 *   the allowlist;
 * - an allowlisted key is no longer a device-scoped registry key (stale allowlist);
 * - a phrase-map key names a §3.3 bullet that does not exist.
 *
 * §3.3 wording is not generated or edited here. The phrase map is explicit on purpose, so a
 * reader can see which bullet each key maps to.
 */
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import { SETTINGS } from '../src/ui/settings-registry.js';

const guidelines = readFileSync(resolve(import.meta.dirname, '../docs/ui/UI-UX_GUIDELINES.md'), 'utf8');

/** The §3.3 section body: from its heading up to the next `###` heading. */
function section33(text: string): string {
  const start = text.search(/^### 3\.3 /m);
  if (start < 0) throw new Error('§3.3 heading not found in UI-UX_GUIDELINES.md');
  const rest = text.slice(start + 1);
  const next = rest.search(/^### /m);
  return next < 0 ? text.slice(start) : text.slice(start, start + 1 + next);
}

/** The bullet lines of §3.3, lowercased for phrase matching. */
const bullets33 = section33(guidelines)
  .split('\n')
  .filter((line) => line.startsWith('- '))
  .map((line) => line.toLowerCase());

/**
 * Registry key -> the plain §3.3 phrase that documents it. The phrase must appear in one of the
 * §3.3 bullets (case-insensitive).
 */
const PHRASE_MAP: Readonly<Record<string, string>> = {
  'astraya.theme': 'system/light/dark theme',
  'astraya.motion': 'reduced motion',
  'astraya.density': 'interface density',
  'astraya:symbolClass': 'drawn, unicode, or text symbols',
  'astraya:glyphWeight': 'glyph weight',
  'astraya:glyphVariants': 'uranus/pluto variants',
  'astraya:advancedGroups': 'advanced groups of the extended settings drawer',
};

/**
 * Device-scoped keys with no §3.3 bullet. Each needs a reason. §3.3 wording is not changed to
 * cover them.
 */
const ALLOWLIST: Readonly<Record<string, string>> = {
  // The last-opened person is a device-local pointer (which person this device reopens), not a
  // user preference that §3.3 lists.
  'astraya:lastPersonId': 'device-local pointer to the last-opened person, not a §3.3 preference',
  // The workspace rail state is a layout memory for this screen, not a §3.3 preference.
  'astraya:workspaceRailCollapsed': 'layout memory for the workspace rail, not listed in §3.3',
  // §3.1 (around line 207) names the degree-symbol display as a user or device preference, citing
  // §3.2 and §3.3. §3.3 itself does not list it.
  'astraya:showDegreeSymbol': 'degree-symbol display: §3.1 names it a device preference; §3.3 does not list it',
};

const deviceKeys = SETTINGS.filter((setting) => setting.scope === 'device').map((setting) => setting.key);

/** True when some §3.3 bullet documents the phrase. */
function bulletDocuments(phrase: string): boolean {
  return bullets33.some((bullet) => bullet.includes(phrase));
}

describe('§3.3 device preferences versus the settings registry (#1165)', () => {
  it('every device-scoped registry key is documented by a §3.3 bullet or allowlisted with a reason', () => {
    const unmatched = deviceKeys.filter((key) => {
      const phrase = PHRASE_MAP[key];
      const matched = phrase !== undefined && bulletDocuments(phrase);
      return !matched && !(key in ALLOWLIST);
    });
    expect(unmatched).toEqual([]);
  });

  it('every allowlisted key still exists as a device-scoped registry key (no stale allowlist)', () => {
    const stale = Object.keys(ALLOWLIST).filter((key) => !deviceKeys.includes(key));
    expect(stale).toEqual([]);
  });

  it('every phrase-map key has a matching §3.3 bullet', () => {
    const missingBullet = Object.entries(PHRASE_MAP)
      .filter(([, phrase]) => !bulletDocuments(phrase))
      .map(([key]) => key);
    expect(missingBullet).toEqual([]);
  });

  it('no key is both phrase-mapped and allowlisted', () => {
    const both = Object.keys(PHRASE_MAP).filter((key) => key in ALLOWLIST);
    expect(both).toEqual([]);
  });
});
