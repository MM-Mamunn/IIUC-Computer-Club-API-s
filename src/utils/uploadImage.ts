import { Buffer } from 'buffer';
import type { UploadApiResponse } from 'cloudinary';
import { HTTPException } from 'hono/http-exception';
import cloudinary, { isCloudinaryConfigured } from '../config/cloudinary';

const MAX_IMAGE_SIZE_BYTES = 5 * 1024 * 1024;
const MAX_IMAGE_SIZE_MB = MAX_IMAGE_SIZE_BYTES / (1024 * 1024);

/**
 * Upload image to Cloudinary
 * @param file File object from Hono (multipart/form-data)
 * @returns secure image URL
 */
export const uploadImageToCloudinary = async (file: File): Promise<string> => {
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
