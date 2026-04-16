import { useState, useRef } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { useListingStore } from '../store/listingStore';
import { uploadPhotos } from '../lib/api';
import clsx from 'clsx';

export default function Step1Photos() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const store = useListingStore();

  const [uploadError, setUploadError] = useState<string | null>(null);
  const [labelUploading, setLabelUploading] = useState(false);
  const [itemsUploading, setItemsUploading] = useState(false);

  const labelInputRef = useRef<HTMLInputElement>(null);
  const itemsInputRef = useRef<HTMLInputElement>(null);

  const canProceed = !!store.labelPhotoUrl && store.itemPhotoUrls.length >= 2;

  async function handleLabelFiles(files: FileList | null) {
    if (!files || !files[0] || !id) return;
    setUploadError(null);
    setLabelUploading(true);
    try {
      const result = await uploadPhotos(id, [files[0]]);
      store.setLabelPhoto(result.urls[0]);
      store.setImageJobStatus('QUEUED');
    } catch (err) {
      setUploadError(`Upload failed: ${(err as Error).message}`);
    } finally {
      setLabelUploading(false);
    }
  }

  async function handleItemFiles(files: FileList | null) {
    if (!files || !files.length || !id) return;
    setUploadError(null);
    setItemsUploading(true);
    try {
      const remaining = 15 - store.itemPhotoUrls.length;
      const fileArray = Array.from(files).slice(0, remaining);
      const result = await uploadPhotos(id, fileArray);
      store.setItemPhotos([...store.itemPhotoUrls, ...result.urls]);
      store.setImageJobStatus('QUEUED');
    } catch (err) {
      setUploadError(`Upload failed: ${(err as Error).message}`);
    } finally {
      setItemsUploading(false);
    }
  }

  // Drag and drop handlers
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
    store.setItemPhotos(store.itemPhotoUrls.filter((_, i) => i !== idx));
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

          {/* Hidden native file input */}
          <input
            ref={labelInputRef}
            type="file"
            accept="image/*"
            className="hidden"
            onChange={(e) => handleLabelFiles(e.target.files)}
          />

          {store.labelPhotoUrl ? (
            <div className="relative group rounded-xl overflow-hidden border border-gray-200 bg-gray-50 aspect-square">
              <img src={store.labelPhotoUrl} alt="Label" className="w-full h-full object-cover" />
              <button
                onClick={() => store.setLabelPhoto('')}
                className="absolute top-2 right-2 bg-white rounded-full p-1 shadow opacity-0 group-hover:opacity-100 transition-opacity"
              >
                <svg className="w-4 h-4 text-gray-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </div>
          ) : (
            <div
              onClick={() => labelInputRef.current?.click()}
              onDrop={(e) => handleDrop(e, 'label')}
              onDragOver={handleDragOver}
              className={clsx(
                'border-2 border-dashed rounded-xl aspect-square flex flex-col items-center justify-center cursor-pointer transition-colors',
                labelUploading ? 'border-blue-400 bg-blue-50' : 'border-gray-300 hover:border-blue-400 bg-gray-50',
              )}
            >
              {labelUploading ? (
                <>
                  <div className="w-8 h-8 border-3 border-blue-500 border-t-transparent rounded-full animate-spin mb-3" />
                  <p className="text-sm text-blue-600 font-medium">Uploading…</p>
                </>
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

          {/* Hidden native file input */}
          <input
            ref={itemsInputRef}
            type="file"
            accept="image/*"
            multiple
            className="hidden"
            onChange={(e) => handleItemFiles(e.target.files)}
          />

          {store.itemPhotoUrls.length > 0 && (
            <div className="grid grid-cols-3 gap-2 mb-3">
              {store.itemPhotoUrls.map((url, idx) => (
                <div key={idx} className="relative group aspect-square rounded-lg overflow-hidden border border-gray-200">
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

          {store.itemPhotoUrls.length === 0 && (
            <div
              onClick={() => itemsInputRef.current?.click()}
              onDrop={(e) => handleDrop(e, 'items')}
              onDragOver={handleDragOver}
              className={clsx(
                'border-2 border-dashed rounded-xl aspect-square flex flex-col items-center justify-center cursor-pointer transition-colors',
                itemsUploading ? 'border-blue-400 bg-blue-50' : 'border-gray-300 hover:border-blue-400 bg-gray-50',
              )}
            >
              {itemsUploading ? (
                <>
                  <div className="w-8 h-8 border-blue-500 border-t-transparent rounded-full animate-spin mb-3" />
                  <p className="text-sm text-blue-600 font-medium">Uploading…</p>
                </>
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

          {store.itemPhotoUrls.length > 0 && store.itemPhotoUrls.length < 2 && (
            <p className="text-sm text-amber-600">Add at least one more photo</p>
          )}
        </div>
      </div>

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
