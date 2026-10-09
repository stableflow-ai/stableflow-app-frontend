import Drawer from "@/components/drawer";
import useWalletStore from "@/all-tokens/wallet-store";
import useSharedWalletStore from "@/stores/use-wallet";
import useWalletsStore, { type WalletType } from "@/stores/use-wallets";
import useBalancesStore, { type BalancesState } from "@/stores/use-balances";
import chains, { chainTypes, type TokenChain, RHEA_WALLET_TYPES } from "@/all-tokens/chains";
import { formatNumber } from "@/utils/format/number";
import useRheaTokensStore from "@/all-tokens/rhea-tokens-store";
import { useEffect, useMemo, useRef, useState } from "react";
import clsx from "clsx";
import Big from "big.js";
import Amount from "@/components/amount";
import ChainTypeIcon from "@/all-tokens/components/chain-type-icon";
import Skeleton from "@/components/skeleton";
import TokenIcon from "@/all-tokens/components/token-icon";
import useIsMobile from "@/hooks/use-is-mobile";
import Address from "./address";

const EVM_TRADE_CHAINS = Object.values(chains).filter(
  (c) => c.chainType === "evm" && c.tradeEnabled
);

function HoldingsSkeleton() {
  return (
    <>
      {Array.from({ length: 3 }).map((_, i) => (
        <div key={i} className="flex items-center justify-between w-full">
          <div className="flex items-center gap-[10px]">
            <Skeleton variant="circle" width={24} height={24} />
            <div className="flex flex-col gap-[4px]">
              <Skeleton width={48} height={14} borderRadius={4} />
              <Skeleton width={64} height={10} borderRadius={4} />
            </div>
          </div>
          <div className="flex flex-col items-end gap-[4px]">
            <Skeleton width={56} height={14} borderRadius={4} />
            <Skeleton width={40} height={10} borderRadius={4} />
          </div>
        </div>
      ))}
    </>
  );
}

const WALLET_LABEL: Record<string, string> = {
  evm: "EVM-based",
  sol: "Solana",
  near: "Near",
  tron: "Tron",
  aptos: "Aptos",
  ton: "Ton",
  sui: "Sui",
  btc: "Bitcoin",
  zcash: "Zcash",
};

type HoldingRow = {
  symbol: string;
  chainName: string;
  chainId?: number | string;
  blockchain?: string;
  icon: string;
  chainIcon: string;
  amount: string;
  usd: number;
  address: string;
};

function buildHoldings(
  type: string,
  balancesBag: any,
  tokens: TokenChain[]
): HoldingRow[] {
  const list = tokens.filter((t) => t.chainType === type);
  const bag = balancesBag || {};
  const rows: HoldingRow[] = [];

  for (const token of list) {
    const chainKey = String(token.chainId ?? token.blockchain);
    const amount =
      bag[chainKey]?.[token.contractAddress] ||
      bag[chainKey]?.[token.contractAddress?.toLowerCase?.()] ||
      "0";
    if (!amount || Big(amount).lte(0)) continue;
    const usd = Number(Big(amount).times(token.price || 0));
    rows.push({
      symbol: token.symbol,
      chainName: token.chainName,
      chainId: token.chainId ?? token.blockchain,
      blockchain: token.blockchain,
      icon: token.icon,
      chainIcon: token.chainIcon,
      amount,
      usd,
      address: token.contractAddress,
    });
  }

  return rows.sort((a, b) => b.usd - a.usd);
}

function findTokenChain(row: HoldingRow, tokens: TokenChain[]): TokenChain | null {
  return (
    tokens.find(
      (t) =>
        t.contractAddress?.toLowerCase?.() === row.address?.toLowerCase?.() &&
        (String(t.chainId ?? "") === String(row.chainId ?? "") ||
          t.blockchain === row.blockchain)
    ) || null
  );
}

export default function Wallet() {
  const walletStore = useWalletStore();
  const sharedWallet = useSharedWalletStore();
  const walletsStore = useWalletsStore();
  const balancesStore = useBalancesStore();
  const rheaTokens = useRheaTokensStore((s) => s.tokens);
  const isMobile = useIsMobile();

  const [expanded, setExpanded] = useState<Record<string, boolean>>({});
  const prevConnectedRef = useRef<Record<string, boolean>>({});

  const connectedByType = useMemo(() => {
    const map: Record<string, boolean> = {};
    for (const type of RHEA_WALLET_TYPES) {
      map[type] = !!(walletsStore as any)[type]?.account;
    }
    return map;
  }, [
    walletsStore.evm.account,
    walletsStore.sol.account,
    walletsStore.near.account,
    walletsStore.tron.account,
    walletsStore.aptos.account,
    walletsStore.sui.account,
    walletsStore.ton.account,
    walletsStore.btc.account,
    walletsStore.zcash.account,
  ]);

  useEffect(() => {
    const updates: Record<string, boolean> = {};
    let changed = false;
    for (const type of RHEA_WALLET_TYPES) {
      const connected = !!connectedByType[type];
      const wasConnected = !!prevConnectedRef.current[type];
      if (connected && !wasConnected) {
        updates[type] = true;
        changed = true;
      } else if (!connected && wasConnected) {
        updates[type] = false;
        changed = true;
      }
      prevConnectedRef.current[type] = connected;
    }
    if (changed) {
      setExpanded((prev) => ({ ...prev, ...updates }));
    }
  }, [connectedByType]);

  const walletConnected = useMemo(() => {
    return RHEA_WALLET_TYPES.some((t) => !!connectedByType[t]);
  }, [connectedByType]);

  const holdingsByType = useMemo(() => {
    const map: Record<string, HoldingRow[]> = {};
    for (const type of RHEA_WALLET_TYPES) {
      const key = `${type}Balances` as keyof BalancesState;
      map[type] = buildHoldings(type, balancesStore[key], rheaTokens);
    }
    return map;
  }, [
    rheaTokens,
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

  const totalByType = useMemo(() => {
    const map: Record<string, number> = {};
    for (const type of RHEA_WALLET_TYPES) {
      const fromHoldings = holdingsByType[type]?.reduce((sum, r) => sum + r.usd, 0) || 0;
      const bag = balancesStore[`${type}Balances` as keyof BalancesState] as any;
      map[type] = fromHoldings || Number(bag?.totalUsd || 0);
    }
    return map;
  }, [holdingsByType, balancesStore]);

  const onSelectHolding = (row: HoldingRow) => {
    const token = findTokenChain(row, rheaTokens);
    if (!token) return;

    const toToken = walletStore.toToken;
    const conflict =
      !!toToken &&
      toToken.contractAddress?.toLowerCase?.() === token.contractAddress?.toLowerCase?.() &&
      (toToken.blockchain === token.blockchain ||
        String(toToken.chainId ?? "") === String(token.chainId ?? ""));

    walletStore.set({
      fromToken: token,
      ...(conflict ? { toToken: null } : {}),
      showWallet: false,
      showTokenSelect: false,
    });
  };

  return (
    <Drawer
      title={walletConnected ? "My Wallets" : "Connect Wallet"}
      open={sharedWallet.showWallet}
      onClose={() => sharedWallet.set({ showWallet: false })}
      className="flex flex-col justify-between items-stretch"
      titleClassName="shrink-0"
      showMask={isMobile}
      maskClosable={isMobile}
      lockScroll={isMobile}
      showCollapse={!isMobile}
    >
      <div className="flex-1 h-0">
        <div className="w-full h-full overflow-y-auto pt-[8px] pb-[20px] px-[10px] flex flex-col gap-[10px]">
          {RHEA_WALLET_TYPES.map((type) => {
            const wallet = (walletsStore as any)[type] as {
              account?: string;
              connect?: () => void;
              disconnect?: () => void;
            };
            const connected = !!wallet?.account;
            const typeMeta = chainTypes[type];
            const isExpanded = !!expanded[type];
            const holdings = holdingsByType[type] || [];
            const total = totalByType[type] || 0;
            const loading =
              type === "evm" ? !!walletStore.evmBalancesLoading : false;

            if (!connected) {
              return (
                <div
                  key={type}
                  className="shrink-0 rounded-[12px] border border-[#EDF0F7] px-[15px] py-[12px] flex flex-col gap-[8px]"
                  style={{ backgroundImage: typeMeta?.bg }}
                >
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-[10px]">
                      <ChainTypeIcon type={type} />
                      <span className="text-[16px] font-medium text-black">{WALLET_LABEL[type]}</span>
                    </div>
                    <button
                      type="button"
                      className="button h-[32px] w-[90px] rounded-[16px] bg-white shadow-[0px_2px_6px_0px_rgba(0,0,0,0.1)] text-[14px] text-[#444C59]"
                      onClick={() => wallet?.connect?.()}
                    >
                      Connect
                    </button>
                  </div>
                  {type === "evm" && (
                    <div className="flex items-center gap-[4px] overflow-x-auto">
                      {EVM_TRADE_CHAINS.map((c) => (
                        <img
                          key={c.blockchain}
                          src={c.chainIcon}
                          alt=""
                          className="size-[16px] rounded-[6px] object-cover shrink-0"
                        />
                      ))}
                    </div>
                  )}
                </div>
              );
            }

            return (
              <div
                key={type}
                className={clsx(
                  "shrink-0 rounded-[12px] border border-[#EDF0F7] overflow-hidden",
                  isExpanded ? "min-h-[77px]" : "min-h-[56px]"
                )}
                style={{ backgroundImage: typeMeta?.bg }}
              >
                <div className="px-[15px] pt-[16px] pb-[10px] flex items-center justify-between">
                  <div className="flex items-center gap-[10px]">
                    <ChainTypeIcon type={type} />
                    <span className="text-[16px] font-medium text-black">{WALLET_LABEL[type]}</span>
                  </div>
                  <Amount
                    amount={total}
                    className="text-black"
                    integerClassName="text-[16px] text-black"
                    decimalClassName="text-[10px] text-black"
                  />
                </div>

                <div className="w-full px-[15px] pb-[12px] flex flex-col gap-[8px]">
                  <div className="flex items-center justify-between gap-2">
                    <Address type={type as WalletType} />
                    <button
                      type="button"
                      className="button shrink-0 p-1"
                      onClick={() =>
                        setExpanded((prev) => ({ ...prev, [type]: !prev[type] }))
                      }
                    >
                      <svg
                        width="12"
                        height="6"
                        viewBox="0 0 12 6"
                        fill="none"
                        xmlns="http://www.w3.org/2000/svg"
                        className={clsx(
                          "transition-transform duration-150",
                          !isExpanded && "rotate-180"
                        )}
                      >
                        <path
                          d="M0.75 4.75L5.92241 0.75L10.75 4.75"
                          stroke="#9FA7BA"
                          strokeWidth="1.5"
                          strokeLinecap="round"
                          strokeLinejoin="round"
                        />
                      </svg>
                    </button>
                  </div>
                  {type === "evm" && !isExpanded && (
                    <div className="flex items-center gap-[4px] overflow-x-auto">
                      {EVM_TRADE_CHAINS.map((c) => (
                        <img
                          key={c.blockchain}
                          src={c.chainIcon}
                          alt=""
                          className="size-[16px] rounded-[6px] object-cover shrink-0"
                        />
                      ))}
                    </div>
                  )}
                </div>

                {isExpanded && (
                  <>
                    <div className="mx-[10px] border-t border-[#EDF0F7]" />
                    <div className="px-[15px] py-[14px] flex flex-col gap-[14px] max-h-[300px] overflow-y-auto">
                      {holdings.length === 0 ? (
                        loading ? (
                          <HoldingsSkeleton />
                        ) : (
                          <div className="text-[12px] text-[#9FA7BA] text-center">No balances</div>
                        )
                      ) : (
                        holdings.map((row) => (
                          <button
                            type="button"
                            key={`${row.chainId}-${row.address}`}
                            className="button flex items-center justify-between w-full text-left"
                            onClick={() => onSelectHolding(row)}
                          >
                            <div className="flex items-center gap-[10px]">
                              <div className="relative w-[24px] h-[24px]">
                                <TokenIcon
                                  src={row.icon}
                                  symbol={row.symbol}
                                  blockchain={row.blockchain}
                                  containerClassName="w-full h-full"
                                  className="object-cover"
                                />
                                <img
                                  src={row.chainIcon}
                                  alt=""
                                  className="absolute z-10 -right-[2px] -bottom-[2px] w-[12px] h-[12px] rounded-[4px] border border-white"
                                />
                              </div>
                              <div>
                                <div className="text-[14px] font-medium text-[#444C59]">
                                  {row.symbol}
                                </div>
                                <div className="text-[10px] text-[#9FA7BA]">{row.chainName}</div>
                              </div>
                            </div>
                            <div className="text-right">
                              <div className="text-[14px] font-medium text-[#444C59]">
                                {formatNumber(row.amount, 4, true, { round: Big.roundDown })}
                              </div>
                              <div className="text-[10px] text-[#9FA7BA]">
                                ${formatNumber(row.usd, 2, true, { round: Big.roundDown })}
                              </div>
                            </div>
                          </button>
                        ))
                      )}
                    </div>
                  </>
                )}
              </div>
            );
          })}
        </div>
      </div>
    </Drawer>
  );
}
