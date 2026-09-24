import { formatEgyptianPhone, isE164, toE164Egyptian } from '../phone';

/**
 * The number that finds the door.
 *
 * A delivery phone that is wrong is a courier standing in the street. These
 * tests are the shapes an Egyptian actually types, and the ones that must be
 * refused rather than stored hopefully.
 */

describe('what an Egyptian would type', () => {
  it.each([
    ['0100 123 4567', '+201001234567'],
    ['01001234567', '+201001234567'],
    ['1001234567', '+201001234567'],
    ['+20 100 123 4567', '+201001234567'],
    ['+201001234567', '+201001234567'],
    ['00201001234567', '+201001234567'],
    ['0100-123-4567', '+201001234567'],
    ['  01001234567  ', '+201001234567'],
  ])('%s → %s', (input, expected) => {
    expect(toE164Egyptian(input)).toBe(expected);
  });

  it('accepts all four networks', () => {
    for (const prefix of ['010', '011', '012', '015']) {
      expect(toE164Egyptian(`${prefix}01234567`)).toBe(`+2${prefix}01234567`);
    }
  });
});

describe('what must be refused rather than stored hopefully', () => {
  it.each([
    ['', 'empty'],
    ['   ', 'blank'],
    ['0123456', 'too short'],
    ['010012345678', 'too long'],
    ['0131234567', '013 is not an Egyptian mobile network'],
    ['0221234567', 'a Cairo landline — nobody is standing next to it'],
    ['abcdefghijk', 'not a number at all'],
    ['+441234567890', 'a UK number'],
  ])('%s — %s', (input) => {
    expect(toE164Egyptian(input)).toBeNull();
  });
});

describe('showing it back', () => {
  it('reads the way the owner would say it', () => {
    expect(formatEgyptianPhone('+201001234567')).toBe('0100 123 4567');
  });

  it('leaves a number it does not recognise alone rather than mangling it', () => {
    expect(formatEgyptianPhone('+441234567890')).toBe('+441234567890');
  });

  it('round-trips', () => {
    const stored = toE164Egyptian('0111 987 6543');
    expect(stored).not.toBeNull();
    expect(toE164Egyptian(formatEgyptianPhone(stored!))).toBe(stored);
  });
});

describe('the stored shape', () => {
  it('recognises E.164', () => {
    expect(isE164('+201001234567')).toBe(true);
    expect(isE164('01001234567')).toBe(false);
    expect(isE164('+0201234567')).toBe(false);
  });
});
