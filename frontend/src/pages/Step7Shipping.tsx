import { useEffect } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { useListingStore } from '../store/listingStore';
import { getSettings, updateListing } from '../lib/api';
import clsx from 'clsx';

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

const HANDLING_TIMES = [
  'Same day',
  '1 business day',
  '2 business days',
  '3 business days',
  '5 business days',
];

const RETURN_WINDOWS = [14, 30, 60];

export default function Step7Shipping() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const store = useListingStore();

  const { data: settings } = useQuery({ queryKey: ['settings'], queryFn: getSettings });

  const isFreeShipping = store.shippingService === "Free shipping (I'll build it into the price)";

  // Apply shipping suggestion + settings auto-fill on mount
  useEffect(() => {
    const suggestion = store.shippingSuggestion;
    const autoFill = settings?.autoFillShipping;

    if (!store.shippingService && suggestion) {
      if (autoFill) {
        store.setShippingService(suggestion.shippingService);
        store.setShippingCost(String(suggestion.estimatedCost));
        store.setHandlingTime(suggestion.handlingTime);
      } else {
        // Show suggestion as hint but don't auto-fill
      }
    }
  }, [settings, store.shippingSuggestion]);

  const canProceed = !!store.shippingService && (isFreeShipping || !!store.shippingCost);

  async function handleNext() {
    if (!id || !canProceed) return;
    await updateListing(id, {
      shippingService: store.shippingService,
      shippingCost: isFreeShipping ? 0 : parseFloat(store.shippingCost),
      handlingTime: store.handlingTime,
      acceptReturns: store.acceptReturns,
      returnWindow: store.acceptReturns ? store.returnWindow : undefined,
    });
    store.setCurrentStep(8);
    navigate(`/listing/${id}/step/8`);
  }

  const suggestion = store.shippingSuggestion;

  return (
    <div className="space-y-8 max-w-2xl">
      <div>
        <h2 className="text-2xl font-bold text-gray-900">Shipping</h2>
        <p className="text-gray-500 mt-1">How will you ship this item?</p>
      </div>

      <div className="grid grid-cols-2 gap-8">
        {/* Shipping service */}
        <div className="space-y-4">
          <div>
            <label className="block text-sm font-semibold text-gray-700 mb-1">
              Shipping service <span className="text-red-500">*</span>
            </label>
            {suggestion && (
              <p className="text-xs text-gray-400 mb-2">
                Suggested: {suggestion.shippingService}
              </p>
            )}
            <select
              value={store.shippingService}
              onChange={(e) => {
                store.setShippingService(e.target.value);
                if (e.target.value === "Free shipping (I'll build it into the price)") {
                  store.setShippingCost('0');
                }
              }}
              className="w-full border border-gray-300 rounded-lg px-3 py-2.5 focus:ring-2 focus:ring-blue-500 bg-white"
            >
              <option value="">Select shipping service…</option>
              {SHIPPING_SERVICES.map((s) => (
                <option key={s} value={s}>{s}</option>
              ))}
            </select>
          </div>

          {/* Handling time */}
          <div>
            <label className="block text-sm font-semibold text-gray-700 mb-1">I will ship within…</label>
            <select
              value={store.handlingTime}
              onChange={(e) => store.setHandlingTime(e.target.value)}
              className="w-full border border-gray-300 rounded-lg px-3 py-2.5 focus:ring-2 focus:ring-blue-500 bg-white"
            >
              <option value="">Select handling time…</option>
              {HANDLING_TIMES.map((h) => (
                <option key={h} value={h}>{h}</option>
              ))}
            </select>
          </div>
        </div>

        {/* Shipping cost + returns */}
        <div className="space-y-4">
          <div>
            <label className="block text-sm font-semibold text-gray-700 mb-1">
              Shipping cost <span className="text-red-500">*</span>
            </label>
            {suggestion && !isFreeShipping && (
              <p className="text-xs text-gray-400 mb-2">
                Suggested: ~${suggestion.estimatedCost.toFixed(2)}
              </p>
            )}
            {isFreeShipping ? (
              <div className="border border-green-300 bg-green-50 rounded-lg px-3 py-2.5 text-green-700 font-medium">
                FREE
              </div>
            ) : (
              <div className="relative">
                <span className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-500">$</span>
                <input
                  type="number"
                  min="0"
                  step="0.01"
                  value={store.shippingCost}
                  onChange={(e) => store.setShippingCost(e.target.value)}
                  placeholder="0.00"
                  className="w-full border border-gray-300 rounded-lg pl-7 pr-4 py-2.5 focus:ring-2 focus:ring-blue-500"
                />
              </div>
            )}
          </div>

          {/* Returns */}
          <div className="pt-2">
            <div className="flex items-center justify-between mb-3">
              <label className="text-sm font-semibold text-gray-700">Accept returns?</label>
              <button
                onClick={() => store.setAcceptReturns(!store.acceptReturns)}
                className={clsx(
                  'relative inline-flex h-6 w-11 items-center rounded-full transition-colors',
                  store.acceptReturns ? 'bg-blue-600' : 'bg-gray-300',
                )}
              >
                <span className={clsx(
                  'inline-block h-4 w-4 transform rounded-full bg-white transition-transform shadow',
                  store.acceptReturns ? 'translate-x-6' : 'translate-x-1',
                )} />
              </button>
            </div>

            {store.acceptReturns && (
              <div>
                <label className="block text-xs text-gray-500 mb-1">Return window</label>
                <div className="flex gap-2">
                  {RETURN_WINDOWS.map((d) => (
                    <button
                      key={d}
                      onClick={() => store.setReturnWindow(d)}
                      className={clsx(
                        'flex-1 py-1.5 rounded-lg text-sm font-medium border transition-colors',
                        store.returnWindow === d
                          ? 'bg-blue-600 text-white border-blue-600'
                          : 'border-gray-300 text-gray-600 hover:border-blue-400',
                      )}
                    >
                      {d} days
                    </button>
                  ))}
                </div>
              </div>
            )}
          </div>
        </div>
      </div>

      <div className="flex justify-between pt-4">
        <button onClick={() => navigate(`/listing/${id}/step/6`)}
          className="px-6 py-2.5 border border-gray-300 rounded-lg text-gray-700 hover:bg-gray-50 font-medium">
          ← Back
        </button>
        <button
          onClick={handleNext}
          disabled={!canProceed}
          className={clsx(
            'px-8 py-2.5 rounded-lg font-semibold text-white transition-colors',
            canProceed ? 'bg-blue-600 hover:bg-blue-700' : 'bg-gray-300 cursor-not-allowed',
          )}
        >
          Next: Preview →
        </button>
      </div>
    </div>
  );
}
