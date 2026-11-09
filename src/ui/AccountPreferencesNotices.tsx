/**
 * The account preferences' visible states (#1066): the one-time prompt for settings that differ between this device and
 * the account, a failed save, and a setting this build cannot read. Mounted once, at the top of the screen slot.
 */
/**
 * @module ui/AccountPreferencesNotices
 * @purpose Renders the account-preferences reconcile prompt (one choice per differing setting), the failed-save message and the unreadable-setting notice.
 * @conventions Runs `useAccountPreferencesReconcile` (mount once); the prompt is a `StagedDialog` whose discard path (Escape, ×, backdrop, leaving the page) equals "keep the account's settings"; each differing setting is a `ChoiceGroup` defaulting to this device's value, which is the newer or the one of unknown age; strings from the co-located messages file.
 * @exports AccountPreferencesNotices
 */
import { useRef, useState } from 'react';
import { isRulershipChoice } from '../astrology/rulership.js';
import {
  CALCULATION_PROFILE_IDS,
  CALCULATION_PROFILES,
  matchCalculationProfile,
} from '../chart/calculation-profiles.js';
import { readAccountFieldValue, type ReconcileProposal } from '../domain/account-preferences.js';
import {
  ACCOUNT_LOCALE_FIELD,
  ACCOUNT_ORB_LIBRARY_FIELD,
  ACCOUNT_ORB_SOURCE_FIELD,
  ACCOUNT_PROFILE_FIELD,
  ACCOUNT_TRANSIT_FILTER_DAILY_FIELD,
  ACCOUNT_TRANSIT_FILTER_YEARLY_FIELD,
  type AccountField,
} from '../store/account.js';
import type { JsonValue } from '../store/ops.js';
import { clearAccountPreferenceFailure, useAccountPreferences } from './account-preferences.js';
import { useAccountPreferencesReconcile, type AccountReconcilePrompt } from './account-preferences-reconcile.js';
import { accountPreferencesNoticesMessages } from './AccountPreferencesNotices.messages.js';
import { LOCALE_LABELS } from './locale.js';
import { useMessages } from './messages.js';
import { Button } from './primitives/Button.js';
import { ChoiceGroup } from './primitives/ChoiceGroup.js';
import { Notice } from './primitives/Notice.js';
import { StagedDialog } from './primitives/StagedDialog.js';
import { StatusMessage } from './primitives/StatusMessage.js';
import { errorDetail } from './api-error.js';

type Messages = typeof accountPreferencesNoticesMessages.en;

/** A readable name for a register value. `null` (an explicit reset, or an account value this build cannot read). */
function describe(field: AccountField, value: JsonValue | null, t: Messages): string {
  if (value === null) return t.defaultValue;
  if (field === ACCOUNT_LOCALE_FIELD) {
    const locale = readAccountFieldValue(ACCOUNT_LOCALE_FIELD, value);
    return locale === undefined ? t.defaultValue : LOCALE_LABELS[locale];
  }
  if (field === ACCOUNT_PROFILE_FIELD) {
    const settings = readAccountFieldValue(ACCOUNT_PROFILE_FIELD, value);
    if (settings === undefined) return t.defaultValue;
    // The profile register holds no rulers, so a built-in matches on its settings with its own rulers.
    const id = CALCULATION_PROFILE_IDS.find(
      (candidate) => matchCalculationProfile(settings, CALCULATION_PROFILES[candidate].rulership) === candidate,
    );
    return t.profileNames[id ?? 'custom'];
  }
  if (field === ACCOUNT_ORB_LIBRARY_FIELD) {
    const library = readAccountFieldValue(ACCOUNT_ORB_LIBRARY_FIELD, value);
    if (library === undefined || library.profiles.length === 0) return t.defaultValue;
    const names = library.profiles.map((profile) => profile.name);
    const shown = names.length > 3 ? `${names.slice(0, 3).join(', ')}…` : names.join(', ');
    return t.orbProfileCount(library.profiles.length, shown);
  }
  if (field === ACCOUNT_ORB_SOURCE_FIELD) {
    const source = readAccountFieldValue(ACCOUNT_ORB_SOURCE_FIELD, value);
    if (source === undefined) return t.defaultValue;
    const parts = (['transit', 'synastry', 'natal'] as const).flatMap((context) => {
      const choice = source[context];
      return choice === undefined
        ? []
        : [`${t.orbContextNames[context]}: ${choice === 'card' ? t.orbCardSource : choice}`];
    });
    return parts.length === 0 ? t.defaultValue : parts.join('; ');
  }
  if (field === ACCOUNT_TRANSIT_FILTER_DAILY_FIELD || field === ACCOUNT_TRANSIT_FILTER_YEARLY_FIELD) {
    const saved = readAccountFieldValue(field, value);
    if (saved === undefined) return t.defaultValue;
    return 'preset' in saved ? t.transitPresetNames[saved.preset] : t.transitCustom;
  }
  return isRulershipChoice(value) ? t.rulershipNames[value] : t.defaultValue;
}

function ReconcileDialog({ prompt }: { readonly prompt: AccountReconcilePrompt }): React.JSX.Element {
  const t = useMessages(accountPreferencesNoticesMessages);
  const returnFocus = useRef<HTMLElement | null>(null);
  const [choices, setChoices] = useState<Readonly<Partial<Record<AccountField, 'device' | 'account'>>>>({});
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string>();

  const submit = (use: (proposal: ReconcileProposal) => 'device' | 'account'): void => {
    setBusy(true);
    setError(undefined);
    prompt
      .resolve(prompt.proposals.map((proposal) => ({ field: proposal.field, use: use(proposal) })))
      .catch((cause: unknown) => {
        setError(errorDetail(cause));
        setBusy(false);
      });
  };
  const keepAccount = (): void => {
    if (!busy) submit(() => 'account');
  };

  return (
    <StagedDialog
      open
      heading={t.reconcileHeading}
      closeLabel={prompt.account ? t.keepAccount : t.keepCurrent}
      onDiscard={keepAccount}
      returnFocusTo={returnFocus}
      footer={
        <>
          <Button
            busy={busy}
            busyLabel={t.saving}
            onClick={() => {
              submit((proposal) => choices[proposal.field] ?? 'device');
            }}
          >
            {t.saveChoices}
          </Button>
          <Button variant="quiet" disabled={busy} onClick={keepAccount}>
            {prompt.account ? t.keepAccount : t.keepCurrent}
          </Button>
        </>
      }
    >
      <p>{prompt.account ? t.reconcileIntroAccount : t.reconcileIntroDevice}</p>
      {prompt.proposals.map((proposal) => {
        const device = describe(proposal.field, proposal.deviceValue, t);
        const account =
          proposal.accountUnreadable === true ? t.unreadableValue : describe(proposal.field, proposal.accountValue, t);
        return (
          <ChoiceGroup
            key={proposal.field}
            label={t.fieldNames[proposal.field]}
            showLabel
            disabled={busy}
            value={choices[proposal.field] ?? 'device'}
            options={[
              { value: 'device', label: prompt.account ? t.useDeviceAccount(device) : t.useDeviceLocal(device) },
              { value: 'account', label: prompt.account ? t.useAccountAccount(account) : t.useAccountLocal(account) },
            ]}
            onChange={(next) => {
              if (next === 'device' || next === 'account') setChoices({ ...choices, [proposal.field]: next });
            }}
          />
        );
      })}
      {error !== undefined && <StatusMessage kind="error">{t.reconcileFailed(error)}</StatusMessage>}
    </StagedDialog>
  );
}

export function AccountPreferencesNotices(): React.JSX.Element | null {
  const t = useMessages(accountPreferencesNoticesMessages);
  const preferences = useAccountPreferences();
  const prompt = useAccountPreferencesReconcile();
  const hasFailure = preferences.failure !== undefined;
  const hasUnreadable = preferences.unreadable.length > 0;
  if (!hasFailure && !hasUnreadable && prompt === undefined) return null;
  return (
    <>
      {hasFailure && (
        <div className="account-preferences-failure">
          <StatusMessage kind="error">{t.saveFailed(preferences.failure)}</StatusMessage>
          <Button variant="quiet" size="compact" onClick={clearAccountPreferenceFailure}>
            {t.dismiss}
          </Button>
        </div>
      )}
      {hasUnreadable && (
        <Notice>{t.unreadable(preferences.unreadable.map((field) => t.fieldNames[field]).join(', '))}</Notice>
      )}
      {prompt !== undefined && <ReconcileDialog prompt={prompt} />}
    </>
  );
}
