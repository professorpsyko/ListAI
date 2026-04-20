import { useParams, useNavigate } from 'react-router-dom';
import clsx from 'clsx';

type Tab = 'active' | 'drafts' | 'scheduled' | 'ended';

const TABS: { id: Tab; label: string; description: string }[] = [
  { id: 'active',    label: 'Active',    description: 'Listings currently live on eBay' },
  { id: 'drafts',    label: 'Drafts',    description: 'Listings in progress, not yet published' },
  { id: 'scheduled', label: 'Scheduled', description: 'Listings queued to go live at a future time' },
  { id: 'ended',     label: 'Ended',     description: 'Listings that have expired or sold' },
];

export default function ListingsPage() {
  const { tab = 'active' } = useParams<{ tab: Tab }>();
  const navigate = useNavigate();
  const current = TABS.find((t) => t.id === tab) ?? TABS[0];

  return (
    <div className="p-8 max-w-5xl">
      {/* Header */}
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-gray-900">Listings</h1>
        <p className="text-gray-500 mt-1">Manage all your eBay listings in one place.</p>
      </div>

      {/* Tab bar */}
      <div className="flex items-center gap-1 mb-8 bg-white border border-gray-200 rounded-xl p-1 w-fit">
        {TABS.map((t) => (
          <button
            key={t.id}
            onClick={() => navigate(`/listings/${t.id}`)}
            className={clsx(
              'px-4 py-2 rounded-lg text-sm font-medium transition-colors',
              tab === t.id
                ? 'bg-blue-600 text-white shadow-sm'
                : 'text-gray-500 hover:text-gray-700 hover:bg-gray-50',
            )}
          >
            {t.label}
          </button>
        ))}
      </div>

      {/* Empty state */}
      <div className="bg-white border border-gray-200 rounded-xl p-16 text-center">
        <div className="w-12 h-12 bg-gray-100 rounded-full flex items-center justify-center mx-auto mb-4">
          {tab === 'active' && (
            <svg className="w-6 h-6 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
            </svg>
          )}
          {tab === 'drafts' && (
            <svg className="w-6 h-6 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" />
            </svg>
          )}
          {tab === 'scheduled' && (
            <svg className="w-6 h-6 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" />
            </svg>
          )}
          {tab === 'ended' && (
            <svg className="w-6 h-6 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M10 14l2-2m0 0l2-2m-2 2l-2-2m2 2l2 2m7-2a9 9 0 11-18 0 9 9 0 0118 0z" />
            </svg>
          )}
        </div>
        <h3 className="text-base font-semibold text-gray-700 mb-1">No {current.label.toLowerCase()} listings</h3>
        <p className="text-sm text-gray-400 mb-6 max-w-xs mx-auto">{current.description}. They'll appear here once available.</p>
        <span className="inline-flex items-center gap-1.5 text-xs font-medium text-blue-600 bg-blue-50 border border-blue-200 rounded-full px-3 py-1">
          Coming soon
        </span>
      </div>
    </div>
  );
}
