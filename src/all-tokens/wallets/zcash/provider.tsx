import React, { useEffect, useMemo, useState } from "react";
import { useDebounceFn } from "ahooks";
import useWalletsStore from "@/stores/use-wallets";
import useBalancesStore from "@/stores/use-balances";
import useIsMobile from "@/hooks/use-is-mobile";
import { useWalletSelector } from "@/libs/wallets/hooks/use-wallet-selector";
import WalletSelector from "@/libs/wallets/components/wallet-selector";
import ZcashWallet, {
  ZCASH_MANUAL_WALLET_NAME,
  type ZcashWalletMode,
} from "./wallet";
import PasteAddressModal from "./paste-address-modal";
import {
  connect_zcash,
  connectedZcashAddress,
  disconnect_zcash,
  get_accounts_zcash,
  isNoirWalletInstalled,
  zcashWalletAdapter,
} from "./sdk";
import { getLogo } from "@/utils/format/logo";

const NOIR_DOWNLOAD_URL =
  "https://chromewebstore.google.com/detail/noir-wallet/mfoghjbpfanobmnoemoepenjjcmfpmdn";

const MANUAL_ADDRESS_KEY = "_zcash_manual_address";

export const NOIR_ICON = getLogo("/stableflow/wallets/logo-noir.svg");

export default function ZcashProvider({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <>
      {children}
      <Content />
    </>
  );
}

const Content = () => {
  const [mounted, setMounted] = useState(false);
  const [account, setAccount] = useState<string | null>(null);
  const [mode, setMode] = useState<ZcashWalletMode>("noir");
  const [pasteOpen, setPasteOpen] = useState(false);
  const isMobile = useIsMobile();
  const setWallets = useWalletsStore((state) => state.set);
  const setBalancesStore = useBalancesStore((state) => state.set);

  const installed = mounted && !isMobile ? isNoirWalletInstalled() : false;

  const wallets = useMemo(
    () => [
      {
        name: "Noir Wallet",
        icon: NOIR_ICON,
        url: NOIR_DOWNLOAD_URL,
        readyState: installed ? "Installed" : "NotDetected",
      },
    ],
    [installed]
  );

  const clearManualStorage = () => {
    try {
      sessionStorage.removeItem(MANUAL_ADDRESS_KEY);
    } catch {
      // ignore
    }
  };

  const persistManualAddress = (addr: string) => {
    try {
      sessionStorage.setItem(MANUAL_ADDRESS_KEY, addr);
    } catch {
      // ignore
    }
  };

  const clearStore = (connectFn: () => void) => {
    setAccount(null);
    setMode("noir");
    clearManualStorage();
    setBalancesStore({ zcashBalances: {} });
    setWallets({
      zcash: {
        account: null,
        wallet: null,
        walletIcon: null,
        walletName: null,
        connect: connectFn,
        disconnect: () => {},
      },
    });
  };

  const {
    open,
    onClose,
    onOpen,
    onConnect,
    isConnecting,
  } = useWalletSelector({
    connect: async () => {
      if (!isNoirWalletInstalled()) {
        window.open(NOIR_DOWNLOAD_URL, "_blank");
        return;
      }
      const result = await connect_zcash();
      const nextAccount = result.shielded || result.transparent || null;
      clearManualStorage();
      setMode("noir");
      setAccount(nextAccount);
    },
  });

  const openConnect = () => {
    if (isMobile) {
      setPasteOpen(true);
      return;
    }
    onOpen();
  };

  const onPasteConfirm = (address: string) => {
    setMode("manual");
    setAccount(address);
    persistManualAddress(address);
    setPasteOpen(false);
  };

  const { run: syncWallet } = useDebounceFn(
    () => {
      if (!mounted) return;

      const zcashWallet = new ZcashWallet({ account, mode });
      const connect = () => openConnect();
      const isManual = mode === "manual";

      setWallets({
        zcash: {
          account,
          wallet: zcashWallet,
          walletIcon: account ? NOIR_ICON : null,
          walletName: account
            ? isManual
              ? ZCASH_MANUAL_WALLET_NAME
              : "Noir Wallet"
            : null,
          connect,
          disconnect: async () => {
            if (!isManual) {
              await disconnect_zcash();
            }
            clearStore(connect);
          },
        },
      });
    },
    { wait: 300 }
  );

  useEffect(() => {
    syncWallet();
  }, [account, mode, mounted, isMobile]);

  useEffect(() => {
    if (!mounted) return;

    let cancelled = false;

    // Mobile: restore pasted address
    if (isMobile) {
      try {
        const saved = sessionStorage.getItem(MANUAL_ADDRESS_KEY);
        if (saved) {
          setMode("manual");
          setAccount(saved);
        }
      } catch {
        // ignore
      }
      return;
    }

    // Desktop: silent Noir reconnect
    const silentReconnect = async () => {
      if (!isNoirWalletInstalled()) return;
      try {
        const accounts = await get_accounts_zcash();
        if (cancelled) return;
        const nextAccount = accounts?.shielded || accounts?.transparent || null;
        if (nextAccount) {
          setMode("noir");
          setAccount(nextAccount);
        }
      } catch {
        // not connected
      }
    };

    silentReconnect();

    const onAccountChanged = () => {
      const nextAccount = connectedZcashAddress();
      if (!nextAccount) {
        clearStore(() => openConnect());
        return;
      }
      setMode("noir");
      setAccount(nextAccount);
    };
    zcashWalletAdapter.on("accountChanged", onAccountChanged);

    return () => {
      cancelled = true;
      zcashWalletAdapter.off("accountChanged", onAccountChanged);
    };
  }, [mounted, isMobile]);

  useEffect(() => {
    setMounted(true);
  }, []);

  return (
    <>
      <WalletSelector
        open={!isMobile && open}
        onClose={onClose}
        onConnect={onConnect}
        isConnecting={isConnecting}
        wallets={wallets}
        readyState={{ key: "readyState", value: "Installed" }}
        title="Select Zcash Wallet"
      />
      <PasteAddressModal
        open={isMobile && pasteOpen}
        onClose={() => setPasteOpen(false)}
        onConfirm={onPasteConfirm}
      />
    </>
  );
};
