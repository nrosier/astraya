// @vitest-environment jsdom
/** The Extended settings are shared by every chart screen that uses them. */
import { act } from 'react';
import { createRoot } from 'react-dom/client';
import { afterEach, describe, expect, it } from 'vitest';
import { DEFAULT_EXTENDED_SETTINGS } from '../src/chart/extended-settings.js';
import { resetExtendedSettings, setExtendedSettings, useExtendedSettings } from '../src/ui/extended-settings-store.js';

afterEach(resetExtendedSettings);

function Probe({ name }: { name: string }): React.JSX.Element {
  const [settings] = useExtendedSettings();
  return <span className={name}>{settings.houseSystem}</span>;
}

describe('useExtendedSettings', () => {
  it('starts at the defaults and updates every screen that reads it', async () => {
    const container = document.createElement('div');
    document.body.append(container);
    const root = createRoot(container);
    await act(async () => {
      root.render(
        <>
          <Probe name="natal" />
          <Probe name="return" />
        </>,
      );
      await Promise.resolve();
    });
    expect(container.querySelector('.natal')?.textContent).toBe(DEFAULT_EXTENDED_SETTINGS.houseSystem);
    await act(async () => {
      setExtendedSettings({ ...DEFAULT_EXTENDED_SETTINGS, houseSystem: 'W' });
      await Promise.resolve();
    });
    expect(container.querySelector('.natal')?.textContent).toBe('W');
    expect(container.querySelector('.return')?.textContent).toBe('W');
    act(() => {
      root.unmount();
    });
    container.remove();
  });
});
