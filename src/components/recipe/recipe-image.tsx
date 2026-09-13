import { Ionicons } from '@expo/vector-icons';
import { Image } from 'expo-image';
import { LinearGradient } from 'expo-linear-gradient';
import { View, type ViewStyle } from 'react-native';

import { localRecipeImage } from '@/features/recipes/images';
import { useTheme } from '@/theme';
import type { Cuisine, Recipe } from '@/types/domain';

/**
 * The only component allowed to render a recipe's picture.
 *
 * Routing every one through here is what makes the photography question
 * answerable in one place later: point `imageUrl` at owned, licensed assets on
 * a CDN and every screen picks them up. Until then nothing hot-links anyone
 * else's photographs, and the absence is designed rather than broken.
 *
 * The fallback is deliberately not a grey slab. It is a warm gradient in the
 * brand palette with a glyph chosen from the recipe's own cuisine, and its hue
 * is derived from the recipe id — so a feed of them reads as a set with
 * variety rather than the same tile repeated.
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
 * Stable hue offset from the recipe id.
 *
 * Deterministic on purpose: the same recipe looks the same on Home, in results
 * and in Saved, and re-rendering never reshuffles the feed.
 */
function hueFor(seed: string): number {
  let hash = 0;
  for (let index = 0; index < seed.length; index += 1) {
    hash = (hash * 31 + seed.charCodeAt(index)) % 360;
  }
  return hash;
}

/** Two warm, food-adjacent ramps the brand already lives in. */
function gradientFor(seed: string, isDark: boolean): [string, string] {
  // Kept inside a paprika-to-saffron arc rather than the full wheel: a blue
  // recipe tile would not look like this product.
  const hue = 18 + (hueFor(seed) % 34);
  return isDark
    ? [`hsl(${hue}, 34%, 22%)`, `hsl(${hue + 12}, 24%, 13%)`]
    : [`hsl(${hue}, 72%, 88%)`, `hsl(${hue + 14}, 58%, 78%)`];
}

export type RecipeImageProps = {
  recipe: Pick<Recipe, 'id' | 'slug' | 'imageUrl' | 'cuisine'>;
  /** Width-to-height ratio. Always set, so layout never depends on the asset. */
  aspectRatio: number;
  /** Fallback glyph size. Cards want a smaller mark than a detail hero. */
  glyphSize?: number;
  style?: ViewStyle;
  testID?: string;
};

export function RecipeImage({
  recipe,
  aspectRatio,
  glyphSize = 36,
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
        testID={testID}
      />
    );
  }

  const [from, to] = gradientFor(recipe.id, theme.scheme === 'dark');

  return (
    <View style={[frame, style]} testID={testID}>
      <LinearGradient
        colors={[from, to]}
        start={{ x: 0, y: 0 }}
        end={{ x: 1, y: 1 }}
        style={{ flex: 1, alignItems: 'center', justifyContent: 'center' }}
      >
        <Ionicons
          // Cuisine is nullable on a generated recipe the model did not tag.
          name={(recipe.cuisine && CUISINE_GLYPH[recipe.cuisine]) || 'restaurant-outline'}
          size={glyphSize}
          color={
            theme.scheme === 'dark' ? 'rgba(255,251,247,0.42)' : 'rgba(92, 45, 20, 0.34)'
          }
        />
      </LinearGradient>
    </View>
  );
}
