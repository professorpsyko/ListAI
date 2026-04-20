import { useState, useEffect } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { useListingStore } from '../store/listingStore';
import { publishListing, updateListing } from '../lib/api';
import { useStepAction } from '../hooks/useStepAction';
import { useEditor, EditorContent } from '@tiptap/react';
import StarterKit from '@tiptap/starter-kit';
import { Markdown } from 'tiptap-markdown';
import {
  DndContext,
  closestCenter,
  PointerSensor,
  useSensor,
  useSensors,
  type DragEndEvent,
} from '@dnd-kit/core';
import {
  SortableContext,
  horizontalListSortingStrategy,
  useSortable,
  arrayMove,
} from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import clsx from 'clsx';

// ─── Types ────────────────────────────────────────────────────────────────────
interface Suggestion {
  id: string;
  text: string;
  why: string;
  points: number;
}

type PublishStage = 'idle' | 'saving' | 'publishing' | 'success' | 'error';

const PUBLISH_STEPS: { id: PublishStage; label: string }[] = [
  { id: 'saving', label: 'Saving listing data' },
  { id: 'publishing', label: 'Creating eBay listing' },
  { id: 'success', label: 'Live on eBay!' },
];

// ─── Score calculation ────────────────────────────────────────────────────────
function calcScore(
  store: ReturnType<typeof useListingStore.getState>,
  dismissed: string[],
): { score: number; suggestions: Suggestion[] } {
  let score = 0;
  const all: Suggestion[] = [];

  // Photos (25 pts)
  const photoCount = store.processedPhotoUrls.length || store.itemPhotoUrls.length;
  if (photoCount >= 10) {
    score += 25;
  } else if (photoCount >= 5) {
    score += 20;
    all.push({
      id: 'more-photos',
      text: 'Add a few more photos to hit 10',
      why: 'eBay listings with 10 photos see up to 40% higher conversion. Buyers love being able to inspect every angle before buying.',
      points: 5,
    });
  } else if (photoCount >= 2) {
    score += 10;
    all.push({
      id: 'more-photos',
      text: 'Adding 5+ photos would really help',
      why: 'More photos build buyer confidence fast. Show all sides, any wear marks, and included accessories.',
      points: 15,
    });
  } else {
    all.push({
      id: 'more-photos',
      text: 'Adding photos will make a big difference',
      why: 'Listings with photos sell dramatically faster. A few clear shots from different angles is all it takes.',
      points: 25,
    });
  }

  // Title (20 pts)
  const titleLen = store.itemTitle.length;
  if (titleLen >= 75) {
    score += 20;
  } else if (titleLen >= 65) {
    score += 15;
    all.push({
      id: 'longer-title',
      text: 'A little more in the title could boost search rank',
      why: 'eBay allows 80 characters — filling it with keywords buyers actually search for (model number, color, condition) gets you seen more.',
      points: 5,
    });
  } else if (titleLen >= 50) {
    score += 10;
    all.push({
      id: 'longer-title',
      text: 'Expanding your title to 65+ characters helps',
      why: "Include brand, model, condition, and key features. Titles with 65–80 chars get significantly better search placement.",
      points: 10,
    });
  } else {
    all.push({
      id: 'longer-title',
      text: 'A more detailed title would improve visibility',
      why: 'Buyers search by model number, brand, and specific features. A richer title captures more of those searches.',
      points: 20,
    });
  }

  // Description (20 pts)
  const wordCount = store.itemDescription.split(/\s+/).filter(Boolean).length;
  if (wordCount >= 300) {
    score += 20;
  } else if (wordCount >= 200) {
    score += 15;
    all.push({
      id: 'longer-desc',
      text: 'A bit more detail in the description would shine',
      why: "Richer descriptions reduce buyer questions and returns. Exact specs, what's included, and any known flaws build trust.",
      points: 5,
    });
  } else if (wordCount >= 100) {
    score += 10;
    all.push({
      id: 'longer-desc',
      text: 'Fleshing out the description to 200+ words helps',
      why: 'Buyers read descriptions closely before buying. Cover condition, accessories, dimensions, and any imperfections upfront.',
      points: 10,
    });
  } else {
    all.push({
      id: 'longer-desc',
      text: 'Adding more description can really lift your listing',
      why: 'A thorough description answers buyer questions before they ask, reducing back-and-forth and building confidence to buy.',
      points: 20,
    });
  }

  // Price (20 pts)
  const suggested = store.pricingResearch?.suggestedPrice;
  const final = parseFloat(store.finalPrice);
  if (suggested && !isNaN(final)) {
    const diff = Math.abs(final - suggested) / suggested;
    if (diff <= 0.10) {
      score += 20;
    } else if (diff <= 0.25) {
      score += 10;
      all.push({
        id: 'price',
        text: 'Nudging the price closer to market could speed up the sale',
        why: `AI research suggests $${suggested.toFixed(2)}. Listings priced within 10% of market value sell 3× faster on average.`,
        points: 10,
      });
    } else {
      all.push({
        id: 'price',
        text: 'Revisiting the price could make a big difference',
        why: `AI research suggests $${suggested.toFixed(2)}. A price closer to market value tends to attract buyers much faster.`,
        points: 20,
      });
    }
  } else {
    score += 10;
  }

  // Shipping (15 pts)
  const isFree = store.shippingCost === '0' || store.shippingService.toLowerCase().includes('free');
  if (isFree) {
    score += 15;
  } else if (store.shippingService) {
    score += 10;
    all.push({
      id: 'free-shipping',
      text: 'Free shipping tends to convert better',
      why: 'Listings with free shipping rank higher in eBay Best Match and convert 30%+ better. Try folding the cost into your price.',
      points: 5,
    });
  } else {
    all.push({
      id: 'shipping',
      text: 'Adding shipping details will complete your listing',
      why: "Buyers expect to know shipping costs upfront. Adding a service and price removes a common reason people don't buy.",
      points: 15,
    });
  }

  return {
    score: Math.min(score, 100),
    suggestions: all.filter((s) => !dismissed.includes(s.id)),
  };
}

// ─── Score gauge ──────────────────────────────────────────────────────────────
function ScoreGauge({ score }: { score: number }) {
  const color = score >= 75 ? '#16a34a' : score >= 50 ? '#d97706' : '#dc2626';
  const r = 36;
  const circ = 2 * Math.PI * r;
  const offset = circ * (1 - score / 100);
  return (
    <div className="relative w-20 h-20 flex-shrink-0">
      <svg className="w-full h-full -rotate-90" viewBox="0 0 100 100">
        <circle cx="50" cy="50" r={r} fill="none" stroke="#e5e7eb" strokeWidth="10" />
        <circle cx="50" cy="50" r={r} fill="none" stroke={color} strokeWidth="10"
          strokeDasharray={circ} strokeDashoffset={offset} strokeLinecap="round"
          style={{ transition: 'stroke-dashoffset 0.5s ease' }} />
      </svg>
      <div className="absolute inset-0 flex flex-col items-center justify-center">
        <span className="text-xl font-bold" style={{ color }}>{score}</span>
        <span className="text-[10px] text-gray-400">/100</span>
      </div>
    </div>
  );
}

// ─── Suggestion card ──────────────────────────────────────────────────────────
function SuggestionCard({ s, onIgnore }: { s: Suggestion; onIgnore: () => void }) {
  const [showWhy, setShowWhy] = useState(false);
  return (
    <div className="flex items-center gap-3 bg-blue-50 border border-blue-100 rounded-lg px-3 py-2.5">
      {/* Lightbulb icon */}
      <svg className="w-4 h-4 text-blue-400 flex-shrink-0" fill="currentColor" viewBox="0 0 20 20">
        <path d="M11 3a1 1 0 10-2 0v1a1 1 0 102 0V3zM6.293 5.293a1 1 0 011.414 0l.7.7a1 1 0 01-1.414 1.414l-.7-.7a1 1 0 010-1.414zM14 10a4 4 0 11-8 0 4 4 0 018 0zM7 15a1 1 0 000 2h6a1 1 0 000-2H7z" />
      </svg>

      {/* Text + badges */}
      <div className="flex-1 flex items-center gap-2 flex-wrap min-w-0">
        <span className="text-sm text-gray-700">{s.text}</span>
        <span className="text-xs font-semibold text-blue-700 bg-blue-100 border border-blue-200 rounded-full px-2 py-0.5 whitespace-nowrap">
          +{s.points} pts
        </span>
        {/* Why tooltip */}
        <div className="relative">
          <button
            onMouseEnter={() => setShowWhy(true)}
            onMouseLeave={() => setShowWhy(false)}
            className="w-4 h-4 rounded-full border border-gray-300 text-gray-400 text-[10px] flex items-center justify-center hover:border-blue-400 hover:text-blue-500 transition-colors flex-shrink-0"
          >
            ?
          </button>
          {showWhy && (
            <div className="absolute left-6 top-0 z-50 w-64 bg-gray-900 text-white text-xs rounded-lg px-3 py-2.5 shadow-xl leading-relaxed pointer-events-none">
              {s.why}
              <div className="absolute left-[-4px] top-2.5 w-2 h-2 bg-gray-900 rotate-45" />
            </div>
          )}
        </div>
      </div>

      {/* Dismiss */}
      <button
        onClick={onIgnore}
        className="text-xs text-gray-400 hover:text-gray-500 flex-shrink-0 ml-1 transition-colors"
      >
        Dismiss
      </button>
    </div>
  );
}

// ─── Sortable photo tile ──────────────────────────────────────────────────────
function SortablePhoto({
  url, index, isLabel,
}: {
  url: string; index: number; isLabel: boolean;
}) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } =
    useSortable({ id: url });

  const style: React.CSSProperties = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.45 : 1,
    zIndex: isDragging ? 50 : undefined,
  };

  const isMain = index === 0;

  return (
    <div
      ref={setNodeRef}
      style={style}
      {...attributes}
      {...listeners}
      className="relative flex-shrink-0 cursor-grab active:cursor-grabbing select-none"
      title={isMain ? 'Main image (shown first on eBay)' : isLabel ? 'Tag / serial number photo' : `Photo ${index + 1}`}
    >
      <img
        src={url}
        alt={isLabel ? 'Tag / serial' : `Photo ${index + 1}`}
        draggable={false}
        className={clsx(
          'object-cover rounded-xl border transition-all',
          isMain
            ? 'h-52 w-52 border-2 border-blue-400 shadow-lg'
            : 'h-24 w-24 border-gray-200 shadow-sm hover:shadow-md',
          isDragging && 'shadow-2xl ring-2 ring-blue-300',
        )}
      />
      {isMain && (
        <span className="absolute top-2 left-2 bg-blue-600 text-white text-xs font-semibold px-2 py-0.5 rounded-full shadow">
          Main
        </span>
      )}
      {isLabel && !isMain && (
        <span className="absolute bottom-1.5 left-1.5 bg-black/60 text-white text-[10px] px-1.5 py-0.5 rounded">
          Tag
        </span>
      )}
      {!isMain && !isLabel && (
        <span className="absolute top-1 left-1 bg-black/40 text-white text-[10px] w-5 h-5 rounded-full flex items-center justify-center font-medium">
          {index + 1}
        </span>
      )}
    </div>
  );
}

// ─── Description editor toolbar ───────────────────────────────────────────────
function DescToolbar({ editor }: { editor: ReturnType<typeof useEditor> }) {
  if (!editor) return null;
  return (
    <div className="flex items-center gap-0.5 px-3 py-1.5 border-b border-gray-200 bg-gray-50 rounded-t-lg flex-wrap">
      {[
        { title: 'Bold', active: editor.isActive('bold'), run: () => editor.chain().focus().toggleBold().run(), label: <strong>B</strong> },
        { title: 'Italic', active: editor.isActive('italic'), run: () => editor.chain().focus().toggleItalic().run(), label: <em>I</em> },
      ].map(({ title, active, run, label }) => (
        <button
          key={title}
          type="button"
          title={title}
          onMouseDown={(e) => { e.preventDefault(); run(); }}
          className={clsx('w-7 h-7 flex items-center justify-center rounded text-sm transition-colors',
            active ? 'bg-blue-100 text-blue-700 font-semibold' : 'text-gray-500 hover:bg-gray-100 hover:text-gray-800')}
        >
          {label}
        </button>
      ))}
      <div className="w-px h-4 bg-gray-300 mx-1" />
      <button type="button" title="Bullet list"
        onMouseDown={(e) => { e.preventDefault(); editor.chain().focus().toggleBulletList().run(); }}
        className={clsx('w-7 h-7 flex items-center justify-center rounded transition-colors',
          editor.isActive('bulletList') ? 'bg-blue-100 text-blue-700' : 'text-gray-500 hover:bg-gray-100')}>
        <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 6h13M8 12h13M8 18h13M3 6h.01M3 12h.01M3 18h.01" />
        </svg>
      </button>
      <button type="button" title="Numbered list"
        onMouseDown={(e) => { e.preventDefault(); editor.chain().focus().toggleOrderedList().run(); }}
        className={clsx('w-7 h-7 flex items-center justify-center rounded transition-colors',
          editor.isActive('orderedList') ? 'bg-blue-100 text-blue-700' : 'text-gray-500 hover:bg-gray-100')}>
        <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 6h16M4 10h16M4 14h16M4 18h16" />
        </svg>
      </button>
    </div>
  );
}

// ─── Inline edit (title) ──────────────────────────────────────────────────────
function InlineEditField({ label, value, onChange }: {
  label: string; value: string; onChange: (v: string) => void;
}) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(value);

  if (editing) {
    return (
      <div className="space-y-2">
        <label className="text-xs font-medium text-gray-500 uppercase tracking-wide">{label}</label>
        <input
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          className="w-full border border-blue-400 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-blue-500"
          autoFocus
        />
        <div className="flex gap-2">
          <button onClick={() => { onChange(draft); setEditing(false); }}
            className="px-3 py-1 bg-blue-600 text-white text-sm rounded font-medium">Save</button>
          <button onClick={() => setEditing(false)}
            className="px-3 py-1 border border-gray-300 text-sm rounded text-gray-600">Cancel</button>
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
      <p className="text-sm text-gray-800">{value || <span className="text-gray-400 italic">Not set</span>}</p>
    </div>
  );
}

// ─── Main component ───────────────────────────────────────────────────────────
export default function Step8Preview() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const store = useListingStore();

  // ── Publish state ──────────────────────────────────────────────────────────
  const [showConfirm, setShowConfirm] = useState(false);
  const [publishStage, setPublishStage] = useState<PublishStage>('idle');
  const [publishResult, setPublishResult] = useState<{ listingUrl: string } | null>(null);
  const [publishError, setPublishError] = useState<string | null>(null);

  // ── Score / suggestions ────────────────────────────────────────────────────
  const [dismissed, setDismissed] = useState<string[]>([]);
  const { score, suggestions } = calcScore(store, dismissed);

  // ── Photos DnD ─────────────────────────────────────────────────────────────
  const [showOriginal, setShowOriginal] = useState(false);
  const labelUrl = store.labelPhotoUrl;

  // processedPhotoUrls[0] is the label's processed version (label uploaded first).
  // Strip it by taking only the last itemPhotoUrls.length entries.
  function getItemPhotos(processed: string[], originals: string[]): string[] {
    if (!processed.length) return originals;
    const expected = originals.length;
    return processed.length > expected
      ? processed.slice(processed.length - expected)
      : processed;
  }

  const [orderedPhotos, setOrderedPhotos] = useState<string[]>(() => {
    const base = getItemPhotos(store.processedPhotoUrls, store.itemPhotoUrls);
    return labelUrl ? [...base, labelUrl] : base;
  });

  // Re-sync when processed photos arrive after mount.
  useEffect(() => {
    const base = showOriginal
      ? store.itemPhotoUrls
      : getItemPhotos(store.processedPhotoUrls, store.itemPhotoUrls);
    const withLabel = labelUrl ? [...base, labelUrl] : base;
    setOrderedPhotos(withLabel);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [store.processedPhotoUrls.length, showOriginal]);

  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 5 } }));

  function handleDragEnd(event: DragEndEvent) {
    const { active, over } = event;
    if (over && active.id !== over.id) {
      setOrderedPhotos((arr) => {
        const oldIndex = arr.indexOf(active.id as string);
        const newIndex = arr.indexOf(over.id as string);
        return arrayMove(arr, oldIndex, newIndex);
      });
    }
  }

  // ── Description TipTap editor ──────────────────────────────────────────────
  const [editingDesc, setEditingDesc] = useState(false);
  const [descDraft, setDescDraft] = useState(store.itemDescription);

  const descEditor = useEditor({
    extensions: [StarterKit, Markdown],
    content: store.itemDescription,
    editable: false,
    editorProps: { attributes: { class: 'focus:outline-none' } },
    onUpdate: ({ editor }) => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const md = (editor.storage as any).markdown.getMarkdown() as string;
      setDescDraft(md);
    },
  });

  // Toggle editable when edit mode changes
  useEffect(() => {
    if (!descEditor) return;
    descEditor.setEditable(editingDesc);
    if (editingDesc) {
      setTimeout(() => descEditor.commands.focus('end'), 0);
    }
  }, [editingDesc, descEditor]);

  function saveDesc() {
    store.setItemDescription(descDraft);
    setEditingDesc(false);
  }

  function cancelDesc() {
    if (descEditor) descEditor.commands.setContent(store.itemDescription);
    setDescDraft(store.itemDescription);
    setEditingDesc(false);
  }

  // ── Step action button ─────────────────────────────────────────────────────
  const isPublished = publishStage === 'success';
  const isCurrentlyPublishing = showConfirm && publishStage !== 'idle' && publishStage !== 'error';

  useStepAction(
    isPublished ? '✓ Published!' : (isCurrentlyPublishing ? 'Publishing…' : '🚀 Publish to eBay'),
    isCurrentlyPublishing,
    isPublished ? () => {} : () => setShowConfirm(true),
    isPublished
      ? 'bg-green-600 text-white cursor-default'
      : 'bg-green-600 hover:bg-green-700 text-white',
  );

  // ── Publish handler ────────────────────────────────────────────────────────
  async function handlePublish() {
    if (!id) return;
    setPublishError(null);
    setPublishStage('saving');

    try {
      // Step 1: Save all latest changes + reordered photos
      await updateListing(id, {
        itemTitle: store.itemTitle,
        itemDescription: store.itemDescription,
        finalPrice: parseFloat(store.finalPrice) || 0,
        listingType: store.listingType,
        auctionDuration: store.auctionDuration,
        startingBid: store.startingBid ? parseFloat(store.startingBid) : undefined,
        imageUrls: orderedPhotos,
        processedImageUrls: orderedPhotos,
      });

      // Step 2: Publish to eBay
      setPublishStage('publishing');
      const result = await publishListing(id);

      setPublishResult(result);
      setPublishStage('success');
    } catch (err) {
      // Axios wraps the HTTP response — extract the real error from the body if present
      const axiosErr = err as { response?: { data?: { error?: string } } };
      const msg = axiosErr.response?.data?.error
        ?? (err instanceof Error ? err.message : 'An unexpected error occurred');
      setPublishError(msg);
      setPublishStage('error');
    }
  }

  // ── Publish modal ──────────────────────────────────────────────────────────
  const stageIndex = PUBLISH_STEPS.findIndex((s) => s.id === publishStage);

  function renderPublishModal() {
    if (!showConfirm) return null;

    return (
      <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
        <div className="bg-white rounded-2xl max-w-md w-full shadow-2xl overflow-hidden">

          {/* ── Initial confirm ── */}
          {publishStage === 'idle' && (
            <div className="p-8 space-y-5">
              <div>
                <h3 className="text-xl font-bold text-gray-900">Publish to eBay?</h3>
                <p className="text-gray-500 mt-1 text-sm">Your listing will go live immediately once published.</p>
              </div>
              <div className="flex gap-3">
                <button
                  onClick={handlePublish}
                  className="flex-1 py-2.5 bg-green-600 hover:bg-green-700 text-white font-semibold rounded-lg transition-colors"
                >
                  Yes, publish
                </button>
                <button
                  onClick={() => setShowConfirm(false)}
                  className="flex-1 py-2.5 border border-gray-300 text-gray-700 rounded-lg hover:bg-gray-50"
                >
                  Cancel
                </button>
              </div>
            </div>
          )}

          {/* ── Progress timeline ── */}
          {(publishStage === 'saving' || publishStage === 'publishing' || publishStage === 'success') && (
            <div className="p-8 space-y-6">
              <h3 className={clsx(
                'text-lg font-bold',
                publishStage === 'success' ? 'text-green-700' : 'text-gray-900',
              )}>
                {publishStage === 'success' ? '🎉 Your listing is live!' : 'Publishing to eBay…'}
              </h3>

              <div className="space-y-4">
                {PUBLISH_STEPS.map((step, i) => {
                  const isDone = publishStage === 'success' || i < stageIndex;
                  const isActive = step.id === publishStage;
                  const isPending = !isDone && !isActive;

                  return (
                    <div key={step.id} className="flex items-center gap-3">
                      {/* Step indicator */}
                      {isDone ? (
                        <div className="w-6 h-6 rounded-full bg-green-500 flex items-center justify-center flex-shrink-0 shadow-sm">
                          <svg className="w-3.5 h-3.5 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M5 13l4 4L19 7" />
                          </svg>
                        </div>
                      ) : isActive ? (
                        <div className="w-6 h-6 rounded-full border-2 border-blue-500 border-t-transparent animate-spin flex-shrink-0" />
                      ) : (
                        <div className={clsx(
                          'w-6 h-6 rounded-full border-2 flex-shrink-0',
                          isPending ? 'border-gray-200' : 'border-gray-300',
                        )} />
                      )}

                      {/* Step label */}
                      <span className={clsx(
                        'text-sm font-medium',
                        isDone ? 'text-green-700'
                          : isActive ? 'text-blue-700'
                            : 'text-gray-400',
                      )}>
                        {step.label}
                      </span>
                    </div>
                  );
                })}
              </div>

              {/* Success actions */}
              {publishStage === 'success' && publishResult && (
                <div className="space-y-3 pt-2">
                  <a
                    href={publishResult.listingUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="block w-full py-2.5 bg-green-600 hover:bg-green-700 text-white font-semibold rounded-lg text-center transition-colors"
                  >
                    View listing on eBay →
                  </a>
                  <button
                    onClick={() => { store.reset(); navigate('/dashboard'); }}
                    className="block w-full py-2 text-sm text-gray-500 hover:text-gray-700 transition-colors text-center"
                  >
                    Create another listing
                  </button>
                </div>
              )}
            </div>
          )}

          {/* ── Error state ── */}
          {publishStage === 'error' && (
            <div className="p-8 space-y-5">
              <div className="flex flex-col items-center text-center gap-3">
                <div className="w-12 h-12 bg-red-100 rounded-full flex items-center justify-center">
                  <svg className="w-6 h-6 text-red-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                  </svg>
                </div>
                <h3 className="text-lg font-bold text-gray-900">Publish failed</h3>
                {publishError && (
                  <p className="text-sm text-red-700 bg-red-50 border border-red-200 rounded-lg px-4 py-3 w-full text-left">
                    {publishError}
                  </p>
                )}
              </div>
              <div className="flex gap-3">
                <button
                  onClick={() => { setPublishStage('idle'); handlePublish(); }}
                  className="flex-1 py-2.5 bg-blue-600 hover:bg-blue-700 text-white font-semibold rounded-lg transition-colors"
                >
                  Try again
                </button>
                <button
                  onClick={() => { setShowConfirm(false); setPublishStage('idle'); }}
                  className="flex-1 py-2.5 border border-gray-300 text-gray-700 rounded-lg hover:bg-gray-50"
                >
                  Cancel
                </button>
              </div>
            </div>
          )}
        </div>
      </div>
    );
  }

  // ── Render ─────────────────────────────────────────────────────────────────
  return (
    <div className="space-y-8 max-w-3xl">

      {/* ── Header + score ──────────────────────────────────────────────────── */}
      <div>
        <div className="flex items-start gap-6">
          <div className="flex-1">
            <h2 className="text-2xl font-bold text-gray-900">Preview & publish</h2>
            <p className="text-gray-500 mt-1">Review your listing before it goes live.</p>
          </div>
          {/* Compact score gauge */}
          <div className="flex items-center gap-3 bg-white border border-gray-200 rounded-xl p-3 shadow-sm flex-shrink-0">
            <ScoreGauge score={score} />
            <div>
              <p className="text-xs font-semibold text-gray-600">Listing quality</p>
              <p className="text-xs text-gray-400">{score >= 75 ? 'Looking great!' : score >= 50 ? 'Room to improve' : 'Needs attention'}</p>
            </div>
          </div>
        </div>

        {/* Improvement suggestions */}
        {suggestions.length > 0 && (
          <div className="mt-4 space-y-2">
            {suggestions.map((s) => (
              <SuggestionCard
                key={s.id}
                s={s}
                onIgnore={() => setDismissed((d) => [...d, s.id])}
              />
            ))}
          </div>
        )}
      </div>

      {/* ── Photos ─────────────────────────────────────────────────────────── */}
      <div>
        <div className="flex items-center justify-between mb-3">
          <div>
            <h3 className="font-semibold text-gray-700">Photos ({orderedPhotos.length})</h3>
            <p className="text-xs text-gray-400 mt-0.5">Drag to reorder · first photo is the main eBay image</p>
          </div>
          {store.processedPhotoUrls.length > 0 && (
            <div className="flex items-center gap-1 text-xs bg-gray-100 rounded-lg p-1">
              <button onClick={() => setShowOriginal(false)}
                className={clsx('px-2.5 py-1 rounded-md transition-colors',
                  !showOriginal ? 'bg-white text-blue-700 font-medium shadow-sm' : 'text-gray-500 hover:text-gray-700')}>
                Processed
              </button>
              <button onClick={() => setShowOriginal(true)}
                className={clsx('px-2.5 py-1 rounded-md transition-colors',
                  showOriginal ? 'bg-white text-blue-700 font-medium shadow-sm' : 'text-gray-500 hover:text-gray-700')}>
                Original
              </button>
            </div>
          )}
        </div>

        <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={handleDragEnd}>
          <SortableContext items={orderedPhotos} strategy={horizontalListSortingStrategy}>
            <div className="flex gap-3 overflow-x-auto pb-2 scrollbar-hide items-end">
              {orderedPhotos.map((url, i) => (
                <SortablePhoto
                  key={url}
                  url={url}
                  index={i}
                  isLabel={url === labelUrl}
                />
              ))}
            </div>
          </SortableContext>
        </DndContext>
      </div>

      {/* ── Listing details card ───────────────────────────────────────────── */}
      <div className="bg-white border border-gray-200 rounded-xl p-6 shadow-sm space-y-6">

        {/* Title */}
        <InlineEditField label="Title" value={store.itemTitle} onChange={store.setItemTitle} />
        <hr className="border-gray-100" />

        {/* Description — read-only TipTap, toggle to edit */}
        <div className="group">
          <div className="flex items-center justify-between mb-2">
            <label className="text-xs font-medium text-gray-500 uppercase tracking-wide">Description</label>
            {!editingDesc ? (
              <button
                onClick={() => setEditingDesc(true)}
                className="text-xs text-blue-600 hover:underline opacity-0 group-hover:opacity-100 transition-opacity"
              >
                Edit
              </button>
            ) : (
              <div className="flex gap-2">
                <button onClick={saveDesc} className="text-xs text-blue-600 hover:underline font-medium">Save</button>
                <button onClick={cancelDesc} className="text-xs text-gray-400 hover:text-gray-600">Cancel</button>
              </div>
            )}
          </div>

          <div className={clsx(
            'border rounded-lg overflow-hidden transition-all',
            editingDesc
              ? 'border-blue-400 ring-2 ring-blue-200'
              : 'border-transparent',
          )}>
            {editingDesc && <DescToolbar editor={descEditor} />}
            <div className={clsx(!editingDesc && 'px-0')}>
              {store.itemDescription ? (
                <EditorContent editor={descEditor} />
              ) : (
                <p className="text-sm text-gray-400 italic px-1 py-2">No description yet</p>
              )}
            </div>
          </div>
        </div>
        <hr className="border-gray-100" />

        {/* Condition / Color */}
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
              {([
                { v: 'BUY_IT_NOW', label: 'Buy It Now' },
                { v: 'AUCTION', label: 'Auction' },
                { v: 'AUCTION_BIN', label: 'Auction + BIN' },
              ] as const).map(({ v, label }) => (
                <button
                  key={v}
                  onClick={() => store.setListingType(v)}
                  className={clsx(
                    'px-4 py-2 rounded-lg text-sm font-medium border transition-colors',
                    store.listingType === v
                      ? 'bg-blue-600 text-white border-blue-600'
                      : 'border-gray-300 text-gray-600 hover:border-blue-400',
                  )}
                >
                  {label}
                </button>
              ))}
            </div>
          </div>

          <div className="grid grid-cols-2 gap-4">
            {(store.listingType === 'BUY_IT_NOW' || store.listingType === 'AUCTION_BIN') && (
              <div>
                <p className="text-xs font-medium text-gray-500 uppercase tracking-wide mb-1">Buy It Now price</p>
                <div className="relative">
                  <span className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-500">$</span>
                  <input type="number" value={store.finalPrice} onChange={(e) => store.setFinalPrice(e.target.value)}
                    className="w-full border border-gray-300 rounded-lg pl-7 pr-3 py-2 text-sm focus:ring-2 focus:ring-blue-500" />
                </div>
              </div>
            )}
            {(store.listingType === 'AUCTION' || store.listingType === 'AUCTION_BIN') && (
              <div>
                <p className="text-xs font-medium text-gray-500 uppercase tracking-wide mb-1">Starting bid</p>
                <div className="relative">
                  <span className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-500">$</span>
                  <input type="number" value={store.startingBid} onChange={(e) => store.setStartingBid(e.target.value)}
                    className="w-full border border-gray-300 rounded-lg pl-7 pr-3 py-2 text-sm focus:ring-2 focus:ring-blue-500" />
                </div>
              </div>
            )}
            {(store.listingType === 'AUCTION' || store.listingType === 'AUCTION_BIN') && (
              <div>
                <p className="text-xs font-medium text-gray-500 uppercase tracking-wide mb-1">Duration</p>
                <select value={store.auctionDuration} onChange={(e) => store.setAuctionDuration(Number(e.target.value))}
                  className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-blue-500 bg-white">
                  {[1, 3, 5, 7, 10].map((d) => <option key={d} value={d}>{d} days</option>)}
                </select>
              </div>
            )}
          </div>
        </div>
        <hr className="border-gray-100" />

        {/* Shipping */}
        <div>
          <p className="text-xs font-medium text-gray-500 uppercase tracking-wide mb-2">Shipping</p>
          <div className="flex gap-6 text-sm text-gray-800 flex-wrap">
            <span>{store.shippingService || '—'}</span>
            <span>{store.shippingCost === '0' ? 'Free' : store.shippingCost ? `$${store.shippingCost}` : '—'}</span>
            <span>{store.handlingTime || '—'}</span>
            {store.acceptReturns && (
              <span className="text-green-700">{store.returnWindow}-day returns</span>
            )}
          </div>
        </div>
      </div>

      {/* Publish modal */}
      {renderPublishModal()}
    </div>
  );
}
