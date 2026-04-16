import Anthropic from '@anthropic-ai/sdk';
import axios from 'axios';
import { config } from '../config';

const client = new Anthropic({ apiKey: config.ANTHROPIC_API_KEY });

export interface PricingResult {
  suggestedPrice: number;
  reasoning: string[];
  sourceUrls: string[];
  priceRange: { low: number; high: number };
}

interface PricingOptions {
  itemName: string;
  condition: string;
  category: string;
}

async function searchSerper(query: string): Promise<Array<{ title: string; link: string; snippet: string }>> {
  const response = await axios.post(
    'https://google.serper.dev/search',
    { q: query, num: 10 },
    {
      headers: { 'X-API-KEY': config.SERPER_API_KEY, 'Content-Type': 'application/json' },
      timeout: 30000,
    },
  );

  return (response.data.organic || []).map((r: { title: string; link: string; snippet: string }) => ({
    title: r.title,
    link: r.link,
    snippet: r.snippet,
  }));
}

async function searchEbayCompleted(itemName: string): Promise<string> {
  // eBay Finding API for completed/sold listings
  const baseUrl = config.EBAY_SANDBOX_MODE === 'true'
    ? 'https://svcs.sandbox.ebay.com/services/search/FindingService/v1'
    : 'https://svcs.ebay.com/services/search/FindingService/v1';

  try {
    const response = await axios.get(baseUrl, {
      params: {
        'OPERATION-NAME': 'findCompletedItems',
        'SERVICE-VERSION': '1.0.0',
        'SECURITY-APPNAME': config.EBAY_APP_ID,
        'RESPONSE-DATA-FORMAT': 'JSON',
        'keywords': itemName,
        'itemFilter(0).name': 'SoldItemsOnly',
        'itemFilter(0).value': 'true',
        'paginationInput.entriesPerPage': '10',
        'outputSelector': 'SellingStatus',
      },
      timeout: 30000,
    });

    const items = response.data?.findCompletedItemsResponse?.[0]?.searchResult?.[0]?.item || [];
    return items
      .slice(0, 5)
      .map((item: { title: string[]; sellingStatus: Array<{ currentPrice: Array<{ __value__: string }> }> }) => {
        const price = item.sellingStatus?.[0]?.currentPrice?.[0]?.['__value__'] || 'unknown';
        const title = item.title?.[0] || '';
        return `- ${title}: $${price}`;
      })
      .join('\n');
  } catch (err) {
    console.warn('[Pricing] eBay Finding API error, skipping:', (err as Error).message);
    return 'eBay completed listings data unavailable';
  }
}

export async function researchPricing(opts: PricingOptions): Promise<PricingResult> {
  const { itemName, condition, category } = opts;
  const start = Date.now();

  const [ebaySearchResults, serperSold, serperGeneral] = await Promise.all([
    searchEbayCompleted(itemName),
    searchSerper(`${itemName} sold price site:ebay.com`).catch(() => []),
    searchSerper(`${itemName} value resale price`).catch(() => []),
  ]);

  const serperText = [...serperSold, ...serperGeneral]
    .slice(0, 8)
    .map((r) => `- ${r.title}: ${r.snippet} (${r.link})`)
    .join('\n');

  const sourceUrls = [...serperSold, ...serperGeneral]
    .slice(0, 4)
    .map((r) => r.link)
    .filter(Boolean);

  const prompt = `You are a pricing expert for eBay resellers. Based on the following market data,
recommend a competitive selling price for ${itemName} in ${condition} condition (category: ${category}).

eBay Completed/Sold Listings:
${ebayCompleted(ebaySearchResults)}

Web Research Data:
${serperText || 'No web data available'}

Respond ONLY in valid JSON:
{
  "suggestedPrice": 149.99,
  "reasoning": ["Point 1 with specific data", "Point 2", "Point 3"],
  "sourceUrls": ["url1", "url2"],
  "priceRange": { "low": 120, "high": 175 }
}`;

  const response = await client.messages.create({
    model: 'claude-sonnet-4-5-20250929',
    max_tokens: 1024,
    messages: [{ role: 'user', content: prompt }],
  });

  const latency = Date.now() - start;
  console.log(
    `[Pricing] model=claude-sonnet-4-5-20250929 input_tokens=${response.usage.input_tokens} output_tokens=${response.usage.output_tokens} latency=${latency}ms`,
  );

  const text = response.content[0].type === 'text' ? response.content[0].text : '';
  const jsonMatch = text.match(/\{[\s\S]*\}/);
  if (!jsonMatch) {
    throw new Error('Claude did not return valid JSON for pricing');
  }

  const result = JSON.parse(jsonMatch[0]) as PricingResult;
  // Merge source URLs from Serper if Claude didn't include them
  if (!result.sourceUrls?.length && sourceUrls.length) {
    result.sourceUrls = sourceUrls;
  }
  return result;
}

function ebayCompleted(data: string): string {
  return data || 'No eBay completed listings data available';
}
