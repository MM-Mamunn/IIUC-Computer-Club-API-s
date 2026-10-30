import { Buffer } from 'buffer';
import type { UploadApiOptions, UploadApiResponse } from 'cloudinary';
import { HTTPException } from 'hono/http-exception';
import cloudinary, { isCloudinaryConfigured } from '../config/cloudinary';

const MAX_IMAGE_SIZE_BYTES = 5 * 1024 * 1024;
const MAX_IMAGE_SIZE_MB = MAX_IMAGE_SIZE_BYTES / (1024 * 1024);

/**
 * Profile photos are only ever shown as small avatars, so shrink them before
 * storing (keeps aspect ratio, never upscales). Not for banners/receipts.
 */
export const PROFILE_PHOTO_UPLOAD: UploadApiOptions = {
  transformation: [{ width: 1000, height: 1000, crop: 'limit' }],
};

/**
 * Upload image to Cloudinary
 * @param file File object from Hono (multipart/form-data)
 * @param options extra Cloudinary upload options (e.g. PROFILE_PHOTO_UPLOAD)
 * @returns secure image URL
 */
export const uploadImageToCloudinary = async (
  file: File,
  options: UploadApiOptions = {},
): Promise<string> => {
  if (!file || file.size === 0) {
    throw new HTTPException(400, { message: 'Image file is required.' });
  }

  if (!file.type.startsWith('image/')) {
    throw new HTTPException(400, { message: 'Uploaded file must be an image.' });
  }

  if (file.size > MAX_IMAGE_SIZE_BYTES) {
    throw new HTTPException(413, {
      message: `Image is too large. Maximum allowed size is ${MAX_IMAGE_SIZE_MB}MB.`,
    });
  }

  if (!isCloudinaryConfigured()) {
    throw new HTTPException(500, {
      message: 'Image upload is unavailable. Server upload credentials are not configured.',
    });
  }

  const buffer = Buffer.from(await file.arrayBuffer());

  const uploadResult = await new Promise<UploadApiResponse>((resolve, reject) => {
    cloudinary.uploader
      .upload_stream(
        {
          folder: 'ccapi',
          ...options,
        },
        (error, result) => {
          if (error) {
            const message = error.message || 'Unknown Cloudinary upload error';
            if (message.toLowerCase().includes('file size too large')) {
              reject(
                new HTTPException(413, {
                  message: `Image is too large. Maximum allowed size is ${MAX_IMAGE_SIZE_MB}MB.`,
                }),
              );
              return;
            }

            reject(new HTTPException(502, { message: `Cloudinary upload failed: ${message}` }));
            return;
          }

          if (!result?.secure_url) {
            reject(
              new HTTPException(502, {
                message: 'Cloudinary upload failed: missing secure URL in response',
              }),
            );
            return;
          }

          resolve(result);
        },
      )
      .end(buffer);
  });

  return uploadResult.secure_url;
};

export const isBase64Image = (value: unknown): value is string =>
  typeof value === 'string' && /^data:image\/[a-z0-9.+-]+;base64,/i.test(value.trim());

/**
 * Upload a base64 data URI image to Cloudinary
 * @param dataUri e.g. "data:image/png;base64,...."
 * @param options extra Cloudinary upload options (e.g. PROFILE_PHOTO_UPLOAD)
 * @returns secure image URL
 */
export const uploadDataUriToCloudinary = async (
  dataUri: string,
  options: UploadApiOptions = {},
): Promise<string> => {
  const payload = dataUri.trim();
  // base64 encodes 3 bytes in 4 chars
  const approxBytes = Math.floor(((payload.length - payload.indexOf(',') - 1) * 3) / 4);
  if (approxBytes > MAX_IMAGE_SIZE_BYTES) {
    throw new HTTPException(413, {
      message: `Image is too large. Maximum allowed size is ${MAX_IMAGE_SIZE_MB}MB.`,
    });
  }

  if (!isCloudinaryConfigured()) {
    throw new HTTPException(500, {
      message: 'Image upload is unavailable. Server upload credentials are not configured.',
    });
  }

  try {
    const result = await cloudinary.uploader.upload(payload, { folder: 'ccapi', ...options });
    if (!result?.secure_url) {
      throw new Error('missing secure URL in response');
    }
    return result.secure_url;
  } catch (error) {
    if (error instanceof HTTPException) throw error;
    const message = (error as { message?: string })?.message || 'Unknown Cloudinary upload error';
    throw new HTTPException(502, { message: `Cloudinary upload failed: ${message}` });
  }
};

/**
 * Never store base64 images in the database: upload them and keep only the URL.
 * Other values (URLs, null, undefined) are returned unchanged.
 */
export const resolveImageInput = async <T extends string | null | undefined>(
  value: T,
  options: UploadApiOptions = {},
): Promise<T | string> => (isBase64Image(value) ? uploadDataUriToCloudinary(value, options) : value);

const CLOUDINARY_UPLOAD_URL = /^(https:\/\/res\.cloudinary\.com\/[^/]+\/image\/upload\/)(.+)$/;

/**
 * Rewrite a Cloudinary photo URL to a small, auto-format/auto-quality version
 * for avatar display (largest avatar is 112px, so 400px covers 3x screens).
 * Leaves non-Cloudinary and already-transformed URLs untouched.
 */
export const toAvatarUrl = (url: string | null): string | null => {
  const match = url?.match(CLOUDINARY_UPLOAD_URL);
  if (!match) return url;
  const [, prefix, rest] = match;
  // First path segment is a transformation (e.g. "w_400,c_limit") rather than a version/folder
  if (/^[a-z]{1,3}_[^/]*\//.test(rest) && !/^v\d+\//.test(rest)) return url;
  return `${prefix}c_limit,w_400,f_auto,q_auto/${rest}`;
};
