import { dishNames, resolveLicence } from '../lib/commons-photography.ts';

/**
 * The two parts of the acquisition that can be checked without a network.
 *
 * Both are worth pinning. The licence resolver decides whether a photograph
 * may be published at all, and it is the only thing standing between a
 * non-commercial upload and a commercial app — an answer of `null` is the
 * whole safety property. The name builder decides what gets searched for,
 * which is most of whether the picture is of the right dish.
 *
 * This file also exists because the acquisition was extracted from
 * `fetch-recipe-images.ts` so a second driver could share it. An extraction
 * with no test is a refactor nobody can prove did not change behaviour.
 */

describe('which licences may be published', () => {
  it('accepts the machine-readable tags Commons actually emits', () => {
    for (const [tag, spdx] of [
      ['cc0', 'CC0-1.0'],
      ['pd', 'CC0-1.0'],
      ['cc-by-2.0', 'CC-BY-2.0'],
      ['cc-by-4.0', 'CC-BY-4.0'],
      ['cc-by-sa-3.0', 'CC-BY-SA-3.0'],
      ['cc-by-sa-4.0', 'CC-BY-SA-4.0'],
    ] as const) {
      expect({ tag, spdx: resolveLicence(tag, '')?.spdx ?? null }).toEqual({ tag, spdx });
    }
  });

  it('takes the most recent version of a multi-licensed file', () => {
    // The uploader offered all of them and we may pick any; the first is newest.
    expect(resolveLicence('cc-by-sa-3.0,2.5,2.0,1.0', '')?.spdx).toBe('CC-BY-SA-3.0');
    expect(resolveLicence('cc-by-2.0,1.0', '')?.spdx).toBe('CC-BY-2.0');
  });

  it('reads the public-domain family, which is a family rather than a tag', () => {
    for (const tag of ['pd-old-100', 'pd-us', 'pd-self', 'pdm-owner', 'pd']) {
      expect({ tag, spdx: resolveLicence(tag, '')?.spdx ?? null }).toEqual({ tag, spdx: 'CC0-1.0' });
    }
  });

  it('falls back to the human string for the older files carrying no machine tag', () => {
    expect(resolveLicence('', 'CC BY-SA 4.0')?.spdx).toBe('CC-BY-SA-4.0');
    expect(resolveLicence('', 'CC BY 2.0')?.spdx).toBe('CC-BY-2.0');
    expect(resolveLicence('', 'Public domain')?.spdx).toBe('CC0-1.0');
    expect(resolveLicence('', 'CC0')?.spdx).toBe('CC0-1.0');
  });

  it('REFUSES everything else, which is the point of the allowlist', () => {
    // A licence we have not heard of is one we have not read. Each of these is
    // a real Commons tag, and publishing under any of them in a commercial app
    // is a licence breach rather than an untidy manifest.
    for (const tag of [
      'cc-by-nc-4.0',
      'cc-by-nc-sa-3.0',
      'cc-by-nd-4.0',
      'fairuse',
      'copyrighted',
      'attribution',
      'gfdl',
      '',
      'cc-by-sa-9.9',
    ]) {
      expect({ tag, licence: resolveLicence(tag, '') }).toEqual({ tag, licence: null });
    }
  });

  it('does not let a non-commercial human string sneak past the machine tag', () => {
    expect(resolveLicence('cc-by-nc-4.0', 'CC BY-NC 4.0')).toBeNull();
    expect(resolveLicence('', 'CC BY-NC-SA 3.0')).toBeNull();
  });

  it('records attribution as owed by everything except public domain', () => {
    expect(resolveLicence('cc-by-sa-4.0', '')?.needsAttribution).toBe(true);
    expect(resolveLicence('cc-by-2.0', '')?.needsAttribution).toBe(true);
    expect(resolveLicence('cc0', '')?.needsAttribution).toBe(false);
    expect(resolveLicence('pd-old-100', '')?.needsAttribution).toBe(false);
  });
});

describe('what gets searched for', () => {
  const subject = (over: Partial<Parameters<typeof dishNames>[0]>) =>
    dishNames({ slug: 'koshari', title: 'Koshari', ingredientText: '', ...over });

  it('searches the dish name before the English gloss', () => {
    // `aloo-gobi` is the dish; "Potato and Cauliflower Curry" is a gloss
    // written so an Egyptian cook knows what they are getting. Searching the
    // gloss finds pictures of curry.
    expect(subject({ slug: 'aloo-gobi', title: 'Potato and Cauliflower Curry' })).toEqual([
      'aloo gobi',
      'Potato and Cauliflower Curry',
    ]);
  });

  it('drops a trailing qualifier that describes our version rather than the dish', () => {
    expect(subject({ slug: 'butter-chicken-light', title: 'Tomato and Yogurt Chicken' })).toEqual([
      'butter chicken light',
      'butter chicken',
      'Tomato and Yogurt Chicken',
    ]);
  });

  it('keeps a qualifier that is the whole name', () => {
    // `fried` is a qualifier, but a one-word slug has nothing left underneath.
    expect(subject({ slug: 'fried', title: 'Fried' })).toEqual(['fried', 'Fried']);
  });

  it('puts a candidate’s own search names between the slug and the gloss', () => {
    expect(
      subject({
        slug: 'qamar-el-din',
        title: 'Apricot Nectar',
        searchNames: ['Qamar al-Din', 'Apricot leather drink'],
      }),
    ).toEqual(['qamar el din', 'Qamar al-Din', 'Apricot leather drink', 'Apricot Nectar']);
  });

  it('leaves a recipe unchanged by the field recipes do not set', () => {
    // Production passes no search names, so the extraction must not have
    // changed what a recipe searches for.
    expect(subject({ slug: 'basbousa', title: 'Semolina Cake in Syrup' })).toEqual([
      'basbousa',
      'Semolina Cake in Syrup',
    ]);
  });

  it('strips punctuation out of a title', () => {
    expect(subject({ slug: 'pico-de-gallo', title: 'Fresh Tomato Salsa!' })).toEqual([
      'pico de gallo',
      'Fresh Tomato Salsa',
    ]);
  });

  it('de-duplicates by exact spelling, so a title that only differs in case survives', () => {
    // Asserted as it is rather than as it ought to be. `koshari` and `Koshari`
    // are the same lookup — MediaWiki capitalises the first letter of every
    // title — so this costs one redundant request per such recipe. It is not
    // fixed here because this file exists to prove the extraction changed
    // nothing, and quietly improving the thing being extracted is how a
    // refactor stops being checkable. It is a real, small waste of the request
    // budget and belongs in its own change.
    expect(subject({ slug: 'koshari', title: 'Koshari' })).toEqual(['koshari', 'Koshari']);
  });
});
