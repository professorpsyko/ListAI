import { useEffect, useRef, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { useListingStore } from '../store/listingStore';
import { getSettings, triggerPriceResearch, updateListing } from '../lib/api';
import { getDevPin, clearDevPin } from '../lib/devPins';
import { useStepAction } from '../hooks/useStepAction';
import clsx from 'clsx';

// ── Animated pricing progress ─────────────────────────────────────────────────
const PRICING_STAGES = [
  { delay: 0,     pct: 8,  text: 'Scanning eBay sold listings…' },
  { delay: 2500,  pct: 28, text: 'Gathering recent sale prices…' },
  { delay: 6000,  pct: 48, text: 'Analysing condition & category…' },
  { delay: 11000, pct: 66, text: 'Comparing market trends…' },
  { delay: 17000, pct: 82, text: 'Calculating suggested price…' },
  { delay: 24000, pct: 93, text: 'Finalising research…' },
];

function usePricingProgress(active: boolean) {
  const [stageIdx, setStageIdx] = useState(0);
  const timersRef = useRef<ReturnType<typeof setTimeout>[]>([]);
  useEffect(() => {
    if (!active) { timersRef.current.forEach(clearTimeout); setStageIdx(0); return; }
    timersRef.current = PRICING_STAGES.map((s, i) => setTimeout(() => setStageIdx(i), s.delay));
    return () => timersRef.current.forEach(clearTimeout);
  }, [active]);
  return PRICING_STAGES[stageIdx] ?? PRICING_STAGES[PRICING_STAGES.length - 1];
}

function PricingProgressCard({ pct, text }: { pct: number; text: string }) {
  return (
    <div className="flex flex-col gap-3 py-2">
      <div className="flex items-center gap-3">
        <div className="relative w-8 h-8 flex-shrink-0">
          <div className="absolute inset-0 rounded-full border-[3px] border-blue-100" />
          <div className="absolute inset-0 rounded-full border-[3px] border-blue-500 border-t-transparent animate-spin" />
        </div>
        <p className="text-sm font-semibold text-blue-700 animate-pulse">{text}</p>
      </div>
      <div className="space-y-0.5">
        <div className="w-full h-1.5 bg-blue-100 rounded-full overflow-hidden">
          <div className="h-full bg-blue-500 rounded-full transition-all duration-700" style={{ width: `${pct}%` }} />
        </div>
        <p className="text-xs text-blue-400 text-right">{pct}%</p>
      </div>
    </div>
  );
}

// ── Shipping constants ────────────────────────────────────────────────────────
const SHIPPING_SERVICES = [
  'USPS First Class (under 1 lb)',
  'USPS Priority Mail',
  'USPS Priority Mail Express',
  'UPS Ground',
  'UPS 2-Day Air',
  'FedEx Ground',
  'FedEx 2Day',
  'Freight (large items)',
  'Local pickup only',
  "Free shipping (I'll build it into the price)",
];

const HANDLING_TIMES = ['Same day', '1 business day', '2 business days', '3 business days', '5 business days'];
const RETURN_WINDOWS = [14, 30, 60];

// ── Main component ────────────────────────────────────────────────────────────
export default function Step5PriceShipping() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const store = useListingStore();
  const [ebaySearchQuery, setEbaySearchQuery] = useState('');
  const [editingSearch, setEditingSearch] = useState(false);
  const [usingPin, setUsingPin] = useState(false);
  const [aiFilledService, setAiFilledService] = useState<string | null>(null);

  const { data: settings } = useQuery({ queryKey: ['settings'], queryFn: getSettings });

  useEffect(() => {
    setEbaySearchQuery(store.identification?.identification || '');
  }, [store.identification]);

  // Trigger pricing research
  useEffect(() => {
    const pin = getDevPin(5);
    if (pin && store.pricingJobStatus === 'PENDING') {
      store.setPricingResearch(pin.pricingResearch);
      if (pin.suggestedPrice) store.setFinalPrice(pin.suggestedPrice);
      store.setPricingJobStatus('COMPLETE');
      setUsingPin(true);
      return;
    }
    if (id && store.pricingJobStatus === 'PENDING') {
      store.setPricingJobStatus('QUEUED');
      triggerPriceResearch(id).catch(() => store.setPricingJobStatus('FAILED'));
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id]);

  // Auto-fill price
  useEffect(() => {
    if (settings?.autoFillSuggestedPrice && store.pricingResearch?.suggestedPrice && !store.finalPrice) {
      store.setFinalPrice(String(store.pricingResearch.suggestedPrice));
    }
  }, [settings, store.pricingResearch, store.finalPrice]);

  // Auto-fill shipping suggestion
  useEffect(() => {
    const suggestion = store.shippingSuggestion;
    if (!store.shippingService && suggestion && settings?.autoFillShipping) {
      store.setShippingService(suggestion.recommendedService);
      store.setShippingCost(String(suggestion.estimatedCost));
      store.setHandlingTime(suggestion.handlingTime);
    }
  }, [settings, store.shippingSuggestion]);

  const isLoading = store.pricingJobStatus === 'QUEUED' || store.pricingJobStatus === 'PROCESSING';
  const isQueuing = store.pricingJobStatus === 'PENDING';
  const pricing = store.pricingResearch;
  const { pct, text } = usePricingProgress(isLoading);
  const isFreeShipping = store.shippingService === "Free shipping (I'll build it into the price)";
  const suggestion = store.shippingSuggestion;

  const needsBIN = store.listingType === 'BUY_IT_NOW' || store.listingType === 'AUCTION_BIN';
  const needsBid = store.listingType === 'AUCTION' || store.listingType === 'AUCTION_BIN';
  const canProceed =
    (!needsBIN || !!store.finalPrice) &&
    (!needsBid || !!store.startingBid) &&
    !!store.shippingService &&
    (isFreeShipping || !!store.shippingCost);

  useStepAction('Next: Title →', !canProceed, handleNext);

  async function handleNext() {
    if (!id || !canProceed) return;
    await updateListing(id, {
      finalPrice: store.finalPrice ? parseFloat(store.finalPrice) : undefined,
      suggestedPrice: pricing?.suggestedPrice,
      listingType: store.listingType,
      startingBid: store.startingBid ? parseFloat(store.startingBid) : undefined,
      auctionDuration: store.auctionDuration,
      shippingService: store.shippingService,
      shippingCost: isFreeShipping ? 0 : parseFloat(store.shippingCost),
      handlingTime: store.handlingTime,
      acceptReturns: store.acceptReturns,
      returnWindow: store.acceptReturns ? store.returnWindow : undefined,
    });
    store.setCurrentStep(6);
    navigate(`/listing/${id}/step/6`);
  }

  function buildEbayUrl() {
    return `https://www.ebay.com/sch/i.html?_nkw=${encodeURIComponent(ebaySearchQuery)}&LH_Complete=1&LH_Sold=1`;
  }

  // Total cost to buyer
  const binPrice = parseFloat(store.finalPrice) || 0;
  const shipCost = isFreeShipping ? 0 : parseFloat(store.shippingCost) || 0;
  const bidPrice = parseFloat(store.startingBid) || 0;

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-2xl font-bold text-gray-900">Price & Shipping</h2>
        <p className="text-gray-500 mt-1">Set your price and shipping — buyers see the total cost before committing.</p>
      </div>

      {usingPin && (
        <div className="flex items-center justify-between bg-green-50 border border-green-200 rounded-lg px-3 py-2">
          <span className="text-sm text-green-700"><strong>Pinned data</strong> — skipped pricing API</span>
          <button onClick={() => { clearDevPin(5); setUsingPin(false); store.setPricingJobStatus('PENDING'); store.setPricingResearch(null); if (id) triggerPriceResearch(id).catch(() => {}); }}
            className="text-xs text-green-600 hover:text-green-800 underline">Run live</button>
        </div>
      )}

      {/* ── Three columns: Research | Price & Listing type | Shipping ── */}
      <div className="grid grid-cols-3 gap-6">

        {/* ── Col 1: Market research ── */}
        <div className="space-y-4">
          <h3 className="font-semibold text-gray-700 text-sm">Market research</h3>

          {isQueuing && (
            <div className="flex items-center gap-2 text-sm text-gray-400">
              <span className="inline-block w-2 h-2 rounded-full bg-gray-300 animate-pulse" />
              Queuing research…
            </div>
          )}
          {isLoading && <PricingProgressCard pct={pct} text={text} />}

          {!isLoading && !isQueuing && pricing && (
            <>
              <div>
                <p className="text-xs text-gray-500 mb-0.5">Suggested price</p>
                <p className="text-2xl font-bold text-gray-900">${pricing.suggestedPrice.toFixed(2)}</p>
                <p className="text-xs text-gray-400 mt-0.5">Range: ${pricing.priceRange?.low} – ${pricing.priceRange?.high}</p>
              </div>

              {/* eBay search link */}
              <div className="flex items-center gap-1.5">
                {editingSearch ? (
                  <>
                    <input value={ebaySearchQuery} onChange={(e) => setEbaySearchQuery(e.target.value)}
                      className="flex-1 border border-gray-300 rounded px-2 py-1 text-xs focus:ring-1 focus:ring-blue-500" />
                    <button onClick={() => setEditingSearch(false)} className="text-xs text-gray-400">Done</button>
                    <a href={buildEbayUrl()} target="_blank" rel="noopener noreferrer"
                      className="text-xs bg-blue-600 text-white px-2 py-1 rounded hover:bg-blue-700">Go</a>
                  </>
                ) : (
                  <>
                    <a href={buildEbayUrl()} target="_blank" rel="noopener noreferrer"
                      className="text-xs text-blue-600 hover:underline flex-1 truncate">
                      Search eBay completed listings
                    </a>
                    <button onClick={() => setEditingSearch(true)} className="text-gray-400 hover:text-gray-600">
                      <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15.232 5.232l3.536 3.536m-2.036-5.036a2.5 2.5 0 113.536 3.536L6.5 21.036H3v-3.572L16.732 3.732z" />
                      </svg>
                    </button>
                  </>
                )}
              </div>

              {/* Reasoning */}
              <div>
                <p className="text-xs font-medium text-gray-600 mb-1">Reasoning</p>
                <ul className="space-y-1">
                  {pricing.reasoning.map((r, i) => (
                    <li key={i} className="text-xs text-gray-500 flex items-start gap-1.5">
                      <span className="text-blue-400 mt-0.5 flex-shrink-0">•</span>{r}
                    </li>
                  ))}
                </ul>
              </div>

              {/* Sources */}
              {pricing.sources?.filter((s) => s.url).length ? (
                <div>
                  <p className="text-xs font-medium text-gray-600 mb-1">Sources</p>
                  <ul className="space-y-1.5">
                    {pricing.sources!.filter((s) => s.url).map((src, i) => (
                      <li key={i}>
                        <a href={src.url} target="_blank" rel="noopener noreferrer"
                          className="flex items-start gap-1.5 group rounded hover:bg-gray-50 p-0.5 -mx-0.5">
                          <div className="min-w-0 flex-1">
                            <p className="text-xs text-gray-700 group-hover:text-blue-600 truncate">
                              {src.price && <span className="font-semibold">${src.price} — </span>}
                              {src.title || new URL(src.url).hostname}
                            </p>
                            <p className="text-[10px] text-gray-400 truncate">{new URL(src.url).hostname}</p>
                          </div>
                        </a>
                      </li>
                    ))}
                  </ul>
                </div>
              ) : null}
            </>
          )}

          {!isLoading && !isQueuing && !pricing && store.pricingJobStatus === 'FAILED' && (
            <p className="text-xs text-red-500">Research failed — enter a price manually.</p>
          )}
        </div>

        {/* ── Col 2: Listing type + prices ── */}
        <div className="space-y-4">
          <h3 className="font-semibold text-gray-700 text-sm">Listing type & price</h3>

          {/* Type selector */}
          <div className="grid grid-cols-3 gap-1.5">
            {([
              { value: 'BUY_IT_NOW', label: 'Buy It Now', icon: '🏷️' },
              { value: 'AUCTION',    label: 'Auction',    icon: '🔨' },
              { value: 'AUCTION_BIN', label: 'Auction + BIN', icon: '🔨🏷️' },
            ] as const).map(({ value, label, icon }) => (
              <button key={value} onClick={() => store.setListingType(value)}
                className={clsx(
                  'flex flex-col items-center gap-0.5 rounded-xl border-2 py-2.5 px-1 text-xs font-medium transition-colors',
                  store.listingType === value
                    ? 'border-blue-500 bg-blue-50 text-blue-700'
                    : 'border-gray-200 bg-white text-gray-500 hover:border-gray-300',
                )}
              >
                <span className="text-base leading-none">{icon}</span>
                <span className="text-center leading-tight">{label}</span>
              </button>
            ))}
          </div>

          {/* Buy It Now price */}
          {(store.listingType === 'BUY_IT_NOW' || store.listingType === 'AUCTION_BIN') && (
            <div className="space-y-1">
              <label className="text-xs font-medium text-gray-700">Buy It Now price</label>
              <div className="relative">
                <span className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-500 font-medium text-sm">$</span>
                <input type="number" min="0" step="0.01" value={store.finalPrice}
                  onChange={(e) => store.setFinalPrice(e.target.value)} placeholder="0.00"
                  className="w-full border border-gray-300 rounded-lg pl-7 pr-3 py-2.5 text-base focus:ring-2 focus:ring-blue-500 focus:border-transparent" />
              </div>
              {pricing && (
                <div className="flex items-center justify-between">
                  <span className="text-xs text-gray-400">Suggested: <span className="text-gray-600 font-medium">${pricing.suggestedPrice.toFixed(2)}</span></span>
                  <button onClick={() => store.setFinalPrice(String(pricing.suggestedPrice))}
                    className="text-xs text-blue-600 hover:underline">Use</button>
                </div>
              )}
            </div>
          )}

          {/* Starting bid */}
          {(store.listingType === 'AUCTION' || store.listingType === 'AUCTION_BIN') && (
            <div className="space-y-1">
              <label className="text-xs font-medium text-gray-700">Starting bid</label>
              <div className="relative">
                <span className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-500 font-medium text-sm">$</span>
                <input type="number" min="0" step="0.01" value={store.startingBid}
                  onChange={(e) => store.setStartingBid(e.target.value)} placeholder="0.00"
                  className="w-full border border-gray-300 rounded-lg pl-7 pr-3 py-2.5 text-base focus:ring-2 focus:ring-blue-500 focus:border-transparent" />
              </div>
              {pricing && (() => {
                const rec = pricing.priceRange?.low ?? Math.round(pricing.suggestedPrice * 0.65 * 100) / 100;
                return (
                  <div className="flex items-center justify-between">
                    <span className="text-xs text-gray-400">Suggested start: <span className="text-gray-600 font-medium">${rec.toFixed(2)}</span></span>
                    <button onClick={() => store.setStartingBid(String(rec))} className="text-xs text-blue-600 hover:underline">Use</button>
                  </div>
                );
              })()}
            </div>
          )}

          {/* Auction duration */}
          {(store.listingType === 'AUCTION' || store.listingType === 'AUCTION_BIN') && (
            <div className="space-y-1">
              <label className="text-xs font-medium text-gray-700">Auction duration</label>
              <div className="flex gap-1.5">
                {[1, 3, 5, 7, 10].map((d) => (
                  <button key={d} onClick={() => store.setAuctionDuration(d)}
                    className={clsx('flex-1 py-1.5 rounded-lg border text-xs font-medium transition-colors',
                      store.auctionDuration === d
                        ? 'border-blue-500 bg-blue-50 text-blue-700'
                        : 'border-gray-200 text-gray-500 hover:border-gray-300',
                    )}>
                    {d}d
                  </button>
                ))}
              </div>
            </div>
          )}
        </div>

        {/* ── Col 3: Shipping ── */}
        <div className="space-y-4">
          <h3 className="font-semibold text-gray-700 text-sm">Shipping</h3>

          {/* Shipping service */}
          <div className="space-y-1">
            <label className="text-xs font-medium text-gray-700">
              Service <span className="text-red-500">*</span>
            </label>
            {store.shippingSuggestionStatus === 'LOADING' && !suggestion && (
              <p className="text-xs text-blue-400 flex items-center gap-1 mb-1">
                <span className="inline-block w-2 h-2 border-2 border-blue-400 border-t-transparent rounded-full animate-spin" />
                AI estimating…
              </p>
            )}
            {suggestion && (
              <p className="text-xs text-gray-400 mb-1">
                AI: <span className="font-medium text-gray-600">{suggestion.recommendedService}</span>
              </p>
            )}
            <select value={store.shippingService}
              onChange={(e) => {
                const svc = e.target.value;
                store.setShippingService(svc);
                if (svc === "Free shipping (I'll build it into the price)") {
                  store.setShippingCost('0'); setAiFilledService(null);
                } else if (suggestion?.costEstimates?.[svc] != null) {
                  store.setShippingCost(String(suggestion.costEstimates[svc]));
                  setAiFilledService(svc);
                } else {
                  setAiFilledService(null);
                }
              }}
              className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-blue-500 bg-white">
              <option value="">Select service…</option>
              {SHIPPING_SERVICES.map((s) => <option key={s} value={s}>{s}</option>)}
            </select>
          </div>

          {/* Shipping cost */}
          <div className="space-y-1">
            <div className="flex items-center justify-between">
              <label className="text-xs font-medium text-gray-700">Cost <span className="text-red-500">*</span></label>
              {aiFilledService && store.shippingService === aiFilledService && !isFreeShipping && (
                <span className="text-[10px] bg-blue-50 text-blue-600 border border-blue-200 rounded-full px-1.5 py-0.5">AI estimate</span>
              )}
            </div>
            {isFreeShipping ? (
              <div className="border border-green-300 bg-green-50 rounded-lg px-3 py-2 text-green-700 text-sm font-medium">FREE</div>
            ) : (
              <div className="relative">
                <span className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-500 text-sm">$</span>
                <input type="number" min="0" step="0.01" value={store.shippingCost}
                  onChange={(e) => { store.setShippingCost(e.target.value); setAiFilledService(null); }}
                  placeholder="0.00"
                  className="w-full border border-gray-300 rounded-lg pl-7 pr-3 py-2 text-sm focus:ring-2 focus:ring-blue-500" />
              </div>
            )}
          </div>

          {/* Handling time */}
          <div className="space-y-1">
            <label className="text-xs font-medium text-gray-700">Ships within</label>
            <select value={store.handlingTime} onChange={(e) => store.setHandlingTime(e.target.value)}
              className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-blue-500 bg-white">
              <option value="">Select…</option>
              {HANDLING_TIMES.map((h) => <option key={h} value={h}>{h}</option>)}
            </select>
          </div>

          {/* Returns */}
          <div>
            <div className="flex items-center justify-between mb-2">
              <label className="text-xs font-medium text-gray-700">Accept returns?</label>
              <button onClick={() => store.setAcceptReturns(!store.acceptReturns)}
                className={clsx('relative inline-flex h-5 w-9 items-center rounded-full transition-colors',
                  store.acceptReturns ? 'bg-blue-600' : 'bg-gray-300')}>
                <span className={clsx('inline-block h-3.5 w-3.5 transform rounded-full bg-white transition-transform shadow',
                  store.acceptReturns ? 'translate-x-[18px]' : 'translate-x-[3px]')} />
              </button>
            </div>
            {store.acceptReturns && (
              <div className="flex gap-1.5">
                {RETURN_WINDOWS.map((d) => (
                  <button key={d} onClick={() => store.setReturnWindow(d)}
                    className={clsx('flex-1 py-1 rounded-lg border text-xs font-medium transition-colors',
                      store.returnWindow === d ? 'border-blue-500 bg-blue-50 text-blue-700' : 'border-gray-200 text-gray-500 hover:border-gray-300')}>
                    {d}d
                  </button>
                ))}
              </div>
            )}
          </div>
        </div>
      </div>

      {/* ── Total cost to buyer summary ── */}
      {(binPrice > 0 || bidPrice > 0) && (
        <div className="bg-gray-50 border border-gray-200 rounded-xl p-4">
          <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-3">Total cost to buyer</p>
          <div className="flex flex-wrap gap-6 text-sm">
            {(store.listingType === 'BUY_IT_NOW' || store.listingType === 'AUCTION_BIN') && binPrice > 0 && (
              <div className="flex items-center gap-4">
                <span className="text-gray-500">Buy It Now</span>
                <span className="font-medium text-gray-700">${binPrice.toFixed(2)}</span>
                <span className="text-gray-400">+</span>
                <span className="text-gray-500">Shipping</span>
                <span className="font-medium text-gray-700">{isFreeShipping ? 'FREE' : shipCost > 0 ? `$${shipCost.toFixed(2)}` : '—'}</span>
                <span className="text-gray-400">=</span>
                <span className="text-lg font-bold text-gray-900">
                  ${(binPrice + shipCost).toFixed(2)}
                </span>
                {isFreeShipping && <span className="text-xs text-green-600 font-medium">Free shipping included</span>}
              </div>
            )}
            {(store.listingType === 'AUCTION' || store.listingType === 'AUCTION_BIN') && bidPrice > 0 && (
              <div className="flex items-center gap-4">
                <span className="text-gray-500">Starting bid</span>
                <span className="font-medium text-gray-700">${bidPrice.toFixed(2)}</span>
                <span className="text-gray-400">+</span>
                <span className="text-gray-500">Shipping</span>
                <span className="font-medium text-gray-700">{isFreeShipping ? 'FREE' : shipCost > 0 ? `$${shipCost.toFixed(2)}` : '—'}</span>
                <span className="text-gray-400">=</span>
                <span className="text-lg font-bold text-gray-900">
                  ${(bidPrice + shipCost).toFixed(2)} minimum
                </span>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
