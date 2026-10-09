# Astraya UI/UX Implementation Guide

**Status:** Normative guidance for new UI work  
**Audience:** Coding agents and human contributors  
**Related documents:** [UI-UX_REVIEW.md](UI-UX_REVIEW.md) · [UI-UX_IMPLEMENTATION_PLAN.md](UI-UX_IMPLEMENTATION_PLAN.md)

This document defines how Astraya features should be organized, presented, and implemented so that the interface remains predictable as the product grows. Apply it to new screens, feature additions, and substantial UI refactors.

The terms **must**, **should**, and **may** express required behavior, the preferred behavior when no stronger constraint applies, and an optional choice.

## Design authority

The current UI is a source of workflow requirements and implementation evidence. It is not the design standard. Do not copy an existing pattern merely to remain consistent when that pattern is confusing, inconsistent, visually dated, inaccessible, or needlessly complex.

Build toward one clean target experience:

- Preserve correct domain behavior, user data, privacy guarantees, accessibility, localization, and calculation semantics.
- Replace weak layout, navigation, copy, hierarchy, settings placement, and interaction patterns when a clearer solution exists.
- Prefer familiar web conventions and direct task flows over preserving historical component behavior.
- When replacing a shared pattern, migrate related instances where practical instead of introducing a third variation.
- Consistency means consistency with this guide and the intended target system, not repetition of current design debt.
- A redesign may move, rename, regroup, combine, or remove redundant controls when the resulting feature remains discoverable and its behavior is preserved or deliberately improved.
- Do not add compatibility UI, duplicate entry points, or explanatory clutter solely to protect an obsolete interaction pattern. Use a short transition only when removing it immediately would cause users to lose work or access.

When current behavior and this guide disagree, follow this guide. Document any product or technical constraint that requires an exception and describe the user impact.

## 1. Start with the user's goal and scope

Before writing a component, record:

1. The user goal in one sentence.
2. Whether the feature belongs to a person, a saved chart, the signed-in user, this device, one page/view, an administrator, or the deployment.
3. Its navigation group and order.
4. Its prerequisites, such as a complete birth moment, authentication, a second person, or network access.
5. Which state must survive a redraw, route change, reload, sign-in, another device, export, or sharing.
6. Its loading, empty, partial-data, error, offline, and destructive states.
7. Its keyboard path and mobile layout.

Do not begin from a desired control such as “add a modal” or “add a menu item.” Choose the surface after the goal and scope are clear.

## 2. Use the canonical information architecture

Organize primary navigation around user goals:

| Area               | Order and grouping                                                                                                        |
| ------------------ | ------------------------------------------------------------------------------------------------------------------------- |
| Person workspace   | **Overview → Charts → Interpretation → Timing & forecasts → Relationships → Location**                                    |
| Person details     | **Edit birth record** from Overview and the person selector; route incomplete/new people here automatically               |
| Charts             | One direct destination; choose Natal, Draconic, Harmonic, Solar return, or Lunar return in the chart page header          |
| Timing & forecasts | **Current sky:** Transits, Forecast. **Symbolic timing:** Profections, Progressions, Solar Arc, Primary Directions        |
| Relationships      | Synastry, Composite                                                                                                       |
| Location           | Astrocartography; Local Space is configured inside Map settings rather than exposed as another destination                |
| Tools              | **Sky & cycles:** Planetary cycles, Eclipses. **Questions & planning:** Horary, Electional. **Birth data:** Rectification |
| Page exports       | Place exports beside the page title; use overflow only when necessary                                                     |
| Documents          | Build custom PDF                                                                                                          |
| Data & backup      | Preferences → Data & privacy                                                                                              |

Apply these rules:

- A feature must have one canonical home. Shortcuts may point to it but must not create a second competing structure.
- Group by the task the user recognizes. Do not group by module name, data type, implementation package, or delivery order.
- Keep a menu to one dropdown level. Use noninteractive headings and separators inside a dropdown instead of flyouts within flyouts.
- Keep order stable. Put foundational inputs before outputs, common workflows before specialist workflows, and destructive/administrative actions away from ordinary creation paths.
- A global tool must not inherit person scope merely because a person was viewed recently. Show **Return to Ada Lovelace** for history and **Using Ada Lovelace** only when that person actually affects the tool.
- A complete person opens on Overview. A new or incomplete person opens on Edit birth record until required data is complete.
- The current person's name is a searchable selector, not a static label. Switching people should preserve the current feature when its prerequisites are met.
- Route links use anchors. Buttons perform actions. Same-page tabs use the tab pattern only when small panels are genuinely mutually exclusive. Chart views use ordinary route links; related sections inside one view use headings and in-page anchors. Route links do not use `role="tab"`.
- Every page title must identify both the feature and its subject, for example **Natal chart · Ada Lovelace** or **Transits · Ada Lovelace**.

When adding a feature, add typed metadata for its `scope`, `group`, `order`, `href`, prerequisites, settings mode, and export capabilities. Update route parsing, lazy loading, English and Dutch labels, active navigation, and relevant export registration together. An exhaustiveness test should fail when a user-facing route has no feature metadata.

### Target application shell

Use a collapsible workspace rail on wide screens and a drawer on smaller screens. The rail contains:

1. Brand and People.
2. Searchable person selector when a person is active.
3. Person workspace groups.
4. Tools and Documents.
5. Preferences, sync, and account controls anchored at the bottom.

The content header contains the page title, compact calculation basis, primary page action, and actions that affect only this page. It does not repeat global navigation.

Keep page exports with their page. Put Build PDF under Documents. Put full-data/CSV backup under Preferences → Data & privacy. Do not rebuild the current mixed Export menu in another component.

On calculated views, show the effective basis in a compact line such as **Tropical · Placidus · Modern rulers · Standard orbs**, with an **Edit** action. Carry that basis into reports, shared charts, and exports.

Overview is a task launchpad, not a generic dashboard. Show record readiness, essential natal context, current calculation basis, and a small set of real next actions. Do not add decorative metrics, charts without a decision purpose, or a feed of arbitrary recommendations.

Add continuation actions only where they advance the current task: **Open interpretation** after a natal chart, **View transits** from Overview, **Compare with another person** from relationship work, and **Build PDF** from a completed report. Preserve the person and effective chart configuration across the transition.

Do not create separate beginner and expert modes. Keep common actions visible, reveal advanced controls progressively, offer meaningful presets, and support experts through search, remembered defaults, and keyboard access. Hiding whole features by mode makes the product harder to learn and support.

### Target chart page

Charts has one entry in the application rail. Do not list Natal, Draconic, Harmonic, Solar return, and Lunar return as a submenu and then repeat them as a pill or tab row on the page. Use one labelled **Chart type** control in the content header. Changing it updates the route and page title, for example **Draconic chart · Ada Lovelace**.

The current on-screen chart sheet combines the dial, aspect matrix, emphasis grid, and degree strip in one tall SVG. Because the selection inspector follows that SVG, clicking something near the dial can place its explanation several panels below the click. Separate the on-screen renderers while retaining the combined chart sheet for SVG, PNG, and PDF export.

Use four task-oriented chart views instead of seven technical tabs or one very long document:

| View                     | Contents                                                                                                                                                     |
| ------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| **Wheel**                | Interactive chart dial with its Selection inspector beside it when space permits and immediately below otherwise. This is the default view.                  |
| **Aspects**              | Interactive aspect matrix with the selected aspect's facts and meaning adjacent, then the accessible aspect table and related aspect data.                   |
| **Placements**           | Positions, Houses, and Derived points. Use visible section headings and a small in-page contents control only when the page still exceeds a few screenfuls.  |
| **Patterns & condition** | Chart shape, element/modality emphasis, degree distribution, dignities, and dispositors. Keep each explanatory visualization next to its supporting summary. |

These are route-level views with stable URLs and ordinary links, not ARIA tabs. Show one compact **Wheel · Aspects · Placements · Patterns & condition** local navigation row on desktop. On narrow screens use the shared labelled **Chart view** Select. This is the only local chart navigation; do not add section tabs inside these views.

The Wheel view uses a responsive workbench. Below a `68rem` content container, the inspector appears immediately below the chart. At `68rem` and above, it occupies a restrained side column. The threshold comes from a `46rem` minimum chart, `20rem` minimum inspector, and `2rem` gap rather than a device category:

```text
┌ Natal chart · Ada Lovelace ───────────────────────────────────────┐
│ Chart type [ Natal ▾ ]  Tropical · Placidus · Modern             │
│                                              [Edit basis] [Export]│
├ Wheel ─── Aspects ─── Placements ─── Patterns & condition────────┤
│                                  │ Selected: Leo                  │
│         Interactive dial         │ Leo on the cusp of house 5     │
│                                  │ What it means…                 │
│                                  │ Related placements and aspects…│
└──────────────────────────────────┴────────────────────────────────┘
```

- Every interactive visualization owns one `SelectionInspector` directly after it in DOM order. Make the workbench an inline-size query container. Use one column below `68rem`; at `68rem` and above use `minmax(46rem, 1fr) minmax(20rem, 24rem)` with a `2rem` gap. No unrelated chart, table, export control, or settings panel may separate them, and the inspector must not have an independent vertical scrollbar.
- Before a selection, the reserved inspector says **Select a planet, sign, house cusp, or aspect to explore it**. Reserve enough geometry to avoid a large page jump on first selection.
- After selection, show the selected name, exact facts, **What it means**, related connections, and Clear. For example, selecting Leo may show **Leo on the cusp of house 5** and its interpretation.
- Keep the inspector concise: show the most relevant corpus meanings first, retain an explicit **Show all meanings** disclosure for the rest, and place optional AI interpretation after the deterministic facts and corpus text rather than letting it displace them.
- Keep the selected mark visually emphasized and dim unrelated marks without hiding them. The inspector and accessible table must expose the same selection and allow keyboard users to select an equivalent row.
- Switching chart type preserves the current chart view when it exists. Missing concepts such as houses receive an inline explanation in the affected view.
- Keep the combined chart-sheet renderer for exports, where a complete printable artifact is useful. Compose separate dial, aspect-matrix, emphasis, and degree-strip renderers on screen from the same computed data.

The visualization layout must opt into the wide data shell; the current `64rem` general-content cap would otherwise make the two-column state unreachable. Implement the layout in CSS rather than measuring it in JavaScript:

```css
.chart-workbench {
  container: chart-workbench / inline-size;
}

.chart-workbench__layout {
  display: grid;
  grid-template-columns: minmax(0, 1fr);
  gap: 2rem;
}

@container chart-workbench (min-width: 68rem) {
  .chart-workbench__layout {
    grid-template-columns: minmax(46rem, 1fr) minmax(20rem, 24rem);
  }
}
```

## 3. Assign every setting an owner and lifetime

A setting belongs to the object whose behavior changes. Its location in the current component tree does not determine its scope.

| Scope                     | Use it for                                                                               | Edit it in                                                  | Persistence                                                        |
| ------------------------- | ---------------------------------------------------------------------------------------- | ----------------------------------------------------------- | ------------------------------------------------------------------ |
| Application/deployment    | Provider selection, service policy, feature availability, system limits                  | Deployment configuration or Admin                           | Server/configuration; application-wide                             |
| User/account              | Language, regional formatting, astrology-method defaults, default filters                | Global Preferences workspace                                | Local-first; sync across the user's devices when signed in         |
| Device/browser            | Theme, motion, density, symbol rendering, glyph variants, display-specific accessibility | Preferences → Appearance & accessibility; optional shortcut | This browser/device only                                           |
| Person                    | Name, birth facts, time accuracy, place, notes                                           | The person's Birth record                                   | IndexedDB operation log; optional account sync                     |
| Saved chart/configuration | House/zodiac/orb/display choices required to reproduce that chart                        | Chart Advanced settings                                     | Save with chart/share/export configuration                         |
| Page/view                 | Date, comparison target, filters, sort, section, expansion, temporary export choices     | Inline or page-specific Advanced settings                   | React state; URL when navigable/shareable; no implicit persistence |
| Request/security          | AI consent, destructive confirmation, authentication challenge                           | At the action                                               | Never a standing preference                                        |

Every setting definition must declare a stable key, `scope`, owner, default, persistence, sync behavior, editing surface, commit mode, reset target, serialization version, and whether the value is sensitive. Keep this metadata in one typed settings registry so a control cannot acquire persistence accidentally.

When a setting supports defaults and overrides, use this precedence:

1. Astraya's application default.
2. The user's default.
3. A saved-chart override.
4. A temporary view override.

Device presentation preferences apply alongside this chain. Person records do not participate in it: birth facts are inputs, not calculation defaults. The UI must identify the effective source and make Reset explicit: **Reset to my default** or **Reset to Astraya default**.

### Calculation profiles

Ship exactly three built-in calculation profiles:

| Profile and stable ID                            | Zodiac and houses                      | Rulers      | Bodies and points                                                                 | Aspects and orbs                                                                 |
| ------------------------------------------------ | -------------------------------------- | ----------- | --------------------------------------------------------------------------------- | -------------------------------------------------------------------------------- |
| **Modern Western** `modern-western-v1`           | Tropical · Placidus                    | Modern      | Mean lunar node; mean Lilith; Chiron shown; Fortune, Vertex, and midpoints hidden | Five major aspects; no minor or additional-target aspects; Astraya standard orbs |
| **Traditional Western** `traditional-western-v1` | Tropical · Whole Sign                  | Traditional | Mean lunar node; mean Lilith; Fortune shown; Chiron, Vertex, and midpoints hidden | Five major aspects; no minor or additional-target aspects; Astraya standard orbs |
| **Sidereal (Lahiri)** `sidereal-lahiri-v1`       | Sidereal, Lahiri ayanamsa · Whole Sign | Traditional | Mean lunar node; mean Lilith; Fortune, Chiron, Vertex, and midpoints hidden       | Five major aspects; no minor or additional-target aspects; Astraya standard orbs |

The five major aspects are conjunction, sextile, square, trine, and opposition. Astraya standard orbs are 7° for the non-sextile major aspects and 10° when a luminary participates; 4° for sextile and 5.5° with a luminary; a 2.5° minor-aspect value with minor aspects disabled; and a 0% scale adjustment. Describe these values as Astraya defaults rather than historical doctrine.

A calculation profile must assign every calculation and result-visibility value it owns. Selecting one copies that complete definition into the current draft. **Custom** is a derived label shown whenever any owned value differs; it is not a fourth built-in. Appearance values such as theme, symbol rendering, glyph weight and variants, density, motion, and wheel color remain outside calculation profiles.

Use immutable, versioned IDs and persist concrete effective values with saved, shared, or exported charts. A later profile revision receives a new ID so old results remain reproducible. Use **Sidereal (Lahiri)** in the interface; remove the pre-production `vedic` key without an alias when implementing this model.

Do not add a separate Hellenistic profile while it would resolve to the same owned values as Traditional Western. Add a built-in only when it represents a materially distinct, expert-reviewed calculation contract and can be named without implying unsupported methodology. Two labels must not produce identical built-in settings.

### 3.1 Person-specific data

Person scope is for facts and notes about one person. The UI must name the person and say that the change applies to them. Persist through the existing person operation log so offline behavior and optional sync remain consistent.

Do not store the user's astrology methodology on a person simply because a chart is calculated for that person. A person can have several chart configurations. Store reproducibility settings with the chart/configuration and store the user's starting defaults in their profile.

### 3.2 User/account preferences

Use user scope for choices that express the reader's stable language or methodology across devices:

- Language and regional date/number formatting.
- Rulership model.
- Default house system, zodiac/ayanamsa, orb profile, visible points, and aspects.
- Default transit-filter profile.

These preferences must work while signed out. Apply changes locally first. When profile sync exists and the user signs in, adopt or reconcile local and remote values explicitly. Do not make offline use depend on authentication and do not silently overwrite a newer local choice.

### 3.3 Device preferences

Use device scope for choices that reasonably differ by screen, operating system, browser, or input mode:

- System/light/dark theme.
- Reduced motion and interface density.
- Drawn, Unicode, or text symbols.
- Glyph weight and Uranus/Pluto variants.

Store these locally and identify them as **This device**. A header toggle may provide fast access, but the same value must also have one canonical location under Preferences.

### 3.4 Chart and page settings

Chart calculation settings that affect reproducibility must travel with a saved/shared/exported chart. Advanced chart settings should offer clear actions:

- **Apply to this chart** changes the current chart.
- **Save as my default** changes the user's starting profile for future charts.
- **Reset** changes the draft to the documented default and does not commit it.
- **Cancel** discards every change made in the dialog.

A chart preset changes the current chart draft. It must not rewrite account defaults. If the preset includes a different rulership model or house system, store that as a chart override after Apply; change the account default only after a separate **Save as my default** action.

A small set of page inputs such as the target date, comparison person, table sort, and PDF contents belongs inline. When one result has several related configuration groups, such as Astrocartography line types, bodies, Local Space, and relocation, put the whole set in one staged page-settings modal and show its applied summary beside the result. Keep page state in component state unless Back/reload/share should reproduce it; in that case encode stable, non-sensitive state in the URL. Do not write page state to `localStorage` unless the user explicitly chooses **Set as default**.

### 3.5 Application and administrator settings

Deployment policy, service credentials, provider choice, feature rollout, organization limits, and administrator-only controls do not belong in user Preferences. Put editable policy on a dedicated Admin route and keep secrets in server/deployment configuration.

### 3.6 Privacy and consent

Consent authorizes the specific action described beside it. AI consent must remain unchecked and unpersisted for every new request. Never promote consent to a user preference, person field, or device flag.

## 4. Use a predictable settings surface

Global Preferences must use one stable, responsive route with these groups:

1. **General:** language, regional formats, display timezone policy.
2. **Astrology defaults:** rulership, calculation preset, house system, zodiac/ayanamsa, orbs, points/aspects, default filters.
3. **Appearance & accessibility:** theme, symbols, glyph variants/weight, density, motion.
4. **Data & privacy:** sync/account status, local-storage persistence, export, and account-data removal.

Every group must display its scope: **Your account** or **This device**. Application-wide controls belong to Admin and must be labelled there.

Preferences save immediately and display save/sync state inline. Each change updates the local source of truth first and then synchronizes account-scoped values in the background. Announce save or sync failure without reverting a valid offline change. Do not render Apply, Done, or Cancel for the whole workspace because there is no page-wide draft to commit or discard. A dedicated route provides room for durable defaults, synchronization, exports, destructive data actions, browser history, deep links, and a reliable mobile layout.

Use these surface rules:

- A small set of page-defining inputs stays inline. When one result has several related configuration groups, use one page-specific staged modal and keep a summary of the applied state on the page.
- A large set of reversible advanced page controls uses the shared `settings-card` modal.
- A staged modal must stage every control. **Apply** commits all changes; **Cancel**, Escape, close, and backdrop discard all changes; **Reset** modifies only the draft.
- The immediate-save Preferences workspace announces save or sync status and never contains a page-wide staged commit model.
- Do not put an immediately persisted reusable control inside a staged modal unless the parent supplies its draft value and commit callback.
- Use the shared `Disclosure` component for optional inline content that does not require interruption or a commit decision. It may use semantic `<details>/<summary>` internally, but it must not expose a bare browser disclosure triangle as its only affordance.
- A destructive action uses a dedicated confirmation dialog that names the object and consequence.
- Labels such as **This view**, **This chart**, **Ada Lovelace**, **Your account**, and **This device** must make reach and persistence clear before interaction.

### Astrocartography map settings

Astrocartography uses one **Map settings** modal form for every control that changes the map. The page must not render separate inline fieldsets for Line types, Bodies, Local Space, and Relocation, and it must not add an **Extended** disclosure or second modal.

The page-level trigger sits near the map heading and includes a compact summary of the applied state, such as **4 line types · 10 bodies · Local Space off**. The dialog contains these visible groups in this order:

1. **Line types:** MC, IC, AC, and DC checkboxes with group-level All/Clear actions.
2. **Bodies:** checkboxes grouped under **Primary bodies** and **Additional bodies**. Keep both groups in the same scrollable form; “Additional bodies” replaces the vague “Extended” label.
3. **Local Space:** one staged checkbox and concise explanation.
4. **Relocation:** optional place/coordinates with a clear action, visually secondary to the line configuration.

Opening the modal copies the applied configuration into a draft. **Apply to map** validates and commits the whole draft, closes the modal, updates the summary, and starts one recalculation. **Reset** changes only the draft. **Cancel**, Escape, close, and backdrop discard it and restore focus to the trigger. Keep the last valid map visible and mark it as updating until the replacement is ready.

These are page/view settings. Do not persist them silently or mix account/device preferences into the modal. Encode them in the URL only when reload, Back, bookmarking, or sharing is expected to reproduce the map.

### Disclosure pattern

Expandable reference content uses one shared `Disclosure` component. A disclosure trigger is a full-width interactive row containing:

- A clear text title; a domain glyph may support the title but never replace it.
- Optional secondary text describing what will open, such as **4 line meanings**.
- Explicit **Show meanings**/**Hide meanings**, **Show details**/**Hide details**, or equally specific action text.
- The standard trailing chevron, which rotates in the open state and is hidden from assistive technology.

The entire trigger row has a minimum 44px target, pointer affordance, border/surface treatment consistent with other controls, and distinct hover, focus-visible, active, and open states. Opening must not move focus. The panel is associated with its trigger, and the trigger exposes expanded state. Several disclosures may remain open when comparison is useful.

`<details>/<summary>` is an acceptable semantic implementation. Remove the native marker only after adding the shared chevron and explicit action wording. Do not ship a raw triangle beside a title, a glyph-only trigger, or a one-off accordion skin in a feature stylesheet.

In Astrocartography, **What the lines mean** remains below the map as reference content. Render one Disclosure per selected body with its glyph plus text name, selected-line count, and **Show meanings** action. Expanded content shows each selected line type and its explanation as a separated definition entry. Use the same component for Rectification candidate details and future expandable reference content.

## 5. Build each page around a clear hierarchy

Each page should render in this order when applicable:

1. Back/context link or compact breadcrumb.
2. One descriptive `<h1>` containing feature and subject.
3. A short context line for calculation basis, person, date, or scope.
4. Primary page inputs and the main action.
5. Status or summary metrics.
6. Result content.
7. Secondary actions and advanced settings.

The primary action must be visually strongest and appear near the inputs it submits. A long form should expose completion, dirty state, and a reachable Save action without forcing the user to scan to the bottom. Secondary and destructive actions must not compete with the primary action.

Use a reading measure near 68 characters for interpretation prose. Use wider data shells for tables, charts, and builders. Do not solve both needs with one global maximum width.

### Choose the right way to split content

Do not solve every long page with another tab row, and do not force every related result into one continuous page. Use the smallest structure that keeps the user's current task and feedback together:

| Structure                       | Use when                                                                                                                                            |
| ------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Route-level local view**      | The content is a substantial task or visualization, benefits from Back/bookmark/share, or would push its interaction feedback several screens away. |
| **In-page section with anchor** | The content forms one reading or analysis flow and remains understandable in sequence.                                                              |
| **Tabs**                        | Two to four compact, mutually exclusive panels share one context and switching does not need its own URL or browser history.                        |
| **Disclosure**                  | Optional explanation or secondary detail can open in place without interrupting the task.                                                           |
| **Modal form**                  | Related settings must be reviewed and committed together while the result remains visible behind the dialog.                                        |
| **Pagination/virtualization**   | Repeated data volume, rather than information architecture, makes a list or table long.                                                             |

Split a page when it contains more than one dominant visualization with different selection contexts, when the result a control changes is no longer visible near that control, or when a secondary task routinely begins several screenfuls below the primary task. Keep each visualization's legend, selection feedback, and interpretation in the same view. Preserve context in the URL when moving between route-level local views.

## 6. Implement forms and controls semantically

Choose controls by the decision being made, not by whichever component a nearby screen already uses:

| Decision shape                                    | Required pattern                                                                                                                                       |
| ------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Two to four short, exclusive choices              | Segmented control implemented as a labelled radio group. Selected, hover, focus, and disabled states must remain distinct in both themes.              |
| Two to five exclusive choices needing explanation | Radio option cards with a short title and one concise consequence per choice. The entire card may activate its radio.                                  |
| Five to twelve concise choices                    | Shared Select. Use a proven accessible popover primitive when the popup must match Astraya; retain a styled native fallback.                           |
| A long or searchable choice list                  | Combobox with text filtering, result count, full keyboard navigation, and a clear no-results state.                                                    |
| Independent multiple choices                      | Checkbox group with a visible legend. For long groups, add group-level **Select all** and **Clear** actions and show a selected count.                 |
| Immediate persistent on/off preference            | Switch with visible state text where ambiguity is possible.                                                                                            |
| Boolean value inside a staged form                | Checkbox. A switch must not imply immediate application when the parent requires Apply.                                                                |
| Date                                              | Shared `DateField` with direct keyboard entry, locale-aware display, ISO storage, validation, and an optional calendar button.                         |
| Number with a meaningful increment                | Shared `NumberField` with the same field shell and one standard stepper. Define `min`, `max`, `step`, unit, and accessible Increase/Decrease labels.   |
| Active filters                                    | `FilterSummary` showing the preset/custom name, shown/total count, and one **Change filters** action. Keep a direct **Clear** action for zero results. |
| Optional explanatory or reference content         | Shared `Disclosure` with a full-width title, content summary, explicit Show/Hide wording, trailing chevron, and visible interaction states.            |

Use these mappings in the current product and in new work:

- **Chart type:** one labelled Select in the chart header because five route-level choices must fit on mobile. It replaces both the Charts submenu and the chart-type pill row.
- **Chart view:** one row of four ordinary route links on desktop and one shared labelled Select on narrow screens. Preserve chart type and view in the URL; do not render these route links with tab semantics.
- **Primary Directions time key:** two-choice segmented control for Naibod/Ptolemy. Put the selected rate and a concise explanation below the group; use option cards if translated labels make the segment too wide.
- **Planetary rulers:** option cards for Modern, Traditional, and Both. The default lives in Preferences → Astrology defaults. A chart Advanced settings dialog may stage a chart-only override, but it must not silently change the user's default.
- **Which transits to show:** visible compact preset choices for Important, Outer, Personal, and All; a summary such as **Important · 12 of 48 shown**; and one **Change filters** action. When advanced values differ from every preset, show **Custom · 12 of 48 shown**. Do not add a separate Show all button beside an All preset.
- **Advanced transit filters:** segmented Tight/Balanced/Wide orb choice, clearly grouped checkboxes for aspects and bodies, group-level All/Clear actions, and a sticky modal footer. Do not place the global Planetary rulers preference inside this staged dialog.
- **Astrocartography:** one Map settings modal containing Line types, Primary and Additional bodies, Local Space, and Relocation. Show only the applied summary on the page and recalculate once after Apply.

### Shared control anatomy

Every field and selection control must come from the shared component layer. A feature must not style a raw input merely because it sits outside an existing form grid.

- `TextField`, `DateField`, `NumberField`, `Select`, and `Combobox` share label placement, control height, padding, radius, border, surface, typography, focus ring, disabled treatment, help spacing, and error placement. Textarea height may differ; its surrounding anatomy does not.
- Checkbox and radio controls share one size, stroke, selected color, focus ring, label gap, disabled treatment, and minimum row target. A checkmark and radio dot communicate different semantics within the same visual family.
- Select triggers use the same field surface as text entry. Their chevron, clear action, popup radius, option padding, selected mark, and focus treatment come from the shared Select component.
- Use `standard` and, only for dense desktop data tools, `compact` size variants. Do not create feature-specific heights, radii, or padding. Compact controls return to standard sizing on coarse-pointer/touch layouts.
- Labels, required/optional state, units, help, errors, and character/range limits occupy defined slots in the `Field` component. Reserve error space where validation is likely so controls do not jump vertically.

Bind the root `color-scheme` to Astraya's effective light/dark theme so browser date/time affordances do not contradict an explicit app theme. Never scope the only input/select styling to `.field-grid` or another layout container.

`NumberField` keeps a real numeric input for keyboard and screen-reader semantics but suppresses browser-dependent visible spinners. When stepping is useful, render the shared trailing Decrease/Increase buttons in the same order, dimensions, icon style, hover/focus/pressed states, and boundary-disabled treatment everywhere. The buttons use accessible names such as **Decrease age** and **Increase age**; Arrow Down/Up performs the same step while the input has focus. On touch layouts each step button has a 44px target. If stepping is not meaningful, omit the buttons rather than showing a different spinner style. Preserve valid intermediate typing such as an empty value, minus sign, or decimal separator until blur/submit validation.

The shared date field must remain directly editable. The calendar opens from a separate, labelled button and is optional; typing and pasting a date must never require opening it. Store `YYYY-MM-DD` independently of the localized display value. Do not hand-build a calendar grid or listbox: use a mature accessible primitive and verify arrow keys, page/month movement, Escape, focus return, touch, zoom, screen readers, and both languages. A browser-native picker is the fallback when those requirements cannot be met.

- Use a `<form>` with native submit behavior when Enter should run the operation.
- Use `<fieldset>` and `<legend>` for related controls.
- Associate every label, help text, validation message, and unit with its field.
- Preserve entered data after validation or network failure.
- Put the error beside the field and provide an error summary with links when a long form contains several errors.
- State units and accepted formats before entry. Parse and format dates, numbers, coordinates, currency, and timezones through shared deterministic helpers.
- Disable a control only when interaction cannot succeed. Explain the prerequisite next to it and provide the recovery action.
- Mobile touch targets should be at least 44 by 44 CSS pixels.

## 7. Design every state, including unhappy paths

Every data-bearing component must define:

- **Initial loading:** reserve final geometry with a content-shaped placeholder when latency is visible.
- **Recalculation:** retain the last valid result, mark the region `aria-busy`, and show that it is updating.
- **First-use empty:** explain the feature and provide its primary setup action.
- **Filter empty:** name the active filter and provide **Clear filters** or **Show all**.
- **Valid zero result:** say that calculation succeeded and suggest the relevant parameter to change.
- **Partial/degraded data:** render usable fields, identify missing fields, and avoid invented fallbacks.
- **Error:** explain what failed, preserve user input, and provide Retry or a corrective action.
- **Offline:** distinguish operations that remain local from those that require the network.
- **Success:** confirm durable actions without interrupting continued work.

Use a shared status component with `role="status"` and polite live announcements for progress/success, `role="alert"` for blocking failures, and `aria-busy` on the region being updated.

## 8. Make dense data scannable

- Keep table headers visible for long scroll regions.
- Right-align degrees, orbs, ages, counts, costs, and other numeric measures; use tabular numerals.
- Give columns typed metadata for alignment and data kind. Do not style by column position.
- Offer a compact density for large result sets without shrinking touch targets on mobile.
- Keep copy, CSV, and export actions adjacent to the data they affect.
- Truncate only when the full value remains available through expansion, title, or an accessible detail view.
- Keep status, primary metric, and next action visible within the first screenful.

## 9. Preserve accessibility and keyboard behavior

- Use `<header>`, `<nav>`, `<main>`, `<section>`, `<article>`, headings, lists, tables, and forms according to meaning.
- Maintain one `<main>` and a working skip link.
- Keep focus order aligned with visual order.
- Every interactive element needs a visible high-contrast focus indicator.
- Native `<dialog>` is the default modal primitive. Give it an accessible title, contain focus, close on Escape, and restore focus to the trigger.
- Menus close on selection, outside interaction, Escape, focus departure, and route change. Escape restores focus to the trigger.
- Same-page tabs implement arrow-key navigation and selected-state semantics. Route navigation remains ordinary links.
- Icon-only controls require accessible names and visible tooltips or adjacent explanation when meaning is not universal.
- Charts must expose equivalent structured data. Decorative chart graphics remain hidden from assistive technology when the table is the accessible equivalent.
- Honor `prefers-reduced-motion`; motion must communicate state and never be required to understand it.

Do not treat an axe pass as proof of usability. Test keyboard flow, focus restoration, zoom, screen-reader announcements, and high-density content manually when the feature changes those behaviors.

## 10. Design responsively by content type

Use layout modes for reading, forms, visualizations, data tables, and builders. Prefer container queries when a component's available width matters more than the viewport.

Verify at least:

- 390×844 phone.
- 768×1024 tablet.
- 1280×800 laptop.
- 1440×900 desktop.
- 3440×1440 ultra-wide.

At narrow widths, dropdown menus become in-flow panels, tables scroll within labelled containers, settings dialogs remain operable without hidden footer actions, and sticky regions must not consume most of a short viewport. At ultra-wide widths, prose remains readable and dense data may expand.

## 11. Use the design system rather than local styling

- Use the spacing, type, semantic-color, radius, elevation, and motion tokens in `app.css`.
- Keep layout spacing on the 4px grid unless visualization geometry requires a specialized value.
- Use semantic state tokens for danger, warning, success, info, and focus. Astrology colors do not double as UI state colors.
- Use shared Button, Notice, Field, TextField, DateField, NumberField, Select, Checkbox, Radio, ChoiceGroup, OptionCards, FilterSummary, Disclosure, SelectionInspector, StatusMessage, EmptyState, DataTable, and settings-dialog primitives as they become available.
- Do not add hard-coded colors, shadows, arbitrary inline style objects, or one-off disabled/loading behavior in a feature component.
- Keep motion short and functional. Define hover, active, focus, disabled, busy, selected, and error states for every interactive component.
- Keep both light and dark themes complete. A new token or component state is unfinished until both are legible.

## 12. Keep language and formatting consistent

- All user-facing text lives in co-located `*.messages.ts` catalogues with English and Dutch parity.
- Use one term for one feature throughout navigation, headings, buttons, help, and errors.
- Use sentence case for page titles, menu items, labels, and buttons unless a proper name requires otherwise.
- Button labels describe the action and object: **Save birth record**, **Build PDF**, **Clear filters**.
- Avoid implementation words such as cache, payload, provider, register, or op-log in ordinary product copy.
- Pass the current locale into shared formatting helpers. Do not call browser-locale formatting ad hoc inside screens.
- Define and document the display timezone for every timestamp. Include units and use deterministic currency formatting.

## 13. Protect destructive and privacy-sensitive actions

- Prefer reversible deletion with Undo or restore.
- Permanent deletion must name what will be removed, describe sync/server consequences, and require an explicit destructive confirmation.
- Do not use color alone to identify destructive actions.
- Keep account removal, local-data removal, person deletion, and chart deletion distinct in language and consequence.
- Explain what leaves the device before a network/AI action and request consent at that action.

## 14. Preserve perceived performance

- A click must produce visual feedback immediately.
- Disable duplicate submissions while preserving the label context, for example **Building PDF…**.
- Use optimistic updates only when rollback is safe and understandable.
- Preserve the previous result while recalculating when stale data is clearly marked.
- Lazy-load route-scale features and heavy export/rendering libraries.
- Avoid layout shift by reserving chart, table, and status geometry.
- Do not add a spinner when a stable skeleton, progress label, or retained result communicates more.

## 15. Required implementation review for a new feature

Before considering a UI feature complete, verify:

- [ ] The design follows the target experience rather than copying known design debt from an existing screen.
- [ ] The goal, scope, owner, lifetime, persistence, sync, and reset behavior are documented.
- [ ] Navigation placement follows the canonical hierarchy and adds no third menu level.
- [ ] Chart types appear once in the page header; the four chart views use one route-level local navigation; every interactive chart places its Selection inspector directly after it in DOM order, beside it when space permits and immediately below otherwise.
- [ ] Page title identifies the feature and subject.
- [ ] Global, account, device, person, chart, page, and request state are not conflated.
- [ ] Apply, Cancel, Reset, Done, and Set as default have truthful behavior.
- [ ] Related page settings use one coherent form; no nested “Extended” or duplicate settings surface was added.
- [ ] Loading, empty, zero-result, partial-data, error, offline, and success states are handled.
- [ ] Primary, secondary, and destructive actions have clear visual hierarchy.
- [ ] Keyboard navigation, focus handling, semantic HTML, live announcements, and touch targets work.
- [ ] English and Dutch copy are complete and use existing product terminology.
- [ ] Dates, times, numbers, currencies, coordinates, and units use shared formatters.
- [ ] The control follows the decision matrix; no raw select/date styling or one-off choice pattern was added.
- [ ] Fields and selection controls use the shared anatomy, and numeric steppers use the standard NumberField buttons and keyboard behavior.
- [ ] Expandable content uses the shared Disclosure pattern and communicates what opens without relying on a triangle, glyph, or color.
- [ ] The feature works at the required viewport matrix in both themes.
- [ ] Meaningful page-specific export actions register and render in that page's content toolbar.
- [ ] Tests cover meaningful route/registry, keyboard/dialog, responsive-overflow, and state behavior affected by the change.
- [ ] Relevant `MAP.md` files and feature metadata are updated.
- [ ] `npm run check` passes without warnings.

If a feature cannot satisfy a rule because of a product or technical constraint, document the exception and its user impact in the change description. Do not silently introduce a second interaction model.

## 16. Validate the experience with real tasks

Code review and automated accessibility checks cannot establish whether the information architecture is intuitive. Before finalizing a major shell, navigation, settings, or workflow change, test representative tasks with both a newer reader and an experienced astrology user:

1. Add a person and reach their natal chart.
2. Select a sign, body, house cusp, and aspect; confirm each meaning appears beside its visualization on a wide layout and directly below it on a narrow layout; then move among Wheel, Aspects, Placements, and Patterns & condition without losing chart context.
3. Enter a target date, change the Primary Directions time key, and filter transits without guessing which control to use.
4. Configure Astrocartography line types, bodies, Local Space, and relocation in one pass; expand a body's line meanings; then cancel another settings draft without changing the map.
5. Switch to another person and open the same feature.
6. Change one chart only, then separately change the user's default.
7. Export the current result, build a PDF, and create a full-data backup.
8. Recover from an incomplete record, zero-result filter, calculation failure, and offline network action.

Use these quality targets:

- The user can identify the active person, feature, and calculation basis within three seconds.
- Switching people takes at most two actions and does not require returning to the People list.
- Any primary feature is reachable without navigating through more than one expandable group.
- The primary action and current status are visible in the first screenful at 1280×800.
- An interactive visualization's selection feedback remains adjacent on wide layouts and immediately below on narrow layouts, with no unrelated module between them.
- Equivalent fields, selection controls, and number steppers are visually recognizable as the same component on every tested page.
- No user must guess whether a change applies to this view, chart, person, account, device, or application.
- Back, reload, and sharing preserve the state users reasonably expect them to preserve.

When product telemetry is appropriate, collect only privacy-respecting interaction events needed to answer a stated UX question, such as failed searches, abandoned setup, or repeated menu detours. Do not capture birth data, chart contents, free text, or astrology results. Prefer short usability sessions over permanent analytics when direct observation answers the question.
