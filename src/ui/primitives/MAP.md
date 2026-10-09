# src/ui/primitives/ — Map

Shared UI primitives for the #506 UI/UX overhaul (Phase 1, #508). Business logic stays outside these components — the primitive owns anatomy, states, and keyboard/accessible behavior; the feature owns labels, options, validation, values, and domain consequences. Styled in `src/ui/app.css`'s "Shared primitive styling" block, driven by the `:root` design tokens added alongside these.

- `Button.tsx` — Primary/quiet/danger variants, standard/compact sizes, busy-label support. Deps: none.
- `Field.tsx` — Shared label/help/error/unit slot layout wrapping one form control; `useFieldIds` gives every other field primitive its id/aria-describedby wiring.
- `TextField.tsx` — Single-line text input via `Field`. Deps: `./Field`.
- `NumberField.tsx` — Numeric input with the standard Decrease/Increase stepper via `Field`; reports the raw typed string, not a coerced number. Deps: `./Field`.
- `DateField.tsx` — Native `<input type="date">` via `Field` — deliberately not a hand-built calendar grid. Deps: `./Field`.
- `Select.tsx` — Styled native `<select>` via `Field` for 5-12 item choices. Deps: `./Field`.
- `Checkbox.tsx` — Shared checkbox anatomy, paired with `Radio`. Deps: none.
- `Radio.tsx` — Shared radio anatomy; always used inside a caller-owned `name`/`radiogroup`. Deps: none.
- `ChoiceGroup.tsx` — Segmented control (2-4 exclusive choices) as a labelled radiogroup over `Radio`. Deps: `./Radio`.
- `OptionCards.tsx` — Radio option cards (2-5 choices needing a title + consequence line), fully-clickable cards.
- `Tooltip.tsx` — Shared hover/click/keyboard-focus term-disclosure popup (#456), replacing every native-`title` tooltip in the app. Deps: none.
