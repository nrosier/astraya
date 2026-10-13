/**
 * @module CustomPointEditor
 * @purpose Edits one person's persisted custom formula-point definitions alongside a calculated natal chart.
 * @conventions Uses the safe domain parser/evaluator only; edits replace the person's atomic `customPoints` register so synced devices never merge partial formulas or names.
 * @exports CustomPointEditor
 */
import { useState } from 'react';
import { FormulaError, redundantBuiltInPoint } from '../domain/custom-point.js';
import type { ChartData } from '../domain/chart-compute.js';
import type { CustomPointDefinition, Person } from '../domain/person.js';
import { Checkbox } from './primitives/Checkbox.js';
import { StatusMessage } from './primitives/StatusMessage.js';
import { TextField } from './primitives/TextField.js';
import { useMessages } from './messages.js';
import { useStore } from './store-context.js';
import { customPointEditorMessages } from './CustomPointEditor.messages.js';

function serialized(points: readonly CustomPointDefinition[]): readonly {
  readonly id: string;
  readonly name: string;
  readonly formula: string;
  readonly enabled?: boolean;
}[] {
  return points.map((point) => ({
    id: point.id,
    name: point.name,
    formula: point.formula,
    ...(point.enabled === false ? { enabled: false } : {}),
  }));
}

export function CustomPointEditor({
  person,
  data,
}: {
  readonly person: Person;
  readonly data: ChartData;
}): React.JSX.Element {
  const store = useStore();
  const t = useMessages(customPointEditorMessages);
  const [editingId, setEditingId] = useState<string | undefined>();
  const [name, setName] = useState('');
  const [formula, setFormula] = useState('');
  const [enabled, setEnabled] = useState(true);
  const [error, setError] = useState<string | undefined>();
  const points = person.customPoints ?? [];

  const clear = (): void => {
    setEditingId(undefined);
    setName('');
    setFormula('');
    setEnabled(true);
    setError(undefined);
  };
  const save = (): void => {
    const normalizedName = name.trim();
    if (normalizedName === '' || formula.trim() === '') return;
    if (
      points.some(
        (point) => point.id !== editingId && point.name.toLocaleLowerCase() === normalizedName.toLocaleLowerCase(),
      )
    ) {
      setError(t.duplicateName);
      return;
    }
    try {
      const duplicate = redundantBuiltInPoint(data, formula);
      if (duplicate !== undefined) {
        setError(t.redundant(duplicate));
        return;
      }
    } catch (cause) {
      setError(t.invalid(cause instanceof FormulaError ? cause.message : String(cause)));
      return;
    }
    const next: readonly CustomPointDefinition[] =
      editingId === undefined
        ? [...points, { id: crypto.randomUUID(), name: normalizedName, formula, enabled }]
        : points.map((point) =>
            point.id === editingId ? { ...point, name: normalizedName, formula, enabled } : point,
          );
    void store
      .mutate([{ entity: 'person', entityId: person.id, field: 'customPoints', value: serialized(next) }])
      .then(clear)
      .catch((cause: unknown) => {
        setError(t.saveFailed(cause instanceof Error ? cause.message : String(cause)));
      });
  };
  const remove = (id: string): void => {
    void store
      .mutate([
        {
          entity: 'person',
          entityId: person.id,
          field: 'customPoints',
          value: serialized(points.filter((point) => point.id !== id)),
        },
      ])
      .then(clear)
      .catch((cause: unknown) => {
        setError(t.saveFailed(cause instanceof Error ? cause.message : String(cause)));
      });
  };

  return (
    <section aria-labelledby="custom-point-editor-heading">
      <h2 id="custom-point-editor-heading">{t.heading}</h2>
      <p className="hint">{t.hint}</p>
      {points.length === 0 ? (
        <p className="hint">{t.empty}</p>
      ) : (
        <ul>
          {points.map((point) => (
            <li key={point.id}>
              <strong>{point.name}</strong>: {point.formula} {point.enabled === false && <span>({t.disabled})</span>}
              <button
                type="button"
                className="quiet"
                onClick={() => {
                  setEditingId(point.id);
                  setName(point.name);
                  setFormula(point.formula);
                  setEnabled(point.enabled !== false);
                  setError(undefined);
                }}
              >
                {t.edit(point.name)}
              </button>{' '}
              <button
                type="button"
                className="quiet"
                onClick={() => {
                  remove(point.id);
                }}
              >
                {t.remove(point.name)}
              </button>
            </li>
          ))}
        </ul>
      )}
      <div className="field-grid">
        <TextField label={t.name} value={name} onChange={setName} />
        <TextField label={t.formula} value={formula} onChange={setFormula} />
      </div>
      <Checkbox label={t.enabled} checked={enabled} onChange={setEnabled} />
      {error !== undefined && <StatusMessage kind="error">{error}</StatusMessage>}
      <p>
        <button type="button" className="quiet" onClick={save} disabled={name.trim() === '' || formula.trim() === ''}>
          {editingId === undefined ? t.add : t.save}
        </button>
        {editingId !== undefined && (
          <button type="button" className="quiet" onClick={clear}>
            {t.cancel}
          </button>
        )}
      </p>
    </section>
  );
}
