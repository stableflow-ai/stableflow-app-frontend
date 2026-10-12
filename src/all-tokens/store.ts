import { create } from "zustand";
import { createJSONStorage, persist } from "zustand/middleware";

type AllTokensState = {
  guideDismissed: boolean;
  dismissGuide: () => void;
};

type PersistedAllTokensState = Pick<AllTokensState, "guideDismissed">;

export const useAllTokensStore = create<AllTokensState>()(
  persist<AllTokensState, [], [], PersistedAllTokensState>(
    (set) => ({
      guideDismissed: false,
      dismissGuide: () => set({ guideDismissed: true }),
    }),
    {
      name: "stableflow.allTokens",
      version: 2,
      storage: createJSONStorage(() => localStorage),
      partialize: (state) => ({ guideDismissed: state.guideDismissed }),
      migrate: (persisted) => {
        const state = persisted as { guideDismissed?: boolean } | undefined;
        return { guideDismissed: Boolean(state?.guideDismissed) };
      },
    }
  )
);
