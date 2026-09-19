import { fireEvent, waitFor } from '@testing-library/react-native';
import { useState } from 'react';

import { render } from '@/test-utils/render';
import type { PantryItem } from '@/types/domain';

import { IngredientPicker } from '../ingredient-picker';

/**
 * The fastest path in the product: search → tap → search → tap → find meals.
 *
 * Every test here is that sentence taken literally. The thing they mostly
 * guard is that a tap does NOT rearrange the list under the user's thumb —
 * the previous picker removed a selected ingredient from its own results,
 * which meant the row you had just pressed vanished and the one beneath it
 * moved up into your finger.
 */

/** Drives the picker the way a screen does, so selection is real state. */
function Harness({
  pantryItems = [],
  recent = [],
  initial = [],
  onSelected,
}: {
  pantryItems?: readonly PantryItem[];
  recent?: readonly string[];
  initial?: string[];
  onSelected?: (next: string[]) => void;
}) {
  const [selected, setSelected] = useState<string[]>(initial);
  return (
    <IngredientPicker
      selected={selected}
      onChange={(next) => {
        setSelected(next);
        onSelected?.(next);
      }}
      pantryItems={pantryItems}
      recent={recent}
      testID="picker"
    />
  );
}

/** The picker only reads `ingredientName`; the rest is shape, not substance. */
function pantryItem(id: string, ingredientName: string): PantryItem {
  return {
    id,
    userId: 'test-user',
    ingredientId: id,
    ingredientName,
    category: 'vegetables',
    quantity: null,
    unit: null,
    expiresOn: null,
    isStaple: false,
    outOfStock: false,
    note: null,
    createdAt: '2026-01-01T00:00:00.000Z',
    updatedAt: '2026-01-01T00:00:00.000Z',
  } as unknown as PantryItem;
}

describe('IngredientPicker', () => {
  it('searches and selects with a single tap', async () => {
    const view = await render(<Harness />);

    fireEvent.changeText(view.getByTestId('ingredient-input'), 'tomato');
    const row = await view.findByTestId('autocomplete-tomatoes');
    fireEvent.press(row);

    expect(await view.findByTestId('selected-tomato')).toBeTruthy();
  });

  it('keeps a selected result IN the list, so the list never reflows under a thumb', async () => {
    const view = await render(<Harness />);

    fireEvent.changeText(view.getByTestId('ingredient-input'), 'tomato');
    fireEvent.press(await view.findByTestId('autocomplete-tomatoes'));

    // The row is still there after being chosen — this is the regression.
    expect(view.getByTestId('autocomplete-tomatoes')).toBeTruthy();
  });

  it('deselects by tapping the same row again', async () => {
    const view = await render(<Harness />);

    fireEvent.changeText(view.getByTestId('ingredient-input'), 'tomato');
    fireEvent.press(await view.findByTestId('autocomplete-tomatoes'));
    expect(await view.findByTestId('selected-tomato')).toBeTruthy();

    fireEvent.press(view.getByTestId('autocomplete-tomatoes'));
    await waitFor(() => expect(view.queryByTestId('selected-tomato')).toBeNull());
  });

  it('removes from the selected rail', async () => {
    const view = await render(<Harness initial={['tomato']} />);

    fireEvent.press(view.getByTestId('selected-tomato'));
    await waitFor(() => expect(view.queryByTestId('selected-tomato')).toBeNull());
  });

  it('takes several rapid selections without losing any', async () => {
    const seen: string[][] = [];
    const view = await render(<Harness onSelected={(next) => seen.push(next)} />);

    // Three taps into one result list, with no re-query between them: this is
    // the real gesture — a list is open and the thumb goes down the rows —
    // and it is the case where each tap must build on the last rather than
    // race it off a stale copy of the selection.
    fireEvent.changeText(view.getByTestId('ingredient-input'), 'tomato');
    for (const id of ['autocomplete-tomatoes', 'autocomplete-tomato-paste', 'autocomplete-cherry-tomato']) {
      fireEvent.press(await view.findByTestId(id));
    }

    const last = seen.at(-1) ?? [];
    expect(last).toHaveLength(3);
    expect(new Set(last).size).toBe(3);
  });

  it('offers a way forward when the catalogue knows nothing', async () => {
    const view = await render(<Harness />);

    fireEvent.changeText(view.getByTestId('ingredient-input'), 'zzzqqq');
    expect(await view.findByTestId('ingredient-no-results')).toBeTruthy();

    // The engine has always accepted a free-text ingredient; the screen used
    // to render nothing at all and look broken.
    fireEvent.press(view.getByTestId('ingredient-add-anyway'));
    expect(await view.findByTestId('selected-zzzqqq')).toBeTruthy();
  });

  it('surfaces pantry items without mutating the pantry', async () => {
    const items = [pantryItem('p1', 'tomato'), pantryItem('p2', 'onion')];
    const view = await render(<Harness pantryItems={items} />);

    fireEvent.press(await view.findByTestId('pantry-suggest-add-all'));

    expect(await view.findByTestId('selected-tomato')).toBeTruthy();
    expect(view.getByTestId('selected-onion')).toBeTruthy();
    // The props are the pantry. Nothing here writes to it.
    expect(items).toHaveLength(2);
  });

  it('shows last time\'s ingredients only when there are some', async () => {
    const empty = await render(<Harness recent={[]} />);
    expect(empty.queryByTestId('recent-tomato')).toBeNull();

    const withHistory = await render(<Harness recent={['tomato']} />);
    expect(await withHistory.findByTestId('recent-tomato')).toBeTruthy();
  });

  it('browses by category without showing the whole catalogue up front', async () => {
    const view = await render(<Harness />);

    // Nothing expanded until a category is chosen.
    expect(view.queryByTestId('category-list-protein')).toBeNull();

    fireEvent.press(view.getByTestId('category-protein'));
    expect(await view.findByTestId('category-list-protein')).toBeTruthy();

    // And it collapses again, so browsing cannot strand the user in a list.
    fireEvent.press(view.getByTestId('category-protein'));
    await waitFor(() => expect(view.queryByTestId('category-list-protein')).toBeNull());
  });

  it('finds an ingredient by its Arabic name', async () => {
    const view = await render(<Harness />);

    // The catalogue carries `nameAr` and Arabic aliases, and `searchIngredients`
    // scores against both. Typing Arabic into the field has to reach them —
    // this is the launch market's default input method, not an edge case.
    fireEvent.changeText(view.getByTestId('ingredient-input'), 'طماطم');
    expect(await view.findByTestId('autocomplete-tomatoes')).toBeTruthy();
  });

  it('selects the same ingredient whichever language it was typed in', async () => {
    const seen: string[][] = [];
    const view = await render(<Harness onSelected={(next) => seen.push(next)} />);

    fireEvent.changeText(view.getByTestId('ingredient-input'), 'طماطم');
    fireEvent.press(await view.findByTestId('autocomplete-tomatoes'));

    // Names are stored canonically in English so matching stays
    // language-blind; an Arabic tap must not create a second, parallel
    // ingredient the engine cannot match.
    expect(seen.at(-1)).toEqual(['tomatoes']);
  });

  it('never asks for a quantity while choosing ingredients', async () => {
    const view = await render(<Harness initial={['tomato']} />);

    // Quantity is optional to the engine and belongs to Pantry. A stepper here
    // is what turns a picker into inventory software.
    expect(view.queryByTestId('filter-servings')).toBeNull();
    expect(view.queryByText('Quantity')).toBeNull();
  });
});
