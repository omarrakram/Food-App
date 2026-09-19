import { Image } from 'expo-image';
import { View, type ViewStyle } from 'react-native';

import { localRecipeImage } from '@/features/recipes/images';
import { useTheme } from '@/theme';

import { RecipeFallback } from './recipe-fallback';
import type { Recipe } from '@/types/domain';

/**
 * The only component allowed to render a recipe's picture.
 *
 * Routing every one through here is what makes the photography question
 * answerable in one place later: point `imageUrl` at owned, licensed assets on
 * a CDN and every screen picks them up. Until then nothing hot-links anyone
 * else's photographs, and the absence is designed rather than broken.
 *
 * When there is no photograph the plate comes from `RecipeFallback`, which is
 * a branded surface rather than an absence — see that file for why two earlier
 * attempts at "a nicer empty rectangle" were the wrong idea.
 *
 * A plate is also allowed to be SHORTER than a photograph would be. A
 * full-bleed 16:10 image earns its height by being appetising; the same height
 * of pattern does not, and on a result card it pushed the recipe's own name
 * below the fold. Callers that render large cards pass `fallbackAspectRatio`
 * and get a band instead of a block.
 */

export type RecipeImageProps = {
  recipe: Pick<Recipe, 'id' | 'slug' | 'imageUrl' | 'cuisine'>;
  /** Width-to-height ratio. Always set, so layout never depends on the asset. */
  aspectRatio: number;
  /**
   * Aspect ratio to use when there is no photograph. Wider (so shorter) than
   * `aspectRatio` on large cards, where a full-height pattern would outweigh
   * the recipe. Omitted means "same shape as a photo would have been", which
   * is what grids want so their rows stay aligned.
   */
  fallbackAspectRatio?: number;
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
  fallbackAspectRatio,
  compact = false,
  style,
  testID,
}: RecipeImageProps) {
  const theme = useTheme();

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

  return (
    <View
      style={[{ ...frame, aspectRatio: fallbackAspectRatio ?? aspectRatio }, style]}
      testID={testID ?? `recipe-fallback-${mark}`}
    >
      <RecipeFallback seed={recipe.id} cuisine={recipe.cuisine} compact={compact} />
    </View>
  );
}
