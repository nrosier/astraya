/**
 * @module ui/UnreadableSettingsNotice
 * @purpose The notice a chart screen shows instead of a chart when the person's saved calculation settings are unreadable (#806).
 * @conventions Uses UnreadableSettingsNotice.messages.ts for en/nl text via useMessages(); rendered in place of the chart, never beside a chart drawn from default settings.
 * @exports UnreadableSettingsNotice
 */
import { useMessages } from './messages.js';
import { StatusMessage } from './primitives/StatusMessage.js';
import { unreadableSettingsNoticeMessages } from './UnreadableSettingsNotice.messages.js';

export function UnreadableSettingsNotice({ name }: { readonly name: string }): React.JSX.Element {
  const t = useMessages(unreadableSettingsNoticeMessages);
  return (
    <main className="shell">
      <StatusMessage kind="error">{t.notice(name)}</StatusMessage>
    </main>
  );
}
