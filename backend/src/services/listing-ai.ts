import Anthropic from '@anthropic-ai/sdk';
import { config } from '../config';
import { retrieveSimilarListings } from './rag';

const client = new Anthropic({ apiKey: config.ANTHROPIC_API_KEY });

interface ListingContext {
  identification: string;
  brand: string;
  model: string;
  condition: string;
  color: string;
  serialNumber: string | null;
  specialNotes: string;
  category: string;
}

export async function generateTitle(userId: string, ctx: ListingContext): Promise<string> {
  const start = Date.now();

  // Retrieve past titles from RAG — if unavailable, continue without them
  let pastTitles = '(no past titles yet)';
  try {
    const similar = await retrieveSimilarListings(userId, `${ctx.identification} ${ctx.category}`, 5);
    if (similar.length) pastTitles = similar.map((s) => `- ${s.title}`).join('\n');
  } catch (ragErr) {
    console.warn('[ListingAI/title] RAG unavailable, continuing without past titles:', (ragErr as Error).message);
  }

  const response = await client.messages.create({
    model: 'claude-sonnet-4-5-20250929',
    max_tokens: 200,
    system: `You are an expert eBay seller who writes high-converting listing titles.
eBay titles must be under 80 characters. Use specific keywords buyers search for.
Include brand, model, condition keywords, and notable specs. No punctuation except hyphens.
No ALL CAPS. Study the user's past title style and match it.`,
    messages: [
      {
        role: 'user',
        content: `Write an eBay listing title for:
Item: ${ctx.identification}
Condition: ${ctx.condition}
Color: ${ctx.color || 'N/A'}
Special notes: ${ctx.specialNotes || 'none'}

The user's past titles for reference (match their style):
${pastTitles}

Return ONLY the title, nothing else. Under 80 characters.`,
      },
    ],
  });

  const latency = Date.now() - start;
  console.log(
    `[ListingAI/title] model=claude-sonnet-4-5-20250929 input_tokens=${response.usage.input_tokens} output_tokens=${response.usage.output_tokens} latency=${latency}ms`,
  );

  const title = response.content[0].type === 'text' ? response.content[0].text.trim() : '';
  return title.slice(0, 80);
}

export async function generateDescription(userId: string, ctx: ListingContext): Promise<string> {
  const start = Date.now();

  // Retrieve past descriptions from RAG — if unavailable, continue without them
  let pastDescriptions = '(no past descriptions yet)';
  try {
    const similar = await retrieveSimilarListings(userId, `${ctx.identification} ${ctx.category}`, 5);
    if (similar.length) pastDescriptions = similar.map((s) => `---\n${s.description}`).join('\n');
  } catch (ragErr) {
    console.warn('[ListingAI/description] RAG unavailable, continuing without past descriptions:', (ragErr as Error).message);
  }

  const response = await client.messages.create({
    model: 'claude-sonnet-4-5-20250929',
    max_tokens: 1024,
    system: `You are an expert eBay seller who writes clear, honest, buyer-friendly
listing descriptions. Study the user's past description style carefully and match
their tone, length, and format. Be factual. Do not invent specs you don't know.
Include condition details, what's included in the sale, and any buyer notes.`,
    messages: [
      {
        role: 'user',
        content: `Write an eBay listing description for:
Item: ${ctx.identification}
Brand: ${ctx.brand}, Model: ${ctx.model}
Condition: ${ctx.condition}
Color: ${ctx.color || 'N/A'}
Serial number: ${ctx.serialNumber || 'not visible'}
Special notes from seller: ${ctx.specialNotes || 'none'}

User's past descriptions for style reference:
${pastDescriptions}`,
      },
    ],
  });

  const latency = Date.now() - start;
  console.log(
    `[ListingAI/description] model=claude-sonnet-4-5-20250929 input_tokens=${response.usage.input_tokens} output_tokens=${response.usage.output_tokens} latency=${latency}ms`,
  );

  return response.content[0].type === 'text' ? response.content[0].text.trim() : '';
}

export interface ShippingSuggestion {
  shippingService: string;
  estimatedCost: number;
  handlingTime: string;
  reasoning: string;
}

export async function suggestShipping(ctx: {
  itemName: string;
  condition: string;
  category: string;
}): Promise<ShippingSuggestion> {
  const start = Date.now();

  const response = await client.messages.create({
    model: 'claude-sonnet-4-5-20250929',
    max_tokens: 512,
    messages: [
      {
        role: 'user',
        content: `Recommend eBay shipping for this item. Be specific about size/weight assumptions.
Item: ${ctx.itemName}
Condition: ${ctx.condition}
Category: ${ctx.category}

Respond ONLY in valid JSON:
{
  "shippingService": "USPS Priority Mail",
  "estimatedCost": 9.99,
  "handlingTime": "2 business days",
  "reasoning": "Brief explanation"
}`,
      },
    ],
  });

  const latency = Date.now() - start;
  console.log(
    `[ListingAI/shipping] model=claude-sonnet-4-5-20250929 input_tokens=${response.usage.input_tokens} output_tokens=${response.usage.output_tokens} latency=${latency}ms`,
  );

  const text = response.content[0].type === 'text' ? response.content[0].text : '';
  const jsonMatch = text.match(/\{[\s\S]*\}/);
  if (!jsonMatch) {
    return { shippingService: 'USPS Priority Mail', estimatedCost: 9.99, handlingTime: '2 business days', reasoning: '' };
  }
  return JSON.parse(jsonMatch[0]) as ShippingSuggestion;
}
