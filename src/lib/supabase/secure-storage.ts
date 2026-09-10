import * as SecureStore from 'expo-secure-store';
import { Platform } from 'react-native';

/**
 * Session storage backed by the device keychain / keystore.
 *
 * Supabase persists the access and refresh tokens through this adapter. They
 * are credentials, so they must not sit in AsyncStorage, which is plain text
 * on disk and included in some backup mechanisms.
 *
 * Two wrinkles this handles:
 *
 *  1. SecureStore rejects values over ~2 KB on Android, and a Supabase session
 *     with custom claims can exceed that. Values are split into numbered
 *     chunks and reassembled on read.
 *  2. SecureStore does not exist on web. There we fall back to localStorage,
 *     which is the only option a browser gives us — the web build is a
 *     development and preview target, not the shipping product.
 */

/** Conservative chunk size: Android's limit is ~2048 bytes. */
const CHUNK_SIZE = 1800;

/** Written alongside the chunks so a partial write can be detected on read. */
const COUNT_SUFFIX = '__chunks';

const isWeb = Platform.OS === 'web';

function webStorage(): Storage | null {
  try {
    return typeof localStorage === 'undefined' ? null : localStorage;
  } catch {
    // Blocked cookies / private mode.
    return null;
  }
}

async function rawGet(key: string): Promise<string | null> {
  if (isWeb) return webStorage()?.getItem(key) ?? null;
  return SecureStore.getItemAsync(key);
}

async function rawSet(key: string, value: string): Promise<void> {
  if (isWeb) {
    webStorage()?.setItem(key, value);
    return;
  }
  await SecureStore.setItemAsync(key, value, {
    // Tokens are only needed while the user is actively using the device.
    keychainAccessible: SecureStore.WHEN_UNLOCKED_THIS_DEVICE_ONLY,
  });
}

async function rawRemove(key: string): Promise<void> {
  if (isWeb) {
    webStorage()?.removeItem(key);
    return;
  }
  await SecureStore.deleteItemAsync(key);
}

export const secureSessionStorage = {
  async getItem(key: string): Promise<string | null> {
    try {
      const countRaw = await rawGet(`${key}${COUNT_SUFFIX}`);
      if (countRaw === null) {
        // Not chunked — either absent, or written before chunking existed.
        return rawGet(key);
      }

      const count = Number.parseInt(countRaw, 10);
      if (!Number.isFinite(count) || count <= 0) return null;

      const parts: string[] = [];
      for (let index = 0; index < count; index += 1) {
        const part = await rawGet(`${key}.${index}`);
        // A missing chunk means a torn write. Treat the whole value as absent
        // rather than handing Supabase a truncated token.
        if (part === null) return null;
        parts.push(part);
      }
      return parts.join('');
    } catch {
      return null;
    }
  },

  async setItem(key: string, value: string): Promise<void> {
    try {
      await this.removeItem(key);

      if (value.length <= CHUNK_SIZE) {
        await rawSet(key, value);
        return;
      }

      const chunks: string[] = [];
      for (let offset = 0; offset < value.length; offset += CHUNK_SIZE) {
        chunks.push(value.slice(offset, offset + CHUNK_SIZE));
      }

      for (const [index, chunk] of chunks.entries()) {
        await rawSet(`${key}.${index}`, chunk);
      }
      // Written last: the count key is what makes the chunk set readable, so
      // an interrupted write leaves the value absent rather than truncated.
      await rawSet(`${key}${COUNT_SUFFIX}`, String(chunks.length));
    } catch {
      // A failed persist means the user has to sign in again next launch,
      // which is far better than crashing on startup.
    }
  },

  async removeItem(key: string): Promise<void> {
    try {
      const countRaw = await rawGet(`${key}${COUNT_SUFFIX}`);
      if (countRaw !== null) {
        const count = Number.parseInt(countRaw, 10);
        if (Number.isFinite(count)) {
          for (let index = 0; index < count; index += 1) {
            await rawRemove(`${key}.${index}`);
          }
        }
        await rawRemove(`${key}${COUNT_SUFFIX}`);
      }
      await rawRemove(key);
    } catch {
      // ignore
    }
  },
};
