// @vitest-environment jsdom
/**
 * The remembered open or closed state of the Advanced groups (#856): a device display preference. Every group starts
 * closed; a malformed stored value reads as all closed; the choice survives a reload; a blocked store still holds it
 * for this page.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  ADVANCED_GROUPS_KEY,
  readOpenAdvancedGroups,
  resetAdvancedGroupsForTests,
  writeAdvancedGroupOpen,
} from '../src/ui/advanced-groups-setting.js';

beforeEach(() => {
  localStorage.clear();
  resetAdvancedGroupsForTests();
});

afterEach(() => {
  vi.restoreAllMocks();
  localStorage.clear();
  resetAdvancedGroupsForTests();
});

describe('the Advanced groups open state', () => {
  it('starts with every group closed', () => {
    expect(readOpenAdvancedGroups()).toEqual([]);
  });

  it('opens and closes one tab at a time, and remembers it in this browser', () => {
    writeAdvancedGroupOpen('bodies', true);
    writeAdvancedGroupOpen('special', true);
    expect(readOpenAdvancedGroups()).toEqual(['bodies', 'special']);
    expect(JSON.parse(localStorage.getItem(ADVANCED_GROUPS_KEY) ?? 'null')).toEqual(['bodies', 'special']);
    writeAdvancedGroupOpen('bodies', false);
    expect(readOpenAdvancedGroups()).toEqual(['special']);
  });

  it('reads the stored choice again after a reload', () => {
    writeAdvancedGroupOpen('profile', true);
    resetAdvancedGroupsForTests();
    expect(readOpenAdvancedGroups()).toEqual(['profile']);
  });

  it('keeps the same snapshot until the stored text changes, so a screen does not re-render for nothing', () => {
    writeAdvancedGroupOpen('profile', true);
    const first = readOpenAdvancedGroups();
    expect(readOpenAdvancedGroups()).toBe(first);
    writeAdvancedGroupOpen('profile', true);
    expect(readOpenAdvancedGroups()).toBe(first);
  });

  it('reads anything malformed or unknown as all closed', () => {
    for (const stored of ['not json', '{"profile":true}', '"bodies"', '[1,2]', '["nope"]', 'null']) {
      localStorage.setItem(ADVANCED_GROUPS_KEY, stored);
      resetAdvancedGroupsForTests();
      expect(readOpenAdvancedGroups(), stored).toEqual([]);
    }
    localStorage.setItem(ADVANCED_GROUPS_KEY, '["bodies","nope","bodies"]');
    resetAdvancedGroupsForTests();
    expect(readOpenAdvancedGroups()).toEqual(['bodies']);
  });

  it('holds a choice for this page when the browser refuses to store it', () => {
    vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
      throw new Error('quota');
    });
    writeAdvancedGroupOpen('special', true);
    expect(readOpenAdvancedGroups()).toEqual(['special']);
  });
});
