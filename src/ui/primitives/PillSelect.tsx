/**
 * A single-choice control drawn as a pill that opens a small card of radio buttons (#1545), for
 * the chart toolbar's chart-type and preset choices where a native `<select>` is too wide and
 * does not show the owner's inline label beside the value.
 *
 * The card is a non-modal `role="dialog"` holding one `role="radiogroup"` of custom radio
 * buttons. The radios are deliberately not the shared `Radio`/`ChoiceGroup` pair: a native
 * radio fires `change` on every arrow key, so the card would commit and close while the user is
 * still choosing. Here arrows only move focus; Enter, Space or a click commits.
 */
/**
 * @module ui/primitives/PillSelect
 * @purpose Shared single-choice pill that opens a radio card (#1545): one open card at a time, Escape and outside-press close it, choosing an option commits and returns focus to the pill.
 * @conventions Custom radios with a roving tabindex (arrows move focus only, Enter/Space/click commit); the card is non-modal and labelled by the visible label; open/close rules come from the shared exclusive-open hook, one instance per control.
 * @exports PillSelect, PillSelectProps
 */
import { useEffect, useId, useRef, type JSX } from 'react';
import { useExclusiveOpen } from '../use-exclusive-open.js';
import type { SelectOption } from './Select.js';

export interface PillSelectProps {
  /** The visible label, drawn before the pill and naming both the pill and its card. */
  readonly label: string;
  readonly value: string;
  readonly options: readonly SelectOption[];
  readonly onChange: (value: string) => void;
  readonly disabled?: boolean | undefined;
  /** Prefix for the generated element ids; defaults to a React id, so two controls never clash. */
  readonly idPrefix?: string | undefined;
  readonly className?: string | undefined;
}

const CARD = 'card';

export function PillSelect({
  label,
  value,
  options,
  onChange,
  disabled,
  idPrefix,
  className,
}: PillSelectProps): JSX.Element {
  const generated = useId();
  const base = idPrefix ?? generated;
  const labelId = `${base}-label`;
  const pillId = `${base}-pill`;
  const cardId = `${base}-card`;
  const groupId = `${base}-radios`;

  const exclusive = useExclusiveOpen<typeof CARD>('');
  const isOpen = exclusive.open === CARD;
  const pill = useRef<HTMLButtonElement | null>(null);
  const radios = useRef<HTMLDivElement | null>(null);

  const current = options.find((option) => option.value === value);
  const enabled = options.filter((option) => option.disabled !== true);
  // Roving tabindex: the checked option is the tab stop; with no checked option, the first enabled one is.
  const tabStop = current !== undefined && current.disabled !== true ? current.value : enabled[0]?.value;

  // Opening the card focuses the checked option so the keyboard starts where the value is.
  useEffect(() => {
    if (!isOpen) return;
    radios.current?.querySelector<HTMLButtonElement>('[role="radio"][tabindex="0"]')?.focus();
  }, [isOpen]);

  const choose = (next: string): void => {
    if (next !== value) onChange(next);
    exclusive.close();
    pill.current?.focus();
  };

  const moveFocus = (event: React.KeyboardEvent<HTMLDivElement>): void => {
    const keys = ['ArrowDown', 'ArrowRight', 'ArrowUp', 'ArrowLeft', 'Home', 'End'];
    if (!keys.includes(event.key)) return;
    const buttons = Array.from(
      radios.current?.querySelectorAll<HTMLButtonElement>('[role="radio"]:not(:disabled)') ?? [],
    );
    if (buttons.length === 0) return;
    event.preventDefault();
    const index = buttons.findIndex((button) => button === document.activeElement);
    const last = buttons.length - 1;
    let next: number;
    if (event.key === 'Home') next = 0;
    else if (event.key === 'End') next = last;
    else if (event.key === 'ArrowDown' || event.key === 'ArrowRight') next = index >= last ? 0 : index + 1;
    else next = index <= 0 ? last : index - 1;
    buttons[next]?.focus();
  };

  return (
    <div
      ref={exclusive.groupRef(CARD)}
      className={className === undefined ? 'primitive-pill-select' : `primitive-pill-select ${className}`}
      onBlur={(event) => {
        exclusive.onGroupBlur(CARD, event);
      }}
    >
      <span id={labelId} className="primitive-pill-select-label">
        {label}
      </span>
      <button
        id={pillId}
        type="button"
        className="primitive-pill-select-pill"
        aria-haspopup="dialog"
        aria-expanded={isOpen}
        aria-controls={isOpen ? cardId : undefined}
        aria-labelledby={`${labelId} ${pillId}`}
        disabled={disabled}
        ref={(element) => {
          pill.current = element;
          exclusive.buttonRef(CARD)(element);
        }}
        onClick={() => {
          exclusive.toggle(CARD);
        }}
      >
        <span>{current?.label ?? ''}</span>
        <span aria-hidden="true" className="primitive-pill-select-caret">
          ▾
        </span>
      </button>
      {isOpen ? (
        <div id={cardId} role="dialog" aria-labelledby={labelId} className="primitive-pill-select-card">
          <div id={groupId} ref={radios} role="radiogroup" aria-labelledby={labelId} onKeyDown={moveFocus}>
            {options.map((option) => {
              const checked = option.value === value;
              return (
                <button
                  key={option.value}
                  type="button"
                  role="radio"
                  aria-checked={checked}
                  disabled={option.disabled}
                  tabIndex={option.value === tabStop ? 0 : -1}
                  onClick={() => {
                    choose(option.value);
                  }}
                >
                  {option.label}
                </button>
              );
            })}
          </div>
        </div>
      ) : null}
    </div>
  );
}
