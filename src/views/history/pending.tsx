import { formatAddress } from "@/utils/format/address";
import clsx from "clsx";
import dayjs from "dayjs";
import { formatNumber } from "@/utils/format/number";
import { useEffect, useMemo, useState } from "react";
import { useHistoryStore } from "@/stores/use-history";
import { TradeProject, TradeProjectMap } from "@/config/trade";
import usdt0Service from "@/services/usdt0";
import { useDebounceFn, useRequest } from "ahooks";
import useWalletsStore from "@/stores/use-wallets";
import useToast from "@/hooks/use-toast";
import { useAccount, useSwitchChain } from "wagmi";
import { arbitrum } from "viem/chains";
import Loading from "@/components/loading/icon";
import { csl } from "@/utils/log";
import { getStableflowIcon } from "@/utils/format/logo";
import TokenIcon from "@/all-tokens/components/token-icon";
import { getRouterLogo } from "@/all-tokens/constants";
import { useAllTokensStore } from "@/all-tokens/store";
import { PendingSkeleton, PendingTitleSkeleton } from "./loading";

export default function Pending(props: any) {
  const { className, isTitle = true, contentClassName, history } = props;

  const wallets = useWalletsStore();
  const toast = useToast();
  const evmAccount = useAccount();
  const { switchChain } = useSwitchChain();

  const pendingLength = history.page.total || history.list.length;
  const showSkeleton = history.loading && !history.list.length;

  const [layerzeroDataMap, setLayerzeroDataMap] = useState<any>();
  const { run: getLayerzeroData, cancel: cancelGetLayerzeroData } = useDebounceFn(async () => {
    if (!history.list.length) return;
    const layerzeroHistory = history.list.filter((_history: any) => _history.project === TradeProject.Usdt0);
    if (!layerzeroHistory.length) return;
    const layerzeroData = await Promise.all(layerzeroHistory.map((_history: any) => {
      return usdt0Service.getLayerzeroData(_history);
    }));

    const _layerzeroDataMap: any = {};
    layerzeroHistory.forEach((_history: any, index: number) => {
      const currentLayerzeroData = layerzeroData[index];
      if (!currentLayerzeroData) return;
      // SIMULATION_REVERTED
      const needRetry = !!currentLayerzeroData.destination?.lzCompose &&
        !!currentLayerzeroData.destination?.lzCompose?.status &&
        currentLayerzeroData.destination.lzCompose.status !== "N/A" &&
        currentLayerzeroData.destination.lzCompose.status !== "SUCCEEDED" &&
        currentLayerzeroData.destination?.lzCompose?.failedTx?.length > 0 &&
        currentLayerzeroData.source?.tx?.payload;
      _layerzeroDataMap[_history.deposit_address] = {
        ...currentLayerzeroData,
        needRetry,
      };
    });

    setLayerzeroDataMap(_layerzeroDataMap);
  }, { wait: 1000 });

  const layerzeroHistoryKey = useMemo(() => {
    if (!history.list.length) return "";
    const layerzeroHistory = history.list.filter((_history: any) => _history.project === TradeProject.Usdt0);
    return layerzeroHistory.map((_history: any) => _history.deposit_address).sort().join(",");
  }, [history.list]);

  useEffect(() => {
    cancelGetLayerzeroData();
    getLayerzeroData();

    return () => {
      cancelGetLayerzeroData();
    };
  }, [layerzeroHistoryKey]);

  return (
    <div className={clsx("mt-[12px] rounded-[12px] px-[15px] md:px-[30px] pt-[20px] pb-[30px] bg-white border border-[#F2F2F2] shadow-[0_0_6px_0_rgba(0,0,0,0.10)]", className)}>
      {
        isTitle && (
          <div className="text-[16px] font-[500]">
            {showSkeleton ? (
              <PendingTitleSkeleton />
            ) : (
              <>{pendingLength} Pending transfers</>
            )}
          </div>
        )
      }
      <div className={clsx("mt-[14px] grid grid-cols-1 md:grid-cols-2 gap-[18px]", contentClassName)}>
        {showSkeleton ? (
          <PendingSkeleton />
        ) : (
          history.list.map((item: any, index: number) => (
            <PendingItem
              key={index}
              data={item}
              layerzeroData={layerzeroDataMap?.[item.deposit_address]}
              wallets={wallets}
              toast={toast}
              evmAccount={evmAccount}
              switchChain={switchChain}
              getList={history.getList}
            />
          ))
        )}
      </div>
      {!showSkeleton && pendingLength === 0 && (
        <div className="text-[14px] font-[300] opacity-50 text-center">
          No Data.
        </div>
      )}
    </div>
  );
}

const PendingItem = ({ className, data, layerzeroData, wallets, toast, evmAccount, switchChain, getList }: any) => {
  const allTokensEnabled = useAllTokensStore((state) => state.enabled);
  const historyStore = useHistoryStore();
  const routeLogo = allTokensEnabled
    ? getRouterLogo(data.rhea_router)
    : TradeProjectMap[data.project as TradeProject]?.logo;

  const wallet = wallets["evm"];

  const duration = useMemo(() => {
    const currentHistory = historyStore.history[data.deposit_address];

    if (!currentHistory) return "";

    if (currentHistory.timeEstimate <= 60) {
      return `${currentHistory.timeEstimate} sec${currentHistory.timeEstimate > 1 ? "s" : ""}`;
    }
    if (currentHistory.timeEstimate <= 3600) {
      return `${Math.floor(currentHistory.timeEstimate / 60)} min${currentHistory.timeEstimate / 60 > 1 ? "s" : ""}`;
    }
    return `${Math.floor(currentHistory.timeEstimate / 3600)} hour${currentHistory.timeEstimate / 3600 > 1 ? "s" : ""}`;
  }, [data.deposit_address, historyStore.history]);

  const buttonText = useMemo(() => {
    if (!wallet?.account) {
      return "Connect Wallet";
    }
    if (evmAccount && evmAccount.chainId !== arbitrum.id) {
      return "Switch to Arbitrum";
    }
    return "Retry";
  }, [evmAccount, wallet?.account]);

  const { runAsync: handleRetry, loading: retryLoading } = useRequest(async () => {
    if (!wallet?.account) {
      wallet.connect();
      return;
    }
    if (evmAccount && evmAccount.chainId !== arbitrum.id) {
      switchChain({ chainId: arbitrum.id });
      return;
    }

    try {
      const txhash = await wallet.wallet.retryLayerzeroLzComponse({
        layerzeroData,
        history: data,
      });
      if (txhash) {
        toast.success({
          title: "Retry layerzero lz compose success",
        });
      } else {
        toast.fail({
          title: "Retry layerzero lz compose failed",
        });
      }
    } catch (error: any) {
      csl("PendingItem handleRetry", "red-500", "retry layerzero lz compose failed: %o", error);
      let errorMessage = error.message;
      if (errorMessage.includes("user rejected action")) {
        errorMessage = "User rejected transaction";
      }
      toast.fail({
        title: "Retry layerzero lz compose failed",
        text: errorMessage.slice(0, 100) + (errorMessage.length > 100 ? "..." : ""),
      });
    }

    // after retry, refresh the pending list
    getList?.();
  }, {
    manual: true,
  });

  return (
    <div className={clsx("w-full md:w-[300px] bg-[#EDF0F7] rounded-[12px]", className)}>
      <div className="rounded-[12px] bg-white border border-[#EDF0F7] p-[12px] pt-[6px]">
        <div className="mb-2 flex justify-between items-center">
          {routeLogo ? (
            <img
              src={routeLogo}
              alt=""
              className="w-[62px] h-[16px] object-left object-contain shrink-0"
            />
          ) : (
            <span className="w-[62px] h-[16px] shrink-0" />
          )}
          {
            layerzeroData?.needRetry && (
              <button
                type="button"
                className="leading-[100%] button flex justify-center items-center gap-1 text-[12px] font-[500] bg-[#6284F5] shadow-[0_2px_6px_0_rgba(0,0,0,0.10)] text-white px-2 py-1 rounded-xl disabled:opacity-50 disabled:cursor-not-allowed duration-150"
                onClick={handleRetry}
                disabled={retryLoading}
              >
                {
                  retryLoading && (
                    <Loading size={12} />
                  )
                }
                <div className="">
                  {buttonText}
                </div>
              </button>
            )
          }
        </div>
        <div className="flex items-center gap-[10px]">
          {allTokensEnabled ? (
            <TokenIcon
              symbol={data.symbol}
              blockchain={data.from_chain}
              containerClassName="w-[28px] h-[28px] shrink-0"
              className="object-center object-contain"
            />
          ) : (
            <img
              src={data.token_icon}
              alt=""
              className="w-[28px] h-[28px]"
            />
          )}
          <span>
            <span className="text-[16px] font-bold">
              {formatNumber(data.token_in_amount, 2, true)}
            </span>{" "}
            <span className="text-[12px] font-[500]">
              {data.symbol}
            </span>
          </span>
          <img
            src={getStableflowIcon("icon-arrow-right.svg")}
            alt=""
            className="w-[5px] h-[8px] object-center object-contain shrink-0"
          />
          {allTokensEnabled ? (
            <TokenIcon
              symbol={data.to_symbol}
              blockchain={data.to_chain}
              containerClassName="w-[28px] h-[28px] shrink-0"
              className="object-center object-contain"
            />
          ) : (
            <img
              src={data.to_token_icon}
              alt=""
              className="w-[28px] h-[28px]"
            />
          )}
          <span>
            <span className="text-[16px] font-bold">
              {formatNumber(data.token_out_amount, 2, true)}
            </span>{" "}
            <span className="text-[12px] font-[500]">
              {data.to_symbol}
            </span>
          </span>
        </div>
        {
          !!duration ? (
            <div className="mt-[10px] text-[12px] font-[400] text-[#999]">
              Estimated ~{duration} due to settlement/queue.
            </div>
          ) : (
            <div className="mt-[10px] h-[18px]">
            </div>
          )
        }
        <div className="mt-[10px] flex items-center justify-between">
          <ChainAndAddress
            data={data.source_chain}
            address={data.address}
            token={{
              symbol: data.symbol,
              icon: data.token_icon,
            }}
          />
          <img
            src={getStableflowIcon("icon-arrow-right.svg")}
            alt=""
            className="w-[5px] h-[8px] object-center object-contain shrink-0"
          />
          <ChainAndAddress
            data={data.destination_chain}
            address={data.receive_address}
            token={{
              symbol: data.to_symbol,
              icon: data.to_token_icon,
            }}
          />
        </div>
      </div>
      <div className="h-[30px] text-[12px] font-[400] text-center leading-[30px] flex justify-center items-center">
        {dayjs(data.create_time).format("MMM D, YYYY h:mm A")}
      </div>
    </div>
  );
};

const ChainAndAddress = ({ className, data, address, token }: any) => {
  return (
    <div className={clsx("flex items-center gap-[6px]", className)}>
      <div
        className="relative w-[26px] h-[26px] bg-center bg-contain bg-no-repeat"
        style={{
          backgroundImage: `url(${data?.chainIcon})`,
        }}
      >
        {/* <img
          src={data?.chainIcon}
          alt=""
          className="w-[12px] h-[12px] absolute right-[-4px] bottom-[-2px] z-[1] object-center object-contain"
        /> */}
      </div>
      <div>
        <div className="text-[12px] font-[500]">{data?.chainName}</div>
        <div className="text-[12px] font-[400]">
          {formatAddress(address, 5, 4)}
        </div>
      </div>
    </div>
  );
};
