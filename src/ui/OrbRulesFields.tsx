/**
 * @module OrbRulesFields
 * @purpose The per-aspect and per-body orb inputs (#590), as two disclosures, shared by the person's orb-profile editor and the natal Extended settings card.
 * @conventions Controlled by an `OrbRulesDraft` of typed strings; the owner decides when a draft is valid and what saving means. Blank fields keep the built-in value.
 * @exports OrbRulesFields
 */
import { ASPECTS } from '../astrology/aspects.js';
import { BODIES } from '../astrology/bodies.js';
import { aspectDisplayName, bodyDisplayName } from './astro-names.messages.js';
import { useLocale } from './locale.js';
import { useMessages } from './messages.js';
import type { OrbRulesDraft } from './orb-rules-draft.js';
import { orbRulesFieldsMessages } from './OrbRulesFields.messages.js';
import { Disclosure } from './primitives/Disclosure.js';
import { NumberField } from './primitives/NumberField.js';

export function OrbRulesFields({
  draft,
  onChange,
}: {
  readonly draft: OrbRulesDraft;
  readonly onChange: (next: OrbRulesDraft) => void;
}): React.JSX.Element {
  const t = useMessages(orbRulesFieldsMessages);
  const [locale] = useLocale();

  const setAspect = (key: string, part: 'base' | 'bonus', value: string): void => {
    onChange({
      ...draft,
      aspects: { ...draft.aspects, [key]: { base: '', bonus: '', ...draft.aspects[key], [part]: value } },
    });
  };

  return (
    <>
      <Disclosure title={t.aspectsTitle} showLabel={t.showAspects} hideLabel={t.hideAspects}>
        <p className="hint">{t.aspectsHint}</p>
        <div className="field-grid">
          {ASPECTS.map((aspect) => (
            <fieldset key={aspect.key} className="field-group">
              <legend>{aspectDisplayName(aspect.key, locale)}</legend>
              <NumberField
                label={t.aspectBase}
                unit="°"
                min={0}
                max={30}
                step="any"
                optional
                value={draft.aspects[aspect.key]?.base ?? ''}
                onChange={(value) => {
                  setAspect(aspect.key, 'base', value);
                }}
              />
              <NumberField
                label={t.aspectBonus}
                unit="°"
                min={0}
                max={30}
                step="any"
                optional
                value={draft.aspects[aspect.key]?.bonus ?? ''}
                onChange={(value) => {
                  setAspect(aspect.key, 'bonus', value);
                }}
              />
            </fieldset>
          ))}
        </div>
      </Disclosure>
      <Disclosure title={t.bodiesTitle} showLabel={t.showBodies} hideLabel={t.hideBodies}>
        <p className="hint">{t.bodiesHint}</p>
        <div className="field-grid">
          {BODIES.map((body) => (
            <NumberField
              key={body.key}
              label={bodyDisplayName(body.key, locale)}
              unit="°"
              min={0}
              max={30}
              step="any"
              optional
              value={draft.bodies[body.key] ?? ''}
              onChange={(value) => {
                onChange({ ...draft, bodies: { ...draft.bodies, [body.key]: value } });
              }}
            />
          ))}
        </div>
      </Disclosure>
    </>
  );
}
