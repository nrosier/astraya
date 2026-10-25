# src/ui/primitives/ — Map

Shared UI primitives for the #506 UI/UX overhaul (Phase 1, #508). Business logic stays outside these components — the primitive owns anatomy, states, and keyboard/accessible behavior; the feature owns labels, options, validation, values, and domain consequences. Styled in `src/ui/app.css`'s "Shared primitive styling" block, driven by the `:root` design tokens added alongside these.

- `Button.tsx` — Primary/quiet/danger variants, standard/compact sizes, busy-label support. Deps: none.
- `Field.tsx` + `Field.messages.ts` — Shared label/help/error/unit slot layout wrapping one form control (its own "optional" wording is translated); `useFieldIds` gives every other field primitive its id/aria-describedby wiring.
- `TextField.tsx` — Single-line text input via `Field`. Deps: `./Field`.
- `PasswordField.tsx` — Masked input via `Field` with a required autocomplete purpose; opt-in show/hide toggle. Deps: `./Field`.
- `StagedDialog.tsx` — Modal draft card with one discard path (Escape, ×, backdrop, leaving the page), focus restored to its trigger, sticky footer. Deps: none.
- `TimeField.tsx` — Time-of-day input via `Field`, with an optional extra describing id. Deps: `./Field`.
- `TextAreaField.tsx` — Multi-line text input via `Field`; label can be visually hidden. Deps: `./Field`.
- `NumberField.tsx` — Numeric input with the standard Decrease/Increase stepper via `Field`; reports the raw typed string, not a coerced number. Deps: `./Field`.
- `DateField.tsx` — Native `<input type="date">` via `Field` — deliberately not a hand-built calendar grid. Deps: `./Field`.
- `Select.tsx` — Styled native `<select>` via `Field` for 5-12 item choices. Deps: `./Field`.
- `Badge.tsx` — Small static label chip for a fact beside a heading (e.g. a placement's sign and house). Deps: none.
- `Checkbox.tsx` — Shared checkbox anatomy, paired with `Radio`. Deps: none.
- `Radio.tsx` — Shared radio anatomy; always used inside a caller-owned `name`/`radiogroup`. Deps: none.
- `ChoiceGroup.tsx` — Segmented control (2-4 exclusive choices) as a labelled radiogroup over `Radio`. Deps: `./Radio`.
- `OptionCards.tsx` — Radio option cards (2-5 choices needing a title + consequence line), fully-clickable cards.
- `Disclosure.tsx` — Shared expandable region: full-width 44px trigger row (title, summary, Show/Hide wording, chevron) over a panel (#511 first user). Deps: none.
- `StatusMessage.tsx` — Shared result-state message (loading/updating/empty/zero/partial/offline/success/error) with the right live-region role. Deps: none.
- `FilterSummary.tsx` — One line stating a list is filtered: filter name, shown/total count (live region), and an optional Change-filters action. Deps: none.
- `Notice.tsx` — Persistent explanatory block (warning panel or muted info), distinct from a result state. Deps: none.
- `Tabs.tsx` — Same-page tabs with the WAI-ARIA tab pattern (roving tabindex, arrow/Home/End select-and-focus) and `tabPanelProps` for the labelled panel; first used by Preferences (#650) and the Report. Deps: none.
- `Tooltip.tsx` — Shared hover/click/keyboard-focus term-disclosure popup (#456), replacing every native-`title` tooltip in the app. Deps: none.
- `FileInput.tsx` — Shared file picker (#587): hidden native `<input type="file">` opened by an accessible button, since the file-chooser dialog itself cannot be restyled. Deps: none.
