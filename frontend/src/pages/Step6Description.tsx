import { useEffect, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { useListingStore } from '../store/listingStore';
import { generateDescription, updateListing } from '../lib/api';
import { useStepAction } from '../hooks/useStepAction';
import { useEditor, EditorContent } from '@tiptap/react';
import StarterKit from '@tiptap/starter-kit';
import { Markdown } from 'tiptap-markdown';
import clsx from 'clsx';

// ── Toolbar ──────────────────────────────────────────────────────────────────
function ToolbarBtn({
  active, onMouseDown, title, children,
}: { active: boolean; onMouseDown: () => void; title: string; children: React.ReactNode }) {
  return (
    <button
      type="button"
      title={title}
      onMouseDown={(e) => { e.preventDefault(); onMouseDown(); }}
      className={clsx(
        'w-7 h-7 flex items-center justify-center rounded text-sm transition-colors',
        active ? 'bg-blue-100 text-blue-700 font-semibold' : 'text-gray-500 hover:bg-gray-100 hover:text-gray-800',
      )}
    >
      {children}
    </button>
  );
}

function EditorToolbar({ editor }: { editor: ReturnType<typeof useEditor> }) {
  if (!editor) return null;
  return (
    <div className="flex items-center gap-0.5 px-3 py-1.5 border-b border-gray-200 bg-gray-50 rounded-t-xl flex-wrap">
      <ToolbarBtn active={editor.isActive('bold')} onMouseDown={() => editor.chain().focus().toggleBold().run()} title="Bold (Ctrl+B)">
        <strong>B</strong>
      </ToolbarBtn>
      <ToolbarBtn active={editor.isActive('italic')} onMouseDown={() => editor.chain().focus().toggleItalic().run()} title="Italic (Ctrl+I)">
        <em>I</em>
      </ToolbarBtn>
      <div className="w-px h-4 bg-gray-300 mx-1" />
      <ToolbarBtn active={editor.isActive('heading', { level: 2 })} onMouseDown={() => editor.chain().focus().toggleHeading({ level: 2 }).run()} title="Heading 2">
        <span className="text-xs font-bold">H2</span>
      </ToolbarBtn>
      <ToolbarBtn active={editor.isActive('heading', { level: 3 })} onMouseDown={() => editor.chain().focus().toggleHeading({ level: 3 }).run()} title="Heading 3">
        <span className="text-xs font-bold">H3</span>
      </ToolbarBtn>
      <div className="w-px h-4 bg-gray-300 mx-1" />
      <ToolbarBtn active={editor.isActive('bulletList')} onMouseDown={() => editor.chain().focus().toggleBulletList().run()} title="Bullet list">
        <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 6h13M8 12h13M8 18h13M3 6h.01M3 12h.01M3 18h.01" />
        </svg>
      </ToolbarBtn>
      <ToolbarBtn active={editor.isActive('orderedList')} onMouseDown={() => editor.chain().focus().toggleOrderedList().run()} title="Numbered list">
        <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 6h16M4 10h16M4 14h16M4 18h16" />
        </svg>
      </ToolbarBtn>
    </div>
  );
}

// ── Main component ────────────────────────────────────────────────────────────
export default function Step6Description() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const store = useListingStore();
  const [loading, setLoading] = useState(false);

  // TipTap editor — Markdown extension handles parsing and serialising markdown
  const editor = useEditor({
    extensions: [
      StarterKit,
      Markdown,
    ],
    content: store.itemDescription || store.descriptionSuggestion || '',
    editorProps: {
      attributes: { class: 'focus:outline-none' },
    },
    onUpdate: ({ editor }) => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const markdown = (editor.storage as any).markdown.getMarkdown() as string;
      store.setItemDescription(markdown);
    },
  });

  // Auto-generate on mount if no suggestion yet
  useEffect(() => {
    if (!store.descriptionSuggestion && !loading) {
      void handleGenerate(true);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Whenever a suggestion arrives, load it into the editor
  useEffect(() => {
    if (!editor || !store.descriptionSuggestion) return;
    // Only auto-fill if the user hasn't typed anything custom yet
    if (!store.itemDescription || store.itemDescription === store.descriptionSuggestion) {
      editor.commands.setContent(store.descriptionSuggestion);
      store.setItemDescription(store.descriptionSuggestion);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [store.descriptionSuggestion, editor]);

  async function handleGenerate(initial = false) {
    if (!id) return;
    setLoading(true);
    try {
      const { description } = await generateDescription(id);
      store.setDescriptionSuggestion(description);
      // Always replace editor content on explicit regenerate (not initial load)
      if (!initial && editor) {
        editor.commands.setContent(description);
        store.setItemDescription(description);
      }
    } catch {
      // ignore — user can still type
    } finally {
      setLoading(false);
    }
  }

  function handleWriteOwn() {
    editor?.commands.clearContent();
    store.setItemDescription('');
    store.setDescriptionSuggestion('');
    editor?.commands.focus();
  }

  useStepAction('Next: Shipping \u2192', !store.itemDescription, handleNext);

  async function handleNext() {
    if (!id || !store.itemDescription) return;
    await updateListing(id, { itemDescription: store.itemDescription });
    store.setCurrentStep(7);
    navigate(`/listing/${id}/step/7`);
  }

  return (
    <div className="space-y-6 max-w-2xl">
      <div>
        <h2 className="text-2xl font-bold text-gray-900">Listing description</h2>
        <p className="text-gray-500 mt-1">Your past writing style has been applied. Edit freely.</p>
      </div>

      {/* Action row */}
      <div className="flex items-center justify-between">
        <button
          onClick={() => void handleGenerate()}
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
          {loading ? 'Generating…' : 'Regenerate with AI'}
        </button>

        <button
          onClick={handleWriteOwn}
          className="text-sm text-gray-500 hover:text-gray-700"
        >
          Write my own
        </button>
      </div>

      {/* Rich-text editor */}
      <div className="border border-gray-300 rounded-xl overflow-hidden focus-within:ring-2 focus-within:ring-blue-500 focus-within:border-transparent bg-white">
        <EditorToolbar editor={editor} />

        {loading && !store.descriptionSuggestion ? (
          /* Skeleton while first generation loads */
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
  );
}
