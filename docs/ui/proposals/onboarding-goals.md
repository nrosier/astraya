# Goal-based onboarding proposal (#1060)

Status: awaiting owner approval. Box 1 of #1060 (owner-approved proposal and mockup) is not met.

This document is a text description for approval. It is not the static 390, 1280 and 3440 light and dark mockup that `ui/UI-UX_GUIDELINES.md` §17.2 requires the owner to approve before a build starts. Per §17.2 mockups are not committed to the repository, so the owner still has to see and approve that mockup separately; this text does not satisfy §17.2.

## Goal and scope

A first-time user lands on People with no stored person. Today the screen shows the heading, the tagline, an Add a person button and an empty-state sentence with no action (`src/ui/People.tsx` renders `<EmptyState message={t.empty} />`). The goal is to make the next step obvious, then reveal further choices only when the data they need exists.

In scope:

- A first-use empty state on People that explains the next step.
- Goal shortcuts on Overview, shown only when the birth record is complete.
- Advanced detail kept behind the existing `Disclosure` and `AdvancedGroup` primitives.

## Non-goals

- No persona, no mode and no per-user level (beginner, advanced). Detail is revealed by the data present and by explicit disclosure, never by a stored user setting.
- No wizard and no multi-step modal flow.
- No product tour, coach marks or spotlight overlays.
- No invented sample person or sample chart. The domain rules forbid invented data, so the empty state offers no demo record.

## Disclosure steps

### 1. People first-use empty state

Shown by default: the heading, the tagline, one sentence saying what is needed (a date, a time and a place of birth) and that the data stays on this device, and the single primary action to add a person (the existing button, not duplicated).

Behind a disclosure: an optional collapsed `Disclosure` titled What is a birth record? holds the existing explanation that a chart can be drawn once date, time and coordinates are in. Whether it is used or the sentence alone suffices is an owner choice.

### 2. Edit birth record

Shown by default: name, place of birth, date, time and how the time is known (the existing identity card).

Behind a disclosure: calendar and timezone overrides and timezone details, which already sit behind show/hide controls in `PersonForm`. No new disclosure is added; the proposal adds one line of copy that says what to do next after a successful save.

### 3. Overview goals

Shown by default, only when the person has a complete birth moment: goal buttons that reuse the existing destinations, Open natal chart, Open interpretation, View transits. Optionally a fourth, Compare with another person (see open points).

Hidden: when the record is partial, no goals are shown. Overview keeps the existing hint that the birth record must be completed, and the Edit birth record action.

### 4. Later screens already using AdvancedGroup

No change. `AdvancedGroup` starts closed, which keeps advanced detail opt-in per screen and not remembered as a level. New advanced detail in future screens uses `Disclosure` or `AdvancedGroup`.

## Text mockup: screens and layout notes

| Screen and state          | Default content                                          | 390                                               | 1280                                  | 3440                                                     |
| ------------------------- | -------------------------------------------------------- | ------------------------------------------------- | ------------------------------------- | -------------------------------------------------------- |
| People, first use         | Heading, tagline, empty-state message, add-person button | One column; button full width below the message   | Shell-width column; button below text | Same column within the shell width cap; no extra columns |
| People, with people       | Existing list                                            | Unchanged                                         | Unchanged                             | Unchanged                                                |
| Person form               | Identity, location and notes cards; overrides collapsed  | Cards stack                                       | Cards as today                        | Cards as today                                           |
| Overview, record complete | Heading, goal buttons                                    | Goals stack, each a target of at least 44 px high | Goals in a row                        | Goals in a row within the shell width cap; no stretch    |
| Overview, record partial  | Heading, completion hint, Edit birth record              | Stacked                                           | Stacked                               | Stacked                                                  |

Light and dark both use existing tokens only; no new colours or spacing values are proposed.

## Empty and skip paths

- The first-use state is derived from stored data (no live people), never from a flag. There is no stored "onboarded" or "dismissed" value.
- A partial birth record shows no goals; it shows the completion hint and Edit birth record.
- Deleting the last person brings the empty state back. Deleted people still appear under Deleted with Restore, as today.
- Loading must not flash the empty state. The empty state renders only after the store has finished loading.
- A save failure keeps the user's input. The existing save-failed message shows and the form values stay as typed.
- Skipping is just not acting: there is nothing persistent to dismiss.

## Accessibility and keyboard

- The empty-state message stays in the page flow (the `EmptyState` primitive has no live region) and is not announced as a result. The add-person button remains the first focusable control after the tagline.
- Goal controls are real links or buttons with visible text, in reading order, reachable by Tab and activated by Enter (links) or Space and Enter (buttons).
- Any `Disclosure` toggle is a button with `aria-expanded`, operable by Space and Enter, with a visible focus ring.
- Targets are at least 44 px high at 390 wide; contrast follows the existing tokens in light and dark.
- Copy is plain language and avoids astrological jargon on first run.

## Copy keys

New keys only; existing keys keep their current text. Every key has both en and nl, and `nl` stays typed as `typeof en`. Dutch matches the existing catalogue, checked in `People.messages.ts`, `Overview.messages.ts`, `PersonForm.messages.ts` and `PersonFileActions.messages.ts`: no `je` or `u` address (imperative or impersonal, for example `Vul de geboortegegevens aan`, `Voeg een persoon ... toe`), and the terms Persoon, geboortegegevens, horoscoop, Transits, Interpretatie, Vergelijken met, Importeren, `op dit apparaat opgeslagen`.

### `src/ui/People.messages.ts`

| Key                     | en                                                                                                                       | nl                                                                                                                                              |
| ----------------------- | ------------------------------------------------------------------------------------------------------------------------ | ----------------------------------------------------------------------------------------------------------------------------------------------- |
| `emptyFirstUse`         | Start with one person. Add a date, a time and a place of birth, and the chart can be drawn. It all stays on this device. | Begin met één persoon. Voeg een datum, tijd en geboorteplaats toe, dan kan de horoscoop worden getekend. Alles blijft op dit apparaat.          |
| `emptyFirstUseAction`   | Add the first person                                                                                                     | Eerste persoon toevoegen                                                                                                                        |
| `emptyWhatIsRecord`     | What is a birth record?                                                                                                  | Wat zijn geboortegegevens?                                                                                                                      |
| `emptyWhatIsRecordBody` | A birth record is the date, time and place of birth. A chart can be drawn once the date, time and coordinates are in.    | Geboortegegevens zijn de datum, tijd en plaats van geboorte. Een horoscoop kan worden getekend zodra de datum, tijd en coördinaten bekend zijn. |

`emptyFirstUseAction` relabels the one add-person button in the empty state only; it is dropped if the owner prefers the existing `addPerson` label (open points).

### `src/ui/Overview.messages.ts`

| Key                 | en                                                | nl                                                              |
| ------------------- | ------------------------------------------------- | --------------------------------------------------------------- |
| `goalsHeading`      | Goals                                             | Doelen                                                          |
| `goalChartHint`     | See the chart for this person.                    | De horoscoop van deze persoon bekijken.                         |
| `goalInterpretHint` | Read what the chart says.                         | Lezen wat de horoscoop zegt.                                    |
| `goalTransitsHint`  | See where the planets are now against this chart. | Zien waar de planeten nu staan ten opzichte van deze horoscoop. |
| `goalCompare`       | Compare with another person                       | Vergelijken met een andere persoon                              |
| `goalCompareHint`   | Place two charts side by side.                    | Twee horoscopen naast elkaar leggen.                            |

The existing `openChart`, `openInterpretation` and `viewTransits` remain the button labels.

### `src/ui/PersonForm.messages.ts`

| Key             | en                                                                | nl                                                               |
| --------------- | ----------------------------------------------------------------- | ---------------------------------------------------------------- |
| `savedNextStep` | Saved. Open the person's overview to choose what to look at next. | Opgeslagen. Open het overzicht van de persoon om verder te gaan. |

Dutch to review: all nl strings are drafted by matching the catalogue and need a Dutch speaker. Flagged in particular: `emptyFirstUse` (Voeg ... toe, dan kan ...), the hint strings that use infinitives as captions, and `geboorteplaats` against the catalogue's `Plaats van geboorte` wording.

## Open points for the owner

1. Section 17.2 conflict: the guideline requires an owner-approved static mockup (390, 1280 and 3440, light and dark) before any build, and also says mockups are not committed. This document is text only and does not meet §17.2. Decide how the mockup is shown and approved.
2. Whether the Compare with another person goal is wanted on first run, when the user has only one person and it needs a second to be useful, or only once two people exist.
3. Whether the empty state should also offer file import through `PersonFileActions`, for users who already hold a person file.
4. Dutch review of every nl string above, and whether the empty-state button is renamed or keeps the existing `addPerson` label.
