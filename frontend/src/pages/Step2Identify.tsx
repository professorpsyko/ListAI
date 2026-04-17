import { useEffect, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { useListingStore } from '../store/listingStore';
import { identifyItem, retryIdentify, triggerPriceResearch } from '../lib/api';
import type { IdentificationResult } from '../store/listingStore';
import { getDevPin, clearDevPin } from '../lib/devPins';
import clsx from 'clsx';

export default function Step2Identify() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const store = useListingStore();

  const [retryCount, setRetryCount] = useState(0);
  const [diffNote, setDiffNote] = useState('');
  const [isRetrying, setIsRetrying] = useState(false);
  const [showManual, setShowManual] = useState(false);
  const [usingPin, setUsingPin] = useState(false);
  const [selectedAltIndex, setSelectedAltIndex] = useState<number | null>(null);

  // Manual form state
  const [manualIdentification, setManualIdentification] = useState('');
  const [manualBrand, setManualBrand] = useState('');
  const [manualModel, setManualModel] = useState('');
  const [manualCategory, setManualCategory] = useState('');
  const [manualSerial, setManualSerial] = useState('');

  const { identification, identificationStatus } = store;

  useEffect(() => {
    const pin = getDevPin(2);
    if (pin && identificationStatus === 'idle') {
      store.setIdentification(pin.identification);
      store.setIdentificationStatus('done');
      setUsingPin(true);
      return;
    }
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

  async function handleSearchWithContext() {
    if (!id || !diffNote.trim()) return;
    setIsRetrying(true);
    try {
      const result: IdentificationResult = await retryIdentify(id, diffNote);
      store.setIdentification(result);
      store.setIdentificationStatus(result.error ? 'error' : 'done');
      setRetryCount((c) => c + 1);
      setDiffNote('');
      setSelectedAltIndex(null);
    } catch {
      store.setIdentificationStatus('error');
    } finally {
      setIsRetrying(false);
    }
  }

  function handleConfirm() {
    if (!identification || !id) return;
    const alternatives = identification.alternativeIdentifications ?? [];

    if (selectedAltIndex !== null && alternatives[selectedAltIndex]) {
      const alt = alternatives[selectedAltIndex];
      store.setIdentification({
        identification: alt.identification,
        brand: '',
        model: '',
        serialNumber: null,
        serialDecoding: null,
        ebayCategory: '',
        ebayCategoryId: null,
        confidence: alt.confidence,
        alternativeIdentifications: [],
        researchDescription: '',
        researchLinks: [],
      });
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
      serialDecoding: null,
      ebayCategory: manualCategory,
      ebayCategoryId: null,
      confidence: 100,
      alternativeIdentifications: [],
      researchDescription: '',
      researchLinks: [],
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

  // ── Loading ──────────────────────────────────────────────────────────────
  if (identificationStatus === 'loading' || isRetrying) {
    return (
      <div className="flex flex-col items-center justify-center py-24 gap-4">
        <div className="w-12 h-12 border-4 border-blue-600 border-t-transparent rounded-full animate-spin" />
        <p className="text-gray-600 font-medium">{isRetrying ? 'Searching with your context…' : 'Analyzing your photos…'}</p>
        <p className="text-sm text-gray-400">Claude is identifying your item</p>
      </div>
    );
  }

  // ── Manual entry ─────────────────────────────────────────────────────────
  if (showManual) {
    return (
      <div className="space-y-6 max-w-lg">
        <div>
          <h2 className="text-2xl font-bold text-gray-900">Identify it yourself</h2>
          <p className="text-gray-500 mt-1">Fill in what you know — you can edit everything later too.</p>
        </div>
        <div className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Item name <span className="text-red-500">*</span></label>
            <input value={manualIdentification} onChange={(e) => setManualIdentification(e.target.value)}
              className="w-full border border-gray-300 rounded-lg px-3 py-2 focus:ring-2 focus:ring-blue-500 focus:border-transparent"
              placeholder="e.g. Nike Air Force 1 Low White/Black" />
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Brand</label>
              <input value={manualBrand} onChange={(e) => setManualBrand(e.target.value)}
                className="w-full border border-gray-300 rounded-lg px-3 py-2 focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                placeholder="Nike" />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Model</label>
              <input value={manualModel} onChange={(e) => setManualModel(e.target.value)}
                className="w-full border border-gray-300 rounded-lg px-3 py-2 focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                placeholder="Air Force 1 Low" />
            </div>
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Category</label>
            <input value={manualCategory} onChange={(e) => setManualCategory(e.target.value)}
              className="w-full border border-gray-300 rounded-lg px-3 py-2 focus:ring-2 focus:ring-blue-500 focus:border-transparent"
              placeholder="Athletic Shoes" />
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
            Use this identification
          </button>
        </div>
      </div>
    );
  }

  // ── Done ─────────────────────────────────────────────────────────────────
  if (identificationStatus === 'done' && identification && !identification.error) {
    const alternatives = identification.alternativeIdentifications?.slice(0, 3) ?? [];
    const researchLinks = identification.researchLinks ?? [];

    function confidenceBadgeClass(c: number) {
      return c >= 80 ? 'bg-green-100 text-green-700' : c >= 60 ? 'bg-amber-100 text-amber-700' : 'bg-gray-100 text-gray-500';
    }

    return (
      <div className="space-y-5 max-w-2xl">
        <h2 className="text-2xl font-bold text-gray-900">Is this your item?</h2>

        {/* Pinned data banner */}
        {usingPin && (
          <div className="flex items-center justify-between bg-green-50 border border-green-200 rounded-lg px-3 py-2">
            <div className="flex items-center gap-2 text-sm text-green-700">
              <svg className="w-4 h-4 flex-shrink-0" fill="currentColor" viewBox="0 0 20 20">
                <path d="M9.049 2.927c.3-.921 1.603-.921 1.902 0l1.07 3.292a1 1 0 00.95.69h3.462c.969 0 1.371 1.24.588 1.81l-2.8 2.034a1 1 0 00-.364 1.118l1.07 3.292c.3.921-.755 1.688-1.54 1.118l-2.8-2.034a1 1 0 00-1.175 0l-2.8 2.034c-.784.57-1.838-.197-1.539-1.118l1.07-3.292a1 1 0 00-.364-1.118L2.98 8.72c-.783-.57-.38-1.81.588-1.81h3.461a1 1 0 00.951-.69l1.07-3.292z" />
              </svg>
              <span><strong>Pinned data</strong> — skipped Claude API call</span>
            </div>
            <button
              onClick={() => { clearDevPin(2); setUsingPin(false); store.setIdentificationStatus('idle'); store.setIdentification(null); runIdentify(); }}
              className="text-xs text-green-600 hover:text-green-800 underline"
            >
              Run live
            </button>
          </div>
        )}

        {/* Identification cards */}
        <div className="grid grid-cols-5 gap-3 items-start">
          {/* Main card */}
          <div className="col-span-3">
            <button
              onClick={() => setSelectedAltIndex(null)}
              className={clsx(
                'w-full text-left p-5 rounded-2xl border-2 transition-all',
                selectedAltIndex === null ? 'border-blue-500 bg-white shadow-sm' : 'border-gray-200 bg-white hover:border-blue-300',
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
                {identification.serialNumber && (
                  <div>
                    <span className="font-medium text-gray-800">Serial:</span>{' '}
                    <code className="bg-gray-100 px-1.5 py-0.5 rounded">{identification.serialNumber}</code>
                  </div>
                )}
                {identification.serialDecoding && (
                  <div className="mt-1 text-xs text-blue-700 bg-blue-50 rounded px-2 py-1">
                    <span className="font-medium">Serial decodes to:</span> {identification.serialDecoding}
                  </div>
                )}
              </div>
            </button>
          </div>

          {/* Alternatives */}
          {alternatives.length > 0 && (
            <div className="col-span-2 space-y-2">
              <p className="text-xs font-semibold text-gray-400 uppercase tracking-wide px-1">Other possibilities</p>
              {alternatives.map((alt, i) => (
                <button
                  key={i}
                  onClick={() => setSelectedAltIndex(i)}
                  className={clsx(
                    'w-full text-left p-3 rounded-xl border-2 transition-all',
                    selectedAltIndex === i ? 'border-blue-500 bg-white shadow-sm' : 'border-gray-200 bg-white hover:border-blue-300',
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

        {/* Research section — description + source links */}
        {(identification.researchDescription || researchLinks.length > 0) && (
          <div className="bg-gray-50 border border-gray-200 rounded-2xl p-5 space-y-4">
            <div className="flex items-center gap-2">
              <svg className="w-4 h-4 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
              </svg>
              <h4 className="text-sm font-semibold text-gray-700">Research</h4>
            </div>

            {identification.researchDescription && (
              <p className="text-sm text-gray-600 leading-relaxed">{identification.researchDescription}</p>
            )}

            {researchLinks.length > 0 && (
              <div className="space-y-2">
                <p className="text-xs font-semibold text-gray-400 uppercase tracking-wide">Sources — click to verify</p>
                {researchLinks.map((link, i) => (
                  <a
                    key={i}
                    href={link.url}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="flex items-start gap-3 p-3 bg-white border border-gray-200 rounded-xl hover:border-blue-300 hover:shadow-sm transition-all group"
                  >
                    <svg className="w-4 h-4 text-gray-400 flex-shrink-0 mt-0.5 group-hover:text-blue-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14" />
                    </svg>
                    <div className="min-w-0">
                      <p className="text-sm font-medium text-gray-800 group-hover:text-blue-700 truncate">{link.title}</p>
                      <p className="text-xs text-gray-500 line-clamp-2 mt-0.5">{link.snippet}</p>
                      <p className="text-xs text-blue-500 truncate mt-0.5">{link.url}</p>
                    </div>
                  </a>
                ))}
              </div>
            )}
          </div>
        )}

        {/* "What's different?" box */}
        <div className="bg-white border border-gray-200 rounded-2xl p-5 space-y-3">
          <div>
            <h4 className="text-sm font-semibold text-gray-700">Something look off?</h4>
            <p className="text-xs text-gray-400 mt-0.5">Describe what is different between the recommendation and your actual item — we will search again with that context.</p>
          </div>
          <textarea
            value={diffNote}
            onChange={(e) => setDiffNote(e.target.value)}
            rows={2}
            placeholder="e.g. The colorway is actually red/black, not white. The model number on the tag says XJ-400."
            className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm resize-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
          />
          <div className="flex items-center gap-2">
            <button
              onClick={handleSearchWithContext}
              disabled={!diffNote.trim()}
              className={clsx(
                'px-4 py-2 rounded-lg text-sm font-semibold transition-colors',
                diffNote.trim() ? 'bg-blue-600 hover:bg-blue-700 text-white' : 'bg-gray-100 text-gray-400 cursor-not-allowed',
              )}
            >
              Search with this context
            </button>
            {retryCount >= 2 && (
              <button
                onClick={prefillManual}
                className="px-4 py-2 rounded-lg text-sm font-medium border border-gray-300 hover:bg-gray-50 text-gray-700 transition-colors"
              >
                Identify it myself
              </button>
            )}
            {retryCount > 0 && retryCount < 2 && (
              <span className="text-xs text-gray-400">{2 - retryCount} search{2 - retryCount !== 1 ? 'es' : ''} left before manual option</span>
            )}
          </div>
        </div>

        {/* Confirm */}
        <button
          onClick={handleConfirm}
          className="w-full py-3 bg-blue-600 hover:bg-blue-700 text-white font-semibold rounded-xl transition-colors"
        >
          {selectedAltIndex !== null
            ? `Use "${alternatives[selectedAltIndex]?.identification}" \u2192`
            : "Yes, that's it \u2192"}
        </button>
      </div>
    );
  }

  // ── Error / fallback ──────────────────────────────────────────────────────
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
          Identify it myself
        </button>
      </div>
    </div>
  );
}
