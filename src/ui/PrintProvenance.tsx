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
 */
/**
 * @module PrintProvenance
 * @purpose Renders the printed-page provenance footer naming which calculation settings produced the current chart, invisible outside @media print.
 * @conventions Thin/label-only — the caller passes already-resolved display strings; text comes from co-located PrintProvenance.messages.ts via useMessages(). Currently wired into ChartView.tsx only; see that screen for the integration pattern to extend to others.
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
