import { useCallback, useState } from 'react';
import Cropper from 'react-easy-crop';
import type { Area } from 'react-easy-crop';
import clsx from 'clsx';
import { editPhoto } from '../lib/api';

interface Props {
  photoUrl: string;
  listingId: string;
  onSave: (newUrl: string) => void;
  onClose: () => void;
}

type Tab = 'adjust' | 'crop';

const AUTO_ENHANCE = { brightness: 8, contrast: 12, saturation: 18 };

// ─── Canvas helpers ───────────────────────────────────────────────────────────

async function loadImage(src: string): Promise<HTMLImageElement> {
  return new Promise((res, rej) => {
    const img = new Image();
    img.crossOrigin = 'anonymous';
    img.onload = () => res(img);
    img.onerror = rej;
    // Append a cache-buster only for Cloudinary URLs so CORS headers are fresh
    img.src = src.includes('cloudinary.com') ? `${src}?cb=${Date.now()}` : src;
  });
}

async function renderToBlob(
  img: HTMLImageElement,
  brightness: number,
  contrast: number,
  saturation: number,
  cropPx?: Area,
): Promise<Blob> {
  const sx = cropPx?.x ?? 0;
  const sy = cropPx?.y ?? 0;
  const sw = cropPx?.width ?? img.naturalWidth;
  const sh = cropPx?.height ?? img.naturalHeight;

  const canvas = document.createElement('canvas');
  canvas.width = sw;
  canvas.height = sh;
  const ctx = canvas.getContext('2d')!;

  // Map slider −100→+100 to CSS filter multipliers
  const b = 1 + brightness / 100;
  const c = 1 + contrast / 100;
  const s = 1 + saturation / 100;
  ctx.filter = `brightness(${b}) contrast(${c}) saturate(${s})`;
  ctx.drawImage(img, sx, sy, sw, sh, 0, 0, sw, sh);

  return new Promise<Blob>((res, rej) =>
    canvas.toBlob((blob) => (blob ? res(blob) : rej(new Error('canvas toBlob failed'))), 'image/jpeg', 0.93),
  );
}

async function blobToDataUrl(blob: Blob): Promise<string> {
  return new Promise((res) => {
    const reader = new FileReader();
    reader.onload = () => res(reader.result as string);
    reader.readAsDataURL(blob);
  });
}

// ─── Slider ───────────────────────────────────────────────────────────────────

function Slider({
  label, value, min = -100, max = 100, onChange,
}: {
  label: string; value: number; min?: number; max?: number; onChange: (v: number) => void;
}) {
  return (
    <div className="space-y-1">
      <div className="flex justify-between text-sm">
        <span className="font-medium text-gray-700">{label}</span>
        <span className={clsx('font-mono text-xs', value !== 0 ? 'text-blue-600' : 'text-gray-400')}>
          {value > 0 ? `+${value}` : value}
        </span>
      </div>
      <input
        type="range"
        min={min}
        max={max}
        value={value}
        onChange={(e) => onChange(Number(e.target.value))}
        className="w-full h-1.5 bg-gray-200 rounded-full appearance-none accent-blue-600 cursor-pointer"
      />
      <div className="flex justify-between text-[10px] text-gray-300">
        <span>{min}</span>
        <span>0</span>
        <span>+{max}</span>
      </div>
    </div>
  );
}

// ─── Main component ───────────────────────────────────────────────────────────

export default function PhotoEditModal({ photoUrl, listingId, onSave, onClose }: Props) {
  const [tab, setTab] = useState<Tab>('adjust');
  const [brightness, setBrightness] = useState(0);
  const [contrast, setContrast] = useState(0);
  const [saturation, setSaturation] = useState(0);

  // Crop state
  const [crop, setCrop] = useState({ x: 0, y: 0 });
  const [zoom, setZoom] = useState(1);
  const [croppedAreaPx, setCroppedAreaPx] = useState<Area | null>(null);

  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const hasAdjustments = brightness !== 0 || contrast !== 0 || saturation !== 0;
  const hasCrop = croppedAreaPx != null;

  // CSS filter string for live preview
  const previewFilter = `brightness(${1 + brightness / 100}) contrast(${1 + contrast / 100}) saturate(${1 + saturation / 100})`;

  const onCropComplete = useCallback((_: Area, px: Area) => setCroppedAreaPx(px), []);

  function applyAutoEnhance() {
    setBrightness(AUTO_ENHANCE.brightness);
    setContrast(AUTO_ENHANCE.contrast);
    setSaturation(AUTO_ENHANCE.saturation);
  }

  function reset() {
    setBrightness(0);
    setContrast(0);
    setSaturation(0);
    setCrop({ x: 0, y: 0 });
    setZoom(1);
    setCroppedAreaPx(null);
  }

  async function handleSave() {
    setSaving(true);
    setError(null);
    try {
      const img = await loadImage(photoUrl);
      // Only pass cropPx if the user is on the crop tab and has a crop
      const cropArea = tab === 'crop' && hasCrop ? croppedAreaPx! : undefined;
      const blob = await renderToBlob(img, brightness, contrast, saturation, cropArea);
      const dataUrl = await blobToDataUrl(blob);
      const { url } = await editPhoto(listingId, dataUrl);
      onSave(url);
    } catch (err) {
      setError('Save failed — please try again.');
      console.error('[PhotoEditModal]', err);
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-3xl overflow-hidden flex flex-col max-h-[90vh]">

        {/* Header */}
        <div className="flex items-center justify-between px-5 py-4 border-b border-gray-100">
          <h2 className="font-semibold text-gray-900 text-lg">Edit photo</h2>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600 transition-colors">
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        {/* Body */}
        <div className="flex flex-1 min-h-0 overflow-hidden">

          {/* Photo preview / crop area */}
          <div className="flex-1 bg-gray-900 relative">
            {tab === 'adjust' ? (
              <img
                src={photoUrl}
                alt="Edit preview"
                className="w-full h-full object-contain"
                style={{ filter: previewFilter }}
              />
            ) : (
              <Cropper
                image={photoUrl}
                crop={crop}
                zoom={zoom}
                aspect={undefined}
                onCropChange={setCrop}
                onZoomChange={setZoom}
                onCropComplete={onCropComplete}
                style={{
                  containerStyle: { background: '#111' },
                  mediaStyle: {},
                  cropAreaStyle: {},
                }}
              />
            )}
          </div>

          {/* Controls panel */}
          <div className="w-64 flex flex-col border-l border-gray-100 bg-white">
            {/* Tabs */}
            <div className="flex border-b border-gray-100">
              {(['adjust', 'crop'] as Tab[]).map((t) => (
                <button
                  key={t}
                  onClick={() => setTab(t)}
                  className={clsx(
                    'flex-1 py-3 text-sm font-medium capitalize transition-colors',
                    tab === t
                      ? 'text-blue-600 border-b-2 border-blue-600'
                      : 'text-gray-500 hover:text-gray-700',
                  )}
                >
                  {t === 'adjust' ? '✦ Adjust' : '⊠ Crop'}
                </button>
              ))}
            </div>

            {/* Tab content */}
            <div className="flex-1 overflow-y-auto p-4 space-y-5">
              {tab === 'adjust' ? (
                <>
                  {/* Auto-enhance */}
                  <button
                    onClick={applyAutoEnhance}
                    className="w-full flex items-center justify-center gap-2 py-2 px-3 rounded-lg border border-blue-200 bg-blue-50 text-blue-700 text-sm font-medium hover:bg-blue-100 transition-colors"
                  >
                    <span>✨</span>
                    Auto enhance
                  </button>

                  <div className="w-full h-px bg-gray-100" />

                  <Slider label="Brightness" value={brightness} onChange={setBrightness} />
                  <Slider label="Contrast"   value={contrast}   onChange={setContrast}   />
                  <Slider label="Saturation" value={saturation} onChange={setSaturation} />
                </>
              ) : (
                <div className="space-y-3">
                  <p className="text-xs text-gray-500">Drag to reposition · pinch or scroll to zoom</p>
                  <div className="space-y-1">
                    <div className="flex justify-between text-sm">
                      <span className="font-medium text-gray-700">Zoom</span>
                      <span className="font-mono text-xs text-gray-400">{zoom.toFixed(1)}×</span>
                    </div>
                    <input
                      type="range"
                      min={1}
                      max={3}
                      step={0.05}
                      value={zoom}
                      onChange={(e) => setZoom(Number(e.target.value))}
                      className="w-full h-1.5 bg-gray-200 rounded-full appearance-none accent-blue-600 cursor-pointer"
                    />
                  </div>
                </div>
              )}
            </div>

            {/* Footer actions */}
            <div className="p-4 border-t border-gray-100 space-y-2">
              {error && <p className="text-xs text-red-500">{error}</p>}
              <button
                onClick={handleSave}
                disabled={saving || (!hasAdjustments && tab === 'adjust') && !hasCrop}
                className="w-full py-2 rounded-lg bg-blue-600 text-white text-sm font-semibold hover:bg-blue-700 disabled:opacity-40 disabled:cursor-not-allowed transition-colors flex items-center justify-center gap-2"
              >
                {saving && (
                  <svg className="w-4 h-4 animate-spin" fill="none" viewBox="0 0 24 24">
                    <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                    <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
                  </svg>
                )}
                {saving ? 'Saving…' : 'Apply'}
              </button>
              <button
                onClick={reset}
                className="w-full py-1.5 rounded-lg text-gray-500 text-sm hover:bg-gray-50 transition-colors"
              >
                Reset
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
