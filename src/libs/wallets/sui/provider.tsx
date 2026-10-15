import React, { useEffect, useMemo, useRef, useState } from "react";
import SuiWallet from "@/libs/wallets/sui/wallet";
import useWalletsStore from "@/stores/use-wallets";
import useBalancesStore from "@/stores/use-balances";
import { useDebounceFn } from "ahooks";
import { useWalletSelector } from "../hooks/use-wallet-selector";
import WalletSelector, { type WalletSelectorItem } from "../components/wallet-selector";
import { SUI_DAPP_KIT_STORAGE_KEY, suiDAppKit } from "./dapp-kit";

import {
  DAppKitProvider,
  getWalletUniqueIdentifier,
  useCurrentWallet,
  useDAppKit,
  useWallets,
  useCurrentAccount,
} from "@mysten/dapp-kit-react";

export default function SuiProvider({
  children
}: {
  children: React.ReactNode;
}) {
  return (
    <DAppKitProvider
      dAppKit={suiDAppKit}
    >
      {children}
      <Content />
    </DAppKitProvider>
  );
}

const AllWallets = [
  {
    name: "Phantom",
    icon: "/wallets/phantom.svg",
    url: "https://phantom.com/",
  },
  {
    name: "OKX Wallet",
    icon: "/wallets/okx.png",
    url: "https://web3.okx.com/download",
  },
];

const Content = () => {
  const [mounted, setMounted] = useState(false);
  const setWallets = useWalletsStore((state) => state.set);

  const wallets = useWallets()
  const dappKit = useDAppKit()
  const { connectWallet: connect, disconnectWallet: disconnect, signAndExecuteTransaction } = dappKit
  const currentWallet = useCurrentWallet()

  const account = useCurrentAccount();
  const restoreAttemptedRef = useRef(false);

  useEffect(() => {
    if (restoreAttemptedRef.current) return;
    const saved = localStorage.getItem(SUI_DAPP_KIT_STORAGE_KEY);
    if (!saved) {
      restoreAttemptedRef.current = true;
      return;
    }
    const [savedWalletId, savedAddress] = saved.split(":");
    const wallet = wallets.find(
      (item) => getWalletUniqueIdentifier(item).replace(":", "_") === savedWalletId
    );
    if (!wallet) return;
    restoreAttemptedRef.current = true;
    const savedAccount = wallet.accounts.find((item) => item.address === savedAddress);
    // `silent` is omitted from ConnectWalletArgs but forwarded to standard:connect at runtime.
    connect({ wallet, account: savedAccount, silent: true } as Parameters<typeof connect>[0]).catch(() => {
      localStorage.removeItem(SUI_DAPP_KIT_STORAGE_KEY);
    });
  }, [wallets]);

  const [selectorWallets, walletByKey] = useMemo(() => {
    const items: WalletSelectorItem[] = [];
    const byKey = new Map<string, (typeof wallets)[number]>();
    for (const preset of AllWallets) {
      const installedWallet = wallets.find((wallet) => wallet.name === preset.name);
      if (installedWallet) {
        byKey.set(installedWallet.name, installedWallet);
        items.push({
          key: installedWallet.name,
          name: installedWallet.name,
          icon: typeof installedWallet.icon === "string" ? installedWallet.icon : preset.icon,
          url: preset.url,
          detected: true,
        });
        continue;
      }
      items.push({
        key: preset.name,
        name: preset.name,
        icon: preset.icon,
        url: preset.url,
        detected: false,
      });
    }
    return [items, byKey] as const;
  }, [wallets]);

  const setBalancesStore = useBalancesStore((state) => state.set);

  // Wallet selector
  const {
    open,
    onClose,
    onOpen,
    onConnect,
    isConnecting,
  } = useWalletSelector({
    connect: async (key: string) => {
      const connector = walletByKey.get(key);
      if (!connector) {
        return;
      }
      try {
        await connect({ wallet: connector });
      } catch (err) {
        console.warn("Sui wallet connect failed:", err);
      }
    },
  });

  const { run: connect2SuiWallets } = useDebounceFn(() => {
    if (!mounted) return;
    const suiWallet = new SuiWallet({
      account: account || null,
      signAndExecuteTransaction,
    });
    setWallets({
      sui: {
        account: account?.address || null,
        wallet: suiWallet,
        walletIcon: currentWallet?.icon,
        walletName: currentWallet?.name,
        connect: () => {
          if (currentWallet) {
            onConnect(currentWallet.name);
          } else {
            onOpen();
          }
        },
        disconnect: () => {
          disconnect();
          setBalancesStore({
            suiBalances: {}
          });
          setWallets({
            sui: {
              account: null,
              wallet: null,
              connect: () => {
                if (currentWallet) {
                  onConnect(currentWallet.name);
                } else {
                  onOpen();
                }
              },
              disconnect: () => { }
            }
          });
        }
      }
    });
  }, { wait: 500 });

  useEffect(() => {
    connect2SuiWallets();
  }, [account, mounted]);

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
      title="Select Sui Wallet"
    />
  );
};
