# Astraya UI/UX Migration Plan

**Status:** Implementation plan for the target experience  
**Audience:** Coding agents and human contributors  
**Related documents:** [Design and usability audit](UI-UX_REVIEW.md) · [Normative UI/UX guide](UI-UX_GUIDELINES.md)

This document explains how to move the current interface to Astraya's target UI/UX without changing astrological calculations, interpretation content, persistence guarantees, or export accuracy. The audit explains the problems and priorities. The guide defines how the finished product must behave. This plan defines implementation order, integration points, migration boundaries, and acceptance criteria.

The target is a coherent redesign. Existing UI patterns are implementation evidence, not patterns that must be preserved. Keep existing behavior only when it remains correct under the normative guide.

## 1. Outcomes that are not negotiable

The migration is complete only when all of these statements are true:

1. A person is the persistent context for person-specific work, and switching people does not require returning to the People list.
2. Navigation is grouped by user goal. It has no third menu level and no generic collection of unrelated feature links.
3. Charts has one application destination, one chart-type control, and one local view navigation.
4. The on-screen chart is split into Wheel, Aspects, Placements, and Patterns & condition views. The combined chart sheet remains available for export.
5. Selecting a sign, body, cusp, house, or aspect updates one nearby `SelectionInspector`. It appears beside the visualization when both remain usable and immediately below otherwise.
6. Durable account and device preferences live in a stable Preferences workspace. Page and result settings use inline controls or one staged modal according to their size.
7. Person facts, account preferences, device preferences, calculation profiles, saved-chart overrides, page state, and request consent remain separate scopes.
8. Text, date, number, select, checkbox, radio, switch, disclosure, dialog, status, empty-state, and table behavior comes from the shared component layer.
9. Astrocartography exposes one Map settings dialog. Line types, bodies, Local Space, and relocation apply together. “Extended” is removed.
10. Obsolete route shapes, duplicated navigation, and superseded controls are removed rather than maintained as compatibility paths.
11. Every existing person record remains readable and editable from both the local IndexedDB operation log and the synchronized server operation log.
12. Every changed surface works in English and Dutch, light and dark themes, keyboard-only use, and the required viewport matrix.

## 2. Target information architecture

Use a responsive workspace shell. On wide layouts, render a collapsible rail and a focused content area. On narrow layouts, render the same navigation as a drawer. Do not maintain separate desktop and mobile navigation definitions.

```text
Astraya
├ People
│ └ Current person: Ada Lovelace [switch]
│   ├ Overview
│   ├ Edit birth record
│   ├ Chart
│   ├ Interpretation
│   ├ Timing
│   │ ├ Transits
│   │ ├ Forecast
│   │ ├ Profections
│   │ ├ Progressions
│   │ ├ Solar arc
│   │ └ Primary directions
│   ├ Relationships
│   │ ├ Synastry
│   │ └ Composite
│   └ Location
│     └ Astrocartography
├ Explore
│ ├ Sky & cycles
│ │ ├ Planetary cycles
│ │ └ Eclipses
│ ├ Questions & planning
│ │ ├ Horary
│ │ └ Electional
│ └ Birth data
│   └ Rectification
├ Documents
│ └ Build PDF
├ Preferences
└ Account / Admin when applicable
```

“Timing,” “Relationships,” and the Explore headings are grouping labels. On a desktop rail, their children may remain visible. In a narrow drawer they may expand once. Do not add another flyout or another row of submenus after navigation.

The content header always contains:

1. A title naming the feature and subject, such as **Natal chart · Ada Lovelace**.
2. A concise context line containing the effective calculation profile or other basis.
3. Actions that affect this page, including its export actions.
4. Advanced settings only when they affect this page or result.

## 3. Canonical routes and clean cutover

Keep hash routing because the built application must work as static files. New links should express the target hierarchy:

| Destination             | Canonical hash                                                        |
| ----------------------- | --------------------------------------------------------------------- |
| People                  | `#/people`                                                            |
| Person overview         | `#/people/:personId/overview`                                         |
| Edit birth record       | `#/people/:personId/birth-record`                                     |
| Chart view              | `#/people/:personId/charts/:chartType/:chartView`                     |
| Interpretation          | `#/people/:personId/interpretation`                                   |
| Timing technique        | `#/people/:personId/timing/:technique`                                |
| Relationship technique  | `#/people/:personId/relationships/:technique`                         |
| Astrocartography        | `#/people/:personId/location/astrocartography`                        |
| Global exploration tool | `#/explore/:tool`                                                     |
| PDF builder             | `#/documents/pdf`                                                     |
| Preferences section     | `#/preferences/:section`                                              |
| Admin                   | Preserve the existing `#/admin/*` hierarchy unless its scope changes. |

Use `natal`, `draconic`, `harmonic`, `solar-return`, and `lunar-return` for `:chartType`. Use `wheel`, `aspects`, `placements`, and `patterns` for `:chartView`.

Astraya has no production route history or external bookmarks to preserve. Replace the current route scheme in one coordinated cutover. [route.ts](../src/ui/route.ts) should parse and construct only the canonical routes after the shell migration lands. Remove obsolete path expressions, query parameters, route constructors, and compatibility branches. An obsolete or malformed hash may use the existing safe fallback to People/Home; do not redirect it to a guessed destination or keep aliases for it.

Move the content of the existing chart sections as follows:

| Existing section                      | Target view  | Optional target focus |
| ------------------------------------- | ------------ | --------------------- |
| Chart / omitted                       | `wheel`      | None                  |
| Aspects                               | `aspects`    | None                  |
| Positions                             | `placements` | `positions`           |
| Houses                                | `placements` | `houses`              |
| Derived points                        | `placements` | `derived-points`      |
| Shape                                 | `patterns`   | `shape`               |
| Dignities, dispositors, and condition | `patterns`   | `condition`           |

Because the hash identifies the application route, encode an optional in-view focus as a query parameter rather than a second hash. Scroll only after the destination heading exists, respect reduced motion, and move focus only when the user explicitly navigated to the subsection.

Add canonical route tests before changing navigation. Cover every target destination, route construction/parsing round trips, query handling, and invalid person IDs. Update or replace tests for obsolete routes in the same slice; obsolete paths should no longer be constructed or treated as supported behavior.

## 4. Persisted person-data compatibility

UI and route compatibility are intentionally discarded. Stored person data is the compatibility boundary and must survive unchanged.

Astraya does not store a person as one replaceable UI-shaped object. [person.ts](../src/domain/person.ts) materializes a person from field operations in the append-only log. The current fields are:

- `displayName`
- `civil` date and time
- `coordinates`
- `calendar`
- `offsetOverrideMinutes`
- `zoneOverride`
- `placeLabel`
- `timeAccuracy`
- `notes`
- `witness`, which records the timezone resolution used previously so later timezone-database drift can be detected

The UI migration must continue to read and write these fields through `Store.mutate()` and the existing domain helpers. Do not replace the store with component state, serialize a new person object directly, rename fields, regenerate person IDs, or clear the database during route migration.

Preserve these storage contracts:

1. [db.ts](../src/store/db.ts) remains the durable IndexedDB operation log, snapshot, and device metadata store. A UI-only migration does not require a database-version bump.
2. [ops.ts](../src/store/ops.ts)'s operation spine and current body meaning remain unchanged. Do not bump `OP_VERSION` for UI work.
3. [fold.ts](../src/store/fold.ts) remains the only path from operations to materialized people. Unknown, incomplete, deleted, restored, and purged records retain their current behavior.
4. [engine.ts](../src/sync/engine.ts) continues to push and pull the same records. The server relay in [routes.ts](../server/ops/routes.ts) remains an encrypted, user-scoped operation relay; it does not need a person-schema or route migration.
5. The redesigned Birth record form continues to use `draftFrom`, `validateDraft`, and `draftToMutations` from `domain/person-form.ts`. Changing field components must not change stored values.

Before the first redesigned person or shell screen lands, add a durable compatibility fixture containing a complete person plus an incomplete person. Verify all of the following:

- Opening an existing IndexedDB database preserves every operation, snapshot recovery, device ID, person ID, deletion state, and field value.
- Materialization returns the same `Person` values before and after the UI migration.
- The redesigned People, Overview, Birth record, and chart screens can read the fixture without rewriting it.
- Saving one edited field appends only the expected mutation and leaves every untouched field unchanged.
- Pulling the same fixture through the server sync path produces the same materialized people as the local fixture.
- Sign-out, sign-in, account adoption, route changes, and application reload preserve records according to the existing per-account database separation and adoption behavior. Only the existing explicit Remove local data or permanent-purge actions may delete them.

Keep the existing data-loss tests in `test/store-db.test.ts`, `test/store-fold.test.ts`, `test/store-store.test.ts`, and the synchronization tests. Add one UI-level compatibility test that seeds existing operation records rather than creating the person through the redesigned form; otherwise the test would prove only that the new writer can read its own output.

## 5. New component and metadata boundaries

### 5.1 Feature registry

Create `src/ui/feature-registry.ts` as a pure TypeScript source of user-facing feature metadata. A definition should include at least:

```ts
interface FeatureDefinition {
  readonly key: FeatureKey;
  readonly scope: 'person' | 'global' | 'document' | 'preferences' | 'admin';
  readonly group: FeatureGroup;
  readonly order: number;
  readonly routeKind: Route['kind'];
  readonly buildHref: (context: FeatureContext) => string;
  readonly requiresBirthMoment: boolean;
  readonly settingsMode: 'none' | 'inline' | 'staged-dialog' | 'workspace';
  readonly exportCapabilities: readonly ExportCapability[];
  readonly labelKey: FeatureLabelKey;
}
```

Derive person navigation, Explore navigation, active state, prerequisite handling, and page-export registration from this registry. During transition, [person-nav.ts](../src/ui/person-nav.ts) and [tools-nav.ts](../src/ui/tools-nav.ts) may adapt or re-export registry results so existing callers continue to compile. Delete duplicated arrays when the last caller moves.

Add an exhaustiveness test that fails when:

- A user-facing `Route` has no feature metadata.
- Two features claim the same key, order in one group, or canonical href.
- A feature refers to missing English or Dutch labels.
- A page export is registered for a feature that does not declare it.

### 5.2 Settings registry

Create `src/ui/settings-registry.ts` as pure metadata. Do not make it a second storage system. Existing stores remain responsible for values until each setting is deliberately migrated.

Each setting definition declares:

- Stable key and value version.
- Owner and scope: application, account, device, person, saved chart, page, or request.
- Default and reset target.
- Persistence and synchronization behavior.
- Editing surface and commit mode.
- Whether it is sensitive or included in share/export data.
- Parser, validator, and migration for persisted values.

Tests must reject combinations such as request consent with persistence, device presentation settings with account synchronization, or an immediately persisted setting inside a staged page dialog.

### 5.3 Shared UI primitives

Create `src/ui/primitives/` with its own `MAP.md`. Keep business logic outside these components. Begin with:

- `Button`
- `Field`, `TextField`, `DateField`, `NumberField`
- `Select`, `Combobox`
- `Checkbox`, `Radio`, `Switch`, `ChoiceGroup`, `OptionCards`
- `Dialog`, `Disclosure`
- `FilterSummary`
- `SelectionInspector`
- `StatusMessage`, `EmptyState`
- `DataTable`

Use real HTML inputs, buttons, links, fieldsets, tables, and dialogs. The primitive owns anatomy, states, keyboard behavior, and accessible relationships. The feature owns labels, options, validation rules, values, and domain consequences.

Do not create wrappers that merely rename raw elements. A primitive is ready when equivalent controls no longer need feature-specific state CSS or behavior.

## 6. Migration sequence

Implement the work in the following order. Each phase must leave the application releasable; do not open one branch containing the entire redesign.

### Phase 0 — Freeze behavior and record baselines

**Goal:** Protect calculations and important workflows before structural UI changes.

1. Record the current route, input, output, selection, export, and persistence behavior used by existing E2E tests.
2. Add tests for the canonical route contract before switching navigation. Existing route tests may be replaced in the same slice because the current hashes have no production compatibility requirement.
3. Add screenshots only for surfaces whose visual structure is about to change. Cover both themes at 390×844, 1280×800, and 1440×900. Use assertions for behavior and accessibility; do not use screenshots as the only test.
4. Record current eager bundle size and the lazy person-screen chunk.
5. Add the persisted-person compatibility fixture and prove it materializes identically from local and synchronized operation records.
6. Confirm all unrelated working-tree changes remain outside the UI migration.

**Complete when:** `npm run check`, the relevant existing Playwright tests, and the bundle-size check pass before the first UI change.

### Phase 1 — Tokens and shared controls

**Goal:** Stop visual and behavioral drift before moving screens.

Primary integration point: [app.css](../src/ui/app.css).

1. Introduce the semantic color, type, spacing, control, radius, elevation, and motion tokens defined in the audit.
2. Bind `color-scheme` to the effective application theme.
3. Implement `Field`, `TextField`, `DateField`, `NumberField`, `Select`, Checkbox, Radio, ChoiceGroup, OptionCards, and Button first.
4. Suppress browser-dependent number spinners only after the shared accessible stepper exists.
5. Implement the standard and compact sizes. Compact controls return to standard touch targets on coarse-pointer layouts.
6. Migrate one representative form, one filter, and one settings dialog before broad rollout. Recommended pilots are [PersonForm.tsx](../src/ui/PersonForm.tsx), [PrimaryDirectionsView.tsx](../src/ui/PrimaryDirectionsView.tsx), and [TransitFilterPanel.tsx](../src/ui/TransitFilterPanel.tsx).
7. Remove `.field-grid` as the source of control appearance. It may remain a layout class.

**Acceptance criteria:**

- Equivalent controls have identical label, help, error, focus, hover, disabled, busy, and sizing behavior.
- Date fields remain typeable and store ISO values independently of localized display.
- Number steppers expose named Increase/Decrease buttons and Arrow Up/Down behavior.
- English and Dutch labels fit without truncating controls.
- Both themes meet WCAG AA for every state.

### Phase 2 — Registries, canonical routes, and shell

**Goal:** Establish one information architecture before restyling individual feature pages.

Primary integration points: [route.ts](../src/ui/route.ts), [App.tsx](../src/ui/App.tsx), [AppNav.tsx](../src/ui/AppNav.tsx), [person-nav.ts](../src/ui/person-nav.ts), [tools-nav.ts](../src/ui/tools-nav.ts), and [export-registry.tsx](../src/ui/export-registry.tsx).

1. Add the feature registry and canonical route constructors.
2. Replace current parsing and route construction with the canonical routes in `route.ts`; remove old path and query forms in the same slice.
3. Create `WorkspaceShell`, `WorkspaceNav`, `PersonSwitcher`, and `PageHeader` components. Keep the skip link and one `<main>` landmark.
4. Create a person Overview screen. Complete people land there; incomplete/new people land on Edit birth record until prerequisites are met.
5. Replace the static current-person label with a searchable switcher. Preserve the current feature when the selected person meets its prerequisites; otherwise explain the requirement and route to the recovery action.
6. Move current-page exports into `PageHeader`. Move Build PDF to Documents. Move full-data exports to Preferences → Data & privacy.
7. Replace the generic Tools menu with the Explore groups. Global routes show **Return to Ada Lovelace** only as history and **Using Ada Lovelace** only when the tool consumes that person.
8. Collapse the desktop rail without losing labels to tooltips alone. On narrow screens use one drawer with the same DOM data and grouping.

**Acceptance criteria:**

- Users can identify the current person, feature, and basis within three seconds.
- Switching people takes at most two actions.
- Every primary feature is reachable through no more than one expandable group.
- Navigation active state, titles, breadcrumbs, and exports all come from the same feature metadata.
- Back, forward, reload, and newly generated shared links retain meaningful behavior.
- Escape, outside interaction, route change, and focus departure close temporary navigation and restore focus correctly.

### Phase 3 — Preferences and calculation profiles

**Goal:** Make scope, persistence, and defaults predictable.

1. Add `preferences` route variants to `Route` and lazy-load `PreferencesView.tsx` with `PreferencesView.messages.ts`.
2. Render General, Astrology defaults, Appearance & accessibility, and Data & privacy as stable subsections. Use ordinary links on wide layouts and the shared Select on narrow layouts if the subsection navigation cannot fit.
3. Migrate language, regional formatting, rulership, default calculation preset, house system, zodiac/ayanamsa, orbs, default filters, theme, symbols, glyphs, density, and motion to the settings registry.
4. Keep account values local-first. Synchronize them only when the account model supports it; never make offline use depend on sign-in.
5. Keep device presentation settings on the device. Do not upload them as account preferences.
6. Show save/sync state inline. Do not add a page-wide Apply, Done, or Cancel action.
7. Keep optional frequent shortcuts, such as theme, synchronized with the canonical setting rather than creating another source of truth.
8. Introduce the three versioned calculation profiles specified below. A profile contains zodiac/ayanamsa, house system, rulership, orbs, bodies/points, and aspects. Treat a profile as a complete reproducible snapshot rather than a partial preset laid over whatever values were selected previously.
9. Every calculated page displays its effective profile/basis and the source of overrides.

**Built-in profile contract:**

| Profile and stable ID                            | Zodiac and houses                      | Rulers      | Bodies and points                                                                 | Aspects and orbs                                                                 |
| ------------------------------------------------ | -------------------------------------- | ----------- | --------------------------------------------------------------------------------- | -------------------------------------------------------------------------------- |
| **Modern Western** `modern-western-v1`           | Tropical · Placidus                    | Modern      | Mean lunar node; mean Lilith; Chiron shown; Fortune, Vertex, and midpoints hidden | Five major aspects; no minor or additional-target aspects; Astraya standard orbs |
| **Traditional Western** `traditional-western-v1` | Tropical · Whole Sign                  | Traditional | Mean lunar node; mean Lilith; Fortune shown; Chiron, Vertex, and midpoints hidden | Five major aspects; no minor or additional-target aspects; Astraya standard orbs |
| **Sidereal (Lahiri)** `sidereal-lahiri-v1`       | Sidereal, Lahiri ayanamsa · Whole Sign | Traditional | Mean lunar node; mean Lilith; Fortune, Chiron, Vertex, and midpoints hidden       | Five major aspects; no minor or additional-target aspects; Astraya standard orbs |

The five major aspects are conjunction, sextile, square, trine, and opposition. For these profiles, **Astraya standard orbs** means 7° for the non-sextile major aspects, widened to 10° when either body is the Sun or Moon; 4° for sextile, widened to 5.5° for a luminary; a configured minor-aspect orb of 2.5° with all minor aspects disabled; and a 0% scale adjustment. These are application defaults, not historical claims about a tradition.

Use the user-facing name **Sidereal (Lahiri)**. Remove the pre-production `vedic` preset key when this profile model lands; do not keep a legacy alias. “Vedic” describes a much broader practice than the settings Astraya controls.

Do not add a separate Hellenistic profile yet: with the values this profile model owns, it would duplicate Traditional Western rather than produce a distinct calculation contract. Add another built-in only when Astraya supports a materially different, expert-reviewed set of settings and can name it precisely. Avoid two profile names that currently produce the same result.

Built-in definitions are immutable. A future change creates a new versioned ID. Selecting a profile copies every profile-owned value into the settings draft. Saved, shared, and exported charts store the concrete effective values plus optional profile provenance; they must never recalculate an older chart through a newer profile definition. Display **Custom** whenever any profile-owned value differs. Theme, symbols, glyph weight or variants, density, motion, and wheel color are device presentation settings and do not participate in profile matching.

**Profile precedence:**

```text
Astraya default
  → user's default calculation profile
    → saved chart/configuration override
      → temporary page override
```

Device presentation settings apply independently. Person records never enter this precedence chain.

**Acceptance criteria:**

- Rulership and symbol changes no longer bypass Cancel inside a staged chart or filter dialog.
- **Apply to this chart** never changes the user's default.
- **Save as my default** is a separate intentional action.
- Choosing any built-in replaces every profile-owned draft value; it never inherits stale values from the previous selection.
- Changing any profile-owned value displays **Custom**, and returning every value to a built-in definition restores that built-in name.
- Saved, shared, and exported results preserve the concrete effective values and versioned profile provenance.
- Reset names its target.
- Request-specific AI consent remains unchecked and unpersisted.

### Phase 4 — Chart workspace

**Goal:** Preserve Astraya's strongest interaction while removing navigation and page-length friction.

Primary integration points: [ChartView.tsx](../src/ui/ChartView.tsx), [ChartTypeSelector.tsx](../src/ui/ChartTypeSelector.tsx), [chart-sections.ts](../src/ui/chart-sections.ts), [WheelSelectionText.tsx](../src/ui/WheelSelectionText.tsx), and the chart-type views that reuse `ChartDataView`.

Create these boundaries or equivalent boundaries with the same responsibilities:

- `ChartWorkspace`: loads or receives one computed chart model and owns chart-level settings.
- `ChartHeader`: title, chart type, calculation basis, settings, and exports.
- `ChartViewNav`: four route links on wide layouts and one Select on narrow layouts.
- `WheelView`, `AspectsView`, `PlacementsView`, `PatternsView`: focused result views.
- `SelectionInspector`: common selected-item facts, meaning, related connections, Clear, and optional deeper disclosure.

Implement in this order:

1. Add the four target route views and move each old section's content to its target view. Remove the old section parameter contract when the new navigation lands.
2. Replace the five chart-type pills with one labelled Select in the header. Remove chart types from application navigation.
3. Extract the existing dial renderer from the combined on-screen sheet without changing chart geometry or hit targets.
4. Render the dial followed by `SelectionInspector` in DOM order inside one workbench container.
5. Make the workbench an inline-size query container. Below `68rem`, use one column with the inspector immediately after the visualization. At `68rem` and above, use `minmax(46rem, 1fr) minmax(20rem, 24rem)` with a `2rem` gap. This threshold is the sum of the minimum useful chart width, inspector width, and gap; it is not a viewport breakpoint. Put chart workbenches in the wide visualization shell rather than the current `64rem` general-content shell, which would make the two-column state unreachable. The visualization remains first in DOM and focus order, and the inspector does not get an independent vertical scrollbar.
6. Extract the aspect matrix into Aspects and connect it to the same selection contract.
7. Move Positions, Houses, and Derived points into Placements with visible headings. Use a small contents control only if the combined view remains several screenfuls long.
8. Move chart shape, emphasis, degree distribution, dignities, and dispositors into Patterns & condition. Keep each visualization next to its explanation.
9. Keep `renderChartSheetSvg` and complete-sheet PNG/PDF output for export. Screen and export composition may differ while using the same computed data.
10. Migrate natal first, then draconic and harmonic, then returns, composite, shared charts, and tool charts that reuse `ChartDataView`.

Use one selection model with a discriminated union for sign, body, cusp/house, aspect, and derived selections. Selection changes must update:

- SVG emphasis.
- The inspector heading and facts.
- Deterministic corpus interpretation.
- Related connections.
- Equivalent accessible table row and selected state.
- Clear-selection behavior.

Do not let optional AI output replace deterministic facts or corpus text.

**Acceptance criteria:**

- The application rail contains one Charts destination.
- Chart type appears once.
- Only one chart-view navigation is visible.
- A selected item's meaning remains in the first adjacent region on every viewport.
- The inspector reserves enough space to avoid a large first-selection jump.
- The layout is one column at a `67.99rem` workbench container and two columns at `68rem`, regardless of viewport width.
- Keyboard users can create and clear the equivalent selection through the accessible table.
- The current combined SVG, PNG, print, and PDF exports remain equivalent to their pre-migration outputs.

### Phase 5 — Astrocartography

**Goal:** Turn the current control wall into one understandable map task.

Primary integration point: [AstrocartographyView.tsx](../src/ui/AstrocartographyView.tsx).

1. Create `MapSettingsDialog` using the shared staged-dialog primitive.
2. Move Line types, Primary bodies, Additional bodies, Local Space, and Relocation into its draft state.
3. Replace Extended with the visible **Additional bodies** group.
4. Show an applied-state summary beside **Map settings**, for example **4 line types · 10 bodies · Local Space off**.
5. Apply and validate the complete draft once. Trigger one recalculation after commit.
6. Cancel, Escape, close, and backdrop discard the draft and restore focus.
7. Keep the last valid map visible with an updating state while recalculating.
8. Replace each bare “What the lines mean” `<details>` row with the shared Disclosure. Include text name, glyph, selected-line count, explicit Show/Hide wording, and chevron.
9. Preserve map export actions in the page header.

**Acceptance criteria:**

- Opening and cancelling settings never changes the map.
- Applying several changes causes one committed recalculation.
- No nested settings or Extended surface remains.
- The dialog remains operable at 390×844 and short laptop heights.
- Meanings are visibly expandable without relying on a triangle, glyph, or color.

### Phase 6 — Migrate remaining screens

**Goal:** Apply the shared grammar everywhere and remove one-off patterns.

Migrate by interaction family rather than by arbitrary file order:

| Family                  | First targets                                                        | Required result                                                                                         |
| ----------------------- | -------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------- |
| Dates and numbers       | Person form, Transits, Progressions, Primary Directions, PDF builder | Shared editable DateField and NumberField; deterministic formatting                                     |
| Method choices          | Primary Directions time key, Planetary rulers, chart profiles        | Segmented control or explanatory option cards according to the decision matrix                          |
| Filters                 | Transits and periodic forecasts                                      | Visible presets, shown/total summary, one Change filters action, staged advanced dialog                 |
| Long forms              | Person form and PDF builder                                          | Completion/dirty state, reachable primary action, grouped disclosures, sticky summary where appropriate |
| Dense tables            | Chart tables, transits, timing techniques, admin                     | Typed alignment, sticky headers, compact desktop density, contained horizontal overflow                 |
| Expandable explanations | Rectification candidates and other native `<details>` surfaces       | Shared Disclosure                                                                                       |
| Result state            | Every calculating screen                                             | Initial, updating, empty, zero, partial, error, offline, and success states                             |

Delete feature-specific CSS only after the feature uses the shared primitive and its tests cover the new states.

### Phase 7 — Cleanup and enforcement

**Goal:** Make regression toward the old UI difficult.

1. Remove obsolete chart tabs, type pills, duplicated navigation arrays, raw settings controls, and unused CSS.
2. Add lint or test enforcement for the feature and settings registries.
3. Add a test that flags raw user-facing `input`, `select`, and dialog styling outside the primitive layer, allowing documented exceptions for hidden native inputs and specialized visualization controls.
4. Update `src/ui/MAP.md`, test maps, route comments, English/Dutch catalogues, and E2E support helpers.
5. Re-check bundle splitting. Do not eagerly load chart, Preferences, PDF, or admin screens merely because the shell references their metadata.
6. Run the complete verification matrix and perform manual keyboard and screen-reader checks.

## 7. State and interaction contracts

### Immediate preferences

Account and device preferences update the local source of truth immediately. Show **Saving…**, **Saved**, or a recoverable synchronization error. A valid offline change remains applied when remote synchronization fails.

### Staged page or chart settings

Opening copies applied values into a draft. Apply validates and commits the entire draft. Cancel, Escape, close, and backdrop discard it. Reset changes the draft only. No child control writes directly to global storage.

### URL state

Encode state when Back, reload, bookmarking, or sharing should reproduce it. This includes chart type/view, meaningful result dates, comparison target when safe, and applied map configuration when sharing the map is a product requirement. Do not place birth data, free text, consent, tokens, or other sensitive values in the URL.

### Loading and recalculation

On first load, reserve result geometry with a content-shaped placeholder. During recalculation, retain the last valid result, mark it as updating, and set `aria-busy` on the result region. Replace it only when the complete new result is available.

### Destructive actions

Prefer restore or Undo for ordinary deletion. Permanent deletion names the affected person or data set, explains local and synchronized consequences, and uses a dedicated destructive confirmation.

## 8. Responsive layout contracts

Verify 390×844, 768×1024, 1280×800, 1440×900, and 3440×1440.

- The workspace rail collapses when it would take useful width from the result.
- Chart and inspector columns respond to their container, not a global viewport guess.
- The chart workbench uses one column below `68rem`; at `68rem` and above it uses a minimum `46rem` visualization, a `20rem`–`24rem` inspector, and a `2rem` gap.
- The inspector moves below before either column becomes cramped and never receives independent vertical scrolling.
- Reading content stays near 68 characters per line.
- Tables and large visualizations use a wider data shell.
- Full-screen mobile dialogs retain visible title and action regions without trapping content beneath browser chrome.
- Sticky regions never consume most of a short viewport.
- Ultra-wide layouts expand data views rather than stretching prose.

## 9. Test changes required by the migration

Update tests as behavior moves. Do not delete assertions merely because old selectors no longer exist.

### Unit and component tests

Add or extend:

- `test/ui-route.test.ts`: canonical route round trips, invalid IDs, query handling, and chart views.
- `test/ui-feature-registry.test.ts`: coverage, ordering, prerequisites, exports, label parity.
- `test/ui-settings-registry.test.ts`: valid scope/persistence/commit combinations and migrations.
- Existing store/fold/sync suites plus a UI-level seeded-operation fixture: existing local and synchronized people remain byte-for-byte interpretable.
- Primitive tests for labels, help/errors, number stepping, choice semantics, disclosure, dialog commit/cancel, and selection state.
- Existing chart selection tests: one selection model drives SVG, inspector, and table.
- Existing formatter tests: deterministic dates, times, numbers, coordinates, units, and currency.

### E2E tests

Refactor existing tests around roles, names, routes, and user-visible outcomes:

- `app-nav.spec.ts` and `person-nav-dropdown.spec.ts`: workspace rail/drawer, person switching, grouping, focus restoration.
- `chart-golden-path.spec.ts`: one chart-type field, four view links, adjacent/stacked inspector, canonical routes, and exports.
- `extended-settings.spec.ts`: complete draft semantics and profile override/default separation.
- `astrocartography-golden-path.spec.ts`: settings summary, one recalculation on Apply, Cancel behavior, Disclosure.
- `rulership-setting.spec.ts` and `symbol-setting.spec.ts`: canonical Preferences location and no immediate mutation from staged dialogs.
- `accessibility.spec.ts`: landmarks, axe, keyboard flow, focus order, responsive overflow, and table equivalents.

Add explicit checks at 390×844 and 1280×800 for every changed workflow. Add 3440×1440 coverage for chart workbench, report measure, and dense tables.

Manual checks remain required for:

- VoiceOver or another supported screen reader.
- Browser zoom at 200% and text zoom where supported.
- High-contrast/forced-color behavior.
- Touch targets and mobile software keyboard overlap.
- Reduced motion.

## 10. Delivery slices

Use reviewable vertical slices in this dependency order:

| Slice | Deliverable                                                                                |
| ----- | ------------------------------------------------------------------------------------------ |
| 1     | Tokens plus Field, date, number, choice, and button primitives; three pilot migrations     |
| 2     | Feature/settings registries and the canonical route cutover                                |
| 3     | Workspace shell, person switcher, Overview, and page-header exports                        |
| 4     | Preferences workspace and migrated account/device settings                                 |
| 5     | Calculation profiles and truthful chart override/default behavior                          |
| 6     | Natal chart workbench, four views, and SelectionInspector                                  |
| 7     | Remaining chart types and complete export-equivalence checks                               |
| 8     | Astrocartography Map settings and Disclosure                                               |
| 9     | Transit, Primary Directions, PDF builder, tables, and remaining control migrations         |
| 10    | Old-pattern removal, enforcement, complete responsive/a11y verification, and documentation |

Do not mix domain-calculation changes into these slices. If a UI slice reveals a domain defect, isolate it in a separately reviewed change with its own regression test.

## 11. Definition of done for every slice

- [ ] The slice implements a complete user-visible behavior, not parallel old and new paths without an explicit migration boundary.
- [ ] English and Dutch catalogues have parity.
- [ ] Light and dark themes cover every state.
- [ ] Keyboard order, Escape, focus restoration, live announcements, and touch targets work.
- [ ] Loading, empty, updating, partial, error, offline, and success states affected by the slice are designed.
- [ ] Canonical URLs support Back, forward, reload, bookmarking, and sharing; obsolete route forms are no longer generated.
- [ ] No setting changes scope, persistence, or sync behavior accidentally.
- [ ] Existing local and synchronized person operations still materialize to the same IDs and field values; no UI path clears or rewrites them implicitly.
- [ ] Existing calculations and export content remain unchanged unless separately specified.
- [ ] Relevant unit, component, and Playwright tests pass.
- [ ] `npm run check` passes without warnings.
- [ ] `npm run test:e2e` passes for a release-bound slice.
- [ ] `npm run check:bundle-size` passes.
- [ ] Relevant `MAP.md` files and this plan are updated when responsibilities change.

## 12. Final product acceptance

Before removing the migration label, run these tasks with a newer astrology reader and an experienced practitioner:

1. Open an existing locally stored person and an existing server-synchronized person, confirm every birth-record field, edit one value, reload, and confirm both records remain intact.
2. Add a person, understand what is missing, and reach the natal chart.
3. Switch people while remaining in the same valid feature.
4. Change chart type and move among all four chart views without losing context.
5. Select a sign, body, cusp, house, and aspect and find each meaning immediately.
6. Apply a temporary chart override, then separately save a calculation default.
7. Enter a target date, change Primary Directions time key, and filter transits.
8. Configure and cancel Astrocartography settings, then apply several settings in one pass.
9. Expand line meanings without guessing that a triangle is interactive.
10. Export the current view, build a PDF, and create a full-data backup from their correct scopes.
11. Recover from incomplete data, a zero-result filter, an offline network action, and a calculation failure.

The migration succeeds when users complete these tasks without being taught the menu hierarchy, without guessing a setting's scope, and without encountering two visual or behavioral versions of the same control.
