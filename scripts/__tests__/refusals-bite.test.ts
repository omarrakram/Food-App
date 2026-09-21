/**
 * A refusal has to stop the FETCHER, not just the gate.
 *
 * `data/images/rejected.json` is written by hand during review, and which
 * spelling of a Commons file lands in it depends on whether the reviewer
 * copied the page title (`File:Chickens in market.jpg`) or the link
 * (`File:Chickens_in_market.jpg`, sometimes percent-escaped). Both name the
 * same file.
 *
 * The fetcher used to look up `candidate.title.toLowerCase()` against the raw
 * stored string, so only the API's own spelling ever matched. Fifteen of the
 * sixty-one refusals — every one recorded during batch 3, all copied from
 * source-page URLs — matched nothing, and batch 4's acquisition walked
 * straight back to a butcher's window of raw poultry that had been refused a
 * batch earlier. The validators caught it, because they normalised before
 * comparing; but a refusal that only bites at the gate has already cost a run.
 *
 * So: one `commonsKey`, used by the fetcher and both validators, and this
 * test, which asserts every entry on the list is reachable through it from
 * every spelling Commons uses.
 */
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

import { commonsKey, rejectedTitles } from '../lib/commons-photography.ts';

const ROOT = join(__dirname, '..', '..');
const REJECTED = join(ROOT, 'data', 'images', 'rejected.json');

const raw = JSON.parse(readFileSync(REJECTED, 'utf8')) as {
  files: { title: string; rejectedFor: string; reason: string }[];
};
const refused = rejectedTitles(REJECTED);

describe('every refusal reaches the fetcher', () => {
  it('has refusals to check', () => {
    expect(raw.files.length).toBeGreaterThan(50);
    expect(refused.size).toBeGreaterThan(50);
  });

  it('matches the stored spelling, whichever it is', () => {
    const unreachable = raw.files
      .filter((entry) => !refused.has(commonsKey(entry.title)))
      .map((entry) => entry.title);

    expect(unreachable).toEqual([]);
  });

  it('matches the same file spelled the other three ways', () => {
    // How the API returns it, how a source-page URL spells it, how an
    // original-file URL spells it, and percent-escaped.
    const unreachable: string[] = [];
    for (const entry of raw.files) {
      // Start from the DECODED name, or re-encoding an already-escaped stored
      // title produces `%2526` — a spelling Commons never emits, and a
      // failure that says nothing about the refusal list.
      const stored = entry.title.replace(/^File:/, '');
      const bare = (() => {
        try {
          return decodeURIComponent(stored);
        } catch {
          return stored;
        }
      })();
      const underscored = bare.replace(/ /g, '_');
      const spellings = [
        `File:${bare}`,
        `File:${underscored}`,
        underscored,
        encodeURIComponent(underscored),
      ];
      for (const spelling of spellings) {
        if (!refused.has(commonsKey(spelling))) unreachable.push(`${entry.title} as "${spelling}"`);
      }
    }

    expect(unreachable).toEqual([]);
  });

  it('collapses the spellings onto one key', () => {
    expect(commonsKey('File:Chickens in market.jpg')).toBe('chickens in market.jpg');
    expect(commonsKey('File:Chickens_in_market.jpg')).toBe('chickens in market.jpg');
    expect(commonsKey('Chickens_in_market.jpg')).toBe('chickens in market.jpg');
    expect(commonsKey('Chickens%5Fin%5Fmarket.jpg')).toBe('chickens in market.jpg');
    // A stray percent that is not an escape must not throw.
    expect(commonsKey('File:100%_rye.jpg')).toBe('100% rye.jpg');
  });

  it('keeps the file readable: every entry names a dish and a reason', () => {
    for (const entry of raw.files) {
      expect(entry.title.startsWith('File:')).toBe(true);
      expect(entry.rejectedFor.trim().length).toBeGreaterThan(0);
      expect(entry.reason.trim().length).toBeGreaterThan(40);
    }
  });
});
