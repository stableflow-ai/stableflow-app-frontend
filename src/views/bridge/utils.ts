import type { TokenChain } from "@/config/chains";
import { Service } from "@/services/constants";
import { QuoteErrorLevel } from "@/services/quote-error";
import { getQuoteModes } from "@/services/utils";
import type { BridgeState } from "@/stores/use-bridge";
import type { BalancesState } from "@/stores/use-balances";
import type { WalletType } from "@/stores/use-wallets";
import { evmRpcFallbackProvider } from "@/utils/evm-rpc-providers";
import { csl } from "@/utils/log";
import Big from "big.js";
import { ethers } from "ethers";

const RPC_REQUEST_LIMIT_ERROR_MESSAGE = "Request limit reached. Please try again later.";
const INVALID_RPC_CONFIGURATION_ERROR_MESSAGE =
  "Invalid RPC configuration. Please check RPC settings or switch to another RPC.";
const INVALID_NETWORK_ERROR_MESSAGE = "Network unstable. Please try again.";
const POST_APPROVE_ALLOWANCE_MAX_RETRIES = 5;
const POST_APPROVE_ALLOWANCE_RETRY_DELAY = 2000;

const RPC_REQUEST_LIMIT_ERROR_PATTERNS = [
  "rate limited",
  "request is being rate limited",
  "request exceeds defined limit",
  "request limit",
];

const INVALID_RPC_CONFIGURATION_ERROR_PATTERNS = [
  "could not coalesce error",
  "missing or invalid parameters",
  "invalid value for value.index",
  "load failed",
  "json-rpc protocol is not supported",
  "unauthorized",
  "unknown rpc error",
];

const INVALID_NETWORK_ERROR_PATTERNS = [
  "no runners?!",
  "failed to fetch",
  "network error",
];

const wait = (duration: number) => new Promise((resolve) => setTimeout(resolve, duration));

type PostApproveAllowanceResult = {
  allowance: string;
  needApprove: boolean;
};

type PostApproveWallet = {
  allowance: (params: Record<string, unknown>) => Promise<PostApproveAllowanceResult>;
};

type ApproveDetailsResult = {
  data?: Record<string, unknown>;
};

const getErrorMessage = (error: unknown) => {
  return error instanceof Error ? error.message : "";
};

export const createEvmAllowanceProvider = (fromToken?: TokenChain) => {
  if (!fromToken?.rpcUrls?.length) return void 0;

  return evmRpcFallbackProvider(fromToken);
};

export const verifyPostApproveAllowance = async (params: {
  wallet: PostApproveWallet;
  chainType: WalletType;
  fromToken?: TokenChain;
  contractAddress: string;
  spender: string;
  address: string;
  amountWei: string;
  approveResult?: ApproveDetailsResult;
}) => {
  const {
    wallet,
    chainType,
    fromToken,
    contractAddress,
    spender,
    address,
    amountWei,
    approveResult,
  } = params;
  const approveData = approveResult?.data || {};
  const approveBlockNumber = typeof approveData.blockNumber === "number" ? approveData.blockNumber : void 0;
  const isEvm = chainType === "evm";
  const evmProvider = isEvm ? createEvmAllowanceProvider(fromToken) : void 0;

  for (let retryIndex = 0; retryIndex < POST_APPROVE_ALLOWANCE_MAX_RETRIES; retryIndex++) {
    try {
      const latestAllowance = await wallet.allowance({
        contractAddress,
        spender,
        address,
        amountWei,
        strict: true,
        provider: evmProvider,
        blockTag: isEvm ? approveBlockNumber : void 0,
      });

      csl("transfer", "blue-600", "latest allowance after approve: %o", {
        chainType,
        token: contractAddress,
        owner: address,
        spender,
        requiredAmount: amountWei,
        allowance: latestAllowance.allowance,
        txHash: approveData.txHash,
        blockNumber: approveData.blockNumber,
        blockTimeStamp: approveData.blockTimeStamp,
        receiptResult: approveData.receiptResult,
        retryIndex,
      });

      if (!latestAllowance.needApprove) {
        return latestAllowance;
      }

      if (retryIndex === POST_APPROVE_ALLOWANCE_MAX_RETRIES - 1) {
        throw new Error("Insufficient approval amount");
      }
    } catch (error: unknown) {
      const errorMessage = getErrorMessage(error);
      if (errorMessage === "Insufficient approval amount") {
        throw error;
      }
      if (retryIndex === POST_APPROVE_ALLOWANCE_MAX_RETRIES - 1) {
        throw new Error(errorMessage ? `Failed to verify approval allowance: ${errorMessage}` : "Failed to verify approval allowance");
      }
      csl("transfer", "yellow-600", "retry verify approval allowance: %o", {
        chainType,
        txHash: approveData.txHash,
        retryIndex,
        error,
      });
    }

    await wait(POST_APPROVE_ALLOWANCE_RETRY_DELAY);
  }

  throw new Error("Failed to verify approval allowance. You can click the Transfer button to retry.");
};

export const formatBridgeRpcErrorMessage = (errorMessage: string) => {
  const normalizedMessage = errorMessage.toLowerCase();

  if (RPC_REQUEST_LIMIT_ERROR_PATTERNS.some((pattern) => normalizedMessage.includes(pattern))) {
    return RPC_REQUEST_LIMIT_ERROR_MESSAGE;
  }

  if (INVALID_RPC_CONFIGURATION_ERROR_PATTERNS.some((pattern) => normalizedMessage.includes(pattern))) {
    return INVALID_RPC_CONFIGURATION_ERROR_MESSAGE;
  }

  if (INVALID_NETWORK_ERROR_PATTERNS.some((pattern) => normalizedMessage.includes(pattern))) {
    return INVALID_NETWORK_ERROR_MESSAGE;
  }

  return errorMessage;
};

export type QuoteSortBalance = {
  /** Source wallet is connected and this token's balance field has been written, including "0". */
  balanceRead: boolean;
  balance?: string | number;
};

export const readSourceTokenBalance = (params: {
  balances: Partial<BalancesState> | Record<string, any>;
  fromToken?: { chainType?: string; chainId?: string | number; blockchain?: string; contractAddress?: string; };
  walletConnected: boolean;
}): QuoteSortBalance => {
  if (!params.walletConnected || !params.fromToken?.chainType || !params.fromToken.contractAddress) {
    return { balanceRead: false };
  }

  const chainKey = params.fromToken.chainId || params.fromToken.blockchain;
  const balances = params.balances as Record<string, any>;
  const chainBalances = balances?.[`${params.fromToken.chainType}Balances`]?.[chainKey as string];
  if (!chainBalances) {
    return { balanceRead: false };
  }

  const raw = chainBalances[params.fromToken.contractAddress];
  if (raw === undefined || raw === null || raw === "") {
    return { balanceRead: false };
  }

  return { balanceRead: true, balance: raw };
};

export const isUnaffordableExactOutput = (service: string, data: any, sourceBalance?: QuoteSortBalance) => {
  if (!sourceBalance?.balanceRead) return false;

  const { isExactOutput } = getQuoteModes({
    quoteData: data,
    bridgeStore: { quoteDataService: service } as BridgeState,
  });
  if (!isExactOutput) return false;

  const amountIn = data?.quote?.amountInFormatted;
  if (amountIn == null || amountIn === "") return false;

  try {
    return Big(amountIn).gt(sourceBalance.balance ?? 0);
  } catch {
    return false;
  }
};

export const sortQuoteData = (quoteDataMap: Map<string, any>, sourceBalance?: QuoteSortBalance) => {
  const validQuoteList = Array.from(quoteDataMap.entries()).filter(([_, data]) => !data.errMsg);

  const sortedQuoteData = validQuoteList.sort((a: any, b: any) => {
    const [_serviceA, dataA] = a;
    const [_serviceB, dataB] = b;

    const unaffordableA = isUnaffordableExactOutput(_serviceA, dataA, sourceBalance);
    const unaffordableB = isUnaffordableExactOutput(_serviceB, dataB, sourceBalance);
    if (unaffordableA !== unaffordableB) {
      return unaffordableA ? 1 : -1;
    }

    const disabledA = !!dataA.routeDisabled;
    const disabledB = !!dataB.routeDisabled;
    if (disabledA !== disabledB) {
      if (disabledA) return 1;
      return -1;
    }

    let netA = Big(dataA.outputAmount || 0);
    let netB = Big(dataB.outputAmount || 0);

    // Usdt0 should minus message fee
    if ([Service.Usdt0, Service.Usdt0OneClick, Service.OneClickUsdt0].includes(_serviceA)) {
      netA = netA.minus(dataA.fees?.nativeFeeUsd || 0);
    }
    if ([Service.Usdt0, Service.Usdt0OneClick, Service.OneClickUsdt0].includes(_serviceB)) {
      netB = netB.minus(dataB.fees?.nativeFeeUsd || 0);
    }

    if ([Service.OneClickUsdt0, Service.OneClickCCTP].includes(_serviceA)) {
      netA = netA.minus(dataA.fees?.destinationGasFeeUsd || 0);
    }
    if ([Service.OneClickUsdt0, Service.OneClickCCTP].includes(_serviceB)) {
      netB = netB.minus(dataB.fees?.destinationGasFeeUsd || 0);
    }

    // csl("QuoteRoutes", "green-500", "%s data: %o, output amount: %o", _serviceA, dataA, netA.toFixed(6, 0));
    // csl("QuoteRoutes", "green-500", "%s data: %o,  output amount: %o", _serviceB, dataB, netB.toFixed(6, 0));

    if (netB.gt(netA)) return 1;
    if (netA.gt(netB)) return -1;

    if (netA.eq(netB)) return 0;

    return 0;
  });

  return sortedQuoteData;
};

// Array.prototype.sort is stable, so routes in the same level keep return order (first returned wins)
export const pickQuoteErrorService = (quoteDataMap: Map<string, any>): string | undefined => {
  const failedQuoteList = Array.from(quoteDataMap.entries()).filter(([_, data]) => !!data?.errMsg);
  const getLevel = (data: any): QuoteErrorLevel => data?.errLevel ?? QuoteErrorLevel.Business;
  failedQuoteList.sort(([, dataA], [, dataB]) => getLevel(dataA) - getLevel(dataB));
  return failedQuoteList[0]?.[0];
};

export const routeHybridPath = (quoteData: any, service: Service) => {
  if (!quoteData) return [];

  const p = quoteData.quoteParam;

  const buildPath = (
    steps: Array<{ from: any; to: any; svc: Service; skip?: boolean }>
  ) =>
    steps
      .filter((s) => !s.skip)
      .map(({ from, to, svc }) => ({ fromToken: from, toToken: to, service: svc }));

  switch (service) {
    case Service.OneClickUsdt0:
      return buildPath([
        { from: p?.fromToken, to: p?.middleToken, svc: Service.OneClick },
        { from: p?.middleToken, to: p?.toToken, svc: Service.Usdt0 },
      ]);
    case Service.OneClickCCTP:
      return buildPath([
        { from: p?.fromToken, to: p?.middleToken, svc: Service.OneClick },
        { from: p?.middleToken, to: p?.toToken, svc: Service.CCTP },
      ]);
    case Service.Usdt0OneClick:
      return buildPath([
        { from: p?.fromToken, to: p?.middleToken, svc: Service.Usdt0 },
        { from: p?.middleToken, to: p?.toToken, svc: Service.OneClick },
      ]);
    case Service.CCTPOneClick:
      return buildPath([
        { from: p?.fromToken, to: p?.middleToken, svc: Service.CCTP },
        { from: p?.middleToken, to: p?.toToken, svc: Service.OneClick },
      ]);
    case Service.OneClickFraxZero:
      return buildPath([
        { from: p?.fromToken, to: p?.middleToken, svc: Service.OneClick, skip: p?.isFromEthereumUSDC },
        { from: p?.middleToken, to: p?.middleToken2, svc: Service.FraxZero },
        { from: p?.middleToken2, to: p?.toToken, svc: Service.FraxZero, skip: p?.isToEthereumFrxUSD },
      ]);
    case Service.FraxZeroOneClick:
      return buildPath([
        { from: p?.fromToken, to: p?.middleToken2, svc: Service.FraxZero, skip: p?.isFromEthereumFrxUSD },
        { from: p?.middleToken2, to: p?.middleToken, svc: Service.FraxZero },
        { from: p?.middleToken, to: p?.toToken, svc: Service.OneClick, skip: p?.isToEthereumUSDC },
      ]);
    default:
      return [];
  }
};
