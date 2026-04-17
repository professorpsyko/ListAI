import { useState, useEffect } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { useListingStore } from '../store/listingStore';
import { getDevPins, setDevPin, clearDevPin, isPinned } from '../lib/devPins';
import clsx from 'clsx';

const STEPS = [
  { n: 1, label: 'Photos' },
  { n: 2, label: 'Identify' },
  { n: 3, label: 'Details' },
  { n: 4, label: 'Price' },
  { n: 5, label: 'Title' },
  { n: 6, label: 'Description' },
  { n: 7, label: 'Shipping' },
  { n: 8, label: 'Preview' },
] as const;

type StepN = 1 | 2 | 3 | 4 | 5 | 6 | 7 | 8;

export default function DevPanel() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const store = useListingStore();

  const [open, setOpen] = useState(false);
  const [importText, setImportText] = useState('');
  const [showImport, setShowImport] = useState(false);
  const [copyMsg, setCopyMsg] = useState('');
  // Force re-render when pins change
  const [, setTick] = useState(0);
  const refresh = () => setTick((t) => t + 1);

  function exportPins() {
    const json = localStorage.getItem('listsamurai-dev-pins') ?? '{}';
    navigator.clipboard.writeText(json).then(() => {
      setCopyMsg('Copied!');
      setTimeout(() => setCopyMsg(''), 2000);
    });
  }

  function importPins() {
    try {
      JSON.parse(importText); // validate
      localStorage.setItem('listsamurai-dev-pins', importText);
      setImportText('');
      setShowImport(false);
      refresh();
    } catch {
      alert('Invalid JSON — paste the exported text exactly as copied.');
    }
  }

  // Close on Escape
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key === 'Escape') setOpen(false);
    }
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

  function jumpTo(n: StepN) {
    store.setCurrentStep(n);
    navigate(`/listing/${id}/step/${n}`);
  }

  function pinStep(n: StepN) {
    switch (n) {
      case 1:
        if (store.labelPhotoUrl && store.listingId) {
          setDevPin(1, {
            listingId: store.listingId,
            labelPhotoUrl: store.labelPhotoUrl,
            labelPhotoMeta: store.labelPhotoMeta,
            itemPhotoUrls: store.itemPhotoUrls,
            itemPhotoMetas: store.itemPhotoMetas,
          });
        }
        break;
      case 2:
        if (store.identification) setDevPin(2, { identification: store.identification });
        break;
      case 3:
        setDevPin(3, { condition: store.condition, color: store.color, specialNotes: store.specialNotes });
        break;
      case 4:
        if (store.pricingResearch) setDevPin(4, { pricingResearch: store.pricingResearch, suggestedPrice: store.finalPrice });
        break;
      case 5:
        if (store.itemTitle) setDevPin(5, { itemTitle: store.itemTitle });
        break;
      case 6:
        if (store.itemDescription) setDevPin(6, { itemDescription: store.itemDescription });
        break;
      case 7:
        if (store.shippingService) {
          setDevPin(7, {
            shippingService: store.shippingService,
            shippingCost: store.shippingCost,
            handlingTime: store.handlingTime,
            acceptReturns: store.acceptReturns,
            returnWindow: store.returnWindow,
          });
        }
        break;
    }
    refresh();
  }

  function canPin(n: StepN): boolean {
    switch (n) {
      case 1: return !!store.labelPhotoUrl && store.itemPhotoUrls.length > 0;
      case 2: return !!store.identification?.identification;
      case 3: return !!store.condition;
      case 4: return !!store.pricingResearch;
      case 5: return !!store.itemTitle;
      case 6: return !!store.itemDescription;
      case 7: return !!store.shippingService;
      default: return false;
    }
  }

  function stepSummary(n: StepN): string {
    switch (n) {
      case 1: return store.itemPhotoUrls.length ? `${store.itemPhotoUrls.length} item photos` : '';
      case 2: return store.identification?.identification?.slice(0, 28) ?? '';
      case 3: return store.condition || '';
      case 4: return store.finalPrice ? `$${store.finalPrice}` : '';
      case 5: return store.itemTitle?.slice(0, 28) ?? '';
      case 6: return store.itemDescription ? 'Written' : '';
      case 7: return store.shippingService?.slice(0, 24) ?? '';
      default: return '';
    }
  }

  const pins = getDevPins();

  return (
    <>
      {/* Toggle button — bottom right */}
      <button
        onClick={() => setOpen((o) => !o)}
        className={clsx(
          'fixed bottom-4 right-4 z-50 flex items-center gap-1.5 px-3 py-2 rounded-full text-xs font-bold shadow-lg border transition-all',
          open
            ? 'bg-gray-900 text-white border-gray-700'
            : 'bg-white text-gray-600 border-gray-300 hover:border-gray-400 hover:shadow-xl',
        )}
      >
        <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
            d="M19.428 15.428a2 2 0 00-1.022-.547l-2.387-.477a6 6 0 00-3.86.517l-.318.158a6 6 0 01-3.86.517L6.05 15.21a2 2 0 00-1.806.547M8 4h8l-1 1v5.172a2 2 0 00.586 1.414l5 5c1.26 1.26.367 3.414-1.415 3.414H4.828c-1.782 0-2.674-2.154-1.414-3.414l5-5A2 2 0 009 10.172V5L8 4z" />
        </svg>
        DEV
        {Object.keys(pins).length > 0 && (
          <span className="bg-green-500 text-white rounded-full w-4 h-4 flex items-center justify-center text-xs leading-none">
            {Object.keys(pins).length}
          </span>
        )}
      </button>

      {/* Panel */}
      {open && (
        <div className="fixed bottom-16 right-4 z-50 w-80 bg-gray-900 text-white rounded-2xl shadow-2xl border border-gray-700 overflow-hidden">
          {/* Header */}
          <div className="flex items-center justify-between px-4 py-3 border-b border-gray-700">
            <div className="flex items-center gap-2">
              <svg className="w-4 h-4 text-green-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                  d="M19.428 15.428a2 2 0 00-1.022-.547l-2.387-.477a6 6 0 00-3.86.517l-.318.158a6 6 0 01-3.86.517L6.05 15.21a2 2 0 00-1.806.547M8 4h8l-1 1v5.172a2 2 0 00.586 1.414l5 5c1.26 1.26.367 3.414-1.415 3.414H4.828c-1.782 0-2.674-2.154-1.414-3.414l5-5A2 2 0 009 10.172V5L8 4z" />
              </svg>
              <span className="text-sm font-bold">Dev Panel</span>
            </div>
            <button onClick={() => setOpen(false)} className="text-gray-400 hover:text-white">
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>
          </div>

          {/* Steps */}
          <div className="divide-y divide-gray-800">
            {STEPS.map(({ n, label }) => {
              const pinned = isPinned(n as StepN);
              const hasData = canPin(n as StepN);
              const summary = stepSummary(n as StepN);
              const isActive = store.currentStep === n;

              return (
                <div
                  key={n}
                  className={clsx(
                    'flex items-center gap-3 px-4 py-2.5',
                    isActive && 'bg-gray-800',
                  )}
                >
                  {/* Step indicator */}
                  <div className={clsx(
                    'flex-shrink-0 w-6 h-6 rounded-full flex items-center justify-center text-xs font-bold',
                    pinned ? 'bg-green-500 text-white' : isActive ? 'bg-blue-500 text-white' : 'bg-gray-700 text-gray-300',
                  )}>
                    {pinned ? (
                      <svg className="w-3 h-3" fill="currentColor" viewBox="0 0 20 20">
                        <path d="M9.049 2.927c.3-.921 1.603-.921 1.902 0l1.07 3.292a1 1 0 00.95.69h3.462c.969 0 1.371 1.24.588 1.81l-2.8 2.034a1 1 0 00-.364 1.118l1.07 3.292c.3.921-.755 1.688-1.54 1.118l-2.8-2.034a1 1 0 00-1.175 0l-2.8 2.034c-.784.57-1.838-.197-1.539-1.118l1.07-3.292a1 1 0 00-.364-1.118L2.98 8.72c-.783-.57-.38-1.81.588-1.81h3.461a1 1 0 00.951-.69l1.07-3.292z" />
                      </svg>
                    ) : n}
                  </div>

                  {/* Label + summary */}
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-1.5">
                      <span className={clsx('text-sm font-medium', isActive ? 'text-white' : 'text-gray-300')}>
                        {label}
                      </span>
                      {pinned && <span className="text-xs text-green-400 font-semibold">PINNED</span>}
                    </div>
                    {summary && (
                      <p className="text-xs text-gray-500 truncate">{summary}</p>
                    )}
                  </div>

                  {/* Actions */}
                  <div className="flex items-center gap-1 flex-shrink-0">
                    {/* Jump */}
                    <button
                      onClick={() => jumpTo(n as StepN)}
                      title={`Jump to step ${n}`}
                      className="p-1 text-gray-400 hover:text-blue-400 transition-colors"
                    >
                      <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 9l3 3m0 0l-3 3m3-3H8m13 0a9 9 0 11-18 0 9 9 0 0118 0z" />
                      </svg>
                    </button>

                    {/* Pin / Unpin */}
                    {n !== 8 && (
                      pinned ? (
                        <button
                          onClick={() => { clearDevPin(n as StepN); refresh(); }}
                          title="Unpin step"
                          className="p-1 text-green-400 hover:text-red-400 transition-colors"
                        >
                          <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 20 20">
                            <path d="M9.049 2.927c.3-.921 1.603-.921 1.902 0l1.07 3.292a1 1 0 00.95.69h3.462c.969 0 1.371 1.24.588 1.81l-2.8 2.034a1 1 0 00-.364 1.118l1.07 3.292c.3.921-.755 1.688-1.54 1.118l-2.8-2.034a1 1 0 00-1.175 0l-2.8 2.034c-.784.57-1.838-.197-1.539-1.118l1.07-3.292a1 1 0 00-.364-1.118L2.98 8.72c-.783-.57-.38-1.81.588-1.81h3.461a1 1 0 00.951-.69l1.07-3.292z" />
                          </svg>
                        </button>
                      ) : (
                        <button
                          onClick={() => pinStep(n as StepN)}
                          disabled={!hasData}
                          title={hasData ? 'Pin this step' : 'No data to pin yet'}
                          className={clsx(
                            'p-1 transition-colors',
                            hasData ? 'text-gray-500 hover:text-yellow-400' : 'text-gray-700 cursor-not-allowed',
                          )}
                        >
                          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                              d="M19.428 15.428a2 2 0 00-1.022-.547l-2.387-.477a6 6 0 00-3.86.517l-.318.158a6 6 0 01-3.86.517L6.05 15.21a2 2 0 00-1.806.547M8 4h8l-1 1v5.172a2 2 0 00.586 1.414l5 5c1.26 1.26.367 3.414-1.415 3.414H4.828c-1.782 0-2.674-2.154-1.414-3.414l5-5A2 2 0 009 10.172V5L8 4z" />
                          </svg>
                        </button>
                      )
                    )}
                  </div>
                </div>
              );
            })}
          </div>

          {/* Footer */}
          <div className="border-t border-gray-700">
            {/* Import box */}
            {showImport && (
              <div className="px-4 py-3 border-b border-gray-700 space-y-2">
                <p className="text-xs text-gray-400">Paste exported pins JSON:</p>
                <textarea
                  value={importText}
                  onChange={(e) => setImportText(e.target.value)}
                  rows={3}
                  className="w-full text-xs bg-gray-800 border border-gray-600 rounded px-2 py-1.5 text-gray-200 font-mono resize-none focus:outline-none focus:border-blue-500"
                  placeholder='{"2":{"identification":...}}'
                />
                <div className="flex gap-2">
                  <button onClick={importPins} disabled={!importText.trim()}
                    className="flex-1 py-1 bg-blue-600 hover:bg-blue-700 text-white text-xs font-semibold rounded transition-colors disabled:opacity-40">
                    Import
                  </button>
                  <button onClick={() => { setShowImport(false); setImportText(''); }}
                    className="px-3 py-1 text-xs text-gray-400 hover:text-white transition-colors">
                    Cancel
                  </button>
                </div>
              </div>
            )}

            <div className="px-4 py-2.5 flex items-center justify-between gap-2">
              <span className="text-xs text-gray-500">
                {Object.keys(pins).length} step{Object.keys(pins).length !== 1 ? 's' : ''} pinned
              </span>
              <div className="flex items-center gap-2">
                {/* Export */}
                {Object.keys(pins).length > 0 && (
                  <button onClick={exportPins}
                    className="text-xs text-gray-400 hover:text-green-400 transition-colors">
                    {copyMsg || 'Export'}
                  </button>
                )}
                {/* Import */}
                <button onClick={() => setShowImport((v) => !v)}
                  className="text-xs text-gray-400 hover:text-blue-400 transition-colors">
                  Import
                </button>
                {/* Clear */}
                {Object.keys(pins).length > 0 && (
                  <button
                    onClick={() => { localStorage.removeItem('listsamurai-dev-pins'); refresh(); }}
                    className="text-xs text-red-400 hover:text-red-300 transition-colors"
                  >
                    Clear all
                  </button>
                )}
              </div>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
