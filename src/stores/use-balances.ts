import { create } from "zustand/index";
import { createJSONStorage, persist } from "zustand/middleware";

export interface BalancesState {
  evmBalances: any;
  solBalances: any;
  nearBalances: any;
  tronBalances: any;
  aptosBalances: any;
  suiBalances: any;
  tonBalances: any;
  btcBalances: any;
  zcashBalances: any;
  set: (params: any) => void;
}

export const useBalancesStore = create(
  persist<BalancesState>(
    (set) => ({
      evmBalances: {},
      solBalances: {},
      nearBalances: {},
      tronBalances: {},
      aptosBalances: {},
      suiBalances: {},
      tonBalances: {},
      btcBalances: {},
      zcashBalances: {},
      set: (params) => set(() => ({ ...params }))
    }),
    {
      name: "_balances",
      version: 0.1,
      storage: createJSONStorage(() => sessionStorage)
    }
  )
);

export default useBalancesStore;
