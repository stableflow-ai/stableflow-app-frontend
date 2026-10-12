import ResultFeeItem from "./fee-item";
import useBridgeStore from "@/all-tokens/bridge-store";
import useWalletStore from "@/all-tokens/wallet-store";
import { formatNumber } from "@/utils/format/number";
import { formatDuration } from "@/utils/format/time";
import Big from "big.js";
import { useMemo } from "react";

const Result = (_props: any) => {
  const bridgeStore = useBridgeStore();
  const walletStore = useWalletStore();

  const quoteData = bridgeStore.quoteDataMap.get(bridgeStore.quoteDataService);
  const isQuoting = bridgeStore.getQuoting();

  const feeRows = useMemo(() => {
    const fees = quoteData?.fee || quoteData?.normalized?.fee || [];
    return Array.isArray(fees) ? fees : [];
  }, [quoteData]);

  if (!quoteData && !isQuoting) return null;

  return (
    <div className="w-full px-5 mt-3 flex flex-col gap-2">
      <ResultFeeItem label="You receive" isFormat={false} loading={isQuoting}>
        {formatNumber(quoteData?.outputAmount || 0, 6, true, {
          isShort: true,
          round: Big.roundDown,
        })}{" "}
        {walletStore.toToken?.symbol || ""}
      </ResultFeeItem>

      <ResultFeeItem label="Min received" isFormat={false} loading={isQuoting}>
        {quoteData?.minAmountOut && walletStore.toToken
          ? `${formatNumber(
            Big(quoteData.minAmountOut).div(Big(10).pow(walletStore.toToken.decimals)),
            6,
            true,
            { isShort: true, round: Big.roundDown }
          )} ${walletStore.toToken.symbol}`
          : "-"}
      </ResultFeeItem>

      {
        !!(quoteData?.timeEstimate || quoteData?.estimateTime) && (
          <ResultFeeItem label="Time" isFormat={false} loading={isQuoting}>
            ~{formatDuration(quoteData?.timeEstimate || quoteData?.estimateTime || 0, { compound: true })}
          </ResultFeeItem>
        )
      }

      {quoteData?.priceImpactUsdPercent != null && (
        <ResultFeeItem label="Price impact" isFormat={false} loading={isQuoting}>
          {quoteData.priceImpactUsdPercent}%
        </ResultFeeItem>
      )}

      {feeRows.length > 0 && (
        <div className="flex flex-col gap-2">
          {feeRows.map((fee: any, idx: number) => {
            const amountFormatted = fee.amountFormatted ?? "0";
            const amountUsd =
              fee.amountUsd ??
              Number(Big(amountFormatted || 0).times(fee.token?.usdPrice ?? 0).toFixed(8));
            const symbol = fee.token?.symbol;
            return (
              <ResultFeeItem
                key={`${fee.name || "fee"}-${idx}`}
                label={fee.name || "Fee"}
                isFormat={false}
                loading={isQuoting}
              >
                {symbol
                  ? `${formatNumber(amountFormatted, 6, true, { round: Big.roundDown })} ${symbol}(${formatNumber(amountUsd, 2, true, { prefix: "$", isZeroPrecision: true, round: Big.roundDown })})`
                  : String(fee.amount || "-")}
              </ResultFeeItem>
            );
          })}
        </div>
      )}
    </div>
  );
};

export default Result;
