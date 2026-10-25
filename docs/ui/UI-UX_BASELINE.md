# UI behaviour baseline

The end-to-end suite pins 142 behaviours across 32 specs (Playwright, against the built `dist/`).
This is the behaviour any redesign must keep, or change on purpose with the test changed in the same commit.
Each line is a test title, so the record is the tests; regenerate with `node scripts/generate-ui-baseline.mjs`.
Persisted person data is the compatibility boundary (docs/ui/UI-UX_IMPLEMENTATION_PLAN.md §4); routes and UI are not.

## Routes and navigation

### `e2e/about-primer.spec.ts`

- the About page includes an astrology primer section with all subsections
- the About page primer renders in Dutch with full translation
- the primer section is accessible and follows semantic structure

### `e2e/app-header.spec.ts`

- one header holds the name, account, language and theme, and the old fixed corners are gone
- the header stays in view and usable while a long page scrolls
- the first Tab reaches a skip link that moves focus to the content without changing the route
- the sign-in box opens beneath the button, inside the screen, and can be used
- on a phone-width screen the header and the sign-in box stay inside the screen
- scrolling to an anchor or focusing a field leaves room for the header, and printing hides it
- the header has no automatically detectable accessibility violations

### `e2e/app-nav.spec.ts`

- the Tools menu is in the header on every screen and opens each tool
- a person’s screens carry their name and tabs in the header, with no strip above the page
- a tool page remembers the last person visited, and returning to their tabs needs no re-pick (#453)
- on a phone the navigation folds behind a Menu button, and nothing scrolls sideways
- the rail (#506/#509) keeps the navigation reachable while the page scrolls, clear of the content it sits beside, not above
- the rail holds brand then navigation; the account cluster sits apart from it, top-right of the content, with and without a person
- Charts is one destination, and the page keeps the type and the view in the URL
- a solar return and a lunar return are charts like any other, with their contacts to the natal chart
- the header’s only export action is the PDF builder link; a chart’s own exports live in its own PageHeader

### `e2e/person-nav-dropdown.spec.ts`

- opening a second group closes the first, so only one dropdown is ever open
- pressing the open group’s button again closes it
- choosing an item navigates and leaves no menu open
- a click on empty page, on content, or on another tab closes the open menu
- Escape closes the menu and puts focus back on its button
- tabbing out of an open group closes it
- the open menu has no automatically detectable accessibility violations

## Inputs: the birth record and place

### `e2e/astrocartography-golden-path.spec.ts`

- a person with a known birth time gets an Astrocartography map and the SVG export downloads
- unchecking a line type removes it from the map
- enabling Local Space adds lines for the checked bodies
- a person with an unknown birth time is told the map needs one

### `e2e/birth-place-search.spec.ts`

- "Search for a place by name" stays visible whether or not coordinates already exist (#290)
- a single search match is still shown as a click-to-confirm list, and picking it fills coordinates and Place of birth (#290)
- multiple search matches are each shown as a separate clickable result (#290)
- a search with no matches shows an inline "not found" message (#290)
- a search-request failure shows an inline message, and coordinates are still editable by hand (#290)

### `e2e/chart-golden-path.spec.ts`

- entering birth data renders the chart wheel and the SVG export downloads
- clicking a glyph on the wheel isolates it and opens a focused-info panel (#400)
- clicking an aspect line isolates just its two endpoint bodies (#400)
- the Jones chart-shape diagram renders alongside its text sentence and explanation (#401, #430)
- the natal chart is split into views, opening on the wheel, and the wheel keeps its selection (#511)
- the natal chart views fit a phone: a labelled Select replaces the link row, and nothing scrolls the page sideways (#511)
- a table row selects on the wheel and the wheel marks the table row (#418)

### `e2e/composite-golden-path.spec.ts`

- two people with known birth times get a Composite screen with a wheel and data tables
- a person with an unknown birth time is told a composite needs one

### `e2e/cycles-golden-path.spec.ts`

- the cycles screen lists the great conjunctions with a diagram, and narrows to the Venus pentagram
- a diagram point and its table row select each other (#418)
- the cycles screen has no automatically detectable accessibility violations
- a bad year is reported inline instead of searching

### `e2e/draconic-golden-path.spec.ts`

- a person with a known birth time gets a Draconic screen with a wheel and data tables
- a person with an unknown birth time is told a draconic chart needs one

### `e2e/eclipses-golden-path.spec.ts`

- the eclipses screen lists the four eclipses of 2024 with their degrees
- choosing a person shows which of their natal points an eclipse touches
- the eclipses screen has no automatically detectable accessibility violations
- a span that is too long is refused inline

### `e2e/electional-golden-path.spec.ts`

- searching for just the void-Moon rule reproduces the 8 March 2024 void window
- an empty rule set, a reversed span and a missing coordinate are reported inline
- the electional screen has no automatically detectable accessibility violations

### `e2e/harmonic-golden-path.spec.ts`

- a person with a known birth time gets a Harmonic screen with a wheel and data tables
- a custom harmonic number renders its own chart
- a person with an unknown birth time is told a harmonic chart needs one

### `e2e/horary-golden-path.spec.ts`

- casting a horary chart shows the considerations before judgment and the chart
- a missing date is reported inline instead of casting
- the horary screen has no automatically detectable accessibility violations

### `e2e/multi-device-sync.spec.ts`

### `e2e/periodic-transit-golden-path.spec.ts`

- a person with a known birth time gets a Forecast screen with all four tiers
- changing the "as of" date recalculates the forecast
- the planetary-return picker computes a return for the chosen body (#398)
- a person with an unknown birth time is told a forecast needs one

### `e2e/person-form-time-order.spec.ts`

- the form asks how the time is known before it asks for the time

### `e2e/profections-golden-path.spec.ts`

- a person with a known birth time gets a Profections screen with a Year/Month table
- a person with an unknown birth time is told profections need one

### `e2e/progressions-golden-path.spec.ts`

- a person with a known birth time gets a Progressions screen with technique/MC selectors and tables
- a person with an unknown birth time is told progressions need one

### `e2e/rectification-golden-path.spec.ts`

- rectifying a day of candidate times recovers the true birth time from exact solar-arc events
- a missing event, an event before birth and a bad time are reported inline
- the rectification screen has no automatically detectable accessibility violations

### `e2e/solar-arc-golden-path.spec.ts`

- a person with a known birth time gets a Solar Arc screen with directed positions and contacts
- a person with an unknown birth time is told solar arc directions need one

### `e2e/synastry-golden-path.spec.ts`

- two people with known birth times get a Synastry screen with a bi-wheel and aspect table
- the relationship summary panel groups contacts by theme, and its AI reading is gated on an account (#422)
- a person with an unknown birth time is told synastry needs one
- clicking a ring legend entry dims the other person's legend (#455)

### `e2e/transit-golden-path.spec.ts`

- a person with a known birth time gets a Transit screen with a bi-wheel and contacts table
- a person with an unknown birth time is told transits need one

## Chart workspace and selection

### `e2e/chart-workbench.spec.ts`

- the inspector follows the dial, beside it from a 68rem workbench and below it under that
- selecting something fills the inspector in place, without moving it
- a house number on the wheel selects that house, in the inspector and in its table row (#511)
- a sign is selectable from the Placements table by keyboard, and clearable the same way (#511)
- a derived point is selectable from the Placements table by keyboard, with its position in the inspector (#511)
- the aspect matrix is a view of its own, and a cell selects its pair on the wheel by mouse and keyboard (#511)
- the elements and modalities grid is a view of its own, with its table and a CSV download (#511)

### `e2e/extended-settings.spec.ts`

- the settings open as a card, apply together or are dropped, and the button says what changed
- the card works on a phone: it fills the screen, scrolls inside, and keeps Apply in reach
- opening and cancelling the card keeps what is selected on the wheel (applying redraws, which clears it)
- the card is not part of the printed page
- the Apply button enables when only Symbols are changed (#459)
- saving a profile as the device default applies it to a chart that was never touched (#510)

### `e2e/rulership-setting.spec.ts`

- the rulers choice is modern by default, drives the dispositor table, and is kept across a reload
- the choice is shared by the other screens that show rulers (profections and transits)

### `e2e/symbol-setting.spec.ts`

- the symbol class changes the wheel, the tables and the export together, and is kept on this device
- the transit wheel and the cycles diagram follow the class too
- Uranus and Pluto can be drawn in either of their two forms, kept on this device
- the header toggle writes the symbols as text, and the line weight changes the drawn glyphs

## Calculation screens

## Exports and documents

### `e2e/pdf-export-builder.spec.ts`

- the header’s PDF-builder link opens the PDF builder, and a preset downloads a real PDF
- ticking a chart type reveals its own tables and wheel checkbox, and unticking collapses them
- the AI-customised narrative needs its own consent tick before Build PDF is enabled
- the AI consent is spent by the build and never remembered: a new request needs a fresh tick
- synastry and composite each get their own partner picker, and both build into one PDF (#441)
- unticking Synastry hides its partner picker and drops it from the selection
- ticking Progressions reveals its technique/MC-method controls, which collapse the MC method for non-secondary techniques (#441)
- ticking Astrocartography reveals its map/line-type/body controls, which collapse when unticked (#441)
- selecting the Full predictive report preset fills progressions and solar arc, and builds a real PDF (#441)
- ticking Profections and Astrocartography on their own builds a real PDF with both sections (#441)
- ticking Transits reveals its filter/wheel/table/date controls, and ticking Forecast reveals its tier checkboxes, both collapsing when unticked (#441)
- ticking Eclipses reveals its from/to year controls, collapsing when unticked, and builds a real PDF (#441, #484)

## Preferences, accounts and persistence

### `e2e/accessibility.spec.ts`

- the bare landing page redirects to the people list with no automatically detectable accessibility violations
- a gated chart-type tab renders as a genuinely disabled control (#234)
- the empty People list has no automatically detectable accessibility violations
- a person's detail form has no automatically detectable accessibility violations
- the chart view (wheel plus data tables) has no automatically detectable accessibility violations
- every view of the natal chart has no automatically detectable accessibility violations (#511)
- column-header and dispositor tooltips are reachable on keyboard focus, not just mouse hover (#456)
- a tooltipped table column header is reachable by keyboard and exposes its tooltip text (#456)
- the profections screen (#168) has no automatically detectable accessibility violations
- the transit screen (#172) has no automatically detectable accessibility violations
- the synastry screen (#172) has no automatically detectable accessibility violations
- the composite screen (#169) has no automatically detectable accessibility violations
- the harmonic screen (#170) has no automatically detectable accessibility violations
- the periodic transit forecast screen (#207) has no automatically detectable accessibility violations
- the astrocartography screen (#171) has no automatically detectable accessibility violations
- the interpretation view has no automatically detectable accessibility violations, on either sub-tab (#360)
- the AI-Customized Generate button renders as a genuinely disabled control with an accessible reason (#360)
- the admin screen has no automatically detectable accessibility violations (#357)
- the corpus-overrides admin screen has no automatically detectable accessibility violations (#357)
- the corpus-overrides table wraps its text instead of scrolling sideways, at desktop and phone width (#428)

### `e2e/admin-roles.spec.ts`

- a super admin can create, change the role of, and remove accounts
- an admin sees the accounts read-only, and still reaches the other admin screens
- an ordinary member has no Admin menu

### `e2e/control-states.spec.ts`

### `e2e/preferences.spec.ts`

- Preferences is reachable from every screen, lists its four subsections, and has no automatically detectable accessibility violations
- a section link opens Preferences at that heading and moves focus there (#509)
- Motion and Density are device preferences: applied at once, kept across a reload, and compact never shrinks touch targets (#510)
- the rulers choice changed here is the same one chart screens read, and survives a reload
- exporting everything and the people CSV both produce real downloads
