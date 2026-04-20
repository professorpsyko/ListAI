import { useEffect, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { useListingStore } from '../store/listingStore';
import { generateTitle, generateDescription, updateListing } from '../lib/api';
import { useStepAction } from '../hooks/useStepAction';
import { useEditor, EditorContent } from '@tiptap/react';
import StarterKit from '@tiptap/starter-kit';
import { Markdown } from 'tiptap-markdown';
import clsx from 'clsx';

// ── Editor toolbar ─────────────────────────────────────────────────────────────
function ToolbarBtn({
  active, onMouseDown, title, children,
}: { active: boolean; onMouseDown: () => void; title: string; children: React.ReactNode }) {
  return (
    <button type="button" title={title}
      onMouseDown={(e) => { e.preventDefault(); onMouseDown(); }}
      className={clsx('w-7 h-7 flex items-center justify-center rounded text-sm transition-colors',
        active ? 'bg-blue-100 text-blue-700 font-semibold' : 'text-gray-500 hover:bg-gray-100 hover:text-gray-800')}>
      {children}
    </button>
  );
}

function EditorToolbar({ editor }: { editor: ReturnType<typeof useEditor> }) {
  if (!editor) return null;
  return (
    <div className="flex items-center gap-0.5 px-3 py-1.5 border-b border-gray-200 bg-gray-50 rounded-t-xl flex-wrap">
      <ToolbarBtn active={editor.isActive('bold')} onMouseDown={() => editor.chain().focus().toggleBold().run()} title="Bold"><strong>B</strong></ToolbarBtn>
      <ToolbarBtn active={editor.isActive('italic')} onMouseDown={() => editor.chain().focus().toggleItalic().run()} title="Italic"><em>I</em></ToolbarBtn>
      <div className="w-px h-4 bg-gray-300 mx-1" />
      <ToolbarBtn active={editor.isActive('heading', { level: 2 })} onMouseDown={() => editor.chain().focus().toggleHeading({ level: 2 }).run()} title="Heading 2"><span className="text-xs font-bold">H2</span></ToolbarBtn>
      <ToolbarBtn active={editor.isActive('heading', { level: 3 })} onMouseDown={() => editor.chain().focus().toggleHeading({ level: 3 }).run()} title="Heading 3"><span className="text-xs font-bold">H3</span></ToolbarBtn>
      <div className="w-px h-4 bg-gray-300 mx-1" />
      <ToolbarBtn active={editor.isActive('bulletList')} onMouseDown={() => editor.chain().focus().toggleBulletList().run()} title="Bullet list">
        <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 6h13M8 12h13M8 18h13M3 6h.01M3 12h.01M3 18h.01" /></svg>
      </ToolbarBtn>
      <ToolbarBtn active={editor.isActive('orderedList')} onMouseDown={() => editor.chain().focus().toggleOrderedList().run()} title="Numbered list">
        <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 6h16M4 10h16M4 14h16M4 18h16" /></svg>
      </ToolbarBtn>
    </div>
  );
}

// ── Main component ─────────────────────────────────────────────────────────────
export default function Step6TitleDescription() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const store = useListingStore();

  const [titleLoading, setTitleLoading] = useState(false);
  const [titleError, setTitleError] = useState<string | null>(null);
  const [showReasoning, setShowReasoning] = useState(false);
  const [descLoading, setDescLoading] = useState(false);

  const charCount = store.itemTitle.length;
  const overLimit = charCount > 80;
  const nearLimit = charCount >= 75;

  // ── TipTap editor ────────────────────────────────────────────────────────────
  const editor = useEditor({
    extensions: [StarterKit, Markdown],
    content: store.itemDescription || store.descriptionSuggestion || '',
    editorProps: { attributes: { class: 'focus:outline-none' } },
    onUpdate: ({ editor }) => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const md = (editor.storage as any).markdown.getMarkdown() as string;
      store.setItemDescription(md);
    },
  });

  // Auto-generate title on mount
  useEffect(() => {
    if (!store.itemTitle && !titleLoading) handleGenerateTitle();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Auto-generate description on mount
  useEffect(() => {
    if (!store.descriptionSuggestion && !descLoading) void handleGenerateDesc(true);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Load description suggestion into editor when it arrives
  useEffect(() => {
    if (!editor || !store.descriptionSuggestion) return;
    if (!store.itemDescription || store.itemDescription === store.descriptionSuggestion) {
      editor.commands.setContent(store.descriptionSuggestion);
      store.setItemDescription(store.descriptionSuggestion);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [store.descriptionSuggestion, editor]);

  async function handleGenerateTitle() {
    if (!id) return;
    setTitleLoading(true);
    setTitleError(null);
    try {
      const { title } = await generateTitle(id);
      store.setTitleSuggestion(title);
      if (!store.itemTitle) store.setItemTitle(title);
    } catch (err: unknown) {
      const msg = (err as { response?: { data?: { detail?: string } }; message?: string })
        ?.response?.data?.detail || (err as Error)?.message || 'Generation failed';
      setTitleError(msg);
    } finally {
      setTitleLoading(false);
    }
  }

  async function handleGenerateDesc(initial = false) {
    if (!id) return;
    setDescLoading(true);
    try {
      const { description } = await generateDescription(id);
      store.setDescriptionSuggestion(description);
      if (!initial && editor) {
        editor.commands.setContent(description);
        store.setItemDescription(description);
      }
    } catch {
      // user can still type
    } finally {
      setDescLoading(false);
    }
  }

  const canProceed = !!store.itemTitle && !overLimit && !!store.itemDescription;
  useStepAction('Next: Photos →', !canProceed, handleNext);

  async function handleNext() {
    if (!id || !canProceed) return;
    await updateListing(id, { itemTitle: store.itemTitle, itemDescription: store.itemDescription });
    store.setCurrentStep(7);
    navigate(`/listing/${id}/step/7`);
  }

  return (
    <div className="space-y-8 max-w-2xl">
      <div>
        <h2 className="text-2xl font-bold text-gray-900">Title & Description</h2>
        <p className="text-gray-500 mt-1">AI has generated both based on your item — edit freely.</p>
      </div>

      {/* ── Title ── */}
      <div className="space-y-3">
        <div className="flex items-center justify-between">
          <label className="text-sm font-semibold text-gray-700">Listing title</label>
          <span className="text-xs text-gray-400">eBay max: 80 characters</span>
        </div>

        <div className="relative">
          <input
            type="text"
            value={store.itemTitle}
            onChange={(e) => store.setItemTitle(e.target.value.slice(0, 80))}
            placeholder={titleLoading ? 'AI is generating a title…' : 'Enter a title…'}
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

        {titleError && (
          <p className="text-xs text-red-500 bg-red-50 border border-red-200 rounded-lg px-3 py-2">
            Could not generate title: {titleError}. You can type your own.
          </p>
        )}

        <div className="flex items-center gap-3 flex-wrap">
          <button onClick={handleGenerateTitle} disabled={titleLoading}
            className="inline-flex items-center gap-1.5 text-sm text-blue-600 hover:underline disabled:text-gray-400">
            {titleLoading
              ? <span className="inline-block w-3.5 h-3.5 border-2 border-blue-400 border-t-transparent rounded-full animate-spin" />
              : <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" /></svg>
            }
            Regenerate title
          </button>

          {store.titleSuggestion && store.titleSuggestion !== store.itemTitle && (
            <button onClick={() => store.setItemTitle(store.titleSuggestion)}
              className="text-sm text-gray-500 hover:text-gray-700">
              Restore suggestion
            </button>
          )}

          <button onClick={() => setShowReasoning((v) => !v)}
            className="text-sm text-gray-400 hover:text-gray-600 flex items-center gap-1 ml-auto">
            <svg className={clsx('w-3.5 h-3.5 transition-transform', showReasoning && 'rotate-90')} fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
            </svg>
            Why this title?
          </button>
        </div>

        {showReasoning && (
          <div className="bg-blue-50 border border-blue-100 rounded-lg p-4 text-sm text-blue-800">
            <p className="font-medium mb-1">How this title was generated</p>
            <p className="text-blue-700">AI used your item identification, condition, color, and special notes — combined with your past listing style — to write a keyword-rich title optimized for eBay search.</p>
          </div>
        )}
      </div>

      <hr className="border-gray-200" />

      {/* ── Description ── */}
      <div className="space-y-3">
        <div className="flex items-center justify-between">
          <label className="text-sm font-semibold text-gray-700">Listing description</label>
          <div className="flex items-center gap-3">
            <button onClick={() => void handleGenerateDesc()} disabled={descLoading}
              className="inline-flex items-center gap-1.5 text-sm text-blue-600 hover:underline disabled:text-gray-400">
              {descLoading
                ? <span className="inline-block w-3.5 h-3.5 border-2 border-blue-400 border-t-transparent rounded-full animate-spin" />
                : <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" /></svg>
              }
              {descLoading ? 'Generating…' : 'Regenerate'}
            </button>
            <button onClick={() => { editor?.commands.clearContent(); store.setItemDescription(''); store.setDescriptionSuggestion(''); editor?.commands.focus(); }}
              className="text-sm text-gray-500 hover:text-gray-700">
              Write my own
            </button>
          </div>
        </div>

        <div className="border border-gray-300 rounded-xl overflow-hidden focus-within:ring-2 focus-within:ring-blue-500 focus-within:border-transparent bg-white">
          <EditorToolbar editor={editor} />
          {descLoading && !store.descriptionSuggestion ? (
            <div className="px-4 py-4 space-y-2 animate-pulse">
              {[100, 90, 85, 75, 80, 60].map((w, i) => (
                <div key={i} className="h-3.5 bg-gray-200 rounded" style={{ width: `${w}%` }} />
              ))}
            </div>
          ) : (
            <EditorContent editor={editor} />
          )}
        </div>

        {store.itemDescription && (
          <p className="text-xs text-gray-400">
            {store.itemDescription.trim().split(/\s+/).length} words
          </p>
        )}
      </div>
    </div>
  );
}
