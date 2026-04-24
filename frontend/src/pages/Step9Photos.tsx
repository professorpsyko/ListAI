import { useCallback, useEffect, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import {
  DndContext,
  DragEndEvent,
  PointerSensor,
  closestCenter,
  useSensor,
  useSensors,
} from '@dnd-kit/core';
import {
  SortableContext,
  arrayMove,
  rectSortingStrategy,
  useSortable,
} from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import clsx from 'clsx';
import { useListingStore } from '../store/listingStore';
import { updateListing, reprocessPhotos, editPhoto } from '../lib/api';
import { useStepAction } from '../hooks/useStepAction';
import PhotoEditModal from '../components/PhotoEditModal';

// ─── Canvas helpers (shared with PhotoEditModal logic) ────────────────────────

async function loadImage(src: string): Promise<HTMLImageElement> {
  return new Promise((res, rej) => {
    const img = new Image();
    img.crossOrigin = 'anonymous';
    img.onload = () => res(img);
    img.onerror = rej;
    img.src = src.includes('cloudinary.com') ? `${src}?cb=${Date.now()}` : src;
  });
}

async function renderToBlob(
  img: HTMLImageElement,
  brightness: number,
  contrast: number,
  saturation: number,
): Promise<Blob> {
  const canvas = document.createElement('canvas');
  canvas.width = img.naturalWidth;
  canvas.height = img.naturalHeight;
  const ctx = canvas.getContext('2d')!;
  const b = 1 + brightness / 100;
  const c = 1 + contrast / 100;
  const s = 1 + saturation / 100;
  ctx.filter = `brightness(${b}) contrast(${c}) saturate(${s})`;
  ctx.drawImage(img, 0, 0);
  return new Promise<Blob>((resolve, reject) =>
    canvas.toBlob(
      (blob) => (blob ? resolve(blob) : reject(new Error('toBlob failed'))),
      'image/jpeg',
      0.93,
    ),
  );
}

async function blobToDataUrl(blob: Blob): Promise<string> {
  return new Promise((res) => {
    const reader = new FileReader();
    reader.onload = () => res(reader.result as string);
    reader.readAsDataURL(blob);
  });
}

// ─── Mini slider ─────────────────────────────────────────────────────────────

function MiniSlider({
  label, value, onChange,
}: {
  label: string; value: number; onChange: (v: number) => void;
}) {
  return (
    <div className="flex items-center gap-3 min-w-0">
      <span className="text-xs text-gray-500 w-20 flex-shrink-0">{label}</span>
      <input
        type="range" min={-100} max={100} value={value}
        onChange={(e) => onChange(Number(e.target.value))}
        className="flex-1 h-1.5 bg-gray-200 rounded-full appearance-none accent-blue-600 cursor-pointer"
      />
      <span className={clsx('text-xs font-mono w-8 text-right flex-shrink-0', value !== 0 ? 'text-blue-600' : 'text-gray-400')}>
        {value > 0 ? `+${value}` : value}
      </span>
    </div>
  );
}

// ─── Sortable photo tile ──────────────────────────────────────────────────────

function SortablePhotoTile({
  url,
  displayUrl,
  index,
  isLabel,
  masterFilter,
  onRemove,
  onEdit,
}: {
  url: string;
  displayUrl?: string;
  index: number;
  isLabel: boolean;
  masterFilter: string;
  onRemove: (url: string) => void;
  onEdit: (url: string) => void;
}) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } =
    useSortable({ id: url });

  const style: React.CSSProperties = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.4 : 1,
    zIndex: isDragging ? 50 : undefined,
  };

  const isMain = index === 0;
  // displayUrl is used for the visible image; url is the stable DnD id (canonical processed URL)
  const imgSrc = displayUrl ?? url;

  return (
    <div
      ref={setNodeRef}
      style={style}
      className={clsx(
        'relative group rounded-xl overflow-hidden border-2 bg-gray-50 select-none',
        isMain ? 'col-span-2 row-span-2 border-blue-400 shadow-lg' : 'border-gray-200 shadow-sm',
        isDragging && 'shadow-2xl ring-2 ring-blue-300',
      )}
    >
      <div {...attributes} {...listeners} className="absolute inset-0 cursor-grab active:cursor-grabbing z-10" />

      <img
        src={imgSrc}
        alt={isLabel ? 'Tag / serial' : `Photo ${index + 1}`}
        draggable={false}
        className="w-full h-full object-cover"
        style={{
          aspectRatio: '1 / 1',
          minHeight: isMain ? '240px' : '110px',
          filter: isLabel ? undefined : masterFilter,
        }}
      />

      {isMain && (
        <span className="absolute top-2 left-2 bg-blue-600 text-white text-xs font-semibold px-2 py-0.5 rounded-full shadow pointer-events-none z-20">
          Main
        </span>
      )}
      {isLabel && (
        <span className="absolute bottom-2 left-2 bg-black/60 text-white text-[10px] px-1.5 py-0.5 rounded pointer-events-none z-20">
          Tag
        </span>
      )}
      {!isMain && !isLabel && (
        <span className="absolute top-1.5 left-1.5 bg-black/40 text-white text-[10px] w-5 h-5 rounded-full flex items-center justify-center font-medium pointer-events-none z-20">
          {index + 1}
        </span>
      )}

      <div className="absolute top-1.5 right-1.5 flex gap-1 opacity-0 group-hover:opacity-100 transition-opacity z-20">
        <button
          type="button"
          onClick={(e) => { e.stopPropagation(); onEdit(url); }}
          className="w-6 h-6 rounded-full bg-black/50 hover:bg-blue-500 text-white flex items-center justify-center"
          title="Edit photo"
        >
          <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15.232 5.232l3.536 3.536m-2.036-5.036a2.5 2.5 0 113.536 3.536L6.5 21.036H3v-3.572L16.732 3.732z" />
          </svg>
        </button>
        <button
          type="button"
          onClick={(e) => { e.stopPropagation(); onRemove(url); }}
          className="w-6 h-6 rounded-full bg-black/50 hover:bg-red-500 text-white flex items-center justify-center"
          title="Remove photo"
        >
          <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M6 18L18 6M6 6l12 12" />
          </svg>
        </button>
      </div>
    </div>
  );
}

// ─── Main component ───────────────────────────────────────────────────────────

export default function Step9Photos() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const store = useListingStore();

  const [editingPhoto, setEditingPhoto] = useState<string | null>(null);
  const [showOriginal, setShowOriginal] = useState(false);
  const [processingTimedOut, setProcessingTimedOut] = useState(false);
  const [retrying, setRetrying] = useState(false);

  // Master adjustment sliders
  const [masterBrightness, setMasterBrightness] = useState(0);
  const [masterContrast, setMasterContrast] = useState(0);
  const [masterSaturation, setMasterSaturation] = useState(0);
  const [applyingAll, setApplyingAll] = useState(false);
  const [applyProgress, setApplyProgress] = useState(0);
  const hasMasterAdjustment = masterBrightness !== 0 || masterContrast !== 0 || masterSaturation !== 0;
  const masterFilter = hasMasterAdjustment
    ? `brightness(${1 + masterBrightness / 100}) contrast(${1 + masterContrast / 100}) saturate(${1 + masterSaturation / 100})`
    : 'none';

  // Hoist labelUrl early so we can filter it out of processedPhotoUrls below
  const labelUrl = store.labelPhotoUrl;
  // Strip any labelUrl that crept into processedPhotoUrls via an older handleNext bug
  const processedItemUrls = store.processedPhotoUrls.filter((u) => u !== labelUrl);

  const hasProcessed = processedItemUrls.length > 0;
  const isProcessing = !processingTimedOut && (store.imageJobStatus === 'PROCESSING' || store.imageJobStatus === 'QUEUED');
  const showEnhanceButton = !hasProcessed && !isProcessing && !retrying;

  useEffect(() => {
    if (!isProcessing || hasProcessed) return;
    const t = setTimeout(() => setProcessingTimedOut(true), 45_000);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [store.imageJobStatus]);

  async function handleReprocess() {
    if (!id || retrying) return;
    setRetrying(true);
    setProcessingTimedOut(false);
    store.setImageJobStatus('PROCESSING');
    try {
      await reprocessPhotos(id);
    } catch {
      store.setImageJobStatus('FAILED');
    } finally {
      setRetrying(false);
    }
  }

  // ── Cloudinary public-id extraction ──────────────────────────────────────
  // Both the original upload URL and the processed (eager-transformation) URL share the
  // same Cloudinary public_id.  We use this to match them regardless of array index.
  // URL formats:
  //   original:  .../upload/v1234/listai/originals/abc.jpg
  //   processed: .../upload/e_trim:15,...,f_jpg/v1234/listai/originals/abc.jpg
  function extractPublicId(url: string): string {
    // After the version segment the public_id lives, e.g. /v1234/listai/originals/abc
    const m = url.match(/\/v\d+\/(.+?)(?:\.[a-zA-Z]+)?(?:\?.*)?$/);
    if (m) return m[1];
    // Fallback for version-less URLs: grab the last path component before the extension
    const m2 = url.match(/\/upload\/(?:[^/]+\/)*(.+?)(?:\.[a-zA-Z]+)?(?:\?.*)?$/);
    return m2 ? m2[1] : url;
  }

  // Build a pub-id → original-URL lookup so we can match regardless of array order.
  const origByPid = new Map(store.itemPhotoUrls.map((u) => [extractPublicId(u), u]));

  // procToOrig maps each processed URL to its original counterpart by shared public_id.
  // This is robust even if the two arrays have different lengths or ordering.
  const procToOrig = new Map<string, string>(
    processedItemUrls.map((proc) => {
      const orig = origByPid.get(extractPublicId(proc));
      return [proc, orig ?? proc];
    }),
  );

  // orderedPhotos is the canonical drag order.  It is keyed on processed URLs when
  // processing is done, or on original URLs when processing hasn't completed yet.
  // The label is always appended at the end.
  // We filter any labelUrl that may have crept into processedPhotoUrls from an older save.
  const [orderedPhotos, setOrderedPhotos] = useState<string[]>(() => {
    const base = processedItemUrls.length ? processedItemUrls : store.itemPhotoUrls;
    return labelUrl ? [...base, labelUrl] : base;
  });

  // When processed photos arrive from the background job, switch the canonical order to
  // processed URLs.  This fires once (processedItemUrls.length grows from 0 → N).
  useEffect(() => {
    if (!processedItemUrls.length) return;
    setOrderedPhotos((prev) => {
      // If we already have processed URLs in the list, keep the user's drag order.
      const alreadyProcessed = prev.some(
        (u) => u !== labelUrl && processedItemUrls.includes(u),
      );
      if (alreadyProcessed) return prev;
      // Otherwise swap in the processed URLs.
      return labelUrl ? [...processedItemUrls, labelUrl] : processedItemUrls;
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [processedItemUrls.length]);

  // displayPhotos is what the grid renders.  orderedPhotos never changes on toggle —
  // only the display URL changes.  The label always stays as-is.
  const displayPhotos = showOriginal
    ? orderedPhotos.map((url) => (url === labelUrl ? url : (procToOrig.get(url) ?? url)))
    : orderedPhotos;

  // ── DEBUG (remove before ship) ────────────────────────────────────────────
  console.group('[Step9] Photo toggle debug — showOriginal=' + showOriginal);
  console.log('itemPhotoUrls[0]    :', store.itemPhotoUrls[0]);
  console.log('processedPhotoUrls[0]:', store.processedPhotoUrls[0]);
  console.log('SAME URL?           :', store.itemPhotoUrls[0] === store.processedPhotoUrls[0]);
  console.log('orig[0] length      :', store.itemPhotoUrls[0]?.length);
  console.log('proc[0] length      :', store.processedPhotoUrls[0]?.length);
  console.log('procToOrig[proc0] → :', procToOrig.get(processedItemUrls[0]));
  console.log('displayPhotos[0]    :', displayPhotos[0]);
  console.log('orderedPhotos[0]    :', orderedPhotos[0]);
  console.log('DISPLAY DIFFERS FROM ORDERED?:', displayPhotos[0] !== orderedPhotos[0]);
  console.groupEnd();
  // ── END DEBUG ─────────────────────────────────────────────────────────────

  // ── Apply master adjustments to all item photos ──────────────────────────

  const applyMasterToAll = useCallback(async () => {
    if (!id || !hasMasterAdjustment) return;
    const photosToProcess = orderedPhotos.filter((u) => u !== labelUrl);
    setApplyingAll(true);
    setApplyProgress(0);
    const newUrls: string[] = [];
    try {
      for (let i = 0; i < photosToProcess.length; i++) {
        const url = photosToProcess[i];
        try {
          const img = await loadImage(url);
          const blob = await renderToBlob(img, masterBrightness, masterContrast, masterSaturation);
          const dataUrl = await blobToDataUrl(blob);
          const { url: newUrl } = await editPhoto(id, dataUrl);
          newUrls.push(newUrl);
        } catch {
          newUrls.push(url); // keep original on failure
        }
        setApplyProgress(Math.round(((i + 1) / photosToProcess.length) * 100));
      }
      // Replace item photos with new URLs, keep label at end
      const updated = labelUrl ? [...newUrls, labelUrl] : newUrls;
      setOrderedPhotos(updated);
      // Reset sliders
      setMasterBrightness(0);
      setMasterContrast(0);
      setMasterSaturation(0);
    } finally {
      setApplyingAll(false);
      setApplyProgress(0);
    }
  }, [id, orderedPhotos, labelUrl, masterBrightness, masterContrast, masterSaturation, hasMasterAdjustment]);

  // DnD
  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 5 } }));

  function handleDragEnd(event: DragEndEvent) {
    const { active, over } = event;
    if (over && active.id !== over.id) {
      setOrderedPhotos((arr) => {
        const oldIdx = arr.indexOf(active.id as string);
        const newIdx = arr.indexOf(over.id as string);
        return arrayMove(arr, oldIdx, newIdx);
      });
    }
  }

  function handleRemove(url: string) {
    setOrderedPhotos((arr) => arr.filter((u) => u !== url));
  }

  function handleEditSave(oldUrl: string, newUrl: string) {
    setOrderedPhotos((arr) => arr.map((u) => (u === oldUrl ? newUrl : u)));
    setEditingPhoto(null);
  }

  const canProceed = orderedPhotos.length >= 1;
  useStepAction('Next: Preview →', !canProceed, handleNext);

  async function handleNext() {
    if (!id || !canProceed) return;

    // Save ordered list as processedImageUrls — exclude the label URL so the DB and store
    // never accumulate it inside processedPhotoUrls (which broke the toggle via index drift).
    const nonLabel = orderedPhotos.filter((u) => u !== labelUrl);
    await updateListing(id, { processedImageUrls: nonLabel });

    // Sync store
    store.setProcessedPhotos(nonLabel);

    store.setCurrentStep(8);
    navigate(`/listing/${id}/step/8`);
  }

  return (
    <div className="space-y-6 max-w-2xl">
      {/* Header */}
      <div>
        <h2 className="text-2xl font-bold text-gray-900">Review your photos</h2>
        <p className="text-gray-500 mt-1">
          These are the photos that will appear on your eBay listing. Drag to reorder — the first photo is your main listing image.
        </p>
      </div>

      {/* Processing banner */}
      {isProcessing && (
        <div className="flex items-start gap-3 bg-blue-50 border border-blue-200 rounded-lg px-4 py-3 text-sm text-blue-700">
          <svg className="w-4 h-4 animate-spin flex-shrink-0 mt-0.5" fill="none" viewBox="0 0 24 24">
            <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
            <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
          </svg>
          <span>Photo enhancement in progress — photos will update automatically when ready.</span>
        </div>
      )}

      {/* Timed-out banner */}
      {processingTimedOut && !hasProcessed && (
        <div className="flex items-start gap-3 bg-amber-50 border border-amber-200 rounded-lg px-4 py-3 text-sm text-amber-800">
          <svg className="w-4 h-4 flex-shrink-0 mt-0.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01M12 3a9 9 0 100 18A9 9 0 0012 3z" />
          </svg>
          <div className="flex-1">
            <p className="font-medium">Photo processing is taking longer than expected.</p>
            <p className="mt-0.5 text-amber-700">You can retry or continue with your original photos — they'll work fine for your listing.</p>
            <button onClick={handleReprocess} className="mt-2 inline-flex items-center gap-1.5 px-3 py-1 rounded-md bg-amber-100 hover:bg-amber-200 text-amber-800 font-medium text-xs transition-colors">
              <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
              </svg>
              Retry processing
            </button>
          </div>
        </div>
      )}

      {/* Enhance button */}
      {showEnhanceButton && (
        <button onClick={handleReprocess} className="flex items-center gap-2 text-sm text-blue-600 hover:text-blue-700 font-medium">
          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 3l14 9-14 9V3z" />
          </svg>
          Enhance photos
        </button>
      )}

      {/* Processed / Original toggle + photo count */}
      {hasProcessed && (
        <div className="flex items-center gap-3">
          <span className="text-sm text-gray-500">Showing:</span>
          <div className="flex rounded-lg border border-gray-200 overflow-hidden text-sm">
            <button
              onClick={() => setShowOriginal(false)}
              className={clsx('px-3 py-1.5 font-medium transition-colors', !showOriginal ? 'bg-blue-600 text-white' : 'bg-white text-gray-600 hover:bg-gray-50')}
            >
              Processed
            </button>
            <button
              onClick={() => setShowOriginal(true)}
              className={clsx('px-3 py-1.5 font-medium transition-colors border-l border-gray-200', showOriginal ? 'bg-blue-600 text-white' : 'bg-white text-gray-600 hover:bg-gray-50')}
            >
              Original
            </button>
          </div>
          <span className="text-xs text-gray-400">{orderedPhotos.length} photo{orderedPhotos.length !== 1 ? 's' : ''}</span>
        </div>
      )}

      {/* ── Master adjustment sliders ───────────────────────────────────────── */}
      <div className="bg-gray-50 border border-gray-200 rounded-xl p-4 space-y-3">
        <div className="flex items-center justify-between">
          <p className="text-sm font-medium text-gray-700">Adjust all photos</p>
          <div className="flex items-center gap-2">
            {hasMasterAdjustment && (
              <button
                onClick={() => { setMasterBrightness(0); setMasterContrast(0); setMasterSaturation(0); }}
                className="text-xs text-gray-400 hover:text-gray-600"
              >
                Reset
              </button>
            )}
            <button
              onClick={applyMasterToAll}
              disabled={!hasMasterAdjustment || applyingAll}
              className="text-xs bg-blue-600 text-white px-3 py-1 rounded-md hover:bg-blue-700 disabled:opacity-40 disabled:cursor-not-allowed flex items-center gap-1.5"
            >
              {applyingAll ? (
                <>
                  <svg className="w-3 h-3 animate-spin" fill="none" viewBox="0 0 24 24">
                    <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                    <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
                  </svg>
                  {applyProgress}%
                </>
              ) : (
                'Apply to all'
              )}
            </button>
          </div>
        </div>
        <MiniSlider label="Brightness" value={masterBrightness} onChange={setMasterBrightness} />
        <MiniSlider label="Contrast"   value={masterContrast}   onChange={setMasterContrast}   />
        <MiniSlider label="Saturation" value={masterSaturation} onChange={setMasterSaturation} />
        {hasMasterAdjustment && !applyingAll && (
          <p className="text-xs text-blue-600">Preview active — click "Apply to all" to save changes</p>
        )}
        {applyingAll && (
          <div className="w-full h-1.5 bg-blue-100 rounded-full overflow-hidden">
            <div className="h-full bg-blue-500 rounded-full transition-all duration-300" style={{ width: `${applyProgress}%` }} />
          </div>
        )}
      </div>

      {/* Photo grid */}
      {orderedPhotos.length > 0 ? (
        <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={handleDragEnd}>
          <SortableContext items={orderedPhotos} strategy={rectSortingStrategy}>
            <div className="grid grid-cols-4 gap-3 auto-rows-auto">
              {orderedPhotos.map((url, i) => (
                <SortablePhotoTile
                  key={url}
                  url={url}
                  displayUrl={displayPhotos[i]}
                  index={i}
                  isLabel={url === labelUrl}
                  masterFilter={masterFilter}
                  onRemove={handleRemove}
                  onEdit={setEditingPhoto}
                />
              ))}
            </div>
          </SortableContext>
        </DndContext>
      ) : (
        <div className="border-2 border-dashed border-gray-200 rounded-xl py-12 text-center text-gray-400">
          No photos remaining — go back and add photos.
        </div>
      )}

      {/* Hint */}
      <p className="text-xs text-gray-400">
        Hover a photo to reveal edit / remove buttons · drag to reorder · first photo is the main eBay image
      </p>

      {/* Edit modal */}
      {editingPhoto && id && (
        <PhotoEditModal
          photoUrl={editingPhoto}
          listingId={id}
          onSave={(newUrl) => handleEditSave(editingPhoto, newUrl)}
          onClose={() => setEditingPhoto(null)}
        />
      )}
    </div>
  );
}
