import clsx from "clsx";
import useWalletStore from "@/all-tokens/wallet-store";
import useBalancesStore, { type BalancesState } from "@/stores/use-balances";
import { formatNumber } from "@/utils/format/number";
import { useMemo } from "react";
import useTokenBalance from "@/hooks/use-token-balance";
import Loading from "@/components/loading/icon";
import Big from "big.js";
import LazyImage from "@/components/lazy-image";
import TokenIcon from "@/all-tokens/components/token-icon";
import { getStableflowIcon } from "@/utils/format/logo";

export default function Chain({ token, isTo }: any) {
  const walletStore = useWalletStore();

  const openTokenSelect = () => {
    walletStore.set({
      showTokenSelect: true,
      isTo,
    });
  };

  if (!token?.chainType) {
    return (
      <ChainCard
        onClick={openTokenSelect}
      >
        <div className="w-10.5 h-10.5 rounded-full bg-[#dde1e9] overflow-hidden flex justify-center items-center">
          <LazyImage
            src={getStableflowIcon("select-token-2.gif")}
            alt=""
            containerClassName="w-11 md:w-12.5 h-11 md:h-12.5 rounded-full shrink-0 overflow-hidden"
            className="object-center scale-120"
            fallbackSrc={(
              <div className="w-full h-full rounded-full bg-[#EDF0F7]" />
            )}
          />
        </div>
        <div className="w-12 h-4 rounded-md bg-[#EDF0F7] mr-2"></div>
      </ChainCard>
    );
  }

  return (
    <ChainCard
      onClick={openTokenSelect}
    >
      <div className="w-10 h-10 relative isolate">
        <TokenIcon
          src={token?.icon}
          symbol={token?.symbol}
          blockchain={token?.blockchain}
          containerClassName="w-full h-full"
        />
        <LazyImage
          src={token?.chainIcon}
          containerClassName="z-10 w-4.5 h-4.5 rounded-sm border border-white absolute! -right-1 -bottom-1 overflow-hidden"
          fallbackSrc={(
            <div className="w-full h-full rounded-sm bg-[#EDF0F7]"></div>
          )}
        />
      </div>
      <div className="text-[#444C59] text-base font-medium leading-[100%] space-y-1">
        <div className="">
          {token?.symbol}
        </div>
        <div className="text-xs text-[#0E3616] font-normal">
          {token?.chainName}
        </div>
      </div>
    </ChainCard>
  );
}

const WithChain = ({ token, isTo, openWallet }: any) => {
  const balancesStore = useBalancesStore();
  const { loading } = useTokenBalance(token, true);

  const key = `${token.chainType}Balances` as keyof BalancesState;
  const balance = useMemo(() => {
    const _balance = balancesStore[key]?.[token.chainId || token.blockchain]?.[token.contractAddress];
    return _balance ? formatNumber(_balance, 2, true, { round: Big.roundDown }) : "0.00";
  }, [token, balancesStore[key]?.[token.chainId || token.blockchain]?.[token.contractAddress]]);

  return (
    <div
      className={clsx(
        "button w-28 md:w-32.5 h-25 shrink-0 flex flex-col justify-start rounded-xl px-1 md:px-3.5 pt-1.5 hover:bg-[#FAFBFF] button duration-300",
        isTo ? "items-end" : "items-start"
      )}
      onClick={openWallet}
    >
      <div className="relative isolate w-11 md:w-12.5 h-11 md:h-12.5 shrink-0">
        <TokenIcon
          src={token.icon}
          symbol={token.symbol}
          blockchain={token.blockchain}
          containerClassName="w-full h-full"
        />
        <img
          src={token.chainIcon}
          className="absolute z-10 right-[-5px] bottom-[-5px] w-5 md:w-6 h-5 md:h-6 rounded-[6px] border border-white object-center object-contain shrink-0"
        />
      </div>

      <div className="text-[14px] flex items-center gap-1 md:gap-2 mt-[6px]">
        <div className="flex items-center gap-0.5 md:gap-1 leading-[100%] whitespace-nowrap">
          <div className="text-[#444C59] text-[14px] md:text-[16px] font-[500]">{token.symbol}</div>
          <div className="text-[#0E3616] text-[11px] md:text-[12px] font-[400]">{token.chainName}</div>
        </div>
        <img
          src={getStableflowIcon("icon-arrow-down.svg")}
          className="w-[10px] h-[5px] shrink-0 object-center object-contain"
          alt=""
        />
      </div>
      <div className="text-[#9FA7BA] text-[12px]">
        {loading ? <Loading size={12} /> : balance}
      </div>
    </div>
  );
};

const ChainCard = (props: any) => {
  const { children, onClick } = props;

  return (
    <div
      className="cursor-pointer shrink-0 border hover:border-[#B1C2FB] duration-150 border-[#F2F2F2] bg-[#F5F7FD] flex items-center justify-center gap-4 rounded-[13px] py-3 pl-2.5 pr-3"
      onClick={onClick}
    >
      <div className="flex items-center gap-2.5">
        {children}
      </div>
      <img
        src={getStableflowIcon("icon-arrow-down.svg")}
        className="w-[15px] h-[7px] shrink-0 object-center object-contain"
        alt=""
      />
    </div>
  );
};
