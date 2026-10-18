/**
 * @module ui/acg-map-labels
 * @purpose The words the astrocartography map draws on its lines and in its legend (#667), in the reader's language, shared by the Astrocartography screen and the PDF.
 * @conventions Pure; body names from astro-names, line-type names from AstrocartographyView.messages. Short names (MC) go on the lines, full names (MC (Midheaven)) in the legend.
 * @exports acgMapLabels
 */
import type { AcgMapLabels } from '../chart/acg-map.js';
import type { Locale } from '../interpretation/schema.js';
import { bodyDisplayName } from './astro-names.messages.js';
import { astrocartographyViewMessages } from './AstrocartographyView.messages.js';

export function acgMapLabels(locale: Locale): AcgMapLabels {
  const t = astrocartographyViewMessages[locale];
  return {
    bodyName: (bodyKey) => bodyDisplayName(bodyKey, locale),
    kinds: { MC: 'MC', IC: 'IC', AC: 'AC', DC: 'DC' },
    legendKinds: { MC: t.mc, IC: t.ic, AC: t.ac, DC: t.dc, localSpace: t.localSpaceLegend },
  };
}
