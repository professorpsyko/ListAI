import { createContext, useContext } from 'react';

export interface StepActionConfig {
  label: React.ReactNode;
  onClick: () => void;
  disabled?: boolean;
  /** Override active button classes (e.g. different color for publish) */
  activeClassName?: string;
}

interface StepActionContextValue {
  setAction: (config: StepActionConfig | null) => void;
}

export const StepActionContext = createContext<StepActionContextValue>({ setAction: () => {} });

export function useStepActionContext() {
  return useContext(StepActionContext);
}
