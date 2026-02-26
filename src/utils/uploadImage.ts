import cloudinary from "../config/cloudinary";
import { Buffer } from "buffer";

/**
 * Upload image to Cloudinary
 * @param file File object from Hono (multipart/form-data)
 * @returns secure image URL
 */
export const uploadImageToCloudinary = async (
  file: File
): Promise<string> => {
  if (!file || file.size === 0) {
    throw new Error("No image file provided");
  }

  const buffer = Buffer.from(await file.arrayBuffer());

  const uploadResult = await new Promise<any>((resolve, reject) => {
    cloudinary.uploader
      .upload_stream(
        {
          folder: "ccapi", // optional folder name
        },
        (error, result) => {
          if (error) reject(error);
          else resolve(result);
        }
      )
      .end(buffer);
  });

  return uploadResult.secure_url;
};