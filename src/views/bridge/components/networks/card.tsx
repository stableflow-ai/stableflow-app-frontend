import InputNumber from "@/components/input-number";
import FieldAlert from "@/components/field-alert";
import Chain from "./chain";
import { formatNumber } from "@/utils/format/number";
import Big from "big.js";
import { useMemo } from "react";
import clsx from "clsx";

const NetworkCard = (props: any) => {
  const {
    className,
    rowClassName,
    amount,
    onAmountChange,
    token,
    direction,
    prices,
    disabled,
    children,
    rightContent,
    titleContent,
    valueAlert,
  } = props;

  const value = useMemo(() => {
    let symbol = token?.symbol;
    if (!symbol) {
      return "0";
    }
    if ([/^USDT0$/i, /^USD₮0$/i, /^USD₮$/i].some((reg) => reg.test(symbol))) {
      symbol = "USDT";
    }
    const price = prices?.[token.symbol];
    return Big(amount || 0).times(price || 0);
  }, [prices, amount, token?.symbol]);

  return (
    <div
      className={clsx("w-full pt-2.5 pb-4 bg-white rounded-xl border border-[#F2F2F2]", className)}
    >
      <div className={clsx("w-full flex justify-between items-center gap-2 md:gap-10 pr-2.5 pl-5 select-none", rowClassName)}>
        <div className="flex-1 space-y-2">
          <div className="text-[#9FA7BA] text-sm font-normal leading-[100%] font-['SpaceGrotesk'] select-none">
            {titleContent}
          </div>
          <InputNumber
            className="w-full text-[#444C59] text-[26px] font-['SpaceGrotesk'] font-medium leading-[100%]"
            autoComplete="off"
            name={`${direction}Amount`}
            value={amount || ""}
            onNumberChange={onAmountChange}
            decimals={token?.decimals || 6}
            placeholder="0"
            disabled={direction === "to"}
          />
        </div>
        <Chain key={direction} token={token} isTo={direction === "to"} />
      </div>
      <div className={clsx("w-full flex justify-between items-center gap-2 mt-3 pr-2.5 pl-5", rowClassName)}>
        <FieldAlert active={valueAlert} iconPosition="end">
          <div className={clsx("text-xs text-[#9FA7BA] leading-[100%] font-['SpaceGrotesk] font-normal", disabled ? "opacity-30" : "")}>
            {formatNumber(value, 2, true, { prefix: "$", round: Big.roundDown, isZeroPrecision: true })}
          </div>
        </FieldAlert>
        {rightContent}
      </div>
      {children}
    </div>
  );
};

export default NetworkCard;
