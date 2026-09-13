/**
 * Preparing an image for upload.
 *
 * Pure rules, no native modules and no network, so every one of them is
 * testable. The impure half — picking the file and re-encoding it — is in
 * `upload.ts`, which is a thin shell over these decisions.
 *
 * The rules restate what the Storage buckets enforce. That duplication is
 * deliberate and has a direction: the bucket is the authority, and this exists
 * so a user learns their photo is too large before they have spent thirty
 * seconds uploading it. Nothing here can widen what the server accepts.
 */

export const UPLOAD_KINDS = ['avatar', 'recipe'] as const;
export type UploadKind = (typeof UPLOAD_KINDS)[number];

/** Mirrors `allowed_mime_types` on every bucket. */
export const ALLOWED_MIME_TYPES = ['image/jpeg', 'image/png', 'image/webp'] as const;
export type AllowedMimeType = (typeof ALLOWED_MIME_TYPES)[number];

export type UploadRules = {
  bucket: string;
  /** Mirrors `file_size_limit`, in bytes. */
  maxBytes: number;
  /** Longest edge after resizing. */
  maxEdge: number;
  /** Below this the image is too small to be worth showing at all. */
  minEdge: number;
  /** JPEG quality, 0-1. */
  quality: number;
};

/**
 * An avatar is rendered at 84 points at most, so 512px covers a 3x screen with
 * room to spare and anything larger is bytes nobody sees. A recipe photo is a
 * hero image on a detail screen, so it gets 1600px.
 */
export const UPLOAD_RULES: Record<UploadKind, UploadRules> = {
  avatar: { bucket: 'avatars', maxBytes: 2 * 1024 * 1024, maxEdge: 512, minEdge: 64, quality: 0.8 },
  recipe: {
    bucket: 'recipe-uploads',
    maxBytes: 8 * 1024 * 1024,
    maxEdge: 1600,
    minEdge: 320,
    quality: 0.82,
  },
};

export const IMAGE_PROBLEMS = ['unsupported_type', 'too_large', 'too_small', 'unreadable'] as const;
export type ImageProblem = (typeof IMAGE_PROBLEMS)[number];

export type PickedImage = {
  uri: string;
  width: number;
  height: number;
  /** As reported by the picker. Untrusted. */
  mimeType?: string | null;
  fileSize?: number | null;
  /** As reported by the picker. Untrusted, and never used to build a path. */
  fileName?: string | null;
};

function isAllowedMime(value: string | null | undefined): value is AllowedMimeType {
  return ALLOWED_MIME_TYPES.includes((value ?? '') as AllowedMimeType);
}

/**
 * Whether this image can be uploaded at all.
 *
 * Checked BEFORE re-encoding, because re-encoding a 40MB panorama to find out
 * it was never allowed wastes the user's battery and several seconds.
 *
 * The size check is deliberately against the ORIGINAL: re-encoding usually
 * shrinks a file below the limit, so checking afterwards would accept
 * arbitrarily large inputs as long as they happened to compress well — and by
 * then the expensive part has already happened.
 */
export function validateImage(image: PickedImage, kind: UploadKind): ImageProblem | null {
  const rules = UPLOAD_RULES[kind];

  if (!Number.isFinite(image.width) || !Number.isFinite(image.height)) return 'unreadable';
  if (image.width <= 0 || image.height <= 0) return 'unreadable';

  // A missing mime type is treated as unsupported rather than assumed. The
  // picker only omits it in cases we would rather not guess about.
  if (!isAllowedMime(image.mimeType)) return 'unsupported_type';

  if (typeof image.fileSize === 'number' && image.fileSize > rules.maxBytes) return 'too_large';
  if (Math.min(image.width, image.height) < rules.minEdge) return 'too_small';

  return null;
}

/**
 * The size to re-encode to.
 *
 * Only ever shrinks. Upscaling a small photo to hit a target adds bytes and no
 * detail, and makes a bad photo look worse.
 */
export function targetSize(
  image: Pick<PickedImage, 'width' | 'height'>,
  kind: UploadKind,
): { width: number; height: number } {
  const { maxEdge } = UPLOAD_RULES[kind];
  const longest = Math.max(image.width, image.height);
  if (longest <= maxEdge) return { width: image.width, height: image.height };

  const scale = maxEdge / longest;
  return {
    width: Math.max(1, Math.round(image.width * scale)),
    height: Math.max(1, Math.round(image.height * scale)),
  };
}

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const SAFE_TOKEN = /^[A-Za-z0-9-]{6,64}$/;

/**
 * The object path to upload to.
 *
 * **The user's filename is never used.** Not sanitised, not slugified — not
 * used at all. It is attacker-controlled text that would end up in a URL, in a
 * Content-Disposition header, and in a path that a storage policy parses to
 * decide who owns the file. Generating the whole name removes the class of
 * question rather than answering each instance of it.
 *
 * The first segment is the owner's id, because that is exactly what the bucket
 * policies read to decide whether this write is allowed.
 */
export function objectPath(userId: string, kind: UploadKind, unique: string): string {
  if (!UUID_PATTERN.test(userId)) {
    throw new Error('refusing to build a storage path for a non-uuid user id');
  }
  if (!SAFE_TOKEN.test(unique)) {
    throw new Error('refusing to build a storage path from an unsafe token');
  }
  return `${userId}/${kind}-${unique}.jpg`;
}

/**
 * Everything is re-encoded to JPEG, whatever came in.
 *
 * Two reasons, and the second is the important one. JPEG is smaller than PNG
 * for photographs. And re-encoding through the image pipeline DROPS THE
 * METADATA — a photo straight off a phone carries GPS coordinates, a device
 * serial and a timestamp, and an avatar is the single most likely thing in
 * this app to be published with someone's home address attached to it.
 */
export const UPLOAD_CONTENT_TYPE = 'image/jpeg';
