/**
 * The controls that decide which transit contacts a screen shows (#416): a preset, an orb scale,
 * aspect groups, an applying-only switch, finer per-body checkboxes, and a count bar so it is plain
 * that something is hidden. State lives in the screen (`useTransitFilter`), so one filter drives the
 * table and the wheel, and is remembered with the account (#1220) — as a preset name, so an "Important" filter
 * is rebuilt for the chart being read (its chart ruler), or in full when the user customised it.
 *
 * The visible preset choice (Important / Outer / Personal / All) and its summary line stay a direct,
 * immediate choice — picking one applies (and remembers) it on the spot. "Change filters" (#489,
 * #513) opens the shared `StagedDialog`, so a reader can try several changes before committing any of
 * them; a zero-result filter says so and offers "Clear filters". Its own controls edit a local draft only; four buttons decide what happens to it — Apply
 * (commits to this view only), Apply as Default (commits and remembers it, `useTransitFilter`'s
 * existing persist path), Reset to Default (resets the draft, not the live filter), and Cancel
 * (discards the draft).
 */
/**
 * @module TransitFilterPanel
 * @purpose Controls (preset, orb scale, aspect groups, applying-only, per-body checkboxes) deciding which transit contacts a screen shows, plus the useTransitFilter hook that persists the choice per context.
 * @conventions State is remembered per context as an account preference (op log, #1220), as a preset name or full custom filter. "Change filters" (#489, #513) is the shared StagedDialog with a draft/dirty/Apply pattern; the global planetary-rulers preference deliberately lives in Preferences, not in it, with a fourth button (Apply as Default) splitting "apply to this view" from "apply and remember" — useTransitFilter exposes both a persisting setter and a session-only one for that split. Uses TransitFilterPanel.messages.ts for en/nl text via useMessages().
 * @exports TransitFilterPanel, useTransitFilter, EVERY_BODY_KEY
 */
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  HARD_ASPECT_KEYS,
  MINOR_ASPECT_KEYS,
  SOFT_ASPECT_KEYS,
  TRANSIT_PRESETS,
  NATAL_GRID_KEYS,
  TRANSITING_GRID_KEYS,
  presetOf,
  sameFilter,
  transitPreset,
} from '../astrology/transit-importance.js';
import type {
  OrbSensitivity,
  SavedTransitFilter,
  TransitFilter,
  TransitPreset,
  TransitRuleContext,
} from '../astrology/transit-importance.js';
import { BODIES } from '../astrology/bodies.js';
import type { Locale } from '../interpretation/schema.js';
import { setAccountPreferences, useAccountPreferences } from './account-preferences.js';
import { bodyDisplayName } from './astro-names.messages.js';
import { useMessages } from './messages.js';
import { Checkbox } from './primitives/Checkbox.js';
import { FilterSummary } from './primitives/FilterSummary.js';
import { StatusMessage } from './primitives/StatusMessage.js';
import { Button } from './primitives/Button.js';
import { Tooltip } from './primitives/Tooltip.js';
import { ChoiceGroup } from './primitives/ChoiceGroup.js';
import { StagedDialog } from './primitives/StagedDialog.js';
import { routeHref } from './route.js';
import { transitFilterPanelMessages } from './TransitFilterPanel.messages.js';

export const EVERY_BODY_KEY: readonly string[] = BODIES.map((body) => body.key);
const PRESETS: readonly TransitPreset[] = TRANSIT_PRESETS;
const SENSITIVITIES: readonly OrbSensitivity[] = ['tight', 'balanced', 'wide'];

/**
 * The active filter, a persisting setter, and a session-only setter (#489). The default is the
 * important transits for `rules.context`; `setFilter`'s choice is remembered per context with the
 * account (used by the preset select/"Show all", and by the Adjust card's "Apply as Default");
 * `setFilterForThisViewOnly` updates only the live value, for the Adjust card's "Apply" — the one
 * commit path that was missing before #489, when every control wrote through `setFilter` on
 * every keystroke.
 */
export function useTransitFilter(
  rules: TransitRuleContext,
): readonly [TransitFilter, (filter: TransitFilter) => void, (filter: TransitFilter) => void] {
  const preferences = useAccountPreferences();
  const remembered = rules.context === 'daily' ? preferences.transitFilterDaily : preferences.transitFilterYearly;
  // What "Apply" chose for this view only, shown over the remembered default until a default is chosen again.
  const [thisViewOnly, setThisViewOnly] = useState<SavedTransitFilter | undefined>(undefined);
  const filter = useMemo(() => {
    const saved: SavedTransitFilter = thisViewOnly ?? remembered ?? { preset: 'important' };
    return 'preset' in saved ? transitPreset(saved.preset, rules) : saved.custom;
  }, [thisViewOnly, remembered, rules]);
  const setFilter = useCallback(
    (next: TransitFilter) => {
      const preset = presetOf(next, rules);
      const value: SavedTransitFilter = preset === undefined ? { custom: next } : { preset };
      setThisViewOnly(undefined);
      // The default is an account preference (#1220): applied at once, saved to the open store in the background. A
      // failed save is shown by the account-preferences notice.
      void setAccountPreferences(
        rules.context === 'daily' ? { transitFilterDaily: value } : { transitFilterYearly: value },
      ).catch(() => undefined);
    },
    [rules],
  );
  const setFilterForThisViewOnly = useCallback(
    (next: TransitFilter) => {
      const preset = presetOf(next, rules);
      setThisViewOnly(preset === undefined ? { custom: next } : { preset });
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

/**
 * The settings button for the transit filter (#1227): the one control in a transit screen's page header, which opens the
 * staged filter card. The preset is chosen in the card with everything else, and `Apply` commits it.
 */
export function TransitFilterButton({
  filter,
  rules,
  onApply,
  onApplyAsDefault,
  locale,
}: Omit<Props, 'onChange' | 'shown' | 'total'>) {
  const t = useMessages(transitFilterPanelMessages);

  // The dialog's own draft (#489): every control inside edits this, not the live filter.
  const [draft, setDraft] = useState<TransitFilter>(filter);
  const [open, setOpen] = useState(false);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const dirty = !sameFilter(draft, filter);

  const openCard = (): void => {
    setDraft(filter);
    setOpen(true);
  };

  /** Closes the dialog and drops whatever was not applied; focus returns to the trigger. */
  const closeCard = useCallback((): void => {
    setOpen(false);
    setDraft(filter);
  }, [filter]);

  // A changed value from outside (e.g. the preset choice) resets the draft while the dialog is closed.
  useEffect(() => {
    if (!open) setDraft(filter);
  }, [filter, open]);

  const apply = (): void => {
    onApply(draft);
    setOpen(false);
  };
  const applyAsDefault = (): void => {
    onApplyAsDefault(draft);
    setOpen(false);
  };
  /** Resets the draft back to the actual default — never the live filter, and never closes the dialog. */
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

  const bodyGroup = (legend: string, field: 'transiting' | 'natal') => {
    // The transiting grid offers the decided 16 bodies; the natal grid the same 16 plus ASC and MC (#1508).
    const keys = field === 'transiting' ? TRANSITING_GRID_KEYS : NATAL_GRID_KEYS;
    return (
      <fieldset className="transit-filter-group">
        <legend>{legend}</legend>
        <div className="transit-filter-group-actions">
          <Button
            size="compact"
            onClick={() => {
              setDraft({ ...draft, [field]: [...keys] });
            }}
          >
            {t.groupAll}
          </Button>
          <Button
            size="compact"
            onClick={() => {
              setDraft({ ...draft, [field]: [] });
            }}
          >
            {t.groupClear}
          </Button>
        </div>
        {keys.map((key) => (
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
  };

  return (
    <>
      <Button ref={triggerRef} aria-haspopup="dialog" aria-label={t.heading} onClick={openCard}>
        {t.heading}
      </Button>

      <StagedDialog
        open={open}
        heading={t.adjust}
        closeLabel={t.closeLabel}
        onDiscard={closeCard}
        returnFocusTo={triggerRef}
        footer={
          <>
            <Button
              variant="primary"
              disabled={!dirty}
              aria-label={dirty ? t.applyButton : `${t.applyButton} — ${t.nothingChanged}`}
              onClick={apply}
            >
              {t.applyButton}
            </Button>
            <Button
              disabled={!dirty}
              aria-label={dirty ? t.applyAsDefaultButton : `${t.applyAsDefaultButton} — ${t.nothingChanged}`}
              onClick={applyAsDefault}
            >
              {t.applyAsDefaultButton}
            </Button>
            <Button onClick={resetToDefault}>{t.resetToDefaultButton}</Button>
            <Button onClick={closeCard}>{t.cancelButton}</Button>
          </>
        }
      >
        <ChoiceGroup
          label={t.presetLabel}
          value={presetOf(draft, rules) ?? 'custom'}
          options={[
            ...PRESETS.map((preset) => ({ value: preset, label: t.presetsShort[preset] })),
            ...(presetOf(draft, rules) === undefined ? [{ value: 'custom', label: t.presetsShort.custom }] : []),
          ]}
          onChange={(value) => {
            const preset = PRESETS.find((candidate) => candidate === value);
            if (preset !== undefined) setDraft(transitPreset(preset, rules));
          }}
        />
        <ChoiceGroup
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
        <p className="hint">
          {t.rulersNote} <a href={routeHref({ kind: 'preferences', section: 'astrology' })}>{t.rulersLink}</a>.
        </p>
      </StagedDialog>
    </>
  );
}

/**
 * What the transit screen says about its filter (#1227), in the page body where the filter panel used to sit: how many of
 * the contacts are shown under which preset, the rule the "Important" preset follows, and the way out of an empty list.
 */
export function TransitFilterStatus({
  filter,
  rules,
  onChange,
  shown,
  total,
  emptyOnly = false,
  ruleNote = true,
}: Pick<Props, 'filter' | 'rules' | 'onChange' | 'shown' | 'total'> & {
  /** False when the screen states the "Important" rule in its own explainer (Transits, #1400/#1440). */
  readonly ruleNote?: boolean;
  /** Only the way out of an empty list: the count and the rule live in the heading's info tooltip instead. */
  readonly emptyOnly?: boolean;
}) {
  const t = useMessages(transitFilterPanelMessages);
  const current = presetOf(filter, rules);
  const presetName = t.presetsShort[current ?? 'custom'];
  return (
    <div className="transit-filter-status">
      {!emptyOnly && <FilterSummary summary={t.count(shown, total, presetName)} />}
      {!emptyOnly && ruleNote && current === 'important' && (
        <p className="hint">{rules.context === 'daily' ? t.dailyNote : t.yearlyNote}</p>
      )}
      {shown === 0 && total > 0 && (
        <StatusMessage kind="zero">
          {t.empty(t.presets[current ?? 'custom'])}{' '}
          <Button
            onClick={() => {
              onChange(transitPreset('all', rules));
            }}
          >
            {t.clearFilters}
          </Button>
        </StatusMessage>
      )}
    </div>
  );
}

/** The button and the status together, for a place that has no page header to put the button in. */
export function TransitFilterPanel(props: Props) {
  return (
    <>
      <TransitFilterButton {...props} />
      <TransitFilterStatus {...props} />
    </>
  );
}

/**
 * The info tooltip of a transit screen's heading (owner review 2026-11-07): what the screen is for, then how many of the
 * contacts the filter shows and the rule the Important preset follows. It replaces the text that sat between the date and
 * the content.
 */
export function TransitHeadingInfo({
  intro,
  label,
  filter,
  rules,
  shown,
  total,
}: Pick<Props, 'filter' | 'rules' | 'shown' | 'total'> & {
  readonly intro: string;
  readonly label: string;
}) {
  const t = useMessages(transitFilterPanelMessages);
  const current = presetOf(filter, rules);
  const note = current === 'important' ? (rules.context === 'daily' ? t.dailyNote : t.yearlyNote) : '';
  const text = [intro, t.count(shown, total, t.presetsShort[current ?? 'custom']), note]
    .filter((part) => part !== '')
    .join(' ');
  return (
    <Tooltip text={text} label={label} className="primitive-tooltip-icon">
      ?
    </Tooltip>
  );
}
