import { useEffect, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { useListingStore } from '../store/listingStore';
import { generateTitle, updateListing } from '../lib/api';
import { useStepAction } from '../hooks/useStepAction';
import clsx from 'clsx';

export default function Step5Title() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const store = useListingStore();

  const [loading, setLoading] = useState(false);
  const [genError, setGenError] = useState<string | null>(null);
  const [showReasoning, setShowReasoning] = useState(false);

  const charCount = store.itemTitle.length;
  const overLimit = charCount > 80;
  const nearLimit = charCount >= 75;

  useStepAction('Next: Description \u2192', !store.itemTitle || overLimit, handleNext);

  useEffect(() => {
    // Auto-generate on mount if no title yet
    if (!store.itemTitle && !loading) {
      handleGenerate();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function handleGenerate() {
    if (!id) return;
    setLoading(true);
    setGenError(null);
    try {
      const { title } = await generateTitle(id);
      store.setTitleSuggestion(title);
      // Only pre-fill if user hasn't written their own
      if (!store.itemTitle) {
        store.setItemTitle(title);
      }
    } catch (err: unknown) {
      const msg = (err as { response?: { data?: { detail?: string } }; message?: string })
        ?.response?.data?.detail || (err as Error)?.message || 'Generation failed';
      setGenError(msg);
      console.error('[Step5Title] generateTitle error:', err);
    } finally {
      setLoading(false);
    }
  }

  async function handleNext() {
    if (!id || !store.itemTitle || overLimit) return;
    await updateListing(id, { itemTitle: store.itemTitle });
    store.setCurrentStep(7);
    navigate(`/listing/${id}/step/7`);
  }

  return (
    <div className="space-y-8 max-w-2xl">
      <div>
        <h2 className="text-2xl font-bold text-gray-900">Listing title</h2>
        <p className="text-gray-500 mt-1">eBay titles must be 80 characters or fewer. Your past style has been applied.</p>
      </div>

      <div className="space-y-3">
        <div className="relative">
          <input
            type="text"
            value={store.itemTitle}
            onChange={(e) => store.setItemTitle(e.target.value.slice(0, 80))}
            placeholder="AI is generating a title…"
            className={clsx(
              'w-full border rounded-xl px-4 py-3 text-base focus:ring-2 focus:ring-blue-500 focus:border-transparent pr-20',
              overLimit ? 'border-red-400' : 'border-gray-300',
            )}
          />
          <span className={clsx(
            'absolute right-4 top-1/2 -translate-y-1/2 text-sm font-medium tabular-nums',
            nearLimit ? 'text-red-500' : 'text-gray-400',
          )}>
            {charCount}/80
          </span>
        </div>

        {genError && (
          <p className="text-xs text-red-500 bg-red-50 border border-red-200 rounded-lg px-3 py-2">
            Could not generate title: {genError}. You can type your own below.
          </p>
        )}

        <div className="flex items-center gap-3">
          <button
            onClick={handleGenerate}
            disabled={loading}
            className="inline-flex items-center gap-1.5 text-sm text-blue-600 hover:underline disabled:text-gray-400"
          >
            {loading ? (
              <span className="inline-block w-3.5 h-3.5 border-2 border-blue-400 border-t-transparent rounded-full animate-spin" />
            ) : (
              <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
              </svg>
            )}
            Regenerate suggestion
          </button>

          {store.titleSuggestion && store.titleSuggestion !== store.itemTitle && (
            <button
              onClick={() => store.setItemTitle(store.titleSuggestion)}
              className="text-sm text-gray-500 hover:text-gray-700"
            >
              Restore suggestion
            </button>
          )}
        </div>

        <button
          onClick={() => setShowReasoning((v) => !v)}
          className="text-sm text-gray-400 hover:text-gray-600 flex items-center gap-1"
        >
          <svg className={clsx('w-3.5 h-3.5 transition-transform', showReasoning && 'rotate-90')} fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
          </svg>
          Why this title?
        </button>

        {showReasoning && (
          <div className="bg-blue-50 border border-blue-100 rounded-lg p-4 text-sm text-blue-800">
            <p className="font-medium mb-1">How this title was generated</p>
            <p className="text-blue-700">AI used your item identification, condition, color, and special notes — combined with your past listing style — to write a keyword-rich title optimized for eBay search.</p>
          </div>
        )}
      </div>

    </div>
  );
}
