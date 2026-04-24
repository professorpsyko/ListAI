import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { createListing } from '../lib/api';
import { useListingStore } from '../store/listingStore';
import clsx from 'clsx';

export default function DashboardPage() {
  const navigate = useNavigate();
  const reset = useListingStore((s) => s.reset);
  const setListingId = useListingStore((s) => s.setListingId);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleNewListing() {
    setLoading(true);
    setError(null);
    try {
      reset();
      const listing = await createListing();
      setListingId(listing.id);
      navigate(`/listing/${listing.id}/step/1`);
    } catch (err: unknown) {
      const msg =
        (err as { response?: { data?: { error?: string } } })?.response?.data?.error ||
        (err instanceof Error ? err.message : 'Something went wrong. Please try again.');
      setError(msg);
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="p-8">
      <div className="max-w-3xl mx-auto py-20 text-center">
        <h1 className="text-4xl font-bold text-gray-900 mb-3">eBay listings in minutes</h1>
        <p className="text-lg text-gray-500 mb-10">
          Upload photos, let AI do the work, publish to eBay.
        </p>
        <button
          onClick={handleNewListing}
          disabled={loading}
          className={clsx(
            'inline-flex items-center gap-2 font-semibold px-8 py-3 rounded-lg text-lg transition-colors text-white',
            loading
              ? 'bg-blue-400 cursor-not-allowed'
              : 'bg-blue-600 hover:bg-blue-700',
          )}
        >
          {loading ? (
            <span className="w-5 h-5 border-2 border-white border-t-transparent rounded-full animate-spin" />
          ) : (
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
            </svg>
          )}
          {loading ? 'Creating…' : 'Create new listing'}
        </button>

        {error && (
          <div className="mt-4 inline-flex items-center gap-2 bg-red-50 border border-red-200 text-red-700 rounded-lg px-4 py-2 text-sm">
            <svg className="w-4 h-4 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01M10.29 3.86L1.82 18a2 2 0 001.71 3h16.94a2 2 0 001.71-3L13.71 3.86a2 2 0 00-3.42 0z" />
            </svg>
            {error}
          </div>
        )}
      </div>
    </div>
  );
}
