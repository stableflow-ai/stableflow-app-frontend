import type { TokenChain } from "@/all-tokens/chains";
import {
  getCachedRheaTokens,
  isEvmNativeBalanceToken,
} from "@/all-tokens/services/rhea/tokens";

export interface EvmBalancesToken {
  chain_id: number;
  tokens: string[];
  decimals: number[];
  symbols: string[];
}

const ZERO_ADDRESS = "0x0000000000000000000000000000000000000000";

/** Valid non-native EVM ERC20 address for the DB3 balance/tokens API. */
export function isValidEvmContractAddress(addr?: string): boolean {
  if (!addr || !/^0x[a-fA-F0-9]{40}$/.test(addr)) return false;
  return addr.toLowerCase() !== ZERO_ADDRESS;
}

/** Build the EVM balance query payload from the Rhea token cache (ERC20 only). */
export function buildEvmBalancesTokens(tokenList?: TokenChain[]): EvmBalancesToken[] {
  const tokens = (tokenList ?? getCachedRheaTokens()).filter(
    (t) =>
      t.chainType === "evm" &&
      t.chainId != null &&
      isValidEvmContractAddress(t.contractAddress)
  );
  const map: Record<string, EvmBalancesToken> = {};
  for (const token of tokens) {
    const key = String(token.chainId);
    if (!map[key]) {
      map[key] = {
        chain_id: token.chainId!,
        tokens: [],
        decimals: [],
        symbols: [],
      };
    }
    const addr = token.contractAddress;
    if (!map[key].tokens.includes(addr)) {
      map[key].tokens.push(addr);
      map[key].decimals.push(token.decimals);
      map[key].symbols.push(token.symbol);
    }
  }
  return Object.values(map);
}

/** Native gas tokens are excluded from the DB3 API and fetched via eth_getBalance. */
export function collectEvmNativeTokens(tokenList?: TokenChain[]): TokenChain[] {
  const tokens = tokenList ?? getCachedRheaTokens();
  const seen = new Set<string>();
  const result: TokenChain[] = [];
  for (const token of tokens) {
    if (!isEvmNativeBalanceToken(token)) continue;
    const key = `${token.chainId}:${token.contractAddress}`;
    if (seen.has(key)) continue;
    seen.add(key);
    result.push(token);
  }
  return result;
}
