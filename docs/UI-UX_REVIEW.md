# Astraya Design and Usability Audit

**Audit date:** 2026-10-09  
**Audited revision:** `60d67fb`  
**Scope:** React route and component layer, global styling, design tokens, navigation, forms, charts, reports, tables, PDF export, tools, administration, state design, accessibility, and responsive test coverage.

Future UI work should follow the normative [UI/UX Implementation Guide](UI-UX_GUIDELINES.md). Use the [UI/UX Migration Plan](UI-UX_IMPLEMENTATION_PLAN.md) to move the current application to that target in reviewable implementation phases.

This audit recommends the best coherent target experience; it is not constrained to preserving existing layouts, labels, menus, settings placement, or component patterns. Current UI behavior is evidence about workflows and technical constraints, not a design standard. Where an existing pattern is inconsistent, confusing, visually dated, inaccessible, or unnecessarily complex, replace it with the cleaner pattern and migrate related surfaces toward the same target model.

Astraya has a mature accessibility and interaction foundation, but its design system and dense-workflow layouts need another pass. The review distinguishes automated accessibility success from visual hierarchy, information density, motion, ultra-wide behavior, and perceived performance, which axe cannot assess.

Verification performed during the audit:

- `npx vitest run test/wheel-theme-contrast.test.ts`: 12/12 tests passed.
- The existing production output passed `node scripts/check-bundle-size.mjs`: 501,998 of 665,600 bytes in the eager graph; the person-screens chunk was 89 KiB.
- The existing Playwright suite was inspected for axe, keyboard, phone-width, responsive-overflow, dialog, and navigation coverage. It was not rerun as part of this read-only audit.

## 1. Executive Summary

### Top three strengths

1. **Strong accessibility engineering.** The app has skip navigation, route-change focus management, semantic landmarks, keyboard-operable tabs, native modal dialogs, visible focus states, and extensive axe coverage. See [App.tsx](../src/ui/App.tsx#L189), [ChartView.tsx](../src/ui/ChartView.tsx#L1096), and [accessibility.spec.ts](../e2e/accessibility.spec.ts#L1).

2. **Deliberate visual identity.** The night-sky palette, full light theme, chart-specific colors, restrained elevation, and system typography suit a professional astrology application. Current wheel contrast tests pass all 12 checks. See [app.css](../src/ui/app.css#L22) and [wheel-theme-contrast.test.ts](../test/wheel-theme-contrast.test.ts#L75).

3. **Thoughtful unhappy paths.** Field errors are properly associated, incomplete records remain usable, ordinary deletion is reversible, and permanent deletion requires confirmation. See [PersonForm.tsx](../src/ui/PersonForm.tsx#L114), [People.tsx](../src/ui/People.tsx#L61), and [AdminPanel.tsx](../src/ui/AdminPanel.tsx#L284).

### Top three critical bottlenecks

1. **Semantic states are visually conflated.** Warning, invalid input, destructive action, and many errors all use `--solar`. Users cannot distinguish caution from failure or irreversible action at a glance. See [app.css](../src/ui/app.css#L899), [app.css](../src/ui/app.css#L1005), and [app.css](../src/ui/app.css#L1024).

2. **One shell and long-page model serve incompatible content.** Reports need a narrow reading measure, dense tables need more horizontal space, and interactive visualizations need their feedback immediately adjacent. The chart's dial, aspect matrix, emphasis grid, and degree strip are combined before the selection explanation, so a useful click can produce feedback several screenfuls below it. See [app.css](../src/ui/app.css#L550), [chart-sheet.ts](../src/chart/chart-sheet.ts#L1), and [ChartView.tsx](../src/ui/ChartView.tsx#L1136).

3. **Navigation, setting scope, and input controls do not follow one consistent grammar.** A chart can expose three navigation layers. Equivalent fields then differ according to their container, checkboxes receive only a browser accent color, and number arrows inherit browser styling. Settings dialogs also mix staged changes with preferences that save immediately. Users must relearn where a choice lives, how it looks, and when it applies. See [ChartView.tsx](../src/ui/ChartView.tsx#L1269), [app.css](../src/ui/app.css#L527), [app.css](../src/ui/app.css#L767), and [ExtendedSettingsPanel.tsx](../src/ui/ExtendedSettingsPanel.tsx#L573).

The palette targets WCAG AA. AAA is not an established target: the stylesheet documents a weakest pair of 5.56:1, below the 7:1 normal-text AAA threshold. Existing automated coverage is a strong AA baseline, but the test suite correctly acknowledges that a manual screen-reader pass remains necessary.

## 2. Usability and Layout Audit

| Area                             | Finding                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                             | Concrete redesign                                                                                                                                                                                                                                                                                                                                                                                                               |
| -------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Application shell and navigation | Sticky navigation, person context, active routes, Escape handling, and responsive collapse are excellent. The feature order is less coherent: selecting a person opens their edit form, Astrocartography appears before both timing families, Tools mixes five different jobs in one flat list, and tool routes retain the last person's full navigation even though the tool is not person-scoped. On chart routes, the `<h1>` contains only the person's name, leaving the active chart type to a relatively quiet pill below it. | Use a responsive workspace shell with a searchable person switcher and a person Overview. Put global areas and person workflows in one collapsible navigation rail, move contextual exports beside the page title, and replace inherited person navigation on tool routes with explicit context. Use a title such as **“Natal chart · Ada Lovelace”**.                                                                          |
| People                           | Record completeness is visible and deletion is recoverable. The empty-state CTA sits outside the empty-state panel, weakening the connection between explanation and next action.                                                                                                                                                                                                                                                                                                                                                   | Put “Add a person” inside the empty panel, with a short three-step description: identity, birth moment, location.                                                                                                                                                                                                                                                                                                               |
| Person form                      | Semantic fieldsets, inline errors, and time-resolution feedback are strong. The primary Save action appears after a long form, and the generic “fill fields” message does not identify remaining requirements.                                                                                                                                                                                                                                                                                                                      | Add a compact completion summary near the title and a sticky dirty-state action bar. On invalid state, link directly to missing date, time, or coordinate fields.                                                                                                                                                                                                                                                               |
| Form controls                    | Field styling depends on `.field-grid`; checkboxes/radios, selects, date fields, and numeric spinner arrows therefore vary by container and browser. The inconsistency affects both visual trust and learned interaction.                                                                                                                                                                                                                                                                                                           | Build all controls from shared Field, Choice, Select, DateField, and NumberField primitives. Use one anatomy, token set, state model, and standard/compact sizing policy; replace browser number spinners with the shared stepper when stepping is useful.                                                                                                                                                                      |
| Charts                           | The chart/table equivalence and selectable SVG are unusually strong. Three navigation layers still slow orientation, and the “wheel” is one tall SVG containing the dial, aspect matrix, emphasis grid, and degree strip. Selection feedback renders after the whole SVG, far below the clicked dial object. See [chart-sheet.ts](../src/chart/chart-sheet.ts#L1) and [ChartView.tsx](../src/ui/ChartView.tsx#L1111).                                                                                                               | Make Charts one destination with one chart-type field and four route-level views: Wheel, Aspects, Placements, and Patterns & condition. Render each visualization separately on screen. Stack its Selection inspector below the chart under a `68rem` workbench container; at `68rem` and above use a `46rem` minimum chart, `20rem`–`24rem` inspector, and `2rem` gap. Keep the combined chart-sheet SVG for complete exports. |
| Astrocartography                 | Line types, traditional bodies, an “Extended” bodies disclosure, Local Space, and relocation appear as four always-visible field groups above the map. Every checkbox immediately recalculates, while “Extended” looks like a second settings level. See [AstrocartographyView.tsx](../src/ui/AstrocartographyView.tsx#L239).                                                                                                                                                                                                       | Replace the field groups and Extended disclosure with one **Map settings** modal form. Stage Line types, Bodies, Local Space, and optional Relocation together; show primary and additional bodies as labelled groups in the same form; and recalculate once on Apply. Keep a compact applied-settings summary beside the trigger.                                                                                              |
| Data tables                      | Sorting, copying, CSV export, tabular numerals, and horizontal containment are good. Every column is left-aligned, headers disappear during long vertical scans, and all rows share one density. See [SortableTable.tsx](../src/ui/SortableTable.tsx#L72).                                                                                                                                                                                                                                                                          | Add column metadata for `align`, `kind`, and optional density. Right-align degrees, orbs, ages, costs, and counts. Enable sticky headers and compact rows for large result sets.                                                                                                                                                                                                                                                |
| Reports                          | Keyboard tabs and the section TOC are strong. Report paragraphs can approach the full shell width, while the unrelated changelog already has a 42rem prose limit.                                                                                                                                                                                                                                                                                                                                                                   | Wrap the report TOC and prose in a `68ch` reading column. Keep controls and tabs at shell width.                                                                                                                                                                                                                                                                                                                                |
| PDF builder                      | Presets are a good start, but the page is a long checkbox configuration surface. The final “Build PDF” button uses the secondary `.quiet` style, and a user with no people gets a disabled builder instead of a direct recovery path.                                                                                                                                                                                                                                                                                               | Use a two-column desktop layout: collapsible configuration groups plus a sticky summary with selected-section count and primary Build button. At zero people, show an “Add a person” empty state.                                                                                                                                                                                                                               |
| Calculator tools                 | Buttons immediately change to “Finding…” or “Testing…”, and errors are announced. Most tool screens are not forms, so Enter does not run the primary calculation. Empty results are usually plain hints. See [ElectionalView.tsx](../src/ui/ElectionalView.tsx#L232).                                                                                                                                                                                                                                                               | Introduce a shared search-form pattern with native submit semantics. Preserve previous results while recalculating and show “No results” panels with the relevant corrective action.                                                                                                                                                                                                                                            |
| Admin and account                | Destructive admin actions include impact information and a second confirmation. Dates and metrics are inconsistent: browser-locale timestamps, raw server timestamps, raw integers, and fixed `$0.00` formatting appear in the same area. See [AdminPanel.tsx](../src/ui/AdminPanel.tsx#L197) and [AdminPanel.tsx](../src/ui/AdminPanel.tsx#L456).                                                                                                                                                                                  | Add shared `formatDateTime`, `formatInteger`, and `formatCurrency` functions driven by Astraya's selected locale and an explicit timezone policy.                                                                                                                                                                                                                                                                               |
| Loading and degraded states      | Errors are generally visible and localized. There are 23 `.status` uses, but most lack a live-region role, `aria-busy`, reserved geometry, or a retry action.                                                                                                                                                                                                                                                                                                                                                                       | Create one `StatusMessage` component. Use layout-matching placeholders for initial chart/report/table loads and retain prior data during recomputation.                                                                                                                                                                                                                                                                         |
| Responsive behavior              | Phone-width overflow receives concrete Playwright coverage. CSS has only 40rem and 64rem screen breakpoints, and tests concentrate on 390/1280 widths. See [app.css](../src/ui/app.css#L1595) and [accessibility.spec.ts](../e2e/accessibility.spec.ts#L466).                                                                                                                                                                                                                                                                       | Add layout modes or container queries for reading, forms, tables, and builders. Cover 390×844, 768×1024, 1280×800, 1440×900, and 3440×1440.                                                                                                                                                                                                                                                                                     |
| Touch and power users            | Keyboard fundamentals are strong, but there is no application shortcut layer. Header pills are 36×36px, below the preferred 44px touch target. See [app.css](../src/ui/app.css#L262).                                                                                                                                                                                                                                                                                                                                               | Increase mobile controls to 44px. Later add a route/action launcher for people, charts, and tools, plus documented shortcuts such as `/` for filters and `Cmd/Ctrl+K` for navigation.                                                                                                                                                                                                                                           |

### Application shell and information architecture

The sticky header succeeds at keeping account, synchronization, appearance, person context, tools, and export available from long screens. The implementation closes menus on outside interaction, Escape, focus departure, and route changes; focus returns to the relevant trigger. The mobile navigation becomes an in-flow vertical menu rather than compressing desktop controls.

The main orientation weakness is the relationship between global and local navigation. A chart route presents the person, a Charts group, a chart-type row, and then chart-section tabs. The active chart type is visually signaled only by the selected pill. A self-contained heading and a compact context line—person, chart type, calculation basis—would let a user identify the current view in under three seconds.

The better long-term shell is a responsive, collapsible workspace rail rather than a continually growing horizontal header. On wide screens, the rail should contain the searchable person selector, person-workspace groups, Tools, Documents, and bottom-anchored Preferences/Account. On smaller screens it becomes a drawer. The content header then has one job: page title, calculation context, and actions for this page. This preserves data width when collapsed and removes the need for several unrelated dropdowns competing in one bar.

### Navigation, feature grouping, and settings consistency

The current person menu is rendered as **Birth record → Charts → Interpretation → Astrocartography → Transits & Forecast → Progressions & Directions → Relationship Charts**. This is a result of rendering all ungrouped items before the family array, rather than an intentional end-to-end workflow order. See [AppNav.tsx](../src/ui/AppNav.tsx#L298), [AppNav.tsx](../src/ui/AppNav.tsx#L334), and [person-nav.ts](../src/ui/person-nav.ts#L73). It separates two closely related timing families and promotes the more specialized location workflow ahead of both.

Use this complete primary hierarchy. A complete person opens on Overview; an incomplete or newly created person opens directly on Edit birth record until the prerequisites are satisfied.

| Scope              | Recommended group and order              | Contents                                                                                                                                                                                                            |
| ------------------ | ---------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Person workspace   | **Overview**                             | Birth-record readiness, compact natal context, calculation basis, and clear next actions such as Open natal chart, Read interpretation, and View transits. Avoid decorative dashboard metrics.                      |
| Person action      | **Edit birth record**                    | Identity, birth moment, and location. Keep this in the person selector/context menu and on Overview rather than using an edit form as the workspace home.                                                           |
| Person workspace   | **Charts**                               | One direct destination. Choose Natal, Draconic, Harmonic, Solar return, or Lunar return in the chart page header; do not repeat these types in the application menu or as another full-width tab row.               |
| Person workspace   | **Interpretation**                       | Written interpretation as a direct destination because it is a primary output, not a chart subtype.                                                                                                                 |
| Person workspace   | **Timing & forecasts**                   | Use headings inside one menu: **Current sky**—Transits, Forecast; **Symbolic timing**—Profections, Progressions, Solar Arc, Primary Directions. This joins related goals without introducing another submenu level. |
| Person workspace   | **Relationships**                        | Synastry, Composite.                                                                                                                                                                                                |
| Person workspace   | **Location**                             | Astrocartography. Local Space is a map setting inside Astrocartography, not another menu destination. “Location” remains the clearer navigation-group label.                                                        |
| Global tools       | **Sky & cycles**                         | Planetary cycles, Eclipses.                                                                                                                                                                                         |
| Global tools       | **Questions & planning**                 | Horary chart, Electional search.                                                                                                                                                                                    |
| Global tools       | **Birth data**                           | Birth-time rectification.                                                                                                                                                                                           |
| Page actions       | **This page**                            | Put chart image, print, CSV, and other current-view actions in the page toolbar beside the title. Group overflow actions in one shallow menu only when space requires it.                                           |
| Global navigation  | **Documents**                            | Build custom PDF.                                                                                                                                                                                                   |
| Preferences        | **Data & privacy**                       | Everything (JSON), People (CSV), sync/account state, local-data persistence, and account-data removal.                                                                                                              |
| Global preferences | **Appearance & calculation preferences** | Language, theme, symbols, glyph variants, and rulership model in one canonical Preferences surface; retain clearly labelled header shortcuts for frequent accessibility choices.                                    |

The Tools data already acknowledges two broad kinds of tool but renders one undifferentiated list. Use headings and separators in the Tools section; do not add nested flyouts. See [tools-nav.ts](../src/ui/tools-nav.ts#L29) and [AppNav.tsx](../src/ui/AppNav.tsx#L450). Export currently combines a document builder, backup downloads, and current-page actions. Remove that global menu: page exports belong in the page toolbar, Build PDF belongs under Documents, and whole-data downloads belong under Preferences → Data & privacy. See [AppNav.tsx](../src/ui/AppNav.tsx#L140).

The person name in the current header is noninteractive, while selecting a person from the People list opens `#/person/:id`, which is the edit form. See [AppNav.tsx](../src/ui/AppNav.tsx#L293) and [People.tsx](../src/ui/People.tsx#L94). Replace the name chip with an accessible searchable person switcher. It should show record completeness, switch subjects without returning to People, offer Edit birth record as a secondary action, and preserve the current feature when the target person meets its prerequisites.

Every calculated view should show a compact, editable basis line such as **Tropical · Placidus · Modern rulers · Standard orbs**. The basis must travel into reports, shared charts, and exports. This makes hidden defaults visible, explains why two outputs differ, and gives Advanced settings a clear entry point without exposing the whole configuration at once.

Add contextual continuation actions at natural endpoints: **Open interpretation** after viewing a natal chart, **View transits** from Overview, **Compare with another person** from a relationship summary, and **Build PDF** from a completed report. Preserve the current person and effective chart configuration. These links should shorten real workflows rather than form a generic recommendation carousel.

Do not create separate beginner and expert modes. Keep common actions visible, use presets and progressive disclosure for advanced choices, remember explicit defaults, and let experienced users use the person switcher and command palette. Hiding whole features behind a mode makes navigation harder to learn and support.

Tool routes currently recover the last visited person and render that person's entire navigation. This offers a convenient route back, but it also implies that Planetary cycles, Eclipses, Horary, or Electional is operating on that person. Replace it with **“Return to Ada Lovelace”** when it is only history, or **“Using Ada Lovelace”** when a tool is actually seeded from that record. See [AppNav.tsx](../src/ui/AppNav.tsx#L366).

Use one placement rule for every current and future control:

| Control type                                                                                             | Surface                         | Commit behavior                                                                                                                                                                                                                                         |
| -------------------------------------------------------------------------------------------------------- | ------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| A small set of page-defining inputs, such as person, target date, technique, comparison, or PDF contents | Inline in the page              | Immediate local state; primary action runs the calculation or build. Use a staged page-settings modal when one result has several related configuration groups.                                                                                         |
| Advanced reversible view settings, such as chart calculation/display options or transit filters          | Shared `settings-card` modal    | Stage every control; **Apply** commits, **Cancel/Escape/backdrop** discards, **Reset** changes only the draft.                                                                                                                                          |
| User/account preferences, such as language, regional formats, and astrology defaults                     | Global Preferences workspace    | Save locally immediately, sync in the background, and show save state inline.                                                                                                                                                                           |
| Device-wide preferences, such as theme, symbols, glyphs, density, or motion                              | Canonical Preferences workspace | Save immediately and show save state inline. Never put these controls in a staged Apply/Cancel dialog.                                                                                                                                                  |
| Optional explanatory content                                                                             | Shared Disclosure component     | Use a full-width labelled trigger with supporting summary, Show/Hide wording, a consistent chevron, and visible hover/focus/open states. Semantic `<details>/<summary>` may provide the behavior, but never expose only the browser's default triangle. |
| Destructive confirmation                                                                                 | Dedicated confirmation dialog   | State the object and consequence; use explicit destructive styling and offer undo where possible.                                                                                                                                                       |

#### Settings ownership: what belongs where

A setting's scope must follow the object whose behavior changes, not the component where the control happens to appear. Every option needs an explicit owner, lifetime, persistence mechanism, synchronization policy, reset value, and editing surface.

| Scope                         | What belongs here                                                                                                                                        | Where it should be edited                                                                                                                 | Lifetime and storage                                                                                                                               |
| ----------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Application/deployment**    | Service availability, ephemeris/geocoder providers, AI policy and limits, feature rollout, organization-wide defaults                                    | Deployment configuration or a dedicated administrator route                                                                               | Server/deployment configuration; never browser `localStorage` and never mixed into ordinary Preferences                                            |
| **User/account**              | Language and regional formatting; default astrology methodology such as rulership, house system, zodiac, orb profile, and default transit filter         | Global **Preferences** workspace, grouped as General and Astrology defaults                                                               | Local-first profile data; available offline and synced across the signed-in user's devices when profile sync exists                                |
| **Device/browser**            | Theme/system-theme override, motion, density, symbol renderer, glyph weight/variants, and other choices affected by this screen or browser               | **Preferences → Appearance & accessibility**, with optional header shortcuts                                                              | `localStorage` or equivalent on this device; do not overwrite another device's display choices                                                     |
| **Person record**             | Name, birth moment, coordinates, time accuracy, place label, notes, and other facts about one person                                                     | **Birth record** for that person                                                                                                          | IndexedDB operation log; included in optional account sync. Label persistent changes “Applies to Ada Lovelace”                                     |
| **Saved chart/configuration** | House system, zodiac, ayanamsa, bodies, aspects, orbs, and wheel choices needed to reproduce one saved chart                                             | The chart's **Advanced settings** modal, with separate “Apply to this chart” and “Save as my default” actions when persistence is offered | Store with the chart/share/export configuration. Do not attach calculation methodology to the person record merely because the chart has a person  |
| **Page/view**                 | Selected date, comparison person, search terms, sort order, open section, temporary filters, map bodies, relocation point, PDF contents, and export size | Inline beside the result it changes; use a staged modal only when the advanced set is large                                               | React state by default; URL when Back, reload, bookmarking, or sharing should reproduce it. Persist only after an explicit “Set as default” action |
| **Request/security**          | AI consent, confirmation text, one-time export choices, authentication challenges                                                                        | At the action that needs the decision                                                                                                     | One request or session only. Privacy consent must not become a standing preference                                                                 |

This allocation changes some current assumptions. Language and rulership express the user's vocabulary and astrological methodology, so they should become account preferences with an offline local fallback when preference sync is added. Theme, glyph rendering, and layout density should remain device preferences because screen capabilities and operating-system choices differ. The current implementation stores locale, rulership, symbols, glyphs, theme, and transit defaults in browser storage, while chart Extended settings last only for the page lifetime. See [locale.ts](../src/ui/locale.ts#L24), [rulership-setting.ts](../src/ui/rulership-setting.ts#L17), [symbol-setting.ts](../src/ui/symbol-setting.ts#L27), [theme-dom.ts](../src/ui/theme-dom.ts#L15), [TransitFilterPanel.tsx](../src/ui/TransitFilterPanel.tsx#L49), and [extended-settings-store.ts](../src/ui/extended-settings-store.ts#L1).

The Preferences surface should use visible groups rather than a vague catch-all “General settings” list:

- **General:** language, regional number/date format, display timezone policy.
- **Astrology defaults:** rulership, default calculation preset, house system, zodiac/ayanamsa, orbs, points/aspects, default transit filter.
- **Appearance & accessibility:** theme, symbols, glyph variants and weight, density, motion.
- **Data & privacy:** sync/account state, local-data persistence, exports, and account-data removal; request-specific AI consent remains at the request and is never saved.

Use a stable Preferences route rather than a global modal. These groups include durable defaults, synchronization state, exports, and destructive data actions; they need room, browser history, deep links, and a reliable mobile layout. Reserve modals for settings that configure the current page or result while that result remains visible.

Every setting control should state its reach in plain language: **This view**, **This chart**, **Ada Lovelace**, **Your account**, **This device**, or **Application-wide**. If a temporary choice can become a default, provide two explicit actions such as **Apply to this view** and **Save as my default**. Do not infer persistence from where a modal was opened.

Where a setting supports defaults and overrides, use one visible precedence chain: **application default → user default → saved-chart override → temporary view override**. Device presentation preferences apply separately and person records do not participate in calculation-setting precedence. Show the effective source beside the control, and make Reset name its target, such as **Reset to my default** or **Reset to Astraya default**. Selecting a chart preset may change the current chart's rulership or house system, but it must not rewrite the user's defaults unless the user separately chooses **Save as my default**.

Replace the current partial Modern, Traditional, and Vedic presets with three complete, versioned profiles: **Modern Western** (Tropical, Placidus, modern rulers), **Traditional Western** (Tropical, Whole Sign, traditional rulers), and **Sidereal (Lahiri)** (Lahiri sidereal, Whole Sign, traditional rulers). Each definition must also set the node and Lilith models, visible optional points, enabled aspects, additional aspect targets, and exact Astraya orb values. Selecting a profile copies a full snapshot into the draft; changing any owned value displays **Custom**. Call the third profile **Sidereal (Lahiri)** because “Vedic” promises a broader methodological model than these controls provide. Save concrete settings with results and use immutable, versioned IDs so future default changes cannot alter an older chart.

Do not add Hellenistic as a fourth label while it would be operationally identical to Traditional Western. That creates false choice and makes users infer a distinction that the calculations do not express. Add it later only if Astraya implements a genuinely distinct, reviewed calculation set.

Astraya's local-first model requires account preferences to work before sign-in. Store them locally first; when a user signs in, adopt or reconcile them deliberately rather than silently replacing either side. Person and chart data should continue through the operation log. Application/deployment policy belongs outside that log, and page state should not enter it. Per-request AI consent must remain unpersisted, as required by [ADR 0003](adr/0003-tier-2-llm-customized-interpretation.md#decision).

The native modal implementation itself is strong: `ExtendedSettingsPanel` and `TransitFilterPanel` use `<dialog>`, Escape/backdrop dismissal, draft state, and focus return. The content violates that model. Direct changes in `RulershipSetting` write the device preference immediately, while preset-supplied rulership waits for Apply; Symbol settings also write immediately. Closing the chart dialog only resets its local draft, so Cancel cannot restore those device preferences. The rulers section is additionally tagged “applies on Apply.” See [ExtendedSettingsPanel.tsx](../src/ui/ExtendedSettingsPanel.tsx#L78), [ExtendedSettingsPanel.tsx](../src/ui/ExtendedSettingsPanel.tsx#L125), [ExtendedSettingsPanel.tsx](../src/ui/ExtendedSettingsPanel.tsx#L573), [RulershipSetting.tsx](../src/ui/RulershipSetting.tsx#L19), and [SymbolSetting.tsx](../src/ui/SymbolSetting.tsx#L20). The transit filter repeats the issue by placing the immediately saved Rulership control inside an otherwise staged filter dialog. See [TransitFilterPanel.tsx](../src/ui/TransitFilterPanel.tsx#L275).

Move account and device preferences out of both view-setting dialogs into the global Preferences workspace. A chart preset may create a chart-local override, but it must not mutate the global preference. Astrocartography's map configuration is page-scoped but large enough to require one staged **Map settings** modal; the PDF configuration remains inline because it is the builder's primary content. See [AstrocartographyView.tsx](../src/ui/AstrocartographyView.tsx#L239) and [PdfExportBuilder.tsx](../src/ui/PdfExportBuilder.tsx#L403).

Feature setup is also distributed across route parsing, person navigation, tool navigation, translated labels, screen loading, and export registration. A new feature can therefore acquire a route without the right group, order, prerequisite, or export behavior. Define one typed feature registry with `scope`, `group`, `order`, `href`, `requiresBirthMoment`, `settingsMode`, and `exportCapabilities`; derive menus and active-state metadata from it. Route parsing and lazy imports can remain separate where needed, but compile-time exhaustiveness tests should verify that every user-facing route has registry metadata. See [route.ts](../src/ui/route.ts#L21), [person-nav.ts](../src/ui/person-nav.ts#L14), [tools-nav.ts](../src/ui/tools-nav.ts#L22), [AppNav.messages.ts](../src/ui/AppNav.messages.ts#L34), and [App.tsx](../src/ui/App.tsx#L42).

### People and birth-record workflow

The People list communicates incomplete data instead of presenting records as chart-ready. Tombstoning, restoring, and separately purging records is a particularly good destructive-action model.

The Person form is semantically sound but vertically demanding. Five fieldsets, geocoding, resolved-time metadata, warnings, Save, and Delete form one long page. The user should see completion and dirty state near the top. A sticky Save bar should appear only after an edit, while the existing inline errors remain beside their fields. Soft deletion does not need additional confirmation because it is reversible; permanent purge correctly retains explicit friction.

### Chart navigation and input controls

The chart page currently makes one body of information look like three levels of destinations. The global Charts menu chooses a chart type, `ChartTypeSelector` repeats five types in a pill row, and `ChartDataView` adds seven tabs for Chart, Shape, Positions, Houses, Aspects, Dignities, and Derived points. See [ChartTypeSelector.tsx](../src/ui/ChartTypeSelector.tsx#L16), [chart-sections.ts](../src/ui/chart-sections.ts#L25), and [ChartView.tsx](../src/ui/ChartView.tsx#L1269). This structure consumes vertical space, gives all levels similar visual weight, and forces users to remember which row changes the calculation and which row merely changes the visible part of the result.

Use one Charts workspace with this hierarchy:

1. **Header:** **Natal chart · Ada Lovelace**, a labelled **Chart type** chooser, the calculation-basis line, and page actions.
2. **One local view navigation:** Wheel, Aspects, Placements, and Patterns & condition. These are ordinary route links with stable URLs, not another ARIA tab strip.
3. **Wheel view:** the interactive dial and a reserved Selection inspector that shows the selected facts and meaning beside it on wide screens and immediately below it otherwise.
4. **Other views:** the aspect matrix and its inspector; Positions/Houses/Derived tables; and Shape/Emphasis/Degree distribution/Dignities/Dispositors respectively.

The global rail should link once to Charts; the page-header chooser changes Natal, Draconic, Harmonic, Solar return, or Lunar return; and the one local navigation changes the analysis view. Remove the duplicate chart-type pill row and seven technical section tabs. On mobile, replace the four-link row with the shared **Chart view** Select. Preserve the selected chart type and view in the URL.

The current chart-sheet renderer deliberately combines the wheel, aspect matrix, emphasis grid, and degree strip for export. That is useful for a printable artifact but causes the on-screen `.chart-isolation-panel` to appear after the complete tall SVG, even when the user clicked the dial at its top. See [chart-sheet.ts](../src/chart/chart-sheet.ts#L2), [chart-sheet.ts](../src/chart/chart-sheet.ts#L106), and [ChartView.tsx](../src/ui/ChartView.tsx#L1117). Reuse its individual renderers as separate on-screen components while retaining `renderChartSheetSvg` for SVG, PNG, and PDF.

Preserve the best current interaction: selecting a planet, sign, cusp, or aspect emphasizes it and provides facts plus corpus interpretation. Consolidate the current isolation facts, `WheelSelectionText`, and optional focus interpretation into one `SelectionInspector` directly after the owning visualization in DOM order. Use an inline-size container query: stack below `68rem`; at `68rem` and above use `minmax(46rem, 1fr) minmax(20rem, 24rem)` with a `2rem` gap. Keep the visualization first in DOM and focus order and do not give the inspector an independent vertical scrollbar. Before selection, reserve the inspector with a short prompt. After selection, lead with a specific statement such as **Leo on the cusp of house 5**, then show **What it means**, related connections, and Clear. The table equivalent must expose the same selection to keyboard and screen-reader users.

Form controls show the same drift. The global `color-scheme: dark light` does not follow an explicit in-app theme, and the shared visual styling applies only to inputs inside `.field-grid`. The application contains date inputs outside that container, so browser-native dark controls and unstyled surfaces appear next to Astraya-styled controls. See [app.css](../src/ui/app.css#L23), [app.css](../src/ui/app.css#L767), and the date inputs in [TransitView.tsx](../src/ui/TransitView.tsx#L252), [ProgressionsView.tsx](../src/ui/ProgressionsView.tsx#L270), and [PdfExportBuilder.tsx](../src/ui/PdfExportBuilder.tsx#L536).

Replace page-specific form styling with a shared control grammar:

| Current case                    | Problem                                                                                                         | Target control                                                                                                                                                                                                                                                                                     |
| ------------------------------- | --------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Chart type                      | Five pills duplicate the Charts menu and compete with section tabs.                                             | One labelled, theme-aware Select or popover in the page header. It changes the route and retains the current chart view when that view exists. Use a proven accessible Select primitive rather than a hand-built listbox.                                                                          |
| Chart data sections             | Seven equal-weight tabs expose implementation categories and force one page model on visualizations and tables. | Four task-oriented route views: Wheel, Aspects, Placements, and Patterns & condition. Use visible headings and anchors only inside a view; use the shared Chart view Select on narrow screens.                                                                                                     |
| Dates                           | Native appearance and background vary according to container, browser, OS, and theme.                           | Shared `DateField`: an editable localized value, clear label, consistent control surface, validation, and optional calendar button. Store and calculate with an ISO value. Keep direct typing available; do not make the calendar the only input path.                                             |
| Primary Directions time key     | A two-option method choice is presented as a generic select.                                                    | A two-option segmented control for **Naibod** and **Ptolemy**, with the selected formula and consequence in helper text. Use option cards instead if the explanation cannot remain concise.                                                                                                        |
| Planetary rulers                | A raw select compresses a consequential methodology choice and a long explanation into one line.                | Three radio option cards: **Modern**, **Traditional**, and **Both**, each with a one-line distinction. Put the user's default under Preferences → Astrology defaults; show a chart-local override only in chart Advanced settings. See [RulershipSetting.tsx](../src/ui/RulershipSetting.tsx#L19). |
| Which transits to show          | A preset select, count, Show all button, and separate Adjust button split one decision across four controls.    | A compact filter bar with visible preset choices **Important**, **Outer**, **Personal**, and **All**, followed by **12 of 48 shown** and one **Change filters** action. A custom state reads **Custom · 12 of 48**. Remove the duplicate Show all action.                                          |
| Advanced transit filter         | Another select and long undifferentiated checkbox groups make the modal difficult to scan.                      | Use Tight/Balanced/Wide as a segmented choice with a short explanation. Group aspect and planet checkboxes under clear legends, add group-level All/Clear actions, keep a sticky Apply footer, and remove global rulership preferences from this staged modal.                                     |
| Long or searchable choice lists | Raw selects vary visually, while a custom listbox risks weaker keyboard and screen-reader behavior.             | Shared accessible Select for short lists and Combobox for searchable lists. Use a mature ARIA implementation, match both Astraya themes, and retain a native fallback. Do not create a custom calendar or listbox without complete keyboard, focus, touch, and screen-reader behavior.             |

This grammar makes the number and meaning of choices determine the component. Two to four short exclusive choices use a segmented control; choices needing explanation use radio option cards; a short long-form list uses Select; a searchable list uses Combobox; independent multiple choices use checkboxes; a persistent on/off preference may use a switch. A switch must not stand in for a staged form checkbox.

### Shared control styling and behavior

Consistency must apply to the control anatomy as well as the choice of component. At present, the complete surface, hover, disabled, and focus styling is attached to `.field-grid input` and `.field-grid select`, while controls elsewhere inherit different browser presentation. Checkboxes receive only the global accent color, and number inputs rely on browser-provided spinner arrows. See [app.css](../src/ui/app.css#L527), [app.css](../src/ui/app.css#L751), and number fields in [PersonForm.tsx](../src/ui/PersonForm.tsx#L241), [PrimaryDirectionsView.tsx](../src/ui/PrimaryDirectionsView.tsx#L287), and [PdfExportBuilder.tsx](../src/ui/PdfExportBuilder.tsx#L506).

Adopt one shared component contract:

- `TextField`, `DateField`, `NumberField`, `Select`, and `Combobox` use the same label position, standard height, horizontal padding, border, radius, surface, font, focus ring, disabled treatment, help spacing, and error position. Layout containers arrange fields but never define their visual design.
- Checkbox and radio selection rows use one box/circle size, stroke, selected color, label gap, focus treatment, disabled treatment, and 44px minimum row target. Their distinct check/dot indicators preserve meaning.
- Select triggers look like the other fields and use one chevron, option spacing, selected mark, popup surface, and keyboard/focus model across every feature.
- Provide only documented `standard` and dense-desktop `compact` variants. A feature must not invent another height, radius, or padding; compact returns to standard target sizes on touch layouts.
- Validation, units, optional/required state, help, and range text occupy stable `Field` slots so the same information always appears in the same place.

Number inputs require a shared `NumberField`. Retain `type="number"` semantics but suppress the browser-dependent visible spinner. Where stepping is useful, use the same Decrease and Increase buttons, order, arrow/icon style, dimensions, border division, hover/focus/pressed states, and min/max disabled treatment everywhere. Give the buttons specific accessible names and keep Arrow Down/Up keyboard stepping. On touch layouts, each step button needs a 44px target. When stepping adds no value, omit the buttons instead of falling back to a different native spinner.

### Astrocartography settings

Astrocartography currently places Line types, Bodies, Local Space, and optional Relocation before the map. The Bodies group then hides more bodies under a generic **Extended** disclosure. See [AstrocartographyView.tsx](../src/ui/AstrocartographyView.tsx#L239). These are all settings for the same map result, so the page should expose one **Map settings** trigger rather than four inline fieldsets plus another disclosure.

The closed state should summarize the applied configuration, for example **4 line types · 10 bodies · Local Space off**, with **Map settings** as the action. The modal is one staged form with:

1. **Line types:** MC, IC, AC, and DC checkboxes with All/Clear actions.
2. **Bodies:** one checkbox group with visible **Primary bodies** and **Additional bodies** headings. Remove the nested **Extended** disclosure; “additional” describes the contents instead of implying a second settings surface.
3. **Local Space:** one checkbox with its effect explained in one sentence.
4. **Relocation:** optional location or coordinates in the same form because they also change this map. Keep this group visually secondary and make clearing the relocation explicit.

The modal must use local draft state. **Apply to map** commits every group together and performs one recalculation; **Cancel**, Escape, close, and backdrop discard the draft; **Reset** restores the documented map defaults in the draft only. Keep the previous map visible with an updating state until the new result is ready. Do not recalculate for every checkbox click, open a second “Extended” modal, or place account/device preferences in this page-scoped form.

**What the lines mean** is explanatory result content, not a setting, so it remains below the map. Its current body rows are bare `<details>` elements whose `<summary>` contains only the body name; the only expansion cue is the browser's small triangle. See [AstrocartographyView.tsx](../src/ui/AstrocartographyView.tsx#L385). Replace them with the shared Disclosure component. Each full-width trigger should show the body glyph and text name, a secondary count such as **4 line meanings**, an explicit **Show meanings**/**Hide meanings** label, and the standard chevron at the trailing edge. The whole row is the target, with clear hover, focus, and open styling.

Expanded content should retain the selected line types as visibly separated entries with the line label followed by its explanation. Several bodies may remain open when comparison is useful. Do not use planet glyphs, a triangle, color, or position as the sole cue. Apply the same Disclosure component to other expandable reference content, including Rectification candidate details, instead of allowing each screen to style native `<details>` independently. See [RectificationView.tsx](../src/ui/RectificationView.tsx#L378).

### Chart, report, and table workflows

The chart screen has unusually strong accessible fallback design: the visual wheel is hidden from assistive technology while equivalent tables expose the same values and allow keyboard-driven selection. Its click-to-emphasize behavior and contextual interpretation are the interaction model to preserve and reuse. The layout should make that feedback feel like part of the visualization rather than content discovered later in the page.

Numeric columns should align to the decimal edge, table headings should remain visible during long result scans, and large result sets should support an opt-in compact density. A data-specific shell can expand on wide displays without widening reports. Reports should use a reading measure of roughly 65–70 characters rather than the general 64rem shell.

Page splitting should follow one rule across the product. Use a route-level local view for a substantial visualization or task that benefits from Back, bookmarking, or sharing; use headings and anchors for one continuous analysis; use tabs only for two to four compact mutually exclusive panels; use Disclosure for optional explanation; use a staged modal for related settings; and use pagination or virtualization when repeated rows cause the length. Split when two dominant visualizations have different selection contexts or when interaction feedback is routinely several screenfuls away from its trigger.

### PDF builder

The preset model is the right foundation, but the builder still exposes most advanced choices at once. On desktop, a sticky summary rail should state the person, preset, number of selected sections, AI consent state, and primary Build action. Each major family should use accessible disclosure while retaining its current selection. On mobile, the same groups should form a single accordion-like sequence with the primary action fixed at the end of document flow.

### State design and perceived performance

Pending buttons usually provide immediate feedback, and failed operations produce alerts. Initial route, database, chart, report, corpus, and admin loading commonly render only a short status line, causing the final page geometry to arrive later. Layout-matching placeholders are most valuable for chart wheels, tables, report headings, and admin tables. During recalculation, retaining the last valid result with an `aria-busy` overlay is preferable to replacing the entire result area with one line.

Empty-state quality varies. People has useful guidance, while zero-result tools and filtered admin views generally show plain text. Empty states should distinguish:

- **First-use emptiness:** explain the workflow and provide a primary CTA.
- **Filter emptiness:** state which filter caused the result and provide “Clear filters” or “Show all.”
- **Valid zero-result calculations:** explain that the calculation completed successfully and suggest the relevant parameter to widen.

### UX validation and product feedback

The codebase can establish semantic correctness, responsive containment, and accessibility mechanics, but it cannot prove that the grouping matches a reader's mental model. Validate the new shell and settings model with task-based sessions involving both a newer reader and an experienced astrology user. The critical tasks are creating a person and reaching a chart; selecting a sign, body, cusp, and aspect and finding each meaning immediately; moving among the four chart views; recognizing equivalent fields and number steppers across screens; switching person without losing the current feature; applying a one-chart override versus changing a default; exporting the current result versus backing up all data; and recovering from incomplete or zero-result states.

Use measurable targets: identify person/view/calculation basis within three seconds; place selection feedback immediately after its visualization; switch person in at most two actions; reach a primary feature through no more than one expandable group; keep the primary action visible at 1280×800; recognize the same control type across pages; and never require the user to infer a setting's scope. Any telemetry should answer a named UX question and exclude birth data, chart content, free text, and calculated results.

## 3. Modern Styling and Token Improvements

The stylesheet has excellent color tokens but lacks spacing, typography, state, elevation, and motion tokens. It currently contains 61 distinct `rem` literals. Introduce these primitives and migrate incrementally:

```css
:root {
  /* 4px spacing grid */
  --space-1: 0.25rem;
  --space-2: 0.5rem;
  --space-3: 0.75rem;
  --space-4: 1rem;
  --space-6: 1.5rem;
  --space-8: 2rem;
  --space-12: 3rem;

  /* Major-second type scale */
  --text-xs: 0.79rem;
  --text-sm: 0.889rem;
  --text-base: 1rem;
  --text-lg: 1.125rem;
  --text-xl: 1.266rem;
  --text-2xl: 1.424rem;
  --text-display: clamp(2rem, 1.6rem + 1.5vw, 2.5rem);

  --leading-tight: 1.2;
  --leading-body: 1.6;
  --measure-reading: 68ch;

  /* Semantic aliases, independent of astrology meaning */
  --color-danger: var(--aspect-hard);
  --color-warning: var(--solar);
  --color-success: var(--aspect-minor);
  --color-info: var(--aspect-soft);
  --color-focus: var(--accent);

  /* Shared control surface; do not scope this styling to one layout container. */
  --control-bg: color-mix(in oklab, var(--surface) 88%, var(--bg));
  --control-bg-hover: var(--surface-hover);
  --control-border: var(--line);
  --control-ring: color-mix(in oklab, var(--color-focus) 55%, transparent);
  --control-height: 2.75rem;
  --control-height-compact: 2.25rem;
  --control-padding-inline: 0.75rem;
  --control-radius: var(--radius-sm);
  --choice-size: 1.25rem;

  --shadow-popover: 0 0.5rem 1.5rem rgb(0 0 0 / 20%);
  --duration-fast: 120ms;
  --ease-standard: cubic-bezier(0.2, 0, 0, 1);
}

/* Keep browser-provided date/time affordances aligned with the selected app theme. */
:root {
  color-scheme: dark;
}

@media (prefers-color-scheme: light) {
  :root:not([data-theme]) {
    color-scheme: light;
  }
}

:root[data-theme='dark'] {
  color-scheme: dark;
}

:root[data-theme='light'] {
  color-scheme: light;
}

.field-control {
  min-block-size: var(--control-height);
  inline-size: 100%;
  padding: var(--space-2) var(--control-padding-inline);
  border: 1px solid var(--control-border);
  border-radius: var(--control-radius);
  background: var(--control-bg);
  color: var(--fg);
  font: inherit;
}

.field-control:hover {
  background: var(--control-bg-hover);
}

.field-control:focus-visible {
  border-color: var(--color-focus);
  outline: 2px solid var(--control-ring);
  outline-offset: 2px;
}

.choice-control {
  position: relative;
  display: grid;
  grid-template-columns: var(--choice-size) minmax(0, 1fr);
  align-items: center;
  gap: var(--space-2);
  min-block-size: var(--control-height);
}

.choice-control__input {
  position: absolute;
  inline-size: 1px;
  block-size: 1px;
  opacity: 0;
}

.choice-control__indicator {
  display: grid;
  place-items: center;
  inline-size: var(--choice-size);
  block-size: var(--choice-size);
  border: 1px solid var(--control-border);
  background: var(--control-bg);
}

.choice-control__input[type='checkbox'] + .choice-control__indicator {
  border-radius: 0.25rem;
}

.choice-control__input[type='radio'] + .choice-control__indicator {
  border-radius: 50%;
}

.choice-control__input:checked + .choice-control__indicator {
  border-color: var(--accent);
  background: var(--accent);
}

.choice-control:hover .choice-control__input:not(:checked, :disabled) + .choice-control__indicator {
  background: var(--control-bg-hover);
}

.choice-control__input:disabled + .choice-control__indicator {
  opacity: 0.6;
}

.choice-control__input[type='checkbox']:checked + .choice-control__indicator::after {
  content: '✓';
  color: var(--bg);
  font-weight: 700;
}

.choice-control__input[type='radio']:checked + .choice-control__indicator {
  box-shadow: inset 0 0 0 0.3rem var(--control-bg);
}

.choice-control__input:focus-visible + .choice-control__indicator {
  outline: 2px solid var(--control-ring);
  outline-offset: 2px;
}

.number-field__control {
  display: grid;
  grid-template-columns: minmax(0, 1fr) var(--control-height) var(--control-height);
}

.number-field input[type='number'] {
  appearance: textfield;
}

.number-field input[type='number']::-webkit-inner-spin-button,
.number-field input[type='number']::-webkit-outer-spin-button {
  margin: 0;
  appearance: none;
}

.number-field__step {
  min-inline-size: var(--control-height);
  min-block-size: var(--control-height);
  border-inline-start: 1px solid var(--control-border);
  border-radius: 0;
}

.disclosure {
  border: 1px solid var(--line);
  border-radius: var(--radius-sm);
  background: var(--surface);
}

.disclosure__trigger {
  display: grid;
  grid-template-columns: minmax(0, 1fr) auto auto;
  align-items: center;
  min-block-size: 2.75rem;
  padding: var(--space-2) var(--space-3);
  cursor: pointer;
  list-style: none;
}

.disclosure__trigger::-webkit-details-marker {
  display: none;
}

.disclosure__trigger:hover,
.disclosure[open] > .disclosure__trigger {
  background: var(--surface-hover);
}

.disclosure__trigger:focus-visible {
  outline: 2px solid var(--control-ring);
  outline-offset: 2px;
}

.disclosure[open] .disclosure__chevron {
  transform: rotate(180deg);
}

.disclosure__panel {
  padding: 0 var(--space-3) var(--space-3);
  border-block-start: 1px solid var(--line);
}

.notice {
  --notice-color: var(--color-info);
  padding: var(--space-3) var(--space-4);
  border: 1px solid color-mix(in oklab, var(--notice-color) 35%, var(--line));
  border-inline-start: 3px solid var(--notice-color);
  border-radius: var(--radius-sm);
  background: color-mix(in oklab, var(--notice-color) 9%, transparent);
}

.notice[data-tone='warning'] {
  --notice-color: var(--color-warning);
}

.notice[data-tone='error'] {
  --notice-color: var(--color-danger);
}

.notice[data-tone='success'] {
  --notice-color: var(--color-success);
}

button.danger,
.field-error,
.field-control[aria-invalid='true'],
.choice-control__input[aria-invalid='true'] + .choice-control__indicator {
  border-color: var(--color-danger);
  color: var(--color-danger);
}

.report-reading {
  max-inline-size: var(--measure-reading);
}

.shell--data {
  max-inline-size: min(96rem, calc(100vw - 3rem));
}

.data-table td[data-align='end'],
.data-table th[data-align='end'] {
  text-align: end;
  font-variant-numeric: tabular-nums;
}

.data-table[data-density='dense'] .data-table-scroll {
  max-block-size: min(65dvh, 42rem);
  overflow: auto;
}

.data-table[data-density='dense'] thead {
  position: sticky;
  inset-block-start: 0;
  z-index: 2;
}

@media (prefers-reduced-motion: no-preference) {
  button,
  .tab,
  .field-control,
  .segmented-control__option,
  .select-trigger,
  .disclosure__trigger {
    transition:
      background-color var(--duration-fast) var(--ease-standard),
      border-color var(--duration-fast) var(--ease-standard),
      color var(--duration-fast) var(--ease-standard);
  }

  .disclosure__chevron {
    transition: transform var(--duration-fast) var(--ease-standard);
  }
}
```

`TableColumn` should gain `align?: 'start' | 'end'` rather than styling columns by position. [format.ts](../src/ui/format.ts#L20) should gain deterministic date/time, number, and currency functions instead of formatting inside screens.

Create `Field`, `TextField`, `DateField`, `NumberField`, `Select`, `Checkbox`, `Radio`, `ChoiceGroup`, `OptionCards`, `FilterSummary`, `Disclosure`, and `SelectionInspector` primitives over these tokens. A native select's open popup and a native date calendar remain controlled by the browser/OS, so CSS alone cannot guarantee a consistent popup. For frequently used controls where that mismatch is objectionable, adopt a proven accessible popover/select or date-field primitive and theme its popup. Keep text entry, keyboard navigation, focus management, localization, touch behavior, and a native fallback; do not hand-build those interaction models from styled `<div>` elements.

The spacing-token migration should begin with shared primitives—buttons, fields, notices, table cells, and shells—before converting isolated visualization measurements. Chart geometry and SVG type sizes are specialized measurements and should not be forced onto the general UI scale.

## 4. Actionable Priority Backlog

### `[High Impact / Quick Win]`

| Fix                                                                                                          | Result                                                                     |
| ------------------------------------------------------------------------------------------------------------ | -------------------------------------------------------------------------- |
| Split warning, error, destructive, success, and info presentation into semantic variants.                    | Faster recognition and consistent unhappy paths.                           |
| Make “Build PDF” primary; add a zero-people CTA and a selected-section summary.                              | Repairs the most obvious action-hierarchy problem.                         |
| Add numeric alignment metadata to `SortableTable`; enable dense sticky tables where row counts are high.     | Substantially improves scanning of astrology and admin data.               |
| Add `StatusMessage` with `role="status"`, `aria-live="polite"`, and parent `aria-busy`.                      | Consistent screen-reader and loading feedback.                             |
| Centralize admin timestamp, count, and currency formatting.                                                  | Removes locale and timezone ambiguity.                                     |
| Change chart titles to include the active chart type.                                                        | Makes location apparent without decoding secondary navigation.             |
| Make Charts one navigation destination and remove chart types from the application menu.                     | Removes one redundant navigation layer before the chart redesign lands.    |
| Apply explicit theme `color-scheme` values and one shared field surface to every date/select input.          | Removes black or mismatched native controls and container-specific drift.  |
| Migrate text, date, number, select, checkbox, and radio controls to the shared Field/Choice anatomy.         | Makes equivalent controls look and behave the same on every page.          |
| Replace browser number spinners with the shared accessible NumberField stepper wherever stepping is useful.  | Standardizes arrows, increments, boundary states, and keyboard behavior.   |
| Replace Planetary rulers with three option cards and Primary Directions time key with a two-choice control.  | Makes small, consequential choices visible and understandable.             |
| Replace the transit preset select/Show all/Adjust cluster with presets, a count summary, and Change filters. | Turns four competing controls into one readable filter model.              |
| Move all Astrocartography map controls into one staged Map settings modal and remove Extended.               | Reduces page clutter and applies related map changes in one recalculation. |
| Replace bare Astrocartography and Rectification `<details>` rows with the shared Disclosure pattern.         | Makes expandability obvious and consistent across reference content.       |
| Add a searchable person switcher and route complete people to Overview; keep Edit birth record contextual.   | Separates frequent reading work from infrequent record maintenance.        |
| Move page exports to the page toolbar, Build PDF to Documents, and data exports to Data & privacy.           | Gives every export the scope users expect without a mixed global menu.     |
| Group Tools with headings and remove nested submenus.                                                        | Improves discovery while reducing menu depth.                              |
| Remove immediate device-preference writes from staged settings dialogs, or stage those controls too.         | Restores a truthful Apply/Cancel contract.                                 |
| Add a visible scope label to every settings group: view, chart, person, account, device, or application.     | Makes persistence and reach predictable before the user changes a value.   |

### `[Medium Priority / UX Polish]`

| Fix                                                                                                                           | Result                                                                                                                 |
| ----------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------- |
| Limit report prose to 68ch while allowing tables to use a wide shell.                                                         | Better long-form reading and better dense-data use of desktop space.                                                   |
| Add sticky dirty-state actions and a completion summary to PersonForm.                                                        | Reduces long-form scrolling and uncertainty.                                                                           |
| Refactor calculator controls to native submit semantics.                                                                      | Enter works predictably for keyboard users.                                                                            |
| Preserve previous results during recalculation and add content-shaped placeholders for initial loads.                         | Less layout shift and stronger perceived performance.                                                                  |
| Increase mobile header controls to at least 44px and test short-height mobile screens.                                        | Better touch ergonomics.                                                                                               |
| Convert PDF sections into accessible progressive-disclosure groups with a sticky desktop summary.                             | Reduces cognitive load without removing options.                                                                       |
| Replace inherited person navigation on global tool routes with explicit “Return to” or “Using person” context.                | Prevents false person scope while preserving an efficient way back.                                                    |
| Add one canonical Preferences surface for language, theme, symbols, glyphs, and rulership.                                    | Makes account and device preferences predictable and discoverable.                                                     |
| Split Preferences into General, Astrology defaults, Appearance & accessibility, and Data & privacy.                           | Prevents unrelated scopes and responsibilities from becoming one settings dump.                                        |
| Move language and methodology defaults to a local-first account profile while retaining signed-out fallback.                  | Makes genuine user preferences follow the user without making offline use depend on sign-in.                           |
| Show a calculation-basis line on every calculated view and carry it into reports, shares, and exports.                        | Makes defaults and overrides visible and results easier to trust.                                                      |
| Add task-specific continuation actions that preserve person and chart context.                                                | Reduces repeated selection and menu navigation across common workflows.                                                |
| Split the on-screen chart sheet into Wheel, Aspects, Placements, and Patterns & condition route views.                        | Keeps pages shorter while preserving one predictable chart navigation level.                                           |
| Place a shared SelectionInspector beside each interactive chart or matrix when space permits and immediately below otherwise. | Keeps the selected facts and meaning visible near the object that produced them without making narrow layouts cramped. |
| Introduce the shared field, choice, filter, disclosure, and selection primitives named in this review.                        | Gives equivalent controls the same visuals, states, keyboard model, and help treatment.                                |

### `[Long-term Design System Debt]`

| Fix                                                                                                                     | Result                                                                              |
| ----------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------- |
| Build the shared control and feedback primitives named in this review over the new tokens.                              | Prevents further styling and behavior drift.                                        |
| Adopt explicit `reading`, `form`, `visualization`, and `data` layout modes, using container queries where practical.    | Scales cleanly from phone to ultra-wide displays.                                   |
| Add visual-regression coverage for both themes across the full viewport matrix and conduct a manual screen-reader pass. | Covers hierarchy and usability that axe cannot judge.                               |
| Add an instrumented person/chart/tool launcher with `Cmd/Ctrl+K` only after confirming frequent navigation patterns.    | Gives professional users faster access without adding shortcut complexity blindly.  |
| Define a typed feature registry for scope, grouping, order, prerequisites, settings mode, and exports.                  | Prevents new routes and features from drifting across menus and settings patterns.  |
| Define a typed settings registry for owner, lifetime, persistence, sync, default, and editing surface.                  | Prevents controls from acquiring accidental person, page, account, or device scope. |
| Replace the crowded horizontal header with a responsive collapsible workspace rail and focused content header.          | Scales the shell without deeper menus or sacrificing data width.                    |
