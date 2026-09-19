import { useMemo } from 'react';
import { View, type ViewStyle } from 'react-native';
import Svg, { Defs, Path, Pattern, Rect } from 'react-native-svg';

import { Text } from '@/components/ui/text';
import { useI18n } from '@/i18n';
import { useTheme } from '@/theme';
import type { Cuisine } from '@/types/domain';

/**
 * The branded plate shown when a recipe has no photograph.
 *
 * THIS IS 58% OF THE CATALOGUE — 94 of 161 recipes — so it is not an edge case,
 * it is what most of the app looks like. It has now been wrong twice, and both
 * failures are worth recording because they point in opposite directions:
 *
 *   v1  a diagonal colour gradient with a stock glyph floating in it. Read as
 *       "this app has no content", and forced a gradient into a system that had
 *       banned them.
 *   v2  a flat beige tile with the same stock glyph. Honest, calm, and still
 *       plainly a hole where a picture should be — a large empty rectangle is
 *       not improved by being a tasteful large empty rectangle.
 *
 * The fix is not a better absence. It is to stop pretending a photograph is
 * missing and render something the brand actually owns:
 *
 *   FIELD      a cobalt- or accent-tinted surface from the palette. Never
 *              beige, because beige is what "no image" looks like. A saturated
 *              field reads as a choice.
 *   MOTIF      an eight-point star lattice — the geometry that runs through
 *              Cairo's tilework, mashrabiya screens and Mamluk doors. One owned
 *              shape, drawn as a repeating pattern rather than an icon dropped
 *              in the middle, so the plate has texture at any size and no
 *              centre of gravity competing with the card's title.
 *   VARIATION  by cuisine, through the tint, not through a different picture.
 *              Nine cuisines map onto four palette families, which keeps a
 *              scrolling feed varied without turning it into a swatch test.
 *   LABEL      the cuisine, set in the brand face. A plate that names itself is
 *              a category card; a plate that says nothing is a missing image.
 *
 * It is also unmistakably NOT a photograph, which is the point: a reader should
 * never wonder whether they are looking at food or at a placeholder.
 */

/** Four palette families across nine cuisines. */
const CUISINE_TINT: Record<Cuisine, 'primary' | 'success' | 'warning' | 'danger'> = {
  egyptian: 'primary',
  turkish: 'primary',
  american: 'primary',
  levantine: 'success',
  mediterranean: 'success',
  italian: 'danger',
  mexican: 'danger',
  asian: 'warning',
  indian: 'warning',
};

/**
 * One cell of the lattice: two squares rotated 45° against each other, which is
 * the eight-point star (khatim) reduced to its two strokes.
 */
function starCell(size: number): string {
  const h = size / 2;
  const q = size / 2;
  return [
    // Upright square, inset so the strokes meet the cell edges cleanly.
    `M ${h - q} ${h} L ${h} ${h - q} L ${h + q} ${h} L ${h} ${h + q} Z`,
    // The same square at 45°, which turns the overlap into eight points.
    `M ${h - q * 0.707} ${h - q * 0.707} L ${h + q * 0.707} ${h - q * 0.707} ` +
      `L ${h + q * 0.707} ${h + q * 0.707} L ${h - q * 0.707} ${h + q * 0.707} Z`,
  ].join(' ');
}

export type RecipeFallbackProps = {
  /** Drives the lattice scale, so a feed is not one tile repeated. */
  seed: string;
  cuisine: Cuisine | null;
  /** Hides the label on plates too small to carry text. */
  compact?: boolean;
  style?: ViewStyle;
  testID?: string;
};

export function RecipeFallback({
  seed,
  cuisine,
  compact = false,
  style,
  testID,
}: RecipeFallbackProps) {
  const theme = useTheme();
  const { t } = useI18n();

  const tintKey = cuisine ? CUISINE_TINT[cuisine] : 'primary';
  const field = theme.colors[`${tintKey}Soft` as const];
  const ink = theme.colors[`${tintKey}SoftText` as const];

  // Deterministic, so the same recipe looks the same on Home, in results and in
  // Saved, and re-rendering never reshuffles the feed.
  const { cell, patternId } = useMemo(() => {
    let hash = 0;
    for (let i = 0; i < seed.length; i += 1) hash = (hash * 31 + seed.charCodeAt(i)) % 9973;
    return {
      cell: [34, 42, 52][hash % 3]!,
      // Unique per instance: on web every <Pattern> id shares one DOM
      // namespace, so a fixed id would make every plate adopt the first one's
      // scale.
      patternId: `lattice-${hash}-${cell(seed)}`,
    };
    function cell(s: string) {
      return s.replace(/[^a-zA-Z0-9]/g, '').slice(0, 8) || 'x';
    }
  }, [seed]);

  return (
    <View
      testID={testID}
      style={[
        {
          flex: 1,
          backgroundColor: field,
          alignItems: 'center',
          justifyContent: 'center',
          overflow: 'hidden',
        },
        style,
      ]}
    >
      <Svg
        width="100%"
        height="100%"
        style={{ position: 'absolute', top: 0, left: 0, right: 0, bottom: 0 }}
        pointerEvents="none"
      >
        <Defs>
          <Pattern
            id={patternId}
            width={cell}
            height={cell}
            patternUnits="userSpaceOnUse"
          >
            <Path
              d={starCell(cell)}
              stroke={ink}
              strokeOpacity={0.22}
              strokeWidth={1}
              fill="none"
            />
          </Pattern>
        </Defs>
        <Rect x="0" y="0" width="100%" height="100%" fill={`url(#${patternId})`} />
      </Svg>

      {!compact && cuisine ? (
        <Text variant="micro" lines={1} style={{ color: ink, textTransform: 'uppercase' }}>
          {t(`cuisine.${cuisine}` as const)}
        </Text>
      ) : null}
    </View>
  );
}
