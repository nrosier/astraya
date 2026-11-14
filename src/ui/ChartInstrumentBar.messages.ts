/**
 * @module ChartInstrumentBar.messages
 * @purpose English/Dutch strings for the instrument bar under the natal wheel (#1532).
 * @conventions Co-located i18n file exporting `{ en, nl }`; `nl` is typed as `typeof en`. The tone labels match the
 * transit filter's Hard / Soft / Minor (Zacht / Klein in Dutch), without its aspect lists.
 * @exports chartInstrumentBarMessages
 */
import type { AspectTone } from '../astrology/aspects.js';

const en = {
  label: 'Wheel display',
  ringsLabel: 'Rings on the wheel',
  natalAndTransit: 'Natal + transit',
  natalOnly: 'Natal only',
  tonesLabel: 'Aspect families on the wheel',
  tones: { hard: 'Hard', soft: 'Soft', minor: 'Minor' } satisfies Record<AspectTone, string>,
};

const nl: typeof en = {
  label: 'Weergave van de horoscoop',
  ringsLabel: 'Ringen op de horoscoop',
  natalAndTransit: 'Geboorte + transit',
  natalOnly: 'Alleen geboorte',
  tonesLabel: 'Aspectfamilies op de horoscoop',
  tones: { hard: 'Hard', soft: 'Zacht', minor: 'Klein' },
};

export const chartInstrumentBarMessages = { en, nl };
