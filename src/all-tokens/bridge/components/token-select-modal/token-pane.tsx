import clsx from "clsx";
import type { TokenChain } from "@/all-tokens/chains";
import Skeleton from "@/components/skeleton";
import TokenIcon from "@/all-tokens/components/token-icon";
import { formatNumber } from "@/utils/format/number";
import { getStableflowIcon } from "@/utils/format/logo";
import Big from "big.js";
import { getTokenUsd } from "./utils";

type TokenPaneProps = {
  search: string;
  onSearchChange: (value: string) => void;
  tokens: TokenChain[];
  getBalance: (token: TokenChain) => string;
  loading: boolean;
  showClose?: boolean;
  showTitle?: boolean;
  onClose?: () => void;
  onSelectToken: (token: TokenChain) => void;
};

function TokensSkeleton() {
  return (
    <>
      {Array.from({ length: 6 }).map((_, i) => (
        <div key={i} className="w-full flex items-center justify-between px-1 py-1">
          <div className="flex items-center gap-[10px]">
            <Skeleton variant="circle" width={32} height={32} />
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

export default function TokenPane({
  search,
  onSearchChange,
  tokens,
  getBalance,
  loading,
  showClose = true,
  showTitle = true,
  onClose,
  onSelectToken,
}: TokenPaneProps) {
  const showSkeleton = tokens.length === 0 && loading;

  return (
    <div className="flex flex-col min-w-0 h-full min-h-0">
      {(showTitle || showClose) && (
        <div className="flex items-center justify-between mb-[16px] shrink-0">
          {showTitle ? (
            <div className="text-[16px] text-black">Select Token</div>
          ) : (
            <div />
          )}
          {showClose && (
            <button
              type="button"
              className="button w-[20px] h-[20px] flex items-center justify-center"
              onClick={onClose}
            >
              <img src={getStableflowIcon("icon-x.svg")} alt="" className="w-3 h-3" />
            </button>
          )}
        </div>
      )}

      <div className="relative h-[40px] rounded-[8px] border border-[#F2F2F2] px-3 flex items-center gap-2 mb-3 shrink-0">
        <img
          src={getStableflowIcon("icon-search.svg")}
          alt=""
          className="w-3.5 h-3.5 opacity-50 shrink-0"
        />
        <input
          value={search}
          onChange={(e) => onSearchChange(e.target.value)}
          placeholder="Search source token and chain"
          className={clsx(
            "flex-1 outline-none text-[14px] text-[#444C59] placeholder:text-[#9FA7BA] placeholder:opacity-50 bg-transparent min-w-0",
            search && "pr-8"
          )}
        />
        {!!search && (
          <button
            type="button"
            className="button absolute right-2 top-1/2 -translate-y-1/2 size-[20px] rounded-full bg-[#EDF0F7] flex items-center justify-center"
            onClick={() => onSearchChange("")}
            aria-label="Clear search"
          >
            <img
              src={getStableflowIcon("icon-x.svg")}
              alt=""
              className="w-2.5 h-2.5"
            />
          </button>
        )}
      </div>

      <div className="flex-1 overflow-y-auto flex flex-col gap-[14px] min-h-0">
        {showSkeleton && <TokensSkeleton />}
        {!showSkeleton && tokens.length === 0 && (
          <div className="text-[12px] text-[#9FA7BA] text-center py-6">No tokens found</div>
        )}
        {!showSkeleton &&
          tokens.map((token) => {
            const balance = getBalance(token);
            const usd = getTokenUsd(token, balance);
            return (
              <button
                key={`${token.blockchain}-${token.contractAddress}-${token.symbol}`}
                type="button"
                className={clsx(
                  "button w-full flex items-center justify-between hover:bg-[#F5F7FD] rounded-[10px] px-1 py-1"
                )}
                onClick={() => onSelectToken(token)}
              >
                <div className="flex items-center gap-[10px]">
                  <div className="relative w-[32px] h-[32px]">
                    <TokenIcon
                      src={token.icon}
                      symbol={token.symbol}
                      blockchain={token.blockchain}
                      containerClassName="w-full h-full"
                      className="object-cover"
                    />
                    <img
                      src={token.chainIcon}
                      alt=""
                      className="absolute z-10 -right-[2px] -bottom-[2px] w-[14px] h-[14px] rounded-[4px] border border-white"
                    />
                  </div>
                  <div className="text-left">
                    <div className="text-[14px] font-medium text-[#444C59]">
                      {token.symbol}
                    </div>
                    <div className="text-[10px] text-[#9FA7BA]">{token.chainName}</div>
                  </div>
                </div>
                <div className="text-right">
                  <div className="text-[14px] font-medium text-[#444C59]">
                    {formatNumber(balance, 4, true, { round: Big.roundDown })}
                  </div>
                  <div className="text-[10px] text-[#9FA7BA]">
                    ${formatNumber(usd, 2, true, { round: Big.roundDown })}
                  </div>
                </div>
              </button>
            );
          })}
      </div>
    </div>
  );
}
