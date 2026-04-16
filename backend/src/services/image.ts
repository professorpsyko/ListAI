import { v2 as cloudinary } from 'cloudinary';
import { config } from '../config';

cloudinary.config({
  cloud_name: config.CLOUDINARY_CLOUD_NAME,
  api_key: config.CLOUDINARY_API_KEY,
  api_secret: config.CLOUDINARY_API_SECRET,
});

export interface ProcessedImage {
  originalUrl: string;
  processedUrl: string;
  publicId: string;
  failed: boolean;
  error?: string;
}

export async function uploadToCloudinary(input: string | Buffer): Promise<{ url: string; publicId: string }> {
  if (Buffer.isBuffer(input)) {
    // Upload from in-memory buffer via data URI
    const b64 = input.toString('base64');
    const dataUri = `data:image/jpeg;base64,${b64}`;
    const result = await cloudinary.uploader.upload(dataUri, {
      folder: 'listai/originals',
      resource_type: 'image',
    });
    return { url: result.secure_url, publicId: result.public_id };
  }

  // Legacy: upload from file path
  const result = await cloudinary.uploader.upload(input, {
    folder: 'listai/originals',
    resource_type: 'image',
  });
  return { url: result.secure_url, publicId: result.public_id };
}

export async function processImage(publicId: string): Promise<ProcessedImage> {
  // Re-upload with transformations:
  // - pad to center subject on white background
  // - 1600x1600 max
  // - JPEG 85% quality
  try {
    const processedUrl = cloudinary.url(publicId, {
      transformation: [
        {
          width: 1600,
          height: 1600,
          crop: 'pad',
          background: 'white',
          quality: 85,
          fetch_format: 'jpg',
        },
      ],
      secure: true,
    });

    // Eagerly generate the transformed URL (creates it in Cloudinary CDN)
    await cloudinary.uploader.explicit(publicId, {
      type: 'upload',
      eager: [
        {
          width: 1600,
          height: 1600,
          crop: 'pad',
          background: 'white',
          quality: 85,
          fetch_format: 'jpg',
        },
      ],
    });

    return {
      originalUrl: cloudinary.url(publicId, { secure: true }),
      processedUrl,
      publicId,
      failed: false,
    };
  } catch (err) {
    const originalUrl = cloudinary.url(publicId, { secure: true });
    return {
      originalUrl,
      processedUrl: originalUrl, // Fall back to original
      publicId,
      failed: true,
      error: (err as Error).message,
    };
  }
}

export async function processMultipleImages(publicIds: string[]): Promise<ProcessedImage[]> {
  return Promise.all(publicIds.map((id) => processImage(id)));
}
