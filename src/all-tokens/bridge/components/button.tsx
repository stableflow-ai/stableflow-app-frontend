import Button from "@/components/button";
import chains from "@/all-tokens/chains";
import { formatBridgeError } from "@/all-tokens/bridge/utils";
import useBridgeStore from "@/all-tokens/bridge-store";
import useWalletStore from "@/all-tokens/wallet-store";
import useToast from "@/hooks/use-toast";
import useWalletsStore from "@/stores/use-wallets";
import { useMemo } from "react";
import { useSwitchChain } from "wagmi";

export default function BridgeButton({
  onClick,
  errorChain,
}: {
  onClick: () => void;
  onQuote?: (params: { dry: boolean }, isSync?: boolean) => void;
  errorChain: number;
}) {
  const bridgeStore = useBridgeStore();
  const toast = useToast();
  const { switchChainAsync } = useSwitchChain();
  const wallets = useWalletsStore();
  const walletStore = useWalletStore();

  const loading = bridgeStore.getQuoting() || bridgeStore.transferring;

  const wallet = useMemo(() => {
    // @ts-ignore
    return wallets[walletStore.fromToken?.chainType];
  }, [wallets, walletStore.fromToken]);

  const errorConnect = useMemo(() => {
    return !!walletStore.fromToken && !!wallet && !wallet.account;
  }, [wallet, walletStore.fromToken]);

  const buttonText = useMemo(() => {
    if (errorConnect) {
      return `Connect to ${walletStore.fromToken?.chainName ?? "Wallet"}`;
    }
    if (bridgeStore.errorTips) {
      return bridgeStore.errorTips;
    }
    if (errorChain) {
      return "Switch Network";
    }
    return "Transfer";
  }, [bridgeStore.errorTips, errorChain, errorConnect, walletStore.fromToken]);

  const buttonDisabled = useMemo(() => {
    if (errorConnect || errorChain) return false;
    if (
      !!bridgeStore.errorTips ||
      !bridgeStore.quoteDataService ||
      bridgeStore.quoteDataMap.size < 1 ||
      bridgeStore.transferring
    ) {
      return true;
    }
    if (loading) return true;
    return false;
  }, [
    errorConnect,
    errorChain,
    bridgeStore.errorTips,
    loading,
    bridgeStore.quoteDataService,
    bridgeStore.quoteDataMap,
    bridgeStore.transferring,
  ]);

  return (
    <Button
      disabled={buttonDisabled}
      loading={loading}
      className="w-full h-14 mt-4.5 rounded-xl bg-[#6284F5] shadow-[0_2px_6px_0_rgba(0,0,0,0.10)] text-white text-lg! font-medium!"
      onClick={async () => {
        if (errorConnect) {
          wallet?.connect?.();
          return;
        }
        if (!!bridgeStore.errorTips) return;
        if (errorChain) {
          const chainId = Number(errorChain);
          const targetChain = Object.values(chains).find((chain) => Number(chain.chainId) === chainId);
          let addEthereumChainParameter;
          if (targetChain) {
            addEthereumChainParameter = {
              chainName: targetChain.chainName,
              nativeCurrency: {
                name: targetChain.nativeToken.symbol,
                symbol: targetChain.nativeToken.symbol,
                decimals: targetChain.nativeToken.decimals,
              },
              rpcUrls: targetChain.rpcUrls,
              blockExplorerUrls: targetChain.blockExplorerUrls,
            };
          }
          try {
            await switchChainAsync({
              chainId,
              addEthereumChainParameter,
            });
          } catch (error) {
            toast.fail({
              title: formatBridgeError(error, "Failed to switch network"),
            });
          }
          return;
        }
        onClick();
      }}
    >
      <span className="whitespace-nowrap overflow-hidden text-ellipsis">{buttonText}</span>
    </Button>
  );
}
