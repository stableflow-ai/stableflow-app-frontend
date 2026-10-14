import { create } from "zustand";
import { createJSONStorage, persist } from "zustand/middleware";
import type { TokenChain } from "@/all-tokens/chains";

interface RheaTokensState {
  tokens: TokenChain[];
  fetchedAt: number;
  loading: boolean;
  set: (params: Partial<Omit<RheaTokensState, "set">>) => void;
}

export const useRheaTokensStore = create(
  persist<RheaTokensState>(
    (set) => ({
      tokens: [],
      fetchedAt: 0,
      loading: false,
      set: (params) =>
        set((state) => ({
          ...state,
          ...params,
        })),
    }),
    {
      name: "_rhea_tokens",
      version: 1,
      storage: createJSONStorage(() => localStorage),
      partialize: (state) =>
        ({
          tokens: state.tokens,
          fetchedAt: state.fetchedAt,
        }) as unknown as RheaTokensState,
    }
  )
);

export default useRheaTokensStore;
