import { EXECUTABLE_QUOTE_REFRESH_BEFORE_MS } from "./config";

export const getExecutableDepositAddress = (quoteData?: any) => {
  const depositAddress = quoteData?.quote?.depositAddress || quoteData?.quoteParam?.depositAddress;
  if (!depositAddress) {
    return "";
  }
  return String(depositAddress);
};

/** A quote can be signed until 10 minutes before its deposit-address deadline. */
export const isExecutableQuoteFresh = (quoteData?: any, now = Date.now()) => {
  if (!quoteData || quoteData.errMsg || quoteData.routeDisabled) {
    return false;
  }
  if (!getExecutableDepositAddress(quoteData)) {
    return false;
  }
  const deadline = Date.parse(quoteData.quoteDeadline);
  if (!Number.isFinite(deadline)) {
    return false;
  }
  return now < deadline - EXECUTABLE_QUOTE_REFRESH_BEFORE_MS;
};

const sameToken = (left?: any, right?: any) => {
  return left?.chainName === right?.chainName && left?.contractAddress === right?.contractAddress;
};

/** The cached deposit address is only safe when the form still matches the quote that created it. */
export const isExecutableQuoteCurrent = (quoteData: any, current: {
  amountWei: string;
  fromToken?: any;
  toToken?: any;
  recipient?: string;
  refundTo?: string;
  slippage?: number;
  acceptTronEnergy?: boolean;
}) => {
  if (!isExecutableQuoteFresh(quoteData)) {
    return false;
  }
  const params = quoteData.sourceQuoteParams || quoteData.quoteParam || {};
  if (String(params.amountWei ?? "") !== current.amountWei) {
    return false;
  }
  if (!sameToken(params.fromToken, current.fromToken) || !sameToken(params.toToken, current.toToken)) {
    return false;
  }
  if (String(params.recipient || "") !== String(current.recipient || "")) {
    return false;
  }
  if (String(params.refundTo || "") !== String(current.refundTo || "")) {
    return false;
  }
  if (Number(params.slippageTolerance) !== Number(current.slippage)) {
    return false;
  }
  if (Boolean(params.acceptTronEnergy) !== Boolean(current.acceptTronEnergy)) {
    return false;
  }
  return true;
};
