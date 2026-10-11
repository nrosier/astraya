/**
 * The Astrocartography screen's one settings surface (#512): a trigger that says what is applied, and a staged
 * dialog holding everything that shapes the map — line types, primary and additional bodies, Local Space and
 * relocation — as a single draft. Apply commits the whole draft at once; every other way out discards it.
 */
/**
 * @module ui/MapSettingsDialog
 * @purpose Edits the map's settings as a draft inside a StagedDialog and hands the validated whole to the caller on Apply, so one commit triggers exactly one recalculation.
 * @conventions The draft is reset from the applied settings every time the dialog opens; Apply is disabled while nothing differs or the relocation is invalid; there is no nested "Extended" disclosure — additional bodies are a visible group in the same scrolling form as the primary ones.
 * @exports MapSettingsDialog
 */
import { useRef, useState } from 'react';
import { EXTENDED_ACG_BODY_IDS, TRADITIONAL_ACG_BODY_IDS } from '../domain/astrocartography.js';
import type { BodyId } from '../ephemeris/types.js';
import { bodyDisplayName } from './astro-names.messages.js';
import { bodyById } from '../astrology/bodies.js';
import { useLocale } from './locale.js';
import {
  ALL_LINE_TYPES,
  relocationErrors,
  sameMapSettings,
  summaryCounts,
  type LineType,
  type MapSettings,
} from './map-settings.js';
import { mapSettingsDialogMessages } from './MapSettingsDialog.messages.js';
import { useMessages } from './messages.js';
import { Checkbox } from './primitives/Checkbox.js';
import { NumberField } from './primitives/NumberField.js';
import { StagedDialog } from './primitives/StagedDialog.js';

function bodyName(body: BodyId, locale: 'en' | 'nl'): string {
  const key = bodyById(body)?.key ?? String(body);
  return bodyDisplayName(key, locale);
}

export function MapSettingsDialog({
  applied,
  onApply,
  lineTypeLabels,
}: {
  readonly applied: MapSettings;
  readonly onApply: (next: MapSettings) => void;
  readonly lineTypeLabels: Readonly<Record<LineType, string>>;
}): React.JSX.Element {
  const t = useMessages(mapSettingsDialogMessages);
  const [locale] = useLocale();
  const triggerRef = useRef<HTMLButtonElement>(null);
  const [open, setOpen] = useState(false);
  const [draft, setDraft] = useState<MapSettings>(applied);

  const errors = relocationErrors(draft);
  const invalid = errors.latitude !== undefined || errors.longitude !== undefined;
  const dirty = !sameMapSettings(draft, applied);
  const counts = summaryCounts(applied);

  const discard = (): void => {
    setOpen(false);
  };
  const apply = (): void => {
    if (invalid || !dirty) return;
    onApply(draft);
    setOpen(false);
  };
  const toggleLineType = (lineType: LineType, checked: boolean): void => {
    setDraft((current) => ({
      ...current,
      lineTypes: checked ? [...current.lineTypes, lineType] : current.lineTypes.filter((item) => item !== lineType),
    }));
  };
  const toggleBody = (body: BodyId, checked: boolean): void => {
    setDraft((current) => ({
      ...current,
      bodies: checked ? [...current.bodies, body] : current.bodies.filter((item) => item !== body),
    }));
  };
  const errorText = (kind: 'range' | 'both' | undefined, min: string, max: string): string | undefined =>
    kind === undefined ? undefined : kind === 'both' ? t.errorBoth : t.errorRange(min, max);

  return (
    <div className="map-settings">
      <button
        type="button"
        ref={triggerRef}
        className="extended-settings-trigger"
        aria-haspopup="dialog"
        onClick={() => {
          setDraft(applied);
          setOpen(true);
        }}
      >
        <span className="extended-settings-trigger-name">{t.trigger}</span>
        <span className="extended-settings-trigger-detail">
          {t.summary(counts.lineTypes, counts.bodies, counts.localSpace, counts.relocated)}
        </span>
      </button>

      <StagedDialog
        open={open}
        heading={t.heading}
        closeLabel={t.closeLabel}
        onDiscard={discard}
        returnFocusTo={triggerRef}
        footer={
          <>
            <button
              type="button"
              className="quiet"
              disabled={!dirty || invalid}
              aria-label={dirty && !invalid ? t.apply : t.applyNothing}
              onClick={apply}
            >
              {t.apply}
            </button>
            <button type="button" className="quiet" onClick={discard}>
              {t.cancel}
            </button>
          </>
        }
      >
        <p className="hint">{t.appliesOnApply}</p>

        <fieldset className="field-group settings-card-group">
          <legend>{t.lineTypesLegend}</legend>
          <div className="settings-card-choices">
            {ALL_LINE_TYPES.map((lineType) => (
              <Checkbox
                key={lineType}
                label={lineTypeLabels[lineType]}
                checked={draft.lineTypes.includes(lineType)}
                onChange={(checked) => {
                  toggleLineType(lineType, checked);
                }}
              />
            ))}
          </div>
        </fieldset>

        <fieldset className="field-group settings-card-group">
          <legend>{t.primaryBodiesLegend}</legend>
          <div className="settings-card-choices">
            {TRADITIONAL_ACG_BODY_IDS.map((body) => (
              <Checkbox
                key={body}
                label={bodyName(body, locale)}
                checked={draft.bodies.includes(body)}
                onChange={(checked) => {
                  toggleBody(body, checked);
                }}
              />
            ))}
          </div>
        </fieldset>

        <fieldset className="field-group settings-card-group">
          <legend>{t.additionalBodiesLegend}</legend>
          <div className="settings-card-choices">
            {EXTENDED_ACG_BODY_IDS.map((body) => (
              <Checkbox
                key={body}
                label={bodyName(body, locale)}
                checked={draft.bodies.includes(body)}
                onChange={(checked) => {
                  toggleBody(body, checked);
                }}
              />
            ))}
          </div>
        </fieldset>

        <fieldset className="field-group settings-card-group">
          <legend>{t.localSpaceLegend}</legend>
          <Checkbox
            label={t.showLocalSpaceLines}
            checked={draft.localSpace}
            onChange={(checked) => {
              setDraft((current) => ({ ...current, localSpace: checked }));
            }}
          />
        </fieldset>

        <fieldset className="field-group settings-card-group">
          <legend>{t.relocationLegend}</legend>
          <p className="hint">{t.relocationHint}</p>
          <NumberField
            label={t.latitudeLabel}
            step="any"
            min={-90}
            max={90}
            value={draft.relocationLat}
            error={errorText(errors.latitude, '-90', '90')}
            onChange={(value) => {
              setDraft((current) => ({ ...current, relocationLat: value }));
            }}
          />
          <NumberField
            label={t.longitudeLabel}
            step="any"
            min={-180}
            max={180}
            value={draft.relocationLon}
            error={errorText(errors.longitude, '-180', '180')}
            onChange={(value) => {
              setDraft((current) => ({ ...current, relocationLon: value }));
            }}
          />
        </fieldset>
      </StagedDialog>
    </div>
  );
}
