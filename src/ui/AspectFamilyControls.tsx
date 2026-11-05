/**
 * @module ui/AspectFamilyControls
 * @purpose The aspect-family filter shown above the wheel and the matrix (#1063): one labelled Select.
 * @conventions Thin: the family logic is `aspect-family-filter.ts`. "All aspects" is the default and clears the filter. A set of several families (from a preset) reads as "Chosen families".
 * @exports AspectFamilyControls
 */
import { FILTERABLE_FAMILIES, type AspectFamilyKey } from './aspect-family-filter.js';
import { aspectFamilyControlsMessages } from './AspectFamilyControls.messages.js';
import { useMessages } from './messages.js';
import { Select } from './primitives/Select.js';

const ALL = 'all';
const CUSTOM = 'custom';

export function AspectFamilyControls({
  families,
  onChange,
}: {
  readonly families: ReadonlySet<AspectFamilyKey>;
  readonly onChange: (families: ReadonlySet<AspectFamilyKey>) => void;
}): React.JSX.Element {
  const t = useMessages(aspectFamilyControlsMessages);
  const only = families.size === 1 ? [...families][0] : undefined;
  const value = families.size === 0 ? ALL : (only ?? CUSTOM);
  return (
    <div className="aspect-family-filter">
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
    </div>
  );
}
