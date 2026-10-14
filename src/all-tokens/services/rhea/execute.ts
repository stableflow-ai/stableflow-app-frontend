import { NATIVE_EVM_TOKEN_ADDRESSES } from "./config";
import type { RheaApproveItem, RheaSwapResponse, RheaSwapTx } from "./types";
import { rheaOrderSubmit } from "./swap";

export type ExecuteRheaTxResult = {
  txHash?: string;
  orderId?: string;
  cancelled?: boolean;
};

export type RheaTxExecutor = (params: {
  chainType: string;
  fromChain: string;
  tx: RheaSwapTx;
  approve?: RheaSwapTx | RheaSwapTx[] | null;
}) => Promise<{ hash: string }>;

export type RheaSigner = (signingRequest: unknown) => Promise<Record<string, unknown>>;

export type ConfirmRheaApprove = (params: {
  chainType: string;
  hash: string;
  spender: string;
  amountWei: string;
}) => Promise<void>;

const isEmptyTxValue = (value: unknown): boolean => {
  if (value == null) return true;
  const raw = String(value).trim().toLowerCase();
  return raw === "" || raw === "0" || raw === "0x0";
};

/** Payable native swaps need msg.value. Fill it from amountIn when the payload omitted it. */
const withNativeSwapValue = (swap: RheaSwapResponse): RheaSwapTx => {
  const tx = swap.tx;
  if (!tx) throw new Error("Missing swap transaction");
  const tokenIn = String(swap.tokenIn?.address || "").trim().toLowerCase();
  if (!NATIVE_EVM_TOKEN_ADDRESSES.has(tokenIn) || !isEmptyTxValue(tx.value) || !swap.amountIn) {
    return tx;
  }
  return { ...tx, value: swap.amountIn };
};

const approveSpender = (item: RheaApproveItem): string => {
  if (item && typeof item === "object" && "spender" in item) {
    return String((item as { spender?: string }).spender || "").trim();
  }
  return "";
};

/** API returns `{ spender, tx }` or a bare RheaSwapTx */
const unwrapApproveTx = (item: RheaApproveItem): RheaSwapTx => {
  if (item && typeof item === "object" && "tx" in item) {
    const tx = (item as { tx?: RheaSwapTx }).tx;
    if (tx && typeof tx === "object") return tx;
  }
  return item as RheaSwapTx;
};

const runApproves = async (
  swap: RheaSwapResponse,
  deps: { executeTx: RheaTxExecutor; confirmApprove?: ConfirmRheaApprove }
) => {
  if (!swap.approve) return;
  const fromChain = String(swap.fromChain || "");
  const chainType = String(swap.chainType || "evm");
  const approves = Array.isArray(swap.approve) ? swap.approve : [swap.approve];
  for (const approveItem of approves) {
    const spender = approveSpender(approveItem);
    const { hash } = await deps.executeTx({
      chainType,
      fromChain,
      tx: unwrapApproveTx(approveItem),
      approve: null,
    });
    const normalizedChain = chainType.toLowerCase();
    if (!spender || (normalizedChain !== "evm" && normalizedChain !== "tron") || !deps.confirmApprove) {
      continue;
    }
    await deps.confirmApprove({
      chainType: normalizedChain,
      hash,
      spender,
      amountWei: String(swap.amountIn || ""),
    });
  }
};

/**
 * Execute a Rhea /swap response via injected chain wallet helpers.
 * - transaction: optional approve(s) then main tx
 * - signature: optional approve(s), sign signingRequest, then POST /order-submit
 */
export async function executeRheaSwapResponse(
  swap: RheaSwapResponse,
  deps: {
    executeTx: RheaTxExecutor;
    signRequest?: RheaSigner;
    confirmApprove?: ConfirmRheaApprove;
  }
): Promise<ExecuteRheaTxResult> {
  const executionType = (swap.executionType || "transaction").toLowerCase();

  if (executionType === "signature") {
    if (!swap.signingRequest) {
      throw new Error("Missing signingRequest for signature execution");
    }
    if (!deps.signRequest) {
      throw new Error("No signer available for signature execution");
    }
    // CoW etc. may require Vault Relayer approval before the signed order can settle
    await runApproves(swap, deps);
    const signed = await deps.signRequest(swap.signingRequest);
    const submitted = await rheaOrderSubmit(signed);
    const orderId =
      (submitted.orderId as string | undefined) ||
      (submitted.id as string | undefined) ||
      swap.orderId;
    return { orderId };
  }

  // Prefer approve presence (API docs); needsApprove is auxiliary
  await runApproves(swap, deps);

  if (swap.tx) {
    const fromChain = String(swap.fromChain || "");
    const chainType = String(swap.chainType || "evm");
    const { hash } = await deps.executeTx({
      chainType,
      fromChain,
      tx: withNativeSwapValue(swap),
      approve: null,
    });
    return {
      txHash: hash,
      orderId: swap.orderId || swap.deposit?.orderId,
    };
  }

  // Deposit-address style: caller transfers to deposit.depositAddress separately
  if (swap.deposit?.depositAddress) {
    return {
      orderId: swap.deposit.orderId || swap.orderId,
    };
  }

  throw new Error("Swap response has no executable transaction");
}
