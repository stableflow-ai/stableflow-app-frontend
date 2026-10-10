import clsx from "clsx";
import chains, { type ChainType, type RheaWalletType, type TokenChain } from "@/all-tokens/chains";
import useWalletsStore from "@/stores/use-wallets";
import useBalancesStore, { type BalancesState } from "@/stores/use-balances";
import ChainTypeIcon from "@/all-tokens/components/chain-type-icon";
import Address from "@/all-tokens/wallet/address";
import { formatNumber } from "@/utils/format/number";
import Big from "big.js";
import { useMemo } from "react";
import { sumChainUsd, sumTypeUsd } from "./utils";

const NON_EVM_ORDER: RheaWalletType[] = ["sol", "near", "tron", "aptos", "sui", "ton", "btc", "zcash"];

type ChainPaneProps = {
  chainFilter: string;
  onSelectFilter: (filter: string) => void;
  tokens: TokenChain[];
  hideTitle?: boolean;
};

function formatUsd(value: number) {
  return `$${formatNumber(value, 2, true, { round: Big.roundDown })}`;
}

export default function ChainPane({
  chainFilter,
  onSelectFilter,
  tokens,
  hideTitle = false,
}: ChainPaneProps) {
  const wallets = useWalletsStore();
  const balancesStore = useBalancesStore();

  const evmChains = useMemo(
    () =>
      Object.values(chains).filter(
        (c) => c.chainType === "evm" && c.tradeEnabled
      ) as ChainType[],
    []
  );

  const evmChainUsd = useMemo(() => {
    const map = new Map<string, number>();
    for (const chain of evmChains) {
      map.set(
        chain.blockchain,
        sumChainUsd(chain, tokens, balancesStore.evmBalances)
      );
    }
    return map;
  }, [evmChains, tokens, balancesStore.evmBalances]);

  const sortedEvmChains = useMemo(
    () =>
      [...evmChains].sort(
        (a, b) =>
          (evmChainUsd.get(b.blockchain) || 0) -
          (evmChainUsd.get(a.blockchain) || 0)
      ),
    [evmChains, evmChainUsd]
  );

  const evmTotalUsd = useMemo(() => {
    let sum = 0;
    for (const v of evmChainUsd.values()) sum += v;
    return sum || Number(balancesStore.evmBalances?.totalUsd || 0);
  }, [evmChainUsd, balancesStore.evmBalances]);

  const topEvmIcons = useMemo(() => {
    const withBalance = sortedEvmChains.filter(
      (c) => (evmChainUsd.get(c.blockchain) || 0) > 0
    );
    const source = withBalance.length > 0 ? withBalance : sortedEvmChains;
    return source.slice(0, 4);
  }, [sortedEvmChains, evmChainUsd]);

  const nonEvmChains = useMemo(() => {
    return NON_EVM_ORDER.map((type) => {
      const cfg = Object.values(chains).find(
        (c) => c.chainType === type && (c.tradeEnabled || c.walletEnabled)
      );
      return cfg ? { type, cfg } : null;
    }).filter(Boolean) as { type: RheaWalletType; cfg: ChainType }[];
  }, []);

  const evmConnected = !!wallets.evm?.account;

  return (
    <div className="flex flex-col gap-[10px]">
      {!hideTitle && <div className="text-[16px] text-black">Select Chain</div>}

      <div className="rounded-[10px] bg-[#F5F7FD] p-[12px]">
        <div className="flex items-start justify-between gap-2 mb-[8px]">
          <div className="flex items-center gap-[6px] min-w-0">
            <div className="grid grid-cols-2 items-center shrink-0">
              {topEvmIcons.map((c) => (
                <img
                  key={c.blockchain}
                  src={c.chainIcon}
                  alt=""
                  className="w-[12px] h-[12px] rounded-[4px] border border-white object-cover"
                />
              ))}
            </div>
            <span className="text-[13px] font-medium text-[#444C59]">EVM-based</span>
          </div>
          {evmConnected ? (
            <span className="text-[12px] text-[#9FA7BA] shrink-0">
              {formatUsd(evmTotalUsd)}
            </span>
          ) : (
            <button
              type="button"
              className="button text-[13px] text-[#6284F5] font-medium shrink-0"
              onClick={(e) => {
                e.stopPropagation();
                wallets.evm?.connect?.();
              }}
            >
              Connect
            </button>
          )}
        </div>

        {evmConnected && (
          <div className="mb-[10px]">
            <Address
              type="evm"
              walletIconClassName="!size-[10px]"
              addressClassName="!text-[10px]"
              copyButtonClassName="!size-[10px]"
              disconnectButtonClassName="!size-[10px]"
            />
          </div>
        )}

        <div className="grid grid-cols-2 gap-2">
          <button
            type="button"
            className={clsx(
              "button rounded-[8px] bg-white px-2 py-2 text-left h-[40px] flex items-center justify-center",
              chainFilter === "evm" && "border border-[#6284F5]"
            )}
            onClick={() => onSelectFilter("evm")}
          >
            <span className="text-[13px] font-medium text-[#444C59]">All</span>
          </button>
          {sortedEvmChains.map((c) => {
            const usd = evmChainUsd.get(c.blockchain) || 0;
            const selected =
              chainFilter === c.blockchain || chainFilter === c.rheaHttpChainId;
            return (
              <button
                key={c.blockchain}
                type="button"
                className={clsx(
                  "button rounded-[8px] bg-white px-2 py-2 text-left h-[40px] flex items-center justify-between gap-1",
                  selected && "border border-[#6284F5]"
                )}
                onClick={() => onSelectFilter(c.blockchain)}
              >
                <img
                  src={c.chainIcon}
                  alt=""
                  className="size-[24px] rounded-[6px] object-cover shrink-0"
                />
                <span className="text-[12px] text-[#444C59] truncate">
                  {formatUsd(usd)}
                </span>
              </button>
            );
          })}
        </div>
      </div>

      {nonEvmChains.map(({ type, cfg }) => {
        const wallet = (wallets as any)[type] as {
          account?: string;
          connect?: () => void;
        };
        const connected = !!wallet?.account;
        const bagKey = `${type}Balances` as keyof BalancesState;
        const total = sumTypeUsd(type, tokens, balancesStore[bagKey] as any);
        const selected = chainFilter === cfg.blockchain;

        return (
          <div
            key={type}
            role="button"
            tabIndex={0}
            className={clsx(
              "button min-h-[50px] rounded-[10px] bg-[#F5F7FD] px-[12px] py-[8px] flex items-center justify-between gap-2 cursor-pointer",
              selected && "ring-1 ring-[#6284F5]"
            )}
            onClick={() => onSelectFilter(cfg.blockchain)}
            onKeyDown={(e) => {
              if (e.key === "Enter" || e.key === " ") {
                e.preventDefault();
                onSelectFilter(cfg.blockchain);
              }
            }}
          >
            <div className="flex items-center gap-2 flex-1 min-w-0">
              <ChainTypeIcon type={type} />
              <div className="min-w-0">
                <div className="text-[13px] font-medium text-[#444C59]">
                  {cfg.chainName}
                </div>
                {connected && (
                  <div
                    className="mt-[2px]"
                    onClick={(e) => e.stopPropagation()}
                  >
                    <Address
                      type={type as any}
                      walletIconClassName="!size-[10px]"
                      addressClassName="!text-[10px]"
                      copyButtonClassName="!size-[10px]"
                      disconnectButtonClassName="!size-[10px]"
                    />
                  </div>
                )}
              </div>
            </div>
            {connected ? (
              <span className="text-[12px] text-[#9FA7BA] shrink-0">
                {formatUsd(total)}
              </span>
            ) : (
              <button
                type="button"
                className="button text-[13px] text-[#6284F5] font-medium shrink-0"
                onClick={(e) => {
                  e.stopPropagation();
                  wallet?.connect?.();
                }}
              >
                Connect
              </button>
            )}
          </div>
        );
      })}
    </div>
  );
}
