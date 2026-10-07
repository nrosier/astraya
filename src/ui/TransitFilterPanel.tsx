/**
 * The controls that decide which transit contacts a screen shows (#416): a preset, an orb scale,
 * aspect groups, an applying-only switch, finer per-body checkboxes, and a count bar so it is plain
 * that something is hidden. State lives in the screen (`useTransitFilter`), so one filter drives the
 * table and the wheel, and is remembered on this device — as a preset name, so an "Important" filter
 * is rebuilt for the chart being read (its chart ruler), or in full when the user customised it.
 */
/**
 * @module TransitFilterPanel
 * @purpose Controls (preset, orb scale, aspect groups, applying-only, per-body checkboxes) deciding which transit contacts a screen shows, plus the useTransitFilter hook that persists the choice per context.
 * @conventions State is remembered per context in localStorage as a preset name or full custom filter; uses TransitFilterPanel.messages.ts for en/nl text via useMessages().
 * @exports TransitFilterPanel, useTransitFilter, EVERY_BODY_KEY
 */
import { useCallback, useId, useMemo, useState } from 'react';
import {
  HARD_ASPECT_KEYS,
  MINOR_ASPECT_KEYS,
  SOFT_ASPECT_KEYS,
  presetOf,
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
 * The active filter and a setter. The default is the important transits for `rules.context`; the
 * choice is remembered per context on this device.
 */
export function useTransitFilter(rules: TransitRuleContext): readonly [TransitFilter, (filter: TransitFilter) => void] {
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
  return [filter, setFilter];
}

function toggled(list: readonly string[], key: string): readonly string[] {
  return list.includes(key) ? list.filter((candidate) => candidate !== key) : [...list, key];
}

interface Props {
  readonly filter: TransitFilter;
  readonly rules: TransitRuleContext;
  readonly onChange: (filter: TransitFilter) => void;
  readonly shown: number;
  readonly total: number;
  readonly locale: Locale;
}

export function TransitFilterPanel({ filter, rules, onChange, shown, total, locale }: Props) {
  const t = useMessages(transitFilterPanelMessages);
  const id = useId();
  const current = presetOf(filter, rules);
  const presetName = t.presets[current ?? 'custom'];

  const groupChecked = (keys: readonly string[]): boolean => keys.every((key) => filter.aspects.includes(key));
  const toggleGroup = (keys: readonly string[]): void => {
    const aspects = groupChecked(keys)
      ? filter.aspects.filter((key) => !keys.includes(key))
      : [...filter.aspects, ...keys.filter((key) => !filter.aspects.includes(key))];
    onChange({ ...filter, aspects });
  };

  const bodyGroup = (legend: string, field: 'transiting' | 'natal') => (
    <fieldset className="transit-filter-group">
      <legend>{legend}</legend>
      {EVERY_BODY_KEY.map((key) => (
        <label key={key} className="transit-filter-check">
          <input
            type="checkbox"
            checked={filter[field].includes(key)}
            onChange={() => {
              onChange({ ...filter, [field]: toggled(filter[field], key) });
            }}
          />{' '}
          {bodyDisplayName(key, locale)}
        </label>
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

      <details className="transit-filter-adjust">
        <summary>{t.adjust}</summary>
        <RulershipSetting />
        <p>
          <label htmlFor={`${id}-orb`}>{t.orbLabel} </label>
          <select
            id={`${id}-orb`}
            value={filter.orbSensitivity}
            onChange={(event) => {
              const orbSensitivity = SENSITIVITIES.find((candidate) => candidate === event.target.value);
              if (orbSensitivity !== undefined) onChange({ ...filter, orbSensitivity });
            }}
          >
            {SENSITIVITIES.map((sensitivity) => (
              <option key={sensitivity} value={sensitivity}>
                {t.orbs[sensitivity]}
              </option>
            ))}
          </select>
        </p>
        <fieldset className="transit-filter-group">
          <legend>{t.aspectsLegend}</legend>
          {(
            [
              [HARD_ASPECT_KEYS, t.hard],
              [SOFT_ASPECT_KEYS, t.soft],
              [MINOR_ASPECT_KEYS, t.minor],
            ] as const
          ).map(([keys, label]) => (
            <label key={label} className="transit-filter-check">
              <input
                type="checkbox"
                checked={groupChecked(keys)}
                onChange={() => {
                  toggleGroup(keys);
                }}
              />{' '}
              {label}
            </label>
          ))}
        </fieldset>
        <label className="transit-filter-check">
          <input
            type="checkbox"
            checked={filter.applyingOnly}
            onChange={(event) => {
              onChange({ ...filter, applyingOnly: event.target.checked });
            }}
          />{' '}
          {t.applyingOnly}
        </label>
        {bodyGroup(t.transitingLegend, 'transiting')}
        {bodyGroup(t.natalLegend, 'natal')}
      </details>
    </section>
  );
}
