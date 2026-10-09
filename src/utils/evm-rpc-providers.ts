import { PROXY_RPC_DOMAIN } from "@/config/api";
import chains, { type ChainType, type TokenChain } from "@/config/chains";
import { generateRpcSignature } from "@/libs/signature";
import { ethers } from "ethers";

export interface SignedRpcProvider extends ethers.AbstractProvider {
  send(method: string, params: any[]): Promise<any>;
}

const providerCache = new Map<number, SignedRpcProvider>();
const JSON_RPC_EXECUTION_ERROR = 3;

/** True when the node executed the call and the contract reverted. Transport failures stay false. */
export function isExecutionRevert(err: unknown): boolean {
  if (ethers.isError(err, "CALL_EXCEPTION")) return true;
  if (!err || typeof err !== "object") return false;

  const error = err as {
    code?: unknown;
    message?: unknown;
    error?: { code?: unknown; data?: unknown; message?: unknown };
    info?: { error?: { code?: unknown; data?: unknown; message?: unknown } };
  };
  if (error.code === JSON_RPC_EXECUTION_ERROR || error.code === "CALL_EXCEPTION") return true;

  const nested = error.error || error.info?.error;
  if (nested?.code === JSON_RPC_EXECUTION_ERROR) return true;
  if (typeof nested?.data === "string" && nested.data.startsWith("0x") && nested.data.length > 2) return true;

  const message = typeof error.message === "string" ? error.message : nested?.message;
  return typeof message === "string" && message.toLowerCase().includes("execution reverted");
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
        if (ethers.isError(err, "CALL_EXCEPTION")) throw err;
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
