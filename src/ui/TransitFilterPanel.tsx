/**
 * The controls that decide which transit contacts a screen shows (#416): a preset, an orb scale,
 * aspect groups, an applying-only switch, finer per-body checkboxes, and a count bar so it is plain
 * that something is hidden. State lives in the screen (`useTransitFilter`), so one filter drives the
 * table and the wheel, and is remembered on this device — as a preset name, so an "Important" filter
 * is rebuilt for the chart being read (its chart ruler), or in full when the user customised it.
 *
 * The preset select, count bar and "Show all" button stay a direct, immediate choice — picking
 * one applies (and remembers) it on the spot, same as always. "Adjust the filter" (#489) is
 * different: it opens a staged `<dialog className="settings-card">` card, the same modal
 * `ExtendedSettingsPanel.tsx` uses, so a reader can try several changes before committing any of
 * them. Its own controls edit a local draft only; four buttons decide what happens to it — Apply
 * (commits to this view only), Apply as Default (commits and remembers it, `useTransitFilter`'s
 * existing persist path), Reset to Default (resets the draft, not the live filter), and Cancel
 * (discards the draft).
 */
/**
 * @module TransitFilterPanel
 * @purpose Controls (preset, orb scale, aspect groups, applying-only, per-body checkboxes) deciding which transit contacts a screen shows, plus the useTransitFilter hook that persists the choice per context.
 * @conventions State is remembered per context in localStorage as a preset name or full custom filter. "Adjust the filter" (#489) is a staged settings-card dialog matching ExtendedSettingsPanel.tsx's draft/dirty/Apply pattern, with a fourth button (Apply as Default) splitting "apply to this view" from "apply and remember" — useTransitFilter exposes both a persisting setter and a session-only one for that split. Uses TransitFilterPanel.messages.ts for en/nl text via useMessages().
 * @exports TransitFilterPanel, useTransitFilter, EVERY_BODY_KEY
 */
import { useCallback, useEffect, useId, useMemo, useRef, useState } from 'react';
import {
  HARD_ASPECT_KEYS,
  MINOR_ASPECT_KEYS,
  SOFT_ASPECT_KEYS,
  presetOf,
  sameFilter,
  transitPreset,
} from '../astrology/transit-importance.js';
import type {
  OrbSensitivity,
  TransitFilter,
  TransitPreset,
  TransitRuleContext,
} from '../astrology/transit-importance.js';
import { BODIES } from '../astrology/bodies.js';
import type { Locale } from '../interpretation/schema.js';
import { bodyDisplayName } from './astro-names.messages.js';
import { useMessages } from './messages.js';
import { Checkbox } from './primitives/Checkbox.js';
import { Select } from './primitives/Select.js';
import { RulershipSetting } from './RulershipSetting.js';
import { transitFilterPanelMessages } from './TransitFilterPanel.messages.js';

export const EVERY_BODY_KEY: readonly string[] = BODIES.map((body) => body.key);
const PRESETS: readonly TransitPreset[] = ['important', 'outer', 'personal', 'all'];
const SENSITIVITIES: readonly OrbSensitivity[] = ['tight', 'balanced', 'wide'];

type Saved = { readonly preset: TransitPreset } | { readonly custom: TransitFilter };

const storageKey = (context: string): string => `astraya:transitFilter:${context}`;

function isStringList(value: unknown): value is readonly string[] {
  return Array.isArray(value) && value.every((item) => typeof item === 'string');
}

function isFilter(value: unknown): value is TransitFilter {
  if (typeof value !== 'object' || value === null) return false;
  const candidate = value as Record<string, unknown>;
  const overrides = candidate.orbOverrides;
  return (
    isStringList(candidate.transiting) &&
    isStringList(candidate.natal) &&
    isStringList(candidate.aspects) &&
    typeof candidate.maxOrb === 'number' &&
    typeof overrides === 'object' &&
    overrides !== null &&
    Object.values(overrides).every((limit) => typeof limit === 'number') &&
    SENSITIVITIES.includes(candidate.orbSensitivity as OrbSensitivity) &&
    typeof candidate.applyingOnly === 'boolean'
  );
}

function readSaved(context: string): Saved {
  try {
    const raw = localStorage.getItem(storageKey(context));
    const parsed: unknown = raw === null ? undefined : JSON.parse(raw);
    if (typeof parsed === 'object' && parsed !== null) {
      const { preset, custom } = parsed as { preset?: unknown; custom?: unknown };
      const known = PRESETS.find((candidate) => candidate === preset);
      if (known !== undefined) return { preset: known };
      if (isFilter(custom)) return { custom };
    }
  } catch {
    // Storage blocked or the saved value is garbage: fall back to the default below.
  }
  return { preset: 'important' };
}

/**
 * The active filter, a persisting setter, and a session-only setter (#489). The default is the
 * important transits for `rules.context`; `setFilter`'s choice is remembered per context on this
 * device (used by the preset select/"Show all", and by the Adjust card's "Apply as Default");
 * `setFilterForThisViewOnly` updates only the live value, for the Adjust card's "Apply" — the one
 * commit path that was missing before #489, when every control wrote through `setFilter` on
 * every keystroke.
 */
export function useTransitFilter(
  rules: TransitRuleContext,
): readonly [TransitFilter, (filter: TransitFilter) => void, (filter: TransitFilter) => void] {
  const [saved, setSaved] = useState<Saved>(() => readSaved(rules.context));
  const filter = useMemo(() => ('preset' in saved ? transitPreset(saved.preset, rules) : saved.custom), [saved, rules]);
  const setFilter = useCallback(
    (next: TransitFilter) => {
      const preset = presetOf(next, rules);
      const value: Saved = preset === undefined ? { custom: next } : { preset };
      setSaved(value);
      try {
        localStorage.setItem(storageKey(rules.context), JSON.stringify(value));
      } catch {
        // Not remembered, but the filter still applies to this screen.
      }
    },
    [rules],
  );
  const setFilterForThisViewOnly = useCallback(
    (next: TransitFilter) => {
      const preset = presetOf(next, rules);
      setSaved(preset === undefined ? { custom: next } : { preset });
    },
    [rules],
  );
  return [filter, setFilter, setFilterForThisViewOnly];
}

function toggled(list: readonly string[], key: string): readonly string[] {
  return list.includes(key) ? list.filter((candidate) => candidate !== key) : [...list, key];
}

interface Props {
  readonly filter: TransitFilter;
  readonly rules: TransitRuleContext;
  /** The preset select / "Show all" button's direct, immediate commit — unchanged by #489. */
  readonly onChange: (filter: TransitFilter) => void;
  /** The Adjust card's "Apply" (#489): commits the draft to this view only, never persisted. */
  readonly onApply: (filter: TransitFilter) => void;
  /** The Adjust card's "Apply as Default" (#489): commits and remembers it for this context. */
  readonly onApplyAsDefault: (filter: TransitFilter) => void;
  readonly shown: number;
  readonly total: number;
  readonly locale: Locale;
}

export function TransitFilterPanel({
  filter,
  rules,
  onChange,
  onApply,
  onApplyAsDefault,
  shown,
  total,
  locale,
}: Props) {
  const t = useMessages(transitFilterPanelMessages);
  const id = useId();
  const headingId = useId();
  const current = presetOf(filter, rules);
  const presetName = t.presets[current ?? 'custom'];

  // The Adjust card's own draft (#489): every control inside edits this, not the live filter —
  // same shape as ExtendedSettingsPanel.tsx's `draft`/`dirty`/open-dialog pattern.
  const [draft, setDraft] = useState<TransitFilter>(filter);
  const [open, setOpen] = useState(false);
  const dialogRef = useRef<HTMLDialogElement>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const dirty = !sameFilter(draft, filter);

  const openCard = (): void => {
    setDraft(filter);
    setOpen(true);
    const dialog = dialogRef.current;
    if (dialog === null) return;
    if (typeof dialog.showModal === 'function') dialog.showModal();
    else dialog.setAttribute('open', '');
  };

  /** Closes the card; the browser returns focus to the trigger. Whatever was not applied is dropped. */
  const closeCard = (): void => {
    const dialog = dialogRef.current;
    if (dialog !== null) {
      if (typeof dialog.close === 'function') dialog.close();
      else dialog.removeAttribute('open');
    }
    setOpen(false);
    setDraft(filter);
    triggerRef.current?.focus();
  };

  // A changed value from outside (e.g. the preset select) resets the draft while the card is closed.
  useEffect(() => {
    if (!open) setDraft(filter);
  }, [filter, open]);

  const apply = (): void => {
    onApply(draft);
    closeCard();
  };
  const applyAsDefault = (): void => {
    onApplyAsDefault(draft);
    closeCard();
  };
  /** Resets the draft back to the actual default — never the live filter, and never closes the card. */
  const resetToDefault = (): void => {
    setDraft(transitPreset('important', rules));
  };

  const groupChecked = (keys: readonly string[]): boolean => keys.every((key) => draft.aspects.includes(key));
  const toggleGroup = (keys: readonly string[]): void => {
    const aspects = groupChecked(keys)
      ? draft.aspects.filter((key) => !keys.includes(key))
      : [...draft.aspects, ...keys.filter((key) => !draft.aspects.includes(key))];
    setDraft({ ...draft, aspects });
  };

  const bodyGroup = (legend: string, field: 'transiting' | 'natal') => (
    <fieldset className="transit-filter-group">
      <legend>{legend}</legend>
      {EVERY_BODY_KEY.map((key) => (
        <Checkbox
          key={key}
          label={bodyDisplayName(key, locale)}
          checked={draft[field].includes(key)}
          onChange={() => {
            setDraft({ ...draft, [field]: toggled(draft[field], key) });
          }}
        />
      ))}
    </fieldset>
  );

  return (
    <section className="transit-filter" aria-labelledby={`${id}-heading`}>
      <h3 id={`${id}-heading`}>{t.heading}</h3>
      <p>
        <label htmlFor={`${id}-preset`}>{t.presetLabel} </label>
        <select
          id={`${id}-preset`}
          value={current ?? 'custom'}
          onChange={(event) => {
            const preset = PRESETS.find((candidate) => candidate === event.target.value);
            if (preset !== undefined) onChange(transitPreset(preset, rules));
          }}
        >
          {PRESETS.map((preset) => (
            <option key={preset} value={preset}>
              {t.presets[preset]}
            </option>
          ))}
          {current === undefined && <option value="custom">{t.presets.custom}</option>}
        </select>{' '}
        <span role="status" className="transit-filter-count">
          {t.count(shown, total, presetName)}
        </span>{' '}
        {current !== 'all' && (
          <button
            type="button"
            className="quiet"
            onClick={() => {
              onChange(transitPreset('all', rules));
            }}
          >
            {t.showAll}
          </button>
        )}
      </p>
      {current === 'important' && <p className="hint">{rules.context === 'daily' ? t.dailyNote : t.yearlyNote}</p>}
      {shown === 0 && total > 0 && <p className="hint">{t.empty}</p>}

      <button type="button" className="quiet" ref={triggerRef} aria-haspopup="dialog" onClick={openCard}>
        {t.adjust}
      </button>

      <dialog
        ref={dialogRef}
        className="settings-card"
        aria-labelledby={headingId}
        onCancel={(event) => {
          // Escape: the browser would close it silently; closing it ourselves also drops the draft.
          event.preventDefault();
          closeCard();
        }}
        onClick={(event) => {
          // A press on the backdrop is a press on the dialog element itself.
          if (event.target === dialogRef.current) closeCard();
        }}
      >
        <div className="settings-card-header">
          <h2 id={headingId}>{t.adjust}</h2>
          <button type="button" className="quiet" aria-label={t.closeLabel} onClick={closeCard}>
            ×
          </button>
        </div>

        <div className="settings-card-body">
          <RulershipSetting />
          <Select
            label={t.orbLabel}
            value={draft.orbSensitivity}
            options={SENSITIVITIES.map((sensitivity) => ({ value: sensitivity, label: t.orbs[sensitivity] }))}
            onChange={(value) => {
              const orbSensitivity = SENSITIVITIES.find((candidate) => candidate === value);
              if (orbSensitivity !== undefined) setDraft({ ...draft, orbSensitivity });
            }}
          />
          <fieldset className="transit-filter-group">
            <legend>{t.aspectsLegend}</legend>
            {(
              [
                [HARD_ASPECT_KEYS, t.hard],
                [SOFT_ASPECT_KEYS, t.soft],
                [MINOR_ASPECT_KEYS, t.minor],
              ] as const
            ).map(([keys, label]) => (
              <Checkbox
                key={label}
                label={label}
                checked={groupChecked(keys)}
                onChange={() => {
                  toggleGroup(keys);
                }}
              />
            ))}
          </fieldset>
          <Checkbox
            label={t.applyingOnly}
            checked={draft.applyingOnly}
            onChange={(checked) => {
              setDraft({ ...draft, applyingOnly: checked });
            }}
          />
          {bodyGroup(t.transitingLegend, 'transiting')}
          {bodyGroup(t.natalLegend, 'natal')}
        </div>

        <div className="settings-card-footer">
          <button
            type="button"
            className="quiet"
            disabled={!dirty}
            aria-label={dirty ? t.applyButton : `${t.applyButton} — ${t.nothingChanged}`}
            onClick={apply}
          >
            {t.applyButton}
          </button>
          <button
            type="button"
            className="quiet"
            disabled={!dirty}
            aria-label={dirty ? t.applyAsDefaultButton : `${t.applyAsDefaultButton} — ${t.nothingChanged}`}
            onClick={applyAsDefault}
          >
            {t.applyAsDefaultButton}
          </button>
          <button type="button" className="quiet" onClick={resetToDefault}>
            {t.resetToDefaultButton}
          </button>
          <button type="button" className="quiet" onClick={closeCard}>
            {t.cancelButton}
          </button>
        </div>
      </dialog>
    </section>
  );
}
