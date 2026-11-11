# UI behaviour baseline

The end-to-end suite pins 188 behaviours across 81 specs (Playwright, against the built `dist/`).
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
- the first Tab reaches a skip link that moves focus to the content without changing the route
- the sync popover closes on Escape, a click outside and focus leaving the badge (#1081)
- the sign-in dialog opens centred, inside the screen, and takes input
- on a phone-width screen the header and the sign-in dialog stay inside the screen
- scrolling to an anchor or focusing a field leaves room for the header, and printing hides it
- the header has no automatically detectable accessibility violations

### `e2e/app-nav.spec.ts`

- Tools is one sidebar link on every screen; its tools are tabs on the page (#882)

### `e2e/person-nav-dropdown.spec.ts`

- choosing a tab opens that sub-view and keeps the section entry current
- a chosen section tab survives a reload of the same route (#882)
- Tools: every tool tab is reachable from the keyboard (#882, #1139)
- the section tab row has no automatically detectable accessibility violations

## Inputs: the birth record and place

### `e2e/astrocartography-golden-path.spec.ts`

### `e2e/birth-place-search.spec.ts`

- "Search for a place by name" stays visible whether or not coordinates already exist (#290)
- a single search match is still shown as a click-to-confirm dropdown, and picking it fills coordinates and Place of birth (#290)
- multiple search matches are each shown as a separate clickable result (#290)
- a search with no matches shows an inline "not found" message (#290)
- a search-request failure shows an inline message, and coordinates are still editable by hand (#290)

### `e2e/chart-golden-path.spec.ts`

### `e2e/chart-overlay-golden-path.spec.ts`

- a natal, transit, and progressed triwheel is independently configurable (#558)
- a consultation preset sets the layers and orbs on demand, and No preset restores them (#1190)

### `e2e/composite-golden-path.spec.ts`

- two people with known birth times get a Composite screen with a wheel and data tables
- a person with an unknown birth time is told a composite needs one

### `e2e/consultation-golden-path.spec.ts`

- a person with a known birth time gets a Consultation screen with transits, timing tracks and highlights
- the Consultation header opens the chart wheel on the day shown, and the cards link to their full views (#800 round 2)
- the notes card starts collapsed, shows its save state, and expands on the page (#800 round 2)
- a separating transit shows the applying and separating badge with a dot and its label (#815)

### `e2e/custom-point-golden-path.spec.ts`

- a custom formula point is rendered, hidden, and removed from the natal chart through the drawer (#573, #815)

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
- a void Moon in a sign where Lilly says it matters less is shown, but the chart is still fit to be judged

### `e2e/multi-device-sync.spec.ts`

### `e2e/periodic-transit-golden-path.spec.ts`

- a person with a known birth time gets a Forecast screen with all four tiers
- changing the "as of" date recalculates the forecast
- the planetary-return picker computes a return for the chosen body (#398)
- a person with an unknown birth time is told a forecast needs one
- at 390 wide the period choice is a labelled Select, not the tab row (#1227)

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

### `e2e/relocated-chart-golden-path.spec.ts`

- a saved relocation renders a chart and natal-vs-relocated comparison (#559)

### `e2e/solar-arc-golden-path.spec.ts`

- a person with a known birth time gets a Solar Arc screen with directed positions and contacts
- a person with an unknown birth time is told solar arc directions need one

### `e2e/synastry-golden-path.spec.ts`

### `e2e/transit-golden-path.spec.ts`

## Chart workspace and selection

### `e2e/chart-overlay-modal-phone.spec.ts`

- Overlay settings is modal on a phone: focus stays inside and returns to Chart actions on every close (#1080)

### `e2e/chart-selection-overhang-screens.spec.ts`

### `e2e/chart-type-selector-keyboard.spec.ts`

- Tab reaches chart type, aspects shown and consultation preset in order, each with a visible focus ring (#1224)

### `e2e/chart-type-selector-layout.spec.ts`

### `e2e/chart-workbench.spec.ts`

### `e2e/extended-settings.spec.ts`

### `e2e/rulership-setting.spec.ts`

- the rulers choice is modern by default, is saved with Apply, drives the dispositor table, and is kept across a reload

### `e2e/symbol-setting.spec.ts`

- the transit wheel and the cycles diagram follow the class too

## Calculation screens

### `e2e/horary-form-mobile.spec.ts`

- the horary form fits a 390px phone in English and in Dutch

## Exports and documents

### `e2e/pdf-export-builder.spec.ts`

- the header’s PDF-builder link opens the PDF builder, and a preset downloads a real PDF
- signed in, the picker offers the stored interpretations in the PDF’s language, and both build into the PDF (#759)
- the Documents page keeps its starting point and Build PDF in the header, with the summary beside the selection (#916)
- the export summary stays in view while the Documents page scrolls at 1280x800 (#975)
- on a phone the Build PDF bar is pinned to the bottom of the screen (#916)
- Documents starts on the person whose pages were open, not the first in the list (#709)

## Preferences, accounts and persistence

### `e2e/accessibility.spec.ts`

- the bare landing page (the empty home) has no automatically detectable accessibility violations
- a gated chart-type tab renders as a genuinely disabled control (#234)
- the empty People list has no automatically detectable accessibility violations
- the AI-Customized Generate button renders as a genuinely disabled control with an accessible reason (#360)
- the admin screen has no automatically detectable accessibility violations (#357)
- the corpus-overrides admin screen has no automatically detectable accessibility violations (#357)
- the corpus-overrides table wraps its text instead of scrolling sideways, at desktop and phone width (#428)
- a sub-view page at phone width has no axe region violations, so the sub-view select sits in a landmark (#1050)

### `e2e/admin-roles.spec.ts`

- a super admin can create, change the role of, and remove accounts
- an admin sees the accounts read-only, and still reaches the other admin screens
- an ordinary member has no Admin menu
- the admin tab row scrolls as one nav on a wide screen and is a labelled select on a phone (#818)

### `e2e/control-states.spec.ts`

### `e2e/preferences.spec.ts`

- Preferences is reachable from every screen, has three tabs, and every tab has no automatically detectable accessibility violations
- the tabs follow the arrow keys, keep one panel on screen, and do not add history entries (#650)
- an old #/preferences/general link opens Appearance, where the language moved (#650)
- a section link opens Preferences at that heading and moves focus there (#509)
- Motion and Density are device preferences: applied at once, kept across a reload, and compact never shrinks touch targets (#510)
- the rulers choice changed here is the same one chart screens read, and survives a reload
- exporting everything and the people CSV both produce real downloads
- Appearance is a compact two-column page: every setting above the fold at 1280x800, tooltips by keyboard, stacked below 1024px (#1185)

## Other

### `e2e/aaf-interchange.spec.ts`

- exports people as AAF records that follow the specification’s #A93 and #B93 forms
- imports an AAF file from another program as a reviewed restore, and adds the person only on confirm

### `e2e/admin-nav-inset.spec.ts`

- the Admin sections label and select are inset inside the card at 390px and unchanged at 1280px (#1188)

### `e2e/back-link.spec.ts`

- opened fresh, Documents has no back link and its one heading is the builder
- opened directly, a screen has no back link at all (#1225)
- the bare #/ stays on #/ and Back never loops (#1058)

### `e2e/document-titles.spec.ts`

- every screen titles its tab with its heading and the app name, and the titles differ (#1078)

### `e2e/event-search-ics.spec.ts`

- the event search downloads its results as a valid .ics file

### `e2e/first-use.spec.ts`

- with nobody stored, People offers the next step and an import that leads to the restore on Preferences
- once a person exists the first-use state is gone, and their saved birth record says what to do next

### `e2e/fixed-star-picker.spec.ts`

- search Regulus, add it, Apply: the chart checks the chosen star (#803)

### `e2e/heading-order.spec.ts`

### `e2e/home-route.spec.ts`

- with nobody stored, #/ shows the first-use empty state and stays on #/
- with people but none viewed, #/ shows the picker; choosing one shows their timeline
- on #/ with a last-viewed person, the person section links are in the sidebar (#965)
- a stored id that no longer exists falls back to the picker
- after viewing a person, #/ shows their timeline, survives reload, and Back does not loop

### `e2e/interpretation-config.spec.ts`

### `e2e/journey-1-selection-meanings.spec.ts`

- a sign, body, cusp, house and aspect each show their meaning in the Selection card at once

### `e2e/journey-2-override-vs-default.spec.ts`

- a chart override applied to one chart is kept apart from a calculation default saved for new people

### `e2e/journey-3-directions-filter.spec.ts`

- the Primary Directions time key can be changed to Ptolemy and the arc for the age follows it
- the transit filter narrows the list of transits, and choosing All restores them
- a target date entered on Primary Directions sets the age, and a date before birth is refused in words

### `e2e/journey-4-acg-settings.spec.ts`

- map settings can be configured and cancelled without effect, then applied together in one pass

### `e2e/journey-5-line-meanings.spec.ts`

- each line meaning is a labelled, counted, collapsed button that expands from the keyboard

### `e2e/journey-6-recovery.spec.ts`

- a filter that matches no transits shows the empty state, and Clear filters restores them
- a latitude outside -90 to 90 shows a clear message, and correcting it clears the message
- incomplete data: Save stays off with a reason beside it, and filling the missing fields turns it on
- offline: a network-only action says it needs a connection, keeps manual entry, and recovers when back online
- calculation failure: Primary Directions at a birthplace beyond the polar circle explains why, and correcting the place recovers

### `e2e/note-save-states.spec.ts`

- birth record notes: Saving then Autosaved, the page Save never reacts, and a reload keeps the note (#919)
- birth record notes: offline reads Saved on this device (#919)
- birth record notes: leaving the page flushes an edit that has not waited out the debounce (#919)
- birth record notes: an over-limit note shows the error and keeps the text (#919)
- consultation notes: Saving then Autosaved, a note persists, and delete asks first (#919)
- consultation notes: offline reads Saved on this device, and leaving flushes (#919)
- the save states read in Dutch (#919)

### `e2e/orb-library.spec.ts`

- a named orb profile chosen for transits changes them, leaves the card alone, and edits save a revision
- a cited Lilly preset is offered on the card, applies, and can be chosen for transits (#590)

### `e2e/orb-profile.spec.ts`

- a rule set on the card changes the transit contacts too (#590)
- own orb rules on the natal chart change its aspects, name themselves in the settings button, and survive a profile reset

### `e2e/overview-launchpad.spec.ts`

- lists what is uncertain in the birth data, and the fix link puts the cursor in that field
- flags a missing birth-data source, and the fix link puts the cursor in the source field (#1262)
- offers no resume section until a chart is opened, then continues there
- shows one "now" line that links to Consultation
- puts Sun, Moon and Rising in a card under the natal wheel, in the same column (#1173)
- on Transits the text above the wheel runs as wide as the wheel (#1225)
- lists the account saved searches under Continue where you left off, and opens one into Event search (#1261)
- offers comparing with another person once there are two people, and goes to the relationship screen

### `e2e/person-file.spec.ts`

### `e2e/pins.spec.ts`

- pin a result, keep it across a reload, unpin with Undo (#1061)

### `e2e/primary-directions-significator-update.spec.ts`

- changing a significator dims/undims the bi-wheel, and the result region never shows a second, stale show/hide cycle

### `e2e/profile-easter-egg.spec.ts`

- a matching person’s birth record shows the overlay, and it removes itself
- nothing runs when the reader asks for reduced motion
- positive control: the same wait sees the overlay for a matching person

### `e2e/research-export.spec.ts`

- export everything, then restore into an empty profile (#1194)

### `e2e/saved-interpretations-person.spec.ts`

- the PDF builder’s picker lists only the selected person’s results, and switching person changes the list (#768)
- the Past tab shows the selected person’s results and a separate Not linked to a person section (#768)

### `e2e/saved-queries.spec.ts`

- save, reload, reopen, delete with Undo, and erase a saved event-search query (#1061)
- an over-long name is refused before it is saved (#1061)

### `e2e/scroll-cue-edges-1229.spec.ts`

### `e2e/shared-people-state.spec.ts`

- the people survive a reload, and the service worker does not serve a stale page
- a second tab holds no writer lock: one tab owns it, and both tabs read the seeded data
- the saved state is untouched, and a fresh context still shows the same three people

### `e2e/signin-choice.spec.ts`

- the sign-in dialog opens on the OpenID stage and swaps to the local form
- Sign in with OpenID goes to the issuer’s authorization endpoint with a PKCE challenge
- the sign-in dialog fits on a phone
- the sign-in dialog is centred in the viewport
- Escape closes the dialog and returns focus to the Sign in pill
- a backdrop press closes the dialog
- the password toggle switches the field between password and text, and its label flips

### `e2e/sticky-table-header.spec.ts`

- a tall table keeps its header row at the top of the scroll frame while scrolling (#1065)

### `e2e/subview-nav.spec.ts`

- every person section has its h1, a Tabs bar with the open sub-view selected, and an h2 for the screen (#1175)
- person section tabs: arrow, Home and End move between sub-views at their unchanged routes, with a visible focus ring (#1175)
- every Tools page has a Tools h1, a Tabs bar with the tool open, and its own name as a section heading (#1139)
- Tools tabs: arrow, Home and End move between tools at their unchanged routes, with a visible focus ring (#1139)

### `e2e/table-column-resize.spec.ts`

- a column resizes by keyboard and by drag, and sorting still works (#1301)
- Reset appears beside Copy/Download CSV only once a column is resized, and restores the default widths (#1301)
- the Consultation transit table (ConsultationTransitTable) resizes and resets too (#1301)
- the resize handle is hidden on a coarse (touch) pointer, which keeps the sideways scroll instead (#1301)

### `e2e/timing-timeline.spec.ts`

- shows every technique as a row of the chart, with the centre date marked, and the same events in the table
- cards on the timing pages are one default gap apart, whatever sits between them (#1236, #1237)
- the bodies filter keeps events without a body and splits the rest between major planets and asteroids (#1260)
- searches the events, and the technique filter takes a technique out of the chart and the table
- the 10Y range widens the axis, and Now returns the centre date to today

### `e2e/tool-basis-lines.spec.ts`

### `e2e/tool-page-layout.spec.ts`

### `e2e/touch-targets.spec.ts`

### `e2e/ui-baselines.spec.ts`

- capture the reference screenshots

### `e2e/viewport-matrix.spec.ts`

- multi-card grids span the page content width at every bottom-edge viewport (#895)
- opening a card in a multi-card row leaves the neighbouring column its own height (#1231)
- horary side-by-side cards keep the shorter at least 90% of the taller (#895)
- consultation side-by-side columns keep the owner-accepted floor (#895)
- birth record side-by-side columns keep the shorter at least 90% of the taller (#895)
- solar arc timing-layout columns keep the shorter at least 90% of the taller (#1234)
- progressions timing-layout columns keep the shorter at least 90% of the taller (#1235)
- profections timing-layout pair is measured and reported, exempt from the 90% rule (#1236)
- the horary astrological parameters card spans the full form width at 1280×800

### `e2e/visual-review.spec.ts`

- capture the screens of the visual review
