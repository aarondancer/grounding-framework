import { configureStore, createSlice, type PayloadAction } from "@reduxjs/toolkit";
import type { TypedUseSelectorHook } from "react-redux";
import { useDispatch, useSelector } from "react-redux";

/**
 * Explorer app state (Redux Toolkit). One store per router instance — on SSR
 * that means per request (getRouter runs per request), so scratch state can
 * never leak across requests. The browser store is created once at hydration.
 *
 * `simulatedContext` is the persistent-context simulator (spec/10): a JSON
 * object the caller context should be evaluated under for gate simulation and
 * the playgrounds. It persists to localStorage on the client — it is a local
 * scratchpad, never sent on ordinary requests unless a playground/gate query
 * explicitly includes it.
 */
export type SimContext = Record<string, unknown>;

const STORAGE_KEY = "grounding.explorer.simulatedContext";

const simulatedContextSlice = createSlice({
  name: "simulatedContext",
  initialState: { values: {} as SimContext },
  reducers: {
    setValue(state, action: PayloadAction<{ key: string; value: unknown }>) {
      state.values[action.payload.key] = action.payload.value;
    },
    removeValue(state, action: PayloadAction<string>) {
      delete state.values[action.payload];
    },
    clearValues(state) {
      state.values = {};
    },
    replaceValues(state, action: PayloadAction<SimContext>) {
      state.values = action.payload;
    },
  },
});

export const simulatedContext = simulatedContextSlice.actions;

function readStoredContext(): SimContext {
  if (typeof window === "undefined") return {};
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return {};
    const parsed: unknown = JSON.parse(raw);
    return parsed && typeof parsed === "object" && !Array.isArray(parsed)
      ? (parsed as SimContext)
      : {};
  } catch {
    return {};
  }
}

export function createAppStore() {
  const store = configureStore({
    reducer: { simulatedContext: simulatedContextSlice.reducer },
  });
  if (typeof window !== "undefined") {
    store.subscribe(() => {
      try {
        window.localStorage.setItem(
          STORAGE_KEY,
          JSON.stringify(store.getState().simulatedContext.values),
        );
      } catch {
        // localStorage unavailable — context simply doesn't persist
      }
    });
  }
  return store;
}

/**
 * Restore the persisted simulated context after mount. Done in an effect —
 * never in `preloadedState` — so SSR output matches the client's first
 * render (React hydration would mismatch if the store started non-empty).
 */
export function hydrateStoredContext(store: AppStore) {
  store.dispatch(simulatedContext.replaceValues(readStoredContext()));
}

export type AppStore = ReturnType<typeof createAppStore>;
export type AppState = ReturnType<AppStore["getState"]>;
export type AppDispatch = AppStore["dispatch"];

export const useAppDispatch: () => AppDispatch = useDispatch;
export const useAppSelector: TypedUseSelectorHook<AppState> = useSelector;
