/**
 * The printed-page provenance footer (#564): which calculation settings produced the chart on
 * this page, repeated on every printed page via a `position: fixed` element the browser's own
 * print engine re-renders per page — see `app.css`'s `.print-provenance` rule for the mechanism.
 * Invisible on screen; `app.css`'s `@media print` block is what actually shows it.
 *
 * Deliberately a thin, label-only component: the caller resolves house-system/zodiac/rulership
 * display names however that screen already does (`ExtendedSettingsPanel.tsx`'s own
 * `useNameLookup`-based pattern, for instance), so this component carries no lookup logic of
 * its own and stays reusable by any screen with those three strings in hand.
 *
 * Wired into every screen that renders a printable chart (#564): `ChartDataView` in
 * `ChartView.tsx` carries it for every single-chart screen built on top of that view
 * (`DraconicView`, `HarmonicView`, `CompositeView`, `HoraryView`, `ReturnView`,
 * `RelocatedChartView`); `SynastryView.tsx`, `TransitView.tsx` and `PrimaryDirectionsView.tsx`
 * each render their own, reusing `ChartView.tsx`'s exported label helpers. Those three bi-wheel
 * screens don't yet thread a user-configurable `ExtendedSettings`/`ChartCalculationOptions`
 * through their own compute calls (`chart-compute.ts`'s own doc comment already flags this as
 * pending a future settings UI) — their footer therefore truthfully states the engine defaults
 * those screens actually compute with (`DEFAULT_EXTENDED_SETTINGS`, `DEFAULT_RULERSHIP_CHOICE`),
 * not a per-screen setting that doesn't exist yet.
 */
/**
 * @module PrintProvenance
 * @purpose Renders the printed-page provenance footer naming which calculation settings produced the current chart, invisible outside @media print.
 * @conventions Thin/label-only — the caller passes already-resolved display strings; text comes from co-located PrintProvenance.messages.ts via useMessages(). Wired into ChartDataView (every single-chart screen) and individually into SynastryView/TransitView/PrimaryDirectionsView.
 * @exports PrintProvenance
 */
import { printProvenanceMessages } from './PrintProvenance.messages.js';
import { useMessages } from './messages.js';

export function PrintProvenance({
  houseSystem,
  zodiac,
  rulership,
  snapshotIdentity,
  generatedAt,
}: {
  readonly houseSystem: string;
  readonly zodiac: string;
  readonly rulership: string;
  readonly snapshotIdentity: string;
  readonly generatedAt: string;
}): React.JSX.Element {
  const t = useMessages(printProvenanceMessages);
  return <p className="print-provenance">{t.summary(houseSystem, zodiac, rulership, snapshotIdentity, generatedAt)}</p>;
}
