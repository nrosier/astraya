# Horary view (target design)

**Scope:** The horary question screen (`HoraryView.tsx`): the timestamp, the location search, and the secondary settings. Target design only; general rules live in `docs/ui/UI-UX_GUIDELINES.md`.

Each section ends with a **Status** line. Verified against the code on 2026-10-25.

## 1. Location search with an attached Search button

The place-name input and its **Search** button sit on the same row. Searching opens a floating result list with the native CSS equivalent `position: absolute; left: 0; right: 0; top: 100%; margin-top: 0.25rem; z-index: 30; max-height: 15rem; overflow-y: auto;`. Selecting a result fills the Latitude and Longitude fields and closes the list.

**Status:** Partly built. The search is shared with `PersonForm.tsx`, `ElectionalView.tsx`, and `RectificationView.tsx`. It is rendered in `HoraryView.tsx:144-148` through `BirthPlaceSearch.tsx`. Selecting a result fills the fields and calls `setOpen(false)` (`BirthPlaceSearch.tsx:121-126`). Differences from the target:

- The Search button sits under the field in its own form row (`BirthPlaceSearch.tsx:156`, `:234-240`, with `.birth-place-search-form` at `app.css:935-940`), not on the same row.
- The dropdown is `max-height: 15rem` (`app.css:961`), not `max-h-60` (15rem).
- The dropdown uses `z-index: 10` (`app.css:959`), not 30.

## 2. Quick action "Set to Now"

Timestamp and date inputs get a secondary quick-action button. The target label is **Set to Now**.

**Status:** Partly built. The button exists (`HoraryView.tsx:136-142`). Its current English label is "Set to now" (`HoraryView.messages.ts:17`), which differs from the target. Its Dutch label is "Nu invullen" (`HoraryView.messages.ts:104`). The button is in `.horary-timestamp` (`HoraryView.tsx:121`, `app.css:861-866`).

## 3. Secondary and debug controls in a Disclosure

The UTC offset override, timezone override, and raw backend data strings belong in a collapsible `Disclosure`. The shared primitive is `src/ui/primitives/Disclosure.tsx`, and it renders a full-width trigger row with explicit Show/Hide wording and a chevron.

**Status:** Not yet built on HoraryView. `HoraryView.tsx` has no `Disclosure`, no `details`, and no offset or timezone fields (a grep for `offset`, `timezone`, `zone`, and `raw` returns nothing). The override fields exist only on the birth record form, `PersonForm.tsx:282` (`utcOffsetOverrideLabel`) and `:292` (`timezoneOverrideLabel`). They are not inside a Disclosure there either. The rule therefore applies to the birth record form, which this file does not cover; the report notes this.
