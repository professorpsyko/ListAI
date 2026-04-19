import { useCallback, useEffect, useRef, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { useListingStore } from '../store/listingStore';
import { searchEbayCategories, getEbayCategoryAspects, updateListing } from '../lib/api';
import { useStepAction } from '../hooks/useStepAction';
import clsx from 'clsx';

// ─── Types ────────────────────────────────────────────────────────────────────

interface CategorySuggestion {
  categoryId: string;
  categoryName: string;
  categoryTreeNodeLevel: number;
  breadcrumbs: string[];
}

interface AspectConstraint {
  aspectRequired: boolean;
  aspectRecommended: boolean;
  aspectUsage: string;
  itemToAspectCardinality: string;
}

interface Aspect {
  aspectName: string;
  aspectConstraint: AspectConstraint;
  aspectValues: string[];
  aspectDataType: string;
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

function useDebounce<T>(value: T, delay: number): T {
  const [debounced, setDebounced] = useState(value);
  useEffect(() => {
    const t = setTimeout(() => setDebounced(value), delay);
    return () => clearTimeout(t);
  }, [value, delay]);
  return debounced;
}

/** Pre-fill aspect values from identification data based on common aspect name mappings */
function prefillFromIdentification(
  aspectName: string,
  identification: ReturnType<typeof useListingStore.getState>['identification'],
  color: string,
): string {
  if (!identification) return '';
  const lower = aspectName.toLowerCase();

  if (lower === 'brand') return identification.brand || '';
  if (lower === 'model' || lower === 'model number') return identification.model || '';
  if (lower === 'color' || lower === 'colour' || lower === 'primary color' || lower === 'primary colour') return color || '';
  if (lower === 'mpn' || lower === 'manufacturer part number') return identification.serialNumber || '';
  if (lower === 'type' || lower === 'item type') return identification.ebayCategory || '';

  return '';
}

// ─── Combobox aspect input ────────────────────────────────────────────────────

interface AspectInputProps {
  aspect: Aspect;
  value: string;
  onChange: (v: string) => void;
}

function AspectInput({ aspect, value, onChange }: AspectInputProps) {
  const [open, setOpen] = useState(false);
  const [filter, setFilter] = useState('');
  const wrapperRef = useRef<HTMLDivElement>(null);
  const isMulti = aspect.aspectConstraint.itemToAspectCardinality === 'MULTI';
  const hasOptions = aspect.aspectValues.length > 0;

  // For MULTI-value: value is a comma-separated string internally
  const selectedValues = isMulti && value ? value.split('|||').filter(Boolean) : [];

  const filteredOptions = hasOptions
    ? aspect.aspectValues.filter((v) =>
        filter ? v.toLowerCase().includes(filter.toLowerCase()) : true,
      )
    : [];

  // Close dropdown on outside click
  useEffect(() => {
    function onClickOutside(e: MouseEvent) {
      if (wrapperRef.current && !wrapperRef.current.contains(e.target as Node)) {
        setOpen(false);
        setFilter('');
      }
    }
    document.addEventListener('mousedown', onClickOutside);
    return () => document.removeEventListener('mousedown', onClickOutside);
  }, []);

  if (!hasOptions) {
    // Free-text input
    return (
      <input
        type="text"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder="Enter value..."
        className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-blue-500 focus:border-transparent"
      />
    );
  }

  if (isMulti) {
    // Multi-select: show chips + add from dropdown
    const toggleValue = (v: string) => {
      const next = selectedValues.includes(v)
        ? selectedValues.filter((s) => s !== v)
        : [...selectedValues, v];
      onChange(next.join('|||'));
    };

    return (
      <div ref={wrapperRef} className="space-y-2">
        {/* Selected chips */}
        {selectedValues.length > 0 && (
          <div className="flex flex-wrap gap-1.5">
            {selectedValues.map((v) => (
              <span
                key={v}
                className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full bg-blue-100 text-blue-800 text-xs font-medium"
              >
                {v}
                <button
                  type="button"
                  onClick={() => toggleValue(v)}
                  className="hover:text-blue-600 ml-0.5"
                >
                  &times;
                </button>
              </span>
            ))}
          </div>
        )}

        {/* Combobox trigger */}
        <div className="relative">
          <input
            type="text"
            value={filter}
            onChange={(e) => { setFilter(e.target.value); setOpen(true); }}
            onFocus={() => setOpen(true)}
            placeholder={selectedValues.length ? 'Add another value...' : 'Select or type...'}
            className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-blue-500 focus:border-transparent"
          />
          {open && filteredOptions.length > 0 && (
            <ul className="absolute z-20 mt-1 w-full bg-white border border-gray-200 rounded-lg shadow-lg max-h-48 overflow-y-auto">
              {filteredOptions.map((opt) => (
                <li
                  key={opt}
                  onMouseDown={(e) => { e.preventDefault(); toggleValue(opt); setFilter(''); }}
                  className={clsx(
                    'px-3 py-2 text-sm cursor-pointer hover:bg-blue-50',
                    selectedValues.includes(opt) && 'bg-blue-50 text-blue-700 font-medium',
                  )}
                >
                  {opt}
                  {selectedValues.includes(opt) && <span className="ml-2 text-blue-400">✓</span>}
                </li>
              ))}
            </ul>
          )}
        </div>
      </div>
    );
  }

  // Single-value with dropdown options
  const showFilter = aspect.aspectValues.length > 10;

  return (
    <div ref={wrapperRef} className="relative">
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        className={clsx(
          'w-full border rounded-lg px-3 py-2 text-sm text-left flex items-center justify-between',
          'focus:ring-2 focus:ring-blue-500 focus:border-transparent',
          value ? 'border-gray-300 text-gray-900' : 'border-gray-300 text-gray-400',
        )}
      >
        <span>{value || 'Select...'}</span>
        <svg className={clsx('w-4 h-4 text-gray-400 transition-transform', open && 'rotate-180')} fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
        </svg>
      </button>
      {open && (
        <div className="absolute z-20 mt-1 w-full bg-white border border-gray-200 rounded-lg shadow-lg">
          {showFilter && (
            <div className="p-2 border-b border-gray-100">
              <input
                autoFocus
                type="text"
                value={filter}
                onChange={(e) => setFilter(e.target.value)}
                placeholder="Filter options..."
                className="w-full border border-gray-200 rounded px-2 py-1 text-xs focus:ring-1 focus:ring-blue-400"
              />
            </div>
          )}
          <ul className="max-h-48 overflow-y-auto">
            <li
              onMouseDown={(e) => { e.preventDefault(); onChange(''); setOpen(false); setFilter(''); }}
              className="px-3 py-2 text-sm text-gray-400 cursor-pointer hover:bg-gray-50"
            >
              — Select —
            </li>
            {filteredOptions.map((opt) => (
              <li
                key={opt}
                onMouseDown={(e) => { e.preventDefault(); onChange(opt); setOpen(false); setFilter(''); }}
                className={clsx(
                  'px-3 py-2 text-sm cursor-pointer hover:bg-blue-50',
                  value === opt && 'bg-blue-50 text-blue-700 font-medium',
                )}
              >
                {opt}
              </li>
            ))}
            {filteredOptions.length === 0 && (
              <li className="px-3 py-2 text-sm text-gray-400 italic">No options match</li>
            )}
          </ul>
          {/* Allow typing a custom value not in the list */}
          <div className="p-2 border-t border-gray-100">
            <input
              type="text"
              placeholder="Or type a custom value..."
              defaultValue=""
              onKeyDown={(e) => {
                if (e.key === 'Enter') {
                  const v = (e.currentTarget.value || '').trim();
                  if (v) { onChange(v); setOpen(false); setFilter(''); }
                }
              }}
              className="w-full border border-gray-200 rounded px-2 py-1 text-xs focus:ring-1 focus:ring-blue-400"
            />
          </div>
        </div>
      )}
    </div>
  );
}

// ─── Main page ────────────────────────────────────────────────────────────────

export default function Step3Aspects() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const store = useListingStore();

  // ── Category state ──────────────────────────────────────────────────────────
  const [categoryId, setCategoryId] = useState<string>(
    store.ebayCategoryId || store.identification?.ebayCategoryId || '',
  );
  const [categoryName, setCategoryName] = useState<string>(
    store.ebayCategoryName || store.identification?.ebayCategory || '',
  );
  const [categoryBreadcrumbs, setCategoryBreadcrumbs] = useState<string[]>([]);
  const [searchQuery, setSearchQuery] = useState('');
  const [showSearch, setShowSearch] = useState(false);
  const [suggestions, setSuggestions] = useState<CategorySuggestion[]>([]);
  const [searchLoading, setSearchLoading] = useState(false);

  const debouncedQuery = useDebounce(searchQuery, 400);

  // ── Aspects state ───────────────────────────────────────────────────────────
  const [aspects, setAspects] = useState<Aspect[]>([]);
  const [aspectsLoading, setAspectsLoading] = useState(false);
  const [aspectsError, setAspectsError] = useState<string | null>(null);
  const [aspectValues, setAspectValues] = useState<Record<string, string>>(store.itemAspects);
  const [showOptional, setShowOptional] = useState(false);

  // ── Derived ─────────────────────────────────────────────────────────────────
  const requiredAspects = aspects.filter((a) => a.aspectConstraint.aspectRequired);
  const recommendedAspects = aspects.filter(
    (a) => !a.aspectConstraint.aspectRequired && a.aspectConstraint.aspectRecommended,
  );
  const optionalAspects = aspects.filter(
    (a) => !a.aspectConstraint.aspectRequired && !a.aspectConstraint.aspectRecommended,
  );

  const allRequiredFilled = requiredAspects.every((a) => {
    const v = aspectValues[a.aspectName];
    return v && v.trim().length > 0;
  });

  const canProceed = !!categoryId && allRequiredFilled;

  // Define handleContinue before useStepAction so it's in scope
  const handleContinue = useCallback(async () => {
    if (!id || !canProceed) return;

    // Convert multi-value aspects back to arrays where needed
    const cleanedAspects: Record<string, string | string[]> = {};
    Object.entries(aspectValues).forEach(([k, v]) => {
      if (!v || !v.trim()) return;
      if (v.includes('|||')) {
        cleanedAspects[k] = v.split('|||').filter(Boolean);
      } else {
        cleanedAspects[k] = v;
      }
    });

    store.setEbayCategory(categoryId, categoryName);
    store.setItemAspects(aspectValues);
    store.setAspectsConfirmed(true);

    await updateListing(id, {
      itemAspects: cleanedAspects,
      ebayCategoryId: categoryId,
      ebayCategoryName: categoryName,
      itemCategory: categoryName,
    });

    store.setCurrentStep(4);
    navigate(`/listing/${id}/step/4`);
  }, [id, canProceed, aspectValues, categoryId, categoryName, store, navigate]);

  useStepAction('Continue \u2192', !canProceed, handleContinue);

  // ── Fetch aspects when category changes ─────────────────────────────────────
  const fetchAspectsRef = useRef<string>('');
  useEffect(() => {
    if (!categoryId) {
      setAspects([]);
      return;
    }
    if (fetchAspectsRef.current === categoryId) return;
    fetchAspectsRef.current = categoryId;

    setAspectsLoading(true);
    setAspectsError(null);

    getEbayCategoryAspects(categoryId)
      .then((data: Aspect[]) => {
        setAspects(data);

        // Pre-fill values from store (returning user) or identification
        const prefilled: Record<string, string> = { ...store.itemAspects };
        data.forEach((aspect) => {
          if (!prefilled[aspect.aspectName]) {
            const suggested = prefillFromIdentification(
              aspect.aspectName,
              store.identification,
              store.color,
            );
            if (suggested) prefilled[aspect.aspectName] = suggested;
          }
        });
        setAspectValues(prefilled);
      })
      .catch((err: Error) => {
        setAspectsError(err.message || 'Failed to load item aspects');
      })
      .finally(() => setAspectsLoading(false));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [categoryId]);

  // ── Search for categories (debounced) ───────────────────────────────────────
  useEffect(() => {
    if (!debouncedQuery.trim()) {
      setSuggestions([]);
      return;
    }
    setSearchLoading(true);
    searchEbayCategories(debouncedQuery)
      .then((data: CategorySuggestion[]) => setSuggestions(data))
      .catch(() => setSuggestions([]))
      .finally(() => setSearchLoading(false));
  }, [debouncedQuery]);

  // ── Seed category from identification on first mount ────────────────────────
  useEffect(() => {
    if (!categoryId && store.identification?.ebayCategoryId) {
      setCategoryId(store.identification.ebayCategoryId);
      setCategoryName(store.identification.ebayCategory || '');
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // ── Handlers ─────────────────────────────────────────────────────────────────

  function selectCategory(s: CategorySuggestion) {
    setCategoryId(s.categoryId);
    setCategoryName(s.categoryName);
    setCategoryBreadcrumbs(s.breadcrumbs);
    setShowSearch(false);
    setSearchQuery('');
    setSuggestions([]);
    // Reset aspects when category changes
    setAspects([]);
    fetchAspectsRef.current = '';
    setAspectValues({});
  }

  function setAspectValue(name: string, value: string) {
    setAspectValues((prev) => ({ ...prev, [name]: value }));
  }

  // ── Render helpers ────────────────────────────────────────────────────────────

  function renderAspect(aspect: Aspect) {
    const value = aspectValues[aspect.aspectName] || '';
    const isRequired = aspect.aspectConstraint.aspectRequired;
    const isEmpty = !value.trim();

    return (
      <div key={aspect.aspectName} className="space-y-1">
        <label className="flex items-center gap-1.5 text-sm font-medium text-gray-700">
          {aspect.aspectName}
          {isRequired && <span className="text-red-500">*</span>}
          {!isRequired && aspect.aspectConstraint.aspectRecommended && (
            <span className="inline-block w-1.5 h-1.5 rounded-full bg-blue-500 flex-shrink-0" title="Recommended" />
          )}
        </label>
        <AspectInput
          aspect={aspect}
          value={value}
          onChange={(v) => setAspectValue(aspect.aspectName, v)}
        />
        {isRequired && isEmpty && (
          <p className="text-xs text-red-500">Required by eBay for this category</p>
        )}
      </div>
    );
  }

  // ── JSX ───────────────────────────────────────────────────────────────────────

  return (
    <div className="space-y-8 max-w-2xl">
      <div>
        <h2 className="text-2xl font-bold text-gray-900">Category &amp; Item Details</h2>
        <p className="text-gray-500 mt-1">
          Confirm the eBay category and fill in the item specifics. This prevents publish errors.
        </p>
      </div>

      {/* ── Category section ── */}
      <div className="space-y-3">
        <h3 className="text-sm font-semibold text-gray-700 uppercase tracking-wide">eBay Category</h3>

        {/* Current category chip */}
        {categoryId && !showSearch && (
          <div className="flex items-start gap-3">
            <div className="flex-1 bg-blue-50 border border-blue-200 rounded-xl px-4 py-3">
              <div className="flex items-start justify-between gap-2">
                <div>
                  <p className="font-semibold text-blue-900">{categoryName}</p>
                  {categoryBreadcrumbs.length > 0 && (
                    <p className="text-xs text-blue-600 mt-0.5">
                      {categoryBreadcrumbs.join(' › ')} › {categoryName}
                    </p>
                  )}
                  <p className="text-xs text-blue-400 mt-0.5">ID: {categoryId}</p>
                </div>
                <button
                  onClick={() => { setShowSearch(true); setSearchQuery(categoryName); }}
                  className="text-xs text-blue-600 hover:text-blue-800 underline flex-shrink-0 mt-0.5"
                >
                  Change
                </button>
              </div>
            </div>
          </div>
        )}

        {/* No category yet — prompt to search */}
        {!categoryId && !showSearch && (
          <button
            onClick={() => setShowSearch(true)}
            className="w-full border-2 border-dashed border-gray-300 rounded-xl px-4 py-4 text-sm text-gray-500 hover:border-blue-400 hover:text-blue-600 transition-colors text-left"
          >
            Click to search for an eBay category...
          </button>
        )}

        {/* Inline search */}
        {showSearch && (
          <div className="space-y-2">
            <div className="relative">
              <input
                autoFocus
                type="text"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="Search eBay categories..."
                className="w-full border border-gray-300 rounded-lg px-3 py-2.5 pr-10 text-sm focus:ring-2 focus:ring-blue-500 focus:border-transparent"
              />
              {searchLoading && (
                <div className="absolute right-3 top-1/2 -translate-y-1/2 w-4 h-4 border-2 border-blue-500 border-t-transparent rounded-full animate-spin" />
              )}
            </div>

            {suggestions.length > 0 && (
              <ul className="bg-white border border-gray-200 rounded-xl shadow-sm overflow-hidden divide-y divide-gray-100">
                {suggestions.map((s) => (
                  <li
                    key={s.categoryId}
                    onClick={() => selectCategory(s)}
                    className="px-4 py-3 cursor-pointer hover:bg-blue-50 transition-colors"
                  >
                    <p className="text-sm font-medium text-gray-800">{s.categoryName}</p>
                    {s.breadcrumbs.length > 0 && (
                      <p className="text-xs text-gray-400 mt-0.5">
                        {s.breadcrumbs.join(' › ')} › {s.categoryName}
                      </p>
                    )}
                  </li>
                ))}
              </ul>
            )}

            {!searchLoading && debouncedQuery && suggestions.length === 0 && (
              <p className="text-sm text-gray-400 text-center py-2">No categories found for "{debouncedQuery}"</p>
            )}

            {categoryId && (
              <button
                onClick={() => { setShowSearch(false); setSearchQuery(''); setSuggestions([]); }}
                className="text-xs text-gray-400 hover:text-gray-600 underline"
              >
                Cancel
              </button>
            )}
          </div>
        )}
      </div>

      {/* ── Aspects section ── */}
      {categoryId && (
        <div className="space-y-6">
          <h3 className="text-sm font-semibold text-gray-700 uppercase tracking-wide">Item Specifics</h3>

          {aspectsLoading && (
            <div className="flex items-center gap-3 py-6 justify-center text-gray-500">
              <div className="w-5 h-5 border-2 border-blue-500 border-t-transparent rounded-full animate-spin" />
              <span className="text-sm">Loading item specifics for this category...</span>
            </div>
          )}

          {aspectsError && (
            <div className="bg-red-50 border border-red-200 rounded-lg px-4 py-3 text-sm text-red-700">
              {aspectsError} — you can still continue without aspects.
            </div>
          )}

          {!aspectsLoading && !aspectsError && aspects.length > 0 && (
            <>
              {/* Required aspects */}
              {requiredAspects.length > 0 && (
                <div className="space-y-4">
                  <div className="flex items-center gap-2">
                    <span className="text-xs font-semibold text-red-600 uppercase tracking-wide">Required</span>
                    <span className="text-xs text-gray-400">— eBay requires these for this category</span>
                  </div>
                  <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                    {requiredAspects.map(renderAspect)}
                  </div>
                </div>
              )}

              {/* Recommended aspects */}
              {recommendedAspects.length > 0 && (
                <div className="space-y-4">
                  <div className="flex items-center gap-2">
                    <span className="text-xs font-semibold text-blue-600 uppercase tracking-wide">Recommended</span>
                    <span className="text-xs text-gray-400">— helps buyers find your listing</span>
                  </div>
                  <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                    {recommendedAspects.map(renderAspect)}
                  </div>
                </div>
              )}

              {/* Optional aspects (collapsed) */}
              {optionalAspects.length > 0 && (
                <div className="space-y-4">
                  <button
                    onClick={() => setShowOptional((v) => !v)}
                    className="flex items-center gap-2 text-sm text-gray-500 hover:text-gray-700 transition-colors"
                  >
                    <svg
                      className={clsx('w-4 h-4 transition-transform', showOptional && 'rotate-90')}
                      fill="none" stroke="currentColor" viewBox="0 0 24 24"
                    >
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
                    </svg>
                    {showOptional ? 'Hide' : 'Show'} {optionalAspects.length} optional field{optionalAspects.length !== 1 ? 's' : ''}
                  </button>

                  {showOptional && (
                    <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                      {optionalAspects.map(renderAspect)}
                    </div>
                  )}
                </div>
              )}
            </>
          )}

          {!aspectsLoading && !aspectsError && aspects.length === 0 && (
            <div className="text-sm text-gray-400 text-center py-4 bg-gray-50 rounded-lg">
              No item specifics found for this category. You can continue.
            </div>
          )}
        </div>
      )}
    </div>
  );
}
