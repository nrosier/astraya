/**
 * One-time move of the device's chart settings onto the people that already exist (#806).
 *
 * Chart settings used to be device-wide; they are now a `calculationSettings` register on each person.
 * Without this, every existing person would silently start from the device default, which is the same
 * value only for as long as nobody changes it. Stamping it once keeps each person's chart exactly as
 * it was drawn before the move.
 *
 * Rulership followed in a second move (#806): it is its own `rulership` register, so a person's chart keeps the
 * rulers the device used to draw it with. It is staged separately because devices that already ran the first
 * move must still run this one.
 */
/**
 * @module domain/calculation-settings-migration
 * @purpose Pure staging of the one-time migrations (#806) that copy the device's saved chart settings, and then its planetary-ruler choice, onto each existing person lacking their own.
 * @conventions Never overwrites: a person who already has a `calculationSettings` register, readable or not, is skipped, so a setting chosen on another device (or one this build cannot read) is never replaced; the rulership move likewise skips a person with a `rulership` register and, because a person cannot say which of their registers was unreadable, anyone flagged unreadable; returns mutations only, the caller commits them once and records the once-only guard.
 * @exports stageCalculationSettingsMigration, stageRulershipMigration
 */
import type { RulershipChoice } from '../astrology/rulership.js';
import type { ExtendedSettings } from '../chart/extended-settings.js';
import type { Mutation } from '../store/oplog.js';
import { serializeCalculationSettings, serializeRulership, type Person } from './person.js';

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

/** Stamps the device's ruler choice onto each existing person with no `rulership` register of their own. */
export function stageRulershipMigration(
  people: Iterable<Person>,
  rulership: RulershipChoice,
  registerExists: (personId: string) => boolean = () => false,
): Mutation[] {
  const value = serializeRulership(rulership);
  const mutations: Mutation[] = [];
  for (const person of people) {
    if (person.rulership !== undefined || person.calculationSettingsUnreadable === true) continue;
    if (registerExists(person.id)) continue;
    mutations.push({ entity: 'person', entityId: person.id, field: 'rulership', value });
  }
  return mutations;
}
