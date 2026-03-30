import { Buffer } from 'buffer';
import type { UploadApiResponse } from 'cloudinary';
import cloudinary, { isCloudinaryConfigured } from '../config/cloudinary';

/**
 * Upload image to Cloudinary
 * @param file File object from Hono (multipart/form-data)
 * @returns secure image URL
 */
export const uploadImageToCloudinary = async (file: File): Promise<string> => {
  if (!file || file.size === 0) {
    throw new Error('No image file provided');
  }

  if (!file.type.startsWith('image/')) {
    throw new Error('Uploaded file must be an image');
  }

  if (!isCloudinaryConfigured()) {
    throw new Error('Cloudinary is not configured on the server');
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
            reject(new Error(`Cloudinary upload failed: ${message}`));
            return;
          }

          if (!result?.secure_url) {
            reject(new Error('Cloudinary upload failed: missing secure URL in response'));
            return;
          }

          resolve(result);
        },
      )
      .end(buffer);
  });

  return uploadResult.secure_url;
};
