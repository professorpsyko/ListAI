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
  // Transformation pipeline (applied as a single chained eager version):
  //  1. Trim near-white/solid-colour borders (fuzz 15 handles off-white backgrounds)
  //  2. Auto-enhance colour, brightness & contrast
  //  3. Pad to 1600×1600 square, pure-white background, subject centred
  //
  // IMPORTANT: pass the transformation as a URL string, not an array.
  // Passing an array to `eager` creates one *separate* eager version per element
  // (eager[0]=trim, eager[1]=improve, eager[2]=pad), so we'd only ever use the trim result.
  // A string with slashes creates ONE eagerly-generated version with ALL steps chained.
  const eagerString = 'e_trim:15/e_improve/w_1600,h_1600,c_pad,g_center,b_white,q_90,f_jpg';

  try {
    // Eagerly bake the full transformation chain and use the URL returned in the response
    const result = await cloudinary.uploader.explicit(publicId, {
      type: 'upload',
      eager: eagerString,
    });

    const eagerUrl: string | undefined = result.eager?.[0]?.secure_url;
    // Fall back to formula URL if eager result is missing (shouldn't happen)
    const processedUrl = eagerUrl ?? cloudinary.url(publicId, {
      transformation: [
        { effect: 'trim:15' },
        { effect: 'improve' },
        { width: 1600, height: 1600, crop: 'pad', gravity: 'center', background: 'white', quality: 90, fetch_format: 'jpg' },
      ],
      secure: true,
    });
    console.log(`[image] Processed ${publicId} → ${eagerUrl ? 'eager URL' : 'formula URL'}: ${processedUrl}`);
    return {
      originalUrl: cloudinary.url(publicId, { secure: true }),
      processedUrl,
      publicId,
      failed: false,
    };
  } catch (err) {
    const msg = (err as Error).message ?? '';
    const originalUrl = cloudinary.url(publicId, { secure: true });
    console.error(`[image] Processing failed for ${publicId}:`, msg);
    return { originalUrl, processedUrl: originalUrl, publicId, failed: true, error: msg };
  }
}

export async function processMultipleImages(publicIds: string[]): Promise<ProcessedImage[]> {
  return Promise.all(publicIds.map((id) => processImage(id)));
}
