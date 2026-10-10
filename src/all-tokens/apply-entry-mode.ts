import { useAllTokensStore } from "@/all-tokens/store";
import { useHistoryStore } from "@/stores/use-history";

const MODE_PARAM = "mode";

export type EntryMode = "all" | "stable";

type HydratedStore = {
  persist: {
    hasHydrated: () => boolean;
    onFinishHydration: (fn: () => void) => () => void;
  };
};

function whenHydrated(store: HydratedStore, onReady: () => void) {
  if (store.persist.hasHydrated()) {
    onReady();
    return () => {};
  }

  let settled = false;
  const finish = () => {
    if (settled) return;
    settled = true;
    onReady();
  };
  const unsubscribe = store.persist.onFinishHydration(() => finish());
  if (store.persist.hasHydrated()) {
    unsubscribe();
    finish();
  }
  return () => {
    settled = true;
    unsubscribe();
  };
}

export function readEntryMode(search: string): EntryMode | null {
  const mode = new URLSearchParams(search).get(MODE_PARAM);
  if (mode === "all" || mode === "stable") return mode;
  return null;
}

export function applyEntryMode(mode: EntryMode) {
  const enabled = mode === "all";
  useAllTokensStore.getState().setEnabled(enabled);
  useHistoryStore.getState().activate(enabled ? "allTokens" : "stablecoin");
}

export function searchWithoutEntryMode(search: string) {
  const params = new URLSearchParams(search.startsWith("?") ? search.slice(1) : search);
  params.delete(MODE_PARAM);
  const next = params.toString();
  return next ? `?${next}` : "";
}

export function subscribeEntryMode(onReady: () => void) {
  let pending = 2;
  let cancelled = false;
  const done = () => {
    pending -= 1;
    if (pending > 0 || cancelled) return;
    onReady();
  };
  const stopAllTokens = whenHydrated(useAllTokensStore, done);
  const stopHistory = whenHydrated(useHistoryStore, done);
  return () => {
    cancelled = true;
    stopAllTokens();
    stopHistory();
  };
}
