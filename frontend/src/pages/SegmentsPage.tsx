export default function SegmentsPage() {
  return (
    <div className="p-8 max-w-5xl">
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-gray-900">Custom Segments</h1>
        <p className="text-gray-500 mt-1">Group buyers by behavior and target them with tailored offers.</p>
      </div>

      <div className="bg-white border border-gray-200 rounded-xl p-16 text-center">
        <div className="w-12 h-12 bg-gray-100 rounded-full flex items-center justify-center mx-auto mb-4">
          <svg className="w-6 h-6 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0z" />
          </svg>
        </div>
        <h3 className="text-base font-semibold text-gray-700 mb-1">No segments created</h3>
        <p className="text-sm text-gray-400 mb-6 max-w-xs mx-auto">
          Create smart buyer segments based on purchase history, location, and watch activity to send targeted offers.
        </p>
        <span className="inline-flex items-center gap-1.5 text-xs font-medium text-blue-600 bg-blue-50 border border-blue-200 rounded-full px-3 py-1">
          Coming soon
        </span>
      </div>
    </div>
  );
}
