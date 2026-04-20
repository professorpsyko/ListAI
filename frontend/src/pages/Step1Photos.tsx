import { useState, useRef, useEffect } from 'react';
import { useStepAction } from '../hooks/useStepAction';
import { useNavigate, useParams } from 'react-router-dom';
import { useListingStore } from '../store/listingStore';
import { uploadPhotos, updateListing, createListing } from '../lib/api';
import clsx from 'clsx';

// ─── Upload progress stages ───────────────────────────────────────────────────

const LABEL_STAGES = [
  { delay: 0,     pct: 8,  text: 'Sending photo to the cloud...' },
  { delay: 1500,  pct: 30, text: 'Uploading to image service...' },
  { delay: 3500,  pct: 55, text: 'Getting your label camera-ready...' },
  { delay: 6000,  pct: 75, text: 'Optimising for marketplace image standards...' },
  { delay: 9000,  pct: 88, text: 'Almost listing-ready...' },
  { delay: 13000, pct: 95, text: 'Wrapping up — nearly there...' },
];

const ITEMS_STAGES = [
  { delay: 0,     pct: 5,  text: 'Sending shots to the cloud...' },
  { delay: 1500,  pct: 22, text: 'Uploading to image service...' },
  { delay: 3500,  pct: 42, text: 'Working some listing magic...' },
  { delay: 6000,  pct: 60, text: 'Polishing pixels for online shoppers...' },
  { delay: 9000,  pct: 76, text: 'Optimising for crisp, click-worthy listings...' },
  { delay: 13000, pct: 88, text: 'Almost ready to dazzle shoppers...' },
  { delay: 18000, pct: 95, text: 'Final touches — hang tight...' },
];

const UPLOAD_TIMEOUT_MS = 45000;
const MAX_LISTINGS = 5;

// ─── Helpers ──────────────────────────────────────────────────────────────────

interface FileMeta { name: string; size: number; lastModified?: number }

function isSameFile(a: FileMeta, b: FileMeta): boolean {
  if (a.lastModified && b.lastModified) return a.size === b.size && a.lastModified === b.lastModified;
  return a.name === b.name && a.size === b.size;
}

function syncPhotosToBackend(listingId: string, labelUrl: string, itemUrls: string[]) {
  const allUrls = [labelUrl, ...itemUrls].filter(Boolean);
  updateListing(listingId, { imageUrls: allUrls }).catch(() => {});
}

// ─── Upload progress hook ─────────────────────────────────────────────────────

function useUploadStatus(uploading: boolean, stages: typeof LABEL_STAGES) {
  const [stageIndex, setStageIndex] = useState(0);
  useEffect(() => {
    if (!uploading) { setStageIndex(0); return; }
    const timers = stages.map((s, i) => setTimeout(() => setStageIndex(i), s.delay));
    return () => timers.forEach(clearTimeout);
  }, [uploading]); // eslint-disable-line react-hooks/exhaustive-deps
  const stage = stages[stageIndex] ?? stages[stages.length - 1];
  return { text: stage.text, pct: stage.pct };
}

// ─── Uploading overlay ────────────────────────────────────────────────────────

function UploadingOverlay({ text, pct }: { text: string; pct: number }) {
  return (
    <div className="flex flex-col items-center justify-center gap-5 px-8 text-center w-full">
      <div className="relative w-14 h-14">
        <div className="absolute inset-0 rounded-full border-4 border-blue-100" />
        <div className="absolute inset-0 rounded-full border-4 border-blue-500 border-t-transparent animate-spin" />
        <div className="absolute inset-0 flex items-center justify-center">
          <svg className="w-5 h-5 text-blue-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
              d="M3 9a2 2 0 012-2h.93a2 2 0 001.664-.89l.812-1.22A2 2 0 0110.07 4h3.86a2 2 0 011.664.89l.812 1.22A2 2 0 0018.07 7H19a2 2 0 012 2v9a2 2 0 01-2 2H5a2 2 0 01-2-2V9z" />
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 13a3 3 0 11-6 0 3 3 0 016 0z" />
          </svg>
        </div>
      </div>
      <div key={text} className="animate-fade-in">
        <p className="text-sm font-semibold text-blue-700 leading-snug">{text}</p>
      </div>
      <div className="w-full space-y-1.5">
        <div className="w-full h-2 bg-blue-100 rounded-full overflow-hidden">
          <div className="h-full bg-blue-500 rounded-full transition-all duration-700 ease-out" style={{ width: `${pct}%` }} />
        </div>
        <p className="text-xs text-blue-400 text-right">{pct}%</p>
      </div>
    </div>
  );
}

// ─── Collapsed listing card ───────────────────────────────────────────────────

function CollapsedCard({
  listingNumber,
  mainPhotoUrl,
  extraPhotos,
  totalItems,
  hasLabel,
  onExpand,
}: {
  listingNumber: number;
  mainPhotoUrl: string | null;
  extraPhotos: string[];
  totalItems: number;
  hasLabel: boolean;
  onExpand: () => void;
}) {
  return (
    <div
      onClick={onExpand}
      className="bg-white border border-gray-200 rounded-xl px-5 py-4 flex items-center gap-4 cursor-pointer hover:border-blue-300 hover:bg-blue-50/30 transition-colors group"
    >
      {/* Listing number */}
      <span className="text-sm font-semibold text-gray-700 w-20 flex-shrink-0">
        Listing #{listingNumber}
      </span>

      {/* Main photo thumbnail */}
      {mainPhotoUrl ? (
        <div className="relative flex-shrink-0">
          <img
            src={mainPhotoUrl}
            alt="Main photo"
            className="w-16 h-16 object-cover rounded-lg border border-gray-200 shadow-sm"
          />
          <span className="absolute -top-1.5 -left-1.5 bg-blue-600 text-white text-[10px] font-semibold px-1.5 py-0.5 rounded-full shadow">
            Cover
          </span>
        </div>
      ) : (
        <div className="w-16 h-16 rounded-lg border-2 border-dashed border-gray-300 bg-gray-50 flex items-center justify-center flex-shrink-0">
          <svg className="w-5 h-5 text-gray-300" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z" />
          </svg>
        </div>
      )}

      {/* Additional thumbnails */}
      {extraPhotos.length > 0 && (
        <div className="flex gap-1.5 flex-shrink-0">
          {extraPhotos.map((url, i) => (
            <img
              key={i}
              src={url}
              alt={`Photo ${i + 2}`}
              className="w-10 h-10 object-cover rounded-md border border-gray-200"
            />
          ))}
        </div>
      )}

      {/* Status */}
      <div className="flex-1 min-w-0">
        {totalItems > 0 ? (
          <div className="flex items-center gap-2 flex-wrap">
            <span className="text-sm text-gray-600">
              {totalItems} item photo{totalItems !== 1 ? 's' : ''}
            </span>
            {hasLabel && (
              <span className="text-xs text-gray-400 bg-gray-100 px-1.5 py-0.5 rounded">+ label</span>
            )}
          </div>
        ) : (
          <p className="text-sm text-gray-400 italic">No photos yet — click to add</p>
        )}
      </div>

      {/* Expand indicator */}
      <svg className="w-4 h-4 text-gray-400 group-hover:text-blue-500 flex-shrink-0 transition-colors" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
      </svg>
    </div>
  );
}

// ─── Single listing upload card ───────────────────────────────────────────────

interface ListingCardProps {
  listingId: string;
  listingNumber: number;
  collapsed: boolean;
  onToggle: () => void;
  /** First listing syncs its photos into the Zustand store so the wizard can use them */
  isFirst: boolean;
}

function ListingCard({ listingId, listingNumber, collapsed, onToggle, isFirst }: ListingCardProps) {
  const store = useListingStore();

  // For the first listing, seed from store so back-navigation works
  const [labelUrl, setLabelUrlState] = useState<string>(() => isFirst ? (store.labelPhotoUrl ?? '') : '');
  const [labelMeta, setLabelMetaState] = useState<FileMeta | null>(() => isFirst ? store.labelPhotoMeta : null);
  const [itemUrls, setItemUrlsState] = useState<string[]>(() => isFirst ? [...store.itemPhotoUrls] : []);
  const [itemMetas, setItemMetasState] = useState<FileMeta[]>(() => isFirst ? [...store.itemPhotoMetas] : []);

  const [labelUploading, setLabelUploading] = useState(false);
  const [itemsUploading, setItemsUploading] = useState(false);
  const [uploadError, setUploadError] = useState<string | null>(null);
  const [duplicateWarning, setDuplicateWarning] = useState<string | null>(null);
  const [reverseDupeWarning, setReverseDupeWarning] = useState<string | null>(null);
  const [dragIndex, setDragIndex] = useState<number | null>(null);
  const [dragOverIndex, setDragOverIndex] = useState<number | null>(null);

  const labelInputRef = useRef<HTMLInputElement>(null);
  const itemsInputRef = useRef<HTMLInputElement>(null);

  const labelStatus = useUploadStatus(labelUploading, LABEL_STAGES);
  const itemsStatus = useUploadStatus(itemsUploading, ITEMS_STAGES);

  // Sync helpers — update local state and optionally push to store
  function applyLabelPhoto(url: string, meta: FileMeta | null) {
    setLabelUrlState(url);
    setLabelMetaState(meta);
    if (isFirst) store.setLabelPhoto(url, meta);
  }

  function applyItemPhotos(urls: string[], metas: FileMeta[]) {
    setItemUrlsState(urls);
    setItemMetasState(metas);
    if (isFirst) store.setItemPhotos(urls, metas);
  }

  // ── Label upload ─────────────────────────────────────────────────────────

  async function handleLabelFiles(files: FileList | null) {
    if (!files || !files[0]) return;
    setUploadError(null);
    setLabelUploading(true);
    const labelMetaNew: FileMeta = { name: files[0].name, size: files[0].size, lastModified: files[0].lastModified };

    const timeout = setTimeout(() => {
      setLabelUploading(false);
      setUploadError('Upload timed out — please check your connection and try again.');
    }, UPLOAD_TIMEOUT_MS);

    try {
      const result = await uploadPhotos(listingId, [files[0]]);
      clearTimeout(timeout);
      const newLabelUrl = result.urls[0];
      applyLabelPhoto(newLabelUrl, labelMetaNew);
      if (isFirst) store.setImageJobStatus('QUEUED');

      // Reverse-dupe: label was already in items
      const dupeIndexes = itemMetas.reduce<number[]>((acc, m, i) => {
        if (isSameFile(m, labelMetaNew)) acc.push(i);
        return acc;
      }, []);
      if (dupeIndexes.length > 0) {
        const newUrls = itemUrls.filter((_, i) => !dupeIndexes.includes(i));
        const newMetas = itemMetas.filter((_, i) => !dupeIndexes.includes(i));
        applyItemPhotos(newUrls, newMetas);
        setReverseDupeWarning('That photo was already in your item shots — moved it to the label slot.');
        syncPhotosToBackend(listingId, newLabelUrl, newUrls);
      } else {
        syncPhotosToBackend(listingId, newLabelUrl, itemUrls);
      }
    } catch (err) {
      clearTimeout(timeout);
      setUploadError(`Upload failed: ${(err as Error).message}`);
    } finally {
      setLabelUploading(false);
    }
  }

  // ── Item uploads ──────────────────────────────────────────────────────────

  async function handleItemFiles(files: FileList | null) {
    if (!files || !files.length) return;
    if (labelUploading) {
      setDuplicateWarning('Label is still uploading — please wait a moment before adding item photos.');
      return;
    }
    setUploadError(null);
    setDuplicateWarning(null);

    let fileArray = Array.from(files);
    if (labelMeta) {
      const dupes = fileArray.filter((f) => isSameFile({ name: f.name, size: f.size, lastModified: f.lastModified }, labelMeta));
      if (dupes.length > 0) {
        fileArray = fileArray.filter((f) => !isSameFile({ name: f.name, size: f.size, lastModified: f.lastModified }, labelMeta));
        setDuplicateWarning(`${dupes.length} photo${dupes.length > 1 ? 's' : ''} removed — already used as label photo.`);
      }
    }

    const remaining = 15 - itemUrls.length;
    const toUpload = fileArray.slice(0, remaining);
    if (!toUpload.length) return;

    setItemsUploading(true);

    const timeout = setTimeout(() => {
      setItemsUploading(false);
      setUploadError('Upload timed out — please check your connection and try again.');
    }, UPLOAD_TIMEOUT_MS);

    try {
      const result = await uploadPhotos(listingId, toUpload);
      clearTimeout(timeout);
      const newUrls = [...itemUrls, ...result.urls];
      const newMetas = [...itemMetas, ...toUpload.map((f) => ({ name: f.name, size: f.size, lastModified: f.lastModified }))];
      applyItemPhotos(newUrls, newMetas);
      if (isFirst) store.setImageJobStatus('QUEUED');
      syncPhotosToBackend(listingId, labelUrl, newUrls);
    } catch (err) {
      clearTimeout(timeout);
      setUploadError(`Upload failed: ${(err as Error).message}`);
    } finally {
      setItemsUploading(false);
    }
  }

  function handleDrop(e: React.DragEvent, type: 'label' | 'items') {
    e.preventDefault();
    e.stopPropagation();
    if (type === 'label') handleLabelFiles(e.dataTransfer.files);
    else handleItemFiles(e.dataTransfer.files);
  }

  function handleDragOver(e: React.DragEvent) { e.preventDefault(); e.stopPropagation(); }

  function removeItemPhoto(idx: number) {
    const newUrls = itemUrls.filter((_, i) => i !== idx);
    const newMetas = itemMetas.filter((_, i) => i !== idx);
    applyItemPhotos(newUrls, newMetas);
    syncPhotosToBackend(listingId, labelUrl, newUrls);
  }

  function removeLabelPhoto() {
    applyLabelPhoto('', null);
    syncPhotosToBackend(listingId, '', itemUrls);
  }

  function handlePhotoDragStart(idx: number) { setDragIndex(idx); }
  function handlePhotoDragOver(e: React.DragEvent, idx: number) { e.preventDefault(); setDragOverIndex(idx); }
  function handlePhotoDragEnd() { setDragIndex(null); setDragOverIndex(null); }

  function handlePhotoDrop(e: React.DragEvent, idx: number) {
    e.preventDefault();
    if (dragIndex === null || dragIndex === idx) { setDragIndex(null); setDragOverIndex(null); return; }
    const newUrls = [...itemUrls];
    const newMetas = [...itemMetas];
    const [url] = newUrls.splice(dragIndex, 1);
    const [meta] = newMetas.splice(dragIndex, 1);
    newUrls.splice(idx, 0, url);
    newMetas.splice(idx, 0, meta);
    applyItemPhotos(newUrls, newMetas);
    syncPhotosToBackend(listingId, labelUrl, newUrls);
    setDragIndex(null);
    setDragOverIndex(null);
  }

  // ── Collapsed view ────────────────────────────────────────────────────────

  if (collapsed) {
    // Show up to 3 extra thumbnails (photos 2–4)
    const extraPhotos = itemUrls.slice(1, 4);
    return (
      <CollapsedCard
        listingNumber={listingNumber}
        mainPhotoUrl={itemUrls[0] ?? null}
        extraPhotos={extraPhotos}
        totalItems={itemUrls.length}
        hasLabel={!!labelUrl}
        onExpand={onToggle}
      />
    );
  }

  // ── Expanded view ─────────────────────────────────────────────────────────

  return (
    <div className="bg-white border border-gray-200 rounded-xl p-6 space-y-5">
      {/* Card header */}
      <div className="flex items-center justify-between">
        <h3 className="font-semibold text-gray-800">Listing #{listingNumber}</h3>
        {listingNumber > 1 && (
          <button
            onClick={onToggle}
            className="text-xs text-gray-400 hover:text-gray-600 transition-colors flex items-center gap-1"
          >
            <svg className="w-3.5 h-3.5 rotate-180" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
            </svg>
            Collapse
          </button>
        )}
      </div>

      <div className="grid grid-cols-2 gap-6">
        {/* Zone A — Label photo */}
        <div className="space-y-3">
          <div>
            <h4 className="font-medium text-gray-700 text-sm">Serial number or model label</h4>
            <p className="text-xs text-gray-400 mt-0.5">Close-up of any tag, sticker, or label on the item</p>
          </div>

          <input ref={labelInputRef} type="file" accept="image/*" className="hidden"
            onChange={(e) => handleLabelFiles(e.target.files)} />

          {labelUrl && !labelUploading ? (
            <div className="relative group rounded-xl overflow-hidden border border-gray-200 bg-gray-50 aspect-square">
              <img src={labelUrl} alt="Label" className="w-full h-full object-cover" />
              <button onClick={removeLabelPhoto}
                className="absolute top-2 right-2 bg-white rounded-full p-1 shadow opacity-0 group-hover:opacity-100 transition-opacity">
                <svg className="w-4 h-4 text-gray-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </div>
          ) : (
            <div
              onClick={() => !labelUploading && labelInputRef.current?.click()}
              onDrop={(e) => handleDrop(e, 'label')}
              onDragOver={handleDragOver}
              className={clsx(
                'border-2 border-dashed rounded-xl aspect-square flex flex-col items-center justify-center transition-colors',
                labelUploading
                  ? 'border-blue-300 bg-blue-50 cursor-default'
                  : 'border-gray-300 hover:border-blue-400 bg-gray-50 cursor-pointer',
              )}
            >
              {labelUploading ? (
                <UploadingOverlay text={labelStatus.text} pct={labelStatus.pct} />
              ) : (
                <>
                  <div className="p-3 bg-white rounded-full shadow-sm mb-3">
                    <svg className="w-8 h-8 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5}
                        d="M7 7h.01M7 3h5l2 2h4a2 2 0 012 2v10a2 2 0 01-2 2H5a2 2 0 01-2-2V5a2 2 0 012-2h2z" />
                    </svg>
                  </div>
                  <p className="text-sm font-medium text-gray-600">Drop label photo here</p>
                  <p className="text-xs text-gray-400 mt-1">or click to browse</p>
                </>
              )}
            </div>
          )}
        </div>

        {/* Zone B — Item photos */}
        <div className="space-y-3">
          <div>
            <h4 className="font-medium text-gray-700 text-sm">Item photos</h4>
            <p className="text-xs text-gray-400 mt-0.5">2–15 photos — front, back, sides, any damage</p>
          </div>

          <input ref={itemsInputRef} type="file" accept="image/*" multiple className="hidden"
            onChange={(e) => handleItemFiles(e.target.files)} />

          {itemUrls.length > 0 && !itemsUploading && (
            <>
              <div className="grid grid-cols-3 gap-2">
                {itemUrls.map((url, idx) => (
                  <div
                    key={`${url}-${idx}`}
                    draggable
                    onDragStart={() => handlePhotoDragStart(idx)}
                    onDragOver={(e) => handlePhotoDragOver(e, idx)}
                    onDrop={(e) => handlePhotoDrop(e, idx)}
                    onDragEnd={handlePhotoDragEnd}
                    className={clsx(
                      'relative group aspect-square rounded-lg overflow-hidden border transition-all cursor-grab active:cursor-grabbing',
                      dragOverIndex === idx && dragIndex !== idx
                        ? 'border-blue-400 ring-2 ring-blue-300 scale-95'
                        : dragIndex === idx ? 'border-blue-300 opacity-50' : 'border-gray-200',
                    )}
                  >
                    <img src={url} alt={`Item ${idx + 1}`} className="w-full h-full object-cover" />
                    {idx === 0 && (
                      <div className="absolute top-1.5 left-1.5 bg-blue-600 text-white text-xs font-semibold px-1.5 py-0.5 rounded shadow">
                        Cover
                      </div>
                    )}
                    <div className="absolute bottom-1 left-1 opacity-0 group-hover:opacity-60 transition-opacity">
                      <svg className="w-4 h-4 text-white drop-shadow" fill="currentColor" viewBox="0 0 20 20">
                        <path d="M7 2a2 2 0 1 0 .001 4.001A2 2 0 0 0 7 2zm0 6a2 2 0 1 0 .001 4.001A2 2 0 0 0 7 8zm0 6a2 2 0 1 0 .001 4.001A2 2 0 0 0 7 14zm6-8a2 2 0 1 0-.001-4.001A2 2 0 0 0 13 6zm0 2a2 2 0 1 0 .001 4.001A2 2 0 0 0 13 8zm0 6a2 2 0 1 0 .001 4.001A2 2 0 0 0 13 14z"/>
                      </svg>
                    </div>
                    <button onClick={() => removeItemPhoto(idx)}
                      className="absolute top-1 right-1 bg-white rounded-full p-0.5 shadow opacity-0 group-hover:opacity-100 transition-opacity">
                      <svg className="w-3.5 h-3.5 text-gray-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                      </svg>
                    </button>
                  </div>
                ))}
                {itemUrls.length < 15 && (
                  <div
                    onClick={() => itemsInputRef.current?.click()}
                    className="aspect-square rounded-lg border-2 border-dashed border-gray-300 hover:border-blue-400 flex items-center justify-center cursor-pointer"
                  >
                    <svg className="w-6 h-6 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
                    </svg>
                  </div>
                )}
              </div>
              <p className="text-xs text-gray-400 flex items-center gap-1">
                <svg className="w-3.5 h-3.5 text-blue-400 flex-shrink-0" fill="currentColor" viewBox="0 0 20 20">
                  <path fillRule="evenodd" d="M18 10a8 8 0 11-16 0 8 8 0 0116 0zm-7-4a1 1 0 11-2 0 1 1 0 012 0zM9 9a1 1 0 000 2v3a1 1 0 001 1h1a1 1 0 100-2v-3a1 1 0 00-1-1H9z" clipRule="evenodd" />
                </svg>
                <span><strong className="text-blue-500">Cover</strong> photo (slot 1) is what shoppers see — drag to reorder</span>
              </p>
            </>
          )}

          {(itemUrls.length === 0 || itemsUploading) && (
            <div
              onClick={() => !itemsUploading && !labelUploading && itemsInputRef.current?.click()}
              onDrop={(e) => handleDrop(e, 'items')}
              onDragOver={handleDragOver}
              className={clsx(
                'border-2 border-dashed rounded-xl aspect-square flex flex-col items-center justify-center transition-colors',
                itemsUploading
                  ? 'border-blue-300 bg-blue-50 cursor-default'
                  : labelUploading
                  ? 'border-gray-200 bg-gray-50 cursor-not-allowed opacity-60'
                  : 'border-gray-300 hover:border-blue-400 bg-gray-50 cursor-pointer',
              )}
            >
              {itemsUploading ? (
                <UploadingOverlay text={itemsStatus.text} pct={itemsStatus.pct} />
              ) : labelUploading ? (
                <>
                  <div className="p-3 bg-white rounded-full shadow-sm mb-3 opacity-50">
                    <svg className="w-8 h-8 text-gray-300" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5}
                        d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z" />
                    </svg>
                  </div>
                  <p className="text-sm font-medium text-gray-400">Waiting for label upload...</p>
                </>
              ) : (
                <>
                  <div className="p-3 bg-white rounded-full shadow-sm mb-3">
                    <svg className="w-8 h-8 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5}
                        d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z" />
                    </svg>
                  </div>
                  <p className="text-sm font-medium text-gray-600">Drop item photos here</p>
                  <p className="text-xs text-gray-400 mt-1">or click to browse • 2–15 photos</p>
                </>
              )}
            </div>
          )}

          {itemUrls.length > 0 && itemUrls.length < 2 && !itemsUploading && (
            <p className="text-sm text-amber-600">Add at least one more photo to continue</p>
          )}
        </div>
      </div>

      {/* Warnings */}
      {reverseDupeWarning && (
        <div className="flex items-start gap-2.5 bg-amber-50 border border-amber-200 rounded-lg p-3">
          <svg className="w-4 h-4 text-amber-500 mt-0.5 shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01M10.29 3.86L1.82 18a2 2 0 001.71 3h16.94a2 2 0 001.71-3L13.71 3.86a2 2 0 00-3.42 0z" />
          </svg>
          <p className="text-sm text-amber-700">{reverseDupeWarning}</p>
        </div>
      )}
      {duplicateWarning && (
        <div className="flex items-start gap-2.5 bg-amber-50 border border-amber-200 rounded-lg p-3">
          <svg className="w-4 h-4 text-amber-500 mt-0.5 shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01M10.29 3.86L1.82 18a2 2 0 001.71 3h16.94a2 2 0 001.71-3L13.71 3.86a2 2 0 00-3.42 0z" />
          </svg>
          <p className="text-sm text-amber-700">{duplicateWarning}</p>
        </div>
      )}
      {uploadError && (
        <div className="bg-red-50 border border-red-200 rounded-lg p-3 text-sm text-red-700">
          {uploadError}
        </div>
      )}
    </div>
  );
}

// ─── Main page ────────────────────────────────────────────────────────────────

export default function Step1Photos() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const store = useListingStore();
  const [listings, setListings] = useState<{ id: string }[]>([{ id: id! }]);
  const [expandedIndex, setExpandedIndex] = useState(0);
  const [addingListing, setAddingListing] = useState(false);
  const [addError, setAddError] = useState<string | null>(null);

  const canProceed = !!store.labelPhotoUrl && store.itemPhotoUrls.length >= 2;
  useStepAction('Next: Identify item \u2192', !canProceed, handleNext);

  async function handleAddListing() {
    if (listings.length >= MAX_LISTINGS || addingListing) return;
    setAddingListing(true);
    setAddError(null);
    try {
      const newListing = await createListing();
      setListings((prev) => [...prev, { id: newListing.id }]);
      setExpandedIndex(listings.length); // expand the new one
    } catch {
      setAddError('Could not create listing — please try again.');
    } finally {
      setAddingListing(false);
    }
  }

  function handleToggle(idx: number) {
    setExpandedIndex((prev) => (prev === idx ? -1 : idx));
  }

  function handleNext() {
    store.setCurrentStep(2);
    navigate(`/listing/${id}/step/2`);
  }

  return (
    <div className="space-y-4 max-w-2xl">
      {/* Header */}
      <div className="mb-2">
        <h2 className="text-2xl font-bold text-gray-900">Upload photos</h2>
        <p className="text-gray-500 mt-1">
          Add photos for each item. We'll use AI to identify and list each one.
        </p>
      </div>

      {/* Listing cards */}
      {listings.map((listing, idx) => (
        <ListingCard
          key={listing.id}
          listingId={listing.id}
          listingNumber={idx + 1}
          collapsed={expandedIndex !== idx}
          onToggle={() => handleToggle(idx)}
          isFirst={idx === 0}
        />
      ))}

      {/* Add listing button */}
      {listings.length < MAX_LISTINGS && (
        <button
          onClick={handleAddListing}
          disabled={addingListing}
          className={clsx(
            'w-full flex items-center justify-center gap-2 py-3 rounded-xl border-2 border-dashed text-sm font-semibold transition-colors',
            addingListing
              ? 'border-blue-200 text-blue-400 cursor-not-allowed bg-blue-50'
              : 'border-gray-300 text-gray-500 hover:border-blue-400 hover:text-blue-600 hover:bg-blue-50 cursor-pointer',
          )}
        >
          {addingListing ? (
            <>
              <svg className="w-4 h-4 animate-spin" fill="none" viewBox="0 0 24 24">
                <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
              </svg>
              Creating listing...
            </>
          ) : (
            <>
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M12 4v16m8-8H4" />
              </svg>
              Add Listing {listings.length < MAX_LISTINGS ? `(${listings.length}/${MAX_LISTINGS})` : ''}
            </>
          )}
        </button>
      )}

      {listings.length >= MAX_LISTINGS && (
        <p className="text-xs text-center text-gray-400">
          Maximum of {MAX_LISTINGS} listings per session reached
        </p>
      )}

      {addError && (
        <div className="bg-red-50 border border-red-200 rounded-lg p-3 text-sm text-red-700">
          {addError}
        </div>
      )}
    </div>
  );
}
