import { rheaFetch } from "./client";
import type { RheaLendingToken } from "./types";
import chains, {
  type TokenChain,
  RHEA_TOKEN_QUERY_CHAINS,
  RHEA_TRADE_ALIASES,
  RHEA_NATIVE_TOKEN_IDS,
  getRheaChainByAlias,
  aliasToHttpChainId,
} from "@/all-tokens/chains";
import { Service } from "@/all-tokens/constants";
import useRheaTokensStore from "@/all-tokens/rhea-tokens-store";
import { getStableflowTokenLogo } from "@/utils/format/logo";

let inflight: Promise<TokenChain[]> | null = null;

/**
 * Local allowlist of Rhea trade aliases (from RHEA_META tradeEnabled).
 * Intentionally filter by this set — do not trust the API chain list blindly.
 * When Rhea adds a chain, enable it via RHEA_META + local chain config first
 * (see checklist above RHEA_META in config/chains.ts).
 */
const RHEA_TRADE_ALIAS_ALLOWLIST = new Set(RHEA_TRADE_ALIASES);

const resolveLocalChain = (alias: string) => {
  const cfg = getRheaChainByAlias(alias);
  const key = cfg?.localKey || alias;
  // chains keys: eth, arb, bsc, polygon (not pol), etc.
  const local =
    (chains as Record<string, (typeof chains)[keyof typeof chains]>)[key] ||
    (chains as Record<string, (typeof chains)[keyof typeof chains]>)[alias];
  return { cfg, local, key };
};

export const mapLendingTokenToTokenChain = (item: RheaLendingToken): TokenChain | null => {
  const alias = (item.blockchain || "").toLowerCase();
  if (!alias) return null;

  // Drop unknown / unsupported chains even if the API returns them.
  if (!RHEA_TRADE_ALIAS_ALLOWLIST.has(alias)) return null;

  const symbol = item.symbol || "UNKNOWN";
  if (/DEPRECATED/i.test(symbol)) return null;

  const rheaCfg = getRheaChainByAlias(alias);
  if (!rheaCfg?.tradeEnabled) return null;

  const { local } = resolveLocalChain(alias);
  if (!local) return null;

  const contractAddress =
    item.contractAddress ||
    item.assetId ||
    "";

  const decimals = Number(item.decimals ?? local.nativeToken.decimals);
  const icon =
    (item.icon && String(item.icon).trim()) || getStableflowTokenLogo(symbol);

  return {
    symbol,
    decimals,
    icon,
    assetId: item.assetId,
    contractAddress,
    services: [Service.Rhea],
    price: item.price != null ? Number(item.price) : undefined,
    chainName: local.chainName,
    blockchain: local.blockchain,
    chainIcon: local.chainIcon,
    chainIconGray: local.chainIconGray,
    chainType: local.chainType,
    chainId: local.chainId,
    blockExplorerUrl: local.blockExplorerUrl,
    primaryColor: local.primaryColor,
    nativeToken: local.nativeToken,
    rpcUrls: local.rpcUrls,
    rpcUrl: local.rpcUrl,
    rheaAlias: alias,
    rheaHttpChainId: aliasToHttpChainId(alias),
  };
};

export async function fetchRheaTokens(force = false): Promise<TokenChain[]> {
  const store = useRheaTokensStore.getState();
  if (!force && store.tokens.length) {
    return store.tokens;
  }
  if (inflight) return inflight;

  store.set({ loading: true });

  inflight = (async () => {
    // Request only locally enabled chains; response is filtered again by allowlist.
    const path = `/get_multichain_lending_tokens_data?chains=${encodeURIComponent(RHEA_TOKEN_QUERY_CHAINS)}`;
    const raw = await rheaFetch<RheaLendingToken[]>(path, { method: "GET" });
    const list = Array.isArray(raw) ? raw : [];
    const tokens = list
      .map(mapLendingTokenToTokenChain)
      .filter((t): t is TokenChain => !!t);

    const fetchedAt = Date.now();
    useRheaTokensStore.getState().set({
      tokens,
      fetchedAt,
      loading: false,
    });
    inflight = null;
    return tokens;
  })().catch((err) => {
    inflight = null;
    useRheaTokensStore.getState().set({ loading: false });
    throw err;
  });

  return inflight;
}

export function getCachedRheaTokens(): TokenChain[] {
  return useRheaTokensStore.getState().tokens ?? [];
}

/** Resolve token icon by symbol + blockchain (exact match). */
export function findRheaTokenIcon(
  symbol?: string,
  blockchain?: string
): string | undefined {
  if (!symbol) return undefined;
  const tokens = getCachedRheaTokens();
  const found = tokens.find(
    (t) =>
      t.symbol === symbol &&
      (!blockchain || t.blockchain === blockchain)
  );
  return found?.icon;
}

/** Native gas token USD price from Rhea lending tokens cache. */
export function getRheaNativePrice(fromToken: {
  rheaAlias?: string;
  blockchain?: string;
  nativeToken?: { symbol?: string; price?: number };
}): number {
  if (fromToken?.nativeToken?.price != null && Number(fromToken.nativeToken.price) > 0) {
    return Number(fromToken.nativeToken.price);
  }

  const alias =
    fromToken?.rheaAlias ||
    getRheaChainByAlias((fromToken?.blockchain || "").toLowerCase())?.alias ||
    (fromToken?.blockchain || "").toLowerCase();

  const nativeId = RHEA_NATIVE_TOKEN_IDS[alias];
  const tokens = getCachedRheaTokens();

  if (nativeId) {
    const byId = tokens.find(
      (t) =>
        t.rheaAlias === alias &&
        (sameTokenAddress(t.contractAddress, nativeId) ||
          sameTokenAddress(t.assetId, nativeId))
    );
    if (byId?.price != null && Number(byId.price) > 0) return Number(byId.price);
  }

  const bySymbol = tokens.find(
    (t) =>
      t.rheaAlias === alias &&
      t.symbol?.toLowerCase() === fromToken?.nativeToken?.symbol?.toLowerCase()
  );
  if (bySymbol?.price != null && Number(bySymbol.price) > 0) return Number(bySymbol.price);

  return 0;
}

function resolveTokenAlias(token: TokenChain): string {
  return (
    token.rheaAlias ||
    getRheaChainByAlias((token.blockchain || "").toLowerCase())?.alias ||
    (token.blockchain || "").toLowerCase()
  );
}

/** Aptos accepts both `0xa` and the 32-byte padded form as the same address. */
const sameTokenAddress = (left?: string, right?: string): boolean => {
  const a = (left || "").trim().toLowerCase();
  const b = (right || "").trim().toLowerCase();
  if (!a || !b) return false;
  if (a === b) return true;
  const pad = (value: string) => {
    if (!/^0x[0-9a-f]+$/.test(value)) return value;
    const hex = value.slice(2);
    if (hex.length > 64) return value;
    return hex.padStart(64, "0");
  };
  return pad(a) === pad(b);
};

export function isRheaNativeToken(token: TokenChain, nativeId: string): boolean {
  const addr = (token.contractAddress || "").toLowerCase();
  const asset = (token.assetId || "").toLowerCase();
  const native = nativeId.toLowerCase();
  if (sameTokenAddress(addr, native) || sameTokenAddress(asset, native)) return true;

  const isNativeSymbol =
    !!token.symbol &&
    !!token.nativeToken?.symbol &&
    token.symbol.toLowerCase() === token.nativeToken.symbol.toLowerCase();
  if (!isNativeSymbol) return false;

  // Lending often fills contractAddress with assetId for natives
  if (!token.contractAddress || token.contractAddress === token.assetId) return true;
  return false;
}

/** True when token is the EVM chain native gas token (may use nep141/nep245 as contractAddress). */
export function isEvmNativeBalanceToken(token: TokenChain): boolean {
  if (token.chainType !== "evm" || token.chainId == null) return false;
  const alias = resolveTokenAlias(token);
  const nativeId = alias ? RHEA_NATIVE_TOKEN_IDS[alias] : undefined;
  if (!nativeId) return false;
  return isRheaNativeToken(token, nativeId);
}

/** On-chain token ID for Rhea quote/swap/report. Natives use RHEA_NATIVE_TOKEN_IDS. */
export function tokenAddressForQuote(token: TokenChain): string {
  const alias = resolveTokenAlias(token);
  const nativeId = alias ? RHEA_NATIVE_TOKEN_IDS[alias] : undefined;
  if (nativeId && isRheaNativeToken(token, nativeId)) {
    return nativeId;
  }
  return token.contractAddress || token.assetId || "";
}

export function tokenHttpChainId(token: TokenChain): string {
  return token.rheaHttpChainId || aliasToHttpChainId(token.blockchain) || String(token.chainId ?? "");
}
