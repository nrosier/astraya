/**
 * @module ChartHelpTooltip.messages
 * @purpose English/Dutch name of the chart pages' help tooltip trigger (#1407, #1532).
 * @conventions Co-located i18n file exporting `{ en, nl }`; `nl` is typed as `typeof en`. The usage text itself is the chart screen's `wheelClickHint`.
 * @exports chartHelpTooltipMessages
 */
const en = {
  label: 'About this chart',
};

const nl: typeof en = {
  label: 'Over deze horoscoop',
};

export const chartHelpTooltipMessages = { en, nl };
