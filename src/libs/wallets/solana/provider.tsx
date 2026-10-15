import React, { useEffect, useMemo, useRef, useState } from "react";
import {
  ConnectionProvider,
  WalletProvider
} from "@solana/wallet-adapter-react";
import { WalletDisconnectedError } from "@solana/wallet-adapter-base";
import {
  PhantomWalletAdapter,
  SolflareWalletAdapter,
  // WalletConnectWalletAdapter
} from "@solana/wallet-adapter-wallets";
import SolanaWallet from "@/libs/wallets/solana/wallet";
import useWalletsStore from "@/stores/use-wallets";
import { useWallet } from "@solana/wallet-adapter-react";
import type { Wallet } from "@solana/wallet-adapter-react";
import { createContext, useCallback, useContext } from "react";
import useBalancesStore from "@/stores/use-balances";
import useIsMobile from "@/hooks/use-is-mobile";
import { useDebounceFn } from "ahooks";
import { OKXSolanaProvider } from "@okxconnect/solana-provider";
import { PublicKey, Transaction } from "@solana/web3.js";
import { OKX_ICON, useWatchOKXConnect } from "../okxconnect";
import { useWalletSelector } from "../hooks/use-wallet-selector";
import WalletSelector, { type WalletSelectorItem } from "../components/wallet-selector";
import { getChainRpcUrl } from "@/config/chains";
import { getAvailableSolanaRpcUrl, getSolanaConnectionConfig } from "../utils/solana";

const SolanaWalletModalContext = createContext<{
  visible: boolean;
  setVisible: (open: boolean) => void;
}>({
  visible: false,
  setVisible: () => {},
});

function useSolanaWalletModal() {
  return useContext(SolanaWalletModalContext);
}

function SolanaWalletSelectorProvider({
  children,
  walletOrder,
}: {
  children: React.ReactNode;
  walletOrder: string[];
}) {
  const [visible, setVisible] = useState(false);
  const close = useCallback(() => setVisible(false), []);

  return (
    <SolanaWalletModalContext.Provider value={{ visible, setVisible }}>
      {children}
      <SolanaWalletModal open={visible} walletOrder={walletOrder} onClose={close} />
    </SolanaWalletModalContext.Provider>
  );
}

function SolanaWalletModal({
  open,
  walletOrder,
  onClose,
}: {
  open: boolean;
  walletOrder: string[];
  onClose: () => void;
}) {
  const { wallets, select } = useWallet();

  const { selectorWallets, walletByKey } = useMemo(() => {
    const installed: Wallet[] = [];
    const notInstalled: Wallet[] = [];
    for (const wallet of wallets) {
      if (wallet.readyState === "Installed") installed.push(wallet);
      else notInstalled.push(wallet);
    }
    const sortWallets = (walletList: Wallet[]) => {
      return [...walletList].sort((a, b) => {
        const aIndex = walletOrder.indexOf(a.adapter.name);
        const bIndex = walletOrder.indexOf(b.adapter.name);
        if (aIndex !== -1 && bIndex !== -1) return aIndex - bIndex;
        if (aIndex !== -1) return -1;
        if (bIndex !== -1) return 1;
        return 0;
      });
    };
    const sorted = [...sortWallets(installed), ...sortWallets(notInstalled)];
    const byKey = new Map<string, Wallet>();
    const items: WalletSelectorItem[] = sorted.map((wallet) => {
      byKey.set(wallet.adapter.name, wallet);
      return {
        key: wallet.adapter.name,
        name: wallet.adapter.name,
        icon: wallet.adapter.icon,
        url: wallet.adapter.url,
        detected: wallet.readyState === "Installed",
      };
    });
    return { selectorWallets: items, walletByKey: byKey };
  }, [wallets, walletOrder]);

  return (
    <WalletSelector
      open={open}
      onClose={onClose}
      title="Select Solana Wallet"
      wallets={selectorWallets}
      onConnect={(key) => {
        const wallet = walletByKey.get(key);
        if (!wallet) return;
        select(wallet.adapter.name);
      }}
    />
  );
}

export const adapters = [
  new SolflareWalletAdapter(),
  new PhantomWalletAdapter(),
  // new WalletConnectWalletAdapter({
  //   // @ts-ignore
  //   network: "mainnet-beta",
  //   options: {
  //     projectId: import.meta.env.VITE_RAINBOW_PROJECT_ID,
  //     metadata: {
  //       name: "StableFlow.ai",
  //       description: "",
  //       url: "https://demo.stableflow.ai",
  //       icons: []
  //     }
  //   }
  // })
];

export default function SolanaProvider({
  children
}: {
  children: React.ReactNode;
}) {
  // Wallet order configuration: Solflare first, Phantom second
  const walletOrder = ["Solflare", "Phantom"];
  const initialRpcUrl = getChainRpcUrl("Solana").rpcUrls[0];
  const [endpoint, setEndpoint] = useState(initialRpcUrl);
  const [endpointConfig, setEndpointConfig] = useState<any>(getSolanaConnectionConfig(initialRpcUrl));

  useEffect(() => {
    let mounted = true;
    const resolveEndpoint = async () => {
      try {
        const availableRpcUrl = await getAvailableSolanaRpcUrl();
        if (mounted) {
          setEndpoint(availableRpcUrl);
          setEndpointConfig(getSolanaConnectionConfig(availableRpcUrl));
        }
      } catch (_error) {
        // keep default primary rpc url
      }
    };

    resolveEndpoint();
    return () => {
      mounted = false;
    };
  }, []);

  return (
    <ConnectionProvider endpoint={endpoint} config={endpointConfig}>
      <WalletProvider
        wallets={adapters}
        autoConnect={false}
        onError={(error) => {
          if (error instanceof WalletDisconnectedError) return;
          console.error(error);
        }}
      >
        <SolanaWalletSelectorProvider walletOrder={walletOrder}>
          {children}<DeviceDetector />
        </SolanaWalletSelectorProvider>
      </WalletProvider>
    </ConnectionProvider>
  );
}

const DeviceDetector = (props: any) => {
  const { } = props;

  const isMobile = useIsMobile();
  const { wallets } = useWallet();

  const installedWallets = useMemo(() => {
    return wallets.filter((wallet) => wallet.readyState === "Installed");
  }, [wallets]);

  const isOKXSDK = useMemo(() => {
    return installedWallets?.length <= 0 && isMobile;
  }, [isMobile, installedWallets]);

  return isOKXSDK ? (
    <MobileContent />
  ) : (
    <Content />
  );
};

const Content = () => {
  const [mounted, setMounted] = useState(false);
  const setWallets = useWalletsStore((state) => state.set);
  const walletAdapter = useWallet();
  const { publicKey, disconnect, connect, wallet } = walletAdapter;
  const { setVisible } = useSolanaWalletModal();
  const setBalancesStore = useBalancesStore((state) => state.set);
  const previousPublicKeyRef = useRef<string | null | undefined>(undefined);

  useEffect(() => {
    const nextPublicKey = publicKey?.toString() ?? null;
    const previousPublicKey = previousPublicKeyRef.current;
    previousPublicKeyRef.current = nextPublicKey;
    if (previousPublicKey === undefined || previousPublicKey === nextPublicKey) return;
    setBalancesStore({ solBalances: {} });
  }, [publicKey, setBalancesStore]);

  const { run: connect2SolanaWallets } = useDebounceFn(() => {
    if (!mounted) return;
    const solanaWallet = new SolanaWallet({
      publicKey,
      signer: walletAdapter,
    });
    setWallets({
      sol: {
        account: publicKey?.toString() || null,
        wallet: solanaWallet,
        walletIcon: wallet?.adapter.icon,
        walletName: wallet?.adapter.name,
        connect: () => {
          if (wallet) {
            connect();
          } else {
            setVisible?.(true);
          }
        },
        disconnect: () => {
          disconnect();
          setBalancesStore({
            solBalances: {}
          });
          setWallets({
            sol: {
              account: null,
              wallet: null,
              connect: () => { },
              disconnect: () => { }
            }
          });
        }
      }
    });
  }, { wait: 500 });

  useEffect(() => {
    connect2SolanaWallets();
  }, [publicKey, mounted]);

  const { run: connectDelay } = useDebounceFn(() => {
    if (!wallet || wallet.readyState === "NotDetected") {
      return;
    }
    connect();
  }, { wait: 500 });

  useEffect(() => {
    connectDelay();
  }, [wallet]);

  useEffect(() => {
    setMounted(true);
  }, []);

  return null;
};

const mobileWalletOptions = [
  { key: "okx", name: "OKX Wallet", icon: OKX_ICON },
];

const MobileContent = () => {
  const setWallets = useWalletsStore((state) => state.set);
  const okxConnectRef = useRef<any>(null);

  const setBalancesStore = useBalancesStore((state) => state.set);
  const previousAccountRef = useRef<string | null | undefined>(undefined);
  const mobileWalletByKey = useMemo(() => {
    return new Map(mobileWalletOptions.map((wallet) => [wallet.key, wallet]));
  }, []);

  const {
    open,
    onClose,
    onOpen,
    onConnect,
    isConnecting,
  } = useWalletSelector({
    connect: async (key: string) => {
      const wallet = mobileWalletByKey.get(key);
      if (wallet?.key === "okx") {
        await okxConnectRef.current?.connect();
      }
    },
  });

  useWatchOKXConnect((okxConnect: any) => {
    okxConnectRef.current = okxConnect;
    const { okxUniversalProvider, disconnect, icon } = okxConnect;
    const provider = new OKXSolanaProvider(okxUniversalProvider);
    const account = provider.getAccount()?.address || null;
    const previousAccount = previousAccountRef.current;
    previousAccountRef.current = account;
    if (previousAccount !== undefined && previousAccount !== account) {
      setBalancesStore({ solBalances: {} });
    }
    const solanaWallet = new SolanaWallet({
      publicKey: account ? new PublicKey(account) : null,
      signer: {
        ...provider,
        publicKey: account ? new PublicKey(account) : null,
        signTransaction: (transaction: Transaction) => {
          return provider.signTransaction(transaction, "solana:5eykt4UsFv8P8NJdTREpY1vzqKqZKvdp");
        },
      },
    });

    setWallets({
      sol: {
        account,
        wallet: solanaWallet,
        walletIcon: icon,
        walletName: "OKX Wallet",
        connect: () => onOpen(),
        disconnect,
      }
    });
  });

  return (
    <WalletSelector
      open={open}
      onClose={onClose}
      onConnect={onConnect}
      isConnecting={isConnecting}
      wallets={mobileWalletOptions}
      title="Select Solana Wallet"
    />
  );
};
