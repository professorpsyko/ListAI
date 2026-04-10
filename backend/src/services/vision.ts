import Anthropic from '@anthropic-ai/sdk';
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

export async function identifyItem(opts: VisionOptions): Promise<IdentificationResult> {
  const { imageUrls, userCorrection } = opts;
  const start = Date.now();

  const imageContent: Anthropic.ImageBlockParam[] = imageUrls.map((url) => ({
    type: 'image',
    source: { type: 'url', url },
  }));

  const correctionNote = userCorrection
    ? `\n\nThe user says this is NOT correct. Their hint: "${userCorrection}". Please reconsider carefully.`
    : '';

  const systemPrompt = `You are an expert at identifying items for resale on eBay.
Analyze these photos carefully. Your job is to:
1. Identify exactly what the item is (brand, model, specific variant if visible)
2. Find the serial number if visible in any photo
3. Identify the eBay category that best fits this item
4. Return a confidence score from 0-100 for your identification

Respond ONLY in this exact JSON format:
{
  "identification": "Full item name and model",
  "brand": "Brand name",
  "model": "Model name/number",
  "serialNumber": "Serial number or null",
  "ebayCategory": "Best eBay category name",
  "ebayCategoryId": "eBay category ID if known or null",
  "confidence": 85,
  "alternativeIdentifications": [
    {"identification": "Alternative guess 1", "confidence": 60},
    {"identification": "Alternative guess 2", "confidence": 40}
  ]
}`;

  const response = await client.messages.create({
    model: 'claude-opus-4-5',
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
    `[Vision] model=claude-opus-4-5 input_tokens=${inputTokens} output_tokens=${outputTokens} latency=${latency}ms`,
  );

  const text = response.content[0].type === 'text' ? response.content[0].text : '';

  // Extract JSON from response (Claude sometimes wraps in markdown)
  const jsonMatch = text.match(/\{[\s\S]*\}/);
  if (!jsonMatch) {
    throw new Error('Claude did not return valid JSON for item identification');
  }

  return JSON.parse(jsonMatch[0]) as IdentificationResult;
}
