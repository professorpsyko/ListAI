import { useEffect, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { useListingStore } from '../store/listingStore';
import { generateDescription, updateListing } from '../lib/api';
import clsx from 'clsx';

export default function Step6Description() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const store = useListingStore();

  const [loading, setLoading] = useState(false);
  const [suggestionPhase, setSuggestionPhase] = useState<'showing' | 'accepted' | 'rejected' | 'none'>(
    store.descriptionSuggestion ? 'showing' : 'none',
  );

  useEffect(() => {
    if (!store.descriptionSuggestion && !loading) {
      handleGenerate(true);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function handleGenerate(initial = false) {
    if (!id) return;
    setLoading(true);
    try {
      const { description } = await generateDescription(id);
      store.setDescriptionSuggestion(description);
      if (initial) setSuggestionPhase('showing');
    } catch {
      // ignore
    } finally {
      setLoading(false);
    }
  }

  function handleAccept() {
    store.setItemDescription(store.descriptionSuggestion);
    setSuggestionPhase('accepted');
  }

  function handleReject() {
    setSuggestionPhase('rejected');
  }

  async function handleNext() {
    if (!id || !store.itemDescription) return;
    await updateListing(id, { itemDescription: store.itemDescription });
    store.setCurrentStep(7);
    navigate(`/listing/${id}/step/7`);
  }

  return (
    <div className="space-y-8 max-w-2xl">
      <div>
        <h2 className="text-2xl font-bold text-gray-900">Listing description</h2>
        <p className="text-gray-500 mt-1">Your past writing style has been applied.</p>
      </div>

      {/* Suggestion card — shown initially */}
      {(suggestionPhase === 'showing' || loading) && (
        <div className="bg-white border border-gray-200 rounded-xl p-5 shadow-sm space-y-4">
          <div className="flex items-center justify-between">
            <h3 className="font-semibold text-gray-800">AI suggestion</h3>
            <button
              onClick={() => handleGenerate()}
              disabled={loading}
              className="inline-flex items-center gap-1 text-sm text-blue-600 hover:underline disabled:text-gray-400"
            >
              {loading ? (
                <span className="inline-block w-3 h-3 border-2 border-blue-400 border-t-transparent rounded-full animate-spin" />
              ) : (
                <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
                </svg>
              )}
              Regenerate
            </button>
          </div>

          {loading ? (
            <div className="space-y-2 animate-pulse">
              {[...Array(5)].map((_, i) => (
                <div key={i} className={clsx('h-4 bg-gray-200 rounded', i === 4 && 'w-3/4')} />
              ))}
            </div>
          ) : (
            <p className="text-sm text-gray-700 whitespace-pre-wrap">{store.descriptionSuggestion}</p>
          )}

          {!loading && (
            <div className="flex gap-3 pt-2">
              <button onClick={handleAccept}
                className="flex-1 py-2.5 bg-blue-600 hover:bg-blue-700 text-white font-semibold rounded-lg transition-colors">
                Use this description
              </button>
              <button onClick={handleReject}
                className="flex-1 py-2.5 border border-gray-300 hover:bg-gray-50 text-gray-700 font-semibold rounded-lg transition-colors">
                Don't use it
              </button>
            </div>
          )}
        </div>
      )}

      {/* Editor — shown after accept or reject */}
      {(suggestionPhase === 'accepted' || suggestionPhase === 'rejected') && (
        <div className="space-y-2">
          <div className="flex items-center justify-between">
            <label className="text-sm font-medium text-gray-700">Your description</label>
            <button
              onClick={() => handleGenerate()}
              disabled={loading}
              className="inline-flex items-center gap-1 text-xs text-blue-600 hover:underline disabled:text-gray-400"
            >
              {loading ? (
                <span className="inline-block w-3 h-3 border-2 border-blue-400 border-t-transparent rounded-full animate-spin" />
              ) : (
                <>↻ Regenerate suggestion</>
              )}
            </button>
          </div>
          <textarea
            value={store.itemDescription}
            onChange={(e) => store.setItemDescription(e.target.value)}
            rows={12}
            placeholder="Write your listing description here…"
            className="w-full border border-gray-300 rounded-xl px-4 py-3 text-sm focus:ring-2 focus:ring-blue-500 focus:border-transparent resize-none"
          />
          {loading && store.descriptionSuggestion && (
            <button
              onClick={() => { store.setItemDescription(store.descriptionSuggestion); }}
              className="text-xs text-blue-600 hover:underline"
            >
              Apply new suggestion
            </button>
          )}
        </div>
      )}

      {/* Fallback: no suggestion yet and not loading */}
      {suggestionPhase === 'none' && !loading && (
        <div className="space-y-2">
          <textarea
            value={store.itemDescription}
            onChange={(e) => store.setItemDescription(e.target.value)}
            rows={12}
            placeholder="Write your listing description…"
            className="w-full border border-gray-300 rounded-xl px-4 py-3 text-sm focus:ring-2 focus:ring-blue-500 focus:border-transparent resize-none"
          />
        </div>
      )}

      <div className="flex justify-between pt-4">
        <button onClick={() => navigate(`/listing/${id}/step/5`)}
          className="px-6 py-2.5 border border-gray-300 rounded-lg text-gray-700 hover:bg-gray-50 font-medium">
          ← Back
        </button>
        <button
          onClick={handleNext}
          disabled={!store.itemDescription}
          className={clsx(
            'px-8 py-2.5 rounded-lg font-semibold text-white transition-colors',
            store.itemDescription ? 'bg-blue-600 hover:bg-blue-700' : 'bg-gray-300 cursor-not-allowed',
          )}
        >
          Next: Shipping →
        </button>
      </div>
    </div>
  );
}
