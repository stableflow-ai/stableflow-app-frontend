import type { TokenChain } from "@/all-tokens/chains";
import type { WalletType } from "@/stores/use-wallets";
import { evmRpcFallbackProvider } from "@/utils/evm-rpc-providers";
import { csl } from "@/utils/log";
import { formatTemporarySwapLimitMessage } from "@/utils/quote-error";
import Big from "big.js";

const RPC_REQUEST_LIMIT_ERROR_MESSAGE = "Request limit reached. Please try again later.";
const INVALID_RPC_CONFIGURATION_ERROR_MESSAGE =
  "Invalid RPC configuration. Please check RPC settings or switch to another RPC.";
const INVALID_NETWORK_ERROR_MESSAGE = "Network unstable. Please try again.";
const USER_REJECTED_TRANSACTION_MESSAGE = "User rejected transaction";
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

const USER_REJECTED_ERROR_PATTERNS = [
  "user rejected",
  "user denied",
  "action_rejected",
  "ethers-user-denied",
  "rejected the request",
  "request rejected",
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
  return evmRpcFallbackProvider(fromToken as never);
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
    }

    await wait(POST_APPROVE_ALLOWANCE_RETRY_DELAY);
  }

  throw new Error("Failed to verify approval allowance. You can click the Transfer button to retry.");
};

export const formatBridgeRpcErrorMessage = (errorMessage: string) => {
  const normalizedMessage = errorMessage.toLowerCase();

  if (
    USER_REJECTED_ERROR_PATTERNS.some((pattern) => normalizedMessage.includes(pattern)) ||
    normalizedMessage.includes("\"code\": 4001") ||
    normalizedMessage.includes("code=4001") ||
    normalizedMessage.includes("code: 4001") ||
    normalizedMessage.includes("action_rejected")
  ) {
    return USER_REJECTED_TRANSACTION_MESSAGE;
  }

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

/** Parse Rhea multi-provider quote errors into short BridgeButton-friendly text. */
export const formatRheaQuoteErrorMessage = (errorMessage: string, decimals = 6) => {
  const message = errorMessage || "Quote failed";
  const swapLimitMessage = formatTemporarySwapLimitMessage(message);
  if (swapLimitMessage !== message) {
    return swapLimitMessage;
  }

  const amountTooLowMatch = message.match(
    /Amount is too low for bridge,\s*try at least\s+(\d+(?:\.\d+)?)/i
  );
  if (amountTooLowMatch) {
    try {
      const humanAmount = Big(amountTooLowMatch[1]).div(Big(10).pow(decimals)).toFixed();
      return `Amount is too low for bridge, try at least ${humanAmount}`;
    } catch {
      return "Amount is too low for bridge";
    }
  }

  if (/No liquidity available/i.test(message)) {
    return "No liquidity available";
  }

  // Avoid dumping long multi-provider error blobs onto the button
  if (message.length > 80 || /Cross-chain quote failed/i.test(message)) {
    return "Quote failed";
  }

  return formatBridgeRpcErrorMessage(message);
};

export const formatBridgeError = (error: unknown, fallback = "Transfer failed") => {
  const err = error as any;
  const parts = [
    err?.message,
    err?.code,
    err?.shortMessage,
    err?.reason,
    err?.info?.error?.code,
    err?.info?.error?.message,
  ]
    .filter((v) => v != null && v !== "")
    .map(String);
  return formatBridgeRpcErrorMessage(parts.length ? parts.join(" ") : fallback);
};

export const isUserRejectedError = (error: unknown) => {
  return formatBridgeError(error) === USER_REJECTED_TRANSACTION_MESSAGE;
};

export const isReQuoteError = (error: unknown) => {
  const err = error as any;
  if (err?.code === -2 || err?.code === "-2") return true;
  const message = String(err?.message || err || "").toLowerCase();
  return message.includes("re-quote");
};


/** Sort Rhea quotes by estimated output descending; best flagged items stay preferred */
export const sortQuoteData = (quoteDataMap: Map<string, any>) => {
  const validQuoteList = Array.from(quoteDataMap.entries()).filter(([_, data]) => !data.errMsg);

  return validQuoteList.sort((a: any, b: any) => {
    const [_keyA, dataA] = a;
    const [_keyB, dataB] = b;

    if (!!dataA.isBest !== !!dataB.isBest) {
      return dataA.isBest ? -1 : 1;
    }

    const disabledA = !!dataA.routeDisabled;
    const disabledB = !!dataB.routeDisabled;
    if (disabledA !== disabledB) {
      return disabledA ? 1 : -1;
    }

    const netA = Big(dataA.outputAmount || dataA.estimatedOut || 0);
    const netB = Big(dataB.outputAmount || dataB.estimatedOut || 0);

    if (netB.gt(netA)) return 1;
    if (netA.gt(netB)) return -1;
    return 0;
  });
};

export const routeHybridPath = (_quoteData: any, _service?: string) => {
  return [];
};
