import { useEffect } from 'react';
import { Routes, Route, Navigate } from 'react-router-dom';
import { SignIn, SignUp, useAuth, useUser } from '@clerk/clerk-react';
import { syncEmail, registerTokenGetter } from './lib/api';

import WizardLayout from './components/WizardLayout';
import Step1Photos from './pages/Step1Photos';
import Step2Identify from './pages/Step2Identify';
import Step3Aspects from './pages/Step3Aspects';
import Step4Details from './pages/Step3Details';
import Step5Pricing from './pages/Step4Pricing';
import Step6Title from './pages/Step5Title';
import Step7Description from './pages/Step6Description';
import Step8Shipping from './pages/Step7Shipping';
import Step9Preview from './pages/Step8Preview';
import SettingsPage from './pages/SettingsPage';
import DashboardPage from './pages/DashboardPage';

function AuthSync() {
  const { isSignedIn, getToken } = useAuth();
  const { user } = useUser();

  // Register token getter so axios interceptor can attach Bearer tokens
  useEffect(() => {
    registerTokenGetter(() => getToken());
  }, [getToken]);

  useEffect(() => {
    if (isSignedIn && user?.primaryEmailAddress?.emailAddress) {
      syncEmail(user.primaryEmailAddress.emailAddress).catch(() => {});
    }
  }, [isSignedIn, user]);

  return null;
}

function RequireAuth({ children }: { children: React.ReactNode }) {
  const { isSignedIn, isLoaded } = useAuth();
  if (!isLoaded) return <div className="flex items-center justify-center h-screen text-gray-500">Loading…</div>;
  if (!isSignedIn) return <Navigate to="/sign-in" replace />;
  return <>{children}</>;
}

export default function App() {
  return (
    <>
      <AuthSync />
      <Routes>
        <Route path="/sign-in/*" element={
          <div className="min-h-screen bg-gray-50 flex flex-col items-center justify-center">
            <div className="mb-6 text-2xl font-bold tracking-tight">
              <span className="text-gray-900">ListSamur</span><span className="text-blue-500">ai</span>
            </div>
            <SignIn routing="path" path="/sign-in" />
          </div>
        } />
        <Route path="/sign-up/*" element={
          <div className="min-h-screen bg-gray-50 flex flex-col items-center justify-center">
            <div className="mb-6 text-2xl font-bold tracking-tight">
              <span className="text-gray-900">ListSamur</span><span className="text-blue-500">ai</span>
            </div>
            <SignUp routing="path" path="/sign-up" />
          </div>
        } />

        <Route path="/" element={<RequireAuth><Navigate to="/dashboard" replace /></RequireAuth>} />

        <Route path="/dashboard" element={<RequireAuth><DashboardPage /></RequireAuth>} />
        <Route path="/settings" element={<RequireAuth><SettingsPage /></RequireAuth>} />

        <Route path="/listing/:id" element={<RequireAuth><WizardLayout /></RequireAuth>}>
          <Route path="step/1" element={<Step1Photos />} />
          <Route path="step/2" element={<Step2Identify />} />
          <Route path="step/3" element={<Step3Aspects />} />
          <Route path="step/4" element={<Step4Details />} />
          <Route path="step/5" element={<Step5Pricing />} />
          <Route path="step/6" element={<Step6Title />} />
          <Route path="step/7" element={<Step7Description />} />
          <Route path="step/8" element={<Step8Shipping />} />
          <Route path="step/9" element={<Step9Preview />} />
          <Route index element={<Navigate to="step/1" replace />} />
        </Route>

        <Route path="*" element={<Navigate to="/dashboard" replace />} />
      </Routes>
    </>
  );
}
