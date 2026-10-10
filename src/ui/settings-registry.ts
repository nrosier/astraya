/**
 * The single typed registry of every persisted UI setting's scope, owner, persistence, and
 * commit model (#506/#509), per `docs/UI-UX_IMPLEMENTATION_PLAN.md` §5.2. Pure metadata — this
 * is NOT a second storage system; each setting's actual value stays owned by its existing
 * module (`locale.ts`, `theme-dom.ts`, `symbol-setting.ts`, `glyph-variant-setting.ts`,
 * `rulership-setting.ts`) until it is deliberately migrated.
 *
 * Scope here means *intended* scope per `docs/UI-UX_GUIDELINES.md` §3, not necessarily today's
 * persistence: language and rulership are documented as `'account'`-scoped (should sync across
 * a signed-in user's devices) even though every setting below is, today, still device-local
 * `localStorage` with no sync path — formalizing that sync is explicitly Phase 3's job (#510),
 * not something this registry pretends already works.
 */
/**
 * @module ui/settings-registry
 * @purpose Typed metadata registry (scope/owner/default/persistence/sync/editing-surface/commit-mode/sensitivity) for every persisted UI setting (#506/#509), pure data only — existing modules keep owning actual values.
 * @conventions Scope documents intent (docs/UI-UX_GUIDELINES.md §3), not necessarily today's implementation — several settings are documented 'account'-scoped while still persisted device-locally, a gap Phase 3 (#510) is responsible for closing, not this registry. validateSettings() enforces the plan's required invariants (§5.2) and is exercised by test/ui-settings-registry.test.ts.
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
    editingSurface: 'LanguageToggle.tsx',
    commitMode: 'immediate',
    sensitive: false,
    resetTarget: 'Astraya default (en)',
  },
  {
    key: 'astraya:rulershipChoice',
    scope: 'account',
    owner: 'Which planets rule which signs (Modern/Traditional/Both) wherever a ruler, dignity, or dispositor is shown',
    describeDefault: "'modern'",
    persistence: 'local-storage',
    synced: false,
    editingSurface: 'RulershipSetting.tsx',
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
    if (setting.scope === 'person') {
      violations.push(`"${setting.key}": person records are inputs, not settings — see UI-UX_GUIDELINES.md §3`);
    }
  }
  return violations;
}
