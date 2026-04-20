import { Outlet, useNavigate, useParams } from 'react-router-dom';
import { UserButton, useUser } from '@clerk/clerk-react';
import { Link } from 'react-router-dom';
import { useState } from 'react';
import { useListingStore } from '../store/listingStore';
import { useJobPolling } from '../hooks/useJobPolling';
import DevPanel from './DevPanel';
import { StepActionContext, type StepActionConfig } from '../contexts/StepActionContext';
import clsx from 'clsx';

const DEV_EMAIL = 'benjamin.marshall95@gmail.com';

const STEPS = [
  { n: 1, label: 'Photos' },
  { n: 2, label: 'Identify' },
  { n: 3, label: 'Aspects' },
  { n: 4, label: 'Details' },
  { n: 5, label: 'Price' },
  { n: 6, label: 'Title' },
  { n: 7, label: 'Description' },
  { n: 8, label: 'Shipping' },
  { n: 9, label: 'Photos' },
  { n: 10, label: 'Preview' },
];

// Which fields mark a step as complete
function isStepComplete(step: number, s: ReturnType<typeof useListingStore.getState>): boolean {
  switch (step) {
    case 1: return !!s.labelPhotoUrl && s.itemPhotoUrls.length >= 2;
    case 2: return !!s.identification?.identification;
    case 3: return s.aspectsConfirmed;
    case 4: return !!s.condition;
    case 5: return !!s.finalPrice;
    case 6: return !!s.itemTitle;
    case 7: return !!s.itemDescription;
    case 8: return !!s.shippingService;
    case 9: return s.itemPhotoUrls.length >= 1 || s.processedPhotoUrls.length >= 1;
    default: return false;
  }
}

export default function WizardLayout() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const store = useListingStore();
  const { user } = useUser();
  const currentStep = store.currentStep;
  const isDevUser = user?.primaryEmailAddress?.emailAddress === DEV_EMAIL;
  const [stepAction, setStepAction] = useState<StepActionConfig | null>(null);

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
    <StepActionContext.Provider value={{ setAction: setStepAction }}>
    <div className="min-h-screen flex flex-col bg-gray-50">
      {/* Top nav */}
      <header className="bg-white border-b border-gray-200 sticky top-0 z-10">
        <div className="max-w-6xl mx-auto px-6 flex items-center justify-between h-14">
          <Link to="/dashboard" className="font-bold text-lg tracking-tight">
            <span className="text-gray-900">ListSamur</span><span className="text-blue-500">ai</span>
          </Link>

          {/* Step progress — compact: only active step shows label */}
          <nav className="flex items-center gap-0.5">
            {STEPS.map((step, idx) => {
              const done = isStepComplete(step.n, store);
              const active = currentStep === step.n;

              return (
                <div key={step.n} className="flex items-center">
                  <button
                    onClick={() => goToStep(step.n)}
                    title={step.label}
                    className={clsx(
                      'flex items-center gap-1 rounded-full font-medium transition-colors',
                      active
                        ? 'bg-blue-600 text-white px-3 py-1 text-sm'
                        : 'w-7 h-7 justify-center text-xs hover:bg-gray-100',
                      !active && done && 'text-green-600',
                      !active && !done && 'text-gray-400',
                    )}
                  >
                    {done && !active ? (
                      <svg className="w-3.5 h-3.5" fill="currentColor" viewBox="0 0 20 20">
                        <path fillRule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clipRule="evenodd" />
                      </svg>
                    ) : (
                      <span>{active ? `${step.n}  ${step.label}` : step.n}</span>
                    )}
                  </button>
                  {idx < STEPS.length - 1 && (
                    <svg className="w-2.5 h-2.5 text-gray-200 mx-0.5 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
                    </svg>
                  )}
                </div>
              );
            })}
          </nav>

          <div className="flex items-center gap-3">
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

      {/* Step action bar — sticky below header, populated by each step */}
      {stepAction && (
        <div className="sticky top-14 z-10 bg-white border-b border-gray-100 shadow-sm">
          <div className="max-w-4xl mx-auto px-6 py-2.5 flex justify-end">
            <button
              onClick={stepAction.onClick}
              disabled={stepAction.disabled}
              className={clsx(
                'px-6 py-2 rounded-lg font-semibold text-sm transition-colors',
                stepAction.disabled
                  ? 'bg-gray-200 text-gray-400 cursor-not-allowed'
                  : stepAction.activeClassName ?? 'bg-blue-600 hover:bg-blue-700 text-white',
              )}
            >
              {stepAction.label}
            </button>
          </div>
        </div>
      )}

      <main className="flex-1 max-w-4xl w-full mx-auto px-6 py-8">
        <Outlet />
      </main>

      {isDevUser && <DevPanel />}
    </div>
    </StepActionContext.Provider>
  );
}
