import { useMutation } from '@tanstack/react-query';

import { useAuth } from '@/features/auth/auth-provider';
import { env } from '@/lib/config/env';
import { getSupabase } from '@/lib/supabase/client';

import { UPLOAD_RULES, type UploadKind } from './images';
import { pickImage, uploadImage, type UploadResult } from './upload';

/**
 * Pick a photo and upload it.
 *
 * Resolves to `null` when the user cancels the picker, which is the common
 * path and is not an error. Everything else throws, so the caller's error
 * branch only ever sees genuine failures.
 */
export function useImageUpload(kind: UploadKind) {
  const { user } = useAuth();
  const supabase = getSupabase();

  return useMutation<UploadResult | null>({
    mutationFn: async () => {
      // Without a project there is nowhere to put the file. Failing here beats
      // letting someone crop a photo and then telling them.
      if (!supabase || !user) throw new Error('uploads need an account');

      const picked = await pickImage(kind);
      if (!picked) return null;

      return uploadImage(supabase, user.id, kind, picked);
    },
  });
}

/**
 * The URL for an uploaded object.
 *
 * Public buckets resolve to a stable URL. The private one deliberately has no
 * equivalent here: a pending submission photo is reached through a signed URL
 * the moderation flow issues, and offering a `getPublicUrl` for it would
 * produce a link that looks right and 404s.
 */
export function publicImageUrl(bucket: string, path: string): string | null {
  if (bucket === UPLOAD_RULES.recipe.bucket) return null;

  const supabase = getSupabase();
  if (!supabase) {
    return env.recipeImageBaseUrl ? `${env.recipeImageBaseUrl}/${path}` : null;
  }
  return supabase.storage.from(bucket).getPublicUrl(path).data.publicUrl;
}
