import { BASE_API_URL } from "@/config/api";
import stableChains from "@/config/chains";
import rheaChains from "@/all-tokens/chains";
import { stablecoinLogoMap } from "@/config/tokens";
import { useIsAllTokens } from "@/all-tokens/route-mode";
import { ALL_TOKENS_TRADE_TYPE, STABLECOIN_TRADE_TYPE } from "@/all-tokens/config";
import { TradeProject, TradeProjectMap } from "@/config/trade";
import { Service } from "@/services/constants";
import { getQuoteModes } from "@/services/utils";
import { useHistoryStore } from "@/stores/use-history";
import useWalletsStore from "@/stores/use-wallets";
import { useDebounceFn, useRequest } from "ahooks";
import axios from "axios";
import { useEffect, useMemo, useRef, useState } from "react";

export function usePendingHistory(history?: any) {
  const wallets = useWalletsStore();
  const historyStore = useHistoryStore();
  const allTokensEnabled = useIsAllTokens();
  const pendingRefreshNonce = useHistoryStore((state) => state.pendingRefreshNonce);
  const chains = allTokensEnabled ? rheaChains : stableChains;
  const tradeType = allTokensEnabled ? ALL_TOKENS_TRADE_TYPE : STABLECOIN_TRADE_TYPE;

  const [list, setList] = useState<any>([]);
  const [page, setPage] = useState<any>({
    current: 1,
    size: 100,
    total: 0,
    totaPage: 0,
  });

  const accounts = useMemo(() => {
    const _accounts = Object.values(wallets ?? {}).map((wallet) => wallet.account).filter((account) => !!account);
    return _accounts.join(",");
  }, [wallets]);

  const listPollingRef = useRef<any>(null);
  const lastRefreshNonceRef = useRef(pendingRefreshNonce);
  const requestSeqRef = useRef(0);
  const [awaiting, setAwaiting] = useState(false);
  const { runAsync: getList, loading } = useRequest(async (params?: any) => {
    const requestId = params?.requestId ?? requestSeqRef.current;
    try {
      const response = await axios({
        url: `${BASE_API_URL}/v1/trades`,
        params: {
          type: tradeType,
          status: "pending",
          address: params?.address ?? accounts,
          page: params?.page ?? page.current,
          page_size: page.size,
        },
        method: "GET",
        timeout: 30000,
        headers: {
          "Content-Type": "application/json"
        },
      });

      if (requestId !== requestSeqRef.current) return;

      if (response.status !== 200) {
        return;
      }

      if (response.data.code !== 200) {
        return;
      }

      const servicePendingNumber: any = {};
      const servicePendingNumberWithPermit: any = {};

      const _list = response.data.data.data;
      _list.forEach((item: any) => {
        if (!allTokensEnabled) {
          item.token_icon = stablecoinLogoMap[item.symbol];
          item.to_token_icon = stablecoinLogoMap[item.to_symbol];
        }

        const currentFromChain = Object.values(chains).find((chain) => chain.blockchain === item.from_chain);
        const currentToChain = Object.values(chains).find((chain) => chain.blockchain === item.to_chain);

        item.source_chain = currentFromChain;
        item.destination_chain = currentToChain;

        if (item.from_chain === "tron") {
          item.tx_hash = item.tx_hash?.replace(/^0x/, "");
        }
        if (item.to_chain === "tron") {
          item.to_tx_hash = item.to_tx_hash?.replace(/^0x/, "");
        }

        if (TradeProjectMap[item.project as TradeProject]) {
          const _service = TradeProjectMap[item.project as TradeProject].service;
          if (servicePendingNumber[_service]) {
            servicePendingNumber[_service] = servicePendingNumber[_service] + 1;
          } else {
            servicePendingNumber[_service] = 1;
          }

          const setServicePendingNumberWithPermit = () => {
            if (servicePendingNumberWithPermit[_service]) {
              servicePendingNumberWithPermit[_service] = servicePendingNumberWithPermit[_service] + 1;
            } else {
              servicePendingNumberWithPermit[_service] = 1;
            }
          };
          const { isPermitWithNonce } = getQuoteModes({
            quoteData: {},
            bridgeStore: ({ quoteDataService: _service } as any),
          });
          if (isPermitWithNonce) {
            const isOneClickFraxZero = _service === Service.OneClickFraxZero;
            const isFraxZeroOneClick = _service === Service.FraxZeroOneClick;
            if (isOneClickFraxZero) {
              const isFromEthereumUSDC = item.from_chain === "eth";
              if (!isFromEthereumUSDC) {
                setServicePendingNumberWithPermit();
              }
            }
            else if (isFraxZeroOneClick) {
              const isFromEthereumFrxUSD = item.from_chain === "eth";
              if (!isFromEthereumFrxUSD) {
                setServicePendingNumberWithPermit();
              }
            }
            else {
              setServicePendingNumberWithPermit();
            }
          }
        }
      });

      setList((prev: any) => {
        if (_list.length < prev.length) {
          history?.getList?.({
            address: params?.address ?? accounts,
            page: history.page.current,
          });
        }
        historyStore.updatePendingNumber(_list.length);
        historyStore.updateServicePendingNumber({ services: servicePendingNumber });
        historyStore.updateServicePendingNumberWithPermit({ services: servicePendingNumberWithPermit });
        return _list;
      });
      setPage((prev: any) => {
        return {
          ...prev,
          current: params?.page ?? page.current,
          total: response.data.data.total,
          totalPage: response.data.data.total_page,
        };
      });

      if (_list.length > 0) {
        listPollingRef.current = setTimeout(() => {
          getList({ ...params, requestId });
        }, 10000);
      }
    } catch (error) {
      console.error("get pending history failed: %o", error);
    } finally {
      if (requestId === requestSeqRef.current) {
        setAwaiting(false);
      }
    }
  }, {
    manual: true,
  });

  const { run: debouncedGetList, cancel: cancelGetList } = useDebounceFn(getList, {
    wait: 1000,
  });

  useEffect(() => {
    cancelGetList();
    if (listPollingRef.current) {
      clearTimeout(listPollingRef.current);
      listPollingRef.current = null;
    }
    const requestId = ++requestSeqRef.current;
    if (!accounts) {
      setAwaiting(false);
      setList([]);
      historyStore.updatePendingNumber(0);
      historyStore.updateServicePendingNumber({ isClear: true });
      historyStore.updateServicePendingNumberWithPermit({ isClear: true });
      setPage(() => {
        return {
          current: 1,
          size: 10,
          total: 0,
          totaPage: 0,
        };
      });
      return;
    }

    setList([]);
    setAwaiting(true);
    debouncedGetList({
      address: accounts,
      page: 1,
      requestId,
    });

    return () => {
      cancelGetList();
    };
  }, [accounts, allTokensEnabled]);

  useEffect(() => {
    if (!accounts) return;
    if (lastRefreshNonceRef.current === pendingRefreshNonce) return;
    lastRefreshNonceRef.current = pendingRefreshNonce;
    if (pendingRefreshNonce <= 0) return;
    getList({
      address: accounts,
      page: 1,
    });
  }, [pendingRefreshNonce, accounts]);

  return {
    list,
    page,
    loading: loading || awaiting,
    getList,
    debouncedGetList,
  };
}
