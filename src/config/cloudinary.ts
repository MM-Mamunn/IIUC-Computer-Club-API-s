import { v2 as cloudinary } from 'cloudinary';

const cloudName = process.env.CLOUDINARY_CLOUD_NAME;
const apiKey = process.env.CLOUDINARY_API_KEY;
const apiSecret = process.env.CLOUDINARY_API_SECRET;
const cloudinaryUrl = process.env.CLOUDINARY_URL;

// Prefer explicit vars if all are present; otherwise fall back to CLOUDINARY_URL
if (cloudName && apiKey && apiSecret) {
  cloudinary.config({
    cloud_name: cloudName,
    api_key: apiKey,
    api_secret: apiSecret,
  });
} else if (cloudinaryUrl) {
  cloudinary.config(cloudinaryUrl);
} else {
  console.warn(
    '[cloudinary] Missing credentials. Set CLOUDINARY_URL or CLOUDINARY_CLOUD_NAME/CLOUDINARY_API_KEY/CLOUDINARY_API_SECRET.',
  );
}

export const isCloudinaryConfigured = () => {
  const config = cloudinary.config();
  return Boolean(config.cloud_name && config.api_key && config.api_secret);
};

export default cloudinary;
