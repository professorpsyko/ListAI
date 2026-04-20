export default function OffersPage() {
  return (
    <div className="p-8 max-w-5xl">
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-gray-900">Offers</h1>
        <p className="text-gray-500 mt-1">Send and manage offers to interested buyers.</p>
      </div>

      <div className="bg-white border border-gray-200 rounded-xl p-16 text-center">
        <div className="w-12 h-12 bg-gray-100 rounded-full flex items-center justify-center mx-auto mb-4">
          <svg className="w-6 h-6 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M7 7h.01M7 3h5c.512 0 1.024.195 1.414.586l7 7a2 2 0 010 2.828l-7 7a2 2 0 01-2.828 0l-7-7A1.994 1.994 0 013 12V7a4 4 0 014-4z" />
          </svg>
        </div>
        <h3 className="text-base font-semibold text-gray-700 mb-1">No offers yet</h3>
        <p className="text-sm text-gray-400 mb-6 max-w-xs mx-auto">
          Send bulk offers to watchers and manage counter-offers. They'll appear here once available.
        </p>
        <span className="inline-flex items-center gap-1.5 text-xs font-medium text-blue-600 bg-blue-50 border border-blue-200 rounded-full px-3 py-1">
          Coming soon
        </span>
      </div>
    </div>
  );
}
