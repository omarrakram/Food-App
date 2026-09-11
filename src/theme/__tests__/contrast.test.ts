import { palettes } from '../palette';

/**
 * Colour contrast, checked rather than assumed.
 *
 * WCAG AA is 4.5:1 for body text and 3:1 for large text and UI boundaries.
 * Both themes are audited, because a palette that passes in light routinely
 * fails in dark — and nobody notices until someone cannot read a price.
 */

function channel(value: number): number {
  const c = value / 255;
  return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
}

function luminance(hex: string): number {
  const clean = hex.replace('#', '');
  const full =
    clean.length === 3
      ? clean
          .split('')
          .map((c) => c + c)
          .join('')
      : clean;
  const [r, g, b] = [0, 2, 4].map((offset) => parseInt(full.slice(offset, offset + 2), 16));
  return 0.2126 * channel(r ?? 0) + 0.7152 * channel(g ?? 0) + 0.0722 * channel(b ?? 0);
}

function contrastRatio(foreground: string, background: string): number {
  const a = luminance(foreground);
  const b = luminance(background);
  const lighter = Math.max(a, b);
  const darker = Math.min(a, b);
  return (lighter + 0.05) / (darker + 0.05);
}

describe('colour contrast', () => {
  it('computes known ratios correctly', () => {
    // Sanity-check the maths before trusting it on the real palette.
    expect(contrastRatio('#000000', '#FFFFFF')).toBeCloseTo(21, 0);
    expect(contrastRatio('#FFFFFF', '#FFFFFF')).toBeCloseTo(1, 1);
  });

  for (const scheme of ['light', 'dark'] as const) {
    describe(scheme, () => {
      const c = palettes[scheme];
      const atLeast = (fg: string, bg: string, minimum: number, name: string) => {
        const ratio = contrastRatio(fg, bg);
        // Naming the pair in the failure is what makes this fixable.
        expect({ name, passes: ratio >= minimum, ratio: Number(ratio.toFixed(2)) }).toMatchObject({
          name,
          passes: true,
        });
      };

      it('passes AA for body text on every surface', () => {
        atLeast(c.text, c.background, 4.5, 'text on background');
        atLeast(c.text, c.surface, 4.5, 'text on surface');
        atLeast(c.text, c.surfaceAlt, 4.5, 'text on surfaceAlt');
        atLeast(c.textSecondary, c.background, 4.5, 'secondary on background');
        atLeast(c.textSecondary, c.surface, 4.5, 'secondary on surface');
      });

      it('passes AA-large for tertiary text, which is only ever supporting copy', () => {
        atLeast(c.textTertiary, c.background, 3, 'tertiary on background');
        atLeast(c.textTertiary, c.surface, 3, 'tertiary on surface');
      });

      it('keeps text legible on every tinted badge', () => {
        atLeast(c.primarySoftText, c.primarySoft, 4.5, 'primary badge');
        atLeast(c.successSoftText, c.successSoft, 4.5, 'success badge');
        atLeast(c.warningSoftText, c.warningSoft, 4.5, 'warning badge');
        atLeast(c.dangerSoftText, c.dangerSoft, 4.5, 'danger badge');
      });

      it('keeps every filled button readable', () => {
        // The label, not the fill, is what sets the bar here: filled buttons
        // use the *Strong shades precisely because the vivid accent is too
        // light to carry text.
        atLeast(c.textOnPrimary, c.primaryStrong, 4.5, 'label on primary button');
        atLeast(c.textOnPrimary, c.successStrong, 4.5, 'label on success button');
        atLeast(c.textOnPrimary, c.dangerStrong, 4.5, 'label on danger button');
      });

      it('keeps both tab states readable', () => {
        // The bar is translucent, so the honest comparison is against the
        // opaque page colour showing through it.
        atLeast(c.tabBarActive, c.background, 3, 'active tab');
        atLeast(c.tabBarInactive, c.background, 3, 'inactive tab');
      });
    });
  }
});
