# UI/UX manual checks, per release

An axe pass is not proof of usability (`UI-UX_GUIDELINES.md` section 9). The guidelines (section 16) and the implementation plan (section 9, "Manual checks remain required") name checks that no automated test performs. This page is the record of running them, once per release, so the answer to "has anyone actually done this?" is a row in a table and not a belief.

It does not replace `RELEASING.md`; step 11 there points here. A release with an empty row is not blocked by it, but the row says so, with the reason.

## How to use it

1. Copy the empty table at the end into a new section for the release, headed by the version and the date.
2. Run each check on the built release candidate (`npm run build`, then `npm start` or the Docker image), not on the dev server.
3. Write **Pass**, **Fail** or **Not run** in the Result column, who ran it, and what was seen. A failure becomes an issue before the release; link it.
4. Changes to the shell, navigation, settings or a chart workflow also need the section 16 tasks with a newer reader and an experienced astrology user. Other releases only need the first table.

## Manual checks (implementation plan, section 9)

| Check                      | How                                                                                                                                    |
| -------------------------- | -------------------------------------------------------------------------------------------------------------------------------------- |
| Screen reader              | VoiceOver (macOS/iOS) or another supported reader: People list, a natal chart (wheel and tables), Preferences, one form with an error. |
| Zoom 200 % and text zoom   | Browser zoom to 200 %, and text-only zoom where the browser has it: no clipped text, no sideways scroll except inside a data table.    |
| Forced colours             | Windows high contrast, or `forced-colors: active` emulated: every control, focus ring and selected state is still visible.             |
| Touch targets and keyboard | A phone or emulated 390x844: targets are at least 44 px; the software keyboard does not cover the field being typed in.                |
| Reduced motion             | `prefers-reduced-motion: reduce`: nothing needs motion to be understood.                                                               |
| Keyboard only              | Tab through People, a chart, Preferences: order follows the layout, focus is always visible, dialogs close on Escape and return focus. |

## Representative tasks (guidelines, section 16)

Run with one newer reader and one experienced astrology user when the shell, navigation, settings or a chart workflow changed.

1. Add a person and reach their natal chart.
2. Select a sign, body, house cusp and aspect; the meaning appears beside the wheel on a wide layout and directly below on a narrow one; move among Wheel, Aspects, Placements and Patterns & condition without losing chart context.
3. Enter a target date, change the Primary Directions time key, and filter transits without guessing which control to use.
4. Configure Astrocartography line types, bodies, Local Space and relocation in one pass; expand a body's line meanings; cancel another settings draft without changing the map.
5. Switch to another person and open the same feature.
6. Change one chart only, then separately change the user's default.
7. Export the current result, build a PDF, and create a full-data backup.
8. Recover from an incomplete record, a zero-result filter, a calculation failure and an offline network action.

Quality targets to note against each run: the active person, feature and calculation basis are found within three seconds; switching people takes at most two actions; the primary action and status are in the first screenful at 1280x800.

## Record for a release

Copy this table under a heading such as `### v0.40.0, 2026-11-02`.

| Check or task      | Result | Who | What was seen / issue |
| ------------------ | ------ | --- | --------------------- |
| Screen reader      |        |     |                       |
| Zoom 200 %         |        |     |                       |
| Forced colours     |        |     |                       |
| Touch and keyboard |        |     |                       |
| Reduced motion     |        |     |                       |
| Keyboard only      |        |     |                       |
| Tasks 1 to 8       |        |     |                       |

## Past releases

None recorded yet. Before this page, none of these checks had a record.
