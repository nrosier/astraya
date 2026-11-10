/** Category names for life events (#1439), shared by the drawer, the card and the pickers. */
/**
 * @module ui/LifeEventCategories.messages
 * @purpose English/Dutch names of the fixed life-event categories.
 * @conventions Co-located i18n file exporting `{ en, nl }`; keyed by `LifeEventCategory`, so a category without a name in either locale is a compile error.
 * @exports lifeEventCategoryMessages
 */
import type { LifeEventCategory } from '../domain/life-events.js';

const en: Readonly<Record<LifeEventCategory, string>> = {
  marriage: 'Marriage',
  career: 'Career',
  relocation: 'Relocation',
  health: 'Health',
  bereavement: 'Bereavement',
  financial: 'Financial',
  other: 'Other',
};

const nl: Readonly<Record<LifeEventCategory, string>> = {
  marriage: 'Huwelijk',
  career: 'Carrière',
  relocation: 'Verhuizing',
  health: 'Gezondheid',
  bereavement: 'Overlijden',
  financial: 'Financieel',
  other: 'Overig',
};

export const lifeEventCategoryMessages = { en, nl };
