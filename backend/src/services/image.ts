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

export async function uploadEditedPhoto(dataUrl: string): Promise<{ url: string; publicId: string }> {
  const result = await cloudinary.uploader.upload(dataUrl, {
    folder: 'listai/edited',
    resource_type: 'image',
    timeout: 30000,
  });
  return { url: result.secure_url, publicId: result.public_id };
}

export async function uploadToCloudinary(input: string | Buffer): Promise<{ url: string; publicId: string }> {
  if (Buffer.isBuffer(input)) {
    // Upload from in-memory buffer via data URI
    const b64 = input.toString('base64');
    const dataUri = `data:image/jpeg;base64,${b64}`;
    const result = await cloudinary.uploader.upload(dataUri, {
      folder: 'listai/originals',
      resource_type: 'image',
      timeout: 30000,
    });
    return { url: result.secure_url, publicId: result.public_id };
  }

  // Legacy: upload from file path
  const result = await cloudinary.uploader.upload(input, {
    folder: 'listai/originals',
    resource_type: 'image',
    timeout: 30000,
  });
  return { url: result.secure_url, publicId: result.public_id };
}

export async function processImage(publicId: string): Promise<ProcessedImage> {
  // Transformation pipeline:
  //  1. AI background removal — cuts out the subject and places it on pure white
  //  2. Auto-enhance colour balance, brightness & contrast
  //  3. Pad to a 1600×1600 square with white background, AI-centred subject
  //
  // If background removal is unavailable on this Cloudinary plan, we fall back
  // to the enhance-only pipeline so something always comes back.

  const withBgRemoval = [
    { effect: 'background_removal' },
    { effect: 'improve' },
    {
      width: 1600,
      height: 1600,
      crop: 'pad',
      gravity: 'auto',
      background: 'white',
      quality: 85,
      fetch_format: 'jpg',
    },
  ];

  const withoutBgRemoval = [
    { effect: 'trim' },
    { effect: 'improve' },
    {
      width: 1600,
      height: 1600,
      crop: 'pad',
      gravity: 'auto',
      background: 'white',
      quality: 85,
      fetch_format: 'jpg',
    },
  ];

  // Try background removal first; if the plan doesn't support it, fall back
  for (const transformation of [withBgRemoval, withoutBgRemoval]) {
    try {
      // Eagerly generate the transformed URL (bakes it into Cloudinary CDN)
      await cloudinary.uploader.explicit(publicId, {
        type: 'upload',
        eager: transformation,
      });

      const processedUrl = cloudinary.url(publicId, {
        transformation,
        secure: true,
      });

      console.log(`[image] Processed ${publicId} ${transformation === withBgRemoval ? '(bg removal)' : '(enhance only)'}`);
      return {
        originalUrl: cloudinary.url(publicId, { secure: true }),
        processedUrl,
        publicId,
        failed: false,
      };
    } catch (err) {
      const msg = (err as Error).message ?? '';
      const isBgRemovalUnsupported =
        msg.includes('background_removal') ||
        msg.includes('not allowed') ||
        msg.includes('invalid effect') ||
        msg.includes('add-on') ||
        msg.includes('addon');

      if (transformation === withBgRemoval && isBgRemovalUnsupported) {
        console.warn(`[image] Background removal unavailable, falling back to enhance-only: ${msg}`);
        continue; // try the next pipeline
      }

      // Real failure — return original
      const originalUrl = cloudinary.url(publicId, { secure: true });
      console.error(`[image] Processing failed for ${publicId}:`, msg);
      return { originalUrl, processedUrl: originalUrl, publicId, failed: true, error: msg };
    }
  }

  // Should never reach here, but satisfy TS
  const originalUrl = cloudinary.url(publicId, { secure: true });
  return { originalUrl, processedUrl: originalUrl, publicId, failed: true, error: 'All pipelines failed' };
}

export async function processMultipleImages(publicIds: string[]): Promise<ProcessedImage[]> {
  return Promise.all(publicIds.map((id) => processImage(id)));
}
