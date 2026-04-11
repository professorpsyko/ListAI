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
    // Fire pricing research in background
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
    return (
      <div className="space-y-6 max-w-lg">
        <div>
          <h2 className="text-2xl font-bold text-gray-900">Is this your item?</h2>
        </div>

        <div className="bg-white border border-gray-200 rounded-2xl p-6 shadow-sm">
          <div className="flex items-start justify-between mb-4">
            <h3 className="text-xl font-semibold text-gray-900">{identification.identification}</h3>
            <span className={clsx(
              'ml-4 flex-shrink-0 px-2.5 py-1 rounded-full text-xs font-medium',
              identification.confidence >= 80 ? 'bg-green-100 text-green-700' :
              identification.confidence >= 60 ? 'bg-amber-100 text-amber-700' :
              'bg-red-100 text-red-700',
            )}>
              {identification.confidence}% confident
            </span>
          </div>

          <div className="grid grid-cols-2 gap-3 text-sm text-gray-600 mb-4">
            {identification.brand && <div><span className="font-medium text-gray-800">Brand:</span> {identification.brand}</div>}
            {identification.model && <div><span className="font-medium text-gray-800">Model:</span> {identification.model}</div>}
            {identification.ebayCategory && <div className="col-span-2"><span className="font-medium text-gray-800">Category:</span> {identification.ebayCategory}</div>}
            {identification.serialNumber && <div className="col-span-2"><span className="font-medium text-gray-800">Serial:</span> <code className="bg-gray-100 px-1.5 py-0.5 rounded">{identification.serialNumber}</code></div>}
          </div>
        </div>

        {!showRejectionInput ? (
          <div className="flex gap-3">
            <button onClick={handleConfirm} className="flex-1 py-3 bg-blue-600 hover:bg-blue-700 text-white font-semibold rounded-xl transition-colors">
              Yes, that's it →
            </button>
            <button onClick={() => setShowRejectionInput(true)} className="flex-1 py-3 border border-gray-300 hover:bg-gray-50 text-gray-700 font-semibold rounded-xl transition-colors">
              No, that's wrong
            </button>
          </div>
        ) : (
          <div className="space-y-3">
            <input
              value={userCorrection}
              onChange={(e) => setUserCorrection(e.target.value)}
              placeholder="What do you think it is? (optional — helps us make a better guess)"
              className="w-full border border-gray-300 rounded-lg px-3 py-2 focus:ring-2 focus:ring-blue-500 focus:border-transparent"
            />
            <div className="flex gap-3">
              <button onClick={handleRetry} className="flex-1 py-2.5 bg-blue-600 hover:bg-blue-700 text-white font-semibold rounded-lg transition-colors">
                Try again
              </button>
              {retryCount >= 1 && (
                <button onClick={prefillManual} className="flex-1 py-2.5 border border-gray-300 hover:bg-gray-50 text-gray-700 font-semibold rounded-lg transition-colors">
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
