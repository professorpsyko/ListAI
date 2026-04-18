import { useEffect, useRef, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { useListingStore } from '../store/listingStore';
import { identifyItem, retryIdentify, triggerPriceResearch } from '../lib/api';
import type { IdentificationResult } from '../store/listingStore';
import { getDevPin, clearDevPin } from '../lib/devPins';
import clsx from 'clsx';

interface DisplayAlt {
  identification: string;
  confidence: number;
  /** Index into the original alternativeIdentifications array, or null if this entry IS the original main identification */
  originalAltIndex: number | null;
}

export default function Step2Identify() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const store = useListingStore();

  const [retryCount, setRetryCount] = useState(0);
  const [diffNote, setDiffNote] = useState('');
  const [isRetrying, setIsRetrying] = useState(false);
  const [isSerialSearch, setIsSerialSearch] = useState(false);
  const [showManual, setShowManual] = useState(false);
  // Magnifier lens state — tracks cursor position within the rendered image area
  const [lens, setLens] = useState<{
    vpX: number; vpY: number;   // viewport cursor position (for fixed positioning the lens)
    imgX: number; imgY: number; // cursor position inside the rendered image pixels
    imgW: number; imgH: number; // actual rendered image dimensions (respects object-contain)
  } | null>(null);
  const LENS_SIZE = 260; // px — square lens width/height
  const LENS_ZOOM = 4.8; // how many times to magnify
  const [usingPin, setUsingPin] = useState(false);

  /**
   * Index into identification.alternativeIdentifications that is currently
   * "swapped" to the main card slot. null = original identification is main.
   */
  const [selectedAltIndex, setSelectedAltIndex] = useState<number | null>(null);

  /**
   * Serial number state:
   *   undefined = user has not yet interacted (blocks confirm + "look off")
   *   null      = user confirmed "no serial on this item"
   *   string    = user entered / confirmed a serial number
   */
  const [userSerial, setUserSerial] = useState<string | null | undefined>(undefined);
  const [serialDraft, setSerialDraft] = useState('');
  /** When true the edit input is shown even if a serial is already resolved */
  const [editingSerial, setEditingSerial] = useState(false);

  /**
   * Persists the user's explicit serial commitment across re-searches so a
   * new identification result never silently resets what the user typed.
   * undefined = nothing committed yet.
   */
  const committedSerialRef = useRef<string | null | undefined>(undefined);

  /**
   * When a serial-triggered re-search completes, if Claude still returns
   * serialNumber: null, we restore the user-entered value from this ref.
   */
  const pendingSerialRef = useRef<string | null>(null);

  // Manual form state
  const [manualIdentification, setManualIdentification] = useState('');
  const [manualBrand, setManualBrand] = useState('');
  const [manualModel, setManualModel] = useState('');
  const [manualCategory, setManualCategory] = useState('');
  const [manualSerial, setManualSerial] = useState('');

  const { identification, identificationStatus } = store;

  // When a new identification arrives, restore any serial the user explicitly committed
  // so a re-search never silently wipes what they typed.
  useEffect(() => {
    setSelectedAltIndex(null);
    setEditingSerial(false);
    if (pendingSerialRef.current !== null) {
      // Serial-triggered re-search just finished
      const pending = pendingSerialRef.current;
      pendingSerialRef.current = null;
      if (!identification?.serialNumber) {
        setUserSerial(pending);
      }
      setSerialDraft('');
    } else if (committedSerialRef.current !== undefined) {
      // User had already committed a value — keep it regardless of new result
      setUserSerial(committedSerialRef.current);
      setSerialDraft('');
    } else {
      setUserSerial(undefined);
      setSerialDraft('');
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [identification?.identification]);

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

  /** Commit a serial value so it survives any subsequent re-searches */
  function commitSerial(value: string | null) {
    committedSerialRef.current = value;
    setUserSerial(value);
    setEditingSerial(false);
  }

  /** Open the edit input, optionally pre-filling with a current value */
  function openSerialEdit(prefill = '') {
    setSerialDraft(prefill);
    setEditingSerial(true);
  }

  /**
   * Called when user confirms a serial number they typed.
   * Automatically re-runs identification with the serial as context —
   * serial numbers often nail the exact variant so this search runs first
   * before the user can use "Something look off?".
   */
  async function handleSerialConfirm(serial: string) {
    if (!id || !serial.trim()) return;
    const trimmed = serial.trim();
    committedSerialRef.current = trimmed; // persist immediately
    pendingSerialRef.current = trimmed;
    setIsRetrying(true);
    setIsSerialSearch(true);
    try {
      const result = await retryIdentify(
        id,
        `The serial number on this item is: "${trimmed}". Use this to precisely identify the exact model, year, colorway, and variant.`,
      );
      store.setIdentification(result);
      store.setIdentificationStatus(result.error ? 'error' : 'done');
      setRetryCount(0);
      setDiffNote('');
    } catch {
      store.setIdentificationStatus('error');
      // Fallback: save what they typed even if search failed
      pendingSerialRef.current = null;
      setUserSerial(trimmed);
    } finally {
      setIsRetrying(false);
      setIsSerialSearch(false);
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
    } catch {
      store.setIdentificationStatus('error');
    } finally {
      setIsRetrying(false);
    }
  }

  function handleConfirm() {
    if (!identification || !id) return;

    // Effective serial: Claude-detected takes precedence, otherwise user input
    const effectiveSerial =
      identification.serialNumber !== null
        ? identification.serialNumber
        : (userSerial as string | null) ?? null;

    if (selectedAltIndex !== null) {
      const baseAlts = identification.alternativeIdentifications ?? [];
      const alt = baseAlts[selectedAltIndex];
      if (alt) {
        store.setIdentification({
          identification: alt.identification,
          brand: identification.brand,
          model: identification.model,
          serialNumber: effectiveSerial,
          serialDecoding: null,
          ebayCategory: identification.ebayCategory,
          ebayCategoryId: identification.ebayCategoryId,
          confidence: alt.confidence,
          alternativeIdentifications: [],
          researchDescription: '',
          researchLinks: [],
        });
      }
    } else if (effectiveSerial !== identification.serialNumber) {
      store.setIdentification({ ...identification, serialNumber: effectiveSerial });
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
        <p className="text-gray-600 font-medium">
          {isSerialSearch
            ? 'Re-identifying with serial number...'
            : isRetrying
              ? 'Searching with your context...'
              : 'Analyzing your photos...'}
        </p>
        <p className="text-sm text-gray-400">
          {isSerialSearch
            ? 'Serial numbers help Claude pinpoint the exact variant'
            : 'Claude is identifying your item'}
        </p>
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
    const baseAlts = identification.alternativeIdentifications?.slice(0, 3) ?? [];
    const researchLinks = identification.researchLinks ?? [];

    // ── Derived display values based on which card is selected ──────────────
    const mainDisplayName =
      selectedAltIndex !== null
        ? (baseAlts[selectedAltIndex]?.identification ?? identification.identification)
        : identification.identification;

    const mainDisplayConfidence =
      selectedAltIndex !== null
        ? (baseAlts[selectedAltIndex]?.confidence ?? identification.confidence)
        : identification.confidence;

    const displayAlts: DisplayAlt[] =
      selectedAltIndex !== null
        ? [
            { identification: identification.identification, confidence: identification.confidence, originalAltIndex: null },
            ...baseAlts
              .map((alt, i) => ({ identification: alt.identification, confidence: alt.confidence, originalAltIndex: i }))
              .filter((item) => item.originalAltIndex !== selectedAltIndex),
          ]
        : baseAlts.map((alt, i) => ({ identification: alt.identification, confidence: alt.confidence, originalAltIndex: i }));

    function handleAltClick(alt: DisplayAlt) {
      setSelectedAltIndex(alt.originalAltIndex);
    }

    function confidenceBadgeClass(c: number) {
      return c >= 80 ? 'bg-green-100 text-green-700' : c >= 60 ? 'bg-amber-100 text-amber-700' : 'bg-gray-100 text-gray-500';
    }

    const claudeSerial = identification.serialNumber;
    /** True once a serial is resolved AND we're not mid-edit of a first-entry (unresolved) */
    const serialResolved = (claudeSerial !== null || userSerial !== undefined) && !(claudeSerial === null && userSerial === undefined && !editingSerial);
    /** Right column locked only while serial has never been committed at all */
    const lookOffLocked = claudeSerial === null && userSerial === undefined && !editingSerial;

    return (
      <div className="space-y-5 max-w-4xl">
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

        {/* ── Two-column layout: left = cards, right = label photo + look off ── */}
        <div className="grid grid-cols-5 gap-4 items-start">

          {/* LEFT: main card + alternatives */}
          <div className="col-span-3 space-y-3">

            {/* Main identification card */}
            <div className="w-full p-5 rounded-2xl border-2 border-blue-500 bg-white shadow-sm">
              <div className="flex items-start justify-between mb-3">
                <h3 className="text-lg font-semibold text-gray-900 leading-snug pr-2">{mainDisplayName}</h3>
                <span className={clsx('flex-shrink-0 px-2.5 py-1 rounded-full text-xs font-medium', confidenceBadgeClass(mainDisplayConfidence))}>
                  {mainDisplayConfidence}%
                </span>
              </div>

              {/* Brand / Model / Category */}
              <div className="grid grid-cols-2 gap-x-6 gap-y-1 text-sm text-gray-600">
                {identification.brand && <div><span className="font-medium text-gray-800">Brand:</span> {identification.brand}</div>}
                {identification.model && <div><span className="font-medium text-gray-800">Model:</span> {identification.model}</div>}
                {identification.ebayCategory && <div className="col-span-2"><span className="font-medium text-gray-800">Category:</span> {identification.ebayCategory}</div>}
              </div>

              {/* Serial number section
                  Three display states:
                  1. Edit input — shown when serial is unresolved OR user clicked "change"
                  2. Resolved chip — serial confirmed (Claude's or user's), always has "change"
                  The edit input is the same UI regardless of how we got here. */}
              {editingSerial || (claudeSerial === null && userSerial === undefined) ? (
                /* ── Edit / entry input ── */
                <div className={clsx(
                  'mt-3 rounded-lg border-2 p-3 space-y-2',
                  claudeSerial === null && userSerial === undefined && !editingSerial
                    ? 'border-amber-300 bg-amber-50'   // required first-time entry
                    : 'border-gray-300 bg-gray-50',    // voluntary change
                )}>
                  {claudeSerial === null && userSerial === undefined && !editingSerial && (
                    <div className="flex items-center gap-1.5">
                      <svg className="w-4 h-4 text-amber-500 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01M10.29 3.86L1.82 18a2 2 0 001.71 3h16.94a2 2 0 001.71-3L13.71 3.86a2 2 0 00-3.42 0z" />
                      </svg>
                      <p className="text-xs font-semibold text-amber-700">Serial not detected — check label photo &rarr;</p>
                    </div>
                  )}
                  <input
                    autoFocus={editingSerial}
                    value={serialDraft}
                    onChange={(e) => setSerialDraft(e.target.value)}
                    onKeyDown={(e) => { if (e.key === 'Enter' && serialDraft.trim()) void handleSerialConfirm(serialDraft); }}
                    placeholder="Enter serial number from label..."
                    className="w-full border border-gray-300 bg-white rounded-lg px-3 py-1.5 text-sm focus:ring-2 focus:ring-blue-400 focus:border-transparent"
                  />
                  <div className="flex gap-2">
                    <button
                      onClick={() => { if (serialDraft.trim()) void handleSerialConfirm(serialDraft); }}
                      disabled={!serialDraft.trim()}
                      className={clsx(
                        'flex-1 py-1.5 rounded-lg text-xs font-semibold transition-colors',
                        serialDraft.trim() ? 'bg-blue-600 hover:bg-blue-700 text-white' : 'bg-gray-200 text-gray-400 cursor-not-allowed',
                      )}
                    >
                      Confirm &amp; re-search
                    </button>
                    <button
                      onClick={() => commitSerial(null)}
                      className="flex-1 py-1.5 rounded-lg text-xs font-medium border border-gray-300 text-gray-600 hover:bg-gray-100 transition-colors"
                    >
                      No serial on this item
                    </button>
                    {/* Cancel back to previous resolved state if one exists */}
                    {(claudeSerial !== null || userSerial !== undefined) && (
                      <button
                        onClick={() => { setEditingSerial(false); setSerialDraft(''); }}
                        className="px-3 py-1.5 rounded-lg text-xs text-gray-400 hover:text-gray-600 transition-colors"
                      >
                        Cancel
                      </button>
                    )}
                  </div>
                </div>
              ) : (
                /* ── Resolved chip — Claude's serial or user-committed value ── */
                <div className={clsx(
                  'mt-3 flex items-start gap-2 px-3 py-2 rounded-lg text-sm',
                  claudeSerial !== null && !userSerial
                    ? 'bg-blue-50 border border-blue-100'
                    : 'bg-gray-50 border border-gray-200',
                )}>
                  <svg className={clsx('w-4 h-4 flex-shrink-0 mt-0.5', claudeSerial !== null && !userSerial ? 'text-blue-500' : 'text-gray-400')} fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M7 20l4-16m2 16l4-16M6 9h14M4 15h14" />
                  </svg>
                  <div className="flex-1 min-w-0">
                    {(userSerial || claudeSerial) ? (
                      <>
                        <span className={clsx('font-medium', claudeSerial !== null && !userSerial ? 'text-blue-700' : 'text-gray-700')}>Serial:</span>{' '}
                        <code className={clsx('font-mono', claudeSerial !== null && !userSerial ? 'text-blue-800' : 'text-gray-800')}>{userSerial || claudeSerial}</code>
                        {!userSerial && identification.serialDecoding && (
                          <p className="text-xs text-blue-600 mt-0.5">{identification.serialDecoding}</p>
                        )}
                      </>
                    ) : (
                      <span className="text-gray-500">No serial on this item</span>
                    )}
                  </div>
                  <button
                    onClick={() => openSerialEdit(userSerial || claudeSerial || '')}
                    className="text-xs text-blue-500 hover:text-blue-700 underline flex-shrink-0 mt-0.5"
                  >
                    change
                  </button>
                </div>
              )}
            </div>

            {/* Alternatives */}
            {displayAlts.length > 0 && (
              <div className="space-y-2">
                <p className="text-xs font-semibold text-gray-400 uppercase tracking-wide">Other possibilities — tap to swap</p>
                {displayAlts.map((alt) => (
                  <button
                    key={alt.originalAltIndex ?? 'original'}
                    onClick={() => handleAltClick(alt)}
                    className="w-full text-left p-3 rounded-xl border-2 border-gray-200 bg-white hover:border-blue-300 hover:shadow-sm transition-all"
                  >
                    <div className="flex items-start justify-between gap-2">
                      <p className="text-sm font-medium text-gray-800 leading-snug">{alt.identification}</p>
                      <span className={clsx('flex-shrink-0 text-xs px-2 py-0.5 rounded-full font-medium', confidenceBadgeClass(alt.confidence))}>
                        {alt.confidence}%
                      </span>
                    </div>
                    <p className="text-xs text-blue-500 mt-1">Tap to use this instead</p>
                  </button>
                ))}
              </div>
            )}
          </div>

          {/* RIGHT: label photo + Something look off? */}
          <div className="col-span-2 space-y-3 sticky top-4">

            {/* Label photo with magnifier loupe
                - Moving the mouse over the image shows a small square lens
                  that displays a 4x zoomed slice of exactly what's under the cursor
                - Uses CSS background-image trick — no click, input stays focused
                - Accounts for object-contain offsets so zoom aligns with actual pixels */}
            {store.labelPhotoUrl && (
              <>
                <div className="bg-white border border-gray-200 rounded-2xl overflow-hidden">
                  <div className="px-3 pt-3 pb-1.5 flex items-center justify-between">
                    <div className="flex items-center gap-1.5">
                      <svg className="w-3.5 h-3.5 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M7 7h.01M7 3h5l8 8-7 7-8-8V3z" />
                      </svg>
                      <p className="text-xs font-semibold text-gray-500">Label photo</p>
                    </div>
                    <p className="text-xs text-gray-400 italic">hover to magnify</p>
                  </div>
                  <img
                    src={store.labelPhotoUrl}
                    alt="Label"
                    className="w-full object-contain max-h-52 bg-gray-50 cursor-crosshair"
                    onMouseMove={(e) => {
                      const img = e.currentTarget;
                      if (!img.naturalWidth || !img.naturalHeight) return;
                      const rect = img.getBoundingClientRect();
                      // Compute actual rendered image bounds inside the element (object-contain)
                      const naturalAspect = img.naturalWidth / img.naturalHeight;
                      const elementAspect = rect.width / rect.height;
                      let renderedW: number, renderedH: number, offX: number, offY: number;
                      if (naturalAspect > elementAspect) {
                        renderedW = rect.width; renderedH = rect.width / naturalAspect;
                        offX = 0; offY = (rect.height - renderedH) / 2;
                      } else {
                        renderedH = rect.height; renderedW = rect.height * naturalAspect;
                        offX = (rect.width - renderedW) / 2; offY = 0;
                      }
                      const imgX = e.clientX - rect.left - offX;
                      const imgY = e.clientY - rect.top - offY;
                      if (imgX < 0 || imgY < 0 || imgX > renderedW || imgY > renderedH) {
                        setLens(null); return;
                      }
                      setLens({ vpX: e.clientX, vpY: e.clientY, imgX, imgY, imgW: renderedW, imgH: renderedH });
                    }}
                    onMouseLeave={() => setLens(null)}
                  />
                  <p className="px-3 py-2 text-xs text-gray-400">Move mouse over label to magnify any section</p>
                </div>

                {/* Magnifier lens — fixed to viewport, pointer-events-none so input focus is never lost */}
                {lens && (
                  <div
                    className="fixed z-[9999] pointer-events-none rounded-lg"
                    style={{
                      left: lens.vpX - LENS_SIZE / 2,
                      top: lens.vpY - LENS_SIZE / 2,
                      width: LENS_SIZE,
                      height: LENS_SIZE,
                      backgroundImage: `url(${store.labelPhotoUrl})`,
                      backgroundRepeat: 'no-repeat',
                      backgroundSize: `${lens.imgW * LENS_ZOOM}px ${lens.imgH * LENS_ZOOM}px`,
                      backgroundPosition: `-${lens.imgX * LENS_ZOOM - LENS_SIZE / 2}px -${lens.imgY * LENS_ZOOM - LENS_SIZE / 2}px`,
                      border: '2.5px solid white',
                      boxShadow: '0 4px 24px rgba(0,0,0,0.5), 0 0 0 1px rgba(0,0,0,0.15)',
                    }}
                  />
                )}
              </>
            )}

            {/* Something look off? */}
            <div className={clsx(
              'bg-white border rounded-2xl p-4 space-y-3 transition-opacity',
              lookOffLocked ? 'border-gray-100 opacity-50 pointer-events-none select-none' : 'border-gray-200',
            )}>
              <div>
                <h4 className="text-sm font-semibold text-gray-700">Something look off?</h4>
                {lookOffLocked ? (
                  <p className="text-xs text-amber-600 mt-0.5 font-medium">Confirm the serial number first — it helps AI find the exact item</p>
                ) : (
                  <p className="text-xs text-gray-400 mt-0.5">Describe what is different and we will search again.</p>
                )}
              </div>
              <textarea
                value={diffNote}
                onChange={(e) => setDiffNote(e.target.value)}
                rows={4}
                placeholder="e.g. The colorway is red/black. Tag says model XJ-400."
                className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm resize-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
              />
              <div className="space-y-2">
                <button
                  onClick={handleSearchWithContext}
                  disabled={!diffNote.trim()}
                  className={clsx(
                    'w-full py-2 rounded-lg text-sm font-semibold transition-colors',
                    diffNote.trim() ? 'bg-blue-600 hover:bg-blue-700 text-white' : 'bg-gray-100 text-gray-400 cursor-not-allowed',
                  )}
                >
                  Search with this context
                </button>
                {retryCount >= 2 && (
                  <button
                    onClick={prefillManual}
                    className="w-full py-2 rounded-lg text-sm font-medium border border-gray-300 hover:bg-gray-50 text-gray-700 transition-colors"
                  >
                    Identify it myself
                  </button>
                )}
                {retryCount > 0 && retryCount < 2 && (
                  <p className="text-xs text-center text-gray-400">{2 - retryCount} more search{2 - retryCount !== 1 ? 'es' : ''} before manual option</p>
                )}
              </div>
            </div>
          </div>
        </div>

        {/* Research section — full width below both columns */}
        {(identification.researchDescription || researchLinks.length > 0 || (identification.researchImages ?? []).length > 0) && (
          <div className="bg-gray-50 border border-gray-200 rounded-2xl p-5">
            {/* Header */}
            <div className="flex items-center gap-2 mb-4">
              <svg className="w-4 h-4 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
              </svg>
              <h4 className="text-sm font-semibold text-gray-700">Research</h4>
            </div>

            {/* Description — full width */}
            {identification.researchDescription && (
              <p className="text-sm text-gray-600 leading-relaxed mb-4">{identification.researchDescription}</p>
            )}

            {/* Two columns: source links left, image grid right */}
            <div className="grid grid-cols-9 gap-5">

              {/* Left: source links */}
              {researchLinks.length > 0 && (
                <div className={clsx('space-y-2', (identification.researchImages ?? []).length > 0 ? 'col-span-4' : 'col-span-9')}>
                  <p className="text-xs font-semibold text-gray-400 uppercase tracking-wide mb-2">Sources — click to verify</p>
                  {researchLinks.map((link, i) => {
                    let domain = link.url;
                    try { domain = new URL(link.url).hostname.replace('www.', ''); } catch { /* keep raw */ }
                    const faviconUrl = `https://www.google.com/s2/favicons?domain=${domain}&sz=64`;
                    return (
                      <a key={i} href={link.url} target="_blank" rel="noopener noreferrer"
                        className="flex items-center gap-3 p-3 bg-white border border-gray-200 rounded-xl hover:border-blue-300 hover:shadow-sm transition-all group"
                      >
                        <img src={faviconUrl} alt="" className="w-6 h-6 rounded flex-shrink-0 object-contain" />
                        <div className="min-w-0 flex-1">
                          <p className="text-sm font-medium text-gray-800 group-hover:text-blue-700 line-clamp-1">{link.title}</p>
                          <p className="text-xs text-gray-500 line-clamp-1 mt-0.5">{link.snippet}</p>
                          <p className="text-xs text-blue-400 mt-0.5">{domain}</p>
                        </div>
                        <svg className="w-3.5 h-3.5 text-gray-300 flex-shrink-0 group-hover:text-blue-400 transition-colors" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14" />
                        </svg>
                      </a>
                    );
                  })}
                </div>
              )}

              {/* Right: Google Images grid — visual confirmation */}
              {(identification.researchImages ?? []).length > 0 && (
                <div className={clsx(researchLinks.length > 0 ? 'col-span-5' : 'col-span-9')}>
                  <p className="text-xs font-semibold text-gray-400 uppercase tracking-wide mb-2">Image results — visual check</p>
                  <div className="grid grid-cols-3 gap-1.5">
                    {(identification.researchImages ?? []).map((img, i) => (
                      <a
                        key={i}
                        href={img.sourceUrl}
                        target="_blank"
                        rel="noopener noreferrer"
                        title={img.title}
                        className="block aspect-square rounded-lg overflow-hidden bg-gray-100 hover:ring-2 hover:ring-blue-400 hover:ring-offset-1 transition-all"
                      >
                        <img
                          src={img.imageUrl}
                          alt={img.title}
                          className="w-full h-full object-cover"
                          onError={(e) => { (e.currentTarget as HTMLImageElement).parentElement!.style.display = 'none'; }}
                        />
                      </a>
                    ))}
                  </div>
                  <p className="text-xs text-gray-400 mt-1.5">Tap any image to open source</p>
                </div>
              )}
            </div>
          </div>
        )}

        {/* Confirm */}
        <button
          onClick={handleConfirm}
          disabled={!serialResolved}
          className={clsx(
            'w-full py-3 font-semibold rounded-xl transition-colors',
            serialResolved
              ? 'bg-blue-600 hover:bg-blue-700 text-white'
              : 'bg-gray-200 text-gray-400 cursor-not-allowed',
          )}
        >
          {!serialResolved
            ? 'Confirm the serial number above to continue'
            : selectedAltIndex !== null
              ? `Use "${baseAlts[selectedAltIndex]?.identification}" \u2192`
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
