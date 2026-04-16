import { useState, useRef, useEffect } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { useListingStore } from '../store/listingStore';
import { uploadPhotos, updateListing } from '../lib/api';
import clsx from 'clsx';

const LABEL_STAGES = [
  { delay: 0,     pct: 8,  text: 'Sending photo to the cloud...' },
  { delay: 1500,  pct: 30, text: 'Uploading to image service...' },
  { delay: 3500,  pct: 55, text: 'Getting your label camera-ready...' },
  { delay: 6000,  pct: 75, "text": "Optimising for eBay image standards..." },
  { delay: 9000,  pct: 88, text: 'Almost listing-ready...' },
  { delay: 13000, pct: 95, text: 'Wrapping up — nearly there...' },
];

const ITEMS_STAGES = [
  { delay: 0,     pct: 5,  text: 'Sending shots to the cloud...' },
  { delay: 1500,  pct: 22, text: 'Uploading to image service...' },
  { delay: 3500,  pct: 42, text: 'Working some listing magic...' },
  { delay: 6000,  pct: 60, text: 'Polishing pixels for eBay buyers...' },
  { delay: 9000,  pct: 76, text: 'Optimising for crisp, click-worthy photos...' },
  { delay: 13000, pct: 88, text: 'Almost ready to dazzle shoppers...' },
  { delay: 18000, pct: 95, text: 'Final touches — hang tight...' },
];

const UPLOAD_TIMEOUT_MS = 45000;

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
          <div
            className="h-full bg-blue-500 rounded-full transition-all duration-700 ease-out"
            style={{ width: `${pct}%` }}
          />
        </div>
        <p className="text-xs text-blue-400 text-right">{pct}%</p>
      </div>
    </div>
  );
}

// Sync the full photo list to the backend so the DB stays accurate
function syncPhotosToBackend(id: string, labelUrl: string, itemUrls: string[]) {
  const allUrls = [labelUrl, ...itemUrls].filter(Boolean);
  updateListing(id, { imageUrls: allUrls }).catch(() => {
    // Non-critical — photos still visible in UI; will re-sync on next upload
  });
}

export default function Step1Photos() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const store = useListingStore();

  const [uploadError, setUploadError] = useState<string | null>(null);
  const [duplicateWarning, setDuplicateWarning] = useState<string | null>(null);
  const [labelUploading, setLabelUploading] = useState(false);
  const [itemsUploading, setItemsUploading] = useState(false);

  // Track the label photo's original filename so we can detect duplicates
  const [labelFileName, setLabelFileName] = useState<string | null>(null);

  const labelInputRef = useRef<HTMLInputElement>(null);
  const itemsInputRef = useRef<HTMLInputElement>(null);

  const labelStatus = useUploadStatus(labelUploading, LABEL_STAGES);
  const itemsStatus = useUploadStatus(itemsUploading, ITEMS_STAGES);

  const canProceed = !!store.labelPhotoUrl && store.itemPhotoUrls.length >= 2;

  async function handleLabelFiles(files: FileList | null) {
    if (!files || !files[0] || !id) return;
    setUploadError(null);
    setLabelUploading(true);
    setLabelFileName(files[0].name);

    const timeout = setTimeout(() => {
      setLabelUploading(false);
      setUploadError('Upload timed out — please check your connection and try again.');
    }, UPLOAD_TIMEOUT_MS);

    try {
      const result = await uploadPhotos(id, [files[0]]);
      clearTimeout(timeout);
      const newLabelUrl = result.urls[0];
      store.setLabelPhoto(newLabelUrl);
      store.setImageJobStatus('QUEUED');
      // Sync full list to backend
      syncPhotosToBackend(id, newLabelUrl, store.itemPhotoUrls);
    } catch (err) {
      clearTimeout(timeout);
      setUploadError(`Upload failed: ${(err as Error).message}`);
    } finally {
      setLabelUploading(false);
    }
  }

  async function handleItemFiles(files: FileList | null) {
    if (!files || !files.length || !id) return;
    setUploadError(null);
    setDuplicateWarning(null);

    // Deduplicate: remove any file whose name matches the label photo's file name
    const fileArray = Array.from(files);
    let filtered = fileArray;
    if (labelFileName) {
      const dupes = fileArray.filter((f) => f.name === labelFileName);
      if (dupes.length > 0) {
        filtered = fileArray.filter((f) => f.name !== labelFileName);
        setDuplicateWarning(
          `${dupes.length} photo${dupes.length > 1 ? 's' : ''} removed — that image is already your label photo in box 1.`,
        );
      }
    }

    // Enforce 15-photo cap
    const remaining = 15 - store.itemPhotoUrls.length;
    const toUpload = filtered.slice(0, remaining);

    if (!toUpload.length) return;

    setItemsUploading(true);

    const timeout = setTimeout(() => {
      setItemsUploading(false);
      setUploadError('Upload timed out — please check your connection and try again.');
    }, UPLOAD_TIMEOUT_MS);

    try {
      const result = await uploadPhotos(id, toUpload);
      clearTimeout(timeout);
      const updatedItems = [...store.itemPhotoUrls, ...result.urls];
      store.setItemPhotos(updatedItems);
      store.setImageJobStatus('QUEUED');
      // Sync full list to backend
      syncPhotosToBackend(id, store.labelPhotoUrl ?? '', updatedItems);
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
    const files = e.dataTransfer.files;
    if (type === 'label') handleLabelFiles(files);
    else handleItemFiles(files);
  }

  function handleDragOver(e: React.DragEvent) {
    e.preventDefault();
    e.stopPropagation();
  }

  function removeItemPhoto(idx: number) {
    const updated = store.itemPhotoUrls.filter((_, i) => i !== idx);
    store.setItemPhotos(updated);
    if (id) syncPhotosToBackend(id, store.labelPhotoUrl ?? '', updated);
  }

  function removeLabelPhoto() {
    store.setLabelPhoto('');
    setLabelFileName(null);
    if (id) syncPhotosToBackend(id, '', store.itemPhotoUrls);
  }

  function handleNext() {
    store.setCurrentStep(2);
    navigate(`/listing/${id}/step/2`);
  }

  return (
    <div className="space-y-8">
      <div>
        <h2 className="text-2xl font-bold text-gray-900">Upload photos</h2>
        <p className="text-gray-500 mt-1">We'll use AI to identify your item from the photos.</p>
      </div>

      <div className="grid grid-cols-2 gap-6">
        {/* Zone A — Label photo */}
        <div className="space-y-3">
          <div>
            <h3 className="font-semibold text-gray-800">Serial number or model label</h3>
            <p className="text-sm text-gray-500">Take a close-up of any tag, sticker, or label on the item</p>
          </div>

          <input
            ref={labelInputRef}
            type="file"
            accept="image/*"
            className="hidden"
            onChange={(e) => handleLabelFiles(e.target.files)}
          />

          {store.labelPhotoUrl && !labelUploading ? (
            <div className="relative group rounded-xl overflow-hidden border border-gray-200 bg-gray-50 aspect-square">
              <img src={store.labelPhotoUrl} alt="Label" className="w-full h-full object-cover" />
              <button
                onClick={removeLabelPhoto}
                className="absolute top-2 right-2 bg-white rounded-full p-1 shadow opacity-0 group-hover:opacity-100 transition-opacity"
              >
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
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M7 7h.01M7 3h5l2 2h4a2 2 0 012 2v10a2 2 0 01-2 2H5a2 2 0 01-2-2V5a2 2 0 012-2h2z" />
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
            <h3 className="font-semibold text-gray-800">Item photos</h3>
            <p className="text-sm text-gray-500">2–15 photos — front, back, sides, any damage</p>
          </div>

          <input
            ref={itemsInputRef}
            type="file"
            accept="image/*"
            multiple
            className="hidden"
            onChange={(e) => handleItemFiles(e.target.files)}
          />

          {store.itemPhotoUrls.length > 0 && !itemsUploading && (
            <div className="grid grid-cols-3 gap-2 mb-3">
              {store.itemPhotoUrls.map((url, idx) => (
                <div key={`${url}-${idx}`} className="relative group aspect-square rounded-lg overflow-hidden border border-gray-200">
                  <img src={url} alt={`Item ${idx + 1}`} className="w-full h-full object-cover" />
                  <button
                    onClick={() => removeItemPhoto(idx)}
                    className="absolute top-1 right-1 bg-white rounded-full p-0.5 shadow opacity-0 group-hover:opacity-100 transition-opacity"
                  >
                    <svg className="w-3.5 h-3.5 text-gray-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                    </svg>
                  </button>
                </div>
              ))}
              {store.itemPhotoUrls.length < 15 && (
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
          )}

          {(store.itemPhotoUrls.length === 0 || itemsUploading) && (
            <div
              onClick={() => !itemsUploading && itemsInputRef.current?.click()}
              onDrop={(e) => handleDrop(e, 'items')}
              onDragOver={handleDragOver}
              className={clsx(
                'border-2 border-dashed rounded-xl aspect-square flex flex-col items-center justify-center transition-colors',
                itemsUploading
                  ? 'border-blue-300 bg-blue-50 cursor-default'
                  : 'border-gray-300 hover:border-blue-400 bg-gray-50 cursor-pointer',
              )}
            >
              {itemsUploading ? (
                <UploadingOverlay text={itemsStatus.text} pct={itemsStatus.pct} />
              ) : (
                <>
                  <div className="p-3 bg-white rounded-full shadow-sm mb-3">
                    <svg className="w-8 h-8 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z" />
                    </svg>
                  </div>
                  <p className="text-sm font-medium text-gray-600">Drop item photos here</p>
                  <p className="text-xs text-gray-400 mt-1">or click to browse • 2–15 photos</p>
                </>
              )}
            </div>
          )}

          {store.itemPhotoUrls.length > 0 && store.itemPhotoUrls.length < 2 && !itemsUploading && (
            <p className="text-sm text-amber-600">Add at least one more photo</p>
          )}
        </div>
      </div>

      {/* Duplicate warning */}
      {duplicateWarning && (
        <div className="flex items-start gap-2.5 bg-amber-50 border border-amber-200 rounded-lg p-3">
          <svg className="w-4 h-4 text-amber-500 mt-0.5 shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01M10.29 3.86L1.82 18a2 2 0 001.71 3h16.94a2 2 0 001.71-3L13.71 3.86a2 2 0 00-3.42 0z" />
          </svg>
          <p className="text-sm text-amber-700">{duplicateWarning}</p>
        </div>
      )}

      {/* Upload error */}
      {uploadError && (
        <div className="bg-red-50 border border-red-200 rounded-lg p-3 text-sm text-red-700">
          {uploadError}
        </div>
      )}

      <div className="flex justify-end pt-4">
        <button
          onClick={handleNext}
          disabled={!canProceed}
          className={clsx(
            'px-8 py-2.5 rounded-lg font-semibold text-white transition-colors',
            canProceed ? 'bg-blue-600 hover:bg-blue-700' : 'bg-gray-300 cursor-not-allowed',
          )}
        >
          Next: Identify item →
        </button>
      </div>
    </div>
  );
}
