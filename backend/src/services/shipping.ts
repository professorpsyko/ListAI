import Anthropic from '@anthropic-ai/sdk';
import { config } from '../config';

const client = new Anthropic({ apiKey: config.ANTHROPIC_API_KEY });

// These must match SHIPPING_SERVICES in the frontend Step7Shipping.tsx
const SERVICES = [
  'USPS First Class (under 1 lb)',
  'USPS Priority Mail',
  'USPS Priority Mail Express',
  'UPS Ground',
  'UPS 2-Day Air',
  'FedEx Ground',
  'FedEx 2Day',
  'Freight (large items)',
];

export interface ShippingSuggestion {
  recommendedService: string;
  estimatedCost: number;
  handlingTime: string;
  reasoning: string;
  /** Estimated cost for every service the seller might choose */
  costEstimates: Record<string, number>;
}

interface ShippingOptions {
  itemName: string;
  category: string;
  condition: string;
}

export async function suggestShipping(opts: ShippingOptions): Promise<ShippingSuggestion> {
  const { itemName, category, condition } = opts;

  const prompt = `You are a shipping cost expert for eBay sellers in the United States.

Given this item, estimate realistic USPS/UPS/FedEx shipping costs a seller would pay.
Base your estimates on the typical weight, dimensions, and fragility of this type of item.
Use current (2024) carrier rates.

Item: ${itemName}
Category: ${category}
Condition: ${condition}

Return ONLY valid JSON — no prose, no markdown fences:
{
  "recommendedService": "USPS Priority Mail",
  "estimatedCost": 8.95,
  "handlingTime": "1 business day",
  "reasoning": "Estimated 1-2 lbs; Priority Mail is reliable and cost-effective for this weight range.",
  "costEstimates": {
    "USPS First Class (under 1 lb)": 4.50,
    "USPS Priority Mail": 8.95,
    "USPS Priority Mail Express": 28.00,
    "UPS Ground": 12.50,
    "UPS 2-Day Air": 24.00,
    "FedEx Ground": 13.00,
    "FedEx 2Day": 26.00,
    "Freight (large items)": 150.00
  }
}

Rules:
- costEstimates must include all 8 services listed above
- If an item is under 1 lb, USPS First Class is the cheapest option (≤ $5)
- If an item is very heavy or large (appliances, furniture), Freight may be the only option
- estimatedCost must match the value for recommendedService in costEstimates`;

  const response = await client.messages.create({
    model: 'claude-haiku-4-5',
    max_tokens: 512,
    messages: [{ role: 'user', content: prompt }],
  });

  const text = response.content[0].type === 'text' ? response.content[0].text : '';
  const jsonMatch = text.match(/\{[\s\S]*\}/);
  if (!jsonMatch) throw new Error('AI did not return valid JSON for shipping suggestion');

  const result = JSON.parse(jsonMatch[0]) as ShippingSuggestion;

  // Ensure all services are present (fill missing with 0 so the frontend can still function)
  for (const svc of SERVICES) {
    if (!(svc in result.costEstimates)) {
      result.costEstimates[svc] = 0;
    }
  }

  console.log(
    `[Shipping] model=claude-haiku-4-5 tokens=${response.usage.input_tokens}+${response.usage.output_tokens} recommended=${result.recommendedService} $${result.estimatedCost}`,
  );

  return result;
}
