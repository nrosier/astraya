/**
 * The single typed registry of every persisted UI setting's scope, owner, persistence, and
 * commit model (#506/#509), per `docs/ui/UI-UX_IMPLEMENTATION_PLAN.md` §5.2. Pure metadata — this
 * is NOT a second storage system; each setting's actual value stays owned by its existing
 * module (`locale.ts`, `theme-dom.ts`, `symbol-setting.ts`, `glyph-variant-setting.ts`,
 * `rulership-setting.ts`) until it is deliberately migrated. The one exception is the person-scope
 * `person.calculationSettings` entry (#806), whose value lives in the op log on the person.
 *
 * Scope here means *intended* scope per `docs/ui/UI-UX_GUIDELINES.md` §3, not necessarily today's
 * persistence: language and rulership are documented as `'account'`-scoped (should sync across
 * a signed-in user's devices) even though every setting below is, today, still device-local
 * `localStorage` with no sync path — formalizing that sync is explicitly Phase 3's job (#510),
 * not something this registry pretends already works.
 */
/**
 * @module ui/settings-registry
 * @purpose Typed metadata registry (scope/owner/default/persistence/sync/editing-surface/commit-mode/sensitivity) for every persisted UI setting (#506/#509), pure data only — existing modules keep owning actual values.
 * @conventions Scope documents intent (docs/ui/UI-UX_GUIDELINES.md §3), not necessarily today's implementation — several settings are documented 'account'-scoped while still persisted device-locally, a gap Phase 3 (#510) is responsible for closing, not this registry. validateSettings() enforces the plan's required invariants (§5.2) and is exercised by test/ui-settings-registry.test.ts.
 * @exports SettingScope, CommitMode, SettingDefinition, SETTINGS, validateSettings
 */
export type SettingScope = 'application' | 'account' | 'device' | 'person' | 'chart' | 'page' | 'request';
export type CommitMode = 'immediate' | 'staged';

export interface SettingDefinition {
  /** The actual localStorage/storage key, where one exists. */
  readonly key: string;
  readonly scope: SettingScope;
  /** Short description of what changes when this setting changes. */
  readonly owner: string;
  readonly describeDefault: string;
  readonly persistence: 'local-storage' | 'indexeddb-oplog' | 'server-session' | 'none';
  /** Whether the value actually synchronizes across a signed-in user's devices today. */
  readonly synced: boolean;
  /** Where a reader edits this setting. */
  readonly editingSurface: string;
  readonly commitMode: CommitMode;
  readonly sensitive: boolean;
  readonly resetTarget: string;
}

export const SETTINGS: readonly SettingDefinition[] = [
  {
    key: 'astraya:reportLocale',
    scope: 'account',
    owner: 'UI language and the interpretation report language',
    describeDefault: "'en'",
    persistence: 'local-storage',
    synced: false,
    editingSurface: 'LanguageToggle.tsx; PreferencesView.tsx (Appearance & accessibility)',
    commitMode: 'immediate',
    sensitive: false,
    resetTarget: 'Astraya default (en)',
  },
  {
    key: 'astraya:rulershipChoice',
    scope: 'account',
    owner:
      'The default rulership model (Modern/Traditional/Both): what a person without a choice of their own starts from, and what a screen that belongs to no single person (Horary, Composite) shows (#806)',
    describeDefault: "'modern'",
    persistence: 'local-storage',
    synced: false,
    editingSurface: 'RulershipSetting.tsx in PreferencesView.tsx (Astrology defaults)',
    commitMode: 'immediate',
    sensitive: false,
    resetTarget: 'Astraya default (modern)',
  },
  {
    key: 'astraya.theme',
    scope: 'device',
    owner: 'Explicit light/dark override; unset follows the OS prefers-color-scheme',
    describeDefault: "'system' (no override)",
    persistence: 'local-storage',
    synced: false,
    editingSurface: 'ThemeToggle.tsx',
    commitMode: 'immediate',
    sensitive: false,
    resetTarget: 'This device default (system)',
  },
  {
    key: 'astraya.motion',
    scope: 'device',
    owner:
      'Reduce motion: switches off every transition, animation and smooth scroll; unset follows the OS prefers-reduced-motion',
    describeDefault: "'system' (follow the OS)",
    persistence: 'local-storage',
    synced: false,
    editingSurface: 'PreferencesView.tsx (Appearance & accessibility)',
    commitMode: 'immediate',
    sensitive: false,
    resetTarget: 'This device default (system)',
  },
  {
    key: 'astraya.density',
    scope: 'device',
    owner: 'Standard or compact spacing of forms and tables (touch screens keep standard sizes either way)',
    describeDefault: "'standard'",
    persistence: 'local-storage',
    synced: false,
    editingSurface: 'PreferencesView.tsx (Appearance & accessibility)',
    commitMode: 'immediate',
    sensitive: false,
    resetTarget: 'This device default (standard)',
  },
  {
    key: 'astraya:symbolClass',
    scope: 'device',
    owner: 'Which symbol class (drawn glyphs, Unicode, or text) charts and tables draw',
    describeDefault: 'drawn glyphs',
    persistence: 'local-storage',
    synced: false,
    editingSurface: 'SymbolToggle.tsx',
    commitMode: 'immediate',
    sensitive: false,
    resetTarget: 'This device default (drawn glyphs)',
  },
  {
    key: 'astraya:glyphVariants',
    scope: 'device',
    owner: 'Uranus/Pluto glyph variant choice',
    describeDefault: 'traditional variants',
    persistence: 'local-storage',
    synced: false,
    editingSurface: 'ExtendedSettingsPanel.tsx (symbols group)',
    commitMode: 'immediate',
    sensitive: false,
    resetTarget: 'This device default',
  },
  {
    key: 'astraya:glyphWeight',
    scope: 'device',
    owner: 'Drawn-glyph stroke weight',
    describeDefault: 'standard weight',
    persistence: 'local-storage',
    synced: false,
    editingSurface: 'ExtendedSettingsPanel.tsx (symbols group)',
    commitMode: 'immediate',
    sensitive: false,
    resetTarget: 'This device default',
  },
  {
    key: 'astraya:showDegreeSymbol',
    scope: 'device',
    owner: 'Whether degree-symbol (Sabian symbol) paragraphs show at all in the Report',
    describeDefault: 'shown',
    persistence: 'local-storage',
    synced: false,
    editingSurface: 'ReportView.tsx (report controls)',
    commitMode: 'immediate',
    sensitive: false,
    resetTarget: 'This device default (shown)',
  },
  {
    key: 'astraya:transitFilter:<context>',
    scope: 'page',
    owner:
      "The Transits/Forecast screens' remembered filter per context (daily/yearly) — a page default a reader builds up, not an account-wide calculation choice",
    describeDefault: "the 'important' preset for that context",
    persistence: 'local-storage',
    synced: false,
    editingSurface: 'TransitFilterPanel.tsx ("Apply as Default")',
    commitMode: 'staged',
    sensitive: false,
    resetTarget: 'the real default (the "important" preset)',
  },
  {
    key: 'person.calculationSettings',
    scope: 'person',
    owner:
      "One person's chart calculation settings (house system, zodiac, orb scale and rules, visible points, aspects, Lilith/node variants), kept on the person (#806)",
    describeDefault:
      "a copy of this device's default profile, written when the person is created; unset for a person made by an older build, who follows the default profile live, then the Astraya default",
    persistence: 'indexeddb-oplog',
    synced: true,
    editingSurface: 'ExtendedSettingsPanel.tsx on that person’s chart screens',
    commitMode: 'staged',
    sensitive: false,
    resetTarget: 'The default calculation profile',
  },
  {
    key: 'person.rulership',
    scope: 'person',
    owner:
      "One person's planetary-ruler choice (Modern/Traditional/Both) wherever a ruler, dignity, or dispositor is shown for them, kept on the person as its own register so older builds ignore it (#806)",
    describeDefault:
      "a copy of this device's default rulership, written when the person is created; unset for a person made by an older build, who follows the default rulership live, then modern",
    persistence: 'indexeddb-oplog',
    synced: true,
    editingSurface:
      'ExtendedSettingsPanel.tsx on that person’s chart screens (saved with Apply); RulershipSetting.tsx on Profections and Report',
    commitMode: 'staged',
    sensitive: false,
    resetTarget: 'The default rulership',
  },
  {
    key: 'astraya:defaultCalculationProfile',
    scope: 'account',
    owner:
      'The calculation profile (zodiac/houses/rulers/orbs/points/aspects) a person without settings of their own starts from on this device (#806)',
    describeDefault: 'unset (falls back to the Modern Western built-in profile)',
    persistence: 'local-storage',
    synced: false,
    editingSurface: 'ExtendedSettingsPanel.tsx ("Save as my default")',
    commitMode: 'staged',
    sensitive: false,
    resetTarget: 'Astraya default (modern-western-v1)',
  },
  {
    key: '(none — unchecked every render, never persisted)',
    scope: 'request',
    owner: 'Tier 2 AI-customized interpretation consent',
    describeDefault: 'unchecked',
    persistence: 'none',
    synced: false,
    editingSurface: 'ReportView.tsx (AiCustomizedPanel)',
    commitMode: 'immediate',
    sensitive: true,
    resetTarget: 'n/a — spent the moment one request is sent, never a standing preference',
  },
];

/**
 * The plan's required invariants (§5.2): reject a request-scope setting with persistence, a
 * device-scope setting claiming cross-device sync, and a staged setting also claiming
 * immediate-persisted behavior would contradict (a staged commit model implies the value is
 * NOT written until an explicit Apply, which `commitMode: 'immediate'` already rules out by
 * construction — the check below is the one case that cannot be excluded by the type alone).
 */
export function validateSettings(settings: readonly SettingDefinition[] = SETTINGS): readonly string[] {
  const violations: string[] = [];
  for (const setting of settings) {
    if (setting.scope === 'request' && setting.persistence !== 'none') {
      violations.push(`"${setting.key}": request-scope setting must never persist (got "${setting.persistence}")`);
    }
    if (setting.scope === 'request' && setting.commitMode !== 'immediate') {
      violations.push(`"${setting.key}": request-scope setting must use immediate commit, not a standing draft`);
    }
    if (setting.scope === 'device' && setting.synced) {
      violations.push(`"${setting.key}": device-scope setting must never claim cross-device sync`);
    }
    // Person scope is for calculation settings stored on the person (docs/ui/UI-UX_GUIDELINES.md §3.1, #806),
    // which live in the op log; anything else on a person is an input, not a setting.
    if (setting.scope === 'person' && setting.persistence !== 'indexeddb-oplog') {
      violations.push(
        `"${setting.key}": person-scope setting must be stored on the person through the op log (got "${setting.persistence}") — see docs/ui/UI-UX_GUIDELINES.md §3.1`,
      );
    }
  }
  return violations;
}
