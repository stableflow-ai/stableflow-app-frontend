import useWalletsStore from "@/stores/use-wallets";
import { useEffect, useMemo, useRef, useState } from "react";
import TronWallet from "./wallet";
import WalletSelector from "../components/wallet-selector";
import { useConfigStore } from "@/stores/use-config";
import useBalancesStore from "@/stores/use-balances";
import { OKXTronProvider } from "@okxconnect/universal-provider";
import useIsMobile from "@/hooks/use-is-mobile";
import { TronWeb } from "tronweb";
import { OKX_ICON, useWatchOKXConnect } from "../okxconnect";
import { OkxWalletAdapter, TronLinkAdapter, WalletConnectAdapter, TrustAdapter, TokenPocketAdapter } from "@tronweb3/tronwallet-adapters";
import { useWalletSelector } from "../hooks/use-wallet-selector";
import { getChainRpcUrl } from "@/config/chains";
import { metadata } from "../rainbow/metadata";
import { csl } from "@/utils/log";
import { createSignedTronWeb } from "./signed-tronweb";
import { isInMobileBrowser, isInOKApp, isInTrustWallet } from "../utils/device";
import { supportsNativeTrustTron, type InjectedTronWalletName } from "./deeplinks";
import { useInjectedTron } from "./use-injected-tron";

const tronWeb = new TronWeb({
  fullHost: getChainRpcUrl("Tron").rpcUrl,
  headers: {},
  privateKey: "",
});

const projectId = import.meta.env.VITE_RAINBOW_PROJECT_ID as string;

const wallets = [
  // Disable the adapters' built-in deeplink/redirect behavior on mobile; we
  // control deeplinks ourselves and rely on injected providers inside the
  // wallet's in-app browser. This prevents the "reopen page" redirect loop.
  new TronLinkAdapter({ openAppWithDeeplink: true, openUrlWhenWalletNotFound: false }),
  new OkxWalletAdapter(),
  new TrustAdapter({ openAppWithDeeplink: true, openUrlWhenWalletNotFound: false }),
  new TokenPocketAdapter({ openAppWithDeeplink: true, openUrlWhenWalletNotFound: false }),
  new WalletConnectAdapter({
    network: "Mainnet",
    options: {
      metadata,
      projectId,
    },
    web3ModalConfig: {
      termsOfServiceUrl: "https://app.stableflow.ai/terms-of-service",
      privacyPolicyUrl: "https://app.stableflow.ai/privacy-policy",
      themeVariables: {
        "--wcm-z-index": "210",
      },
    },
  }),
];

function resolveInjectedAdapter(injectedName: InjectedTronWalletName | null) {
  if (!injectedName) {
    return null;
  }

  if (injectedName === "Trust" && !supportsNativeTrustTron()) {
    return wallets.find((wallet) => wallet.name === "TronLink") || null;
  }

  return wallets.find((wallet) => wallet.name === injectedName) || null;
}

function resolveWalletBrand(adapter: any) {
  if (adapter && isInTrustWallet() && adapter.name === "TronLink") {
    const trustAdapter = wallets.find((wallet) => wallet.name === "Trust");
    return {
      walletName: trustAdapter?.name || "Trust",
      walletIcon: trustAdapter?.icon || adapter.icon,
    };
  }

  return {
    walletName: adapter?.name,
    walletIcon: adapter?.icon,
  };
}

function resolveWalletDisplay(wallet: any) {
  if (isInTrustWallet() && !supportsNativeTrustTron() && wallet.name === "TronLink") {
    const trustAdapter = wallets.find((item) => item.name === "Trust");
    return {
      name: trustAdapter?.name || "Trust",
      icon: trustAdapter?.icon || wallet.icon,
    };
  }

  return {
    name: wallet.name,
    icon: wallet.icon,
  };
}

export default function TronProvider({
  children
}: {
  children: React.ReactNode;
}) {
  const isMobile = useIsMobile();
  const { hasInjected, injectedName } = useInjectedTron();

  const isOKXSDK = useMemo(() => {
    if (!isMobile) {
      return false;
    }
    if (isInOKApp()) {
      return false;
    }
    if (hasInjected) {
      return false;
    }
    return true;
  }, [isMobile, hasInjected]);

  const detectTokenPocket = () => {
    // Only detect TokenPocket in-app browser (UA contains 'tokenpocket'), do not detect desktop TokenPocket extension
    const ua = window?.navigator?.userAgent?.toLowerCase?.();
    const isTokenPocketApp = ua?.indexOf?.("tokenpocket") > -1;

    if (window && isTokenPocketApp) {
      window.location.replace("https://tron.stableflow.ai");
    }
  };

  useEffect(() => {
    detectTokenPocket();
  }, []);

  return (
    <>
      {children}
      {isOKXSDK ? (
        <MobileWallet />
      ) : (
        <Content autoConnectInjected={isMobile} injectedName={injectedName} />
      )}
    </>
  );
}

const Content = ({
  autoConnectInjected = false,
  injectedName = null,
}: {
  autoConnectInjected?: boolean;
  injectedName?: InjectedTronWalletName | null;
}) => {
  const setWallets = useWalletsStore((state) => state.set);
  const [adapter, setAdapter] = useState<any>(null);
  const configStore = useConfigStore();
  const setBalancesStore = useBalancesStore((state) => state.set);
  const walletRef = useRef<TronWallet | null>(null);
  const autoConnectedRef = useRef(false);

  const selectorWallets = useMemo(() => {
    if (supportsNativeTrustTron()) {
      return wallets;
    }
    return wallets.filter((wallet) => wallet.name !== "Trust");
  }, [injectedName]);

  // Wallet selector
  const {
    open,
    onClose,
    onOpen,
    onConnect,
    isConnecting,
  } = useWalletSelector({
    connect: async (wallet: any) => {
      await wallet.connect(wallet);
      setAdapter(wallet);
    },
  });

  useEffect(() => {
    // Restore previously saved adapter (only exists if user hasn't actively disconnected)
    if (configStore.tronWalletAdapter) {
      const savedAdapter = wallets.find((wallet) => wallet.name === configStore.tronWalletAdapter);
      if (savedAdapter) {
        setAdapter(savedAdapter);
      }
      return;
    }

    if (!autoConnectInjected || !isInMobileBrowser()) {
      return;
    }

    if (autoConnectedRef.current) {
      return;
    }

    const injectedAdapter = resolveInjectedAdapter(injectedName);
    if (!injectedAdapter) {
      return;
    }

    autoConnectedRef.current = true;
    setAdapter(injectedAdapter);
    injectedAdapter.connect().catch((error) => {
      console.error("Tron injected wallet auto connect failed:", error);
    });
  }, [autoConnectInjected, injectedName]);

  const setWindowWallet = (address?: string) => {
    const _address = address || adapter?.address;
    const _tronWeb = createSignedTronWeb();
    _address && _tronWeb.setAddress(_address);
    walletRef.current = new TronWallet({
      signAndSendTransaction: async (transaction: any) => {
        if (!adapter) {
          return "";
        }
        const signedTx = await adapter.signTransaction(transaction);
        return _tronWeb.trx.sendRawTransaction(signedTx);
      },
      address: _address,
    });
  };

  useEffect(() => {
    setWindowWallet();

    if (!adapter) {
      setWallets({
        tron: {
          wallet: walletRef.current,
          connect: () => {
            onOpen();
          }
        }
      });
      return;
    }

    configStore.set({
      tronWalletAdapter: adapter.name
    });

    const brand = resolveWalletBrand(adapter);

    const params = {
      connect: async () => {
        try {
          onOpen();
        } catch (error) {
          console.error("Tron wallet connect failed:", error);
        }
      },
      disconnect: async () => {
        try {
          await adapter.disconnect();
          configStore.set({
            tronWalletAdapter: null
          });
          setAdapter(null);
        } catch (error) {
          console.error("Tron wallet disconnect failed:", error);
        }
      }
    };

    setWallets({
      tron: {
        account: adapter.address,
        wallet: walletRef.current,
        ...params,
        ...brand,
      }
    });

    adapter.on("connect", (address: any) => {
      csl("TronProvider", "teal-400", "Adaptor connected, address is: %o", address);
      setWindowWallet(address);
      setWallets({
        tron: {
          account: address,
          wallet: walletRef.current,
          ...params,
          ...resolveWalletBrand(adapter),
        }
      });
    });

    adapter.on("disconnect", () => {
      setWallets({
        tron: {
          account: null,
          wallet: walletRef.current,
          ...params,
          walletIcon: null
        }
      });
      setBalancesStore({
        tronBalances: {}
      });
      configStore.set({
        tronWalletAdapter: null
      });
      setAdapter(null);
    });

    adapter.on("accountsChanged", (accounts: any) => {
      const newAccount = accounts
        ? Array.isArray(accounts)
          ? accounts[0]
          : accounts
        : null;

      csl("TronProvider", "teal-400", "Accounts changed, new address is: %o", newAccount);

      setWindowWallet(newAccount);
      setWallets({
        tron: {
          account: newAccount,
          wallet: walletRef.current,
          ...params,
          ...resolveWalletBrand(adapter),
        }
      });
    });
  }, [adapter]);

  return (
    <WalletSelector
      open={open}
      onClose={onClose}
      onConnect={onConnect}
      isConnecting={isConnecting}
      wallets={selectorWallets}
      resolveDisplay={resolveWalletDisplay}
      readyState={{ key: "_readyState", value: "Found" }}
      title="Select Tron Wallet"
    />
  );
};

const MobileWallet = () => {
  const setWallets = useWalletsStore((state) => state.set);
  const okxConnectRef = useRef<any>(null);

  const tronLinkAdapter = wallets.find((wallet) => wallet.name === "TronLink");
  const tokenPocketAdapter = wallets.find((wallet) => wallet.name === "TokenPocket");

  const mobileWalletOptions = useMemo(() => {
    return [
      { key: "okx", name: "OKX Wallet", icon: OKX_ICON },
      { key: "tokenpocket", name: "TokenPocket", icon: tokenPocketAdapter?.icon },
      { key: "tronlink", name: "TronLink", icon: tronLinkAdapter?.icon },
    ];
  }, []);

  const {
    open,
    onClose,
    onOpen,
    onConnect,
    isConnecting,
  } = useWalletSelector({
    connect: async (wallet: any) => {
      if (wallet.key === "okx") {
        await okxConnectRef.current?.connect();
        return;
      }

      if (wallet.key === "tokenpocket") {
        tokenPocketAdapter?.connect?.();
        onClose();
      }

      if (wallet.key === "tronlink") {
        tronLinkAdapter?.connect?.();
        onClose();
      }
    },
  });

  useWatchOKXConnect((okxConnect: any) => {
    okxConnectRef.current = okxConnect;
    const { okxUniversalProvider, disconnect, icon } = okxConnect;
    const provider = new OKXTronProvider(okxUniversalProvider);

    // @ts-ignore
    const account = provider.getAccount()?.address || null;
    account && tronWeb.setAddress(account);
    const tronWallet = new TronWallet({
      signAndSendTransaction: (transaction: any) => {
        return provider.signAndSendTransaction(transaction, "tron:mainnet");
      },
      address: account,
    });

    setWallets({
      tron: {
        account,
        wallet: tronWallet,
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
      isCheckReadyState={false}
      title="Select Tron Wallet"
    />
  );
};
