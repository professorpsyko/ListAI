import axios from 'axios';
import { parseStringPromise } from 'xml2js';
import { config } from '../config';

const SANDBOX_URL = 'https://api.sandbox.ebay.com/ws/api.dll';
const PRODUCTION_URL = 'https://api.ebay.com/ws/api.dll';

function getApiUrl(): string {
  return config.EBAY_SANDBOX_MODE === 'true' ? SANDBOX_URL : PRODUCTION_URL;
}

// Map common eBay error codes to user-friendly messages
const EBAY_ERROR_MAP: Record<number, string> = {
  21916628: 'Your eBay token has expired. Please reconnect your eBay account in Settings.',
  21916284: 'Item title is too long. Please shorten your title to 80 characters or fewer.',
  21916063: 'This item is not allowed on eBay. Please review eBay\'s prohibited items policy.',
  21916587: 'Invalid shipping service selected. Please choose a different shipping option.',
  21919014: 'You have reached your eBay selling limit. Contact eBay to increase your limit.',
  21916401: 'Invalid category. Please re-identify your item to get the correct category.',
  21916477: 'Price is required. Please enter a listing price.',
  240: 'Duplicate listing detected. This item may already be listed.',
  21916530: 'Payment method is required. Please set up eBay Managed Payments.',
  21916747: 'Photos are required. Please ensure your listing has at least one photo.',
  21916145: 'Description is required. Please add a description to your listing.',
  21916076: 'Invalid condition for this category.',
  21916110: 'Quantity must be at least 1.',
  931: 'Your eBay auth token has expired or is invalid. Generate a new User Token at developer.ebay.com → My Account → User Tokens, then update EBAY_AUTH_TOKEN in your Railway environment variables.',
  932: 'Your eBay auth token has expired. Please generate a new one at developer.ebay.com and update EBAY_AUTH_TOKEN in Railway.',
  21916984: 'IAF (OAuth) token is invalid or expired. Go to developer.ebay.com, generate a fresh User Access Token, and update EBAY_AUTH_TOKEN in Railway.',
  10007: 'Authentication failed. Please reconnect your eBay account.',
  291: 'Invalid user token. Please reconnect your eBay account in Settings.',
  21917053: 'Start price must be greater than zero for auction listings.',
  21916608: 'Reserve price must be higher than the start price.',
  21916178: 'Scheduled listing time is in the past.',
};

function mapEbayError(code: number, rawMessage: string): string {
  return EBAY_ERROR_MAP[code] || `eBay error: ${rawMessage} (code ${code})`;
}

interface ListingData {
  title: string;
  description: string;
  category: string;
  categoryId: string | null;
  condition: string;
  price: number;
  listingType: string;
  auctionDuration?: number;
  startingBid?: number;
  shippingService: string;
  shippingCost: number;
  handlingTime: string;
  acceptReturns: boolean;
  returnWindow?: number;
  imageUrls: string[];
}

// Map condition strings to eBay condition IDs
const CONDITION_MAP: Record<string, number> = {
  'New': 1000,
  'New other (see details)': 1500,
  'Manufacturer refurbished': 2000,
  'Seller refurbished': 2500,
  'Used — like new': 3000,
  'Used — good': 4000,
  'Used — acceptable': 5000,
  'For parts or not working': 7000,
};

// Map shipping service strings to eBay service names
const SHIPPING_SERVICE_MAP: Record<string, string> = {
  'USPS First Class (under 1 lb)': 'USPSFirstClass',
  'USPS Priority Mail': 'USPSPriority',
  'USPS Priority Mail Express': 'USPSPriorityMailExpress',
  'UPS Ground': 'UPS',
  'UPS 2-Day Air': 'UPS2ndDay',
  'FedEx Ground': 'FedExGround',
  'FedEx 2Day': 'FedEx2Day',
  'Freight (large items)': 'FreightQuote',
  'Local pickup only': 'LocalPickup',
  'Free shipping (I\'ll build it into the price)': 'USPSPriority',
};

export interface PublishResult {
  ebayItemId: string;
  listingUrl: string;
}

export async function publishListing(data: ListingData, overrideToken?: string): Promise<PublishResult> {
  const isSandbox = config.EBAY_SANDBOX_MODE === 'true';
  if (isSandbox) {
    console.warn('[eBay] ⚠️  SANDBOX mode is ON — listing will NOT appear on real eBay. Set EBAY_SANDBOX_MODE=false to publish live.');
  }

  // Use per-user OAuth token when available; fall back to env var for legacy setups
  const token = overrideToken || config.EBAY_AUTH_TOKEN;
  if (!token) {
    throw new Error('No eBay token available. Please connect your eBay account in Settings.');
  }

  // Detect token type:
  //  - Legacy Auth'n'Auth tokens start with "v^1.1#" and go in <eBayAuthToken> XML element
  //  - Modern OAuth user access tokens go in Authorization: Bearer header (NOT in XML)
  const isLegacyToken = token.startsWith('v^1.1');
  console.log(`[eBay] Token type: ${isLegacyToken ? 'legacy Auth\'n\'Auth (XML)' : 'OAuth Bearer (header)'}`);

  const conditionId = CONDITION_MAP[data.condition] ?? 4000;
  const shippingServiceCode = SHIPPING_SERVICE_MAP[data.shippingService] ?? 'USPSPriority';
  const isFreeShipping = data.shippingCost === 0 || data.shippingService.includes('Free shipping');

  const pictureDetails = data.imageUrls
    .slice(0, 12) // eBay max 12 photos free
    .map((url) => `<PictureURL>${url}</PictureURL>`)
    .join('\n');

  const listingTypeXml = data.listingType === 'AUCTION'
    ? `<ListingType>Chinese</ListingType>
       <ListingDuration>Days_${data.auctionDuration ?? 7}</ListingDuration>`
    : `<ListingType>FixedPriceItem</ListingType>
       <ListingDuration>GTC</ListingDuration>`;

  const returnsXml = data.acceptReturns
    ? `<ReturnPolicy>
        <ReturnsAcceptedOption>ReturnsAccepted</ReturnsAcceptedOption>
        <RefundOption>MoneyBack</RefundOption>
        <ReturnsWithinOption>Days_${data.returnWindow ?? 30}</ReturnsWithinOption>
        <ShippingCostPaidByOption>Buyer</ShippingCostPaidByOption>
       </ReturnPolicy>`
    : `<ReturnPolicy>
        <ReturnsAcceptedOption>ReturnsNotAccepted</ReturnsAcceptedOption>
       </ReturnPolicy>`;

  const xml = `<?xml version="1.0" encoding="utf-8"?>
<AddItemRequest xmlns="urn:ebay:apis:eBLBaseComponents">
  <RequesterCredentials>
    ${isLegacyToken ? `<eBayAuthToken>${token}</eBayAuthToken>` : ''}
  </RequesterCredentials>
  <Item>
    <Title>${escapeXml(data.title.slice(0, 80))}</Title>
    <Description><![CDATA[${data.description}]]></Description>
    <PrimaryCategory>
      <CategoryID>${data.categoryId || '9355'}</CategoryID>
    </PrimaryCategory>
    <ConditionID>${conditionId}</ConditionID>
    <StartPrice>${data.listingType === 'AUCTION' ? (data.startingBid ?? 0.99) : data.price}</StartPrice>
    ${listingTypeXml}
    <Country>US</Country>
    <Currency>USD</Currency>
    <DispatchTimeMax>3</DispatchTimeMax>
    <ShippingDetails>
      <ShippingServiceOptions>
        <ShippingServicePriority>1</ShippingServicePriority>
        <ShippingService>${shippingServiceCode}</ShippingService>
        <ShippingServiceCost>${isFreeShipping ? 0 : data.shippingCost}</ShippingServiceCost>
        <FreeShipping>${isFreeShipping}</FreeShipping>
      </ShippingServiceOptions>
    </ShippingDetails>
    <PictureDetails>
      ${pictureDetails}
    </PictureDetails>
    ${returnsXml}
  </Item>
</AddItemRequest>`;

  const response = await axios.post(getApiUrl(), xml, {
    headers: {
      'X-EBAY-API-SITEID': '0',
      'X-EBAY-API-COMPATIBILITY-LEVEL': '967',
      'X-EBAY-API-CALL-NAME': 'AddItem',
      'X-EBAY-API-APP-NAME': config.EBAY_APP_ID,
      'X-EBAY-API-DEV-NAME': config.EBAY_DEV_ID,
      'X-EBAY-API-CERT-NAME': config.EBAY_CERT_ID,
      'Content-Type': 'text/xml',
      // OAuth tokens go in the Authorization header; legacy tokens are in the XML body
      ...(!isLegacyToken && { 'Authorization': `Bearer ${token}` }),
    },
    timeout: 30000,
  });

  const parsed = await parseStringPromise(response.data, { explicitArray: false });
  const result = parsed.AddItemResponse;

  if (result.Ack === 'Failure' || (result.Ack !== 'Success' && result.Ack !== 'Warning')) {
    const errors = result.Errors
      ? (Array.isArray(result.Errors) ? result.Errors : [result.Errors])
      : [];
    const firstError = errors[0];
    const code = parseInt(firstError?.ErrorCode ?? '0', 10);
    const rawMessage = firstError?.LongMessage ?? firstError?.ShortMessage ?? 'Unknown eBay error';
    console.error('[eBay] Publish failed:', { ack: result.Ack, code, rawMessage, errors });
    throw new Error(mapEbayError(code, rawMessage));
  }

  if (result.Ack === 'Warning' && result.Errors) {
    const warnings = Array.isArray(result.Errors) ? result.Errors : [result.Errors];
    console.warn('[eBay] Publish warnings:', warnings.map((w: { ShortMessage?: string }) => w.ShortMessage));
  }

  const itemId = result.ItemID;
  console.log(`[eBay] ✓ Published item ${itemId} (${isSandbox ? 'SANDBOX' : 'PRODUCTION'})`);
  const listingUrl = isSandbox
    ? `https://sandbox.ebay.com/itm/${itemId}`
    : `https://www.ebay.com/itm/${itemId}`;

  return { ebayItemId: itemId, listingUrl };
}

function escapeXml(str: string): string {
  return str
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;');
}
