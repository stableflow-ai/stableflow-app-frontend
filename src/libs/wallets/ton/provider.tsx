import useBalancesStore from "@/stores/use-balances";
import useWalletsStore from "@/stores/use-wallets";
import { TonConnectUIProvider, useTonAddress, useTonWallet, useTonConnectUI } from "@tonconnect/ui-react";
import { useEffect, useState } from "react";
import TonWallet from "./wallet";
import { useDebounceFn } from "ahooks";

export default function TonProvider({
  children
}: {
  children: React.ReactNode;
}) {
  return (
    <TonConnectUIProvider manifestUrl={`https://app.stableflow.ai/tonconnect-manifest.json`}>
      <WalletProvider>
        {children}
      </WalletProvider>
    </TonConnectUIProvider>
  );
}

const WalletProvider = (props: any) => {
  const { children } = props;

  const setWallets = useWalletsStore((state) => state.set);
  const setBalancesStore = useBalancesStore((state) => state.set);

  const wallet = useTonWallet();
  const [tonConnectUI] = useTonConnectUI();
  const userFriendlyAddress = useTonAddress();

  const [mounted, setMounted] = useState(false);

  const { run: debouncedSetWallets } = useDebounceFn(() => {
    if (!mounted) return;
    const tonWallet = new TonWallet({
      tonConnectUI,
      account: userFriendlyAddress,
    });
    if (!userFriendlyAddress) {
      setBalancesStore({ tonBalances: {} });
    }
    setWallets({
      ton: {
        account: userFriendlyAddress || null,
        wallet: tonWallet,
        // @ts-ignore
        walletIcon: wallet?.imageUrl,
         // @ts-ignore
        walletName: wallet?.name,
        connect: () => {
          tonConnectUI.openModal();
        },
        disconnect: () => {
          tonConnectUI.disconnect();
          setBalancesStore({ tonBalances: {} });
          setWallets({
            ton: {
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
    debouncedSetWallets();
  }, [mounted, userFriendlyAddress, wallet, tonConnectUI]);

  useEffect(() => {
    if (!tonConnectUI || !mounted) return;

    const unsubscribe = tonConnectUI.onStatusChange((walletInfo) => {
      console.log('TON wallet status changed:', walletInfo);
      debouncedSetWallets();
    });

    return () => {
      unsubscribe();
    };
  }, [tonConnectUI, mounted, debouncedSetWallets]);

  useEffect(() => {
    setMounted(true);
  }, []);

  return children;
};
