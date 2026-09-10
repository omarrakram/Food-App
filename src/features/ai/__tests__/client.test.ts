import { budgetBandFor } from '../client';

describe('budgetBandFor', () => {
  it('classifies a budget by per-serving spend', () => {
    // 40 EGP for two people is 20 a head -> low.
    expect(budgetBandFor(4000, 2)).toBe('low');
    // 150 EGP for two is 75 a head -> medium.
    expect(budgetBandFor(15000, 2)).toBe('medium');
    // 400 EGP for two is 200 a head -> high.
    expect(budgetBandFor(40000, 2)).toBe('high');
  });

  it('treats the band boundaries as inclusive at the low end', () => {
    // Exactly 30 a head is still a tight budget, not a middling one.
    expect(budgetBandFor(6000, 2)).toBe('low');
    expect(budgetBandFor(6001, 2)).toBe('medium');
    // Exactly 100 a head is a treat.
    expect(budgetBandFor(20000, 2)).toBe('high');
    expect(budgetBandFor(19999, 2)).toBe('medium');
  });

  it('scales with servings, not just the total', () => {
    // The same 150 EGP feeding six is a tight budget, not a mid one.
    expect(budgetBandFor(15000, 6)).toBe('low');
  });

  it('returns null when there is no budget', () => {
    expect(budgetBandFor(null, 2)).toBeNull();
  });

  it('guards against a zero serving count', () => {
    expect(budgetBandFor(15000, 0)).toBeNull();
  });

  it('never returns a currency amount', () => {
    // The whole point: the model is told a band, never a figure, so it cannot
    // start quoting prices the app has not calculated.
    const band = budgetBandFor(12345, 3);
    expect(['low', 'medium', 'high']).toContain(band);
  });
});
