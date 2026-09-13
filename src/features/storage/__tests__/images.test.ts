import {
  objectPath,
  targetSize,
  UPLOAD_RULES,
  validateImage,
  type PickedImage,
} from '../images';

/**
 * The rules an image has to satisfy before it is uploaded.
 *
 * These restate what the Storage buckets enforce, so a failure here usually
 * means the two have drifted apart. The bucket is the authority; this exists
 * so a user finds out before spending thirty seconds on an upload that was
 * never going to be accepted.
 */

function picked(overrides: Partial<PickedImage> = {}): PickedImage {
  return {
    uri: 'file:///tmp/photo.heic',
    width: 3024,
    height: 4032,
    mimeType: 'image/jpeg',
    fileSize: 900_000,
    ...overrides,
  };
}

describe('what may be uploaded', () => {
  it('accepts an ordinary phone photo', () => {
    expect(validateImage(picked(), 'avatar')).toBeNull();
  });

  it.each(['image/gif', 'image/svg+xml', 'application/pdf', 'text/html'])(
    'rejects %s',
    (mimeType) => {
      expect(validateImage(picked({ mimeType }), 'avatar')).toBe('unsupported_type');
    },
  );

  it('rejects a missing mime type rather than guessing', () => {
    // The picker only omits it in cases we would rather not assume about, and
    // "probably a JPEG" is not a decision worth making on an upload path.
    expect(validateImage(picked({ mimeType: null }), 'avatar')).toBe('unsupported_type');
    expect(validateImage(picked({ mimeType: undefined }), 'avatar')).toBe('unsupported_type');
  });

  it('rejects a file over the bucket limit', () => {
    const over = UPLOAD_RULES.avatar.maxBytes + 1;
    expect(validateImage(picked({ fileSize: over }), 'avatar')).toBe('too_large');
    // The same file is fine as a recipe photo — that bucket allows more.
    expect(validateImage(picked({ fileSize: over }), 'recipe')).toBeNull();
  });

  it('judges size on the ORIGINAL, before any re-encoding', () => {
    // Checking afterwards would accept an arbitrarily large input as long as
    // it happened to compress well — and by then the expensive part is done.
    const huge = picked({ fileSize: 60 * 1024 * 1024 });
    expect(validateImage(huge, 'recipe')).toBe('too_large');
  });

  it('rejects an image too small to be worth showing', () => {
    expect(validateImage(picked({ width: 40, height: 40 }), 'avatar')).toBe('too_small');
    expect(validateImage(picked({ width: 200, height: 200 }), 'recipe')).toBe('too_small');
  });

  it.each([
    { width: 0, height: 100 },
    { width: 100, height: 0 },
    { width: Number.NaN, height: 100 },
    { width: 100, height: Number.POSITIVE_INFINITY },
  ])('rejects unreadable dimensions %p', (dimensions) => {
    expect(validateImage(picked(dimensions), 'avatar')).toBe('unreadable');
  });

  it('checks the type before the size, so the message names the real problem', () => {
    const both = picked({ mimeType: 'image/gif', fileSize: 50 * 1024 * 1024 });
    expect(validateImage(both, 'avatar')).toBe('unsupported_type');
  });
});

describe('resizing', () => {
  it('shrinks the longest edge to the limit and keeps the ratio', () => {
    const size = targetSize({ width: 4000, height: 3000 }, 'recipe');
    expect(size.width).toBe(1600);
    expect(size.height).toBe(1200);
  });

  it('handles portrait as well as landscape', () => {
    const size = targetSize({ width: 3000, height: 4000 }, 'recipe');
    expect(size.height).toBe(1600);
    expect(size.width).toBe(1200);
  });

  it('never upscales', () => {
    // Adds bytes and no detail, and makes a bad photo look worse.
    const size = targetSize({ width: 200, height: 150 }, 'recipe');
    expect(size).toEqual({ width: 200, height: 150 });
  });

  it('gives an avatar a much smaller budget than a recipe photo', () => {
    const avatar = targetSize({ width: 4000, height: 4000 }, 'avatar');
    const recipe = targetSize({ width: 4000, height: 4000 }, 'recipe');
    expect(avatar.width).toBeLessThan(recipe.width);
  });

  it('never produces a zero dimension for an extreme aspect ratio', () => {
    const size = targetSize({ width: 8000, height: 3 }, 'recipe');
    expect(size.width).toBe(1600);
    expect(size.height).toBeGreaterThanOrEqual(1);
  });
});

describe('the object path', () => {
  const USER = '11111111-1111-4111-8111-111111111111';
  const TOKEN = 'abcdef123456';

  it('puts the file in the owner’s folder, which is what the policy reads', () => {
    expect(objectPath(USER, 'avatar', TOKEN)).toBe(`${USER}/avatar-${TOKEN}.jpg`);
  });

  it('never uses the name the user’s device supplied', () => {
    // Not sanitised — not used. `fileName` is attacker-controlled text that
    // would end up in a URL, a Content-Disposition header, and a path a
    // storage policy parses to decide ownership.
    const path = objectPath(USER, 'recipe', TOKEN);
    expect(path).not.toContain('photo');
    expect(path).toMatch(/^[0-9a-f-]{36}\/recipe-[A-Za-z0-9-]+\.jpg$/);
  });

  it('refuses a user id that is not a uuid', () => {
    // A path segment is what decides ownership, so anything that could contain
    // a slash, a traversal or a wildcard must never reach it.
    for (const bad of ['../other', 'someone/else', '*', '', 'admin']) {
      expect(() => objectPath(bad, 'avatar', TOKEN)).toThrow();
    }
  });

  it('refuses a token that is not a plain generated identifier', () => {
    for (const bad of ['../escape', 'a/b', 'short', 'has space', 'semi;colon']) {
      expect(() => objectPath(USER, 'avatar', bad)).toThrow();
    }
  });

  it('always ends in .jpg, because everything is re-encoded', () => {
    // Re-encoding is what strips EXIF, and an avatar is the most likely thing
    // in this app to be published with someone's home address attached.
    expect(objectPath(USER, 'avatar', TOKEN).endsWith('.jpg')).toBe(true);
    expect(objectPath(USER, 'recipe', TOKEN).endsWith('.jpg')).toBe(true);
  });
});

describe('the client rules match the buckets', () => {
  it('names the bucket each kind uploads to', () => {
    expect(UPLOAD_RULES.avatar.bucket).toBe('avatars');
    // Not `recipe-images`: a community photo goes to the private bucket and is
    // only copied into the published one once a moderator approves it.
    expect(UPLOAD_RULES.recipe.bucket).toBe('recipe-uploads');
  });

  it('mirrors the file size limits the migration sets', () => {
    expect(UPLOAD_RULES.avatar.maxBytes).toBe(2 * 1024 * 1024);
    expect(UPLOAD_RULES.recipe.maxBytes).toBe(8 * 1024 * 1024);
  });
});
