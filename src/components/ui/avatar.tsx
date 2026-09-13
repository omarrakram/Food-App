import { Image } from 'expo-image';
import { useState } from 'react';
import { View, type ViewStyle } from 'react-native';

import { Text } from '@/components/ui/text';
import { useTheme } from '@/theme';

export type AvatarProps = {
  url?: string | null;
  /** Text to take an initial from when there is no photo. */
  fallback?: string | null;
  size?: number;
  style?: ViewStyle;
  testID?: string;
};

/**
 * A person, as a circle.
 *
 * The initial is not a placeholder waiting for a photo — it is the normal
 * state, and most users will never set one. So it gets the app's own colour
 * rather than a grey disc, and a failed image load falls back to it silently:
 * a broken-image glyph next to someone's name looks like the app is broken,
 * not like the photo is.
 */
export function Avatar({ url, fallback, size = 40, style, testID }: AvatarProps) {
  const theme = useTheme();
  const [failed, setFailed] = useState(false);

  const initial = (fallback ?? '').trim().charAt(0).toUpperCase();
  const showImage = Boolean(url) && !failed;

  return (
    <View
      testID={testID}
      style={[
        {
          width: size,
          height: size,
          borderRadius: theme.radius.pill,
          backgroundColor: theme.colors.primarySoft,
          alignItems: 'center',
          justifyContent: 'center',
          overflow: 'hidden',
        },
        style,
      ]}
    >
      {showImage ? (
        <Image
          source={{ uri: url! }}
          style={{ width: size, height: size }}
          contentFit="cover"
          transition={150}
          // expo-image caches by URL, and an avatar is rendered many times per
          // screen in a friend list or a message thread.
          cachePolicy="memory-disk"
          onError={() => setFailed(true)}
          accessibilityIgnoresInvertColors
        />
      ) : (
        <Text
          variant={size >= 72 ? 'title1' : size >= 48 ? 'title3' : 'callout'}
          color="primarySoftText"
        >
          {initial || '·'}
        </Text>
      )}
    </View>
  );
}
