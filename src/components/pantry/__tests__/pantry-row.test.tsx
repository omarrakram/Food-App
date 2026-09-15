import { render, screen } from '@testing-library/react-native';
import type { ReactNode } from 'react';

import { PantryRow } from '@/components/pantry/pantry-row';
import { I18nProvider } from '@/i18n';
import { ThemeProvider } from '@/theme';
import type { PantryItem } from '@/types/domain';

/**
 * WHAT A PANTRY ROW SAYS ABOUT HOW MUCH OF SOMETHING THERE IS.
 *
 * THE BUG THIS EXISTS FOR: a row rendered
 *
 *     rice
 *     g
 *     2 days left
 *
 * `formatQuantity(null, 'g')` returned the bare unit label, so an item with a
 * unit and no amount printed the suffix on its own. "g" is not a quantity and
 * tells the reader nothing they can act on.
 *
 * Rendered rather than asserted against the formatter, because the formatter
 * was only half of it: the row also has to decide between saying nothing and
 * saying something deliberate, and that decision lives here.
 */

jest.mock('@expo/vector-icons', () => ({ Ionicons: () => null }));

function wrap(node: ReactNode) {
  return (
    <ThemeProvider>
      <I18nProvider>{node}</I18nProvider>
    </ThemeProvider>
  );
}

function item(overrides: Partial<PantryItem> = {}): PantryItem {
  return {
    id: 'p1',
    ingredientName: 'rice',
    category: 'carbs',
    quantity: null,
    unit: null,
    expiresOn: null,
    isStaple: false,
    addedAt: '2026-09-01T00:00:00.000Z',
    ...overrides,
  } as PantryItem;
}

// `render` is asynchronous in RNTL v14; `screen` is not populated until it
// settles, and an un-awaited one reads as "render has not been called".
async function renderRow(overrides: Partial<PantryItem> = {}) {
  await render(wrap(<PantryRow item={item(overrides)} onPress={() => {}} onRemove={() => {}} />));
}

const NAKED_UNITS = ['g', 'ml', 'kg', 'l', 'piece'] as const;

afterEach(async () => {
  // One macrotask, so anything a component scheduled on its way out — a
  // press animation, a batched state notification — fires before Jest tears
  // the environment down and calls the pending timer a leak.
  await new Promise((resolve) => setTimeout(resolve, 0));
});


describe('PantryRow quantity', () => {
  it('shows the amount and its unit when both are there', async () => {
    await renderRow({ quantity: 500, unit: 'g' });
    expect(screen.getByTestId('pantry-row-quantity')).toHaveTextContent('500 g');
  });

  it('formats a count without inventing a unit for it', async () => {
    // "3 onions", never "3 pieces onions" — `piece` is deliberately unlabelled.
    await renderRow({ quantity: 3, unit: 'piece' });
    expect(screen.getByTestId('pantry-row-quantity')).toHaveTextContent('3');
  });

  it.each(NAKED_UNITS)('never renders a naked "%s"', async (unit) => {
    await renderRow({ quantity: null, unit });
    const text = screen.getByTestId('pantry-row-quantity').props.children;
    expect(String(text).trim()).toBe('Quantity not set');
  });

  it('says so deliberately when a tracked item has no amount', async () => {
    await renderRow({ quantity: null, unit: 'g', expiresOn: '2026-09-17T00:00:00.000Z' });
    expect(screen.getByTestId('pantry-row-quantity')).toHaveTextContent('Quantity not set');
  });

  it('stays quiet for a staple, whose whole point is having no amount', async () => {
    await renderRow({ quantity: null, unit: 'g', isStaple: true });
    expect(screen.queryByTestId('pantry-row-quantity')).toBeNull();
  });

  it('reads the same to a screen reader as it does on screen', async () => {
    await renderRow({ quantity: null, unit: 'g' });
    expect(screen.getByLabelText('rice, Quantity not set')).toBeTruthy();
  });

  it('puts no quantity phrase in the label when there is nothing to say', async () => {
    await renderRow({ quantity: null, unit: null, isStaple: true });
    expect(screen.getByLabelText('rice')).toBeTruthy();
  });
});
