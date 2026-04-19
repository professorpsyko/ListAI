import axios from 'axios';
import { parseStringPromise } from 'xml2js';
import { config } from '../config';

const SANDBOX_URL = 'https://api.sandbox.ebay.com/ws/api.dll';
const PRODUCTION_URL = 'https://api.ebay.com/ws/api.dll';

function getApiUrl(): string {
  return config.EBAY_SANDBOX_MODE === 'true' ? SANDBOX_URL : PRODUCTION_URL;
}

function getRestBase(): string {
  return config.EBAY_SANDBOX_MODE === 'true'
    ? 'https://api.sandbox.ebay.com'
    : 'https://api.ebay.com';
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
  10009: 'Item location is required. Please try again.',
  931: 'Your eBay auth token has expired or is invalid. Please reconnect your eBay account in Settings.',
  932: 'Your eBay auth token has expired. Please reconnect your eBay account in Settings.',
  21916984: 'OAuth token is invalid or expired. Please reconnect your eBay account in Settings.',
  10007: 'Authentication failed. Please reconnect your eBay account.',
  291: 'Invalid user token. Please reconnect your eBay account in Settings.',
  21917053: 'Start price must be greater than zero for auction listings.',
  21916608: 'Reserve price must be higher than the start price.',
  21916178: 'Scheduled listing time is in the past.',
  21919456: 'Business policies error — could not load your eBay shipping/return policies. Please try again.',
  21920370: 'eBay deprecation warning for item aspects — listing may have been created. Check your eBay Seller Hub.',
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

// ─── Business Policies ────────────────────────────────────────────────────────

interface SellerPolicies {
  fulfillmentPolicyId: string | null;
  returnPolicyId: string | null;
  paymentPolicyId: string | null;
}

/**
 * Fetch the seller's existing Business Policies via the eBay Account REST API.
 * Sellers who have opted into Business Policies cannot use legacy ShippingDetails /
 * ReturnPolicy XML fields — they must reference policy IDs via <SellerProfiles>.
 */
async function fetchSellerPolicies(token: string): Promise<SellerPolicies> {
  const base = getRestBase();
  const headers = {
    Authorization: `Bearer ${token}`,
    'X-EBAY-C-MARKETPLACE-ID': 'EBAY_US',
    'Accept': 'application/json',
  };

  const [fp, rp, pp] = await Promise.allSettled([
    axios.get(`${base}/sell/account/v1/fulfillment_policy?marketplace_id=EBAY_US`, { headers, timeout: 10000 }),
    axios.get(`${base}/sell/account/v1/return_policy?marketplace_id=EBAY_US`, { headers, timeout: 10000 }),
    axios.get(`${base}/sell/account/v1/payment_policy?marketplace_id=EBAY_US`, { headers, timeout: 10000 }),
  ]);

  // Log any failures so we can diagnose scope / auth issues
  if (fp.status === 'rejected') console.warn('[eBay] fulfillment_policy fetch failed:', fp.reason?.response?.data ?? fp.reason?.message);
  if (rp.status === 'rejected') console.warn('[eBay] return_policy fetch failed:', rp.reason?.response?.data ?? rp.reason?.message);
  if (pp.status === 'rejected') console.warn('[eBay] payment_policy fetch failed:', pp.reason?.response?.data ?? pp.reason?.message);

  const fulfillmentPolicyId =
    fp.status === 'fulfilled' ? (fp.value.data?.fulfillmentPolicies?.[0]?.fulfillmentPolicyId ?? null) : null;
  const returnPolicyId =
    rp.status === 'fulfilled' ? (rp.value.data?.returnPolicies?.[0]?.returnPolicyId ?? null) : null;
  const paymentPolicyId =
    pp.status === 'fulfilled' ? (pp.value.data?.paymentPolicies?.[0]?.paymentPolicyId ?? null) : null;

  console.log('[eBay] Seller policies:', { fulfillmentPolicyId, returnPolicyId, paymentPolicyId });
  return { fulfillmentPolicyId, returnPolicyId, paymentPolicyId };
}

// ─── Publish ──────────────────────────────────────────────────────────────────

export interface PublishResult {
  ebayItemId: string;
  listingUrl: string;
}

export async function publishListing(
  data: ListingData,
  overrideToken?: string,
  storedPolicyIds?: { fulfillmentPolicyId?: string | null; returnPolicyId?: string | null; paymentPolicyId?: string | null },
): Promise<PublishResult> {
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

  // Resolve business policy IDs:
  //   1. Use stored IDs from user settings (fastest, no extra API call)
  //   2. Fall back to Account REST API fetch (requires sell.account.readonly scope)
  //   3. Fall back to legacy fields (rejected if seller has opted into Business Policies)
  let sellerPolicies: SellerPolicies | null = null;

  if (storedPolicyIds?.fulfillmentPolicyId) {
    // Use pre-saved policy IDs — no API call needed
    sellerPolicies = {
      fulfillmentPolicyId: storedPolicyIds.fulfillmentPolicyId ?? null,
      returnPolicyId: storedPolicyIds.returnPolicyId ?? null,
      paymentPolicyId: storedPolicyIds.paymentPolicyId ?? null,
    };
    console.log('[eBay] Using stored seller policy IDs:', sellerPolicies);
  } else if (!isLegacyToken) {
    try {
      sellerPolicies = await fetchSellerPolicies(token);
    } catch (err) {
      console.warn('[eBay] Could not fetch seller policies, will try legacy fields:', (err as Error).message);
    }
  }

  const useBusinessPolicies = !!(sellerPolicies?.fulfillmentPolicyId);
  console.log(`[eBay] Using ${useBusinessPolicies ? 'Business Policies' : 'legacy'} shipping/returns fields`);

  const conditionId = CONDITION_MAP[data.condition] ?? 4000;
  const shippingServiceCode = SHIPPING_SERVICE_MAP[data.shippingService] ?? 'USPSPriority';
  const isFreeShipping = data.shippingCost === 0 || data.shippingService.includes('Free shipping');

  console.log('[eBay] Listing details:', {
    category: data.category,
    categoryId: data.categoryId,
    conditionId,
    title: data.title.slice(0, 40),
  });

  const pictureDetails = data.imageUrls
    .slice(0, 12) // eBay max 12 photos free
    .map((url) => `<PictureURL>${url}</PictureURL>`)
    .join('\n');

  const listingTypeXml = data.listingType === 'AUCTION'
    ? `<ListingType>Chinese</ListingType>
       <ListingDuration>Days_${data.auctionDuration ?? 7}</ListingDuration>`
    : `<ListingType>FixedPriceItem</ListingType>
       <ListingDuration>GTC</ListingDuration>`;

  // Business Policies: reference existing policy IDs (no legacy fields)
  const sellerProfilesXml = useBusinessPolicies
    ? `<SellerProfiles>
        <SellerShippingProfile>
          <ShippingProfileID>${sellerPolicies!.fulfillmentPolicyId}</ShippingProfileID>
        </SellerShippingProfile>
        ${sellerPolicies!.returnPolicyId ? `<SellerReturnProfile>
          <ReturnProfileID>${sellerPolicies!.returnPolicyId}</ReturnProfileID>
        </SellerReturnProfile>` : ''}
        ${sellerPolicies!.paymentPolicyId ? `<SellerPaymentProfile>
          <PaymentProfileID>${sellerPolicies!.paymentPolicyId}</PaymentProfileID>
        </SellerPaymentProfile>` : ''}
      </SellerProfiles>`
    : '';

  // Legacy shipping/return fields (only used when not on Business Policies)
  const legacyShippingXml = !useBusinessPolicies
    ? `<ShippingDetails>
        <ShippingServiceOptions>
          <ShippingServicePriority>1</ShippingServicePriority>
          <ShippingService>${shippingServiceCode}</ShippingService>
          <ShippingServiceCost>${isFreeShipping ? 0 : data.shippingCost}</ShippingServiceCost>
          <FreeShipping>${isFreeShipping}</FreeShipping>
        </ShippingServiceOptions>
      </ShippingDetails>`
    : '';

  const legacyReturnsXml = !useBusinessPolicies
    ? (data.acceptReturns
        ? `<ReturnPolicy>
            <ReturnsAcceptedOption>ReturnsAccepted</ReturnsAcceptedOption>
            <RefundOption>MoneyBack</RefundOption>
            <ReturnsWithinOption>Days_${data.returnWindow ?? 30}</ReturnsWithinOption>
            <ShippingCostPaidByOption>Buyer</ShippingCostPaidByOption>
           </ReturnPolicy>`
        : `<ReturnPolicy>
            <ReturnsAcceptedOption>ReturnsNotAccepted</ReturnsAcceptedOption>
           </ReturnPolicy>`)
    : '';

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
    <Location>United States</Location>
    <Currency>USD</Currency>
    <DispatchTimeMax>3</DispatchTimeMax>
    ${legacyShippingXml}
    <PictureDetails>
      ${pictureDetails}
    </PictureDetails>
    ${legacyReturnsXml}
    ${sellerProfilesXml}
    <ItemSpecifics>
      <NameValueList>
        <Name>Graded</Name>
        <Value>No</Value>
      </NameValueList>
    </ItemSpecifics>
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

  console.log('[eBay] Raw response (first 1000 chars):', String(response.data).slice(0, 1000));
  const parsed = await parseStringPromise(response.data, { explicitArray: false });
  const result = parsed.AddItemResponse;

  const itemId = result.ItemID;

  // Collect any errors/warnings for logging
  const allErrors = result.Errors
    ? (Array.isArray(result.Errors) ? result.Errors : [result.Errors])
    : [];

  if (result.Ack === 'Warning' || (allErrors.length && result.Ack !== 'Failure')) {
    console.warn('[eBay] Publish warnings:', allErrors.map((w: { ShortMessage?: string; ErrorCode?: string }) => `[${w.ErrorCode}] ${w.ShortMessage}`));
  }

  // If eBay returned an ItemID, the listing was created — treat as success even if Ack is
  // non-standard (e.g. deprecation warnings eBay now surfaces as "Failure" for some categories)
  if (!itemId && (result.Ack === 'Failure' || (result.Ack !== 'Success' && result.Ack !== 'Warning'))) {
    const firstError = allErrors[0];
    const code = parseInt(firstError?.ErrorCode ?? '0', 10);
    const rawMessage = firstError?.LongMessage ?? firstError?.ShortMessage ?? 'Unknown eBay error';
    console.error('[eBay] Publish failed:', { ack: result.Ack, code, rawMessage, errors: allErrors });
    throw new Error(mapEbayError(code, rawMessage));
  }

  if (itemId && result.Ack !== 'Success') {
    console.warn(`[eBay] Listing created (${itemId}) but Ack was "${result.Ack}" — treating as success`);
  }
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
