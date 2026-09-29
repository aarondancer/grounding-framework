import { useCallback } from "react";
import { type SimContext, simulatedContext, useAppDispatch, useAppSelector } from "./store";

/**
 * Persistent context simulator (spec/10), backed by the Redux store — the
 * caller builds a simulated context once; it survives navigation and feeds
 * gate simulation and the playgrounds. Persisted to localStorage — a
 * client-side scratchpad, not server state.
 */
export function useSimulatedContext() {
  const context = useAppSelector((s) => s.simulatedContext.values);
  const dispatch = useAppDispatch();
  const set = useCallback(
    (key: string, value: unknown) => dispatch(simulatedContext.setValue({ key, value })),
    [dispatch],
  );
  const remove = useCallback(
    (key: string) => dispatch(simulatedContext.removeValue(key)),
    [dispatch],
  );
  const clear = useCallback(() => dispatch(simulatedContext.clearValues()), [dispatch]);
  return { context, set, remove, clear };
}

export type { SimContext };
