import { useCallback, useMemo } from "react";
import { PayWidgetsProvider, TokenSelectDialog, tokenAssetId, type PayToken, type PayWallet } from "@stableflow/pay-widgets/token-select";
import useWalletStore from "@/all-tokens/wallet-store";
import useRheaTokensStore from "@/all-tokens/rhea-tokens-store";
import useBalancesStore, { type BalancesState } from "@/stores/use-balances";
import useWalletsStore, { type WalletType } from "@/stores/use-wallets";
import useCopy from "@/hooks/use-copy";
import type { TokenChain } from "@/all-tokens/chains";
import { INTERFACE_CHAIN_KIND_LABELS, mapRheaPayTokens } from "./pay-widgets-adapter";
import { getTokenBalance, isSameToken } from "./utils";

const WALLET_TYPES = ["near", "sol", "evm", "tron", "aptos", "ton", "sui", "btc", "zcash"] as const satisfies readonly WalletType[];

function isWalletType(kind: string): kind is WalletType {
  return (WALLET_TYPES as readonly string[]).includes(kind);
}

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
  const loading = useRheaTokensStore((state) => state.loading && !state.tokens.length);
  const evmBalancesLoading = useWalletStore((state) => state.evmBalancesLoading);
  const wallets = useWalletsStore();
  const balances = useBalancesStore();
  const { onCopy } = useCopy();
  const mapped = useMemo(() => mapRheaPayTokens(rheaTokens), [rheaTokens]);

  const accounts = useMemo(() => {
    const next: PayWallet["accounts"] = {};
    for (const kind of WALLET_TYPES) {
      const slice = wallets[kind];
      next[kind] = {
        address: slice.account,
        icon: slice.walletIcon,
      };
    }
    return next;
  }, [wallets]);

  const connect = useCallback((kind: string) => {
    if (isWalletType(kind)) wallets[kind].connect();
  }, [wallets]);

  const disconnect = useCallback((kind: string) => {
    if (isWalletType(kind)) wallets[kind].disconnect();
  }, [wallets]);

  const getBalance = useCallback((token: PayToken) => {
    const source = mapped.byAssetId.get(token.assetId);
    if (!source) return null;
    const key = `${source.chainType}Balances` as keyof BalancesState;
    const bag = balances[key];
    if (!bag || typeof bag !== "object") return null;
    return getTokenBalance(source, bag);
  }, [balances, mapped.byAssetId]);

  const isBalanceLoading = useCallback((token: PayToken) => {
    const source = mapped.byAssetId.get(token.assetId);
    return source?.chainType === "evm" && evmBalancesLoading;
  }, [evmBalancesLoading, mapped.byAssetId]);

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
    <PayWidgetsProvider
      tokens={mapped.tokens}
      loading={loading}
      wallet={{ accounts, connect, disconnect }}
      getBalance={getBalance}
      isBalanceLoading={isBalanceLoading}
      chainKindLabels={INTERFACE_CHAIN_KIND_LABELS}
      onCopyAddress={onCopy}
    >
      <TokenSelectDialog
        open={showTokenSelect}
        onClose={onClose}
        onSelect={onSelect}
        role="payer"
        selectedAssetId={selectedAssetId(isTo ? toToken : fromToken)}
      />
    </PayWidgetsProvider>
  );
}
