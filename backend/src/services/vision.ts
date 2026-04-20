import Anthropic from '@anthropic-ai/sdk';
import axios from 'axios';
import { config } from '../config';

const client = new Anthropic({ apiKey: config.ANTHROPIC_API_KEY });

// Max images to send to Claude — keeps token usage reasonable
const MAX_VISION_IMAGES = 5;

export interface IdentificationResult {
  identification: string;
  brand: string;
  model: string;
  serialNumber: string | null;
  serialDecoding: string | null;
  ebayCategory: string;
  ebayCategoryId: string | null;
  confidence: number;
  alternativeIdentifications: Array<{ identification: string; confidence: number }>;
  researchDescription: string;
  researchLinks: Array<{ title: string; url: string; snippet: string }>;
  researchImages: Array<{ imageUrl: string; title: string; sourceUrl: string }>;
}

interface VisionOptions {
  imageUrls: string[];
  userCorrection?: string;
}

/**
 * If the URL is a plain Cloudinary upload URL (no existing transformations),
 * insert resize params so we download a small JPEG instead of a full-res photo.
 * Leave pre-transformed URLs unchanged to avoid conflicting transformation chains.
 */
function shrinkCloudinaryUrl(url: string): string {
  if (!url.includes('cloudinary.com')) return url;
  // Match /image/upload/ followed immediately by a version (v\d+) or the folder path.
  // If there are already transformation params after /upload/ (letters, underscores, commas)
  // we leave the URL alone.
  return url.replace(
    /\/image\/upload\/(v\d+\/|listai\/)/,
    '/image/upload/w_800,h_800,c_limit,q_70,f_jpg/$1',
  );
}

/** Fetch an image URL and return it as a base64 string + media type */
async function urlToBase64(url: string): Promise<{ data: string; mediaType: 'image/jpeg' | 'image/png' | 'image/gif' | 'image/webp' }> {
  const fetchUrl = shrinkCloudinaryUrl(url);
  const response = await axios.get(fetchUrl, { responseType: 'arraybuffer', timeout: 20000 });
  const contentType = (response.headers['content-type'] as string) || 'image/jpeg';
  const rawType = contentType.split(';')[0].trim();
  const mediaType: 'image/jpeg' | 'image/png' | 'image/gif' | 'image/webp' =
    rawType === 'image/png' ? 'image/png' :
    rawType === 'image/gif' ? 'image/gif' :
    rawType === 'image/webp' ? 'image/webp' :
    'image/jpeg';
  const data = Buffer.from(response.data as ArrayBuffer).toString('base64');
  return { data, mediaType };
}

/** Web search — returns top text results for research links */
async function searchForItem(query: string): Promise<Array<{ title: string; url: string; snippet: string }>> {
  if (!config.SERPER_API_KEY) return [];
  try {
    const response = await axios.post(
      'https://google.serper.dev/search',
      { q: query, num: 6 },
      {
        headers: { 'X-API-KEY': config.SERPER_API_KEY, 'Content-Type': 'application/json' },
        timeout: 10000,
      },
    );
    return ((response.data.organic as Array<{ title: string; link: string; snippet: string }>) || [])
      .slice(0, 4)
      .map((r) => ({ title: r.title, url: r.link, snippet: r.snippet }));
  } catch (err) {
    console.warn('[vision] Serper search failed:', (err as Error).message);
    return [];
  }
}

/** Image search — returns Google Images results so the user can visually confirm the item */
async function searchForImages(query: string): Promise<Array<{ imageUrl: string; title: string; sourceUrl: string }>> {
  if (!config.SERPER_API_KEY) return [];
  try {
    const response = await axios.post(
      'https://google.serper.dev/images',
      { q: query, num: 8 },
      {
        headers: { 'X-API-KEY': config.SERPER_API_KEY, 'Content-Type': 'application/json' },
        timeout: 10000,
      },
    );
    return ((response.data.images as Array<{ imageUrl: string; thumbnailUrl?: string; title: string; link: string }>) || [])
      .slice(0, 6)
      .map((r) => ({
        // thumbnailUrl is Google's cached copy — more reliable than hotlinked imageUrl
        imageUrl: r.thumbnailUrl || r.imageUrl,
        title: r.title,
        sourceUrl: r.link,
      }));
  } catch (err) {
    console.warn('[vision] Serper image search failed:', (err as Error).message);
    return [];
  }
}

export async function identifyItem(opts: VisionOptions): Promise<IdentificationResult> {
  const { imageUrls, userCorrection } = opts;
  const start = Date.now();

  const selectedUrls = imageUrls.slice(0, MAX_VISION_IMAGES);
  console.log(`[vision] Using ${selectedUrls.length} of ${imageUrls.length} image(s)`);

  const imageBase64s = await Promise.all(
    selectedUrls.map((url) =>
      urlToBase64(url).catch((err) => {
        console.warn(`[vision] Failed to fetch ${url}: ${(err as Error).message}`);
        return null;
      }),
    ),
  );

  const validImages = imageBase64s.filter(Boolean) as { data: string; mediaType: 'image/jpeg' | 'image/png' | 'image/gif' | 'image/webp' }[];
  console.log(`[vision] ${validImages.length}/${selectedUrls.length} images ready`);

  if (validImages.length === 0) {
    throw new Error('Could not fetch any images for identification');
  }

  const imageContent: Anthropic.ImageBlockParam[] = validImages.map((img) => ({
    type: 'image',
    source: { type: 'base64', media_type: img.mediaType, data: img.data },
  }));

  const correctionNote = userCorrection
    ? `\n\nThe user has additional context about what is wrong or different: "${userCorrection}". Please incorporate this carefully into your identification.`
    : '';

  const systemPrompt = `You are an expert at identifying items for resale on online marketplaces.
Analyze these photos carefully and return a JSON identification.

=== SERIAL NUMBER DETECTION — CRITICAL RULES ===
Look at ALL text visible in the photos. A serial number MUST be:
- Located under a label that explicitly says: "Serial", "Serial No", "S/N", "SN:", "Serial Number", "Ser No", "Ser#", "S/N:"
- A random-looking alphanumeric string (typically 8-20 characters), e.g. "XB3947201KS" or "C02XL0HJHV2Q"

NEVER extract as serial number:
- Dates — any text under "Date", "Mfg Date", "Manufactured", "Production", "Born On", month names (JAN/FEB/MAR/APR/MAY/JUN/JUL/AUG/SEP/OCT/NOV/DEC), year patterns
- Model or part numbers — text under "Model", "Model No", "Part No", "Item No", "Style No"
- Barcodes or UPC codes unless explicitly labeled as serial
- Anything that looks like a date pattern (e.g. "OCT 101982", "10/1982", "2024-03") — these are DATES not serials

If you are not 100% confident you found a TRUE serial number under a "Serial" label, return null.

=== SERIAL DECODING ===
If you found a serial number and can decode it (e.g. Nike style codes encode colorway, Apple serial numbers encode model/year/factory), describe what the serial reveals about the specific item variant in serialDecoding. This should be the PRIMARY driver for model and variant identification if the serial is definitive.

=== IDENTIFICATION PRIORITY ===
1. Serial number decoding (highest confidence — if serial definitively identifies the item)
2. Visible labels, tags, model numbers
3. Visual characteristics (color, shape, markings)

=== RESEARCH DESCRIPTION ===
Write 2-3 sentences describing the identified item: what makes different versions distinct, typical specs/variants, and what a buyer or seller most needs to know about this specific item.

Respond ONLY in this exact JSON format:
{
  "identification": "Full item name including specific variant if known",
  "brand": "Brand name",
  "model": "Model name/number",
  "serialNumber": "Only if found under a Serial label — otherwise null",
  "serialDecoding": "What the serial number reveals about this specific variant, or null",
  "ebayCategory": "Best eBay category name",
  "ebayCategoryId": "Category ID if known or null",
  "confidence": 85,
  "alternativeIdentifications": [
    {"identification": "Alternative guess 1", "confidence": 60},
    {"identification": "Alternative guess 2", "confidence": 40}
  ],
  "researchDescription": "2-3 sentence factual description of this item and what makes different versions distinct."
}`;

  console.log('[vision] Calling claude-sonnet-4-5-20250929...');
  const response = await client.messages.create({
    model: 'claude-sonnet-4-5-20250929',
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
  console.log(
    `[vision] done input=${response.usage.input_tokens} output=${response.usage.output_tokens} latency=${latency}ms`,
  );

  const text = response.content[0].type === 'text' ? response.content[0].text : '';
  const jsonMatch = text.match(/\{[\s\S]*\}/);
  if (!jsonMatch) {
    throw new Error(`Claude did not return valid JSON. Response: ${text.slice(0, 300)}`);
  }

  const result = JSON.parse(jsonMatch[0]) as Omit<IdentificationResult, 'researchLinks' | 'researchImages'>;

  // Build a targeted search query — serial number first if available, otherwise item name
  const searchQuery = result.serialNumber
    ? `"${result.serialNumber}" ${result.brand} ${result.model}`.trim()
    : `${result.identification} ${result.brand} specifications`.trim();

  // Image search uses a slightly different query focused on visual results
  const imageQuery = `${result.identification} ${result.brand}`.trim();

  console.log(`[vision] Running web + image search in parallel: "${searchQuery}"`);
  const [researchLinks, researchImages] = await Promise.all([
    searchForItem(searchQuery),
    searchForImages(imageQuery),
  ]);

  return { ...result, researchLinks, researchImages };
}
