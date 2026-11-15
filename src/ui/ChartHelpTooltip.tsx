/**
 * @module ChartHelpTooltip
 * @purpose The "?" beside a chart page's heading (#1407, #1532; owner decision 2026-11-15): one tooltip with the chart's explanation first, then how to use the wheel ("Click a planet, sign or aspect line…").
 * @conventions Replaces the explanation paragraph below the wheel and the usage line above it on every chart type, so neither can overlap the instrument bar. Thin: the text comes from the page (its explanation) and the chart screen's `wheelClickHint`.
 * @exports ChartHelpTooltip
 */
import { chartHelpTooltipMessages } from './ChartHelpTooltip.messages.js';
import { chartViewMessages } from './ChartView.messages.js';
import { useMessages } from './messages.js';
import { Tooltip } from './primitives/Tooltip.js';

export function ChartHelpTooltip({ explanation }: { readonly explanation?: string | undefined }): React.JSX.Element {
  const t = useMessages(chartHelpTooltipMessages);
  const usage = useMessages(chartViewMessages).wheelClickHint;
  const text = explanation === undefined ? usage : `${explanation} ${usage}`;
  return (
    <Tooltip text={text} label={t.label} className="primitive-tooltip-icon">
      ?
    </Tooltip>
  );
}
