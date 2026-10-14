import { Service } from "@/services/constants";

/** Lifetime of a near-intents deposit address. Matches the quote request deadline. */
export const NEAR_INTENTS_QUOTE_DEADLINE_MS = 60 * 60 * 1000;

/** Refresh the executable quote this long before the deposit address expires. */
export const EXECUTABLE_QUOTE_REFRESH_BEFORE_MS = 10 * 60 * 1000;

export const NEAR_INTENTS_QUOTE_SERVICES: Service[] = [
  Service.OneClick,
  Service.Usdt0OneClick,
  Service.OneClickUsdt0,
  Service.CCTPOneClick,
  Service.OneClickCCTP,
  Service.FraxZeroOneClick,
  Service.OneClickFraxZero,
];

export const isNearIntentsQuoteService = (service?: Service) => {
  if (!service) {
    return false;
  }
  return NEAR_INTENTS_QUOTE_SERVICES.includes(service);
};
