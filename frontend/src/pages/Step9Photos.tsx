import { useEffect, useState } from 'react';
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
import { updateListing, reprocessPhotos } from '../lib/api';
import { useStepAction } from '../hooks/useStepAction';
import PhotoEditModal from '../components/PhotoEditModal';

// ─── Sortable photo tile ──────────────────────────────────────────────────────

function SortablePhotoTile({
  url,
  index,
  isLabel,
  onRemove,
  onEdit,
}: {
  url: string;
  index: number;
  isLabel: boolean;
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

  return (
    <div
      ref={setNodeRef}
      style={style}
      className={clsx(
        'relative group rounded-xl overflow-hidden border-2 bg-gray-50 select-none',
        isMain
          ? 'col-span-2 row-span-2 border-blue-400 shadow-lg'
          : 'border-gray-200 shadow-sm',
        isDragging && 'shadow-2xl ring-2 ring-blue-300',
      )}
    >
      {/* Drag handle overlay */}
      <div
        {...attributes}
        {...listeners}
        className="absolute inset-0 cursor-grab active:cursor-grabbing z-10"
      />

      <img
        src={url}
        alt={isLabel ? 'Tag / serial' : `Photo ${index + 1}`}
        draggable={false}
        className="w-full h-full object-cover"
        style={{ aspectRatio: isMain ? '1 / 1' : '1 / 1', minHeight: isMain ? '240px' : '110px' }}
      />

      {/* Badges */}
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

      {/* Action buttons — shown on hover */}
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
  const hasProcessed = store.processedPhotoUrls.length > 0;
  const isProcessing = !processingTimedOut && (store.imageJobStatus === 'PROCESSING' || store.imageJobStatus === 'QUEUED');
  // Show enhance button when not processing and no processed photos exist yet
  const showEnhanceButton = !hasProcessed && !isProcessing && !retrying;

  // If processing takes more than 45 s, stop waiting and let the user proceed with originals
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

  const labelUrl = store.labelPhotoUrl;

  // Find which index in the originals is the label photo, then carry that index
  // into the processed array so we always find the right "label" URL regardless
  // of whether we're showing originals or processed versions.
  const labelIndex = labelUrl ? store.itemPhotoUrls.indexOf(labelUrl) : -1;

  function buildOrderedPhotos(originals: string[], processed: string[]): string[] {
    const useProcessed = !showOriginal && hasProcessed;
    const pool = useProcessed ? processed : originals;
    // All photos — processed or original
    const allPhotos = pool.length ? pool : originals;
    // Determine the effective label URL in this pool
    const effectiveLabelUrl = labelIndex >= 0 && labelIndex < allPhotos.length
      ? allPhotos[labelIndex]
      : null;
    const withoutLabel = effectiveLabelUrl
      ? allPhotos.filter((u) => u !== effectiveLabelUrl)
      : allPhotos;
    return effectiveLabelUrl ? [...withoutLabel, effectiveLabelUrl] : withoutLabel;
  }

  const [orderedPhotos, setOrderedPhotos] = useState<string[]>(() =>
    buildOrderedPhotos(store.itemPhotoUrls, store.processedPhotoUrls),
  );

  // Re-sync when processed photos arrive or toggle changes
  useEffect(() => {
    setOrderedPhotos(buildOrderedPhotos(store.itemPhotoUrls, store.processedPhotoUrls));
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [store.processedPhotoUrls.length, showOriginal]);

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

    // Save the final ordered + filtered photo list back to the listing
    await updateListing(id, {
      imageUrls: orderedPhotos,
      processedImageUrls: orderedPhotos,
    });

    // Sync store
    const nonLabel = orderedPhotos.filter((u) => u !== labelUrl);
    store.setItemPhotos(nonLabel);
    store.setProcessedPhotos(nonLabel);

    store.setCurrentStep(10);
    navigate(`/listing/${id}/step/10`);
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

      {/* Enhance button — always visible when no processed photos and not currently running */}
      {showEnhanceButton && (
        <button
          onClick={handleReprocess}
          className="flex items-center gap-2 text-sm text-blue-600 hover:text-blue-700 font-medium"
        >
          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 3l14 9-14 9V3z" />
          </svg>
          Enhance photos
        </button>
      )}

      {/* Processed / Original toggle */}
      {hasProcessed && (
        <div className="flex items-center gap-3">
          <span className="text-sm text-gray-500">Showing:</span>
          <div className="flex rounded-lg border border-gray-200 overflow-hidden text-sm">
            <button
              onClick={() => setShowOriginal(false)}
              className={clsx(
                'px-3 py-1.5 font-medium transition-colors',
                !showOriginal ? 'bg-blue-600 text-white' : 'bg-white text-gray-600 hover:bg-gray-50',
              )}
            >
              Processed
            </button>
            <button
              onClick={() => setShowOriginal(true)}
              className={clsx(
                'px-3 py-1.5 font-medium transition-colors border-l border-gray-200',
                showOriginal ? 'bg-blue-600 text-white' : 'bg-white text-gray-600 hover:bg-gray-50',
              )}
            >
              Original
            </button>
          </div>
          <span className="text-xs text-gray-400">{orderedPhotos.length} photo{orderedPhotos.length !== 1 ? 's' : ''}</span>
        </div>
      )}

      {/* Photo grid */}
      {orderedPhotos.length > 0 ? (
        <DndContext
          sensors={sensors}
          collisionDetection={closestCenter}
          onDragEnd={handleDragEnd}
        >
          <SortableContext items={orderedPhotos} strategy={rectSortingStrategy}>
            <div className="grid grid-cols-4 gap-3 auto-rows-auto">
              {orderedPhotos.map((url, i) => (
                <SortablePhotoTile
                  key={url}
                  url={url}
                  index={i}
                  isLabel={i === orderedPhotos.length - 1 && labelIndex >= 0}
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
