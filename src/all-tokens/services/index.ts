import { Service } from "@/all-tokens/constants";
import { rheaQuote } from "./rhea/quote";
import { rheaSwap } from "./rhea/swap";
import { executeRheaSwapResponse } from "./rhea/execute";
import { fetchRheaTokens, getCachedRheaTokens, tokenAddressForQuote, tokenHttpChainId } from "./rhea/tokens";

export const rheaService = {
  quote: rheaQuote,
  swap: rheaSwap,
  execute: executeRheaSwapResponse,
  fetchTokens: fetchRheaTokens,
  getCachedTokens: getCachedRheaTokens,
  tokenAddressForQuote,
  tokenHttpChainId,
};

export const ServiceMap: Record<Service, typeof rheaService> = {
  [Service.Rhea]: rheaService,
};

export type { RheaNormalizedQuote } from "./rhea/types";
