// @vitest-environment jsdom
/**
 * The shared control primitives (#508): equivalent controls carry the same label, help and error wiring, the compact
 * size falls back to the standard one on touch layouts, number steppers are named and obey their bounds, and a date
 * field keeps the ISO text it is given.
 */
import { readFileSync } from 'node:fs';
import { act, useState } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, describe, expect, it } from 'vitest';
import { Button } from '../src/ui/primitives/Button.js';
import { DateField } from '../src/ui/primitives/DateField.js';
import { NumberField } from '../src/ui/primitives/NumberField.js';
import { Select } from '../src/ui/primitives/Select.js';
import { TextField } from '../src/ui/primitives/TextField.js';

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

function mount(element: React.JSX.Element): HTMLElement {
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

function change(input: HTMLInputElement | HTMLSelectElement, value: string): void {
  const proto = input instanceof HTMLSelectElement ? HTMLSelectElement.prototype : HTMLInputElement.prototype;
  act(() => {
    Object.getOwnPropertyDescriptor(proto, 'value')?.set?.call(input, value);
    input.dispatchEvent(new Event(input instanceof HTMLSelectElement ? 'change' : 'input', { bubbles: true }));
  });
}

const noop = (): void => undefined;

describe('the field primitives share one label, help and error contract', () => {
  const fields: readonly (readonly [string, (props: { help?: string; error?: string }) => React.JSX.Element])[] = [
    ['TextField', (props) => <TextField label="Name" value="" onChange={noop} {...props} />],
    ['NumberField', (props) => <NumberField label="Name" value="" onChange={noop} {...props} />],
    ['DateField', (props) => <DateField label="Name" value="" onChange={noop} {...props} />],
    [
      'Select',
      (props) => <Select label="Name" value="a" options={[{ value: 'a', label: 'A' }]} onChange={noop} {...props} />,
    ],
  ];

  for (const [name, render] of fields) {
    it(`${name}: the label names the control, and help and error describe it`, () => {
      const host = mount(render({ help: 'Some help', error: 'Some error' }));
      const control = host.querySelector('input, select');
      if (control === null) throw new Error('test fixture bug: no control');
      const label = host.querySelector('label');
      expect(label?.getAttribute('for')).toBe(control.id);
      const describedBy = (control.getAttribute('aria-describedby') ?? '').split(' ');
      expect(describedBy.map((id) => host.querySelector(`#${CSS.escape(id)}`)?.textContent)).toEqual([
        'Some help',
        'Some error',
      ]);
      expect(control.getAttribute('aria-invalid')).toBe('true');
    });

    it(`${name}: with neither help nor error it carries no description and is not invalid`, () => {
      const host = mount(render({}));
      const control = host.querySelector('input, select');
      expect(control?.hasAttribute('aria-describedby')).toBe(false);
      expect(control?.hasAttribute('aria-invalid')).toBe(false);
    });
  }
});

describe('Field wording', () => {
  it('says "optional" in the reader\'s language', () => {
    const host = mount(<TextField label="Nick" value="" onChange={noop} optional />);
    expect(host.querySelector('.primitive-field-optional')?.textContent).toBe(' (optional)');
  });
});

describe('the compact size', () => {
  it('is a class on each control and button that opts in, and standard has none', () => {
    const host = mount(
      <>
        <Button size="compact">Go</Button>
        <Button>Go</Button>
        <TextField label="T" value="" onChange={noop} size="compact" />
        <NumberField label="N" value="" onChange={noop} size="compact" />
        <Select label="S" value="a" options={[{ value: 'a', label: 'A' }]} onChange={noop} size="compact" />
      </>,
    );
    expect(host.querySelectorAll('.primitive-button-compact')).toHaveLength(1);
    expect(host.querySelectorAll('.primitive-control-compact')).toHaveLength(3);
  });

  it('returns to the standard touch size on a coarse pointer, for buttons and controls alike', () => {
    const css = readFileSync('src/ui/app.css', 'utf-8');
    // Each compact rule is followed, inside a `(pointer: coarse)` block, by one that restores the base size.
    for (const selector of ['.primitive-button-compact', '.primitive-control-compact']) {
      const coarse = new RegExp(
        `@media \\(pointer: coarse\\) \\{[^@]*?${selector.replace('.', '\\.')} \\{[^}]*font-size: var\\(--text-base\\)`,
      );
      expect(css, selector).toMatch(coarse);
    }
  });
});

describe('NumberField steppers', () => {
  function Harness(props: { min?: number; max?: number }): React.JSX.Element {
    const [value, setValue] = useState('5');
    return (
      <NumberField
        label="Age"
        value={value}
        onChange={setValue}
        step={1}
        decreaseLabel="Decrease age"
        increaseLabel="Increase age"
        {...props}
      />
    );
  }
  const button = (host: HTMLElement, name: string): HTMLButtonElement => {
    const found = host.querySelector(`button[aria-label="${name}"]`);
    if (!(found instanceof HTMLButtonElement)) throw new Error(`test fixture bug: no "${name}" button`);
    return found;
  };

  it('has named Decrease/Increase buttons that step the value and stop at the bounds', () => {
    const host = mount(<Harness min={4} max={6} />);
    const input = host.querySelector('input');
    act(() => {
      button(host, 'Increase age').click();
    });
    expect(input?.value).toBe('6');
    expect(button(host, 'Increase age').disabled).toBe(true);
    act(() => {
      button(host, 'Decrease age').click();
    });
    act(() => {
      button(host, 'Decrease age').click();
    });
    expect(input?.value).toBe('4');
    expect(button(host, 'Decrease age').disabled).toBe(true);
  });

  it('renders no stepper at all without a step, leaving a plain number input', () => {
    const host = mount(<NumberField label="Latitude" value="" onChange={noop} />);
    expect(host.querySelectorAll('button')).toHaveLength(0);
  });
});

describe('DateField', () => {
  it('shows and reports the ISO text it is given, whatever the locale', () => {
    let reported = '';
    const host = mount(
      <DateField
        label="Date"
        value="1815-12-10"
        onChange={(value) => {
          reported = value;
        }}
      />,
    );
    const input = host.querySelector('input');
    expect(input?.type).toBe('date');
    expect(input?.value).toBe('1815-12-10');
    if (input === null) throw new Error('test fixture bug: no input');
    change(input, '2001-02-03');
    expect(reported).toBe('2001-02-03');
  });
});
