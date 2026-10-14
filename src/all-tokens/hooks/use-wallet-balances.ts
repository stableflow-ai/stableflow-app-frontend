import useWalletStore from "@/all-tokens/wallet-store";
import useSharedWalletStore from "@/stores/use-wallet";
import useEvmBalances from "@/all-tokens/hooks/use-evm-balances";
import useNonEvmBalances from "@/all-tokens/hooks/use-non-evm-balances";

/** Fetch balances while My Wallets drawer or token-select modal is open (mutually exclusive). */
export default function useWalletBalances() {
  const showWallet = useSharedWalletStore((s) => s.showWallet);
  const showTokenSelect = useWalletStore((s) => s.showTokenSelect);
  const enabled = !!(showWallet || showTokenSelect);

  useEvmBalances(enabled);
  useNonEvmBalances(enabled);
}
