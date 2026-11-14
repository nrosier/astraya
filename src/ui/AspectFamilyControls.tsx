/**
 * @module ui/AspectFamilyControls
 * @purpose The aspect-family filter shown above the wheel and the matrix (#1063), and the on-demand consultation preset Select.
 * @conventions Thin: the family logic is `aspect-family-filter.ts`. On the Wheel tab the Hard, Soft and Minor pills replace the family Select (`showFamily={false}`, #1532); the preset Select stays. "All aspects" is the default and clears the filter. A set of several families (from a preset) reads as "Chosen families".
 * @exports AspectFamilyControls
 */
import {
  CONSULTATION_PRESETS,
  FILTERABLE_FAMILIES,
  type AspectFamilyKey,
  type ConsultationPreset,
} from './aspect-family-filter.js';
import { aspectFamilyControlsMessages } from './AspectFamilyControls.messages.js';
import { useMessages } from './messages.js';
import { PillSelect } from './primitives/PillSelect.js';
import { Select } from './primitives/Select.js';

const ALL = 'all';
const CUSTOM = 'custom';
const NO_PRESET = 'none';

export function AspectFamilyControls({
  families,
  onChange,
  presetKey,
  onPreset,
  showFamily = true,
}: {
  readonly families: ReadonlySet<AspectFamilyKey>;
  readonly onChange: (families: ReadonlySet<AspectFamilyKey>) => void;
  /** The preset the reader chose, if any; presets are offered only where `onPreset` is given (#1063). */
  readonly presetKey?: ConsultationPreset['key'] | undefined;
  readonly onPreset?: ((preset: ConsultationPreset | undefined) => void) | undefined;
  /** False on the Wheel tab, where the instrument bar's tone pills are the aspect filter (#1532). */
  readonly showFamily?: boolean | undefined;
}): React.JSX.Element {
  const t = useMessages(aspectFamilyControlsMessages);
  const only = families.size === 1 ? [...families][0] : undefined;
  const value = families.size === 0 ? ALL : (only ?? CUSTOM);
  return (
    <div className="aspect-family-filter">
      {showFamily && (
        <Select
          label={t.familyLabel}
          value={value}
          options={[
            { value: ALL, label: t.allAspects },
            ...FILTERABLE_FAMILIES.map((family) => ({
              value: family.key,
              label: t.families[family.key as keyof typeof t.families],
            })),
            ...(value === CUSTOM ? [{ value: CUSTOM, label: t.customFamilies, disabled: true }] : []),
          ]}
          onChange={(next) => {
            onChange(next === ALL || next === CUSTOM ? new Set() : new Set([next as AspectFamilyKey]));
          }}
        />
      )}
      {onPreset !== undefined && (
        <PillSelect
          label={t.presetLabel}
          value={presetKey ?? NO_PRESET}
          options={[
            { value: NO_PRESET, label: t.noPreset },
            ...CONSULTATION_PRESETS.map((preset) => ({ value: preset.key, label: t.presets[preset.key] })),
          ]}
          onChange={(next) => {
            onPreset(CONSULTATION_PRESETS.find((preset) => preset.key === next));
          }}
        />
      )}
    </div>
  );
}
