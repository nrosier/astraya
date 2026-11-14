/**
 * @module ui/use-linked-scroll
 * @purpose Brings the other side's element into view when an event is selected in the Gantt chart or in the events table (#1442): a bar click scrolls its table row into view, a row click scrolls its bar into view.
 * @conventions Scrolls with `block: 'nearest'`, so nothing moves when the element is already visible; the smooth behaviour is dropped under prefers-reduced-motion. The Gantt always draws the whole date range, so a row's bar is always inside the axis and there is no horizontal pan to do; only the page may need to scroll to it.
 * @exports useLinkedScroll, SelectionSource
 */
import { useEffect, type RefObject } from 'react';

/** Where a selection came from: a bar in the chart, or a row in the table. */
export type SelectionSource = 'chart' | 'table';

export function useLinkedScroll(
  selectedKey: string | undefined,
  sourceRef: RefObject<SelectionSource>,
  chartRef: RefObject<HTMLElement | null>,
  tableRef: RefObject<HTMLElement | null>,
): void {
  useEffect(() => {
    if (selectedKey === undefined) return;
    const from = sourceRef.current;
    const root = from === 'chart' ? tableRef.current : chartRef.current;
    const attribute = from === 'chart' ? 'data-row-key' : 'data-mark-key';
    const target = Array.from(root?.querySelectorAll(`[${attribute}]`) ?? []).find(
      (candidate) => candidate.getAttribute(attribute) === selectedKey,
    );
    const reduceMotion =
      typeof window.matchMedia === 'function' && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    target?.scrollIntoView?.({ behavior: reduceMotion ? 'auto' : 'smooth', block: 'nearest' });
  }, [selectedKey, sourceRef, chartRef, tableRef]);
}
