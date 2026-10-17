import { useMemo } from "react";
import { useLocation } from "react-router-dom";
import { MyWalletsDrawer } from "@stableflow/pay-widgets/my-wallets";
import type { PayToken } from "@stableflow/pay-widgets/token-select";
import useWalletStore from "@/all-tokens/wallet-store";
import useSharedWalletStore from "@/stores/use-wallet";
import useRheaTokensStore from "@/all-tokens/rhea-tokens-store";
import { isBridgePath } from "@/all-tokens/route-mode";
import { mapRheaPayTokens } from "@/all-tokens/bridge/components/token-select-modal/pay-widgets-adapter";
import { isSameToken } from "@/all-tokens/bridge/components/token-select-modal/utils";

export default function Wallet() {
  const walletStore = useWalletStore();
  const sharedWallet = useSharedWalletStore();
  const rheaTokens = useRheaTokensStore((state) => state.tokens);
  const { pathname } = useLocation();
  const mapped = useMemo(() => mapRheaPayTokens(rheaTokens), [rheaTokens]);
  const bridge = isBridgePath(pathname);

  const onSelectToken = (token: PayToken) => {
    const source = mapped.byAssetId.get(token.assetId);
    if (!source) return;
    const conflict = isSameToken(walletStore.toToken, source);
    walletStore.set({
      fromToken: source,
      ...(conflict ? { toToken: null } : {}),
      showWallet: false,
      showTokenSelect: false,
    });
  };

  return (
    <MyWalletsDrawer
      open={sharedWallet.showWallet}
      onClose={() => sharedWallet.set({ showWallet: false })}
      onSelectToken={bridge ? onSelectToken : undefined}
    />
  );
}
