import { useState, useRef, useEffect } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { UserButton, useUser } from '@clerk/clerk-react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { getSettings, updateSettings, getMe, clearStyleMemory, importHistory, getEbayStatus, getEbayAuthUrl, disconnectEbay, updateEbayPolicies } from '../lib/api';

export default function SettingsPage() {
  const { user } = useUser();
  const qc = useQueryClient();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [searchParams, setSearchParams] = useSearchParams();

  const [showClearConfirm, setShowClearConfirm] = useState(false);
  const [importStatus, setImportStatus] = useState<string | null>(null);
  const [ebayConnecting, setEbayConnecting] = useState(false);
  const [ebayFeedback, setEbayFeedback] = useState<{ type: 'success' | 'error'; message: string } | null>(null);
  const [policyFields, setPolicyFields] = useState({ fulfillment: '', returns: '', payment: '' });
  const [policySaved, setPolicySaved] = useState(false);

  const { data: settings } = useQuery({ queryKey: ['settings'], queryFn: getSettings });
  const { data: me } = useQuery({ queryKey: ['me'], queryFn: getMe });
  const { data: ebayStatus, refetch: refetchEbay } = useQuery({
    queryKey: ['ebay-status'],
    queryFn: getEbayStatus,
  });

  // Sync saved policy IDs into local fields when ebayStatus loads
  useEffect(() => {
    if (ebayStatus) {
      setPolicyFields({
        fulfillment: ebayStatus.fulfillmentPolicyId ?? '',
        returns: ebayStatus.returnPolicyId ?? '',
        payment: ebayStatus.paymentPolicyId ?? '',
      });
    }
  }, [ebayStatus]);

  const disconnectMut = useMutation({
    mutationFn: disconnectEbay,
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['ebay-status'] });
      setEbayFeedback({ type: 'success', message: 'eBay account disconnected.' });
    },
  });

  // Handle redirect back from eBay OAuth callback
  useEffect(() => {
    const ebayParam = searchParams.get('ebay');
    if (ebayParam === 'connected') {
      setEbayFeedback({ type: 'success', message: '✓ eBay account connected! You can now publish listings.' });
      refetchEbay();
      setSearchParams({}, { replace: true });
    } else if (ebayParam === 'error') {
      const msg = searchParams.get('message') ?? 'Connection failed. Please try again.';
      setEbayFeedback({ type: 'error', message: msg });
      setSearchParams({}, { replace: true });
    }
  }, []);

  async function handleConnectEbay() {
    setEbayConnecting(true);
    setEbayFeedback(null);
    try {
      const { url } = await getEbayAuthUrl();
      // Redirect current page — eBay will send them back to /settings?ebay=connected
      window.location.href = url;
    } catch {
      setEbayFeedback({ type: 'error', message: 'Could not get eBay authorization URL. Check that EBAY_RUNAME is set in Railway.' });
      setEbayConnecting(false);
    }
  }

  const savePoliciesMut = useMutation({
    mutationFn: () => updateEbayPolicies({
      ebayFulfillmentPolicyId: policyFields.fulfillment || null,
      ebayReturnPolicyId: policyFields.returns || null,
      ebayPaymentPolicyId: policyFields.payment || null,
    }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['ebay-status'] });
      setPolicySaved(true);
      setTimeout(() => setPolicySaved(false), 3000);
    },
  });

  const updateMut = useMutation({
    mutationFn: updateSettings,
    onSuccess: () => qc.invalidateQueries({ queryKey: ['settings'] }),
  });

  const clearMut = useMutation({
    mutationFn: clearStyleMemory,
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['me'] });
      setShowClearConfirm(false);
    },
  });

  async function handleImportCsv(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    setImportStatus('Importing…');
    try {
      const result = await importHistory(file);
      setImportStatus(`Imported ${result.imported} listings`);
      qc.invalidateQueries({ queryKey: ['me'] });
    } catch {
      setImportStatus('Import failed — check CSV format');
    }
    if (fileInputRef.current) fileInputRef.current.value = '';
  }

  function toggle(key: string, value: boolean) {
    updateMut.mutate({ [key]: value });
  }

  return (
    <div className="min-h-screen bg-gray-50">
      <header className="bg-white border-b border-gray-200">
        <div className="max-w-4xl mx-auto px-6 flex items-center justify-between h-14">
          <Link to="/dashboard">
            <img src="/logo.png" alt="ListSamurAI" className="h-8 w-auto" />
          </Link>
          <div className="flex items-center gap-3">
            <span className="text-gray-500 text-sm">Settings</span>
            <UserButton afterSignOutUrl="/sign-in" />
          </div>
        </div>
      </header>

      <div className="max-w-2xl mx-auto px-6 py-10 space-y-8">
        <h1 className="text-2xl font-bold text-gray-900">Settings</h1>

        {/* eBay Connection */}
        <section className="bg-white border border-gray-200 rounded-xl p-6 space-y-4">
          <h2 className="font-semibold text-gray-800 text-lg">eBay connection</h2>

          {ebayFeedback && (
            <div className={`rounded-lg px-4 py-3 text-sm ${
              ebayFeedback.type === 'success'
                ? 'bg-green-50 border border-green-200 text-green-700'
                : 'bg-red-50 border border-red-200 text-red-700'
            }`}>
              {ebayFeedback.message}
            </div>
          )}

          {ebayStatus?.connected ? (
            <div className="space-y-4">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm font-medium text-gray-700">eBay account connected</p>
                  <p className="text-xs text-gray-400 mt-0.5">
                    Token auto-refreshes · expires {ebayStatus.tokenExpiry
                      ? new Date(ebayStatus.tokenExpiry).toLocaleDateString()
                      : 'unknown'}
                  </p>
                </div>
                <div className="flex items-center gap-3">
                  <span className="px-2.5 py-1 bg-green-100 text-green-700 text-xs font-medium rounded-full">Connected</span>
                  <button
                    onClick={() => disconnectMut.mutate()}
                    disabled={disconnectMut.isPending}
                    className="text-xs text-gray-400 hover:text-red-500 transition-colors"
                  >
                    Disconnect
                  </button>
                </div>
              </div>

              {/* Business Policy IDs */}
              <div className="border-t border-gray-100 pt-4 space-y-3">
                <div>
                  <p className="text-sm font-medium text-gray-700">Business Policy IDs</p>
                  <p className="text-xs text-gray-400 mt-0.5">
                    Required if your eBay account uses Business Policies.{' '}
                    <a href="https://www.ebay.com/sbr/sellerHub/account/business-policies" target="_blank" rel="noopener noreferrer" className="text-blue-500 hover:underline">
                      Find your IDs in Seller Hub →
                    </a>
                  </p>
                </div>
                <div className="grid grid-cols-1 gap-2">
                  {[
                    { label: 'Shipping / Fulfillment Policy ID', key: 'fulfillment' as const },
                    { label: 'Returns Policy ID', key: 'returns' as const },
                    { label: 'Payment Policy ID (optional)', key: 'payment' as const },
                  ].map(({ label, key }) => (
                    <div key={key}>
                      <label className="block text-xs text-gray-500 mb-1">{label}</label>
                      <input
                        type="text"
                        value={policyFields[key]}
                        onChange={(e) => setPolicyFields((p) => ({ ...p, [key]: e.target.value }))}
                        placeholder="e.g. 12345678"
                        className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-blue-500 font-mono"
                      />
                    </div>
                  ))}
                </div>
                <div className="flex items-center gap-3">
                  <button
                    onClick={() => savePoliciesMut.mutate()}
                    disabled={savePoliciesMut.isPending}
                    className="px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white text-sm font-semibold rounded-lg transition-colors disabled:opacity-60"
                  >
                    {savePoliciesMut.isPending ? 'Saving…' : 'Save Policy IDs'}
                  </button>
                  {policySaved && <span className="text-sm text-green-600">✓ Saved</span>}
                </div>
              </div>
            </div>
          ) : (
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm font-medium text-gray-700">Connect your eBay seller account</p>
                <p className="text-xs text-gray-400 mt-0.5">Required to publish listings. Tokens refresh automatically.</p>
              </div>
              <button
                onClick={handleConnectEbay}
                disabled={ebayConnecting}
                className="px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white text-sm font-semibold rounded-lg transition-colors disabled:opacity-60 flex items-center gap-2"
              >
                {ebayConnecting ? (
                  <>
                    <span className="w-3.5 h-3.5 border-2 border-white border-t-transparent rounded-full animate-spin" />
                    Redirecting…
                  </>
                ) : (
                  'Connect eBay Account'
                )}
              </button>
            </div>
          )}
        </section>

        {/* Listing defaults */}
        <section className="bg-white border border-gray-200 rounded-xl p-6 space-y-5">
          <h2 className="font-semibold text-gray-800 text-lg">Listing defaults</h2>

          <ToggleRow
            label="Auto-fill AI suggested price"
            description="Pre-fill the price field with the AI's suggested price"
            checked={settings?.autoFillSuggestedPrice ?? false}
            onChange={(v) => toggle('autoFillSuggestedPrice', v)}
          />

          <ToggleRow
            label="Auto-fill AI suggested shipping"
            description="Pre-fill shipping service and cost with AI recommendations"
            checked={settings?.autoFillShipping ?? false}
            onChange={(v) => toggle('autoFillShipping', v)}
          />

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Default listing type</label>
            <select
              value={settings?.defaultListingType ?? 'BUY_IT_NOW'}
              onChange={(e) => updateMut.mutate({ defaultListingType: e.target.value })}
              className="border border-gray-300 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-blue-500 bg-white"
            >
              <option value="BUY_IT_NOW">Buy it now</option>
              <option value="AUCTION">Auction</option>
            </select>
          </div>

          {settings?.defaultListingType === 'AUCTION' && (
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Default auction duration</label>
              <select
                value={settings?.defaultAuctionDuration ?? 7}
                onChange={(e) => updateMut.mutate({ defaultAuctionDuration: parseInt(e.target.value) })}
                className="border border-gray-300 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-blue-500 bg-white"
              >
                {[1, 3, 5, 7, 10].map((d) => <option key={d} value={d}>{d} days</option>)}
              </select>
            </div>
          )}
        </section>

        {/* Style memory */}
        <section className="bg-white border border-gray-200 rounded-xl p-6 space-y-5">
          <h2 className="font-semibold text-gray-800 text-lg">Style memory</h2>
          <p className="text-sm text-gray-600">
            ListSamurai has learned from <strong>{me?.memoryCount ?? 0}</strong> of your past listings.
          </p>

          <div className="space-y-3">
            <div>
              <button
                onClick={() => fileInputRef.current?.click()}
                className="px-4 py-2 border border-gray-300 rounded-lg text-sm font-medium text-gray-700 hover:bg-gray-50 transition-colors"
              >
                Import past listing titles and descriptions
              </button>
              <input ref={fileInputRef} type="file" accept=".csv" className="hidden" onChange={handleImportCsv} />
              <p className="text-xs text-gray-400 mt-1">CSV with columns: title, description, category (max 500 rows)</p>
              {importStatus && <p className="text-sm text-blue-600 mt-1">{importStatus}</p>}
            </div>

            <div>
              <button
                onClick={() => setShowClearConfirm(true)}
                className="px-4 py-2 border border-red-300 rounded-lg text-sm font-medium text-red-600 hover:bg-red-50 transition-colors"
              >
                Clear my style memory
              </button>
            </div>
          </div>
        </section>

        {/* Account */}
        <section className="bg-white border border-gray-200 rounded-xl p-6 space-y-4">
          <h2 className="font-semibold text-gray-800 text-lg">Account</h2>
          <div>
            <p className="text-xs text-gray-500 uppercase tracking-wide font-medium mb-1">Email</p>
            <p className="text-sm text-gray-800">{user?.primaryEmailAddress?.emailAddress ?? '—'}</p>
          </div>
          <div>
            <button
              disabled
              className="px-4 py-2 border border-gray-300 rounded-lg text-sm font-medium text-gray-400 cursor-not-allowed"
              title="Coming soon"
            >
              Manage subscription
            </button>
            <p className="text-xs text-gray-400 mt-1">Billing coming soon</p>
          </div>
        </section>
      </div>

      {/* Clear confirm modal */}
      {showClearConfirm && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
          <div className="bg-white rounded-2xl p-8 max-w-md w-full mx-4 space-y-4">
            <h3 className="text-xl font-bold text-gray-900">Clear style memory?</h3>
            <p className="text-gray-600 text-sm">
              This will delete all your saved title and description examples. This cannot be undone.
            </p>
            <div className="flex gap-3 pt-2">
              <button
                onClick={() => clearMut.mutate()}
                disabled={clearMut.isPending}
                className="flex-1 py-2.5 bg-red-600 hover:bg-red-700 text-white font-semibold rounded-lg transition-colors disabled:opacity-60"
              >
                {clearMut.isPending ? 'Clearing…' : 'Yes, clear all'}
              </button>
              <button
                onClick={() => setShowClearConfirm(false)}
                className="flex-1 py-2.5 border border-gray-300 text-gray-700 rounded-lg hover:bg-gray-50"
              >
                Cancel
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function ToggleRow({ label, description, checked, onChange }: {
  label: string; description: string; checked: boolean; onChange: (v: boolean) => void;
}) {
  return (
    <div className="flex items-center justify-between gap-4">
      <div>
        <p className="text-sm font-medium text-gray-800">{label}</p>
        <p className="text-xs text-gray-500 mt-0.5">{description}</p>
      </div>
      <button
        onClick={() => onChange(!checked)}
        className={`relative inline-flex h-6 w-11 flex-shrink-0 items-center rounded-full transition-colors ${checked ? 'bg-blue-600' : 'bg-gray-300'}`}
      >
        <span className={`inline-block h-4 w-4 transform rounded-full bg-white transition-transform shadow ${checked ? 'translate-x-6' : 'translate-x-1'}`} />
      </button>
    </div>
  );
}
