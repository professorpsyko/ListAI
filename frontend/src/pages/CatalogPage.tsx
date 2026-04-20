export default function CatalogPage() {
  return (
    <div className="p-8 max-w-5xl">
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-gray-900">Item Catalog</h1>
        <p className="text-gray-500 mt-1">A searchable library of all items you've ever listed.</p>
      </div>

      <div className="bg-white border border-gray-200 rounded-xl p-16 text-center">
        <div className="w-12 h-12 bg-gray-100 rounded-full flex items-center justify-center mx-auto mb-4">
          <svg className="w-6 h-6 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M4 6h16M4 10h16M4 14h16M4 18h16" />
          </svg>
        </div>
        <h3 className="text-base font-semibold text-gray-700 mb-1">Your catalog is empty</h3>
        <p className="text-sm text-gray-400 mb-6 max-w-xs mx-auto">
          Every item you list will be saved here so you can relist, duplicate, or track pricing over time.
        </p>
        <span className="inline-flex items-center gap-1.5 text-xs font-medium text-blue-600 bg-blue-50 border border-blue-200 rounded-full px-3 py-1">
          Coming soon
        </span>
      </div>
    </div>
  );
}
