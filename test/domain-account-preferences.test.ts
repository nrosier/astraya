/**
 * Typed reading and the sign-in reconciliation plan of the account preferences (#1066, ADR 0004 sections 2.2 and 3.6,
 * test 7's pure matrix): candidate absent, account unset, equal, candidate older, candidate newer, age unknown, an
 * explicit reset on the account, unreadable values on either side, and how the reader's answers become writes.
 */
import { describe, expect, it } from 'vitest';
import { DEFAULT_EXTENDED_SETTINGS } from '../src/chart/extended-settings.js';
import {
  canonicalJson,
  planReconcile,
  readAccountPreferences,
  resolutionWrites,
  serializeAccountValue,
} from '../src/domain/account-preferences.js';
import { ACCOUNT_ENTITY, ACCOUNT_ENTITY_ID, type AccountRegisters } from '../src/store/account.js';
import { encodeHlc } from '../src/store/hlc.js';

const NODE = 'a1b2c3d4e5f60718';
const hlc = (millis: number): string => encodeHlc({ millis, counter: 0, nodeId: NODE });
const OLD = hlc(1_000);
const NEW = hlc(2_000);

const write = (field: string, value: unknown) => ({
  entity: ACCOUNT_ENTITY,
  entityId: ACCOUNT_ENTITY_ID,
  field,
  value,
});

describe('reading the account preferences (#1066)', () => {
  it('tells unset, an explicit reset, a value and an unreadable value apart', () => {
    const registers: AccountRegisters = {
      locale: { value: 'nl', hlc: OLD },
      defaultRulership: { value: null, hlc: OLD },
      defaultCalculationProfile: { value: { version: 99, settings: {} }, hlc: NEW },
    };
    const read = readAccountPreferences(registers);
    expect(read.locale).toEqual({ kind: 'value', value: 'nl', hlc: OLD });
    expect(read.defaultRulership).toEqual({ kind: 'default', hlc: OLD });
    expect(read.defaultCalculationProfile).toEqual({ kind: 'unreadable', hlc: NEW });
    expect(readAccountPreferences({}).locale).toEqual({ kind: 'unset' });
  });

  it('never repairs an unreadable value with a default', () => {
    for (const value of ['fr', 'EN', 1, { en: true }]) {
      expect(readAccountPreferences({ locale: { value, hlc: OLD } }).locale.kind).toBe('unreadable');
    }
    expect(readAccountPreferences({ defaultRulership: { value: 'vedic', hlc: OLD } }).defaultRulership.kind).toBe(
      'unreadable',
    );
  });

  it('round-trips a calculation profile in the shape a person uses', () => {
    const value = serializeAccountValue('defaultCalculationProfile', DEFAULT_EXTENDED_SETTINGS);
    const read = readAccountPreferences({ defaultCalculationProfile: { value, hlc: OLD } }).defaultCalculationProfile;
    expect(read.kind === 'value' ? read.value : undefined).toEqual(DEFAULT_EXTENDED_SETTINGS);
  });

  it('compares values whatever their key order', () => {
    expect(canonicalJson({ b: 1, a: [1, { d: 2, c: 3 }] })).toBe(canonicalJson({ a: [1, { c: 3, d: 2 }], b: 1 }));
  });
});

describe('the reconciliation plan (#1066, test 7)', () => {
  it('does nothing for an absent, reset or unreadable candidate (rule 1)', () => {
    const plan = planReconcile(
      { locale: { value: null, hlc: NEW }, defaultRulership: { value: 'vedic', hlc: NEW } },
      { locale: { value: 'en', hlc: OLD } },
    );
    expect(plan).toEqual({ writes: [], proposals: [] });
  });

  it('writes a candidate where the account never wrote the field (rule 2)', () => {
    const plan = planReconcile({ locale: { value: 'nl', hlc: NEW }, defaultRulership: { value: 'both' } }, {});
    expect(plan.writes).toEqual([write('locale', 'nl'), write('defaultRulership', 'both')]);
    expect(plan.proposals).toEqual([]);
  });

  it('treats an explicit reset on the account as a choice, not as unset (rule 2, db-integrity finding 5)', () => {
    const plan = planReconcile({ locale: { value: 'nl', hlc: NEW } }, { locale: { value: null, hlc: OLD } });
    expect(plan.writes).toEqual([]);
    expect(plan.proposals).toEqual([{ field: 'locale', deviceValue: 'nl', accountValue: null }]);
    // Older than the reset: the account's reset stands.
    expect(planReconcile({ locale: { value: 'nl', hlc: OLD } }, { locale: { value: null, hlc: NEW } })).toEqual({
      writes: [],
      proposals: [],
    });
  });

  it('does nothing when the values are equal (rule 3)', () => {
    const profile = serializeAccountValue('defaultCalculationProfile', DEFAULT_EXTENDED_SETTINGS);
    const plan = planReconcile(
      { locale: { value: 'nl' }, defaultCalculationProfile: { value: profile, hlc: NEW } },
      { locale: { value: 'nl', hlc: OLD }, defaultCalculationProfile: { value: profile, hlc: OLD } },
    );
    expect(plan).toEqual({ writes: [], proposals: [] });
  });

  it('keeps the account’s value when the candidate is older (rule 4)', () => {
    expect(planReconcile({ locale: { value: 'nl', hlc: OLD } }, { locale: { value: 'en', hlc: NEW } })).toEqual({
      writes: [],
      proposals: [],
    });
  });

  it('asks about a newer candidate and one of unknown age, never overwriting silently (rule 5)', () => {
    const plan = planReconcile(
      { locale: { value: 'nl', hlc: NEW }, defaultRulership: { value: 'traditional' } },
      { locale: { value: 'en', hlc: OLD }, defaultRulership: { value: 'modern', hlc: NEW } },
    );
    expect(plan.writes).toEqual([]);
    expect(plan.proposals).toEqual([
      { field: 'locale', deviceValue: 'nl', accountValue: 'en' },
      { field: 'defaultRulership', deviceValue: 'traditional', accountValue: 'modern' },
    ]);
  });

  it('offers a readable device value against an unreadable account value, flagged as unreadable rather than shown as a choice', () => {
    const plan = planReconcile({ locale: { value: 'nl' } }, { locale: { value: 'fr', hlc: OLD } });
    expect(plan.proposals).toEqual([
      { field: 'locale', deviceValue: 'nl', accountValue: null, accountUnreadable: true },
    ]);
  });

  it('writes only the settings where the reader chose this device', () => {
    const proposals = [
      { field: 'locale', deviceValue: 'nl', accountValue: 'en' },
      { field: 'defaultRulership', deviceValue: 'both', accountValue: 'modern' },
    ] as const;
    expect(
      resolutionWrites(proposals, [
        { field: 'locale', use: 'device' },
        { field: 'defaultRulership', use: 'account' },
      ]),
    ).toEqual([write('locale', 'nl')]);
    // Dismissing answers "Use my account's" for every setting.
    expect(resolutionWrites(proposals, [])).toEqual([]);
  });
});

describe('the orb library and the saved transit filters (#1220)', () => {
  const profile = {
    id: 'house-style',
    name: 'House style',
    revision: 1,
    scalePercent: -10,
    aspectOrbs: { trine: { base: 6, luminaryBonus: 1 } },
    bodyOrbs: {},
  };
  const library = { version: 1, profiles: [profile] };

  it('reads each new field as a value, an explicit reset or an unreadable value', () => {
    const read = readAccountPreferences({
      orbLibrary: { value: library, hlc: OLD },
      orbContextSource: { value: null, hlc: OLD },
      transitFilterDaily: { value: { version: 1, preset: 'outer' }, hlc: NEW },
      transitFilterYearly: { value: { version: 1, preset: 'nope' }, hlc: NEW },
    });
    expect(read.orbLibrary).toEqual({ kind: 'value', value: { profiles: [profile] }, hlc: OLD });
    expect(read.orbContextSource).toEqual({ kind: 'default', hlc: OLD });
    expect(read.transitFilterDaily).toEqual({ kind: 'value', value: { preset: 'outer' }, hlc: NEW });
    expect(read.transitFilterYearly).toEqual({ kind: 'unreadable', hlc: NEW });
  });

  it('does not read a library with a bad profile: it stays unreadable, never repaired', () => {
    const read = readAccountPreferences({
      orbLibrary: { value: { version: 1, profiles: [profile, { ...profile, id: 'bad', revision: 0 }] }, hlc: NEW },
    });
    expect(read.orbLibrary).toEqual({ kind: 'unreadable', hlc: NEW });
  });

  it('reads a value of a version it does not know, or of none, as unreadable, so it is never rewritten without the parts it cannot see', () => {
    const unknown = {
      orbLibrary: { value: { version: 2, profiles: [profile], colour: 'red' }, hlc: NEW },
      orbContextSource: { value: { version: 2, transit: 'house-style', progressed: 'x' }, hlc: NEW },
      transitFilterDaily: { value: { version: 2, preset: 'outer' }, hlc: NEW },
      transitFilterYearly: { value: { preset: 'outer' }, hlc: NEW },
    };
    const read = readAccountPreferences(unknown);
    for (const field of ['orbLibrary', 'orbContextSource', 'transitFilterDaily', 'transitFilterYearly'] as const) {
      expect(read[field], field).toEqual({ kind: 'unreadable', hlc: NEW });
    }
  });

  it('writes each value under its version, as plain JSON that reads back the same', () => {
    expect(serializeAccountValue('orbLibrary', { profiles: [profile] })).toEqual(library);
    expect(serializeAccountValue('orbContextSource', { transit: 'house-style' })).toEqual({
      version: 1,
      transit: 'house-style',
    });
    expect(serializeAccountValue('transitFilterDaily', { preset: 'all' })).toEqual({ version: 1, preset: 'all' });
    const read = readAccountPreferences({
      orbLibrary: { value: serializeAccountValue('orbLibrary', { profiles: [profile] }), hlc: OLD },
    });
    expect(read.orbLibrary).toEqual({ kind: 'value', value: { profiles: [profile] }, hlc: OLD });
  });

  it('refuses to write a value that is not JSON, instead of letting a NaN become a null', () => {
    const bad = { profiles: [{ ...profile, scalePercent: Number.NaN }] };
    expect(() => serializeAccountValue('orbLibrary', bad)).toThrow(/not a JSON value/);
  });

  it('offers a differing library for the reader to choose, and writes one the account never had', () => {
    expect(planReconcile({ orbLibrary: { value: library } }, {}).writes).toEqual([write('orbLibrary', library)]);
    const other = { version: 1, profiles: [{ ...profile, name: 'Another' }] };
    const plan = planReconcile({ orbLibrary: { value: library } }, { orbLibrary: { value: other, hlc: OLD } });
    expect(plan.proposals).toEqual([{ field: 'orbLibrary', deviceValue: library, accountValue: other }]);
    // Equal values, whatever the key order, offer nothing.
    const same = {
      profiles: [
        {
          bodyOrbs: profile.bodyOrbs,
          aspectOrbs: profile.aspectOrbs,
          scalePercent: profile.scalePercent,
          revision: profile.revision,
          name: profile.name,
          id: profile.id,
        },
      ],
      version: 1,
    };
    expect(
      planReconcile({ orbLibrary: { value: same } }, { orbLibrary: { value: library, hlc: OLD } }).proposals,
    ).toEqual([]);
  });

  it('says when the account holds a value this build cannot read, instead of showing it as the default', () => {
    const newer = { version: 2, profiles: [] };
    const plan = planReconcile({ orbLibrary: { value: library } }, { orbLibrary: { value: newer, hlc: NEW } });
    expect(plan.proposals).toEqual([
      { field: 'orbLibrary', deviceValue: library, accountValue: null, accountUnreadable: true },
    ]);
    // An explicit reset is a reset, not an unreadable value.
    const reset = planReconcile({ orbLibrary: { value: library } }, { orbLibrary: { value: null, hlc: NEW } });
    expect(reset.proposals).toEqual([{ field: 'orbLibrary', deviceValue: library, accountValue: null }]);
  });

  it('does not offer an unreadable candidate for a new field', () => {
    const plan = planReconcile({ transitFilterDaily: { value: { version: 1, preset: 'nope' } } }, {});
    expect(plan).toEqual({ writes: [], proposals: [] });
  });
});
