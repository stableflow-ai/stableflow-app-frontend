import { fetchRheaTokens } from "@/all-tokens/services/rhea/tokens";
import { useRequest } from "ahooks";

const POLL_MS = 30_000;

/** Global Rhea lending tokens hydrate + price refresh (every 30s). */
export function useRheaTokens() {
  useRequest(() => fetchRheaTokens(true), {
    pollingInterval: POLL_MS,
  });

  return {};
}
