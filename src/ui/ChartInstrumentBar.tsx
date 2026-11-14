/**
 * @module ui/ChartInstrumentBar
 * @purpose The instrument bar centred under the natal wheel (#1532): a Natal + transit / Natal only ring toggle and the
 * Hard, Soft and Minor aspect pills.
 * @conventions Thin and stateless: the caller owns the tones and the ring choice. The ring toggle shows only while a
 * transit ring is on (owner decision, 2026-11-13); it hides that ring for this view and never changes the saved overlay
 * settings. The pills are toggle buttons (`aria-pressed`), several on at once; each pill's border is its tone's line style
 * (solid, dashed, dotted) in the tone's token, through classes rather than `data-tone` so badge tones stay separate.
 * @exports ChartInstrumentBar, ALL_ASPECT_TONES
 */
import type { AspectTone } from '../astrology/aspects.js';
import { chartInstrumentBarMessages } from './ChartInstrumentBar.messages.js';
import { useMessages } from './messages.js';
import { Button } from './primitives/Button.js';
import { ChoiceGroup } from './primitives/ChoiceGroup.js';

/** The pills, in the order the bar shows them; all on is the default view. */
export const ALL_ASPECT_TONES: readonly AspectTone[] = ['hard', 'soft', 'minor'];

const BOTH = 'both';
const NATAL = 'natal';

export function ChartInstrumentBar({
  tones,
  onTonesChange,
  transitRing,
  natalOnly,
  onNatalOnlyChange,
}: {
  readonly tones: ReadonlySet<AspectTone>;
  readonly onTonesChange: (tones: ReadonlySet<AspectTone>) => void;
  /** Whether the chart has a transit ring; without one there is nothing for the ring toggle to hide. */
  readonly transitRing: boolean;
  readonly natalOnly: boolean;
  readonly onNatalOnlyChange: (natalOnly: boolean) => void;
}): React.JSX.Element {
  const t = useMessages(chartInstrumentBarMessages);
  return (
    <div className="chart-instrument-bar" role="group" aria-label={t.label}>
      {transitRing && (
        <>
          <ChoiceGroup
            label={t.ringsLabel}
            value={natalOnly ? NATAL : BOTH}
            segmented
            options={[
              { value: BOTH, label: t.natalAndTransit },
              { value: NATAL, label: t.natalOnly },
            ]}
            onChange={(value) => {
              onNatalOnlyChange(value === NATAL);
            }}
          />
          <span className="chart-instrument-bar-divider" aria-hidden="true" />
        </>
      )}
      <div className="chart-instrument-bar-tones" role="group" aria-label={t.tonesLabel}>
        {ALL_ASPECT_TONES.map((tone) => {
          const on = tones.has(tone);
          return (
            <Button
              key={tone}
              variant="plain"
              className={`chart-tone-pill chart-tone-pill--${tone}`}
              aria-pressed={on}
              onClick={() => {
                const next = new Set(tones);
                if (on) next.delete(tone);
                else next.add(tone);
                onTonesChange(next);
              }}
            >
              {t.tones[tone]}
            </Button>
          );
        })}
      </div>
    </div>
  );
}
