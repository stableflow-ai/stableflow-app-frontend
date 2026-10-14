import { create } from "zustand/index";

export type WalletType = "near" | "sol" | "evm" | "tron" | "aptos" | "ton" | "sui" | "btc" | "zcash";

interface WalletsState {
  near: {
    account: string | null;
    wallet: any;
    connect: () => void;
    disconnect: () => void;
    walletIcon: string | null;
    walletName: string | null;
  };
  sol: {
    account: string | null;
    wallet: any;
    connect: () => void;
    disconnect: () => void;
    walletIcon: string | null;
    walletName: string | null;
  };
  evm: {
    account: string | null;
    wallet: any;
    chainId: number | null;
    connect: () => void;
    disconnect: () => void;
    walletIcon: string | null;
    walletName: string | null;
  };
  tron: {
    account: string | null;
    wallet: any;
    connect: () => void;
    disconnect: () => void;
    walletIcon: string | null;
    walletName: string | null;
  };
  aptos: {
    account: string | null;
    wallet: any;
    connect: () => void;
    disconnect: () => void;
    walletIcon: string | null;
    walletName: string | null;
  };
  ton: {
    account: string | null;
    wallet: any;
    connect: () => void;
    disconnect: () => void;
    walletIcon: string | null;
    walletName: string | null;
  };
  sui: {
    account: string | null;
    wallet: any;
    connect: () => void;
    disconnect: () => void;
    walletIcon: string | null;
    walletName: string | null;
  };
  btc: {
    account: string | null;
    wallet: any;
    connect: () => void;
    disconnect: () => void;
    walletIcon: string | null;
    walletName: string | null;
  };
  zcash: {
    account: string | null;
    wallet: any;
    connect: () => void;
    disconnect: () => void;
    walletIcon: string | null;
    walletName: string | null;
  };
  set: (params: any) => void;
}

const useWalletsStore = create<WalletsState>((set) => ({
  near: {
    account: null,
    wallet: null,
    connect: () => { },
    disconnect: () => { },
    walletIcon: null,
    walletName: null,
  },
  sol: {
    account: null,
    wallet: null,
    connect: () => { },
    disconnect: () => { },
    walletIcon: null,
    walletName: null,
  },
  evm: {
    account: null,
    wallet: null,
    chainId: null,
    connect: () => { },
    disconnect: () => { },
    walletIcon: null,
    walletName: null,
  },
  tron: {
    account: null,
    wallet: null,
    connect: () => { },
    disconnect: () => { },
    walletIcon: null,
    walletName: null,
  },
  aptos: {
    account: null,
    wallet: null,
    connect: () => { },
    disconnect: () => { },
    walletIcon: null,
    walletName: null,
  },
  ton: {
    account: null,
    wallet: null,
    chainId: null,
    connect: () => {},
    disconnect: () => {},
    walletIcon: null,
    walletName: null
  },
  sui: {
    account: null,
    wallet: null,
    chainId: null,
    connect: () => { },
    disconnect: () => { },
    walletIcon: null,
    walletName: null
  },
  btc: {
    account: null,
    wallet: null,
    connect: () => { },
    disconnect: () => { },
    walletIcon: null,
    walletName: null,
  },
  zcash: {
    account: null,
    wallet: null,
    connect: () => { },
    disconnect: () => { },
    walletIcon: null,
    walletName: null,
  },
  set: (params) => set(() => ({ ...params }))
}));

export default useWalletsStore;
