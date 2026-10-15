import React, { useEffect, useState } from "react";
import {
  ConnectProvider,
  OKXConnector,
  BitgetConnector,
  BybitConnector,
  XverseConnector,
  UnisatConnector,
  MagicEdenConnector,
  GateConnector,
  useAccounts,
  useBTCProvider,
  useConnectModal,
  useConnector,
} from "btc-wallet";
import { WalletSelectDialog } from "@stableflow/pay-widgets/wallet-select";
import { useDebounceFn } from "ahooks";
import useWalletsStore from "@/stores/use-wallets";
import useBalancesStore from "@/stores/use-balances";
import BtcWallet from "./wallet";

const BTC_CONNECTORS = [
  new OKXConnector(),
  new BitgetConnector(),
  new BybitConnector(),
  new XverseConnector(),
  new UnisatConnector(),
  new MagicEdenConnector(),
  new GateConnector(),
];

const BTC_CONNECT_OPTIONS = {
  projectId: "btc",
  clientKey: "btc",
  appId: "btc",
  aaOptions: {
    accountContracts: {
      BTC: [{ chainIds: [686868], version: "1.0.0" }],
    },
  },
  walletOptions: { visible: false },
};

export default function BtcProvider({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <ConnectProvider
      autoConnect
      connectors={BTC_CONNECTORS}
      options={BTC_CONNECT_OPTIONS}
    >
      {children}
      <Content />
    </ConnectProvider>
  );
}

const Content = () => {
  const [mounted, setMounted] = useState(false);
  const setWallets = useWalletsStore((state) => state.set);
  const setBalancesStore = useBalancesStore((state) => state.set);

  const { accounts } = useAccounts();
  const { sendBitcoin, signMessage, connector } = useBTCProvider();
  const { disconnect } = useConnectModal();
  const { connectors, connect: connectConnector } = useConnector();
  const [pickerOpen, setPickerOpen] = useState(false);
  const [connectingId, setConnectingId] = useState<string | null>(null);

  const account = accounts?.[0] || null;

  const { run: syncWallet } = useDebounceFn(
    () => {
      if (!mounted) return;

      const btcWallet = new BtcWallet({
        account,
        sendBitcoin,
        signMessage,
      });

      const connect = () => {
        setPickerOpen(true);
      };

      setWallets({
        btc: {
          account,
          wallet: btcWallet,
          walletIcon: connector?.metadata?.icon || null,
          walletName: connector?.metadata?.name || null,
          connect,
          disconnect: () => {
            disconnect();
            setBalancesStore({ btcBalances: {} });
            setWallets({
              btc: {
                account: null,
                wallet: null,
                walletIcon: null,
                walletName: null,
                connect,
                disconnect: () => {},
              },
            });
          },
        },
      });
    },
    { wait: 500 }
  );

  useEffect(() => {
    syncWallet();
  }, [account, mounted, connector, connectors, sendBitcoin, signMessage]);

  useEffect(() => {
    setMounted(true);
  }, []);

  return (
    <WalletSelectDialog
      open={pickerOpen}
      onClose={() => setPickerOpen(false)}
      title="Select Bitcoin Wallet"
      wallets={connectors.map((item) => {
        const detected = item.isReady();
        const downloadUrl = item.metadata.downloadUrl?.trim();
        return {
          id: item.metadata.id,
          name: item.metadata.name,
          icon: item.metadata.icon,
          description: item.metadata.name,
          detected,
          installUrl: detected ? undefined : downloadUrl || undefined,
        };
      })}
      connectingId={connectingId}
      elevated
      onSelect={(wallet) => {
        setPickerOpen(false);
        setConnectingId(wallet.id);
        void connectConnector(wallet.id)
          .catch((error: unknown) => {
            console.error("Bitcoin wallet connect failed", error);
          })
          .finally(() => setConnectingId(null));
      }}
    />
  );
};
