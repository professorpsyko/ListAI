import { Outlet, useNavigate, useParams } from 'react-router-dom';
import { UserButton } from '@clerk/clerk-react';
import { Link } from 'react-router-dom';
import { useListingStore } from '../store/listingStore';
import { useJobPolling } from '../hooks/useJobPolling';
import clsx from 'clsx';

const STEPS = [
  { n: 1, label: 'Photos' },
  { n: 2, label: 'Identify' },
  { n: 3, label: 'Details' },
  { n: 4, label: 'Price' },
  { n: 5, label: 'Title' },
  { n: 6, label: 'Description' },
  { n: 7, label: 'Shipping' },
  { n: 8, label: 'Preview' },
];

// Which fields mark a step as complete
function isStepComplete(step: number, s: ReturnType<typeof useListingStore.getState>): boolean {
  switch (step) {
    case 1: return !!s.labelPhotoUrl && s.itemPhotoUrls.length >= 2;
    case 2: return !!s.identification?.identification;
    case 3: return !!s.condition;
    case 4: return !!s.finalPrice;
    case 5: return !!s.itemTitle;
    case 6: return !!s.itemDescription;
    case 7: return !!s.shippingService;
    default: return false;
  }
}

export default function WizardLayout() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const store = useListingStore();
  const currentStep = store.currentStep;
  const imageJobStatus = store.imageJobStatus;

  // Background polling — runs continuously while in wizard
  useJobPolling(id ?? null);

  function goToStep(n: number) {
    // Warn if required fields incomplete for steps before target
    for (let s = 1; s < n; s++) {
      if (!isStepComplete(s, store)) {
        // Allow jumping but show we're aware; actual validation is at publish
        break;
      }
    }
    store.setCurrentStep(n);
    navigate(`/listing/${id}/step/${n}`);
  }

  return (
    <div className="min-h-screen flex flex-col bg-gray-50">
      {/* Top nav */}
      <header className="bg-white border-b border-gray-200 sticky top-0 z-10">
        <div className="max-w-6xl mx-auto px-6 flex items-center justify-between h-14">
          <Link to="/dashboard" className="font-bold text-lg tracking-tight">
            <span className="text-gray-900">ListSamur</span><span className="text-blue-500">ai</span>
          </Link>

          {/* Step progress */}
          <nav className="flex items-center gap-1">
            {STEPS.map((step, idx) => {
              const done = isStepComplete(step.n, store);
              const active = currentStep === step.n;
              const incomplete = !done && step.n < currentStep;

              return (
                <div key={step.n} className="flex items-center">
                  <button
                    onClick={() => goToStep(step.n)}
                    className={clsx(
                      'flex items-center gap-1.5 px-3 py-1.5 rounded-full text-sm font-medium transition-colors',
                      active && 'bg-blue-600 text-white',
                      !active && done && 'text-green-700 hover:bg-green-50',
                      !active && !done && 'text-gray-500 hover:bg-gray-100',
                      incomplete && 'text-amber-600',
                    )}
                  >
                    {done && !active ? (
                      <svg className="w-3.5 h-3.5" fill="currentColor" viewBox="0 0 20 20">
                        <path fillRule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clipRule="evenodd" />
                      </svg>
                    ) : incomplete ? (
                      <svg className="w-3.5 h-3.5" fill="currentColor" viewBox="0 0 20 20">
                        <path fillRule="evenodd" d="M8.257 3.099c.765-1.36 2.722-1.36 3.486 0l5.58 9.92c.75 1.334-.213 2.98-1.742 2.98H4.42c-1.53 0-2.493-1.646-1.743-2.98l5.58-9.92zM11 13a1 1 0 11-2 0 1 1 0 012 0zm-1-8a1 1 0 00-1 1v3a1 1 0 002 0V6a1 1 0 00-1-1z" clipRule="evenodd" />
                      </svg>
                    ) : (
                      <span className={clsx('text-xs', active ? 'text-white' : 'text-gray-400')}>{step.n}</span>
                    )}
                    {step.label}
                  </button>
                  {idx < STEPS.length - 1 && (
                    <svg className="w-3 h-3 text-gray-300 mx-0.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
                    </svg>
                  )}
                </div>
              );
            })}
          </nav>

          <div className="flex items-center gap-3">
            {/* Photo processing indicator */}
            {imageJobStatus === 'QUEUED' || imageJobStatus === 'PROCESSING' ? (
              <span className="text-xs text-blue-600 flex items-center gap-1">
                <span className="inline-block w-2 h-2 rounded-full bg-blue-500 animate-pulse" />
                Processing photos…
              </span>
            ) : imageJobStatus === 'COMPLETE' ? (
              <span className="text-xs text-green-600 flex items-center gap-1">
                <svg className="w-3.5 h-3.5" fill="currentColor" viewBox="0 0 20 20">
                  <path fillRule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clipRule="evenodd" />
                </svg>
                Photos ready
              </span>
            ) : null}
            <Link to="/settings" className="text-gray-500 hover:text-gray-700" title="Settings">
              <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z" />
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
              </svg>
            </Link>
            <UserButton afterSignOutUrl="/sign-in" />
          </div>
        </div>
      </header>

      <main className="flex-1 max-w-4xl w-full mx-auto px-6 py-8">
        <Outlet />
      </main>
    </div>
  );
}
