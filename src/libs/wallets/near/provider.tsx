import { useEffect } from "react";
import { NearConnector, type NearWalletBase } from "@hot-labs/near-connect";
import SignClient from "@walletconnect/sign-client";
import useWalletsStore from "@/stores/use-wallets";
import useBalancesStore from "@/stores/use-balances";
import { metadata } from "@/libs/wallets/rainbow/metadata";
import NearWallet from "./wallet";

const NEAR_CONNECT_WALLET_IDS = [
  "hot-wallet",
  "meteor-wallet",
  "intear-wallet",
  "okx-wallet",
  "ledger",
  "near-mobile",
  "nightly-wallet",
  "wallet-connect",
] as const;

const NEAR_CONNECT_WALLET_ID_SET = new Set<string>(NEAR_CONNECT_WALLET_IDS);

const projectId = import.meta.env.VITE_RAINBOW_PROJECT_ID as string;

function applyNearConnectWalletAllowlist(connector: NearConnector) {
  connector.manifest.wallets = connector.manifest.wallets.filter((wallet) =>
    NEAR_CONNECT_WALLET_ID_SET.has(wallet.id)
  );
  connector.wallets = connector.wallets.filter((wallet) =>
    NEAR_CONNECT_WALLET_ID_SET.has(wallet.manifest.id)
  );
}

export default function NEARProvider({
  children,
}: {
  children: React.ReactNode;
}) {
  const setWallets = useWalletsStore((state) => state.set);
  const setBalances = useBalancesStore((state) => state.set);

  useEffect(() => {
    let disposed = false;
    const connector = new NearConnector({
      network: "mainnet",
      autoConnect: true,
      footerBranding: null,
      walletConnect: SignClient.init({
        projectId,
        metadata,
      }),
    });
    const nearWallet = new NearWallet(connector);

    const publish = (account: string | null, wallet?: NearWalletBase) => {
      if (disposed) return;
      setWallets({
        near: {
          account,
          wallet: nearWallet,
          walletIcon: wallet?.manifest?.icon,
          walletName: wallet?.manifest?.name,
          connect: () => {
            void connector.connect();
          },
          disconnect: async () => {
            await connector.disconnect();
          },
        },
      });
    };

    const onSignIn = (payload: {
      wallet: NearWalletBase;
      accounts: { accountId: string }[];
      success: boolean;
    }) => {
      if (!payload.success) return;
      publish(payload.accounts[0]?.accountId || null, payload.wallet);
    };

    const onSignOut = () => {
      setBalances({ nearBalances: {} });
      publish(null);
    };

    const onWalletsChanged = () => {
      applyNearConnectWalletAllowlist(connector);
    };

    connector.on("wallet:signIn", onSignIn);
    connector.on("wallet:signOut", onSignOut);
    connector.on("selector:manifestUpdated", onWalletsChanged);
    connector.on("selector:walletsChanged", onWalletsChanged);

    publish(null);

    void (async () => {
      await connector.whenManifestLoaded;
      applyNearConnectWalletAllowlist(connector);
      try {
        const connected = await connector.getConnectedWallet();
        if (disposed) return;
        const accountId = connected.accounts[0]?.accountId;
        if (accountId) publish(accountId, connected.wallet);
      } catch {
        // No restored session.
      }
    })();

    return () => {
      disposed = true;
      connector.off("wallet:signIn", onSignIn);
      connector.off("wallet:signOut", onSignOut);
      connector.off("selector:manifestUpdated", onWalletsChanged);
      connector.off("selector:walletsChanged", onWalletsChanged);
    };
  }, [setBalances, setWallets]);

  return children;
}
