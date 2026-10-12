import { getRouterLogo, getRouterDisplayName } from "@/all-tokens/constants";
import useBridgeStore from "@/all-tokens/bridge-store";
import { formatNumber } from "@/utils/format/number";
import { formatDuration } from "@/utils/format/time";
import { getStableflowIcon } from "@/utils/format/logo";
import TokenIcon from "@/all-tokens/components/token-icon";
import useIsMobile from "@/hooks/use-is-mobile";
import Big from "big.js";
import clsx from "clsx";
import { motion } from "framer-motion";

const QuoteRoute = (props: any) => {
  const { service, data, selected, onSelect, isBest } = props;
  const isMobile = useIsMobile();
  const bridgeStore = useBridgeStore();

  const router = data?.router || data?.normalized?.router || "";
  const routerName = data?.routerName || getRouterDisplayName(router);
  const logo = getRouterLogo(router, isMobile);
  const estimateTime = data?.timeEstimate ?? data?.estimateTime ?? 0;

  return (
    <motion.div
      className={clsx(
        "button w-full h-8.5 shrink-0 rounded-[8px] bg-[#FFFFFF] border border-[#F2F2F2] flex justify-between items-center gap-1 md:gap-2.5 pl-2 md:pl-3 pr-2 md:pr-3",
        bridgeStore.transferring ? "cursor-not-allowed!" : "cursor-pointer",
      )}
      onClick={() => {
        if (bridgeStore.transferring) return;
        onSelect?.();
      }}
      animate={{
        backgroundImage: selected
          ? "linear-gradient(0deg, rgba(98, 132, 245, 0.10) 0%, rgba(98, 132, 245, 0.10) 100%)"
          : "none",
        borderColor: selected ? "#6284F5" : "#F2F2F2",
      }}
    >
      <div className="flex items-center justify-start gap-[5px] min-w-0">
        {logo ? (
          <img
            src={logo}
            alt={routerName}
            title={routerName}
            className={clsx(
              "object-left object-contain shrink-0",
              isMobile ? "size-4" : "w-15.5 h-4",
            )}
          />
        ) : null}
        {(!logo || !isMobile) && (
          <span
            className={clsx(
              "text-[11px] text-[#444C59] font-medium max-w-[90px] truncate",
              logo && "hidden md:inline",
            )}
            title={routerName}
          >
            {routerName}
          </span>
        )}
        {isBest && (
          <div className="w-9 h-4.5 rounded-xl bg-[#DAF1CD] text-[#6CB53F] flex justify-center items-center text-[10px] font-medium leading-[100%] shrink-0">
            Best
          </div>
        )}
      </div>
      <div className="flex items-center justify-end gap-1.5 md:gap-2.5 text-xs font-normal text-[#444C59] leading-[100%]">
        {
          !!estimateTime && (
            <>
              <div className="flex items-center gap-[4px]">
                <img
                  src={getStableflowIcon("icon-time.svg")}
                  alt=""
                  className="w-[14px] h-[14px] object-center object-contain shrink-0"
                />
                <div
                  className={clsx(
                    estimateTime > 300 && "text-[#E53935]",
                    estimateTime > 60 && estimateTime <= 300 && "text-[#F9A825]",
                  )}
                >
                  ~{formatDuration(estimateTime, { compound: true })}
                </div>
              </div>
              <div className="w-[1px] h-[14px] bg-[#B3BBCE] shrink-0" />
            </>
          )
        }
        <div className="flex items-center gap-[4px]">
          <TokenIcon
            src={data?.quoteParam?.toToken?.icon}
            symbol={data?.quoteParam?.toToken?.symbol}
            blockchain={data?.quoteParam?.toToken?.blockchain}
            containerClassName="w-[14px] h-[14px]"
            className="object-center object-contain"
          />
          <div>
            {formatNumber(data.outputAmount, 2, true, {
              prefix: "~",
              isShort: true,
              isShortUppercase: true,
              round: Big.roundDown,
            })}
          </div>
        </div>
      </div>
    </motion.div>
  );
};

export default QuoteRoute;
