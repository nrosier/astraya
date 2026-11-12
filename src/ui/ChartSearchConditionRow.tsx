/**
 * @module ChartSearchConditionRow
 * @purpose One editable condition of the "Search charts" card (#1405): scope, kind, body, then sign, house or aspect and its target, with a labelled Remove control.
 * @conventions Controlled by the draft: every change returns a whole new `SearchCondition` through `onChange`. Changing the kind starts that kind's defaults and keeps scope and body. Fields are shared `Select`s, one per line on a phone (40rem and below) and in a wrapping grid above it. The scope list offers natal, transit, progression, solarReturn, lunarReturn and solarArc.
 * @exports ChartSearchConditionRow, blankCondition
 */
import { ASPECTS } from '../astrology/aspects.js';
import { BODIES, bodyById, bodyByKey } from '../astrology/bodies.js';
import { SIGNS } from '../astrology/signs.js';
import type { SearchAngle, SearchCondition, SearchScope } from '../domain/chart-search.js';
import { chartSearchPanelMessages } from './ChartSearchPanel.messages.js';
import { aspectDisplayName, bodyDisplayName, signDisplayName } from './astro-names.messages.js';
import { useLocale } from './locale.js';
import { useMessages } from './messages.js';
import { Button } from './primitives/Button.js';
import { Select, type SelectOption } from './primitives/Select.js';

// solarArc is offered too: #1486 has landed and its copy key is in the catalogue.
const SCOPES: readonly SearchScope[] = ['natal', 'transit', 'progression', 'solarReturn', 'lunarReturn', 'solarArc'];
const KINDS: readonly SearchCondition['kind'][] = ['sign', 'house', 'aspect'];
const HOUSES: readonly number[] = Array.from({ length: 12 }, (_, index) => index + 1);
const ANGLES: readonly SearchAngle[] = ['asc', 'mc'];

const SUN = bodyByKey('sun')?.id ?? BODIES[0]?.id ?? 0;

/** The condition a new row starts as: the Sun in Aries, in the natal chart. */
export function blankCondition(): SearchCondition {
  return { kind: 'sign', scope: 'natal', body: SUN, sign: 0 };
}

function keyOf(condition: SearchCondition): string {
  return bodyById(condition.body)?.key ?? '';
}

function withKind(condition: SearchCondition, kind: SearchCondition['kind']): SearchCondition {
  const scope = condition.scope ?? 'natal';
  if (kind === 'sign') return { kind, scope, body: condition.body, sign: 0 };
  if (kind === 'house') return { kind, scope, body: condition.body, house: 1 };
  const other = BODIES.find((body) => body.id !== condition.body);
  return {
    kind,
    scope,
    body: condition.body,
    aspectKey: ASPECTS[0]?.key ?? 'conjunction',
    target: { kind: 'body', body: other?.id ?? condition.body },
  };
}

export interface ChartSearchConditionRowProps {
  /** 1-based position, shown and used in the Remove label. */
  readonly position: number;
  readonly condition: SearchCondition;
  readonly disabled: boolean;
  /** False for the only remaining condition: a search needs at least one. */
  readonly canRemove: boolean;
  readonly onChange: (condition: SearchCondition) => void;
  readonly onRemove: () => void;
}

export function ChartSearchConditionRow({
  position,
  condition,
  disabled,
  canRemove,
  onChange,
  onRemove,
}: ChartSearchConditionRowProps): React.JSX.Element {
  const t = useMessages(chartSearchPanelMessages);
  const [locale] = useLocale();
  const n = String(position);
  const scope = condition.scope ?? 'natal';

  const scopeOptions: SelectOption[] = SCOPES.map((value) => ({ value, label: t.scope[value] }));
  const kindOptions: SelectOption[] = KINDS.map((value) => ({ value, label: t.condition[value] }));
  const bodyOptions: SelectOption[] = BODIES.map((body) => ({
    value: body.key,
    label: bodyDisplayName(body.key, locale),
  }));
  const setBody = (key: string): void => {
    const body = bodyByKey(key);
    if (body !== undefined) onChange({ ...condition, body: body.id });
  };

  let third: React.JSX.Element;
  let target: React.JSX.Element | undefined;
  if (condition.kind === 'sign') {
    third = (
      <Select
        label={t.field.sign}
        value={String(condition.sign)}
        options={SIGNS.map((sign) => ({ value: String(sign.index), label: signDisplayName(sign.name, locale) }))}
        disabled={disabled}
        onChange={(value) => {
          onChange({ ...condition, sign: Number(value) });
        }}
      />
    );
  } else if (condition.kind === 'house') {
    third = (
      <Select
        label={t.field.house}
        value={String(condition.house)}
        options={HOUSES.map((house) => ({ value: String(house), label: t.houseOption(String(house)) }))}
        disabled={disabled}
        onChange={(value) => {
          onChange({ ...condition, house: Number(value) });
        }}
      />
    );
  } else {
    third = (
      <Select
        label={t.field.aspect}
        value={condition.aspectKey}
        options={ASPECTS.map((aspect) => ({ value: aspect.key, label: aspectDisplayName(aspect.key, locale) }))}
        disabled={disabled}
        onChange={(value) => {
          onChange({ ...condition, aspectKey: value });
        }}
      />
    );
    const current =
      condition.target.kind === 'angle'
        ? `angle:${condition.target.angle}`
        : `body:${bodyById(condition.target.body)?.key ?? ''}`;
    const targetOptions: SelectOption[] = [
      ...BODIES.map((body) => ({ value: `body:${body.key}`, label: bodyDisplayName(body.key, locale) })),
      ...ANGLES.map((angle) => ({ value: `angle:${angle}`, label: bodyDisplayName(angle, locale) })),
    ];
    target = (
      <Select
        label={t.field.target}
        value={current}
        options={targetOptions}
        disabled={disabled}
        onChange={(value) => {
          const [kind, id = ''] = value.split(':');
          if (kind === 'angle') {
            const angle = ANGLES.find((candidate) => candidate === id);
            if (angle !== undefined) onChange({ ...condition, target: { kind: 'angle', angle } });
            return;
          }
          const body = bodyByKey(id);
          if (body !== undefined) onChange({ ...condition, target: { kind: 'body', body: body.id } });
        }}
      />
    );
  }

  return (
    <li className="cond">
      <span className="cond-n" aria-hidden="true">
        {n}
      </span>
      <div className="cond-fields" role="group" aria-label={t.conditionLabel(n)}>
        <Select
          label={t.field.scope}
          value={scope}
          options={scopeOptions}
          disabled={disabled}
          onChange={(value) => {
            const next = SCOPES.find((candidate) => candidate === value);
            if (next !== undefined) onChange({ ...condition, scope: next });
          }}
        />
        <Select
          label={t.field.kind}
          value={condition.kind}
          options={kindOptions}
          disabled={disabled}
          onChange={(value) => {
            const next = KINDS.find((candidate) => candidate === value);
            if (next !== undefined && next !== condition.kind) onChange(withKind(condition, next));
          }}
        />
        <Select
          label={t.field.body}
          value={keyOf(condition)}
          options={bodyOptions}
          disabled={disabled}
          onChange={setBody}
        />
        {third}
        {target}
      </div>
      <Button
        variant="quiet"
        size="compact"
        disabled={disabled || !canRemove}
        aria-label={t.removeCondition(n)}
        data-remove={position}
        onClick={onRemove}
      >
        {t.removeShort}
      </Button>
    </li>
  );
}
