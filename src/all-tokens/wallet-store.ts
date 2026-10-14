import { create } from "zustand/index";
import { createJSONStorage, persist } from "zustand/middleware";
import useSharedWalletStore from "@/stores/use-wallet";

interface WalletState {
  showWallet: boolean;
  showTokenSelect: boolean;
  usdtExpand: boolean;
  evmExpand: boolean;
  selectedToken: string;
  fromToken: any;
  toToken: any;
  isTo: boolean;
  evmBalancesLoading: boolean;
  set: (params: any) => void;
}

const useWalletStore = create<WalletState>()(
  persist(
    (set) => ({
      showWallet: false,
      showTokenSelect: false,
      usdtExpand: true,
      evmExpand: true,
      selectedToken: "",
      fromToken: null,
      toToken: null,
      isTo: false,
      evmBalancesLoading: false,
      set: (params) => {
        set(() => ({ ...params }));
        if (params && Object.prototype.hasOwnProperty.call(params, "showWallet")) {
          useSharedWalletStore.getState().set({ showWallet: params.showWallet });
        }
      },
    }),
    {
      name: "_all_tokens_wallet",
      version: 0.2,
      storage: createJSONStorage(() => localStorage),
      partialize: (state) => ({
        usdtExpand: state.usdtExpand,
        evmExpand: state.evmExpand,
        showWallet: state.showWallet,
      }),
    }
  )
);

export default useWalletStore;
