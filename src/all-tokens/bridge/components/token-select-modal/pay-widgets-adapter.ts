import { tokenAssetId, type PayChain, type PayToken } from "@stableflow/pay-widgets/token-select";
import chains, { chainTypes, type TokenChain } from "@/all-tokens/chains";

const TRADE_BLOCKCHAINS = new Set(
  Object.values(chains)
    .filter((chain) => chain.tradeEnabled)
    .map((chain) => chain.blockchain),
);

export const INTERFACE_CHAIN_KIND_LABELS: Record<string, string> = {
  sol: chainTypes.sol.name,
  btc: chainTypes.btc.name,
  aptos: chainTypes.aptos.name,
  sui: chainTypes.sui.name,
  ton: chainTypes.ton.name,
  zcash: chainTypes.zcash.name,
};

export function mapRheaPayTokens(tokens: TokenChain[]): {
  tokens: PayToken[];
  byAssetId: Map<string, TokenChain>;
} {
  const chainCache = new Map<string, PayChain>();
  const byAssetId = new Map<string, TokenChain>();
  const payTokens: PayToken[] = [];

  for (const token of tokens) {
    if (!TRADE_BLOCKCHAINS.has(token.blockchain)) continue;
    let chain = chainCache.get(token.blockchain);
    if (!chain) {
      chain = {
        blockchain: token.blockchain,
        chainName: token.chainName,
        chainKind: token.chainType,
        logo: token.chainIcon,
        explorer: token.blockExplorerUrl,
        chainId: token.chainId != null ? String(token.chainId) : undefined,
      };
      chainCache.set(token.blockchain, chain);
    }
    const assetId = token.assetId?.trim() || tokenAssetId(token.blockchain, token.symbol, token.contractAddress);
    const price = Number(token.price ?? 0);
    byAssetId.set(assetId, token);
    payTokens.push({
      assetId,
      symbol: token.symbol,
      providerSymbol: token.symbol,
      blockchain: token.blockchain,
      decimals: token.decimals,
      contractAddress: token.contractAddress || null,
      price: Number.isFinite(price) ? price : 0,
      logo: token.icon,
      supportPayment: true,
      supportReceive: true,
      chain,
    });
  }

  return { tokens: payTokens, byAssetId };
}
