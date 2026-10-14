import QuoteRoute from "./route";
import useBridgeStore from "@/all-tokens/bridge-store";
import { useMemo } from "react";
import { sortQuoteData } from "../../utils";
import useWalletStore from "@/all-tokens/wallet-store";
import Big from "big.js";

const QuoteRoutes = (_props: any) => {
  const {
    quotingMap,
    getQuoting,
    quoteDataMap,
    quoteDataService,
    set,
    showRoutes,
    amount,
  } = useBridgeStore();
  const { fromToken, toToken } = useWalletStore();

  const isQuoting = useMemo(() => getQuoting(), [quotingMap]);

  const quoteDataList = useMemo(() => {
    const sortedQuoteData = sortQuoteData(quoteDataMap);
    return sortedQuoteData.map(([key, data]) => ({
      service: key,
      ...data,
    }));
  }, [quoteDataMap, quoteDataService]);

  const displayedList = showRoutes ? quoteDataList : quoteDataList.slice(0, 1);

  return (
    <div className="w-full pl-5 pr-5.5 mt-2.5 flex flex-col gap-1.5 overflow-hidden">
      {displayedList?.length > 0 ? (
        displayedList.map((data, index) => (
          <QuoteRoute
            isBest={!!data.isBest || index === 0}
            key={data.service}
            service={data.service}
            data={data}
            selected={quoteDataService === data.service}
            onSelect={() => {
              if (quoteDataService === data.service) return;
              set({
                quoteDataService: data.service,
                ...(data.router ? { lastSelectedRouter: data.router } : {}),
              });
            }}
          />
        ))
      ) : isQuoting ? (
        <div className="text-center text-[12px]">Quoting...</div>
      ) : (
        <div className="text-center text-[12px]">
          {!!fromToken?.symbol && !!toToken?.symbol && !!amount && Big(amount).gt(0)
            ? "No routes found"
            : ""}
        </div>
      )}
    </div>
  );
};

export default QuoteRoutes;
