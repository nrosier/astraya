/**
 * @module OrbProfileEditor
 * @purpose Lets a person keep their own orb profile (scale, per-aspect and per-body orbs) for the transit and synastry screens (#590).
 * @conventions Saves the whole profile as the person's atomic `orbProfile` register after `validateCustomOrbProfile` accepts it, so a synced device never sees half a profile; each save bumps `revision`. Blank fields mean "use the built-in tier", never zero. Typed values stay strings until save, like `NumberField` expects.
 * @exports OrbProfileEditor
 */
import { useState } from 'react';
import {
  ORB_PROFILE_IDS,
  ORB_PROFILES,
  validateCustomOrbProfile,
  type CustomOrbProfile,
  type OrbProfileId,
} from '../astrology/orb-profiles.js';
import type { Person } from '../domain/person.js';
import { useMessages } from './messages.js';
import { emptyOrbRulesDraft, orbRulesDraftFrom, orbRulesFromDraft, type OrbRulesDraft } from './orb-rules-draft.js';
import { OrbRulesFields } from './OrbRulesFields.js';
import { Disclosure } from './primitives/Disclosure.js';
import { NumberField } from './primitives/NumberField.js';
import { Select } from './primitives/Select.js';
import { StatusMessage } from './primitives/StatusMessage.js';
import { TextField } from './primitives/TextField.js';
import type { JsonValue } from '../store/ops.js';
import { useStore } from './store-context.js';
import { orbProfileEditorMessages } from './OrbProfileEditor.messages.js';

interface Draft {
  readonly name: string;
  readonly basedOn: OrbProfileId;
  readonly scale: string;
  readonly rules: OrbRulesDraft;
}

function draftFrom(profile: CustomOrbProfile | undefined): Draft {
  return {
    name: profile?.name ?? '',
    basedOn: profile?.basedOn ?? 'standard-v1',
    scale: String(profile?.scalePercent ?? 0),
    rules: profile === undefined ? emptyOrbRulesDraft : orbRulesDraftFrom(profile),
  };
}

/** The profile a draft stands for, or `undefined` when a typed value is not a number or the validator refuses it. */
function profileFrom(draft: Draft, revision: number): CustomOrbProfile | undefined {
  const rules = orbRulesFromDraft(draft.rules);
  if (rules === undefined) return undefined;
  return validateCustomOrbProfile({
    name: draft.name.trim(),
    basedOn: draft.basedOn,
    revision,
    scalePercent: Number(draft.scale),
    ...rules,
  });
}

/** The stored shape of a profile: plain objects and numbers, which the op log accepts as a value. */
function toJson(profile: CustomOrbProfile): JsonValue {
  return {
    name: profile.name,
    basedOn: profile.basedOn,
    revision: profile.revision,
    scalePercent: profile.scalePercent,
    aspectOrbs: Object.fromEntries(
      Object.entries(profile.aspectOrbs).map(([key, rule]) => [
        key,
        { base: rule.base, luminaryBonus: rule.luminaryBonus },
      ]),
    ),
    bodyOrbs: { ...profile.bodyOrbs },
  };
}

export function OrbProfileEditor({ person }: { readonly person: Person }): React.JSX.Element {
  const store = useStore();
  const t = useMessages(orbProfileEditorMessages);
  const saved = person.orbProfile;
  const [draft, setDraft] = useState<Draft>(() => draftFrom(saved));
  const [error, setError] = useState<string | undefined>();
  const [status, setStatus] = useState<string | undefined>();

  const write = (value: CustomOrbProfile | null, done: string): void => {
    void store
      .mutate([
        { entity: 'person', entityId: person.id, field: 'orbProfile', value: value === null ? null : toJson(value) },
      ])
      .then(() => {
        setError(undefined);
        setStatus(done);
      })
      .catch((cause: unknown) => {
        setStatus(undefined);
        setError(t.saveFailed(cause instanceof Error ? cause.message : String(cause)));
      });
  };

  const save = (): void => {
    const next = profileFrom(draft, (saved?.revision ?? 0) + 1);
    if (next === undefined) {
      setStatus(undefined);
      setError(t.invalid);
      return;
    }
    write(next, t.saved(next.revision));
  };

  const remove = (): void => {
    setDraft(draftFrom(undefined));
    write(null, t.removed);
  };

  return (
    <Disclosure
      title={t.title}
      summary={saved === undefined ? t.summaryNone : t.summarySaved(saved.name, saved.revision)}
      showLabel={t.show}
      hideLabel={t.hide}
    >
      <p className="hint">{t.hint}</p>
      <div className="field-grid">
        <TextField
          label={t.name}
          value={draft.name}
          onChange={(name) => {
            setDraft((current) => ({ ...current, name }));
          }}
        />
        <Select
          label={t.basedOn}
          value={draft.basedOn}
          options={ORB_PROFILE_IDS.map((id) => ({ value: id, label: ORB_PROFILES[id].name }))}
          onChange={(value) => {
            const id = ORB_PROFILE_IDS.find((candidate) => candidate === value);
            if (id !== undefined) setDraft((current) => ({ ...current, basedOn: id }));
          }}
        />
        <NumberField
          label={t.scale}
          unit="%"
          min={-90}
          max={90}
          step={10}
          decreaseLabel={t.decreaseScale}
          increaseLabel={t.increaseScale}
          value={draft.scale}
          onChange={(scale) => {
            setDraft((current) => ({ ...current, scale }));
          }}
        />
      </div>
      <OrbRulesFields
        draft={draft.rules}
        onChange={(rules) => {
          setDraft((current) => ({ ...current, rules }));
        }}
      />
      {error !== undefined && <StatusMessage kind="error">{error}</StatusMessage>}
      {status !== undefined && <StatusMessage kind="success">{status}</StatusMessage>}
      <p>
        <button type="button" className="quiet" onClick={save} disabled={draft.name.trim() === ''}>
          {t.save}
        </button>{' '}
        {saved !== undefined && (
          <button type="button" className="quiet" onClick={remove}>
            {t.remove}
          </button>
        )}
      </p>
    </Disclosure>
  );
}
