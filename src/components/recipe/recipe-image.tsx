import { Ionicons } from '@expo/vector-icons';
import { Image } from 'expo-image';
import { View, type ViewStyle } from 'react-native';

import { localRecipeImage } from '@/features/recipes/images';
import { useI18n } from '@/i18n';
import { useTheme } from '@/theme';

import { Text } from '@/components/ui/text';
import type { Cuisine, Recipe } from '@/types/domain';

/**
 * The only component allowed to render a recipe's picture.
 *
 * Routing every one through here is what makes the photography question
 * answerable in one place later: point `imageUrl` at owned, licensed assets on
 * a CDN and every screen picks them up. Until then nothing hot-links anyone
 * else's photographs, and the absence is designed rather than broken.
 *
 * THE FALLBACK IS A TYPOGRAPHIC TILE, not a gradient with an icon in it.
 *
 * This matters more than it sounds: 94 of the 161 catalogue recipes have no
 * photograph, so the fallback is what the majority of this app looks like. It
 * used to be a diagonal colour gradient with a stock glyph floating in the
 * middle, which is precisely how an app looks when it has no content — and a
 * feed mixing eight photographs with four glowing gradient squares reads as
 * broken rather than as varied.
 *
 * It is now a flat, warm, muted tile carrying the cuisine as a typographic
 * label. Flat and typographic reads as deliberate; gradient-plus-glyph reads
 * as missing. The tint still varies deterministically by recipe id so a feed
 * is not one tile repeated, but it varies across three muted sand steps rather
 * than around the colour wheel.
 */

/** Icons that suit each cuisine. Generic enough to never be wrong. */
const CUISINE_GLYPH: Record<Cuisine, keyof typeof Ionicons.glyphMap> = {
  egyptian: 'restaurant-outline',
  levantine: 'leaf-outline',
  mediterranean: 'fish-outline',
  italian: 'pizza-outline',
  asian: 'cafe-outline',
  indian: 'flame-outline',
  mexican: 'flame-outline',
  american: 'fast-food-outline',
  turkish: 'restaurant-outline',
};

/**
 * Stable tile index from the recipe id.
 *
 * Deterministic on purpose: the same recipe looks the same on Home, in results
 * and in Saved, and re-rendering never reshuffles the feed.
 */
function tileIndex(seed: string, buckets: number): number {
  let hash = 0;
  for (let index = 0; index < seed.length; index += 1) {
    hash = (hash * 31 + seed.charCodeAt(index)) % 9973;
  }
  return hash % buckets;
}

/**
 * Three muted steps, not a colour wheel.
 *
 * The old version rotated hue across a 34-degree arc, which gave every tile a
 * slightly different colour and made a feed look like a swatch test. Three
 * closely-related sand tones give variety at the scale it is actually noticed
 * — no two adjacent cards identical — while still reading as one material.
 */
function tileTint(seed: string, isDark: boolean): { bg: string; fg: string } {
  const light = [
    { bg: '#F1E9DC', fg: '#7A6E5F' },
    { bg: '#EDE6DE', fg: '#756A60' },
    { bg: '#F0EAE0', fg: '#786C5C' },
  ];
  const dark = [
    { bg: '#20242C', fg: '#7C8598' },
    { bg: '#1D2129', fg: '#798294' },
    { bg: '#232830', fg: '#818A9C' },
  ];
  const set = isDark ? dark : light;
  return set[tileIndex(seed, set.length)]!;
}

export type RecipeImageProps = {
  recipe: Pick<Recipe, 'id' | 'slug' | 'imageUrl' | 'cuisine'>;
  /** Width-to-height ratio. Always set, so layout never depends on the asset. */
  aspectRatio: number;
  /** Fallback glyph size. Cards want a smaller mark than a detail hero. */
  glyphSize?: number;
  /**
   * Hides the fallback's cuisine label. Set on tiles too small to carry text —
   * a 64pt thumbnail, where a label is unreadable and only adds noise.
   */
  compact?: boolean;
  style?: ViewStyle;
  testID?: string;
};

export function RecipeImage({
  recipe,
  aspectRatio,
  glyphSize = 36,
  compact = false,
  style,
  testID,
}: RecipeImageProps) {
  const theme = useTheme();
  const { t } = useI18n();

  // `aspectRatio` plus `maxWidth` keeps the frame honest on both a 360px phone
  // and a wide browser: the box never outgrows its column, and never collapses.
  // Typed loosely on purpose: expo-image's style type is narrower than
  // ViewStyle (its `overflow` has no 'scroll'), and the same frame has to
  // describe both the photo and the fallback so layout cannot diverge.
  const frame = {
    width: '100%' as const,
    maxWidth: '100%' as const,
    aspectRatio,
    backgroundColor: theme.colors.surfaceAlt,
    overflow: 'hidden' as const,
  };

  // Bundled first: it cannot 404, needs no configuration, and works offline.
  // A remote URL is the fallback for community photos and for a CDN we have
  // not populated yet.
  const bundled = localRecipeImage(recipe.slug);
  const source = bundled?.source ?? recipe.imageUrl;

  // A default test id, distinct for a photograph and for the fallback.
  //
  // Not decoration: "are there real photographs on this screen, or is every
  // card a gradient?" is a question the product now has to be able to answer
  // about a DEPLOYED build, and counting these in the DOM is how the smoke
  // test answers it. Without them the two states are indistinguishable to
  // anything but a human eye.
  const mark = recipe.slug ?? recipe.id;

  if (source) {
    return (
      <Image
        source={source}
        contentFit="cover"
        transition={220}
        // Recipe photos repeat across screens; caching them avoids a refetch
        // every time a feed re-renders.
        cachePolicy="memory-disk"
        accessibilityIgnoresInvertColors
        style={[frame, style as object]}
        testID={testID ?? `recipe-photo-${mark}`}
      />
    );
  }

  const tint = tileTint(recipe.id, theme.scheme === 'dark');

  return (
    <View style={[frame, style]} testID={testID ?? `recipe-fallback-${mark}`}>
      <View
        style={{
          flex: 1,
          backgroundColor: tint.bg,
          alignItems: 'center',
          justifyContent: 'center',
          gap: theme.spacing.sm,
          padding: theme.spacing.md,
        }}
      >
        <Ionicons
          // Cuisine is nullable on a generated recipe the model did not tag.
          name={(recipe.cuisine && CUISINE_GLYPH[recipe.cuisine]) || 'restaurant-outline'}
          size={glyphSize}
          color={tint.fg}
        />
        {!compact && recipe.cuisine ? (
          <Text
            variant="micro"
            lines={1}
            style={{ color: tint.fg, textTransform: 'uppercase' }}
          >
            {t(`cuisine.${recipe.cuisine}` as const)}
          </Text>
        ) : null}
      </View>
    </View>
  );
}
