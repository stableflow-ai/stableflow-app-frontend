import { BASE_API_URL } from "@/config/api";
import stableChains from "@/config/chains";
import rheaChains from "@/all-tokens/chains";
import { stablecoinLogoMap } from "@/config/tokens";
import { useIsAllTokens } from "@/all-tokens/route-mode";
import { ALL_TOKENS_TRADE_TYPE, STABLECOIN_TRADE_TYPE } from "@/all-tokens/config";
import useWalletsStore from "@/stores/use-wallets";
import { useDebounceFn, useRequest } from "ahooks";
import axios from "axios";
import { useEffect, useMemo, useRef, useState } from "react";

export function useHistory() {
  const wallets = useWalletsStore();
  const allTokensEnabled = useIsAllTokens();
  const chains = allTokensEnabled ? rheaChains : stableChains;
  const tradeType = allTokensEnabled ? ALL_TOKENS_TRADE_TYPE : STABLECOIN_TRADE_TYPE;

  const [list, setList] = useState<any>([]);
  const [page, setPage] = useState<any>({
    current: 1,
    size: 10,
    total: 0,
    totaPage: 0,
  });

  const accounts = useMemo(() => {
    const _accounts = Object.values(wallets ?? {}).map((wallet) => wallet.account).filter((account) => !!account);
    return _accounts.join(",");
  }, [wallets]);

  const requestSeqRef = useRef(0);
  const [awaiting, setAwaiting] = useState(false);

  const { runAsync: getList, loading } = useRequest(async (params?: any) => {
    const requestId = params?.requestId ?? requestSeqRef.current;
    try {
      const response = await axios({
        url: `${BASE_API_URL}/v1/trades`,
        params: {
          type: tradeType,
          status: "success,failed,continue",
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
      });

      setList(() => {
        return _list;
      });
      setPage((prev: any) => {
        return {
          ...prev,
          current: params.page,
          total: response.data.data.total,
          totalPage: response.data.data.total_page,
        };
      });
    } catch (error) {
      console.error("get history failed: %o", error);
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
    const requestId = ++requestSeqRef.current;
    if (!accounts) {
      setAwaiting(false);
      setList([]);
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
  }, [accounts, allTokensEnabled]);

  const handleChangePage = (page: number) => {
    if (loading) return;
    getList({
      address: accounts,
      page,
    });
  };

  return {
    list,
    page,
    loading: loading || awaiting,
    handleChangePage,
    getList,
  };
}
