import { rheaSwapApi } from "./client";
import type { RheaNormalizedQuote, RheaSwapRequest, RheaSwapResponse } from "./types";

export async function rheaSwap(
  base: Omit<RheaSwapRequest, "router" | "expectedOut" | "minAmountOut" | "amountOut" | "quoteId" | "preSwap" | "bridge" | "market">,
  selected: RheaNormalizedQuote
): Promise<RheaSwapResponse> {
  const body: RheaSwapRequest = {
    ...base,
    router: selected.passThrough.router,
    expectedOut: selected.passThrough.expectedOut,
    minAmountOut: selected.passThrough.minAmountOut,
    amountOut: selected.passThrough.amountOut,
    ...(selected.passThrough.quoteId ? { quoteId: selected.passThrough.quoteId } : {}),
    preSwap: selected.passThrough.preSwap ?? null,
    ...(selected.passThrough.bridge !== undefined ? { bridge: selected.passThrough.bridge } : {}),
    ...(selected.passThrough.market !== undefined ? { market: selected.passThrough.market } : {}),
  };

  return rheaSwapApi<RheaSwapResponse>("/swap", {
    method: "POST",
    body: JSON.stringify(body),
  });
}

export async function rheaOrderSubmit(payload: Record<string, unknown>) {
  return rheaSwapApi<Record<string, unknown>>("/order-submit", {
    method: "POST",
    body: JSON.stringify(payload),
  });
}
