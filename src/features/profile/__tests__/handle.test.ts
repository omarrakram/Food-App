import {
  BIO_MAX_LENGTH,
  handleKey,
  handlesCollide,
  normaliseHandleInput,
  validateBio,
  validateHandle,
} from '../handle';

/**
 * Handles.
 *
 * These rules restate what the database enforces, so the tests are written
 * against the same cases `03_profile_privacy_test.sql` asserts in SQL. If the
 * two ever disagree the database wins — but they should not disagree, and a
 * failure here is the cheap place to find out.
 */

describe('the folded key', () => {
  it('ignores case', () => {
    expect(handleKey('OmarHassan')).toBe('omarhassan');
  });

  it('ignores dots and underscores', () => {
    // THE property. `omar.hassan`, `omar_hassan` and `omarhassan` are three
    // registrations that let one person be mistaken for another in a friend
    // request, and the person impersonated has no way to notice.
    expect(handleKey('omar.hassan')).toBe('omarhassan');
    expect(handleKey('omar_hassan')).toBe('omarhassan');
    expect(handleKey('o.m.a.r_h.a.s.s.a.n')).toBe('omarhassan');
  });

  it('says which handles collide', () => {
    expect(handlesCollide('omar.hassan', 'Omar_Hassan')).toBe(true);
    expect(handlesCollide('omar.hassan', 'omarhassan2')).toBe(false);
  });

  it('keeps digits, which are the one thing that does distinguish handles', () => {
    expect(handlesCollide('chef1', 'chef2')).toBe(false);
  });
});

describe('what the field lets someone type', () => {
  it('lowercases and drops what the format forbids', () => {
    expect(normaliseHandleInput('  Omar Hassan!  ')).toBe('omarhassan');
    expect(normaliseHandleInput('شيف')).toBe('');
  });

  it('preserves the separators the user chose', () => {
    // Stripping them here would silently rewrite someone's chosen handle. They
    // only matter for collision detection, not for display.
    expect(normaliseHandleInput('omar.hassan_1')).toBe('omar.hassan_1');
  });

  it('never lets the field exceed the maximum', () => {
    expect(normaliseHandleInput('a'.repeat(80))).toHaveLength(30);
  });
});

describe('validation', () => {
  it.each(['omar', 'omar.hassan', 'omar_hassan', 'chef2026', 'a1b'])('accepts %s', (handle) => {
    expect(validateHandle(handle)).toBeNull();
  });

  it('rejects one that is too short', () => {
    expect(validateHandle('ab')).toBe('profile.handle.tooShort');
  });

  it('rejects one that is too long', () => {
    expect(validateHandle('a'.repeat(31))).toBe('profile.handle.tooLong');
  });

  it('rejects an empty one distinctly from a short one', () => {
    // Different messages: one is "you have not chosen yet", the other is "what
    // you chose will not work".
    expect(validateHandle('   ')).toBe('profile.handle.required');
  });

  it.each(['Omar', 'omar hassan', 'omar-hassan', 'omar@hassan', '.omar', '_omar', 'عمر'])(
    'rejects %s',
    (handle) => {
      expect(validateHandle(handle)).toBe('profile.handle.invalidCharacters');
    },
  );

  it('rejects a handle that folds away to nothing', () => {
    // `..._...` passes the character check and the length check, folds to the
    // empty string, and would then collide with every other such handle while
    // rendering as blank wherever it is shown.
    expect(validateHandle('a._._.')).toBe('profile.handle.tooShort');
  });
});

describe('bios', () => {
  it('accepts one at the limit', () => {
    expect(validateBio('x'.repeat(BIO_MAX_LENGTH))).toBeNull();
  });

  it('rejects one past it', () => {
    expect(validateBio('x'.repeat(BIO_MAX_LENGTH + 1))).toBe('profile.handle.bioTooLong');
  });

  it('accepts an empty bio, which is the normal state', () => {
    expect(validateBio('')).toBeNull();
  });
});
