import { PROXY_RPC_DOMAIN } from "@/config/api";
import chains, { type ChainType, type TokenChain } from "@/config/chains";
import { generateRpcSignature } from "@/libs/signature";
import { ethers } from "ethers";

export interface SignedRpcProvider extends ethers.AbstractProvider {
  send(method: string, params: any[]): Promise<any>;
}

const providerCache = new Map<number, SignedRpcProvider>();
const JSON_RPC_EXECUTION_ERROR = 3;

const hasRevertPayload = (data: unknown): boolean =>
  typeof data === "string" && data.startsWith("0x") && data.length > 2;

/**
 * True when the node executed the call and the contract reverted.
 * `missing revert data` with no payload is a node that did not return a
 * contract answer, so callers should try the next RPC.
 */
export function isExecutionRevert(err: unknown): boolean {
  if (!err || typeof err !== "object") return false;

  const error = err as {
    code?: unknown;
    message?: unknown;
    data?: unknown;
    shortMessage?: unknown;
    error?: { code?: unknown; data?: unknown; message?: unknown };
    info?: { error?: { code?: unknown; data?: unknown; message?: unknown } };
  };
  const nested = error.error || error.info?.error;
  const data = error.data ?? nested?.data;
  const rawMessage =
    (typeof error.shortMessage === "string" && error.shortMessage) ||
    (typeof error.message === "string" && error.message) ||
    (typeof nested?.message === "string" && nested.message) ||
    "";
  const message = rawMessage.toLowerCase();

  if (message.includes("missing revert data") && !hasRevertPayload(data)) {
    return false;
  }
  if (hasRevertPayload(data)) return true;
  if (message.includes("execution reverted")) return true;

  if (error.code === JSON_RPC_EXECUTION_ERROR || nested?.code === JSON_RPC_EXECUTION_ERROR) {
    return hasRevertPayload(nested?.data) || hasRevertPayload(error.data);
  }

  return false;
}

class SequentialFallbackProvider extends ethers.AbstractProvider {
  private providers: ethers.JsonRpcProvider[];

  constructor(providers: ethers.JsonRpcProvider[], chainId: number) {
    super(chainId);
    this.providers = providers;
  }

  async _detectNetwork(): Promise<ethers.Network> {
    return this.providers[0]._detectNetwork();
  }

  async _perform(req: ethers.PerformActionRequest): Promise<any> {
    let lastError: unknown;
    for (const provider of this.providers) {
      try {
        return await provider._perform(req);
      } catch (err) {
        if (isExecutionRevert(err)) throw err;
        lastError = err;
      }
    }
    throw lastError;
  }

  async send(method: string, params: any[]): Promise<any> {
    let lastError: unknown;
    for (const provider of this.providers) {
      try {
        return await provider.send(method, params);
      } catch (err) {
        if (isExecutionRevert(err)) throw err;
        lastError = err;
      }
    }
    throw lastError;
  }
}

// RPC_CHAINS="tron,solana,aptos,aptos,sui,ethereum,arbitrum,bsc,avalanche,base,polygon,gnosis,optimism,berachain,monad,xlayer,plasma,mantle,megaeth,ink,stable,celo,sei,fraxtal,katana,pharos,arc"
const ChainNameMap: Record<string, string> = {
  "eth": "ethereum",
  "arb": "arbitrum",
  "bsc": "bsc",
  "avax": "avalanche",
  "base": "base",
  "pol": "polygon",
  "gnosis": "gnosis",
  "op": "optimism",
  "bera": "berachain",
  "monad": "monad",
  "xlayer": "xlayer",
  "plasma": "plasma",
  "mantle": "mantle",
  "megaeth": "megaeth",
  "ink": "ink",
  "stable": "stable",
  "celo": "celo",
  "sei": "sei",
  "frax": "fraxtal",
  "katana": "katana",
  "pharos": "pharos",
  "arc": "arc",
};

export function evmRpcFallbackProvider(chain: TokenChain): SignedRpcProvider {
  const { rpcUrls, chainId } = chain;

  if (providerCache.has(chainId!)) {
    return providerCache.get(chainId!)!;
  }

  const sortedUrls: string[] = [...rpcUrls].sort(
    (a: string, b: string) =>
      (b.includes(PROXY_RPC_DOMAIN) ? 1 : 0) - (a.includes(PROXY_RPC_DOMAIN) ? 1 : 0)
  );

  const rpcChainSlug = ChainNameMap[chain.blockchain];

  const providers = sortedUrls.map(
    (rpc: string) => {
      if (rpc.includes(PROXY_RPC_DOMAIN)) {
        const req = new ethers.FetchRequest(rpc);
        req.preflightFunc = async (r) => {
          const { headers } = generateRpcSignature(rpcChainSlug);
          r.setHeader("x-hmac-signature", headers["x-hmac-signature"]);
          r.setHeader("x-timestamp", headers["x-timestamp"]);
          return r;
        };
        return new ethers.JsonRpcProvider(req, chainId, { staticNetwork: true });
      }
      return new ethers.JsonRpcProvider(rpc, chainId, { staticNetwork: true });
    }
  );

  const provider: SignedRpcProvider =
    providers.length === 1
      ? providers[0]
      : new SequentialFallbackProvider(providers, chainId!);

  providerCache.set(chainId!, provider);
  return provider;
}

const evmChainByChainId = new Map<number, ChainType>();
for (const key in chains) {
  const chain = chains[key];
  if (chain.chainId != null && chain.chainType === "evm") {
    evmChainByChainId.set(chain.chainId, chain);
  }
}

/**
 * Returns the HMAC-signed fallback provider for a given EVM chainId, or null
 * when the chainId is unknown. Used to route a wallet signer's read calls
 * through the signed proxy RPC instead of the wallet transport.
 */
export function getSignedProviderByChainId(
  chainId?: number,
): SignedRpcProvider | null {
  if (chainId == null) return null;
  const chain = evmChainByChainId.get(chainId);
  if (!chain) return null;
  return evmRpcFallbackProvider(chain as unknown as TokenChain);
}
