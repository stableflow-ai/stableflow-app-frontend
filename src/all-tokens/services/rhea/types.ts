export type RheaTokenMeta = {
  address?: string | null;
  blockchain?: string;
  blockchainImage?: string;
  chainId?: string | number;
  decimals?: number;
  image?: string;
  isPopular?: boolean;
  name?: string | null;
  symbol?: string;
  usdPrice?: number;
  supportedSwappers?: string[];
};

export type RheaFeeItem = {
  amount: string;
  amountFormatted?: string;
  amountUsd?: number;
  expenseType?: string;
  name?: string;
  token?: RheaTokenMeta;
  meta?: Record<string, unknown>;
};

export type RheaQuoteRaw = Record<string, unknown>;

/** Normalized quote used by UI + swap pass-through */
export type RheaNormalizedQuote = {
  key: string;
  router: string;
  routerName: string;
  amountIn?: string;
  amountOut: string;
  estimatedOut: string;
  estimatedOutFormatted?: string;
  estimatedOutUsd?: string | number;
  minAmountOut: string;
  timeEstimate?: number;
  fee: RheaFeeItem[];
  totalFeeUsd?: number;
  /** Source-chain gas in native smallest units */
  estimateSourceGas?: string;
  estimateSourceGasUsd?: number;
  estimateSourceGasLimit?: string;
  priceImpactUsd?: string;
  priceImpactUsdPercent?: string;
  executionType?: string;
  fromChain?: string;
  toChain?: string;
  fromAsset?: string;
  toAsset?: string;
  orderId?: string;
  requestId?: string;
  resultType?: string;
  isBest?: boolean;
  /** Fields to pass through to /swap */
  passThrough: {
    router: string;
    expectedOut?: string;
    minAmountOut?: string;
    amountOut?: string;
    quoteId?: string;
    preSwap?: unknown;
    bridge?: unknown;
    market?: unknown;
  };
};

export type RheaQuoteResponse = {
  /** Single best route from /api/swap/quote */
  bestQuote?: RheaQuoteRaw;
  chainType?: string;
  executionType?: string;
  isCrossChain?: boolean;
  errors?: unknown;
};

export type RheaSwapRequest = {
  fromChain: string;
  toChain: string;
  tokenIn: string;
  tokenOut: string;
  amountIn: string;
  slippage?: number;
  sender: string;
  recipient?: string;
  router: string;
  expectedOut?: string;
  minAmountOut?: string;
  amountOut?: string;
  quoteId?: string;
  preSwap?: unknown;
  bridge?: unknown;
  market?: unknown;
};

export type RheaSwapTx = Record<string, unknown> & {
  chainId?: number | string;
  to?: string;
  data?: string;
  value?: string;
  gasLimit?: string;
  maxFeePerGas?: string;
  maxPriorityFeePerGas?: string;
};

export type RheaApproveItem = { spender?: string; tx: RheaSwapTx } | RheaSwapTx;

export type RheaSwapResponse = {
  amountIn?: string;
  approve?: RheaApproveItem | RheaApproveItem[] | null;
  chainType?: string;
  deposit?: {
    depositAddress?: string;
    depositChain?: string;
    depositMemo?: string;
    estimatedOut?: string;
    minAmountOut?: string;
    orderId?: string;
    timeEstimate?: number;
  } | null;
  estimatedOut?: string;
  executionType?: string;
  fromChain?: string;
  isCrossChain?: boolean;
  minAmountOut?: string;
  needsApprove?: boolean;
  router?: string;
  signingRequest?: unknown;
  toChain?: string;
  tokenIn?: { address?: string; decimals?: number; symbol?: string };
  tokenOut?: { address?: string; decimals?: number; symbol?: string };
  tx?: RheaSwapTx | null;
  orderId?: string;
  statusRouter?: string;
};

export type RheaLendingToken = {
  assetId?: string;
  blockchain?: string;
  symbol?: string;
  decimals?: number;
  contractAddress?: string;
  price?: number | string;
  priceUpdatedAt?: number;
  icon?: string;
  name?: string;
};
