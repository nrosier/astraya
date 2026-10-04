/**
 * Message catalogue for `SymbolSetting.tsx` (#419).
 */
const en = {
  label: 'Symbols',
  options: {
    drawn: 'Drawn symbols',
    unicode: 'Unicode characters',
    text: 'Text only (SUN, MOO, …)',
  },
  hint: 'How planets, signs and aspects are written on the wheel, the grids and in the tables, on this device. Unicode follows your system font, so it looks different on every device; text only suits a reader who finds symbols hard to tell apart.',
};

const nl: typeof en = {
  label: 'Symbolen',
  options: {
    drawn: 'Getekende symbolen',
    unicode: 'Unicode-tekens',
    text: 'Alleen tekst (SUN, MOO, …)',
  },
  hint: 'Hoe planeten, tekens en aspecten op het wiel, in de rasters en in de tabellen worden geschreven, op dit apparaat. Unicode volgt het lettertype van je systeem en ziet er dus op elk apparaat anders uit; alleen tekst is voor wie symbolen moeilijk uit elkaar houdt.',
};

export const symbolSettingMessages = { en, nl };
