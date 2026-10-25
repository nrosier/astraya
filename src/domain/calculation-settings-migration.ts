/**
 * One-time move of the device's chart settings onto the people that already exist (#806).
 *
 * Chart settings used to be device-wide; they are now a `calculationSettings` register on each person.
 * Without this, every existing person would silently start from the device default, which is the same
 * value only for as long as nobody changes it. Stamping it once keeps each person's chart exactly as
 * it was drawn before the move.
 */
/**
 * @module domain/calculation-settings-migration
 * @purpose Pure staging of the one-time migration (#806) that copies the device's saved chart settings onto each existing person lacking their own.
 * @conventions Never overwrites: a person who already has a `calculationSettings` register, readable or not, is skipped, so a setting chosen on another device (or one this build cannot read) is never replaced; returns mutations only, the caller commits them once and records the once-only guard.
 * @exports stageCalculationSettingsMigration
 */
import type { ExtendedSettings } from '../chart/extended-settings.js';
import type { Mutation } from '../store/oplog.js';
import { serializeCalculationSettings, type Person } from './person.js';

export function stageCalculationSettingsMigration(
  people: Iterable<Person>,
  settings: ExtendedSettings,
  registerExists: (personId: string) => boolean = () => false,
): Mutation[] {
  const value = serializeCalculationSettings(settings);
  const mutations: Mutation[] = [];
  for (const person of people) {
    if (person.calculationSettings !== undefined || person.calculationSettingsUnreadable === true) continue;
    if (registerExists(person.id)) continue;
    mutations.push({ entity: 'person', entityId: person.id, field: 'calculationSettings', value });
  }
  return mutations;
}
