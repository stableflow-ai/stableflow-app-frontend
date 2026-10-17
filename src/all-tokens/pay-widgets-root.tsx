import { useCallback, useMemo, type ReactNode } from "react";
import { PayWidgetsProvider, type PayToken, type PayWallet, type WalletKindMeta } from "@stableflow/pay-widgets/token-select";
import useWalletStore from "@/all-tokens/wallet-store";
import useRheaTokensStore from "@/all-tokens/rhea-tokens-store";
import useBalancesStore, { type BalancesState } from "@/stores/use-balances";
import useWalletsStore, { type WalletType } from "@/stores/use-wallets";
import useCopy from "@/hooks/use-copy";
import { chainTypes, RHEA_WALLET_TYPES } from "@/all-tokens/chains";
import { INTERFACE_CHAIN_KIND_LABELS, mapRheaPayTokens } from "@/all-tokens/bridge/components/token-select-modal/pay-widgets-adapter";
import { getTokenBalance } from "@/all-tokens/bridge/components/token-select-modal/utils";

const WALLET_TYPES = ["near", "sol", "evm", "tron", "aptos", "ton", "sui", "btc", "zcash"] as const satisfies readonly WalletType[];

function isWalletType(kind: string): kind is WalletType {
  return (WALLET_TYPES as readonly string[]).includes(kind);
}

function walletKindsFromChains(): WalletKindMeta[] {
  return RHEA_WALLET_TYPES.flatMap((kind) => {
    const meta = chainTypes[kind];
    if (!meta) return [];
    return [{
      kind,
      label: meta.name,
      icon: meta.icon,
      iconGray: meta.iconGray,
      bg: meta.bg,
      bgColor: meta.bgColor,
    }];
  });
}

export default function AllTokensPayWidgetsRoot(props: { children: ReactNode }) {
  const rheaTokens = useRheaTokensStore((state) => state.tokens);
  const loading = useRheaTokensStore((state) => state.loading && !state.tokens.length);
  const evmBalancesLoading = useWalletStore((state) => state.evmBalancesLoading);
  const wallets = useWalletsStore();
  const balances = useBalancesStore();
  const { onCopy } = useCopy();
  const mapped = useMemo(() => mapRheaPayTokens(rheaTokens), [rheaTokens]);
  const walletKinds = useMemo(() => walletKindsFromChains(), []);

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

  return (
    <PayWidgetsProvider
      tokens={mapped.tokens}
      loading={loading}
      wallet={{ accounts, connect, disconnect }}
      walletKinds={walletKinds}
      getBalance={getBalance}
      isBalanceLoading={isBalanceLoading}
      chainKindLabels={INTERFACE_CHAIN_KIND_LABELS}
      onCopyAddress={onCopy}
    >
      {props.children}
    </PayWidgetsProvider>
  );
}
