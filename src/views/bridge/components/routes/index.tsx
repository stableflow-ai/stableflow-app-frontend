import QuoteRoute from "./route";
import useBridgeStore from "@/stores/use-bridge";
import { useMemo } from "react";
import { readSourceTokenBalance, sortQuoteData } from "../../utils";
import useWalletStore from "@/stores/use-wallet";
import useWalletsStore, { type WalletType } from "@/stores/use-wallets";
import useBalancesStore from "@/stores/use-balances";
import Big from "big.js";

const QuoteRoutes = (props: any) => {
  const { } = props;

  const {
    quotingMap,
    getQuoting,
    quoteDataMap,
    quoteDataService,
    set,
    showRoutes,
    amount,
  } = useBridgeStore();
  const {
    fromToken,
    toToken,
  } = useWalletStore();
  const wallets = useWalletsStore();
  const balancesStore = useBalancesStore();
  const sourceWalletConnected = !!wallets[fromToken?.chainType as WalletType]?.account;
  const sourceBalance = useMemo(
    () => readSourceTokenBalance({
      balances: balancesStore,
      fromToken,
      walletConnected: sourceWalletConnected,
    }),
    [balancesStore, fromToken, sourceWalletConnected],
  );

  const isQuoting = useMemo(() => {
    return getQuoting();
  }, [quotingMap]);

  const quoteDataList = useMemo(() => {
    const sortedQuoteData = sortQuoteData(quoteDataMap, sourceBalance);
    const list = sortedQuoteData.map(([service, data]) => ({
      service,
      ...data,
    }));
    // Sort selected item to the first position
    // return list.sort((a, b) => {
    //   const aSelected = quoteDataService === a.service;
    //   const bSelected = quoteDataService === b.service;
    //   if (aSelected && !bSelected) return -1;
    //   if (!aSelected && bSelected) return 1;
    //   return 0;
    // });
    return list;
  }, [quoteDataMap, sourceBalance]);

  const displayedList = showRoutes ? quoteDataList : quoteDataList.slice(0, 1);

  return (
    <div className="w-full pl-5 pr-5.5 mt-2.5 flex flex-col gap-1.5 overflow-hidden">
      {
        displayedList?.length > 0
          ? displayedList.map((data, index) => (
            <QuoteRoute
              isBest={index === 0}
              key={data.service}
              service={data.service}
              data={data}
              selected={quoteDataService === data.service}
              onSelect={() => {
                if (quoteDataService === data.service) {
                  return;
                }
                set({
                  quoteDataService: data.service,
                });
              }}
            />
          ))
          : (
            isQuoting ? (
              <div className="text-center text-[12px]">
                Quoting...
              </div>
            )
              : (
                <div className="text-center text-[12px]">
                  {
                    (!!fromToken?.symbol && !!toToken?.symbol && !!amount && Big(amount).gt(0))
                      ? "No routes found"
                      : ""
                  }
                </div>
              )
          )
      }
    </div>
  );
};

export default QuoteRoutes;
