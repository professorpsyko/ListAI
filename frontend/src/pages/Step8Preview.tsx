import { useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { useListingStore } from '../store/listingStore';
import { publishListing, updateListing } from '../lib/api';
import clsx from 'clsx';

// ─── Listing score calculation ─────────────────────────────────────────────────
function calcScore(store: ReturnType<typeof useListingStore.getState>) {
  let score = 0;
  const tips: string[] = [];

  // Photos (25pts)
  const photoCount = store.processedPhotoUrls.length || store.itemPhotoUrls.length;
  if (photoCount >= 10) score += 25;
  else if (photoCount >= 5) score += 20;
  else if (photoCount >= 2) score += 10;
  else tips.push('Add at least 2 photos');

  // Title (20pts)
  const titleLen = store.itemTitle.length;
  if (titleLen >= 75) score += 20;
  else if (titleLen >= 65) score += 15;
  else if (titleLen >= 50) score += 10;
  else tips.push('Lengthen your title (aim for 65+ characters)');

  // Description (20pts)
  const wordCount = store.itemDescription.split(/\s+/).filter(Boolean).length;
  if (wordCount >= 300) score += 20;
  else if (wordCount >= 200) score += 15;
  else if (wordCount >= 100) score += 10;
  else tips.push('Expand your description (aim for 200+ words)');

  // Price (20pts)
  const suggested = store.pricingResearch?.suggestedPrice;
  const final = parseFloat(store.finalPrice);
  if (suggested && !isNaN(final)) {
    const diff = Math.abs(final - suggested) / suggested;
    if (diff <= 0.10) score += 20;
    else if (diff <= 0.20) score += 10;
    else tips.push('Price is far from market value');
  } else {
    score += 10; // partial credit if no pricing data
  }

  // Shipping (15pts)
  const isFree = store.shippingCost === '0' || store.shippingService.includes('Free');
  if (isFree) score += 15;
  else if (store.shippingService) score += 10;
  else tips.push('Add shipping details');

  return { score: Math.min(score, 100), tips: tips.slice(0, 2) };
}

function ScoreGauge({ score }: { score: number }) {
  const color = score >= 75 ? '#16a34a' : score >= 50 ? '#d97706' : '#dc2626';
  const r = 36;
  const circ = 2 * Math.PI * r;
  const offset = circ * (1 - score / 100);

  return (
    <div className="relative w-24 h-24">
      <svg className="w-full h-full -rotate-90" viewBox="0 0 100 100">
        <circle cx="50" cy="50" r={r} fill="none" stroke="#e5e7eb" strokeWidth="10" />
        <circle cx="50" cy="50" r={r} fill="none" stroke={color} strokeWidth="10"
          strokeDasharray={circ} strokeDashoffset={offset} strokeLinecap="round"
          style={{ transition: 'stroke-dashoffset 0.5s ease' }} />
      </svg>
      <div className="absolute inset-0 flex flex-col items-center justify-center">
        <span className="text-2xl font-bold" style={{ color }}>{score}</span>
        <span className="text-xs text-gray-400">/100</span>
      </div>
    </div>
  );
}

function InlineEditField({
  label, value, onChange, multiline = false,
}: { label: string; value: string; onChange: (v: string) => void; multiline?: boolean }) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(value);

  function save() {
    onChange(draft);
    setEditing(false);
  }

  if (editing) {
    return (
      <div className="space-y-2">
        <label className="text-xs font-medium text-gray-500 uppercase tracking-wide">{label}</label>
        {multiline ? (
          <textarea
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            rows={6}
            className="w-full border border-blue-400 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-blue-500 resize-none"
            autoFocus
          />
        ) : (
          <input
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            className="w-full border border-blue-400 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-blue-500"
            autoFocus
          />
        )}
        <div className="flex gap-2">
          <button onClick={save} className="px-3 py-1 bg-blue-600 text-white text-sm rounded font-medium">Save</button>
          <button onClick={() => setEditing(false)} className="px-3 py-1 border border-gray-300 text-sm rounded text-gray-600">Cancel</button>
        </div>
      </div>
    );
  }

  return (
    <div className="group">
      <div className="flex items-center justify-between mb-1">
        <label className="text-xs font-medium text-gray-500 uppercase tracking-wide">{label}</label>
        <button onClick={() => { setDraft(value); setEditing(true); }}
          className="text-xs text-blue-600 hover:underline opacity-0 group-hover:opacity-100 transition-opacity">
          Edit
        </button>
      </div>
      <p className="text-sm text-gray-800 whitespace-pre-wrap">{value || <span className="text-gray-400 italic">Not set</span>}</p>
    </div>
  );
}

export default function Step8Preview() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const store = useListingStore();

  const [showConfirm, setShowConfirm] = useState(false);
  const [publishing, setPublishing] = useState(false);
  const [publishResult, setPublishResult] = useState<{ listingUrl: string } | null>(null);
  const [publishError, setPublishError] = useState<string | null>(null);

  const { score, tips } = calcScore(store);

  const photos = store.processedPhotoUrls.length ? store.processedPhotoUrls : store.itemPhotoUrls;
  const [showOriginal, setShowOriginal] = useState(false);
  const displayPhotos = showOriginal ? store.itemPhotoUrls : photos;

  async function handlePublish() {
    if (!id) return;
    setPublishing(true);
    setPublishError(null);
    try {
      // Save final state before publish
      await updateListing(id, {
        itemTitle: store.itemTitle,
        itemDescription: store.itemDescription,
        finalPrice: parseFloat(store.finalPrice),
        listingType: store.listingType,
        auctionDuration: store.auctionDuration,
        startingBid: store.startingBid ? parseFloat(store.startingBid) : undefined,
      });
      const result = await publishListing(id);
      setPublishResult(result);
      setShowConfirm(false);
    } catch (err) {
      setPublishError((err as Error).message);
    } finally {
      setPublishing(false);
    }
  }

  if (publishResult) {
    return (
      <div className="flex flex-col items-center justify-center py-16 text-center space-y-6">
        <div className="w-16 h-16 bg-green-100 rounded-full flex items-center justify-center">
          <svg className="w-8 h-8 text-green-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
          </svg>
        </div>
        <h2 className="text-2xl font-bold text-gray-900">Your listing is live!</h2>
        <a href={publishResult.listingUrl} target="_blank" rel="noopener noreferrer"
          className="text-blue-600 hover:underline text-lg font-medium">
          View on eBay →
        </a>
        <button
          onClick={() => { store.reset(); navigate('/dashboard'); }}
          className="px-6 py-2.5 bg-blue-600 hover:bg-blue-700 text-white font-semibold rounded-lg transition-colors"
        >
          Create another listing
        </button>
      </div>
    );
  }

  return (
    <div className="space-y-8">
      <div className="flex items-start justify-between">
        <div>
          <h2 className="text-2xl font-bold text-gray-900">Preview & publish</h2>
          <p className="text-gray-500 mt-1">Review your listing before it goes live.</p>
        </div>

        {/* Score widget */}
        <div className="flex flex-col items-center gap-2 bg-white border border-gray-200 rounded-xl p-4 shadow-sm min-w-[140px]">
          <ScoreGauge score={score} />
          <p className="text-xs font-medium text-gray-600 text-center">Listing quality</p>
          {tips.length > 0 && (
            <ul className="text-xs text-gray-400 space-y-1 w-full">
              {tips.map((t, i) => <li key={i} className="text-center leading-tight">{t}</li>)}
            </ul>
          )}
        </div>
      </div>

      {/* Photos strip */}
      <div>
        <div className="flex items-center justify-between mb-2">
          <h3 className="font-semibold text-gray-700">Photos ({displayPhotos.length})</h3>
          {store.processedPhotoUrls.length > 0 && (
            <div className="flex items-center gap-2 text-sm">
              <button onClick={() => setShowOriginal(false)}
                className={clsx('px-2 py-1 rounded', !showOriginal ? 'bg-blue-100 text-blue-700 font-medium' : 'text-gray-500 hover:text-gray-700')}>
                Processed
              </button>
              <button onClick={() => setShowOriginal(true)}
                className={clsx('px-2 py-1 rounded', showOriginal ? 'bg-blue-100 text-blue-700 font-medium' : 'text-gray-500 hover:text-gray-700')}>
                Original
              </button>
            </div>
          )}
        </div>
        <div className="flex gap-3 overflow-x-auto pb-2 scrollbar-hide">
          {displayPhotos.map((url, i) => (
            <img key={i} src={url} alt={`Photo ${i + 1}`}
              className="h-28 w-28 flex-shrink-0 rounded-lg object-cover border border-gray-200" />
          ))}
        </div>
      </div>

      {/* Listing details */}
      <div className="bg-white border border-gray-200 rounded-xl p-6 shadow-sm space-y-6">
        <InlineEditField label="Title" value={store.itemTitle} onChange={store.setItemTitle} />
        <hr className="border-gray-100" />
        <InlineEditField label="Description" value={store.itemDescription} onChange={store.setItemDescription} multiline />
        <hr className="border-gray-100" />

        <div className="grid grid-cols-2 gap-6">
          <div>
            <p className="text-xs font-medium text-gray-500 uppercase tracking-wide mb-1">Condition</p>
            <p className="text-sm text-gray-800">{store.condition || '—'}</p>
          </div>
          <div>
            <p className="text-xs font-medium text-gray-500 uppercase tracking-wide mb-1">Color</p>
            <p className="text-sm text-gray-800">{store.color || '—'}</p>
          </div>
        </div>
        <hr className="border-gray-100" />

        {/* Price + listing type */}
        <div className="space-y-4">
          <div>
            <p className="text-xs font-medium text-gray-500 uppercase tracking-wide mb-2">Listing type</p>
            <div className="flex gap-3">
              {['BUY_IT_NOW', 'AUCTION'].map((t) => (
                <button
                  key={t}
                  onClick={() => store.setListingType(t as 'BUY_IT_NOW' | 'AUCTION')}
                  className={clsx(
                    'px-4 py-2 rounded-lg text-sm font-medium border transition-colors',
                    store.listingType === t ? 'bg-blue-600 text-white border-blue-600' : 'border-gray-300 text-gray-600 hover:border-blue-400',
                  )}
                >
                  {t === 'BUY_IT_NOW' ? 'Buy it now' : 'Auction'}
                </button>
              ))}
            </div>
          </div>

          {store.listingType === 'BUY_IT_NOW' ? (
            <div>
              <p className="text-xs font-medium text-gray-500 uppercase tracking-wide mb-1">Price</p>
              <div className="relative w-40">
                <span className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-500">$</span>
                <input type="number" value={store.finalPrice} onChange={(e) => store.setFinalPrice(e.target.value)}
                  className="w-full border border-gray-300 rounded-lg pl-7 pr-3 py-2 text-sm focus:ring-2 focus:ring-blue-500" />
              </div>
            </div>
          ) : (
            <div className="grid grid-cols-2 gap-4">
              <div>
                <p className="text-xs font-medium text-gray-500 uppercase tracking-wide mb-1">Starting bid</p>
                <div className="relative">
                  <span className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-500">$</span>
                  <input type="number" value={store.startingBid} onChange={(e) => store.setStartingBid(e.target.value)}
                    className="w-full border border-gray-300 rounded-lg pl-7 pr-3 py-2 text-sm focus:ring-2 focus:ring-blue-500" />
                </div>
              </div>
              <div>
                <p className="text-xs font-medium text-gray-500 uppercase tracking-wide mb-1">Duration</p>
                <select value={store.auctionDuration} onChange={(e) => store.setAuctionDuration(Number(e.target.value))}
                  className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-blue-500 bg-white">
                  {[1, 3, 5, 7, 10].map((d) => <option key={d} value={d}>{d} days</option>)}
                </select>
              </div>
            </div>
          )}
        </div>
        <hr className="border-gray-100" />

        {/* Shipping */}
        <div>
          <p className="text-xs font-medium text-gray-500 uppercase tracking-wide mb-2">Shipping</p>
          <div className="flex gap-6 text-sm text-gray-800">
            <span>{store.shippingService || '—'}</span>
            <span>{store.shippingCost === '0' ? 'Free' : store.shippingCost ? `$${store.shippingCost}` : '—'}</span>
            <span>{store.handlingTime || '—'}</span>
          </div>
        </div>
      </div>

      {publishError && (
        <div className="bg-red-50 border border-red-200 rounded-lg p-4 text-sm text-red-700">
          {publishError}
        </div>
      )}

      <div className="flex justify-between items-center pt-2">
        <button onClick={() => navigate(`/listing/${id}/step/7`)}
          className="px-6 py-2.5 border border-gray-300 rounded-lg text-gray-700 hover:bg-gray-50 font-medium">
          ← Back
        </button>
        <button
          onClick={() => setShowConfirm(true)}
          className="px-10 py-3 bg-green-600 hover:bg-green-700 text-white font-bold rounded-xl text-base transition-colors shadow-sm"
        >
          Publish to eBay
        </button>
      </div>

      {/* Confirm modal */}
      {showConfirm && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
          <div className="bg-white rounded-2xl p-8 max-w-md w-full mx-4 space-y-4">
            <h3 className="text-xl font-bold text-gray-900">Publish listing?</h3>
            <p className="text-gray-600">You're about to publish this listing live on eBay. Ready?</p>
            <div className="flex gap-3 pt-2">
              <button
                onClick={handlePublish}
                disabled={publishing}
                className="flex-1 py-2.5 bg-green-600 hover:bg-green-700 text-white font-semibold rounded-lg transition-colors disabled:opacity-60"
              >
                {publishing ? 'Publishing…' : 'Yes, publish'}
              </button>
              <button
                onClick={() => setShowConfirm(false)}
                disabled={publishing}
                className="flex-1 py-2.5 border border-gray-300 text-gray-700 rounded-lg hover:bg-gray-50"
              >
                Cancel
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
