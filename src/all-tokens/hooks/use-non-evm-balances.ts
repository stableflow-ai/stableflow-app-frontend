import { useEffect, useRef } from "react";
import Big from "big.js";
import { useDebounceFn } from "ahooks";
import useWalletsStore, { type WalletType } from "@/stores/use-wallets";
import useBalancesStore from "@/stores/use-balances";
import { getCachedRheaTokens, fetchRheaTokens } from "@/all-tokens/services/rhea/tokens";
import { numberRemoveEndZero } from "@/utils/format/number";
import { csl } from "@/utils/log";

const NON_EVM_TYPES: WalletType[] = ["sol", "near", "tron", "aptos", "sui", "btc", "zcash"];
const CONCURRENCY = 6;

async function mapPool<T, R>(
  items: T[],
  concurrency: number,
  mapper: (item: T, index: number) => Promise<R>,
  shouldStop: () => boolean
): Promise<R[]> {
  const results: R[] = new Array(items.length);
  let nextIndex = 0;

  const workers = Array.from({ length: Math.min(concurrency, items.length) }, async () => {
    while (true) {
      if (shouldStop()) return;
      const i = nextIndex++;
      if (i >= items.length) return;
      results[i] = await mapper(items[i], i);
    }
  });

  await Promise.all(workers);
  return results;
}

export default function useNonEvmBalances(enabled = false) {
  const wallets = useWalletsStore();
  const balancesStore = useBalancesStore();
  const abortControllerRef = useRef<AbortController | null>(null);
  const requestIdRef = useRef(0);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const cancel = () => {
    abortControllerRef.current?.abort();
    abortControllerRef.current = null;
    requestIdRef.current += 1;
    if (timerRef.current) {
      clearInterval(timerRef.current);
      timerRef.current = null;
    }
  };

  const getBalances = async (params?: { from?: string }) => {
    if (!enabled) return;
    csl("useNonEvmBalances", "pink-700", "request balances from: %o", params?.from);

    abortControllerRef.current?.abort();
    const abortController = new AbortController();
    abortControllerRef.current = abortController;
    const currentRequestId = ++requestIdRef.current;

    const isStale = () =>
      abortController.signal.aborted || currentRequestId !== requestIdRef.current;

    let tokens = getCachedRheaTokens();
    if (!tokens.length) {
      try {
        tokens = await fetchRheaTokens();
      } catch {
        csl("useNonEvmBalances", "yellow-600", "failed to fetch Rhea tokens");
        return;
      }
    }
    if (isStale()) return;
    if (!tokens.length) {
      csl("useNonEvmBalances", "yellow-600", "no Rhea tokens cached yet");
      return;
    }

    for (const type of NON_EVM_TYPES) {
      if (isStale()) return;

      const wallet = wallets[type];
      if (!wallet?.account || !wallet?.wallet) continue;

      const requestAccount = wallet.account;
      const typeTokens = tokens.filter((t) => t.chainType === type);
      if (!typeTokens.length) continue;

      const next: Record<string, any> = {};
      let totalUsd = 0;

      await mapPool(
        typeTokens,
        CONCURRENCY,
        async (token) => {
          if (isStale()) return null;
          const currentAccount = useWalletsStore.getState()[type]?.account;
          if (!currentAccount || currentAccount !== requestAccount) return null;

          try {
            const raw = await wallet.wallet.balanceOf(token, requestAccount, {
              isCatchError: true,
            });
            if (isStale()) return null;

            const amount = numberRemoveEndZero(
              Big(raw || 0)
                .div(10 ** token.decimals)
                .toFixed(token.decimals, Big.roundDown)
            );

            const chainKey = String(token.chainId ?? token.blockchain);
            if (!next[chainKey]) next[chainKey] = {};
            next[chainKey][token.contractAddress] = amount;
            if (token.contractAddress?.toLowerCase) {
              next[chainKey][token.contractAddress.toLowerCase()] = amount;
            }

            const price = Number(token.price || 0);
            if (price > 0 && Big(amount || 0).gt(0)) {
              totalUsd += Number(Big(amount).times(price));
            }
          } catch (error) {
            csl("useNonEvmBalances", "red-500", "%s token failed: %o", type, error);
          }
          return null;
        },
        isStale
      );

      if (isStale()) return;

      const currentAccount = useWalletsStore.getState()[type]?.account;
      if (!currentAccount || currentAccount !== requestAccount) continue;

      next.totalUsd = totalUsd;
      balancesStore.set({ [`${type}Balances`]: next });
    }
  };

  const { run: debouncedGetBalances } = useDebounceFn(getBalances, { wait: 400 });

  useEffect(() => {
    if (!enabled) {
      cancel();
      return;
    }

    getBalances({ from: "connect" });
    timerRef.current = setInterval(() => {
      debouncedGetBalances({ from: "interval" });
    }, 30000);

    return () => {
      cancel();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [
    enabled,
    wallets.sol?.account,
    wallets.near?.account,
    wallets.tron?.account,
    wallets.aptos?.account,
    wallets.sui?.account,
    wallets.btc?.account,
    wallets.zcash?.account,
  ]);

  return { getBalances: debouncedGetBalances, cancel };
}
