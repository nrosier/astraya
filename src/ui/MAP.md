# src/ui/ — Map

React UI: one screen per route plus its own co-located `*.messages.ts` (en/nl), hooks for
device preferences (symbol class/weight, rulership choice, locale, theme), `route.ts` (pure
hash-route parsing, tested without a DOM), and the cross-cutting non-component helpers that
need both `domain/` data and `chart/` rendering (e.g. `pdf-export-plan.ts`/
`pdf-export-render.ts` for #441).

### `About.messages.ts`
Domain Purpose: i18n text for the About screen. Responsibility: English/Dutch strings for version info, privacy statement, licence/source links, acknowledgements, and the astrology primer. Key Dependencies: none (pure data), consumed by `About.tsx`.

### `About.tsx`
Domain Purpose: satisfies the AGPL network-use source-availability clause and states the app's privacy posture. Responsibility: renders version/build info, the privacy statement, licence and source links, acknowledgements, and an astrology primer. Key Dependencies: `../version.js` for build metadata; `About.messages.ts` for text.

### `AccountPanel.messages.ts`
Domain Purpose: i18n text for sign-in/out and account-adoption UI. Responsibility: English/Dutch strings for the sign-in form, OIDC button, sign-out, and local-data-removal flow. Key Dependencies: none; consumed by `AccountPanel.tsx`.

### `AccountPanel.tsx`
Domain Purpose: lets a user attach this device to an account so data syncs across devices. Responsibility: renders sign-in (password or OIDC)/sign-out controls, the one-time account-adoption prompt, and local-account-data removal. Key Dependencies: `session-context.js` for session state, `../sync/auth-client.js` for OIDC config, `oidc-pkce.js` for the PKCE handshake.

### `AdminNav.messages.ts`
Domain Purpose: i18n text for the admin tab strip. Responsibility: English/Dutch labels for the users/usage/corpus-overrides/corpus-candidates admin tabs. Key Dependencies: `./admin-nav.js` for the `AdminTabKey` type.

### `AdminNav.tsx`
Domain Purpose: lets an admin move between the four admin screens. Responsibility: renders the admin tab strip; navigation only, the server's `requireAdmin` is the real access boundary. Key Dependencies: `./admin-nav.js` for tab definitions/active-tab logic.

### `AdminPanel.messages.ts`
Domain Purpose: i18n text for admin user management and AI-usage reporting. Responsibility: English/Dutch strings for the user table, create/delete/reset-password flows, and the AI-interpretation usage report. Key Dependencies: none; consumed by `AdminPanel.tsx`.

### `AdminPanel.tsx`
Domain Purpose: lets a super admin manage accounts and lets any admin see AI-interpretation usage/cost. Responsibility: exports `AdminPanel` (list/create/disable/enable/reset-password/change-role/delete users) and `AdminUsagePanel` (usage/cost table). Key Dependencies: `../sync/admin-client.js` for all server calls; `session-context.js` for the signed-in admin's role.

### `App.messages.ts`
Domain Purpose: i18n text for the application shell. Responsibility: English/Dutch strings for loading states, the storage-unavailable warning, the skip link, and footer links. Key Dependencies: none; consumed by `App.tsx`.

### `App.tsx`
Domain Purpose: the application's entry screen and router. Responsibility: hash-based routing between every screen, the sticky header (account/sync/language/theme), and the lazy-loading boundary (`lazy(() => import(...))`) for every screen off the landing path. Key Dependencies: `route.js` for hash parsing, `session-context.js`/`store-context.js` for session and store state, `person-screens.js` for the shared lazy-loaded person-screen chunk.

### `AppNav.messages.ts`
Domain Purpose: i18n text for the header's main navigation. Responsibility: English/Dutch labels for person tabs, chart-type/tool/export dropdowns, and export status messages. Key Dependencies: `./person-nav.js`/`./tools-nav.js` for the key types the labels are indexed by.

### `AppNav.tsx`
Domain Purpose: the app's primary navigation, replacing the old per-screen tab strip. Responsibility: renders the person's chart tabs/dropdowns, the Tools menu, and the Export menu (including "everything" and "this page" exports), folding behind a Menu button on narrow screens. Key Dependencies: `person-nav.js`/`tools-nav.js` for tab/tool definitions, `export-registry.js` for per-screen export items, `../domain/full-export.js` for the "everything" export.

### `AstroChartWheel.tsx`
Domain Purpose: a reference/alternate wheel rendering for comparison during development. Responsibility: renders a natal wheel using the third-party `@astrodraw/astrochart` library instead of Astraya's own SVG pipeline; screen-only, excluded from export. Key Dependencies: `../chart/astrochart-adapter.js` to convert `ChartData` into the library's input shape.

### `AstrocartographyView.messages.ts`
Domain Purpose: i18n text for the Astrocartography screen. Responsibility: English/Dutch strings for line-type/body legends, relocation controls, and SVG/PNG export labels. Key Dependencies: none; consumed by `AstrocartographyView.tsx`.

### `AstrocartographyView.tsx`
Domain Purpose: shows where a person's chart angles fall around the world. Responsibility: renders the Astrocartography/Local Space map for a saved person, with line-type/body/relocation controls and SVG/PNG export. Key Dependencies: `../domain/astrocartography.js` for the computation, `../chart/acg-map.js` for the SVG renderer, `../interpretation/compose.js` for per-line interpretive text.

### `BiWheelSelectionPanel.messages.ts`
Domain Purpose: i18n text for the bi-wheel click-to-inspect panel. Responsibility: English/Dutch strings describing a selected body/sign/aspect in a two-ring chart. Key Dependencies: none; consumed by `BiWheelSelectionPanel.tsx`.

### `BiWheelSelectionPanel.tsx`
Domain Purpose: explains what was clicked on a Transits/Synastry bi-wheel. Responsibility: renders the info panel for a clicked body, sign, or aspect line, in the active locale. Key Dependencies: `./bi-wheel-selection.js` for the underlying facts; `astro-names.messages.js` for display names.

### `BirthPlaceSearch.messages.ts`
Domain Purpose: i18n text for the birth-place search field. Responsibility: English/Dutch strings for the search form, including the geocoding-disclosure hint. Key Dependencies: none; consumed by `BirthPlaceSearch.tsx`.

### `BirthPlaceSearch.tsx`
Domain Purpose: the only way to set a person's birth coordinates. Responsibility: searches a typed place name via a geocoding service and lets the user confirm a match, which sets latitude/longitude (and optionally a place label). Key Dependencies: `./forward-geocode.js` for the geocoding call, `./geocode-provider.js` for the disclosed host name.

### `Changelog.tsx`
Domain Purpose: lets a user see what changed in the build they're running. Responsibility: renders the project's CHANGELOG.md as the in-app changelog screen. Key Dependencies: `../../CHANGELOG.md` (bundled via `?raw` import), `./markdown.js` for rendering.

### `ChartTypeSelector.tsx`
Domain Purpose: lets a user switch which chart type (natal/draconic/harmonic/returns) they're viewing. Responsibility: renders the chart-type link row at the top of a person's Charts page, preserving the open section; `changeChartSection` keeps the open section in the URL. Key Dependencies: `./chart-sections.js` for chart-type/href logic.

### `ChartTypes.messages.ts`
Domain Purpose: i18n text naming each chart type. Responsibility: English/Dutch labels for natal/draconic/harmonic/solar-return/lunar-return, used by both the Charts menu and the type selector. Key Dependencies: `./chart-sections.js` for the `ChartType` type.

### `ChartView.messages.ts`
Domain Purpose: i18n text for the natal chart screen. Responsibility: English/Dutch strings for every data-table column, chart-shape/lunar-phase/sect wording, export labels, and share-link text. Key Dependencies: none; consumed by `ChartView.tsx`.

### `ChartView.tsx`
Domain Purpose: the primary chart screen — shows a person's natal chart wheel and every computed table. Responsibility: exports `ChartView` (the natal-chart screen) and `ChartDataView` (the shared tabbed wheel+tables UI reused by composite/draconic/harmonic/shared-chart screens), plus column builders for every table. Key Dependencies: `../domain/chart-compute.js`/`../domain/chart-tables.js` for all computed data, `../chart/chart-sheet.js` for the wheel SVG, `AstroChartWheel.js` for the dev-only reference rendering.

### `CompositeView.messages.ts`
Domain Purpose: i18n text for the composite chart screen. Responsibility: English/Dutch strings for the partner picker, heading, and houses-undefined warning. Key Dependencies: none; consumed by `CompositeView.tsx`.

### `CompositeView.tsx`
Domain Purpose: shows the synthetic midpoint relationship chart between two people. Responsibility: lets the user pick a second saved person and renders the resulting composite chart via the shared `ChartDataView`. Key Dependencies: `../domain/composite.js` for the near-arc midpoint computation; `ChartView.js`/`ReportView.js` for display.

### `CorpusCandidatesPanel.messages.ts`
Domain Purpose: i18n text for the admin candidate-review queue. Responsibility: English/Dutch strings for the bulk-generated-candidate review UI (accept/reject, triage/source labels). Key Dependencies: none; consumed by `CorpusCandidatesPanel.tsx`.

### `CorpusCandidatesPanel.tsx`
Domain Purpose: lets an admin triage bulk-generated interpretation text before it goes live. Responsibility: lists pending corpus candidates sorted worst-triage-first, with accept/reject actions; accepting turns a candidate into a live correction. Key Dependencies: `../sync/admin-client.js` for list/decide calls; `placement-label.js` for sorting/labeling entries by meaning.

### `CorpusOverridesPanel.messages.ts`
Domain Purpose: i18n text for the admin corpus-correction screen. Responsibility: English/Dutch strings for search/filter controls, the edit form, and reset-to-default. Key Dependencies: none; consumed by `CorpusOverridesPanel.tsx`.

### `CorpusOverridesPanel.tsx`
Domain Purpose: lets an admin correct individual interpretation-corpus entries without touching the committed JSON. Responsibility: browses/searches/filters the live-merged corpus and edits/saves/resets per-entry text overrides. Key Dependencies: `../interpretation/corpus-client.js` for the merged corpus (same function reports use); `../sync/admin-client.js` for override CRUD.

### `CyclesView.messages.ts`
Domain Purpose: i18n text for the Planetary Cycles tool. Responsibility: English/Dutch strings for cycle presets, the search form, and the exact-aspects table. Key Dependencies: none; consumed by `CyclesView.tsx`.

### `CyclesView.tsx`
Domain Purpose: the Planetary Cycles tool — shows recurring exact-aspect patterns between two moving bodies. Responsibility: searches for exact aspects over a year span and renders them as a linked table and zodiac diagram. Key Dependencies: `../astrology/mutual-aspects.js` for the search; `../chart/cycle-diagram.js` for the SVG diagram.

### `DraconicView.messages.ts`
Domain Purpose: i18n text for the draconic chart screen. Responsibility: English/Dutch strings for the heading, hint, and houses-undefined warning. Key Dependencies: none; consumed by `DraconicView.tsx`.

### `DraconicView.tsx`
Domain Purpose: shows a person's draconic chart (positions re-measured from the natal North Node). Responsibility: computes and renders the draconic chart for a saved person via the shared `ChartDataView`; no in-screen parameter picker. Key Dependencies: `../domain/draconic.js` for the computation.

### `EclipsesView.messages.ts`
Domain Purpose: i18n text for the Eclipses tool. Responsibility: English/Dutch strings for the search form, eclipse type/kind labels, and natal-contact wording. Key Dependencies: none; consumed by `EclipsesView.tsx`.

### `EclipsesView.tsx`
Domain Purpose: the Eclipses tool — finds solar/lunar eclipses and, optionally, which of a person's natal points each touches. Responsibility: runs the eclipse search over a year span and renders results as a sortable table. Key Dependencies: `../astrology/eclipses.js` for the search; `../domain/chart-compute.js` for the chosen person's natal points.

### `ElectionalView.messages.ts`
Domain Purpose: i18n text for the Electional Search tool. Responsibility: English/Dutch strings for the search form, result columns, and the traditional rule labels/explanations. Key Dependencies: none; consumed by `ElectionalView.tsx`.

### `ElectionalView.tsx`
Domain Purpose: the Electional Search tool — ranks candidate times to begin something by traditional rules. Responsibility: runs the search over a date span and place, and renders ranked time windows as a table. Key Dependencies: `../astrology/electional.js` for the rule engine; `BirthPlaceSearch.js` for the place picker.

### `EntryLabel.tsx`
Domain Purpose: makes raw corpus keys readable to admin reviewers. Responsibility: renders a corpus entry named by its meaning (e.g. "Sun in the 3rd house") with the raw key shown beneath. Key Dependencies: `placement-label.js` for the meaning lookup.

### `EphemerisProviderContext.tsx`
Domain Purpose: provides the one shared Swiss Ephemeris engine instance to the whole app. Responsibility: mounts a single Web Worker-backed `EphemerisProvider` at the app root and exposes it (plus any init error) via context. Key Dependencies: `../ephemeris/client.js` for the worker-based provider implementation.

### `ExtendedSettingsPanel.messages.ts`
Domain Purpose: i18n text for the chart's Extended Settings modal. Responsibility: English/Dutch strings for presets, house-system/zodiac/body/aspect/wheel-colour controls, and their explanatory copy. Key Dependencies: none; consumed by `ExtendedSettingsPanel.tsx`.

### `ExtendedSettingsPanel.tsx`
Domain Purpose: lets a user change how a chart is calculated and drawn. Responsibility: renders the Extended Settings modal (house system, zodiac/ayanamsa, visible points/aspects, orbs, wheel colours, rulership/symbol device preferences) as a draft applied via "Apply and redraw". Key Dependencies: `../chart/extended-settings.js`/`../chart/extended-settings-presets.js` for the settings shape and presets; `../astrology/houses.js`/`../astrology/ayanamsas.js` for option lists.

### `FocusInterpretation.messages.ts`
Domain Purpose: i18n text for the Tier 2 placement-interpretation feature. Responsibility: English/Dutch strings for the consent checkbox, generate button, errors, and saved-interpretation history. Key Dependencies: none; consumed by `FocusInterpretation.tsx`.

### `FocusInterpretation.tsx`
Domain Purpose: Tier 2's "interpret the tensions of this placement" feature (ADR 0003). Responsibility: renders the consent-gated AI-interpretation request for a selected placement, and lists past interpretations for that same placement. Key Dependencies: `../interpretation/tier2-client.js` for the generate/list/get calls; `../interpretation/focus-context-schema.js` for the request shape.

### `HarmonicView.messages.ts`
Domain Purpose: i18n text for the Harmonic & Varga charts screen. Responsibility: English/Dutch strings for the divisional-chart preset picker, custom-harmonic input, and houses-undefined warning. Key Dependencies: none; consumed by `HarmonicView.tsx`.

### `HarmonicView.tsx`
Domain Purpose: shows a person's harmonic or Vedic Varga (divisional) chart. Responsibility: lets the user pick a named Varga preset or custom harmonic number, computes it, and renders it via the shared `ChartDataView`. Key Dependencies: `../astrology/harmonics.js` for `VARGA_PRESETS`; `../domain/harmonic.js` for the computation.

### `HoraryView.messages.ts`
Domain Purpose: i18n text for the Horary chart tool. Responsibility: English/Dutch strings for the casting form and the traditional considerations-before-judgment list. Key Dependencies: none; consumed by `HoraryView.tsx`.

### `HoraryView.tsx`
Domain Purpose: the Horary chart tool — casts a chart for when a question was asked and checks it against traditional considerations. Responsibility: casts the chart from entered date/time/place, evaluates considerations, and reports fitness for judgment (not an answer). Key Dependencies: `../astrology/horary.js` for the considerations logic; `../domain/horary.js` for the chart computation; the shared `ChartDataView`.

### `LanguageToggle.messages.ts`
Domain Purpose: i18n text for the language toggle button. Responsibility: English/Dutch accessible-label string for the button. Key Dependencies: none; consumed by `LanguageToggle.tsx`.

### `LanguageToggle.tsx`
Domain Purpose: lets a user switch the app's UI language. Responsibility: renders a single cycling button over the available corpus locales, backed by the shared `useLocale()` store. Key Dependencies: `./locale.js` for the shared locale store; `../interpretation/schema.js` for `CORPUS_LOCALES`.

### `PdfExportBuilder.tsx`
Domain Purpose: the custom PDF export builder (#441). Responsibility: lets a user tick which sections (birth record, interpretation, chart types, synastry, composite), each with its own options, go into one built PDF document. Key Dependencies: `../domain/pdf-export-sections.js` for selection/preset logic; dynamically imports `pdf-export-plan.js`/`pdf-export-render.js` (and their jsPDF/svg2pdf.js/jspdf-autotable dependencies) only when "Build PDF" is clicked.

### `People.messages.ts`
Domain Purpose: i18n text for the People list screen. Responsibility: English/Dutch strings for person creation, the incomplete-birth-record hint, and the deleted/restore section. Key Dependencies: none; consumed by `People.tsx`.

### `People.tsx`
Domain Purpose: the app's landing/home screen. Responsibility: lists people, creates new ones, and manages deleted (tombstoned) people with restore/purge. Key Dependencies: `store-context.js` for the local IndexedDB-backed store; `people-list.js` for ordering/summarizing people.

### `PeriodicTransitView.messages.ts`
English/Dutch message catalogue for the daily/weekly/monthly/yearly transit forecast screen. Co-located with and consumed by `PeriodicTransitView.tsx` via `useMessages()`.

### `PeriodicTransitView.tsx`
Daily/weekly/monthly/yearly transit forecast screen for a saved person, including solar/lunar and other planetary returns, as of a chosen date. Pulls `domain/periodic-transit.js` and `domain/planetary-return.js` for the forecast data, `astrology/transit-importance.js` for filtering/ranking, and `interpretation/compose.js` for fallback sentences; renders via `SortableTable` and `TransitFilterPanel`.

### `PersonForm.messages.ts`
English/Dutch message catalogue for the birth-data entry/edit form. Co-located with and consumed by `PersonForm.tsx` via `useMessages()`.

### `PersonForm.tsx`
The birth-data entry/edit form (name, place, date/time, calendar/timezone overrides, notes), with resolved-moment feedback and delete. Thin wiring over `domain/person-form.ts`'s draft/validation/mutation rules and `time/resolve.ts`'s offset resolution; the actual decisions about validity live outside this component.

### `PersonNotFound.tsx`
Shared "no person with that id" fallback screen reused verbatim by every per-person route whose `personId` doesn't resolve. Depends only on `shared.messages.ts` for its text.

### `ProfectionsView.messages.ts`
English/Dutch message catalogue for the annual/monthly profections screen. Co-located with and consumed by `ProfectionsView.tsx` via `useMessages()`.

### `ProfectionsView.tsx`
Annual and monthly profections screen for one person, as of a chosen date, with the Lord of the Year/Month and profected-house meanings. Pulls `domain/profections.ts` for the calculation, `RulershipSetting`/`rulership-setting.ts` for the ruler choice, and `wheel-corpus.ts`/`interpretation/compose.ts` for the house-meaning text.

### `ProgressionsView.messages.ts`
English/Dutch message catalogue for the secondary/tertiary/minor progressions screen. Co-located with and consumed by `ProgressionsView.tsx` via `useMessages()`.

### `ProgressionsView.tsx`
Secondary, tertiary and minor progressions screen for one person, as of a chosen date, with progressed positions and progressed-to-natal contacts. Pulls `domain/secondary-progression.ts` and `domain/minor-progression.ts` for the calculations and `domain/chart-tables.ts` for row shaping.

### `PwaStatus.messages.ts`
English/Dutch message catalogue for the PWA update-ready and offline-cache-warming status banner. Co-located with and consumed by `PwaStatus.tsx` via `useMessages()`.

### `PwaStatus.tsx`
Global, every-screen banner surfacing a waiting service-worker update and the offline ephemeris-cache warming/failure state. Depends on `pwa/register.ts` and `pwa/warm-status.ts` for the underlying signals.

### `RectificationView.messages.ts`
English/Dutch message catalogue for the birth-time rectification screen. Co-located with and consumed by `RectificationView.tsx` via `useMessages()`.

### `RectificationView.tsx`
Birth-time rectification screen: tests candidate birth times for a known date/place against dated life events and ranks them by solar-arc/transit contact score, as a narrowing aid rather than a verdict. Pulls `domain/rectification.ts` for the search and `astrology/signs.js` for display; can pre-fill from a stored person.

### `RelationshipSummary.messages.ts`
English/Dutch message catalogue for the grouped relationship-themes summary panel (themes, house overlays, Tier 2 AI reading). Co-located with and consumed by `RelationshipSummary.tsx` via `useMessages()`.

### `RelationshipSummary.tsx`
Grouped, ranked relationship-themes summary shown above Synastry's aspects table: strongest contacts by theme, house overlays, a harmonious/challenging count, and an opt-in Tier 2 AI-customised relationship reading. Pulls `domain/relationship-themes.ts` and `domain/house-overlays.ts` for the free content, and `interpretation/tier2-client.ts` for the AI panel.

### `ReportScreen.messages.ts`
English/Dutch message catalogue for the standalone written-report route screen. Co-located with and consumed by `ReportScreen.tsx` via `useMessages()`.

### `ReportScreen.tsx`
Standalone written-report route (`#/report/:id`) for one person: loads natal `ChartData` and delegates all rendering to `ReportView.tsx`, with no wheel, export, or sub-tabs. Depends on `domain/chart-compute.ts` for the chart data.

### `ReportView.messages.ts`
English/Dutch message catalogue for the report-rendering view, its provenance toggle, and the Tier 2 AI-customized interpretation panel. Co-located with and consumed by `ReportView.tsx` via `useMessages()`.

### `ReportView.tsx`
Renders an interpretation `Report`'s sections/paragraphs with a "show provenance" toggle, plus the opt-in Tier 2 AI-customized interpretation sub-tab (grounded restyle or freeform full-chart modes). Pulls `interpretation/report.ts` for assembly, `interpretation/corpus-client.ts` for the runtime corpus chunk (not the full `CORPUS`), and `interpretation/tier2-client.ts` for the AI panel; used by `ChartView.tsx`, `ReportScreen.tsx`, `ReturnView.tsx` and `CompositeView.tsx`.

### `ReturnView.messages.ts`
English/Dutch message catalogue for the solar/lunar return chart screens. Co-located with and consumed by `ReturnView.tsx` via `useMessages()`.

### `ReturnView.tsx`
Solar and lunar return chart screens: picks the return year/date and casting place, computes the return chart via `domain/return-chart.ts`, and renders it through `ChartDataView` plus a table of the return's natal contacts.

### `RulershipSetting.messages.ts`
English/Dutch message catalogue for the planetary-rulers (modern/traditional/both) preference control. Co-located with and consumed by `RulershipSetting.tsx` via `useMessages()`.

### `RulershipSetting.tsx`
Device-preference control for choosing modern/traditional/both planetary rulers, reused on every screen that shows a ruler, dignity, or dispositor (chart extended settings, transit filter, profections). Writes the shared preference via `rulership-setting.ts` and reads choices from `astrology/rulership.ts`.

### `SetPasswordForm.messages.ts`
English/Dutch message catalogue for the one-time-link password-set/reset form. Co-located with and consumed by `SetPasswordForm.tsx` via `useMessages()`.

### `SetPasswordForm.tsx`
Unauthenticated form for setting a new account's first password or resetting one, from an admin-issued one-time link token. Depends on `sync/auth-client.ts` for the request; deliberately outside the local-store context.

### `SetupForm.messages.ts`
English/Dutch message catalogue for the first-boot admin-account bootstrap form. Co-located with and consumed by `SetupForm.tsx` via `useMessages()`.

### `SetupForm.tsx`
Unauthenticated first-boot form for creating the admin account from the server-log bootstrap link token. Depends on `session-context.tsx`'s `setup()` call; deliberately outside the local-store context.

### `SharedChartView.messages.ts`
English/Dutch message catalogue for the no-account, link-only shared-chart screen. Co-located with and consumed by `SharedChartView.tsx` via `useMessages()`.

### `SharedChartView.tsx`
Renders a chart entirely from a share link's URL query — no local store, no saved person, no account; everything is recomputed in the browser from `domain/chart-share.ts`'s decoded data via `domain/chart-compute.ts`.

### `SolarArcView.messages.ts`
English/Dutch message catalogue for the solar arc directions screen. Co-located with and consumed by `SolarArcView.tsx` via `useMessages()`.

### `SolarArcView.tsx`
Solar arc directions screen for one person, as of a chosen date, with directed positions and directed-to-natal contacts including exact-date timing. Pulls `domain/solar-arc-directions.ts` for the calculation; a separate screen from `ProgressionsView.tsx` because its row shapes (exact-date, no speed/retrograde) differ.

### `SortableTable.messages.ts`
English/Dutch message catalogue for the generic sortable data table's Copy/Download controls. Co-located with and consumed by `SortableTable.tsx` via `useMessages()`.

### `SortableTable.tsx`
Generic, reusable data table with sortable column headers, a Copy-to-clipboard button, and a CSV download, used across nearly every tabular view in the app. Thin wiring over `table-sort.ts`'s sorting/serialization logic and `download.ts`.

### `SymbolSetting.messages.ts`
English/Dutch message catalogue for the symbol-class, glyph-weight, and glyph-variant preference controls. Co-located with and consumed by `SymbolSetting.tsx` via `useMessages()`.

### `SymbolSetting.tsx`
Device-preference controls for symbol class (drawn/Unicode/text), glyph line weight, and Uranus/Pluto glyph variants, so every wheel, grid, diagram and table follows at once. Writes preferences via `symbol-setting.ts` and `glyph-variant-setting.ts`, reading option sets from `chart/symbol-class.ts`, `chart/glyph-weight.ts` and `chart/glyph-variants.ts`.

### `SymbolToggle.messages.ts`
English/Dutch message catalogue for the header's one-press drawn/text-only symbol toggle. Co-located with and consumed by `SymbolToggle.tsx` via `useMessages()`.

### `SymbolToggle.tsx`
Header one-press switch between drawn glyph symbols and text-only ones, so a reader who needs text doesn't have to find a chart's Extended settings first. Writes the same device preference as `SymbolSetting.tsx` via `symbol-setting.ts`.

### `SynastryView.messages.ts`
English/Dutch message catalogue for the two-person synastry bi-wheel screen. Co-located with and consumed by `SynastryView.tsx` via `useMessages()`.

### `SynastryView.tsx`
Synastry bi-wheel screen comparing a saved person against a second saved person picked in-screen: cross-chart aspects, ranked contacts, and interpretation text. Pulls `domain/synastry.ts` for the calculation, calls `chart/multi-wheel.ts`'s `renderMultiWheelSvg` directly (bypassing the single-chart wheel renderer), and renders `RelationshipSummary.tsx` for the grouped theme summary.

### `SyncBadge.messages.ts`
English/Dutch message catalogue for the always-visible sync-status badge. Co-located with and consumed by `SyncBadge.tsx` via `useMessages()`.

### `SyncBadge.tsx`
Always-visible, collapsible badge on every route answering "where does my data live, and is it safe?" — persistence, online, and sync-engine status. Depends on `session-context.tsx`'s sync engine and `status.ts`'s `describeStatus()`.

### `ThemeToggle.messages.ts`
English/Dutch message catalogue (and the `themeLabel()` text shape) for the light/dark/system theme toggle. Co-located with and consumed by `ThemeToggle.tsx` via `useMessages()`; also consumed directly by the pure `theme.ts`.

### `ThemeToggle.tsx`
Always-visible button cycling the light/dark/system theme override and persisting the choice for next time. Thin wiring over `theme-dom.ts` (DOM/storage) and `theme.ts` (cycle logic).

### `TransitFilterPanel.messages.ts`
English/Dutch message catalogue for the transit-filter control panel (presets, orb scale, aspect groups, body checkboxes). Co-located with and consumed by `TransitFilterPanel.tsx` via `useMessages()`.

### `TransitFilterPanel.tsx`
Controls deciding which transit contacts a screen shows (preset, orb scale, aspect groups, applying-only, per-body checkboxes), plus the `useTransitFilter` hook that persists the choice per context in `localStorage`. Reads/writes `astrology/transit-importance.ts`'s filter shapes; used by every transit/forecast screen.

### `TransitView.messages.ts`
English/Dutch message catalogue for the transit bi-wheel screen. Co-located with and consumed by `TransitView.tsx` via `useMessages()`.

### `TransitView.tsx`
Transit bi-wheel screen for one saved person against a chosen date: natal chart inner ring, transiting positions outer ring. Pulls `domain/transit.ts` for the calculation, `astrology/void-of-course.ts` for the Moon note, and calls `chart/multi-wheel.ts`'s `renderMultiWheelSvg` directly, same as `SynastryView.tsx`.

### `WheelSelectionText.tsx`
Renders the interpretation corpus text for whatever body/sign/house/aspect is currently selected on a chart wheel, under the selection panel's facts. Pulls `interpretation/compose.ts`'s `resolvePlacementText` and `interpretation/selection.ts`, fetching the corpus lazily via `wheel-corpus.ts`.

### `admin-nav.ts`
Pure logic for the admin tab strip: which admin screens exist, their routes, and which tab a given route belongs to. Kept apart from `AdminNav.tsx` (not in this slice) so the active-tab mapping is Vitest-testable without a DOM; depends on `route.ts`'s `Route` type.

### `app.css`
Astraya's global stylesheet: the dark-default/light-peer design-token palette (WCAG AA-checked), layout, and component styling for the whole app, with no webfonts per the Content Security Policy.

### `astro-names.messages.ts`
English/Dutch display-name lookups for the domain layer's stable English astrological identifiers (sign names, body/pseudo-body keys, aspect keys), used throughout `src/ui/` wherever a chart-tables/astrology key needs to be shown to a reader.

### `bi-wheel-selection.ts`
Pure facts (what was clicked, which ring, how it relates across rings) for a bi-wheel's selection panel, with no wording — used by `TransitView.tsx` and `SynastryView.tsx`. Depends on `domain/chart-compute.ts`, `domain/chart-tables.ts`, `chart/aspect-web.ts` and `interpretation/selection.ts`.

### `chart-raster.ts`
Rasterizes a standalone wheel SVG to a PNG `Blob` at a chosen pixel size for PNG chart export, via an off-DOM `Image`/`canvas` pair rather than a new rendering dependency.

### `chart-sections.ts`
Domain Purpose: defines the Charts page's two URL axes (chart type and section) so the header menu, type selector, and tabs agree on vocabulary. Responsibility: parses/builds the `?type=`/`?section=` query params and supplies tab labels. Key Dependencies: `ChartView.messages.ts` for labels.

### `cycles.ts`
Domain Purpose: backs the planetary-cycles screen (#410) with the body/aspect presets a user can search. Responsibility: defines presets, applies a motion (retrograde/direct) filter, and shapes raw mutual-aspect events into display rows. Key Dependencies: `astrology/bodies.js`, `astrology/mutual-aspects.js`, `astrology/signs.js`, `time/julian.js`.

### `download.ts`
Domain Purpose: the single shared mechanism every export feature (#67/#68) uses to save in-memory content to disk. Responsibility: creates a temporary object URL/anchor, triggers a click, then revokes it. Key Dependencies: none (browser APIs only).

### `eclipses.ts`
Domain Purpose: backs the eclipses screen (#404). Responsibility: caps the searchable span and turns raw `Eclipse` records into display rows with sign/position text and optional natal contacts. Key Dependencies: `astrology/eclipses.js`, `astrology/signs.js`, `time/julian.js`.

### `electional.ts`
Domain Purpose: backs the electional (best-time-to-begin) screen (#409). Responsibility: parses the search form into a validated `ElectionSearch`, and formats result windows (UTC time, duration) for the table. Key Dependencies: `astrology/electional.js`, `time/julian.js`, `place-fields.ts`.

### `export-registry.tsx`
Domain Purpose: lets the header's global Export menu offer "This page"'s exportable items without knowing which screens exist. Responsibility: two React contexts (items/actions) a mounted screen registers its export items into, and unregisters on unmount. Key Dependencies: none beyond React.

### `extended-settings-store.ts`
Domain Purpose: holds the chart's confirmed Extended settings (house system, zodiac, orbs, point visibility) shared across every chart-drawing screen for a visit. Responsibility: an in-memory `useSyncExternalStore`-backed store, reset per page load, never persisted. Key Dependencies: `chart/extended-settings.js`.

### `extended-settings-summary.ts`
Domain Purpose: lets the Extended settings trigger button (#442) summarize what was changed without opening the panel. Responsibility: diffs an `ExtendedSettings` value against the defaults and lists which fields changed. Key Dependencies: `chart/extended-settings.js`.

### `format.ts`
Domain Purpose: locale-aware formatting (#158) for values that aren't fixed strings — dates and geographic coordinates. Responsibility: today's date as an input value, and lat/lon as localized decimal degrees + hemisphere letter. Key Dependencies: `interpretation/schema.js` (Locale type only — framework-free so non-UI modules can call in).

### `forward-geocode.ts`
Domain Purpose: resolves a free-text place name into candidate coordinates for the birth-place search field (#290). Responsibility: queries whichever provider is configured (MapTiler or Nominatim) and validates/normalizes each candidate result. Key Dependencies: `geocode-provider.ts`.

### `geocode-provider.ts`
Domain Purpose: decides and configures which geocoding backend this deployment uses (#290/#291/#294). Responsibility: precedence logic (self-hosted server > MapTiler key > public Nominatim default), URL building, and a one-time console warning when the public default fails. Key Dependencies: build-time env vars (`VITE_NOMINATIM_URL`, `VITE_MAPTILER_API_KEY`).

### `glyph-variant-setting.ts`
Domain Purpose: device preference (#419) for which glyph form (e.g. Uranus/Pluto variant) and line weight charts draw. Responsibility: persists to localStorage, applies on load, exposes a React hook, syncs cross-tab. Key Dependencies: `chart/glyph-variants.js`, `chart/glyph-weight.js`.

### `horary.ts`
Domain Purpose: backs the horary (question-chart) screen (#406). Responsibility: parses the question form's date/time/coordinates into a `BirthMomentInput`, and supplies "now" defaults and the offered house systems. Key Dependencies: `time/types.js`, `place-fields.ts`.

### `last-person.ts`
Domain Purpose: remembers the most recently viewed person (#453) so person-unaware tool pages can still show nav tabs. Responsibility: localStorage-backed id store with a React hook, cross-tab sync. Key Dependencies: none beyond React.

### `locale.ts`
Domain Purpose: the single app-wide UI locale store (#158) driving every message catalogue and the interpretation report's language. Responsibility: get/set/subscribe to the current `Locale`, persisted under a legacy storage key. Key Dependencies: `interpretation/schema.js` (Locale, CORPUS_LOCALES).

### `markdown.tsx`
Domain Purpose: renders Astraya's own `CHANGELOG.md` in-app without leaving for GitHub. Responsibility: a deliberately small, dependency-free Markdown-subset renderer (headings/lists/paragraphs/bold/code/links) that never uses `dangerouslySetInnerHTML`. Key Dependencies: none beyond React.

### `messages.ts`
Domain Purpose: the generic consumption-side counterpart to every co-located `*.messages.ts` file. Responsibility: `useMessages()` hook reading the current locale's half of any `{ en, nl }` catalogue. Key Dependencies: `locale.ts`.

### `moment-labels.ts`
Domain Purpose: shared wording for a resolved birth moment's provenance and warnings, so the birth-data form and the when-and-where panel never describe the same thing differently. Responsibility: plain English constant tables keyed by `time/types.js`'s unions. Key Dependencies: `time/types.js`.

### `oidc-pkce.ts`
Domain Purpose: client-side PKCE flow for the Authentik OIDC sign-in redirect (#75). Responsibility: generates/stashes state/nonce/code_verifier in sessionStorage, and consumes the callback once, clearing the one-time code from the URL. Key Dependencies: Web Crypto, sessionStorage.

### `pdf-export-plan.ts`
Domain Purpose: builds the ordered content plan for the PDF export feature (#441) from a user's selection. Responsibility: reuses the same domain compute functions and table-column definitions the on-screen chart/synastry/composite views use to build a declarative, jsPDF-free `PdfPlan`. Key Dependencies: `domain/chart-compute.js`, `domain/chart-tables.js`, `domain/synastry.js`, `domain/composite.js`, `chart/chart-sheet.js`, `chart/multi-wheel.js`, `interpretation/report.js`, `interpretation/tier2-client.js`.

### `pdf-export-render.ts`
Domain Purpose: draws a finished `PdfPlan` into an actual PDF document for #441. Responsibility: lays out pages, tables (autotable) and vector chart SVGs (svg2pdf.js) via jsPDF, substituting WinAnsi-safe text for astrological glyphs. Key Dependencies: `pdf-export-plan.ts`, `chart/symbol-text.js`, `domain/export-filename.js`; jsPDF/svg2pdf.js/jspdf-autotable (lazy-loaded, browser-only).

### `pdf-export.messages.ts`
Domain Purpose: en/nl text for the PDF export builder screen (#441). Responsibility: message catalogue for `PdfExportBuilder.tsx` and read directly by `pdf-export-plan.ts`. Key Dependencies: `domain/pdf-export-sections.js`, `chart-sections.ts`, `domain/person.js` (for type-safe label records).

### `people-list.messages.ts`
Domain Purpose: en/nl text for how an incomplete person record is described. Responsibility: message catalogue for `people-list.ts`'s `summary()`. Key Dependencies: none.

### `people-list.ts`
Domain Purpose: how a person reads in the people list — never implying a chart is castable when it isn't. Responsibility: sorts people by name, flags caveated time resolutions, and composes a one-line summary of what's on record. Key Dependencies: `time/resolve.js`, `domain/person.js`, `people-list.messages.ts`.

### `person-nav.ts`
Domain Purpose: backs the persistent per-person tab bar (#234) and its grouped subtab families (#398). Responsibility: the fixed tab list, family groupings, and which tab/family a route is on. Key Dependencies: `route.ts`.

### `person-screens.ts`
Domain Purpose: lets `App.tsx` lazy-load every person-scoped screen behind one dynamic `import()` (#338) instead of ten separate chunks. Responsibility: a barrel re-export; must never be statically imported elsewhere. Key Dependencies: every person-scoped screen component.

### `place-fields.ts`
Domain Purpose: shared coordinate parsing for the horary and electional forms. Responsibility: parses a decimal lat/lon (accepting `.` or `,`) and range-validates it. Key Dependencies: none.

### `placement-label.ts`
Domain Purpose: turns a corpus key/placement (#428) into human-readable wording for the admin corpus screens. Responsibility: builds labels, category/tier/tag explanations, and a reader-expected sort order for every corpus placement category. Key Dependencies: `astrology/aspects.js`, `astrology/bodies.js`, `astrology/signs.js`, `interpretation/schema.js`, `astro-names.messages.ts`.

### `rectification.ts`
Domain Purpose: backs the rectification (unknown-birth-time) screen (#408). Responsibility: parses the form's birth date, candidate time window, and dated life events into a validated search request. Key Dependencies: `domain/rectification.js`, `place-fields.ts`.

### `relationship-summary-pdf-text.ts`
Domain Purpose: flattens the grouped, ranked relationship summary (#422) into PDF-friendly paragraphs for the export's Synastry section. Responsibility: joins each theme/overlay group's facts into one paragraph per group, reusing (not duplicating) the underlying classification logic. Key Dependencies: `domain/relationship-themes.js`, `domain/house-overlays.js`, `domain/synastry.js`, `RelationshipSummary.messages.ts`.

### `report-provenance.ts`
Domain Purpose: backs #62's "why this text?" provenance toggle under a report paragraph. Responsibility: formats a `ReportParagraph`'s source/placement/salience-factors into short plain-English strings. Key Dependencies: `astrology/bodies.js`, `astrology/aspects.js`, `astrology/signs.js`, `interpretation/report.js`, `interpretation/rules.js`.

### `result-basis-label.ts`
Domain Purpose: describes what a saved AI/local interpretation (#423) was based on, in the interface language. Responsibility: composes a kind-and-basis phrase (e.g. "AI interpretation of Mars (natal)") per locale, enforced to cover every `ResultKind`. Key Dependencies: `interpretation/result-basis.js`, `astro-names.messages.ts`, `placement-label.ts`.

### `route.ts`
Domain Purpose: the single source of truth for every hash route in the app. Responsibility: parses a location hash into a typed `Route`, including legacy aliases and one-time-token query extraction. Key Dependencies: `domain/id.js`, `chart-sections.ts`.

### `rulership-setting.ts`
Domain Purpose: device preference (#426) for which planets rule which signs. Responsibility: localStorage-backed store with an in-memory fallback, a React hook, and cross-tab/cross-component sync via events. Key Dependencies: `astrology/rulership.js`.

### `saved-time.ts`
Domain Purpose: formats a saved interpretation's stored UTC instant (#423) as the reader's local written-out time. Responsibility: builds a locale- and timezone-aware date/time string from `Intl.DateTimeFormat` parts. Key Dependencies: `interpretation/schema.js` (Locale type).

### `session-context.tsx`
Domain Purpose: owns which account's local store is open and the whole sign-in/sign-out/sync-engine lifecycle. Responsibility: React context managing anonymous vs. per-account IndexedDB stores, OIDC/password auth, server-side session invalidation recovery, and the one-time anonymous-data adoption prompt (#109). Key Dependencies: `store/store.js`, `sync/auth-client.js`, `sync/engine.js`, `oidc-pkce.ts`, `demo-mode.js`.

### `shared.messages.ts`
Domain Purpose: common en/nl strings reused verbatim across many unrelated components (#158). Responsibility: message catalogue consumed via `useMessages()` wherever a shared string (back/people/not-found/password fields) is needed. Key Dependencies: none.

### `status.messages.ts`
Domain Purpose: en/nl text for the sync-status indicator's pure formatting functions. Responsibility: message catalogue read directly by `status.ts` (not via `useMessages`, since those are plain functions). Key Dependencies: none.

### `status.ts`
Domain Purpose: decides what the sync-status indicator says and why (#101), so a user can always tell whether their data exists anywhere but this device. Responsibility: computes tone/label/detail/action from sync/persistence/pending/quarantine state, with deliberate rules against false reassurance. Key Dependencies: `store/persist.js`, `status.messages.ts`.

### `store-context.tsx`
Domain Purpose: the React adapter exposing the plain-object op-log store to components. Responsibility: context + `useSyncExternalStore`-based hooks (`useStore`, `useStoreState`) that re-render correctly under concurrent rendering. Key Dependencies: `store/fold.js`, `store/store.js`, `trace.js`. (Does not decide which store to open — that's `session-context.tsx`.)

### `symbol-setting.ts`
Domain Purpose: device preference (#419) for which symbol class (glyphs/Unicode/text) charts and tables draw. Responsibility: localStorage-backed store applied at module load, with a React hook and cross-tab sync. Key Dependencies: `chart/symbol-class.js`.

### `synastry-text.ts`
Domain Purpose: resolves the interpretation text for one Synastry aspect row (#422). Responsibility: finds the right corpus entry regardless of which person's body is "A" in the row, and reports which side the text speaks from. Key Dependencies: `interpretation/compose.js`, `interpretation/schema.js`.

### `table-sort.ts`
Domain Purpose: the generic sorting/export engine behind every data table in the app (#44). Responsibility: column-based sort toggling/application, and TSV/CSV serialization. Key Dependencies: none (deliberately domain-agnostic).

### `theme-dom.ts`
Domain Purpose: the DOM/storage half of the light/dark theme override (#70). Responsibility: reads/writes the stored theme choice and applies it to `document.documentElement`. Key Dependencies: `theme.ts`.

### `theme.ts`
Domain Purpose: pure theme-selection logic for the light/dark override (#70). Responsibility: the `Theme` type, its cycle order, and label lookup — DOM-free so it's Vitest-testable. Key Dependencies: `ThemeToggle.messages.ts`.

### `tools-nav.ts`
Domain Purpose: backs the header's Tools menu (#421) — the five calculator screens not scoped to one person. Responsibility: the tool list and which tool a route is on. Key Dependencies: `route.ts`.

### `use-exclusive-open.ts`
Domain Purpose: shared open/close behavior for a row of dropdown menu buttons (#417). Responsibility: one-at-a-time opening, closing on outside click/Escape/Tab-out/page-change, as a reusable hook. Key Dependencies: none beyond React.

### `void-of-course-text.ts`
Domain Purpose: composes the void-of-course Moon sentence on the Transits screen (#402). Responsibility: formats UTC times and builds both the void and active-Moon sentence variants. Key Dependencies: `astrology/bodies.js`, `astrology/signs.js`, `astrology/void-of-course.js`, `time/julian.js`, `TransitView.messages.ts`.

### `wheel-corpus.ts`
Domain Purpose: supplies the interpretation corpus to the chart wheel's click-to-select panel (#415). Responsibility: fetches and per-language caches the corpus so repeat selections render instantly; evicts failed loads so a flaky network doesn't break the panel permanently. Key Dependencies: `interpretation/corpus-client.js`.

### `wheel-interaction.ts`
Domain Purpose: the click-to-isolate interaction shared by every chart wheel (#400/#412/#418/#448). Responsibility: determines what was clicked from the wheel's own markup data-attributes and dims everything else, without reading the underlying chart data. Key Dependencies: `chart/body-id.js` (reads rendered SVG markup, not domain data).

### `wheel-selection.ts`
Domain Purpose: builds heading text for interpretation entries shown under a wheel click-selection (#415). Responsibility: composes a short, localized heading naming which placement a shown text belongs to. Key Dependencies: `astrology/signs.js`, `interpretation/schema.js`, `astro-names.messages.ts`.

### `year-range.ts`
Domain Purpose: shared knowledge of the shipped ephemeris data's valid year range. Responsibility: exposes the min/max years and clamps a typed year into range, used by the planetary-cycles and eclipse screens. Key Dependencies: none.
