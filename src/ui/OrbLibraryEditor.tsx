/**
 * @module OrbLibraryEditor
 * @purpose Manages the device's named orb profiles (#590) and chooses which orbs transit, synastry and natal charts use: the card's, or a named profile's.
 * @conventions Saving an edit increments the profile's revision and keeps its id, so charts already drawn keep the revision they recorded. Choices are a device preference, saved at once. Text comes from OrbLibraryEditor.messages.ts via useMessages().
 * @exports OrbLibraryEditor
 */
import { useState } from 'react';
import {
  CARD_SOURCE,
  nextRevision,
  validateOrbProfileRecord,
  type OrbContextSource,
  type OrbProfileRecord,
} from '../astrology/orb-library.js';
import { CITED_ORB_PRESET_IDS, CITED_ORB_PRESETS } from '../astrology/orb-profiles.js';
import { orbRulesDraftFrom, orbRulesFromDraft, type OrbRulesDraft } from './orb-rules-draft.js';
import { OrbRulesFields } from './OrbRulesFields.js';
import { orbLibraryEditorMessages } from './OrbLibraryEditor.messages.js';
import { useMessages } from './messages.js';
import { writeOrbContextSource, writeOrbLibrary } from './orb-library-store.js';
import { Button } from './primitives/Button.js';
import { Select } from './primitives/Select.js';
import { StatusMessage } from './primitives/StatusMessage.js';
import { TextField } from './primitives/TextField.js';
import { NumberField } from './primitives/NumberField.js';

interface Draft {
  readonly id: string | undefined;
  readonly name: string;
  readonly scale: string;
  readonly rules: OrbRulesDraft;
}

const EMPTY_DRAFT: Draft = { id: undefined, name: '', scale: '0', rules: { aspects: {}, bodies: {} } };

function draftOf(profile: OrbProfileRecord): Draft {
  return {
    id: profile.id,
    name: profile.name,
    scale: String(profile.scalePercent),
    rules: orbRulesDraftFrom({ aspectOrbs: profile.aspectOrbs, bodyOrbs: profile.bodyOrbs }),
  };
}

function newId(existing: readonly OrbProfileRecord[]): string {
  const taken = new Set(existing.map((profile) => profile.id));
  let candidate = `profile-${String(existing.length + 1)}`;
  for (let n = existing.length + 1; taken.has(candidate); n += 1) candidate = `profile-${String(n)}`;
  return candidate;
}

export function OrbLibraryEditor({
  profiles,
  sources,
}: {
  readonly profiles: readonly OrbProfileRecord[];
  readonly sources: OrbContextSource;
}): React.JSX.Element {
  const t = useMessages(orbLibraryEditorMessages);
  const [draft, setDraft] = useState<Draft | undefined>(undefined);
  const [error, setError] = useState<string | undefined>(undefined);
  const [status, setStatus] = useState<string | undefined>(undefined);

  const existing = draft?.id === undefined ? undefined : profiles.find((profile) => profile.id === draft.id);

  const save = (): void => {
    if (draft === undefined) return;
    const rules = orbRulesFromDraft(draft.rules);
    const next = validateOrbProfileRecord({
      id: draft.id ?? newId(profiles),
      name: draft.name.trim(),
      revision: nextRevision(existing),
      scalePercent: Number(draft.scale),
      aspectOrbs: rules?.aspectOrbs,
      bodyOrbs: rules?.bodyOrbs,
    });
    if (next === undefined) {
      setError(t.invalid);
      setStatus(undefined);
      return;
    }
    const others = profiles.filter((profile) => profile.id !== next.id);
    writeOrbLibrary({ profiles: [...others, next] });
    setDraft(undefined);
    setError(undefined);
    setStatus(t.saved(next.name, next.revision));
  };

  const remove = (id: string): void => {
    writeOrbLibrary({ profiles: profiles.filter((profile) => profile.id !== id) });
    // A choice that named the removed profile falls back to the card, so no context is left pointing nowhere.
    const cleared = Object.fromEntries(
      Object.entries(sources).map(([key, value]) => [key, value === id ? CARD_SOURCE : value]),
    ) as OrbContextSource;
    writeOrbContextSource(cleared);
    setDraft(undefined);
    setStatus(t.removed);
  };

  const choose = (context: keyof OrbContextSource, value: string): void => {
    writeOrbContextSource({ ...sources, [context]: value });
    setStatus(t.chosen);
  };

  const sourceOptions = [
    { value: CARD_SOURCE, label: t.cardOption },
    ...CITED_ORB_PRESET_IDS.map((id) => ({ value: id, label: CITED_ORB_PRESETS[id].name })),
    ...profiles.map((profile) => ({
      value: profile.id,
      label: `${profile.name} (${t.revisionLabel(profile.revision)})`,
    })),
  ];

  return (
    <section aria-labelledby="orb-library-heading">
      <h3 id="orb-library-heading">{t.heading}</h3>
      <p className="hint">{t.hint}</p>

      {profiles.length === 0 ? (
        <p className="hint">{t.none}</p>
      ) : (
        <ul>
          {profiles.map((profile) => (
            <li key={profile.id}>
              <strong>{profile.name}</strong> — {t.revisionLabel(profile.revision)}{' '}
              <button
                type="button"
                className="quiet"
                onClick={() => {
                  setDraft(draftOf(profile));
                  setError(undefined);
                }}
              >
                {t.edit(profile.name)}
              </button>{' '}
              <button
                type="button"
                className="quiet"
                onClick={() => {
                  remove(profile.id);
                }}
              >
                {t.remove(profile.name)}
              </button>
            </li>
          ))}
        </ul>
      )}

      <p>
        <Button
          size="compact"
          onClick={() => {
            setDraft(EMPTY_DRAFT);
            setError(undefined);
          }}
        >
          {t.add}
        </Button>
      </p>

      {draft !== undefined && (
        <div className="field-group">
          <TextField
            label={t.name}
            value={draft.name}
            onChange={(name) => {
              setDraft({ ...draft, name });
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
              setDraft({ ...draft, scale });
            }}
          />
          <OrbRulesFields
            draft={draft.rules}
            onChange={(rules) => {
              setDraft({ ...draft, rules });
            }}
          />
          {error !== undefined && <StatusMessage kind="error">{error}</StatusMessage>}
          <p>
            <button type="button" className="quiet" onClick={save} disabled={draft.name.trim() === ''}>
              {existing === undefined ? t.saveNew : t.saveRevision(nextRevision(existing))}
            </button>{' '}
            <button
              type="button"
              className="quiet"
              onClick={() => {
                setDraft(undefined);
                setError(undefined);
              }}
            >
              {t.cancel}
            </button>
          </p>
        </div>
      )}

      <h4>{t.useHeading}</h4>
      {(['natal', 'transit', 'synastry'] as const).map((context) => (
        <Select
          key={context}
          label={t.contextLabel[context]}
          value={sources[context] ?? CARD_SOURCE}
          options={sourceOptions}
          onChange={(value) => {
            choose(context, value);
          }}
        />
      ))}
      <p className="hint">{t.useHint}</p>
      {status !== undefined && <StatusMessage kind="success">{status}</StatusMessage>}
    </section>
  );
}
