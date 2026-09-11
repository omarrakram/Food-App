import { render } from '@/test-utils/render';

import { Button } from '../button';
import { Chip } from '../chip';

/**
 * Regression guard for a bug found by running the app: `PressScale` applies its
 * animated style LAST in the style array, so an `opacity` a caller set for the
 * disabled state was silently overridden and every disabled control rendered
 * at full strength. The dim now composes into the same animated value.
 */
describe('disabled controls look disabled', () => {
  /** Reads the effective opacity from a flattened RN style array. */
  const opacityOf = (node: { props: { style?: unknown } }): number | undefined => {
    const flatten = (value: unknown): number | undefined => {
      if (Array.isArray(value)) {
        return value.reduce<number | undefined>(
          (found, entry) => flatten(entry) ?? found,
          undefined,
        );
      }
      if (value && typeof value === 'object' && 'opacity' in value) {
        return (value as { opacity?: number }).opacity;
      }
      return undefined;
    };
    return flatten(node.props.style);
  };

  it('dims a disabled Button', async () => {
    const view = await render(
      <Button label="Continue" onPress={jest.fn()} disabled testID="cta" />,
    );

    expect(opacityOf(view.getByTestId('cta'))).toBeLessThan(1);
  });

  it('leaves an enabled Button at full strength', async () => {
    const view = await render(<Button label="Continue" onPress={jest.fn()} testID="cta" />);

    expect(opacityOf(view.getByTestId('cta'))).toBe(1);
  });

  it('dims a disabled Chip', async () => {
    const view = await render(
      <Chip label="Vegan" onPress={jest.fn()} disabled testID="chip" />,
    );

    expect(opacityOf(view.getByTestId('chip'))).toBeLessThan(1);
  });
});
