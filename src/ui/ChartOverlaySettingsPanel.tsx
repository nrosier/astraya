/**
 * @module ChartOverlaySettingsPanel
 * @purpose Staged Overlay settings for configuring additional rings in the canonical chart wheel, opened from the chart row's Overlays trigger as a right slide-over drawer beside the wheel (#817, #824).
 * @conventions Owns only a draft that exists while the drawer is open (`StagedDialog placement="right"`); callers receive one confirmed settings object through `onApply`, so recalculation occurs once and Cancel, Escape and × retain the visible chart. The drawer is non-modal: from 75rem (1200px) the page makes room (the wheel column narrows) so wheel and drawer sit side by side, undimmed and clickable. Focus returns to the trigger on close.
 * @exports ChartOverlaySettingsPanel, ChartOverlaySettings, ChartOverlaySource, ChartOverlayReturnKind, DEFAULT_CHART_OVERLAY_SETTINGS, orderedChartOverlaySources
 */
import { useRef, useState } from 'react';
import { StagedDialog } from './primitives/StagedDialog.js';
import { DateField } from './primitives/DateField.js';
import { NumberField } from './primitives/NumberField.js';
import { ChoiceGroup } from './primitives/ChoiceGroup.js';
import { Checkbox } from './primitives/Checkbox.js';
import { chartOverlaySettingsPanelMessages } from './ChartOverlaySettingsPanel.messages.js';
import { todayInputValue } from './format.js';
import { useMessages } from './messages.js';

export type ChartOverlaySource = 'natal' | 'draconic' | 'transit' | 'progressed' | 'directed' | 'return' | 'relocated';
export type ChartOverlayReturnKind = 'solar' | 'lunar';

const OVERLAY_SOURCES: readonly ChartOverlaySource[] = [
  'natal',
  'draconic',
  'transit',
  'progressed',
  'directed',
  'return',
  'relocated',
];

export interface ChartOverlaySettings {
  readonly natal: boolean;
  readonly draconic: boolean;
  readonly transit: boolean;
  readonly transitDate: string;
  readonly progressed: boolean;
  readonly progressedDate: string;
  readonly directed: boolean;
  readonly directedDate: string;
  readonly return: boolean;
  readonly returnKind: ChartOverlayReturnKind;
  readonly returnDate: string;
  readonly relocated: boolean;
  readonly latitude: string;
  readonly longitude: string;
  /** Relative order of optional rings; the current chart stays the fixed innermost base ring. */
  readonly order: readonly ChartOverlaySource[];
  readonly interRingAspects: boolean;
}

export const DEFAULT_CHART_OVERLAY_SETTINGS: ChartOverlaySettings = {
  natal: false,
  draconic: false,
  transit: false,
  transitDate: todayInputValue(),
  progressed: false,
  progressedDate: todayInputValue(),
  directed: false,
  directedDate: todayInputValue(),
  return: false,
  returnKind: 'solar',
  returnDate: todayInputValue(),
  relocated: false,
  latitude: '',
  longitude: '',
  order: OVERLAY_SOURCES,
  interRingAspects: false,
};

function sameSettings(a: ChartOverlaySettings, b: ChartOverlaySettings): boolean {
  return (
    a.natal === b.natal &&
    a.draconic === b.draconic &&
    a.transit === b.transit &&
    a.transitDate === b.transitDate &&
    a.progressed === b.progressed &&
    a.progressedDate === b.progressedDate &&
    a.directed === b.directed &&
    a.directedDate === b.directedDate &&
    a.return === b.return &&
    a.returnKind === b.returnKind &&
    a.returnDate === b.returnDate &&
    a.relocated === b.relocated &&
    a.latitude === b.latitude &&
    a.longitude === b.longitude &&
    a.interRingAspects === b.interRingAspects &&
    a.order.length === b.order.length &&
    a.order.every((source, index) => source === b.order[index])
  );
}

export function hasChartOverlays(settings: ChartOverlaySettings): boolean {
  return (
    settings.natal ||
    settings.draconic ||
    settings.transit ||
    settings.progressed ||
    settings.directed ||
    settings.return ||
    settings.relocated
  );
}

function isSelected(settings: ChartOverlaySettings, source: ChartOverlaySource): boolean {
  return settings[source];
}

/** Returns active optional sources in their user-selected radial order, repairing a future/old draft's missing ids. */
export function orderedChartOverlaySources(settings: ChartOverlaySettings): readonly ChartOverlaySource[] {
  const order = [...settings.order, ...OVERLAY_SOURCES.filter((source) => !settings.order.includes(source))];
  return order.filter((source) => isSelected(settings, source));
}

export function ChartOverlaySettingsPanel({
  value,
  baseLabel,
  unavailableSources = [],
  onApply,
}: {
  readonly value: ChartOverlaySettings;
  readonly baseLabel: string;
  readonly unavailableSources?: readonly ChartOverlaySource[] | undefined;
  readonly onApply: (next: ChartOverlaySettings) => void;
}): React.JSX.Element {
  const t = useMessages(chartOverlaySettingsPanelMessages);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const [open, setOpen] = useState(false);
  // The draft exists only while the drawer is open: opening copies the applied settings, Cancel drops it.
  const [draft, setDraft] = useState<ChartOverlaySettings>(value);
  const openDrawer = (): void => {
    setDraft(value);
    setOpen(true);
  };
  const close = (): void => {
    setOpen(false);
  };

  return (
    <div className="chart-overlay-settings">
      <button
        type="button"
        ref={triggerRef}
        className="chart-overlay-trigger"
        aria-haspopup="dialog"
        onClick={openDrawer}
      >
        {t.trigger}
      </button>
      <StagedDialog
        open={open}
        heading={t.trigger}
        closeLabel={t.closeLabel}
        dialogClassName="chart-overlay-drawer"
        placement="right"
        modal={false}
        onDiscard={close}
        returnFocusTo={triggerRef}
        footer={
          <div className="settings-card-footer-group">
            <button type="button" className="quiet" onClick={close}>
              {t.cancel}
            </button>
            <button
              type="button"
              className="primitive-button-primary"
              disabled={sameSettings(draft, value)}
              onClick={() => {
                onApply(draft);
                close();
              }}
            >
              {t.apply}
            </button>
          </div>
        }
      >
        <OverlayDraft draft={draft} setDraft={setDraft} baseLabel={baseLabel} unavailableSources={unavailableSources} />
      </StagedDialog>
    </div>
  );
}

function OverlayDraft({
  draft,
  setDraft,
  baseLabel,
  unavailableSources,
}: {
  readonly draft: ChartOverlaySettings;
  readonly setDraft: React.Dispatch<React.SetStateAction<ChartOverlaySettings>>;
  readonly baseLabel: string;
  readonly unavailableSources: readonly ChartOverlaySource[];
}): React.JSX.Element {
  const t = useMessages(chartOverlaySettingsPanelMessages);
  const unavailable = (source: ChartOverlaySource): boolean => unavailableSources.includes(source);
  const update = (next: Partial<ChartOverlaySettings>): void => {
    setDraft((current) => ({ ...current, ...next }));
  };
  const move = (source: ChartOverlaySource, direction: -1 | 1): void => {
    const selected = orderedChartOverlaySources(draft);
    const currentIndex = selected.indexOf(source);
    const target = selected[currentIndex + direction];
    if (target === undefined) return;
    const order = [...draft.order];
    const sourceIndex = order.indexOf(source);
    const targetIndex = order.indexOf(target);
    if (sourceIndex < 0 || targetIndex < 0) return;
    [order[sourceIndex], order[targetIndex]] = [order[targetIndex] ?? target, order[sourceIndex] ?? source];
    update({ order });
  };
  const selected = orderedChartOverlaySources(draft);
  const rowControls = (
    source: ChartOverlaySource,
    label: string,
  ): Pick<React.ComponentProps<typeof OverlayRow>, 'onMoveUp' | 'onMoveDown' | 'moveUpLabel' | 'moveDownLabel'> => {
    const index = selected.indexOf(source);
    return {
      moveUpLabel: t.moveUp(label),
      moveDownLabel: t.moveDown(label),
      onMoveUp:
        index > 0
          ? () => {
              move(source, -1);
            }
          : undefined,
      onMoveDown:
        index >= 0 && index < selected.length - 1
          ? () => {
              move(source, 1);
            }
          : undefined,
    };
  };

  return (
    <div className="chart-overlay-draft">
      <p className="settings-card-tag">{t.baseChart(baseLabel)}</p>
      <p className="hint">{t.hint}</p>
      <div className="chart-overlay-rows">
        <OverlayRow
          label={t.natal}
          checked={draft.natal}
          disabled={unavailable('natal')}
          {...rowControls('natal', t.natal)}
          onChange={(natal) => {
            update({ natal });
          }}
        />
        <OverlayRow
          label={t.draconic}
          checked={draft.draconic}
          disabled={unavailable('draconic')}
          {...rowControls('draconic', t.draconic)}
          onChange={(draconic) => {
            update({ draconic });
          }}
        />
        <OverlayRow
          label={t.transit}
          checked={draft.transit}
          {...rowControls('transit', t.transit)}
          onChange={(transit) => {
            update({ transit });
          }}
        >
          <DateField
            label={t.transitDate}
            value={draft.transitDate}
            disabled={!draft.transit}
            onChange={(transitDate) => {
              update({ transitDate });
            }}
          />
        </OverlayRow>
        <OverlayRow
          label={t.progressed}
          checked={draft.progressed}
          {...rowControls('progressed', t.progressed)}
          onChange={(progressed) => {
            update({ progressed });
          }}
        >
          <DateField
            label={t.progressedDate}
            value={draft.progressedDate}
            disabled={!draft.progressed}
            onChange={(progressedDate) => {
              update({ progressedDate });
            }}
          />
        </OverlayRow>
        <OverlayRow
          label={t.directed}
          checked={draft.directed}
          {...rowControls('directed', t.directed)}
          onChange={(directed) => {
            update({ directed });
          }}
        >
          <DateField
            label={t.directedDate}
            value={draft.directedDate}
            disabled={!draft.directed}
            onChange={(directedDate) => {
              update({ directedDate });
            }}
          />
        </OverlayRow>
        <OverlayRow
          label={t.return}
          checked={draft.return}
          {...rowControls('return', t.return)}
          onChange={(returnRing) => {
            update({ return: returnRing });
          }}
        >
          <div className="primitive-choice-field">
            <span className="primitive-field-label">{t.returnKind}</span>
            <ChoiceGroup
              label={t.returnKind}
              value={draft.returnKind}
              disabled={!draft.return}
              options={[
                { value: 'solar', label: t.solarReturn },
                { value: 'lunar', label: t.lunarReturn },
              ]}
              onChange={(returnKind) => {
                update({ returnKind: returnKind as ChartOverlayReturnKind });
              }}
            />
          </div>
          <DateField
            label={t.returnDate}
            value={draft.returnDate}
            disabled={!draft.return}
            onChange={(returnDate) => {
              update({ returnDate });
            }}
          />
        </OverlayRow>
        <OverlayRow
          label={t.relocated}
          checked={draft.relocated}
          {...rowControls('relocated', t.relocated)}
          onChange={(relocated) => {
            update({ relocated });
          }}
        >
          <NumberField
            label={t.latitude}
            value={draft.latitude}
            min={-90}
            max={90}
            step="any"
            disabled={!draft.relocated}
            onChange={(latitude) => {
              update({ latitude });
            }}
          />
          <NumberField
            label={t.longitude}
            value={draft.longitude}
            min={-180}
            max={180}
            step="any"
            disabled={!draft.relocated}
            onChange={(longitude) => {
              update({ longitude });
            }}
          />
        </OverlayRow>
      </div>
      <Checkbox
        label={t.interRingAspects}
        checked={draft.interRingAspects}
        disabled={!hasChartOverlays(draft)}
        onChange={(interRingAspects) => {
          update({ interRingAspects });
        }}
      />
    </div>
  );
}

function OverlayRow({
  label,
  checked,
  disabled = false,
  onChange,
  children,
  onMoveUp,
  onMoveDown,
  moveUpLabel,
  moveDownLabel,
}: {
  readonly label: string;
  readonly checked: boolean;
  readonly disabled?: boolean | undefined;
  readonly onChange: (checked: boolean) => void;
  readonly children?: React.ReactNode | undefined;
  readonly onMoveUp?: (() => void) | undefined;
  readonly onMoveDown?: (() => void) | undefined;
  readonly moveUpLabel?: string | undefined;
  readonly moveDownLabel?: string | undefined;
}): React.JSX.Element {
  return (
    <div
      className={['chart-overlay-row', !checked || disabled ? 'chart-overlay-row--inactive' : undefined]
        .filter(Boolean)
        .join(' ')}
    >
      <div className="chart-overlay-row-toggle">
        <Checkbox label={label} checked={checked} disabled={disabled} onChange={onChange} />
        <span className="chart-overlay-row-order">
          <button
            type="button"
            className="quiet"
            aria-label={moveUpLabel}
            disabled={onMoveUp === undefined}
            onClick={onMoveUp}
          >
            ↑
          </button>
          <button
            type="button"
            className="quiet"
            aria-label={moveDownLabel}
            disabled={onMoveDown === undefined}
            onClick={onMoveDown}
          >
            ↓
          </button>
        </span>
      </div>
      {children !== undefined && <div className="chart-overlay-row-inputs">{children}</div>}
    </div>
  );
}
