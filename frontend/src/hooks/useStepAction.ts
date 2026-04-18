import { useEffect, useRef } from 'react';
import { useStepActionContext } from '../contexts/StepActionContext';

/**
 * Registers the primary action button for the current step.
 * Renders in the sticky bar just below the top header.
 *
 * Uses a ref for the handler so the effect only re-runs when label/disabled
 * changes — not on every render — avoiding stale closure issues.
 */
export function useStepAction(
  label: React.ReactNode,
  disabled: boolean,
  handler: () => void | Promise<void>,
  activeClassName?: string,
) {
  const { setAction } = useStepActionContext();
  const handlerRef = useRef(handler);
  handlerRef.current = handler; // always points to the latest version

  useEffect(() => {
    setAction({
      label,
      onClick: () => void handlerRef.current(),
      disabled,
      activeClassName,
    });
    return () => setAction(null);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [label, disabled, activeClassName, setAction]);
}
