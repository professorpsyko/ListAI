import { useNavigate } from 'react-router-dom';
import { createListing } from '../lib/api';
import { useListingStore } from '../store/listingStore';

export default function DashboardPage() {
  const navigate = useNavigate();
  const reset = useListingStore((s) => s.reset);
  const setListingId = useListingStore((s) => s.setListingId);

  async function handleNewListing() {
    reset();
    const listing = await createListing();
    setListingId(listing.id);
    navigate(`/listing/${listing.id}/step/1`);
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
          className="inline-flex items-center gap-2 bg-blue-600 hover:bg-blue-700 text-white font-semibold px-8 py-3 rounded-lg text-lg transition-colors"
        >
          <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
          </svg>
          Create new listing
        </button>
      </div>
    </div>
  );
}
