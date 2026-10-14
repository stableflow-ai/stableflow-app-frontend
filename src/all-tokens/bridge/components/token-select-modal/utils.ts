import type { TokenChain } from "@/all-tokens/chains";

export function getTokenBalance(
  token: TokenChain,
  balancesBag: Record<string, any> | undefined
): string {
  if (!balancesBag) return "0";
  const chainKey = String(token.chainId ?? token.blockchain);
  return (
    balancesBag[chainKey]?.[token.contractAddress] ||
    balancesBag[chainKey]?.[token.contractAddress?.toLowerCase?.()] ||
    "0"
  );
}

export function isSameToken(
  a: TokenChain | null | undefined,
  b: TokenChain | null | undefined
): boolean {
  if (!a || !b) return false;
  const addrEqual =
    a.contractAddress?.toLowerCase?.() === b.contractAddress?.toLowerCase?.();
  if (!addrEqual) return false;
  return (
    a.blockchain === b.blockchain ||
    String(a.chainId ?? "") === String(b.chainId ?? "")
  );
}
