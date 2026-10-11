/**
 * Radio option cards for "two to five exclusive choices needing explanation" (#506/#508,
 * `docs/UI-UX_GUIDELINES.md` §6) — a short title plus one concise consequence per choice, the
 * whole card activating its radio. Used for e.g. Planetary rulers (Modern/Traditional/Both).
 */
/**
 * @module ui/primitives/OptionCards
 * @purpose Radio option cards: each a labelled, fully-clickable card with a title and one consequence line, built over a native radiogroup.
 * @conventions role="radiogroup" with an aria-label naming the decision; each card is a <label> wrapping its radio, so the entire card — not just the input — activates it.
 * @exports OptionCards, OptionCardChoice
 */
import { useId } from 'react';

export interface OptionCardChoice {
  readonly value: string;
  readonly title: string;
  readonly consequence: string;
}

export interface OptionCardsProps {
  readonly label: string;
  readonly value: string;
  readonly options: readonly OptionCardChoice[];
  readonly onChange: (value: string) => void;
  readonly disabled?: boolean | undefined;
}

export function OptionCards({ label, value, options, onChange, disabled }: OptionCardsProps): React.JSX.Element {
  const name = useId();
  return (
    <div className="primitive-option-cards" role="radiogroup" aria-label={label}>
      {options.map((option) => (
        <label
          key={option.value}
          className={
            value === option.value ? 'primitive-option-card primitive-option-card-selected' : 'primitive-option-card'
          }
        >
          <input
            type="radio"
            name={name}
            checked={value === option.value}
            disabled={disabled}
            onChange={() => {
              onChange(option.value);
            }}
          />
          <span className="primitive-option-card-title">{option.title}</span>
          <span className="primitive-option-card-consequence">{option.consequence}</span>
        </label>
      ))}
    </div>
  );
}
