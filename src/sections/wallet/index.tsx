import TypeItem from "./type-item";
import TokenSimple from "./token-simple";
import Token, { TokenChains } from "./token";
// import { usdcEvm, usdcSol, usdcNear } from "@/config/tokens/usdc";
// import { usdtEvm, usdtSol, usdtNear, usdtTron } from "@/config/tokens/usdt";
import useWalletStore from "@/stores/use-wallet";
import useWalletsStore, { type WalletType } from "@/stores/use-wallets";
import useEvmBalances from "@/hooks/use-evm-balances";
import useBalancesStore from "@/stores/use-balances";
import Drawer from "@/components/drawer";
import { lazy, Suspense, useMemo } from "react";
import { stablecoinWithChains } from "@/config/tokens";
import { chainTypes } from "@/config/chains";
import clsx from "clsx";
import { isInTrustWallet } from "@/libs/wallets/utils/device";
import { useInjectedTron } from "@/libs/wallets/tron/use-injected-tron";
import useIsMobile from "@/hooks/use-is-mobile";

const Assets = lazy(() => import("@/views/bridge/components/assets"));
const Total = lazy(() => import("./total"));

export default function Wallet() {
  const walletStore = useWalletStore();
  const walletsStore = useWalletsStore();
  const balancesStore = useBalancesStore();
  const { hasInjected } = useInjectedTron();
  const isMobile = useIsMobile();
  useEvmBalances(walletStore.showWallet);

  const walletConnected = useMemo(() => {
    return !!walletsStore.evm.account || !!walletsStore.sol.account || !!walletsStore.near.account || !!walletsStore.tron.account;
  }, [walletsStore]);

  return (
    <Drawer
      title={walletConnected ? "My Wallets" : "Connect Wallet"}
      open={walletStore.showWallet}
      onClose={() => {
        walletStore.set({ showWallet: false });
      }}
      showMask={isMobile}
      maskClosable={isMobile}
      lockScroll={isMobile}
      showCollapse={!isMobile}
    >
      <Suspense fallback={null}>
        <Assets />
      </Suspense>
      <Suspense fallback={null}>
        <Total />
      </Suspense>
      <div className="h-[calc(100%-265px)] overflow-y-auto pt-[8px] pb-[20px] px-[10px]">
        {
          !!stablecoinWithChains.evm[walletStore.selectedToken] && (
            <div
              className="pt-[10px] cursor-pointer rounded-[12px] border border-[#EDF0F7] hover:bg-[#EDF0F7] duration-300"
              style={{
                backgroundImage: chainTypes["evm"].bg,
              }}
            >
              <TypeItem
                type="evm"
                token={stablecoinWithChains.evm[walletStore.selectedToken]}
              />
              <Token
                token={stablecoinWithChains.evm[walletStore.selectedToken]}
                expand={walletStore.usdtExpand}
                onExpand={() => {
                  walletStore.set({ usdtExpand: !walletStore.usdtExpand });
                }}
                balances={balancesStore.evmBalances}
                // loading={loading}
                // totalLoading={walletStore.evmBalancesLoading}
                totalBalance={balancesStore.evmBalances[`${walletStore.selectedToken.toLowerCase()}Balance`]}
              />
              <TokenChains
                token={stablecoinWithChains.evm[walletStore.selectedToken]}
                expand={walletStore.usdtExpand}
                onExpand={() => {
                  walletStore.set({ usdtExpand: !walletStore.usdtExpand });
                }}
              />
            </div>
          )
        }
        {
          Object.entries(stablecoinWithChains)
            .filter(([chain, tokens]) => !["evm"].includes(chain) && !!(tokens as any)[walletStore.selectedToken])
            .map(([chain, tokens]) => {
              const isTrustTron = chain === "tron" && isInTrustWallet() && !hasInjected;
              const isDisabled = isTrustTron && !walletStore.isTo;

              return (
                <div
                  key={chain}
                  className={clsx(
                    "mt-[4px] pt-[6px] rounded-[12px] border border-[#EDF0F7] hover:bg-[#EDF0F7] duration-300",
                    isDisabled ? "opacity-50 cursor-not-allowed" : "cursor-pointer",
                  )}
                  style={{
                    backgroundImage: chainTypes[chain as WalletType].bg,
                  }}
                >
                  <TypeItem
                    type={chain as WalletType}
                    token={(tokens as any)[walletStore.selectedToken]}
                    isDisabled={isDisabled}
                    isConnectDisabled={isTrustTron}
                  />
                  <TokenSimple
                    token={(tokens as any)[walletStore.selectedToken]}
                    isDisabled={isDisabled}
                  />
                </div>
              );
            })
        }
      </div>
    </Drawer>
  );
}
