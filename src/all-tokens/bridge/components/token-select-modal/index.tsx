import { useMemo } from "react";
import { TokenSelectDialog, tokenAssetId, type PayToken } from "@stableflow/pay-widgets/token-select";
import useWalletStore from "@/all-tokens/wallet-store";
import useRheaTokensStore from "@/all-tokens/rhea-tokens-store";
import type { TokenChain } from "@/all-tokens/chains";
import { mapRheaPayTokens } from "./pay-widgets-adapter";
import { isSameToken } from "./utils";

function selectedAssetId(token: TokenChain | null | undefined): string | null {
  if (!token) return null;
  return token.assetId?.trim() || tokenAssetId(token.blockchain, token.symbol, token.contractAddress);
}

export default function TokenSelectModal() {
  const showTokenSelect = useWalletStore((state) => state.showTokenSelect);
  const isTo = useWalletStore((state) => state.isTo);
  const fromToken = useWalletStore((state) => state.fromToken) as TokenChain | null;
  const toToken = useWalletStore((state) => state.toToken) as TokenChain | null;
  const setWallet = useWalletStore((state) => state.set);
  const rheaTokens = useRheaTokensStore((state) => state.tokens);
  const mapped = useMemo(() => mapRheaPayTokens(rheaTokens), [rheaTokens]);

  const onClose = () => setWallet({ showTokenSelect: false });

  const onSelect = ({ token }: { token: PayToken }) => {
    const source = mapped.byAssetId.get(token.assetId);
    if (!source) return;
    const field = isTo ? "toToken" : "fromToken";
    const other = isTo ? "fromToken" : "toToken";
    const otherToken = isTo ? fromToken : toToken;
    const conflict = isSameToken(otherToken, source);
    setWallet({
      [field]: source,
      ...(conflict ? { [other]: null } : {}),
      showTokenSelect: false,
    });
  };

  return (
    <TokenSelectDialog
      open={showTokenSelect}
      onClose={onClose}
      onSelect={onSelect}
      role="payer"
      selectedAssetId={selectedAssetId(isTo ? toToken : fromToken)}
    />
  );
}
