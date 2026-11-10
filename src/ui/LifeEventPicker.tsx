/**
 * A select listing a person's stored life events, so a date can be set from one without retyping (#1399, slice S5).
 */
/**
 * @module ui/LifeEventPicker
 * @purpose Life-event picker beside a screen's date field: lists the stored events in display order, optionally narrowed to one or more categories (#1439), and reports the one chosen.
 * @conventions Renders nothing when the person has no readable events; the select returns to its placeholder after a pick, so the same event can be picked again; the category filter appears only when at least one event has a category, lists only the categories in use, starts with all of them chosen (which also keeps events without a category), and is a Disclosure with a shown-of-total summary; uses LifeEventPicker.messages.ts via useMessages().
 * @exports LifeEventPicker
 */
import { useState } from 'react';
import {
  LIFE_EVENT_CATEGORIES,
  filterLifeEventsByCategories,
  lifeEventPickerOptions,
  type LifeEvent,
  type LifeEventCategory,
} from '../domain/life-events.js';
import { useMessages } from './messages.js';
import { lifeEventCategoryMessages } from './LifeEventCategories.messages.js';
import { lifeEventPickerMessages } from './LifeEventPicker.messages.js';
import { Button } from './primitives/Button.js';
import { Checkbox } from './primitives/Checkbox.js';
import { Disclosure } from './primitives/Disclosure.js';
import { Select } from './primitives/Select.js';

export function LifeEventPicker({
  events,
  onPick,
}: {
  readonly events: readonly LifeEvent[] | undefined;
  readonly onPick: (event: LifeEvent) => void;
}): React.JSX.Element | null {
  const t = useMessages(lifeEventPickerMessages);
  const names = useMessages(lifeEventCategoryMessages);
  // `undefined` is the default: every category.
  const [chosen, setChosen] = useState<ReadonlySet<LifeEventCategory> | undefined>(undefined);
  if (events === undefined || events.length === 0) return null;
  const inUse = LIFE_EVENT_CATEGORIES.filter((category) => events.some((event) => event.category === category));
  const effective = chosen === undefined ? undefined : new Set(inUse.filter((category) => chosen.has(category)));
  const visible = filterLifeEventsByCategories(events, effective);
  const options = lifeEventPickerOptions(visible);
  const toggle = (category: LifeEventCategory, on: boolean): void => {
    const next = new Set(effective ?? inUse);
    if (on) next.add(category);
    else next.delete(category);
    setChosen(next.size === inUse.length ? undefined : next);
  };
  return (
    <div className="life-event-picker">
      <Select
        label={t.label}
        value=""
        options={[
          { value: '', label: effective !== undefined && options.length === 0 ? t.filterEmpty : t.placeholder },
          ...options.map((option) => ({ value: option.id, label: t.option(option.dateLabel, option.label) })),
        ]}
        onChange={(id) => {
          const picked = visible.find((event) => event.id === id);
          if (picked !== undefined) onPick(picked);
        }}
      />
      {inUse.length > 0 && (
        <Disclosure
          title={t.filterTitle}
          summary={t.filterSummary(visible.length, events.length)}
          showLabel={t.filterShow}
          hideLabel={t.filterHide}
        >
          <fieldset className="life-event-picker-filter">
            <legend className="sr-only">{t.filterTitle}</legend>
            {inUse.map((category) => (
              <Checkbox
                key={category}
                label={names[category]}
                checked={effective === undefined || effective.has(category)}
                onChange={(on) => {
                  toggle(category, on);
                }}
              />
            ))}
            <Button
              size="compact"
              disabled={effective === undefined}
              onClick={() => {
                setChosen(undefined);
              }}
            >
              {t.filterAll}
            </Button>
          </fieldset>
        </Disclosure>
      )}
    </div>
  );
}
