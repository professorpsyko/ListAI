import { useEffect, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { useListingStore } from '../store/listingStore';
import { getSettings, triggerPriceResearch, updateListing } from '../lib/api';
import { getDevPin, clearDevPin } from '../lib/devPins';
import { useStepAction } from '../hooks/useStepAction';

export default function Step4Pricing() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const store = useListingStore();
  const [ebaySearchQuery, setEbaySearchQuery] = useState('');
  const [editingSearch, setEditingSearch] = useState(false);
  const [usingPin, setUsingPin] = useState(false);

  const { data: settings } = useQuery({ queryKey: ['settings'], queryFn: getSettings });

  // Build default eBay search query from identification
  useEffect(() => {
    const name = store.identification?.identification || '';
    setEbaySearchQuery(name);
  }, [store.identification]);

  // Check for pinned pricing data, otherwise trigger research
  useEffect(() => {
    const pin = getDevPin(4);
    if (pin && store.pricingJobStatus === 'PENDING') {
      store.setPricingResearch(pin.pricingResearch);
      if (pin.suggestedPrice) store.setFinalPrice(pin.suggestedPrice);
      store.setPricingJobStatus('COMPLETE');
      setUsingPin(true);
      return;
    }
    if (id && store.pricingJobStatus === 'PENDING') {
      triggerPriceResearch(id).catch(() => {});
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id]);

  // Auto-fill price if setting enabled and not yet set
  useEffect(() => {
    if (settings?.autoFillSuggestedPrice && store.pricingResearch?.suggestedPrice && !store.finalPrice) {
      store.setFinalPrice(String(store.pricingResearch.suggestedPrice));
    }
  }, [settings, store.pricingResearch, store.finalPrice]);

  const isLoading = store.pricingJobStatus === 'QUEUED' || store.pricingJobStatus === 'PROCESSING';
  const pricing = store.pricingResearch;

  useStepAction('Next: Title \u2192', !store.finalPrice, handleNext);

  async function handleNext() {
    if (!id || !store.finalPrice) return;
    await updateListing(id, { finalPrice: parseFloat(store.finalPrice), suggestedPrice: pricing?.suggestedPrice });
    store.setCurrentStep(5);
    navigate(`/listing/${id}/step/5`);
  }

  function buildEbayUrl() {
    const encoded = encodeURIComponent(ebaySearchQuery);
    return `https://www.ebay.com/sch/i.html?_nkw=${encoded}&LH_Complete=1&LH_Sold=1`;
  }

  return (
    <div className="space-y-8">
      <div>
        <h2 className="text-2xl font-bold text-gray-900">Pricing research</h2>
        <p className="text-gray-500 mt-1">We researched recent sales to suggest a competitive price.</p>
      </div>

      {usingPin && (
        <div className="flex items-center justify-between bg-green-50 border border-green-200 rounded-lg px-3 py-2">
          <div className="flex items-center gap-2 text-sm text-green-700">
            <svg className="w-4 h-4 flex-shrink-0" fill="currentColor" viewBox="0 0 20 20">
              <path d="M9.049 2.927c.3-.921 1.603-.921 1.902 0l1.07 3.292a1 1 0 00.95.69h3.462c.969 0 1.371 1.24.588 1.81l-2.8 2.034a1 1 0 00-.364 1.118l1.07 3.292c.3.921-.755 1.688-1.54 1.118l-2.8-2.034a1 1 0 00-1.175 0l-2.8 2.034c-.784.57-1.838-.197-1.539-1.118l1.07-3.292a1 1 0 00-.364-1.118L2.98 8.72c-.783-.57-.38-1.81.588-1.81h3.461a1 1 0 00.951-.69l1.07-3.292z" />
            </svg>
            <span><strong>Pinned data</strong> — skipped pricing research API</span>
          </div>
          <button
            onClick={() => { clearDevPin(4); setUsingPin(false); store.setPricingJobStatus('PENDING'); store.setPricingResearch(null); if (id) triggerPriceResearch(id).catch(() => {}); }}
            className="text-xs text-green-600 hover:text-green-800 underline"
          >
            Run live
          </button>
        </div>
      )}

      <div className="grid grid-cols-2 gap-8">
        {/* Left — research results */}
        <div className="space-y-5">
          <h3 className="font-semibold text-gray-700">Market research</h3>

          {isLoading ? (
            <div className="space-y-3 animate-pulse">
              <div className="h-8 bg-gray-200 rounded w-32" />
              <div className="h-4 bg-gray-200 rounded w-full" />
              <div className="h-4 bg-gray-200 rounded w-4/5" />
              <div className="h-4 bg-gray-200 rounded w-3/5" />
            </div>
          ) : pricing ? (
            <>
              <div>
                <p className="text-sm text-gray-500 mb-1">Suggested price</p>
                <p className="text-3xl font-bold text-gray-900">${pricing.suggestedPrice.toFixed(2)}</p>
                <p className="text-sm text-gray-400 mt-1">Range: ${pricing.priceRange?.low} – ${pricing.priceRange?.high}</p>
              </div>

              <div>
                <p className="text-sm font-medium text-gray-700 mb-2">Reasoning</p>
                <ul className="space-y-1">
                  {pricing.reasoning.map((r, i) => (
                    <li key={i} className="text-sm text-gray-600 flex items-start gap-2">
                      <span className="text-blue-500 mt-0.5 flex-shrink-0">•</span>
                      {r}
                    </li>
                  ))}
                </ul>
              </div>

              {pricing.sourceUrls?.length > 0 && (
                <div>
                  <p className="text-sm font-medium text-gray-700 mb-2">Sources</p>
                  <ul className="space-y-1">
                    {pricing.sourceUrls.slice(0, 4).map((url, i) => (
                      <li key={i}>
                        <a href={url} target="_blank" rel="noopener noreferrer"
                          className="text-sm text-blue-600 hover:underline truncate block max-w-xs">
                          {new URL(url).hostname}
                        </a>
                      </li>
                    ))}
                  </ul>
                </div>
              )}

              {/* eBay completed listings link */}
              <div className="pt-2 border-t border-gray-100">
                <p className="text-xs text-gray-500 mb-2">Search eBay completed listings</p>
                <div className="flex items-center gap-2">
                  {editingSearch ? (
                    <>
                      <input
                        value={ebaySearchQuery}
                        onChange={(e) => setEbaySearchQuery(e.target.value)}
                        className="flex-1 border border-gray-300 rounded px-2 py-1 text-sm focus:ring-1 focus:ring-blue-500"
                      />
                      <button onClick={() => setEditingSearch(false)} className="text-xs text-gray-500 hover:text-gray-700">Done</button>
                      <a href={buildEbayUrl()} target="_blank" rel="noopener noreferrer"
                        className="text-xs bg-blue-600 text-white px-3 py-1 rounded hover:bg-blue-700">
                        Search eBay
                      </a>
                    </>
                  ) : (
                    <>
                      <a href={buildEbayUrl()} target="_blank" rel="noopener noreferrer"
                        className="text-sm text-blue-600 hover:underline flex-1 truncate">
                        View sold listings for "{ebaySearchQuery}"
                      </a>
                      <button onClick={() => setEditingSearch(true)} className="text-gray-400 hover:text-gray-600" title="Edit search">
                        <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15.232 5.232l3.536 3.536m-2.036-5.036a2.5 2.5 0 113.536 3.536L6.5 21.036H3v-3.572L16.732 3.732z" />
                        </svg>
                      </button>
                    </>
                  )}
                </div>
              </div>
            </>
          ) : store.pricingJobStatus === 'FAILED' ? (
            <div className="text-sm text-red-600">
              Pricing research failed. You can still enter a price manually.
            </div>
          ) : (
            <div className="text-sm text-gray-500">Waiting for pricing research to start…</div>
          )}
        </div>

        {/* Right — price input */}
        <div className="space-y-4">
          <h3 className="font-semibold text-gray-700">Your listing price</h3>
          <div>
            <div className="relative">
              <span className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-500 font-medium">$</span>
              <input
                type="number"
                min="0"
                step="0.01"
                value={store.finalPrice}
                onChange={(e) => store.setFinalPrice(e.target.value)}
                placeholder="0.00"
                className="w-full border border-gray-300 rounded-lg pl-7 pr-4 py-3 text-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
              />
            </div>
            {pricing && !store.finalPrice && (
              <p className="text-sm text-gray-400 mt-1.5">Suggested: ${pricing.suggestedPrice.toFixed(2)}</p>
            )}
          </div>

          {pricing && (
            <button
              onClick={() => store.setFinalPrice(String(pricing.suggestedPrice))}
              className="text-sm text-blue-600 hover:underline"
            >
              Use suggested price (${pricing.suggestedPrice.toFixed(2)})
            </button>
          )}
        </div>
      </div>

    </div>
  );
}
