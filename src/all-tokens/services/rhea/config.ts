export const BridgeFee = [
  {
    includeChains: ["BNB Chain", "Tron"],
    recipient: "reffer.near",
    // No bridge fee will be charged temporarily
    fee: 1, // 100=1% 1=0.01%
  },
];

/** Default EVM aggregator swap gas units when quote has no gasEstimate (bitget/binance). */
export const DEFAULT_EVM_AGGREGATOR_GAS_UNITS = "350000";

/** EVM native transfer gas units (nearintents deposit / plain transfer). */
export const DEFAULT_EVM_NATIVE_TRANSFER_GAS_UNITS = "21000";

/** Native gas token ids used by Rhea / OpenOcean swap payloads. */
export const NATIVE_EVM_TOKEN_ADDRESSES = new Set([
  "0x0000000000000000000000000000000000000000",
  "0xeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeee",
]);

/** EVM ERC20 transfer gas units (nearintents deposit / plain transfer). */
export const DEFAULT_EVM_ERC20_TRANSFER_GAS_UNITS = "65000";

/**
 * Routers that get heuristic EVM swap gas when quote lacks gasEstimate/gas.
 */
export const HEURISTIC_EVM_SWAP_ROUTERS = new Set(["bitget", "binance"]);

/** @deprecated Use HEURISTIC_EVM_SWAP_ROUTERS */
export const HEURISTIC_EVM_FEE_ROUTERS = HEURISTIC_EVM_SWAP_ROUTERS;

/**
 * Native-token smallest-unit fee heuristics when quote has no gas fields.
 * Values are already in native wei/lamports/yocto/sun/etc.
 */
export const HEURISTIC_NATIVE_FEE_WEI_BY_CHAIN_TYPE: Record<string, string> = {
  sol: "10000",
  near: "5000000000000000000000", // 50 TGas * 1e8 yocto
  tron: "3600000", // ~30k energy * 100 sun * 1.2
  ton: "120000000", // 0.12 TON
  aptos: "5000", // gas units approx as octa cost baseline
  sui: "3000000", // mist
  btc: "700", // ~5 sat/vB * 140 vB
  zcash: "10000", // 0.0001 ZEC
};

/** Default BTC fee rate (sat/vB) when getBtcGasPrice fails. */
export const DEFAULT_BTC_FEE_RATE_SAT_PER_VB = 5;

/** Default P2WPKH vsize for 1-in / 2-out transfer. */
export const DEFAULT_BTC_TRANSFER_VSIZE = 140;

/** Default Zcash transfer fee in zatoshi (0.0001 ZEC). */
export const DEFAULT_ZCASH_TRANSFER_FEE_ZATOSHI = "10000";

export const checkIsBridgeFee = (params?: {
  fromToken?: { chainName?: string; symbol?: string };
  toToken?: { chainName?: string; symbol?: string };
}) => {
  const currentBridgeFee = BridgeFee[0];
  const { fromToken, toToken } = params ?? {};

  if (!fromToken || !toToken) {
    return false;
  }

  const fromTokenSymbol = fromToken?.symbol === "USD₮0" ? "USDT" : fromToken?.symbol;
  const toTokenSymbol = toToken?.symbol === "USD₮0" ? "USDT" : toToken?.symbol;

  if (
    currentBridgeFee.includeChains.includes(fromToken?.chainName || "") ||
    currentBridgeFee.includeChains.includes(toToken?.chainName || "") ||
    fromTokenSymbol !== toTokenSymbol
  ) {
    return true;
  }

  return false;
};

export const buildAppFees = (params?: {
  fromToken?: { chainName?: string; symbol?: string };
  toToken?: { chainName?: string; symbol?: string };
}) => {
  if (!checkIsBridgeFee(params)) return undefined;
  return BridgeFee.map((it) => ({ recipient: it.recipient, fee: it.fee }));
};
