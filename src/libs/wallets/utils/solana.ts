import { PROXY_RPC_DOMAIN } from "@/config/api";
import { getChainRpcUrl } from "@/config/chains";
import { generateRpcSignature } from "@/libs/signature";
import { csl } from "@/utils/log";
import { getAssociatedTokenAddressSync } from "@solana/spl-token";
import { Connection, PublicKey, type ConnectionConfig } from "@solana/web3.js";

const SOLANA_RPC_TIMEOUT_MS = 5000;

const withTimeout = async <T>(promise: Promise<T>, timeoutMs: number) => {
  return await Promise.race([
    promise,
    new Promise<T>((_, reject) => {
      setTimeout(() => reject(new Error(`Solana RPC timeout after ${timeoutMs}ms`)), timeoutMs);
    }),
  ]);
};

const isRpcUnavailableError = (error: unknown) => {
  const message = (error as Error)?.message?.toLowerCase?.() || "";
  return (
    message.includes("fetch") ||
    message.includes("timeout") ||
    message.includes("failed to fetch") ||
    message.includes("503") ||
    message.includes("429") ||
    message.includes("403") ||
    message.includes("401") ||
    message.includes("network")
  );
};

const ACTIVE_CONNECTION_PROP = "__stableflowActiveConnection";

/**
 * Unwrap the fallback proxy to the endpoint that answered last.
 * Sending a transaction to a different node than the one that issued the blockhash is a known way
 * to lose it, so the whole send / rebroadcast sequence must stay on a single connection.
 */
export const getActiveSolanaConnection = (connection: Connection): Connection => {
  return (connection as any)?.[ACTIVE_CONNECTION_PROP] ?? connection;
};

/**
 * Signs proxy RPC requests on every call. A static header expires and the
 * node answers 401, which makes the fallback stick on a public endpoint.
 */
export const getSolanaConnectionConfig = (rpcUrl: string): ConnectionConfig => {
  if (!rpcUrl.includes(PROXY_RPC_DOMAIN)) {
    return { commitment: "confirmed" };
  }

  return {
    commitment: "confirmed",
    fetchMiddleware: (info, init, fetch) => {
      const { headers } = generateRpcSignature("solana");
      fetch(info, {
        ...init,
        headers: {
          ...(init?.headers as Record<string, string> | undefined),
          ...headers,
        },
      });
    },
  };
};

export const createSolanaFallbackConnection = (rpcUrls: string[]) => {
  if (!rpcUrls?.length) {
    throw new Error("No Solana RPC URLs configured");
  }

  const connections = rpcUrls.map((rpcUrl) => new Connection(rpcUrl, getSolanaConnectionConfig(rpcUrl)));
  let activeIndex = 0;
  let active: Connection = connections[activeIndex];

  return new Proxy(connections[0], {
    get(_, prop, receiver) {
      if (prop === ACTIVE_CONNECTION_PROP) {
        return active;
      }

      const activeValue = Reflect.get(active, prop, receiver);
      if (typeof activeValue !== "function") {
        return activeValue;
      }

      return (...args: unknown[]) => {
        const callAtIndex = (index: number) => {
          const targetConnection = connections[index];
          const method = (targetConnection as any)[prop];
          if (typeof method !== "function") {
            return method;
          }
          return method.apply(targetConnection, args);
        };

        const tryWithFallback = async () => {
          let index = activeIndex;
          let attempts = 0;
          let lastError: unknown = null;

          while (attempts < connections.length) {
            try {
              const result = await callAtIndex(index);
              activeIndex = index;
              active = connections[activeIndex];
              return result;
            } catch (error) {
              lastError = error;
              if (!isRpcUnavailableError(error)) {
                throw error;
              }

              const nextIndex = (index + 1) % connections.length;
              csl(
                "solana rpc fallback",
                "yellow-400",
                "rpc unavailable, switching endpoint (%d -> %d): %o",
                index,
                nextIndex,
                error
              );
              index = nextIndex;
              attempts += 1;
            }
          }

          throw lastError;
        };

        return tryWithFallback();
      };
    },
  }) as Connection;
};

const probeRpcHealth = async (rpcUrl: string) => {
  const rpcSignature = generateRpcSignature("solana");
  const response = await withTimeout(fetch(rpcUrl, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      ...(rpcSignature.headers as any),
    },
    body: JSON.stringify({
      jsonrpc: "2.0",
      id: 1,
      // Use a real business-critical RPC method.
      // getHealth can be healthy while this endpoint still throttles normal RPC calls.
      method: "getLatestBlockhash",
      params: [{ commitment: "confirmed" }],
    }),
  }), SOLANA_RPC_TIMEOUT_MS);

  if (!response.ok) {
    throw new Error(`Solana RPC unavailable: ${rpcUrl}, status=${response.status}`);
  }

  const body = await response.json() as {
    result?: unknown;
    error?: { code?: number; message?: string; data?: unknown; };
  };

  if (body?.error) {
    throw new Error(
      `Solana RPC error: ${rpcUrl}, code=${body.error.code}, message=${body.error.message || "unknown"}`
    );
  }

  if (!body?.result) {
    throw new Error(`Solana RPC invalid response: ${rpcUrl}`);
  }
};

export const getAvailableSolanaRpcUrl = async (options?: { isQuerySignature?: boolean; }) => {
  const { isQuerySignature = false } = options || {};

  const rpcUrls = getChainRpcUrl("Solana").rpcUrls;
  if (!rpcUrls?.length) {
    throw new Error("No Solana RPC URLs configured");
  }

  const formatRpcUrl = (rpcUrl: string) => {
    if (!isQuerySignature || !rpcUrl.includes(PROXY_RPC_DOMAIN)) {
      return rpcUrl;
    }
    const rpcSignature = generateRpcSignature("solana");
    return `${rpcUrl}?${new URLSearchParams(rpcSignature.headers).toString()}`;
  };

  for (const rpcUrl of rpcUrls) {
    try {
      await probeRpcHealth(rpcUrl);
      return formatRpcUrl(rpcUrl);
    } catch (error) {
      csl("solana rpc health", "yellow-400", "rpc health check failed: %o", error);
    }
  }

  // If all checks fail, still return primary endpoint for backward compatibility.
  return formatRpcUrl(rpcUrls[0]);
};

export const getDestinationAssociatedTokenAddress = async (params: any) => {
  const {
    recipient,
    toToken,
  } = params;

  const result = {
    needCreateTokenAccount: false,
    associatedTokenAddress: "",
  };

  if (toToken.chainType !== "sol") {
    return result;
  }

  try {
    const connection = createSolanaFallbackConnection(getChainRpcUrl("Solana").rpcUrls);
    const wallet = new PublicKey(recipient);
    const TOKEN_MINT = new PublicKey(toToken.contractAddress);

    const ata = getAssociatedTokenAddressSync(TOKEN_MINT, wallet);

    const accountInfo = await connection.getAccountInfo(ata);

    csl("getDestinationAssociatedTokenAddress", "purple-400", "accountInfo: %o", accountInfo);

    if (!accountInfo) {
      result.needCreateTokenAccount = true;
      return result;
    }

    result.associatedTokenAddress = ata.toBase58();
  } catch (error) {
    csl("getDestinationAssociatedTokenAddress", "red-500", "getDestinationAssociatedTokenAddress failed: %o", error);
  }

  return result;
};
