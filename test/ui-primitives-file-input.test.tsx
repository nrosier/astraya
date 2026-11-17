// @vitest-environment jsdom
/**
 * The FileInput primitive (#966, #1650): its visible button carries the optional `className` prop (for a control's own
 * placement or identity class, such as the Life events Import CSV form action), and omitting the prop leaves the
 * rendered button exactly as it was before the prop existed.
 */
import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, describe, expect, it } from 'vitest';
import { FileInput } from '../src/ui/primitives/FileInput.js';

let root: Root | undefined;
let container: HTMLElement | undefined;

afterEach(() => {
  if (root !== undefined) {
    const mounted = root;
    act(() => {
      mounted.unmount();
    });
  }
  container?.remove();
  root = undefined;
  container = undefined;
});

function render(element: React.JSX.Element): HTMLElement {
  const host = document.createElement('div');
  document.body.append(host);
  container = host;
  root = createRoot(host);
  const mounted = root;
  act(() => {
    mounted.render(element);
  });
  return host;
}

describe('FileInput className prop (#1650)', () => {
  it('applies the className to the rendered button', () => {
    const host = render(
      <FileInput buttonLabel="Import CSV" className="primitive-button-form-action" onChange={() => undefined} />,
    );
    const button = host.querySelector('button');
    expect(button?.classList.contains('primitive-button-form-action')).toBe(true);
    expect(button?.textContent).toBe('Import CSV');
  });

  it('keeps the primary class and the className together when both are set', () => {
    const host = render(
      <FileInput buttonLabel="Restore" primary className="primitive-button-form-action" onChange={() => undefined} />,
    );
    const button = host.querySelector('button');
    expect(button?.classList.contains('primitive-button-primary')).toBe(true);
    expect(button?.classList.contains('primitive-button-form-action')).toBe(true);
  });

  it('leaves the rendered button unchanged when className is omitted', () => {
    const host = render(<FileInput buttonLabel="Check Calculation File..." onChange={() => undefined} />);
    const button = host.querySelector('button');
    expect(button?.getAttribute('class')).toBeNull();
    expect(button?.getAttribute('type')).toBe('button');
    expect(button?.textContent).toBe('Check Calculation File...');
  });

  it('leaves the class list unchanged when className is undefined', () => {
    const host = render(<FileInput buttonLabel="Check" className={undefined} onChange={() => undefined} />);
    expect(host.querySelector('button')?.getAttribute('class')).toBeNull();
  });
});
