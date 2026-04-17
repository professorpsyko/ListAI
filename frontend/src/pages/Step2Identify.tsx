import { useEffect, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { useListingStore } from '../store/listingStore';
import { identifyItem, retryIdentify, triggerPriceResearch } from '../lib/api';
import type { IdentificationResult } from '../store/listingStore';
import clsx from 'clsx';

export default function Step2Identify() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const store = useListingStore();

  const [retryCount, setRetryCount] = useState(0);
  const [userCorrection, setUserCorrection] = useState('');
  const [showManual, setShowManual] = useState(false);
  const [showRejectionInput, setShowRejectionInput] = useState(false);

  // Selection state for the identification cards
  const [selectedAltIndex, setSelectedAltIndex] = useState<number | null>(null); // null = main
  const [selectedVariants, setSelectedVariants] = useState<Record<string, string>>({}); // type -> option

  // Manual form state
  const [manualIdentification, setManualIdentification] = useState('');
  const [manualBrand, setManualBrand] = useState('');
  const [manualModel, setManualModel] = useState('');
  const [manualCategory, setManualCategory] = useState('');
  const [manualSerial, setManualSerial] = useState('');

  const { identification, identificationStatus } = store;

  useEffect(() => {
    // Auto-trigger identification on mount if not already done
    if (identificationStatus === 'idle' && store.itemPhotoUrls.length > 0) {
      runIdentify();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function runIdentify() {
    if (!id) return;
    store.setIdentificationStatus('loading');
    try {
      const result: IdentificationResult = await identifyItem(id);
      store.setIdentification(result);
      store.setIdentificationStatus(result.error ? 'error' : 'done');
    } catch {
      store.setIdentificationStatus('error');
    }
  }

  async function handleRetry() {
    if (!id) return;
    store.setIdentificationStatus('loading');
    try {
      const result: IdentificationResult = await retryIdentify(id, userCorrection || undefined);
      store.setIdentification(result);
      store.setIdentificationStatus(result.error ? 'error' : 'done');
      setRetryCount((c) => c + 1);
      setShowRejectionInput(false);
      setUserCorrection('');
      if (retryCount >= 1) {
        // Second rejection — show manual entry option prominently
      }
    } catch {
      store.setIdentificationStatus('error');
    }
  }

  function handleConfirm() {
    if (!identification || !id) return;
    const alternatives = identification.alternativeIdentifications ?? [];

    // If an alternative is selected, update the store with it before proceeding
    if (selectedAltIndex !== null && alternatives[selectedAltIndex]) {
      const alt = alternatives[selectedAltIndex];
      // Build a variant suffix from any selected variants
      const variantSuffix = Object.values(selectedVariants).filter(Boolean).join(' ');
      store.setIdentification({
        identification: variantSuffix ? `${alt.identification} ${variantSuffix}` : alt.identification,
        brand: '',
        model: '',
        serialNumber: null,
        ebayCategory: '',
        ebayCategoryId: null,
        confidence: alt.confidence,
        alternativeIdentifications: [],
      });
    } else {
      // Main selected — append any chosen variants to the identification name
      const variantSuffix = Object.values(selectedVariants).filter(Boolean).join(' ');
      if (variantSuffix) {
        store.setIdentification({
          ...identification,
          identification: `${identification.identification} ${variantSuffix}`,
        });
      }
    }

    triggerPriceResearch(id).catch(() => {});
    store.setCurrentStep(3);
    navigate(`/listing/${id}/step/3`);
  }

  function handleManualSubmit() {
    if (!manualIdentification) return;
    store.setIdentification({
      identification: manualIdentification,
      brand: manualBrand,
      model: manualModel,
      serialNumber: manualSerial || null,
      ebayCategory: manualCategory,
      ebayCategoryId: null,
      confidence: 100,
      alternativeIdentifications: [],
    });
    store.setIdentificationStatus('done');
    setShowManual(false);
  }

  function prefillManual() {
    if (identification) {
      setManualIdentification(identification.identification);
      setManualBrand(identification.brand);
      setManualModel(identification.model);
      setManualCategory(identification.ebayCategory);
      setManualSerial(identification.serialNumber || '');
    }
    setShowManual(true);
  }

  if (identificationStatus === 'loading') {
    return (
      <div className="flex flex-col items-center justify-center py-24 gap-4">
        <div className="w-12 h-12 border-4 border-blue-600 border-t-transparent rounded-full animate-spin" />
        <p className="text-gray-600 font-medium">Analyzing your photos…</p>
        <p className="text-sm text-gray-400">Claude is identifying your item</p>
      </div>
    );
  }

  if (showManual) {
    return (
      <div className="space-y-6 max-w-lg">
        <div>
          <h2 className="text-2xl font-bold text-gray-900">Enter item details</h2>
          <p className="text-gray-500 mt-1">Tell us about your item so we can price and list it.</p>
        </div>

        <div className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Item name <span className="text-red-500">*</span></label>
            <input value={manualIdentification} onChange={(e) => setManualIdentification(e.target.value)}
              className="w-full border border-gray-300 rounded-lg px-3 py-2 focus:ring-2 focus:ring-blue-500 focus:border-transparent"
              placeholder="e.g. Apple MacBook Pro 14-inch M3" />
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Brand</label>
              <input value={manualBrand} onChange={(e) => setManualBrand(e.target.value)}
                className="w-full border border-gray-300 rounded-lg px-3 py-2 focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                placeholder="Apple" />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Model</label>
              <input value={manualModel} onChange={(e) => setManualModel(e.target.value)}
                className="w-full border border-gray-300 rounded-lg px-3 py-2 focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                placeholder="MacBook Pro M3" />
            </div>
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">eBay category</label>
            <input value={manualCategory} onChange={(e) => setManualCategory(e.target.value)}
              className="w-full border border-gray-300 rounded-lg px-3 py-2 focus:ring-2 focus:ring-blue-500 focus:border-transparent"
              placeholder="Computers/Tablets & Networking" />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Serial number</label>
            <input value={manualSerial} onChange={(e) => setManualSerial(e.target.value)}
              className="w-full border border-gray-300 rounded-lg px-3 py-2 focus:ring-2 focus:ring-blue-500 focus:border-transparent"
              placeholder="Optional" />
          </div>
        </div>

        <div className="flex gap-3">
          <button onClick={() => setShowManual(false)} className="px-4 py-2 border border-gray-300 rounded-lg text-gray-700 hover:bg-gray-50">
            Back
          </button>
          <button
            onClick={handleManualSubmit}
            disabled={!manualIdentification}
            className={clsx('px-6 py-2 rounded-lg font-semibold text-white',
              manualIdentification ? 'bg-blue-600 hover:bg-blue-700' : 'bg-gray-300 cursor-not-allowed')}
          >
            Confirm item
          </button>
        </div>
      </div>
    );
  }

  if (identificationStatus === 'done' && identification && !identification.error) {
    const alternatives = identification.alternativeIdentifications?.slice(0, 3) ?? [];
    const variants = identification.variants ?? [];

    function confidenceBadgeClass(c: number) {
      return c >= 80 ? 'bg-green-100 text-green-700' : c >= 60 ? 'bg-amber-100 text-amber-700' : 'bg-gray-100 text-gray-500';
    }

    function toggleVariant(type: string, option: string) {
      setSelectedVariants((prev) => ({
        ...prev,
        [type]: prev[type] === option ? '' : option,
      }));
    }

    return (
      <div className="space-y-5 max-w-2xl">
        <h2 className="text-2xl font-bold text-gray-900">Is this your item?</h2>

        {/* Cards row */}
        <div className="grid grid-cols-5 gap-3 items-start">
          {/* Left — main identification */}
          <div className="col-span-3">
            <button
              onClick={() => { setSelectedAltIndex(null); setSelectedVariants({}); }}
              className={clsx(
                'w-full text-left p-5 rounded-2xl border-2 transition-all',
                selectedAltIndex === null
                  ? 'border-blue-500 bg-white shadow-sm'
                  : 'border-gray-200 bg-white hover:border-blue-300',
              )}
            >
              <div className="flex items-start justify-between mb-3">
                <h3 className="text-base font-semibold text-gray-900 leading-snug pr-2">{identification.identification}</h3>
                <span className={clsx('flex-shrink-0 px-2.5 py-1 rounded-full text-xs font-medium', confidenceBadgeClass(identification.confidence))}>
                  {identification.confidence}%
                </span>
              </div>
              <div className="space-y-1 text-sm text-gray-600">
                {identification.brand && <div><span className="font-medium text-gray-800">Brand:</span> {identification.brand}</div>}
                {identification.model && <div><span className="font-medium text-gray-800">Model:</span> {identification.model}</div>}
                {identification.ebayCategory && <div><span className="font-medium text-gray-800">Category:</span> {identification.ebayCategory}</div>}
                {identification.serialNumber && <div><span className="font-medium text-gray-800">Serial:</span> <code className="bg-gray-100 px-1.5 py-0.5 rounded">{identification.serialNumber}</code></div>}
              </div>
            </button>
          </div>

          {/* Right — alternatives */}
          {alternatives.length > 0 && (
            <div className="col-span-2 space-y-2">
              <p className="text-xs font-semibold text-gray-400 uppercase tracking-wide px-1">Other possibilities</p>
              {alternatives.map((alt, i) => (
                <button
                  key={i}
                  onClick={() => { setSelectedAltIndex(i); setSelectedVariants({}); }}
                  className={clsx(
                    'w-full text-left p-3 rounded-xl border-2 transition-all',
                    selectedAltIndex === i
                      ? 'border-blue-500 bg-white shadow-sm'
                      : 'border-gray-200 bg-white hover:border-blue-300',
                  )}
                >
                  <div className="flex items-start justify-between gap-2">
                    <p className="text-sm font-medium text-gray-800 leading-snug">{alt.identification}</p>
                    <span className={clsx('flex-shrink-0 text-xs px-2 py-0.5 rounded-full font-medium', confidenceBadgeClass(alt.confidence))}>
                      {alt.confidence}%
                    </span>
                  </div>
                </button>
              ))}
            </div>
          )}
        </div>

        {/* Research / Variants — only shown for the main identification */}
        {variants.length > 0 && selectedAltIndex === null && (
          <div className="bg-gray-50 border border-gray-200 rounded-2xl p-5 space-y-4">
            <div className="flex items-center gap-2">
              <svg className="w-4 h-4 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
              </svg>
              <h4 className="text-sm font-semibold text-gray-700">Research — specify your variant <span className="font-normal text-gray-400">(optional)</span></h4>
            </div>
            {variants.map((v) => (
              <div key={v.type} className="space-y-2">
                <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide">{v.type}</p>
                <div className="flex flex-wrap gap-2">
                  {v.options.map((opt) => (
                    <button
                      key={opt}
                      onClick={() => toggleVariant(v.type, opt)}
                      className={clsx(
                        'px-3 py-1.5 rounded-lg text-sm font-medium border transition-all',
                        selectedVariants[v.type] === opt
                          ? 'bg-blue-600 border-blue-600 text-white'
                          : 'bg-white border-gray-300 text-gray-700 hover:border-blue-400',
                      )}
                    >
                      {opt}
                    </button>
                  ))}
                </div>
              </div>
            ))}
          </div>
        )}

        {/* Action buttons */}
        {!showRejectionInput ? (
          <div className="flex flex-col gap-2">
            <button onClick={handleConfirm} className="w-full py-3 bg-blue-600 hover:bg-blue-700 text-white font-semibold rounded-xl transition-colors">
              {selectedAltIndex !== null
                ? `Use "${alternatives[selectedAltIndex]?.identification}" →`
                : "Yes, that's it →"}
            </button>
            <button onClick={() => setShowRejectionInput(true)} className="w-full py-2.5 border border-gray-300 hover:bg-gray-50 text-gray-600 text-sm font-medium rounded-xl transition-colors">
              None of these are right
            </button>
          </div>
        ) : (
          <div className="space-y-2">
            <input
              value={userCorrection}
              onChange={(e) => setUserCorrection(e.target.value)}
              placeholder="What is it? (optional hint)"
              className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-blue-500 focus:border-transparent"
            />
            <div className="flex gap-2">
              <button onClick={handleRetry} className="flex-1 py-2 bg-blue-600 hover:bg-blue-700 text-white font-semibold rounded-lg transition-colors text-sm">
                Try again
              </button>
              {retryCount >= 1 && (
                <button onClick={prefillManual} className="flex-1 py-2 border border-gray-300 hover:bg-gray-50 text-gray-700 font-semibold rounded-lg transition-colors text-sm">
                  Enter manually
                </button>
              )}
            </div>
          </div>
        )}
      </div>
    );
  }

  // Error / fallback state
  return (
    <div className="space-y-6 max-w-lg">
      <div>
        <h2 className="text-2xl font-bold text-gray-900">Couldn't identify item</h2>
        <p className="text-gray-500 mt-1">We had trouble recognizing your item from the photos.</p>
      </div>
      {identification?.error && (
        <div className="bg-red-50 border border-red-200 rounded-lg p-3">
          <p className="text-xs font-mono text-red-700 break-all">{identification.error}</p>
        </div>
      )}
      <div className="flex gap-3">
        <button onClick={runIdentify} className="px-6 py-2.5 bg-blue-600 hover:bg-blue-700 text-white font-semibold rounded-lg transition-colors">
          Try again
        </button>
        <button onClick={prefillManual} className="px-6 py-2.5 border border-gray-300 hover:bg-gray-50 text-gray-700 font-semibold rounded-lg transition-colors">
          Enter manually
        </button>
      </div>
    </div>
  );
}
