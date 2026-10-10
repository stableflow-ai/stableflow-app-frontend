import Big from "big.js";
import { rheaSwapApi } from "./client";
import { buildAppFees } from "./config";
import {
  formatFeeItems,
  resolveEstimateSourceGas,
  resolveQuoteFees,
  resolveTokenUsdPrice,
  type FeeContext,
} from "./fee";
import type {
  RheaNormalizedQuote,
  RheaQuoteRaw,
  RheaQuoteResponse,
} from "./types";
import type { TokenChain } from "@/all-tokens/chains";
import { getRouterDisplayName } from "@/all-tokens/constants";
import { numberRemoveEndZero } from "@/utils/format/number";

const asString = (v: unknown, fallback = "0"): string => {
  if (v == null) return fallback;
  return String(v);
};

const isPresent = (v: unknown): boolean => {
  if (v == null) return false;
  const s = String(v).trim();
  return s !== "";
};

const pickOut = (q: RheaQuoteRaw): string => {
  return asString(q.estimatedOut ?? q.amountOut ?? q.estimatedOutSmallest ?? "0");
};

const pickMinOut = (q: RheaQuoteRaw): string => {
  return asString(q.minAmountOut ?? pickOut(q));
};

/** Parse top-level priceImpact like "-0.04%" / "0.04" / number (already percent). */
const parseTopLevelPriceImpactPercent = (raw: unknown): string | undefined => {
  if (!isPresent(raw)) return undefined;
  try {
    const cleaned = asString(raw).trim().replace(/%/g, "");
    if (!cleaned || cleaned === "-") return undefined;
    return numberRemoveEndZero(Big(cleaned).toFixed(4));
  } catch {
    return undefined;
  }
};

const resolveAmountUsd = (
  amountSmallest: string | undefined,
  token: TokenChain | null | undefined,
  providedUsd?: unknown
): string | undefined => {
  if (isPresent(providedUsd)) return asString(providedUsd);
  if (!amountSmallest || !token) return undefined;
  try {
    const decimals = token.decimals ?? 0;
    const price = resolveTokenUsdPrice({
      address: token.contractAddress || token.assetId,
      alias: token.rheaAlias,
      symbol: token.symbol,
      fallback: token.price,
    });
    if (price <= 0) return undefined;
    const human = Big(amountSmallest).div(Big(10).pow(decimals));
    return human.times(price).toFixed(8);
  } catch {
    return undefined;
  }
};

const pickPriceImpact = (
  q: RheaQuoteRaw,
  route: any,
  estimatedOutUsd: string | number | undefined,
  ctx: FeeContext,
  estimatedOut: string
): { priceImpactUsd?: string; priceImpactUsdPercent?: string } => {
  // 1) Top-level priceImpact (e.g. OpenOcean "-0.04%")
  const topPercent = parseTopLevelPriceImpactPercent(q.priceImpact);
  if (topPercent != null) {
    return { priceImpactUsdPercent: topPercent };
  }

  // 2) raw.route priceImpactUsd* (fraction → percent)
  if (isPresent(route?.priceImpactUsdPercent) || isPresent(route?.priceImpactUsd)) {
    let priceImpactUsdPercent: string | undefined;
    if (isPresent(route?.priceImpactUsdPercent)) {
      try {
        priceImpactUsdPercent = numberRemoveEndZero(
          Big(asString(route.priceImpactUsdPercent)).times(100).toFixed(4)
        );
      } catch {
        priceImpactUsdPercent = asString(route.priceImpactUsdPercent);
      }
    }
    return {
      priceImpactUsd: isPresent(route?.priceImpactUsd) ? asString(route.priceImpactUsd) : undefined,
      priceImpactUsdPercent,
    };
  }

  // 3) USD delta; derive missing legs from amount × token price
  const amountInSmallest =
    isPresent(q.amountIn) ? asString(q.amountIn) : ctx.amountIn;
  const amountInUsd = resolveAmountUsd(amountInSmallest, ctx.fromToken, q.amountInUsd);
  const outUsd = resolveAmountUsd(estimatedOut, ctx.toToken, estimatedOutUsd);

  if (amountInUsd == null || outUsd == null) {
    return {};
  }

  try {
    const inUsd = Big(asString(amountInUsd));
    if (inUsd.eq(0)) return {};
    const out = Big(asString(outUsd));
    const percent = out.minus(inUsd).div(inUsd).times(100);
    const usd = out.minus(inUsd);
    return {
      priceImpactUsd: usd.toFixed(6),
      priceImpactUsdPercent: percent.toFixed(4),
    };
  } catch {
    return {};
  }
};

const quoteKey = (q: RheaQuoteRaw, index: number): string => {
  const router = asString(q.router, "unknown");
  const requestId = asString(q.requestId ?? q.orderId ?? "", "");
  return requestId ? `${router}:${requestId}` : `${router}:${index}:${pickOut(q)}`;
};

export function normalizeQuote(
  q: RheaQuoteRaw,
  index: number,
  isBest = false,
  ctx: FeeContext = {}
): RheaNormalizedQuote {
  const router = asString(q.router, "unknown");
  const routerName = getRouterDisplayName(router, asString(q.routerName, "") || undefined);
  const estimatedOut = pickOut(q);
  const minAmountOut = pickMinOut(q);
  // priceImpact* / outputAmountUsd may come from raw.route (rango-style)
  const route = (q.raw as any)?.route;
  const estimatedOutUsd =
    (q.estimatedOutUsd as string | number | undefined) ?? route?.outputAmountUsd;
  const { fees: rawFees, swapkitSourceGas } = resolveQuoteFees(q, ctx);
  const { fee, totalFeeUsd } = formatFeeItems(rawFees);
  const sourceGas = resolveEstimateSourceGas(q, ctx, swapkitSourceGas);
  const priceImpact = pickPriceImpact(q, route, estimatedOutUsd, ctx, estimatedOut);

  return {
    key: quoteKey(q, index),
    router,
    routerName,
    amountIn: q.amountIn != null ? asString(q.amountIn) : undefined,
    amountOut: estimatedOut,
    estimatedOut,
    estimatedOutFormatted: q.estimatedOutFormatted != null ? asString(q.estimatedOutFormatted) : undefined,
    estimatedOutUsd,
    minAmountOut,
    timeEstimate: typeof q.timeEstimate === "number" ? q.timeEstimate : undefined,
    fee,
    totalFeeUsd,
    estimateSourceGas: sourceGas.estimateSourceGas,
    estimateSourceGasUsd: sourceGas.estimateSourceGasUsd,
    estimateSourceGasLimit: sourceGas.estimateSourceGasLimit,
    ...priceImpact,
    executionType: q.executionType != null ? asString(q.executionType) : undefined,
    fromChain: q.fromChain != null ? asString(q.fromChain) : undefined,
    toChain: q.toChain != null ? asString(q.toChain) : undefined,
    fromAsset: q.fromAsset != null ? asString(q.fromAsset) : undefined,
    toAsset: q.toAsset != null ? asString(q.toAsset) : undefined,
    orderId: q.orderId != null ? asString(q.orderId) : undefined,
    requestId: q.requestId != null ? asString(q.requestId) : undefined,
    resultType: q.resultType != null ? asString(q.resultType) : undefined,
    isBest,
    passThrough: {
      router,
      expectedOut: estimatedOut,
      minAmountOut,
      amountOut: estimatedOut,
      quoteId: q.quoteId != null ? asString(q.quoteId) : undefined,
      preSwap: q.preSwap ?? null,
      bridge: q.bridge,
      market: q.market,
    },
  };
}

export function normalizeQuoteResponse(
  data: RheaQuoteResponse,
  ctx: FeeContext = {}
): {
  quotes: RheaNormalizedQuote[];
  bestKey?: string;
  meta: Pick<RheaQuoteResponse, "chainType" | "executionType" | "isCrossChain" | "errors">;
} {
  const bestRaw = data.bestQuote;
  const quotes = bestRaw ? [normalizeQuote(bestRaw, 0, true, ctx)] : [];

  return {
    quotes,
    bestKey: quotes[0]?.key,
    meta: {
      chainType: data.chainType,
      executionType: data.executionType,
      isCrossChain: data.isCrossChain,
      errors: data.errors,
    },
  };
}

export type QuoteParams = {
  fromChain: string;
  toChain: string;
  tokenIn: string;
  tokenOut: string;
  amountIn: string;
  slippage?: number;
  sender: string;
  recipient?: string;
  fromToken?: TokenChain | { chainName?: string; symbol?: string };
  toToken?: TokenChain | { chainName?: string; symbol?: string };
};

export async function rheaQuote(params: QuoteParams) {
  const appFees = buildAppFees({
    fromToken: params.fromToken,
    toToken: params.toToken,
  });

  const data = await rheaSwapApi<RheaQuoteResponse>("/quote", {
    method: "POST",
    body: JSON.stringify({
      fromChain: params.fromChain,
      toChain: params.toChain,
      tokenIn: params.tokenIn,
      tokenOut: params.tokenOut,
      amountIn: params.amountIn,
      slippage: params.slippage ?? 50,
      sender: params.sender,
      quoteWaitingTimeMs: 6000,
      sameChainTimeoutMs: 1500,
      crossChainTimeoutMs: 6000,
      ...(params.recipient ? { recipient: params.recipient } : {}),
      ...(appFees ? { appFees } : {}),
    }),
  });

  const ctx: FeeContext = {
    fromToken: params.fromToken as TokenChain | undefined,
    toToken: params.toToken as TokenChain | undefined,
    amountIn: params.amountIn,
  };

  return normalizeQuoteResponse(data, ctx);
}
