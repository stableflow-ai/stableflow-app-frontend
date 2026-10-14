import Big from "big.js";
import type { RheaFeeItem, RheaQuoteRaw, RheaTokenMeta } from "./types";
import { getCachedRheaTokens, getRheaNativePrice, isEvmNativeBalanceToken } from "./tokens";
import {
  RHEA_NATIVE_TOKEN_IDS,
  getRheaChainByAlias,
  type TokenChain,
} from "@/all-tokens/chains";
import useEvmGasFeesStore from "@/stores/use-evm-gas-fees";
import {
  DEFAULT_EVM_AGGREGATOR_GAS_UNITS,
  DEFAULT_EVM_ERC20_TRANSFER_GAS_UNITS,
  DEFAULT_EVM_NATIVE_TRANSFER_GAS_UNITS,
  HEURISTIC_EVM_SWAP_ROUTERS,
  HEURISTIC_NATIVE_FEE_WEI_BY_CHAIN_TYPE,
} from "./config";

const DEFAULT_GAS_PRICE_WEI = 20n * 10n ** 9n; // 20 gwei

const SWAPKIT_FEE_LABELS: Record<string, string> = {
  service: "Service Fee",
  outbound: "Outbound Fee",
  affiliate: "Affiliate Fee",
};

export type FeeContext = {
  fromToken?: TokenChain | null;
  toToken?: TokenChain | null;
  /** Quote request amountIn (smallest units); fallback when quote lacks amountIn */
  amountIn?: string;
};

export type EstimateSourceGasResult = {
  estimateSourceGas?: string;
  estimateSourceGasUsd?: number;
  estimateSourceGasLimit?: string;
};

const asString = (v: unknown, fallback = ""): string => {
  if (v == null) return fallback;
  return String(v);
};

const parsePositiveIntString = (v: unknown): string | null => {
  const s = asString(v, "").trim();
  if (!s || !/^\d+$/.test(s) || BigInt(s) <= 0n) return null;
  return s;
};

const parsePositiveDecimal = (v: unknown): Big | null => {
  try {
    const s = asString(v, "").trim();
    if (!s) return null;
    const n = Big(s);
    if (n.lte(0)) return null;
    return n;
  } catch {
    return null;
  }
};

const resolveAlias = (token?: TokenChain | null, chainHint?: string | number): string => {
  if (token?.rheaAlias) return token.rheaAlias;
  const fromBlockchain = (token?.blockchain || "").toLowerCase();
  if (fromBlockchain) {
    return getRheaChainByAlias(fromBlockchain)?.alias || fromBlockchain;
  }
  const hint = asString(chainHint, "").toLowerCase();
  if (!hint) return "";
  if (/^\d+$/.test(hint)) {
    return token?.rheaAlias || "";
  }
  return getRheaChainByAlias(hint)?.alias || hint;
};

export const resolveTokenUsdPrice = (opts: {
  address?: string | null;
  alias?: string;
  symbol?: string;
  fallback?: number;
}): number => {
  if (opts.fallback != null && Number(opts.fallback) > 0) return Number(opts.fallback);
  const tokens = getCachedRheaTokens();
  const alias = opts.alias || "";
  const addr = (opts.address || "").toLowerCase();
  if (alias && addr) {
    const byAddr = tokens.find(
      (t) =>
        t.rheaAlias === alias &&
        (t.contractAddress?.toLowerCase?.() === addr || t.assetId?.toLowerCase?.() === addr)
    );
    if (byAddr?.price != null && Number(byAddr.price) > 0) return Number(byAddr.price);
  }
  if (alias && opts.symbol) {
    const bySymbol = tokens.find(
      (t) =>
        t.rheaAlias === alias && t.symbol?.toLowerCase() === opts.symbol?.toLowerCase()
    );
    if (bySymbol?.price != null && Number(bySymbol.price) > 0) return Number(bySymbol.price);
  }
  return 0;
};

const getEvmGasPriceWei = (chainId?: number | string): bigint => {
  if (chainId == null || chainId === "") return DEFAULT_GAS_PRICE_WEI;
  const entry = useEvmGasFeesStore.getState().byChainId[String(chainId)];
  if (!entry?.gasPrice) return DEFAULT_GAS_PRICE_WEI;
  try {
    const gp = BigInt(entry.gasPrice);
    return gp > 0n ? gp : DEFAULT_GAS_PRICE_WEI;
  } catch {
    return DEFAULT_GAS_PRICE_WEI;
  }
};

const buildNativeTokenMeta = (ctx: FeeContext, chainHint?: string | number): RheaTokenMeta | null => {
  const from = ctx.fromToken;
  if (!from) return null;
  const alias = resolveAlias(from, chainHint);
  const nativeId = alias ? RHEA_NATIVE_TOKEN_IDS[alias] : undefined;
  const usdPrice = getRheaNativePrice(from);
  return {
    address: nativeId ?? null,
    symbol: from.nativeToken?.symbol,
    decimals: from.nativeToken?.decimals ?? 18,
    chainId: from.chainId ?? chainHint,
    usdPrice: usdPrice > 0 ? usdPrice : undefined,
  };
};

const isEvmNativeToken = (token?: TokenChain | null): boolean => {
  if (!token) return false;
  if (isEvmNativeBalanceToken(token)) return true;
  const addr = (token.contractAddress || "").toLowerCase();
  return (
    addr === "0x0000000000000000000000000000000000000000" ||
    addr === "eth" ||
    token.symbol === "native"
  );
};

const buildEstimateFromNativeWei = (
  amountWei: string,
  ctx: FeeContext,
  chainHint?: string | number,
  gasLimit?: string
): EstimateSourceGasResult => {
  try {
    if (!parsePositiveIntString(amountWei)) return {};
    const token = buildNativeTokenMeta(ctx, chainHint);
    if (!token) return {};
    const decimals = token.decimals ?? 18;
    const amountFormatted = Big(amountWei).div(Big(10).pow(decimals)).toFixed();
    const estimateSourceGasUsd = Number(
      Big(amountFormatted).times(token.usdPrice ?? 0).toFixed(8)
    );
    return {
      estimateSourceGas: amountWei,
      estimateSourceGasUsd,
      ...(gasLimit ? { estimateSourceGasLimit: gasLimit } : {}),
    };
  } catch {
    return {};
  }
};

const buildEstimateFromEvmGasUnits = (
  gasUnits: string,
  gasPriceWei: bigint,
  ctx: FeeContext,
  chainHint?: string | number
): EstimateSourceGasResult => {
  try {
    const amount = (BigInt(gasUnits) * gasPriceWei).toString();
    return buildEstimateFromNativeWei(amount, ctx, chainHint, gasUnits);
  } catch {
    return {};
  }
};

const buildEstimateFromUsd = (
  gasCostUsd: string | number,
  ctx: FeeContext,
  chainHint?: string | number
): EstimateSourceGasResult => {
  try {
    const usd = Big(asString(gasCostUsd, "0"));
    if (usd.lte(0)) return {};
    const token = buildNativeTokenMeta(ctx, chainHint);
    if (!token) {
      return { estimateSourceGasUsd: Number(usd.toFixed(8)) };
    }
    const price = token.usdPrice ?? 0;
    let amount = "0";
    if (price > 0) {
      amount = usd.div(price).times(Big(10).pow(token.decimals ?? 18)).round(0, Big.roundDown).toFixed(0);
    }
    return {
      estimateSourceGas: amount,
      estimateSourceGasUsd: Number(usd.toFixed(8)),
    };
  } catch {
    return {};
  }
};

const hasEstimate = (est: EstimateSourceGasResult): boolean => {
  if (est.estimateSourceGasUsd != null && Number(est.estimateSourceGasUsd) > 0) return true;
  if (est.estimateSourceGas && parsePositiveIntString(est.estimateSourceGas)) return true;
  return false;
};

const pickTopLevelGasUnits = (q: RheaQuoteRaw): string | null => {
  return parsePositiveIntString(q.gasEstimate) || parsePositiveIntString(q.gas);
};

const isSwapkitFeeItem = (item: unknown): boolean => {
  if (!item || typeof item !== "object") return false;
  const rec = item as Record<string, unknown>;
  return typeof rec.type === "string" && typeof rec.asset === "string";
};

/** Parse SwapKit asset like "ETH.ETH" or "BSC.USDT-0x55d3..." */
const parseSwapkitAsset = (
  asset: string
): { chain: string; symbol: string; address?: string } => {
  const [chainPart, rest = ""] = asset.split(".");
  const chain = (chainPart || "").toUpperCase();
  if (!rest) return { chain, symbol: chain };
  const dash = rest.indexOf("-");
  if (dash >= 0) {
    return {
      chain,
      symbol: rest.slice(0, dash),
      address: rest.slice(dash + 1),
    };
  }
  return { chain, symbol: rest };
};

const resolveSwapkitTokenMeta = (
  asset: string,
  ctx: FeeContext
): RheaTokenMeta => {
  const parsed = parseSwapkitAsset(asset);
  const alias =
    getRheaChainByAlias(parsed.chain.toLowerCase())?.alias ||
    parsed.chain.toLowerCase();

  let decimals = 18;
  if (parsed.symbol.toUpperCase() === "USDT" || parsed.symbol.toUpperCase() === "USDC") {
    // Prefer cached token decimals when available
    const tokens = getCachedRheaTokens();
    const found = tokens.find(
      (t) =>
        t.rheaAlias === alias &&
        (parsed.address
          ? t.contractAddress?.toLowerCase() === parsed.address.toLowerCase()
          : t.symbol?.toLowerCase() === parsed.symbol.toLowerCase())
    );
    if (found?.decimals != null) decimals = found.decimals;
    else if (alias === "bsc" || alias === "eth" || alias === "arbitrum") decimals = 18;
    else decimals = 6;
  } else if (parsed.symbol.toUpperCase() === "BTC") {
    decimals = 8;
  }

  // Prefer source native decimals for inbound ETH.ETH etc.
  if (
    ctx.fromToken?.nativeToken?.symbol?.toUpperCase() === parsed.symbol.toUpperCase()
  ) {
    decimals = ctx.fromToken.nativeToken.decimals ?? decimals;
  }

  const usdPrice = resolveTokenUsdPrice({
    address: parsed.address,
    alias,
    symbol: parsed.symbol,
    fallback:
      ctx.fromToken?.nativeToken?.symbol?.toUpperCase() === parsed.symbol.toUpperCase()
        ? getRheaNativePrice(ctx.fromToken)
        : ctx.fromToken?.symbol?.toUpperCase() === parsed.symbol.toUpperCase()
          ? ctx.fromToken.price
          : undefined,
  });

  return {
    address: parsed.address ?? null,
    symbol: parsed.symbol,
    decimals,
    blockchain: parsed.chain,
    usdPrice: usdPrice > 0 ? usdPrice : undefined,
  };
};

/**
 * Normalize SwapKit fee[] (human-readable amounts, type/asset).
 * inbound → estimateSourceGas; others → protocol fee rows.
 */
export function normalizeSwapkitFees(
  rawFees: unknown[],
  ctx: FeeContext
): { fees: RheaFeeItem[]; sourceGas: EstimateSourceGasResult } {
  const fees: RheaFeeItem[] = [];
  let sourceGas: EstimateSourceGasResult = {};

  for (const raw of rawFees) {
    if (!isSwapkitFeeItem(raw)) continue;
    const item = raw as Record<string, unknown>;
    const type = asString(item.type, "").toLowerCase();
    const asset = asString(item.asset, "");
    const human = parsePositiveDecimal(item.amount);
    if (!human) continue;

    const token = resolveSwapkitTokenMeta(asset, ctx);
    const decimals = token.decimals ?? 18;
    const amountWei = human.times(Big(10).pow(decimals)).round(0, Big.roundDown).toFixed(0);
    const amountUsd = Number(human.times(token.usdPrice ?? 0).toFixed(8));

    if (type === "inbound") {
      sourceGas = {
        estimateSourceGas: amountWei,
        estimateSourceGasUsd: amountUsd,
      };
      continue;
    }

    const name = SWAPKIT_FEE_LABELS[type];
    if (!name) continue;

    fees.push({
      name,
      amount: amountWei,
      amountFormatted: human.toFixed(),
      amountUsd,
      expenseType: "FROM_SOURCE_WALLET",
      token,
      meta: { swapkitType: type, asset },
    });
  }

  return { fees, sourceGas };
};

const buildCowProtocolFees = (q: RheaQuoteRaw, ctx: FeeContext): RheaFeeItem[] => {
  const fees: RheaFeeItem[] = [];
  const raw = q.raw as Record<string, unknown> | undefined;
  const quote = raw?.quote as Record<string, unknown> | undefined;
  if (!quote) return fees;

  const feeAmount = parsePositiveIntString(quote.feeAmount);
  const from = ctx.fromToken;
  if (feeAmount && from) {
    const alias = resolveAlias(from);
    const sellToken = asString(quote.sellToken, from.contractAddress);
    const usdPrice = resolveTokenUsdPrice({
      address: sellToken,
      alias,
      symbol: from.symbol,
      fallback: from.price,
    });
    fees.push({
      name: "Protocol Fee",
      amount: feeAmount,
      expenseType: "FROM_SOURCE_WALLET",
      token: {
        address: sellToken,
        symbol: from.symbol,
        decimals: from.decimals,
        chainId: from.chainId,
        usdPrice: usdPrice > 0 ? usdPrice : undefined,
      },
    });
  }
  return fees;
};

const buildAppFeesItems = (q: RheaQuoteRaw, ctx: FeeContext): RheaFeeItem[] => {
  const appFees = q.appFees;
  if (!Array.isArray(appFees) || appFees.length === 0) return [];

  const from = ctx.fromToken;
  if (!from) return [];

  const amountIn = parsePositiveIntString(q.amountIn) || parsePositiveIntString(ctx.amountIn);
  if (!amountIn) return [];

  let totalBps = Big(0);
  for (const item of appFees) {
    const fee = (item as { fee?: unknown })?.fee;
    if (fee == null || asString(fee, "").trim() === "") continue;
    try {
      const bps = Big(asString(fee));
      if (bps.gt(0)) totalBps = totalBps.plus(bps);
    } catch {
      // skip invalid entry
    }
  }
  if (totalBps.lte(0)) return [];

  try {
    const amount = Big(amountIn).times(totalBps).div(10000).round(0, Big.roundDown).toFixed(0);
    if (BigInt(amount) <= 0n) return [];

    const alias = resolveAlias(from);
    const usdPrice = resolveTokenUsdPrice({
      address: from.contractAddress || from.assetId,
      alias,
      symbol: from.symbol,
      fallback: from.price,
    });

    return [
      {
        name: "Bridge Fee",
        amount,
        expenseType: "FROM_SOURCE_WALLET",
        token: {
          address: from.contractAddress || from.assetId,
          symbol: from.symbol,
          decimals: from.decimals,
          chainId: from.chainId,
          usdPrice: usdPrice > 0 ? usdPrice : undefined,
        },
      },
    ];
  } catch {
    return [];
  }
};

const resolveParaswapSourceGas = (q: RheaQuoteRaw, ctx: FeeContext): EstimateSourceGasResult => {
  const raw = q.raw as Record<string, unknown> | undefined;
  const priceRoute = (raw?.priceRoute || raw) as Record<string, unknown> | undefined;
  const gasCostUsd =
    priceRoute?.gasCostUSD ?? q.gasCostUSD ?? (priceRoute as any)?.gasCostUsd;
  const chainHint = priceRoute?.network ?? q.chainId ?? ctx.fromToken?.chainId;

  if (gasCostUsd != null && asString(gasCostUsd, "").trim() !== "") {
    return buildEstimateFromUsd(gasCostUsd as string | number, ctx, chainHint as string | number);
  }

  const gasUnits = pickTopLevelGasUnits(q) || parsePositiveIntString(priceRoute?.gasCost);
  if (gasUnits) {
    const gasPrice = getEvmGasPriceWei(ctx.fromToken?.chainId ?? (chainHint as string | number));
    return buildEstimateFromEvmGasUnits(gasUnits, gasPrice, ctx, chainHint as string | number);
  }
  return {};
};

const resolveCowSourceGas = (q: RheaQuoteRaw, ctx: FeeContext): EstimateSourceGasResult => {
  const raw = q.raw as Record<string, unknown> | undefined;
  const quote = raw?.quote as Record<string, unknown> | undefined;
  if (!quote) return {};
  const gasAmount = parsePositiveIntString(quote.gasAmount);
  const gasPriceStr = parsePositiveIntString(quote.gasPrice);
  if (gasAmount && gasPriceStr) {
    return buildEstimateFromEvmGasUnits(
      gasAmount,
      BigInt(gasPriceStr),
      ctx,
      ctx.fromToken?.chainId
    );
  }
  return {};
};

const resolveTransferSourceGas = (ctx: FeeContext): EstimateSourceGasResult => {
  const from = ctx.fromToken;
  if (!from) return {};
  const chainType = from.chainType || "";

  if (chainType === "evm") {
    const units = isEvmNativeToken(from)
      ? DEFAULT_EVM_NATIVE_TRANSFER_GAS_UNITS
      : DEFAULT_EVM_ERC20_TRANSFER_GAS_UNITS;
    const gasPrice = getEvmGasPriceWei(from.chainId);
    return buildEstimateFromEvmGasUnits(units, gasPrice, ctx, from.chainId);
  }

  const wei = HEURISTIC_NATIVE_FEE_WEI_BY_CHAIN_TYPE[chainType];
  if (wei) return buildEstimateFromNativeWei(wei, ctx, from.chainId);
  return {};
};

const resolveHeuristicChainSourceGas = (ctx: FeeContext): EstimateSourceGasResult => {
  const from = ctx.fromToken;
  if (!from) return {};
  const chainType = from.chainType || "";

  if (chainType === "evm") {
    // Should not reach here for generic EVM without units; use swap default as last resort
    const gasPrice = getEvmGasPriceWei(from.chainId);
    return buildEstimateFromEvmGasUnits(
      DEFAULT_EVM_AGGREGATOR_GAS_UNITS,
      gasPrice,
      ctx,
      from.chainId
    );
  }

  const wei = HEURISTIC_NATIVE_FEE_WEI_BY_CHAIN_TYPE[chainType];
  if (wei) return buildEstimateFromNativeWei(wei, ctx, from.chainId);
  return {};
};

/**
 * Resolve source-chain gas estimate (not included in fee[] protocol fees).
 */
export function resolveEstimateSourceGas(
  q: RheaQuoteRaw,
  ctx: FeeContext = {},
  preset?: EstimateSourceGasResult
): EstimateSourceGasResult {
  if (preset && hasEstimate(preset)) return preset;

  const router = asString(q.router, "").toLowerCase();

  if (router === "swapkit") {
    // inbound handled in normalizeSwapkitFees; if missing, fall through
  }

  if (router === "paraswap") {
    const est = resolveParaswapSourceGas(q, ctx);
    if (hasEstimate(est)) return est;
  }

  if (router === "cow") {
    const est = resolveCowSourceGas(q, ctx);
    if (hasEstimate(est)) return est;
  }

  const chainType = ctx.fromToken?.chainType;
  const gasUnits = pickTopLevelGasUnits(q);
  if (gasUnits && (!chainType || chainType === "evm")) {
    const chainId = ctx.fromToken?.chainId ?? (q.chainId as string | number | undefined);
    if (chainId != null && chainId !== "") {
      const est = buildEstimateFromEvmGasUnits(gasUnits, getEvmGasPriceWei(chainId), ctx, chainId);
      if (hasEstimate(est)) return est;
    }
  }

  // nearintents: deposit/transfer style
  if (router === "nearintents") {
    return resolveTransferSourceGas(ctx);
  }

  if (HEURISTIC_EVM_SWAP_ROUTERS.has(router) && (!chainType || chainType === "evm")) {
    const chainId = ctx.fromToken?.chainId ?? (q.chainId as string | number | undefined);
    if (chainId != null && chainId !== "") {
      const est = buildEstimateFromEvmGasUnits(
        DEFAULT_EVM_AGGREGATOR_GAS_UNITS,
        getEvmGasPriceWei(chainId),
        ctx,
        chainId
      );
      if (hasEstimate(est)) return est;
    }
  }

  // Non-EVM (or remaining) without quote gas fields
  if (chainType && chainType !== "evm") {
    return resolveHeuristicChainSourceGas(ctx);
  }

  return {};
}

/**
 * Resolve protocol/bridge fee items only (excludes source gas / Network Fee).
 */
export function resolveQuoteFees(q: RheaQuoteRaw, ctx: FeeContext = {}): {
  fees: RheaFeeItem[];
  swapkitSourceGas?: EstimateSourceGasResult;
} {
  let fees: RheaFeeItem[] = [];
  let swapkitSourceGas: EstimateSourceGasResult | undefined;

  const existing = q.fee;
  const router = asString(q.router, "").toLowerCase();

  if (Array.isArray(existing) && existing.length > 0) {
    if (existing.every(isSwapkitFeeItem) || router === "swapkit") {
      const normalized = normalizeSwapkitFees(existing, ctx);
      fees = normalized.fees;
      swapkitSourceGas = normalized.sourceGas;
    } else {
      // Rhea-style fee rows: drop legacy "Network Fee" (moved to estimateSourceGas)
      fees = (existing as RheaFeeItem[]).filter((item) => {
        const name = asString(item?.name, "").toLowerCase();
        return name !== "network fee";
      });
    }
  } else if (router === "cow") {
    fees = buildCowProtocolFees(q, ctx);
  }

  const appFeeItems = buildAppFeesItems(q, ctx);
  if (appFeeItems.length > 0) {
    fees = [...fees, ...appFeeItems];
  }

  return { fees, swapkitSourceGas };
}

export function formatFeeItems(fees: RheaFeeItem[]): {
  fee: RheaFeeItem[];
  totalFeeUsd: number;
} {
  let totalFeeUsd = Big(0);
  const fee = fees.map((item) => {
    const decimals = item.token?.decimals ?? 0;
    let amountFormatted = item.amountFormatted ?? "0";
    let amountUsd = item.amountUsd ?? 0;
    try {
      // If amountFormatted was pre-set (e.g. SwapKit human amount) and amountUsd exists, keep them
      const hasPreformatted =
        item.amountFormatted != null &&
        asString(item.amountFormatted, "").trim() !== "" &&
        item.amountUsd != null;

      if (hasPreformatted) {
        amountFormatted = asString(item.amountFormatted, "0");
        amountUsd = Number(item.amountUsd);
      } else if (item.amount != null && asString(item.amount, "0") !== "0") {
        amountFormatted = Big(item.amount || 0).div(Big(10).pow(decimals)).toFixed();
        amountUsd = Number(
          Big(amountFormatted).times(item.token?.usdPrice ?? 0).toFixed(8)
        );
      } else if (item.amountUsd != null) {
        amountUsd = Number(item.amountUsd);
        amountFormatted = item.amountFormatted ?? "0";
      }
      totalFeeUsd = totalFeeUsd.plus(amountUsd || 0);
    } catch {
      amountFormatted = "0";
      amountUsd = 0;
    }
    return {
      ...item,
      amountFormatted,
      amountUsd,
    };
  });
  return { fee, totalFeeUsd: Number(totalFeeUsd.toFixed(8)) };
}

/** Build estimateSourceGas from wallet.estimateTransferGas result. */
export function estimateSourceGasFromTransferResult(
  estimateGasWei: string | bigint,
  ctx: FeeContext,
  gasLimit?: string | bigint
): EstimateSourceGasResult {
  return buildEstimateFromNativeWei(
    String(estimateGasWei),
    ctx,
    ctx.fromToken?.chainId,
    gasLimit != null ? String(gasLimit) : undefined
  );
}
