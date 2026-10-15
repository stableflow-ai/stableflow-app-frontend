import React, { useEffect, useMemo, useRef, useState } from "react";
import AptosWallet from "@/libs/wallets/aptos/wallet";
import useWalletsStore from "@/stores/use-wallets";
import useBalancesStore from "@/stores/use-balances";
import useIsMobile from "@/hooks/use-is-mobile";
import { useDebounceFn } from "ahooks";
import { AptosWalletAdapterProvider } from "@aptos-labs/wallet-adapter-react";
import { Aptos, AptosConfig, Network } from "@aptos-labs/ts-sdk";
import { useWallet } from "@aptos-labs/wallet-adapter-react";
import { OKX_ICON, useWatchOKXConnect } from "../okxconnect";
import { OKXAptosProvider } from "@okxconnect/aptos-provider";
import { useWalletSelector } from "../hooks/use-wallet-selector";
import WalletSelector, { type WalletSelectorItem } from "../components/wallet-selector";
import { csl } from "@/utils/log";

export default function AptosProvider({
  children
}: {
  children: React.ReactNode;
}) {
  return (
    <AptosWalletAdapterProvider
      autoConnect={true}
      dappConfig={{ network: Network.MAINNET }}
      onError={(error) => {
        csl("AptosProvider", "red-500", "error: %o", error);
      }}
      optInWallets={[
        "OKX Wallet",
        "Petra",
        "Nightly",
        "Backpack",
        "MSafe",
        "Bitget Wallet",
        "Gate Wallet",
      ]}
    >
      {children} <DeviceDetector />
    </AptosWalletAdapterProvider>
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
  const {
    account,
    connect,
    disconnect,
    signAndSubmitTransaction,
    wallet,
    wallets,
    notDetectedWallets,
  } = useWallet();

  const setBalancesStore = useBalancesStore((state) => state.set);
  const connectedNameRef = useRef<string | null>(null);
  connectedNameRef.current = account && wallet?.name ? wallet.name : null;

  const { selectorWallets, walletByKey } = useMemo(() => {
    const list = [...wallets, ...notDetectedWallets];
    const nextWallets: WalletSelectorItem[] = [];
    const nextByKey = new Map<string, (typeof list)[number]>();
    for (const wallet of list) {
      const key = wallet.name;
      if (!key || nextByKey.has(key)) continue;
      nextByKey.set(key, wallet);
      const detected = wallet.readyState === "Installed";
      nextWallets.push({
        key,
        name: wallet.name,
        icon: wallet.icon,
        url: typeof wallet.url === "string" ? wallet.url : undefined,
        detected,
      });
    }
    return { selectorWallets: nextWallets, walletByKey: nextByKey };
  }, [wallets, notDetectedWallets]);

  const {
    open,
    onClose,
    onOpen,
    onConnect,
    isConnecting,
  } = useWalletSelector({
    connect: async (key: string) => {
      const selected = walletByKey.get(key);
      const name = selected?.name ?? key;
      if (connectedNameRef.current === name) return;
      await connect(name);
    },
  });

  const { run: connect2AptosWallets } = useDebounceFn(() => {
    if (!mounted) return;
    const aptosWallet = new AptosWallet({
      account: account || null,
      signAndSubmitTransaction,
    });
    setWallets({
      aptos: {
        account: account?.address.toString() || null,
        wallet: aptosWallet,
        walletIcon: wallet?.icon,
        walletName: wallet?.name,
        connect: () => {
          if (wallet) {
            onConnect(wallet.name);
          } else {
            onOpen();
          }
        },
        disconnect: () => {
          disconnect();
          setBalancesStore({
            aptosBalances: {}
          });
          setWallets({
            aptos: {
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
    connect2AptosWallets();
  }, [account, mounted]);

  const { run: connectDelay } = useDebounceFn(() => {
    if (!wallet) {
      return;
    }
    onConnect(wallet.name);
  }, { wait: 500 });

  useEffect(() => {
    connectDelay();
  }, [wallet]);

  useEffect(() => {
    setMounted(true);
  }, []);

  return (
    <WalletSelector
      open={open}
      onClose={onClose}
      onConnect={onConnect}
      isConnecting={isConnecting}
      wallets={selectorWallets}
      title="Select Aptos Wallet"
    />
  );
};

const mobileWalletOptions = [
  { key: "okx", name: "OKX Wallet", icon: OKX_ICON },
];

const MobileContent = () => {
  const setWallets = useWalletsStore((state) => state.set);
  const okxConnectRef = useRef<any>(null);

  const {
    open,
    onClose,
    onOpen,
    onConnect,
    isConnecting,
  } = useWalletSelector({
    connect: async (key: string) => {
      if (key === "okx") {
        await okxConnectRef.current?.connect();
      }
    },
  });

  useWatchOKXConnect((okxConnect: any) => {
    okxConnectRef.current = okxConnect;
    const { okxUniversalProvider, disconnect, icon } = okxConnect;
    const provider = new OKXAptosProvider(okxUniversalProvider);
    const account = provider.getAccount("aptos:mainnet") || null;
    const config = new AptosConfig({
      network: Network.MAINNET,
    });
    const aptos = new Aptos(config);
    const aptosWallet = new AptosWallet({
      account: account,
      signAndSubmitTransaction: (async (payloadData: any) => {
        const transaction = await aptos.transaction.build.simple({
          sender: account?.address?.toString(),
          ...payloadData,
        });
        return provider.signAndSubmitTransaction(transaction, "aptos:mainnet");
      }) as any,
    });

    setWallets({
      aptos: {
        account: account?.address?.toString(),
        wallet: aptosWallet,
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
      title="Select Aptos Wallet"
    />
  );
};
