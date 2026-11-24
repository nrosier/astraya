// @vitest-environment jsdom
/**
 * The account-delete confirmation names every non-zero stored kind in a stable order (#1960).
 */
import { describe, expect, it } from 'vitest';
import { describeImpact } from '../src/ui/AdminPanel.js';
import { adminPanelMessages } from '../src/ui/AdminPanel.messages.js';
import type { DeletionImpact } from '../src/sync/admin-client.js';

const zero = { people: 0, charts: 0, pins: 0, savedQueries: 0, chartSearches: 0, horaryJudgments: 0 };
const counted = (over: Partial<typeof zero>): DeletionImpact => ({ kind: 'counted', ...zero, ...over });

describe('describeImpact (#1960)', () => {
  it('names every kind in a stable order, in English', () => {
    const line = describeImpact(
      counted({ people: 2, charts: 3, pins: 4, savedQueries: 5, chartSearches: 6, horaryJudgments: 7 }),
      adminPanelMessages.en,
    );
    expect(line).toBe('2 people, 3 charts, 4 pins, 5 saved queries, 6 chart searches and 7 saved judgments');
  });

  it('names every kind in a stable order, in Dutch', () => {
    const line = describeImpact(
      counted({ people: 2, charts: 3, pins: 4, savedQueries: 5, chartSearches: 6, horaryJudgments: 7 }),
      adminPanelMessages.nl,
    );
    expect(line).toBe(
      '2 personen, 3 horoscopen, 4 pins, 5 opgeslagen zoekopdrachten, 6 horoscoopzoekopdrachten en 7 opgeslagen oordelen',
    );
  });

  it('omits zeros and uses the singular for one', () => {
    expect(describeImpact(counted({ people: 1, horaryJudgments: 1 }), adminPanelMessages.en)).toBe(
      '1 person and 1 saved judgment',
    );
    expect(describeImpact(counted({ people: 1, horaryJudgments: 1 }), adminPanelMessages.nl)).toBe(
      '1 persoon en 1 opgeslagen oordeel',
    );
    expect(describeImpact(counted({ chartSearches: 1 }), adminPanelMessages.en)).toBe('1 chart search');
    expect(describeImpact(counted({ pins: 2, savedQueries: 1 }), adminPanelMessages.nl)).toBe(
      '2 pins en 1 opgeslagen zoekopdracht',
    );
  });

  it('says so when nothing is stored, and leaves the approximate branch alone', () => {
    expect(describeImpact(counted({}), adminPanelMessages.en)).toBe('no stored items');
    expect(describeImpact({ kind: 'approximate', opRows: 1 }, adminPanelMessages.en)).toBe(
      '1 stored change (sync is not configured on this server, so an exact count of people/charts is not available)',
    );
  });
});
