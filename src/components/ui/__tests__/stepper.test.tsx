import { fireEvent, render } from '@/test-utils/render';

import { Stepper } from '../stepper';

/**
 * TESTING NOTE: at most ONE `fireEvent.press` per test.
 *
 * `PressScale` drives a Reanimated spring on press. Under Reanimated 4's Jest
 * mock combined with RNTL v14's asynchronous `render`, a second press inside
 * the same test leaves state behind that makes every later render in the file
 * resolve to an empty tree — the symptom is a baffling "unable to find" on an
 * element the component definitely renders. Splitting presses across tests
 * avoids it entirely.
 */
describe('Stepper', () => {
  it('increments', async () => {
    const onChange = jest.fn();
    const view = await render(
      <Stepper value={4} onChange={onChange} accessibilityLabel="Servings" testID="stepper" />,
    );

    fireEvent.press(view.getByTestId('stepper-increment'));
    expect(onChange).toHaveBeenCalledWith(5);
  });

  it('decrements', async () => {
    const onChange = jest.fn();
    const view = await render(
      <Stepper value={4} onChange={onChange} accessibilityLabel="Servings" testID="stepper" />,
    );

    fireEvent.press(view.getByTestId('stepper-decrement'));
    expect(onChange).toHaveBeenCalledWith(3);
  });

  it('respects a custom step', async () => {
    const onChange = jest.fn();
    const view = await render(
      <Stepper
        value={10}
        step={5}
        onChange={onChange}
        accessibilityLabel="Servings"
        testID="stepper"
      />,
    );

    fireEvent.press(view.getByTestId('stepper-increment'));
    expect(onChange).toHaveBeenCalledWith(15);
  });

  it('will not step below the minimum', async () => {
    const onChange = jest.fn();

    const atMin = await render(
      <Stepper
        value={1}
        min={1}
        max={12}
        onChange={onChange}
        accessibilityLabel="Servings"
        testID="min"
      />,
    );

    const decrement = atMin.getByTestId('min-decrement');
    expect(decrement.props.accessibilityState).toMatchObject({ disabled: true });
    expect(atMin.getByTestId('min-increment').props.accessibilityState).toMatchObject({
      disabled: false,
    });

    fireEvent.press(decrement);
    expect(onChange).not.toHaveBeenCalled();
  });

  it('will not step above the maximum', async () => {
    const onChange = jest.fn();

    const atMax = await render(
      <Stepper
        value={12}
        min={1}
        max={12}
        onChange={onChange}
        accessibilityLabel="Servings"
        testID="max"
      />,
    );

    const increment = atMax.getByTestId('max-increment');
    expect(increment.props.accessibilityState).toMatchObject({ disabled: true });

    fireEvent.press(increment);
    expect(onChange).not.toHaveBeenCalled();
  });

  it('shows the value, an optional suffix, and announces both', async () => {
    const plain = await render(
      <Stepper value={4} onChange={jest.fn()} accessibilityLabel="Servings" testID="plain" />,
    );

    expect(plain.getByText('4')).toBeTruthy();
    // The group is announced as one element, so the label carries the value.
    expect(plain.getByTestId('plain').props.accessibilityLabel).toBe('Servings: 4');

    const suffixed = await render(
      <Stepper
        value={3}
        onChange={jest.fn()}
        suffix="servings"
        accessibilityLabel="Servings"
        testID="suffixed"
      />,
    );

    expect(suffixed.getByText('3 servings')).toBeTruthy();
  });
});
