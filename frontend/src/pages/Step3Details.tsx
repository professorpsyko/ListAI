import { useNavigate, useParams } from 'react-router-dom';
import { useListingStore } from '../store/listingStore';
import { updateListing } from '../lib/api';
import { useStepAction } from '../hooks/useStepAction';
import clsx from 'clsx';

const CONDITIONS = [
  'New',
  'New other (see details)',
  'Manufacturer refurbished',
  'Seller refurbished',
  'Used — like new',
  'Used — good',
  'Used — acceptable',
  'For parts or not working',
];

const COLOR_CHIPS = [
  'Black', 'White', 'Silver', 'Gray', 'Red', 'Blue', 'Green',
  'Yellow', 'Gold', 'Brown', 'Pink', 'Purple', 'Orange', 'Multi',
];

export default function Step3Details() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const store = useListingStore();

  const canProceed = !!store.condition;
  useStepAction('Next: Pricing \u2192', !canProceed, handleNext);
  // Step 4 in the wizard (was step 3 before Aspects was inserted)

  async function handleNext() {
    if (!id || !canProceed) return;
    await updateListing(id, {
      itemCondition: store.condition,
      itemColor: store.color,
      specialNotes: store.specialNotes,
    });
    store.setCurrentStep(5);
    navigate(`/listing/${id}/step/5`);
  }

  return (
    <div className="space-y-8 max-w-lg">
      <div>
        <h2 className="text-2xl font-bold text-gray-900">Item details</h2>
        <p className="text-gray-500 mt-1">Tell buyers about the condition and appearance.</p>
      </div>

      {/* Condition */}
      <div>
        <label className="block text-sm font-semibold text-gray-700 mb-2">
          Condition <span className="text-red-500">*</span>
        </label>
        <select
          value={store.condition}
          onChange={(e) => store.setCondition(e.target.value)}
          className="w-full border border-gray-300 rounded-lg px-3 py-2.5 focus:ring-2 focus:ring-blue-500 focus:border-transparent bg-white"
        >
          <option value="">Select condition…</option>
          {CONDITIONS.map((c) => (
            <option key={c} value={c}>{c}</option>
          ))}
        </select>
      </div>

      {/* Color */}
      <div>
        <label className="block text-sm font-semibold text-gray-700 mb-2">Color</label>
        <input
          type="text"
          value={store.color}
          onChange={(e) => store.setColor(e.target.value)}
          placeholder="e.g. Space Gray"
          className="w-full border border-gray-300 rounded-lg px-3 py-2.5 focus:ring-2 focus:ring-blue-500 focus:border-transparent mb-3"
        />
        <div className="flex flex-wrap gap-2">
          {COLOR_CHIPS.map((c) => (
            <button
              key={c}
              onClick={() => store.setColor(c)}
              className={clsx(
                'px-3 py-1 rounded-full text-sm border transition-colors',
                store.color === c
                  ? 'bg-blue-600 text-white border-blue-600'
                  : 'border-gray-300 text-gray-600 hover:border-blue-400 hover:text-blue-600',
              )}
            >
              {c}
            </button>
          ))}
        </div>
      </div>

      {/* Special notes */}
      <div>
        <label className="block text-sm font-semibold text-gray-700 mb-2">
          Anything the buyer should know?
        </label>
        <textarea
          value={store.specialNotes}
          onChange={(e) => store.setSpecialNotes(e.target.value)}
          rows={4}
          placeholder="Scratches, missing parts, original box included, etc."
          className="w-full border border-gray-300 rounded-lg px-3 py-2.5 focus:ring-2 focus:ring-blue-500 focus:border-transparent resize-none"
        />
        <p className="text-xs text-gray-400 mt-1">Optional — this text feeds into the description generation.</p>
      </div>

      <div className="flex justify-between pt-2">
      </div>
    </div>
  );
}
