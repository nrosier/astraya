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

  it('offers a readable device value against an unreadable account value, shown as the default', () => {
    const plan = planReconcile({ locale: { value: 'nl' } }, { locale: { value: 'fr', hlc: OLD } });
    expect(plan.proposals).toEqual([{ field: 'locale', deviceValue: 'nl', accountValue: null }]);
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
