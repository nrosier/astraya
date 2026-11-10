/**
 * A select listing a person's stored life events, so a date can be set from one without retyping (#1399, slice S5).
 */
/**
 * @module ui/LifeEventPicker
 * @purpose Life-event picker beside a screen's date field: lists the stored events in display order and reports the one chosen.
 * @conventions Renders nothing when the person has no readable events; the select returns to its placeholder after a pick, so the same event can be picked again; uses LifeEventPicker.messages.ts via useMessages().
 * @exports LifeEventPicker
 */
import { lifeEventPickerOptions, type LifeEvent } from '../domain/life-events.js';
import { useMessages } from './messages.js';
import { lifeEventPickerMessages } from './LifeEventPicker.messages.js';
import { Select } from './primitives/Select.js';

export function LifeEventPicker({
  events,
  onPick,
}: {
  readonly events: readonly LifeEvent[] | undefined;
  readonly onPick: (event: LifeEvent) => void;
}): React.JSX.Element | null {
  const t = useMessages(lifeEventPickerMessages);
  if (events === undefined || events.length === 0) return null;
  const options = lifeEventPickerOptions(events);
  return (
    <Select
      label={t.label}
      value=""
      options={[
        { value: '', label: t.placeholder },
        ...options.map((option) => ({ value: option.id, label: t.option(option.dateLabel, option.label) })),
      ]}
      onChange={(id) => {
        const picked = events.find((event) => event.id === id);
        if (picked !== undefined) onPick(picked);
      }}
    />
  );
}
