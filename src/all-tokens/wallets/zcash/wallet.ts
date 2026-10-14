import Big from "big.js";
import { csl } from "@/utils/log";
import { DEFAULT_ZCASH_TRANSFER_FEE_ZATOSHI } from "@/all-tokens/services/rhea/config";
import {
  get_balance_zcash,
  sign_message_zcash,
  transfer_zcash,
} from "./sdk";

const ZEC_DECIMALS = 8;

export type ZcashWalletMode = "noir" | "manual";

export const ZCASH_MANUAL_WALLET_NAME = "Manual";

export default class ZcashWallet {
  private account: string | null;
  private mode: ZcashWalletMode;

  constructor(options: {
    account: string | null;
    mode?: ZcashWalletMode;
  }) {
    this.account = options.account;
    this.mode = options.mode || "noir";
  }

  get isManual() {
    return this.mode === "manual";
  }

  async balanceOf(
    _token: any,
    _account: string,
    options?: { isCatchError?: boolean }
  ): Promise<string> {
    if (this.mode === "manual") {
      return "0";
    }

    try {
      const balance = await get_balance_zcash();
      const available = balance.available || "0";
      // SDK returns ZEC decimal string; store layer expects zatoshi raw units
      return Big(available).times(10 ** ZEC_DECIMALS).toFixed(0);
    } catch (error) {
      csl("Zcash balanceOf", "red-500", "Get ZEC balance failed: %o", error);
      if (options?.isCatchError) throw error;
      return "0";
    }
  }

  async sendRheaTx(tx: any): Promise<string> {
    if (this.mode === "manual") {
      throw new Error(
        "Manual Zcash mode uses QR deposit. Please complete the deposit modal."
      );
    }

    if (!this.account) {
      throw new Error("Zcash wallet not connected");
    }

    const kind = String(tx?.kind || "").toLowerCase();
    if (kind !== "utxo_transfer" && kind !== "zcash_transfer") {
      throw new Error(`Unsupported Zcash Rhea tx kind: ${tx?.kind}`);
    }

    const to = tx.depositAddress || tx.to;
    if (!to) {
      throw new Error("Invalid Rhea Zcash tx: missing depositAddress");
    }

    const decimals = Number(tx.decimals ?? ZEC_DECIMALS);
    const amountZec = Big(tx.amount || 0)
      .div(10 ** decimals)
      .toFixed();

    try {
      return await transfer_zcash({ to, amount: amountZec });
    } catch (error: any) {
      const msg = String(error?.message || error || "");
      if (/shield|funding|insufficient|balance/i.test(msg)) {
        throw new Error(
          "Zcash transfer failed. If your ZEC is in a transparent address, shield funds in Noir Wallet first, then retry."
        );
      }
      throw error;
    }
  }

  async transfer(data: {
    token?: any;
    amount?: string;
    recipient?: string;
    originAsset?: string;
    depositAddress?: string;
    memo?: string;
  }): Promise<string> {
    if (this.mode === "manual") {
      throw new Error(
        "Manual Zcash mode uses QR deposit. Please complete the deposit modal."
      );
    }

    if (!this.account) {
      throw new Error("Zcash wallet not connected");
    }

    const to = data.recipient || data.depositAddress;
    if (!to) {
      throw new Error("Missing recipient address");
    }

    const amountRaw = data.amount;
    if (amountRaw == null || amountRaw === "") {
      throw new Error("Missing transfer amount");
    }

    const decimals = Number(data.token?.decimals ?? ZEC_DECIMALS);
    const amountZec = Big(amountRaw).div(10 ** decimals).toFixed();

    try {
      return await transfer_zcash({ to, amount: amountZec });
    } catch (error: any) {
      const msg = String(error?.message || error || "");
      if (/shield|funding|insufficient|balance/i.test(msg)) {
        throw new Error(
          "Zcash transfer failed. If your ZEC is in a transparent address, shield funds in Noir Wallet first, then retry."
        );
      }
      throw error;
    }
  }

  async signRheaRequest(req: any): Promise<Record<string, unknown>> {
    if (this.mode === "manual") {
      throw new Error("Manual Zcash mode does not support message signing");
    }

    const message =
      typeof req === "string"
        ? req
        : req?.message || req?.payload || JSON.stringify(req);
    const result = await sign_message_zcash(String(message));
    return {
      ...(typeof req === "object" && req ? req : {}),
      signature: result.signature,
      pubkey: result.pubkey,
      address: result.address,
      signingMode: result.signingMode,
      message,
    };
  }

  /**
   * Estimate Zcash transfer fee. Noir SDK does not expose a fee quote;
   * use a fixed transparent-transfer heuristic (also for manual/QR mode).
   */
  async estimateTransferGas(_data?: {
    fromToken?: any;
    depositAddress?: string;
    amount?: string;
    account?: string;
  }): Promise<{
    gasLimit: bigint;
    gasPrice: bigint;
    estimateGas: bigint;
  }> {
    const estimateGas = BigInt(DEFAULT_ZCASH_TRANSFER_FEE_ZATOSHI);
    return {
      gasLimit: estimateGas,
      gasPrice: 1n,
      estimateGas,
    };
  }
}
