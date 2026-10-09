import { useEffect, useMemo, useState, type ReactNode } from "react";
import ReactDOM from "react-dom";
import useWalletStore from "@/all-tokens/wallet-store";
import useBalancesStore, { type BalancesState } from "@/stores/use-balances";
import useRheaTokensStore from "@/all-tokens/rhea-tokens-store";
import chains, { type ChainType, type TokenChain } from "@/all-tokens/chains";
import useIsMobile from "@/hooks/use-is-mobile";
import Drawer from "@/components/drawer";
import ChainPane from "./chain-pane";
import TokenPane from "./token-pane";
import { getTokenBalance, isSameToken, sortTokensByUsd, sumChainUsd } from "./utils";

function getEvmTradeChains(): ChainType[] {
  return Object.values(chains).filter(
    (c) => c.chainType === "evm" && c.tradeEnabled
  ) as ChainType[];
}

function MobileTokenTitle({
  chainFilter,
  tokens,
  evmBalances,
}: {
  chainFilter: string;
  tokens: TokenChain[];
  evmBalances: Record<string, any> | undefined;
}) {
  const evmChains = useMemo(() => getEvmTradeChains(), []);

  const topEvmIcons = useMemo(() => {
    const sorted = [...evmChains].sort(
      (a, b) =>
        sumChainUsd(b, tokens, evmBalances) - sumChainUsd(a, tokens, evmBalances)
    );
    const withBalance = sorted.filter(
      (c) => sumChainUsd(c, tokens, evmBalances) > 0
    );
    const source = withBalance.length > 0 ? withBalance : sorted;
    return source.slice(0, 4);
  }, [evmChains, tokens, evmBalances]);

  if (chainFilter === "evm") {
    return (
      <span className="inline-flex items-center gap-[6px] min-w-0">
        <span className="shrink-0">Select Token from</span>
        <span className="grid grid-cols-2 shrink-0">
          {topEvmIcons.map((c) => (
            <img
              key={c.blockchain}
              src={c.chainIcon}
              alt=""
              className="size-[11px] rounded-[3px] border border-white object-cover"
            />
          ))}
        </span>
        <span className="shrink-0">EVM</span>
      </span>
    );
  }

  const chain =
    Object.values(chains).find(
      (c) => c.blockchain === chainFilter || c.rheaHttpChainId === chainFilter
    ) || null;

  return (
    <span className="inline-flex items-center gap-[6px] min-w-0">
      <span className="shrink-0">Select Token from</span>
      {chain?.chainIcon && (
        <img
          src={chain.chainIcon}
          alt=""
          className="size-[16px] rounded-[4px] object-cover shrink-0"
        />
      )}
      <span className="truncate">{chain?.chainName || chainFilter}</span>
    </span>
  );
}

export default function TokenSelectModal() {
  const walletStore = useWalletStore();
  const balancesStore = useBalancesStore();
  const tokens = useRheaTokensStore((s) => s.tokens);
  const loading = useRheaTokensStore((s) => s.loading && !s.tokens.length);
  const isMobile = useIsMobile();
  const [search, setSearch] = useState("");
  const [chainFilter, setChainFilter] = useState<string>("evm");
  const [mobileStep, setMobileStep] = useState<"chain" | "token">("chain");

  useEffect(() => {
    if (!walletStore.showTokenSelect) return;
    setSearch("");
    setChainFilter("evm");
    setMobileStep("chain");
  }, [walletStore.showTokenSelect]);

  const getBalance = (token: TokenChain) => {
    const key = `${token.chainType}Balances` as keyof BalancesState;
    return getTokenBalance(token, balancesStore[key] as any);
  };

  const filteredTokens = useMemo(() => {
    const q = search.trim().toLowerCase();
    const list = tokens.filter((t) => {
      if (chainFilter === "evm") {
        if (t.chainType !== "evm") return false;
      } else if (t.rheaAlias !== chainFilter && t.blockchain !== chainFilter) {
        return false;
      }
      if (!q) return true;
      return (
        !!t.symbol?.toLowerCase().includes(q) ||
        !!t.contractAddress?.toLowerCase().includes(q) ||
        !!t.assetId?.toLowerCase().includes(q)
      );
    });
    return sortTokensByUsd(list, getBalance);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [
    tokens,
    search,
    chainFilter,
    balancesStore.evmBalances,
    balancesStore.solBalances,
    balancesStore.nearBalances,
    balancesStore.tronBalances,
    balancesStore.aptosBalances,
    balancesStore.suiBalances,
    balancesStore.tonBalances,
    balancesStore.btcBalances,
    balancesStore.zcashBalances,
  ]);

  const onClose = () => walletStore.set({ showTokenSelect: false });

  const onSelectToken = (token: TokenChain) => {
    const field = walletStore.isTo ? "toToken" : "fromToken";
    const other = walletStore.isTo ? "fromToken" : "toToken";
    const otherToken = walletStore[other];
    const conflict = isSameToken(otherToken, token);
    walletStore.set({
      [field]: token,
      ...(conflict ? { [other]: null } : {}),
      showTokenSelect: false,
    });
  };

  const onSelectFilter = (filter: string) => {
    setChainFilter(filter);
    if (isMobile) setMobileStep("token");
  };

  const chainPane = (
    <ChainPane
      chainFilter={chainFilter}
      onSelectFilter={onSelectFilter}
      tokens={tokens}
      hideTitle={isMobile}
    />
  );

  const tokenPane = (
    <TokenPane
      search={search}
      onSearchChange={setSearch}
      tokens={filteredTokens}
      getBalance={getBalance}
      loading={loading}
      showClose={!isMobile}
      showTitle={!isMobile}
      onClose={onClose}
      onSelectToken={onSelectToken}
    />
  );

  const mobileTitle: ReactNode =
    mobileStep === "chain" ? (
      "Select Chain"
    ) : (
      <MobileTokenTitle
        chainFilter={chainFilter}
        tokens={tokens}
        evmBalances={balancesStore.evmBalances}
      />
    );

  if (isMobile) {
    return (
      <Drawer
        title={mobileTitle}
        open={walletStore.showTokenSelect}
        onClose={onClose}
        showBack={mobileStep === "token"}
        onBack={() => setMobileStep("chain")}
        className="bg-[#EDF0F7] flex flex-col"
        titleClassName="shrink-0"
      >
        <div className="flex-1 h-0 overflow-y-auto px-[12px] md:px-[16px] pb-[20px] flex flex-col">
          {mobileStep === "chain" ? (
            chainPane
          ) : (
            <div className="bg-white rounded-[12px] p-0 md:p-[16px] min-h-[320px] flex flex-col flex-1">
              {tokenPane}
            </div>
          )}
        </div>
      </Drawer>
    );
  }

  if (!walletStore.showTokenSelect) return null;
  if (typeof window === "undefined") return null;

  return ReactDOM.createPortal(
    <div className="fixed inset-0 z-[80] flex items-center justify-center bg-black/30 px-3">
      <div className="absolute inset-0" onClick={onClose} aria-hidden />
      <div className="relative w-full max-w-[649px] h-[682px] max-h-[90vh] bg-[#EDF0F7] border border-[#F2F2F2] rounded-[12px] flex overflow-hidden">
        <div className="w-[275px] shrink-0 p-[20px] overflow-y-auto">{chainPane}</div>
        <div className="flex-1 bg-white p-[20px] flex flex-col min-w-0">{tokenPane}</div>
      </div>
    </div>,
    document.body,
  );
}
