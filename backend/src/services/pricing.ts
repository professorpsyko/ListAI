import Anthropic from '@anthropic-ai/sdk';
import axios from 'axios';
import { config } from '../config';

const client = new Anthropic({ apiKey: config.ANTHROPIC_API_KEY });

export interface PricingSource {
  url: string;
  title: string;
  imageUrl?: string;
  price?: string;
}

export interface PricingResult {
  suggestedPrice: number;
  reasoning: string[];
  sourceUrls: string[];        // kept for backward compat
  sources?: PricingSource[];   // richer version used by new UI
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

interface EbayCompletedResult {
  summary: string;
  sources: PricingSource[];
}

async function searchEbayCompleted(itemName: string): Promise<EbayCompletedResult> {
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
        'outputSelector': 'SellingStatus,GalleryInfo',
      },
      timeout: 30000,
    });

    type EbayItem = {
      title: string[];
      viewItemURL: string[];
      galleryURL?: string[];
      sellingStatus: Array<{ currentPrice: Array<{ __value__: string }> }>;
    };

    const items: EbayItem[] = response.data?.findCompletedItemsResponse?.[0]?.searchResult?.[0]?.item || [];
    const sliced = items.slice(0, 6);

    const summary = sliced
      .map((item) => {
        const price = item.sellingStatus?.[0]?.currentPrice?.[0]?.['__value__'] || 'unknown';
        return `- ${item.title?.[0] || ''}: $${price}`;
      })
      .join('\n');

    const sources: PricingSource[] = sliced.map((item) => ({
      url: item.viewItemURL?.[0] || '',
      title: item.title?.[0] || '',
      imageUrl: item.galleryURL?.[0],
      price: item.sellingStatus?.[0]?.currentPrice?.[0]?.['__value__'],
    })).filter((s) => s.url);

    return { summary, sources };
  } catch (err) {
    console.warn('[Pricing] eBay Finding API error, skipping:', (err as Error).message);
    return { summary: 'eBay completed listings data unavailable', sources: [] };
  }
}

export async function researchPricing(opts: PricingOptions): Promise<PricingResult> {
  const { itemName, condition, category } = opts;
  const start = Date.now();

  const [ebayData, serperSold, serperGeneral] = await Promise.all([
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

  // Rich sources: eBay sold listings (with images) + Serper links
  const richSources: PricingSource[] = [
    ...ebayData.sources,
    ...[...serperSold, ...serperGeneral].slice(0, 3).map((r) => ({
      url: r.link,
      title: r.title,
    })),
  ].slice(0, 8);

  const prompt = `You are a pricing expert for eBay resellers. Based on the following market data,
recommend a competitive selling price for ${itemName} in ${condition} condition (category: ${category}).

eBay Completed/Sold Listings:
${ebayCompleted(ebayData.summary)}

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
  // Always attach the rich sources array
  result.sources = richSources;
  return result;
}

function ebayCompleted(data: string): string {
  return data || 'No eBay completed listings data available';
}
