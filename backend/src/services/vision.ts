import Anthropic from '@anthropic-ai/sdk';
import axios from 'axios';
import { config } from '../config';

const client = new Anthropic({ apiKey: config.ANTHROPIC_API_KEY });

export interface IdentificationResult {
  identification: string;
  brand: string;
  model: string;
  serialNumber: string | null;
  ebayCategory: string;
  ebayCategoryId: string | null;
  confidence: number;
  alternativeIdentifications: Array<{ identification: string; confidence: number }>;
}

interface VisionOptions {
  imageUrls: string[];
  userCorrection?: string;
}

/** Fetch an image URL and return it as a base64 string + media type */
async function urlToBase64(url: string): Promise<{ data: string; mediaType: 'image/jpeg' | 'image/png' | 'image/gif' | 'image/webp' }> {
  const response = await axios.get(url, { responseType: 'arraybuffer', timeout: 15000 });
  const contentType = (response.headers['content-type'] as string) || 'image/jpeg';
  const mediaType = contentType.split(';')[0].trim() as 'image/jpeg' | 'image/png' | 'image/gif' | 'image/webp';
  const data = Buffer.from(response.data as ArrayBuffer).toString('base64');
  return { data, mediaType };
}

export async function identifyItem(opts: VisionOptions): Promise<IdentificationResult> {
  const { imageUrls, userCorrection } = opts;
  const start = Date.now();

  console.log(`[vision] Fetching ${imageUrls.length} image(s) as base64...`);

  // Fetch all images and convert to base64 so we don't rely on Anthropic fetching URLs
  const imageBase64s = await Promise.all(
    imageUrls.map((url) =>
      urlToBase64(url).catch((err) => {
        console.warn(`[vision] Failed to fetch image ${url}: ${(err as Error).message}`);
        return null;
      }),
    ),
  );

  const validImages = imageBase64s.filter(Boolean) as { data: string; mediaType: 'image/jpeg' | 'image/png' | 'image/gif' | 'image/webp' }[];
  console.log(`[vision] ${validImages.length}/${imageUrls.length} images fetched successfully`);

  if (validImages.length === 0) {
    throw new Error('Could not fetch any images for identification');
  }

  const imageContent: Anthropic.ImageBlockParam[] = validImages.map((img) => ({
    type: 'image',
    source: { type: 'base64', media_type: img.mediaType, data: img.data },
  }));

  const correctionNote = userCorrection
    ? `\n\nThe user says this is NOT correct. Their hint: "${userCorrection}". Please reconsider carefully.`
    : '';

  const systemPrompt = `You are an expert at identifying items for resale on online marketplaces.
Analyze these photos carefully. Your job is to:
1. Identify exactly what the item is (brand, model, specific variant if visible)
2. Find the serial number if visible in any photo
3. Identify the best marketplace category that fits this item
4. Return a confidence score from 0-100 for your identification

Respond ONLY in this exact JSON format:
{
  "identification": "Full item name and model",
  "brand": "Brand name",
  "model": "Model name/number",
  "serialNumber": "Serial number or null",
  "ebayCategory": "Best category name",
  "ebayCategoryId": "Category ID if known or null",
  "confidence": 85,
  "alternativeIdentifications": [
    {"identification": "Alternative guess 1", "confidence": 60},
    {"identification": "Alternative guess 2", "confidence": 40}
  ]
}`;

  console.log('[vision] Calling Claude API...');
  const response = await client.messages.create({
    model: 'claude-3-5-sonnet-20241022',
    max_tokens: 1024,
    system: systemPrompt,
    messages: [
      {
        role: 'user',
        content: [
          ...imageContent,
          {
            type: 'text',
            text: `Please identify this item from the photos.${correctionNote}`,
          },
        ],
      },
    ],
  });

  const latency = Date.now() - start;
  const inputTokens = response.usage.input_tokens;
  const outputTokens = response.usage.output_tokens;
  console.log(
    `[vision] claude-3-5-sonnet-20241022 input_tokens=${inputTokens} output_tokens=${outputTokens} latency=${latency}ms`,
  );

  const text = response.content[0].type === 'text' ? response.content[0].text : '';

  // Extract JSON from response (Claude sometimes wraps in markdown)
  const jsonMatch = text.match(/\{[\s\S]*\}/);
  if (!jsonMatch) {
    throw new Error(`Claude did not return valid JSON. Response: ${text.slice(0, 200)}`);
  }

  return JSON.parse(jsonMatch[0]) as IdentificationResult;
}
