import type { RheaSwapTx } from "@/all-tokens/services/rhea/types";
import { csl } from "@/utils/log";

type ExecuteParams = {
  chainType: string;
  fromChain: string;
  tx: RheaSwapTx;
  wallet: any;
  account: string;
  fromToken: any;
  switchChainAsync?: (args: { chainId: number }) => Promise<unknown>;
};

/**
 * Dispatch Rhea swap tx payloads to the connected chain wallet.
 * Wallets should implement `sendRheaTx(tx)` for chain-specific payloads;
 * EVM falls back to generic sendTransaction when needed.
 */
export async function executeRheaTx(params: ExecuteParams): Promise<{ hash: string }> {
  const { chainType, tx, wallet, fromToken, switchChainAsync } = params;

  const normalizedType = (chainType === "cross-chain"
    ? fromToken?.chainType
    : chainType
  )?.toLowerCase?.() || fromToken?.chainType;
  const isEvm = normalizedType === "evm" || fromToken?.chainType === "evm";
  const chainId = Number(tx.chainId ?? fromToken?.chainId);

  if (isEvm && chainId && switchChainAsync) {
    try {
      await switchChainAsync({ chainId });
    } catch (err) {
      csl("executeRheaTx", "yellow-600", "switch chain failed: %o", err);
    }
  }

  if (typeof wallet.sendRheaTx === "function") {
    const hash = await wallet.sendRheaTx(tx, { fromToken, chainType });
    return { hash: String(hash) };
  }

  if (isEvm && typeof wallet.sendTransaction === "function") {
    const hash = await wallet.sendTransaction({
      to: tx.to,
      data: tx.data,
      value: tx.value || "0x0",
      gasLimit: tx.gasLimit,
      chainId,
    });
    return { hash: String(hash) };
  }

  throw new Error(`No Rhea tx executor for chain type: ${normalizedType || chainType}`);
}
