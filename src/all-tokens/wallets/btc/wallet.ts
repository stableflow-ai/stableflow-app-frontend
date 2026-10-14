import { getBtcGasPrice } from "btc-wallet";
import { csl } from "@/utils/log";
import {
  DEFAULT_BTC_FEE_RATE_SAT_PER_VB,
  DEFAULT_BTC_TRANSFER_VSIZE,
} from "@/all-tokens/services/rhea/config";

const ESPLORA_UTXO_URL = "https://blockstream.info/api/address";
const DEFAULT_FEE_RATE = DEFAULT_BTC_FEE_RATE_SAT_PER_VB;
const P2WPKH_INPUT_VSIZE = 68;
const P2WPKH_OUTPUT_VSIZE = 31;
const TX_OVERHEAD_VSIZE = 10;

type SendBitcoinFn = (
  toAddress: string,
  satoshis: number,
  options?: { feeRate: number }
) => Promise<string>;

type SignMessageFn = (message: string) => Promise<string>;

export default class BtcWallet {
  private account: string | null;
  private sendBitcoin: SendBitcoinFn;
  private signMessage: SignMessageFn;

  constructor(options: {
    account: string | null;
    sendBitcoin: SendBitcoinFn;
    signMessage: SignMessageFn;
  }) {
    this.account = options.account;
    this.sendBitcoin = options.sendBitcoin;
    this.signMessage = options.signMessage;
  }

  private async resolveFeeRate(preferred?: number | string | null): Promise<number> {
    if (preferred != null && preferred !== "") {
      const n = Number(preferred);
      if (Number.isFinite(n) && n > 0) return n;
    }
    try {
      const rate = await getBtcGasPrice("halfHour");
      if (Number.isFinite(rate) && rate > 0) return rate;
    } catch (error) {
      csl("BTC resolveFeeRate", "yellow-600", "getBtcGasPrice failed: %o", error);
    }
    return DEFAULT_FEE_RATE;
  }

  async balanceOf(
    _token: any,
    account: string,
    options?: { isCatchError?: boolean }
  ): Promise<string> {
    try {
      const res = await fetch(`${ESPLORA_UTXO_URL}/${account}/utxo`);
      if (!res.ok) {
        throw new Error(`Esplora utxo request failed: ${res.status}`);
      }
      const utxos = (await res.json()) as Array<{
        value: number;
        status?: { confirmed?: boolean };
      }>;
      const sats = utxos
        .filter((u) => u?.status?.confirmed !== false)
        .reduce((sum, u) => sum + (Number(u.value) || 0), 0);
      return String(sats);
    } catch (error) {
      csl("BTC balanceOf", "red-500", "Get BTC balance failed: %o", error);
      if (options?.isCatchError) throw error;
      return "0";
    }
  }

  async sendRheaTx(tx: any): Promise<string> {
    if (!this.account) {
      throw new Error("Bitcoin wallet not connected");
    }

    const kind = String(tx?.kind || "").toLowerCase();
    if (kind !== "utxo_transfer" && kind !== "btc_transfer") {
      throw new Error(`Unsupported BTC Rhea tx kind: ${tx?.kind}`);
    }

    const to = tx.depositAddress || tx.to;
    if (!to) {
      throw new Error("Invalid Rhea BTC tx: missing depositAddress");
    }

    const satoshis = Number(tx.amount);
    if (!Number.isFinite(satoshis) || satoshis <= 0) {
      throw new Error(`Invalid Rhea BTC amount: ${tx.amount}`);
    }

    const feeRate = await this.resolveFeeRate(tx.feeRate);
    return await this.sendBitcoin(to, satoshis, { feeRate });
  }

  async transfer(data: {
    token?: any;
    amount?: string;
    recipient?: string;
    originAsset?: string;
    depositAddress?: string;
    memo?: string;
  }): Promise<string> {
    if (!this.account) {
      throw new Error("Bitcoin wallet not connected");
    }

    const to = data.recipient || data.depositAddress;
    if (!to) {
      throw new Error("Missing recipient address");
    }

    const amountRaw = data.amount;
    if (amountRaw == null || amountRaw === "") {
      throw new Error("Missing transfer amount");
    }

    // amount from deposit flow is wei/satoshi integer string
    const satoshis = Number(amountRaw);
    if (!Number.isFinite(satoshis) || satoshis <= 0) {
      throw new Error(`Invalid BTC transfer amount: ${amountRaw}`);
    }

    const feeRate = await this.resolveFeeRate(null);
    return await this.sendBitcoin(to, satoshis, { feeRate });
  }

  /**
   * Estimate BTC transfer fee: feeRate (sat/vB) * vsize.
   * Uses UTXO count when account is available; otherwise 1-in / 2-out default.
   */
  async estimateTransferGas(data: {
    fromToken?: any;
    depositAddress?: string;
    amount?: string;
    account?: string;
  }): Promise<{
    gasLimit: bigint;
    gasPrice: bigint;
    estimateGas: bigint;
  }> {
    const feeRate = await this.resolveFeeRate(null);
    let inputCount = 1;

    const account = data.account || this.account;
    if (account) {
      try {
        const res = await fetch(`${ESPLORA_UTXO_URL}/${account}/utxo`);
        if (res.ok) {
          const utxos = (await res.json()) as Array<{
            value: number;
            status?: { confirmed?: boolean };
          }>;
          const confirmed = utxos.filter((u) => u?.status?.confirmed !== false);
          const amountSats = Number(data.amount || 0);
          if (Number.isFinite(amountSats) && amountSats > 0 && confirmed.length > 0) {
            let sum = 0;
            let used = 0;
            const sorted = [...confirmed].sort((a, b) => (b.value || 0) - (a.value || 0));
            for (const u of sorted) {
              sum += Number(u.value) || 0;
              used += 1;
              if (sum >= amountSats) break;
            }
            inputCount = Math.max(1, used);
          } else if (confirmed.length > 0) {
            inputCount = 1;
          }
        }
      } catch (error) {
        csl("BTC estimateTransferGas", "yellow-600", "utxo fetch failed: %o", error);
      }
    }

    const outputCount = 2; // recipient + change
    const vsize =
      inputCount > 0
        ? inputCount * P2WPKH_INPUT_VSIZE + outputCount * P2WPKH_OUTPUT_VSIZE + TX_OVERHEAD_VSIZE
        : DEFAULT_BTC_TRANSFER_VSIZE;
    const estimateGas = BigInt(Math.ceil(feeRate * vsize));

    return {
      gasLimit: BigInt(vsize),
      gasPrice: BigInt(Math.ceil(feeRate)),
      estimateGas,
    };
  }

  async signRheaRequest(req: any): Promise<Record<string, unknown>> {
    const message =
      typeof req === "string"
        ? req
        : req?.message || req?.payload || JSON.stringify(req);
    const signature = await this.signMessage(String(message));
    return {
      ...(typeof req === "object" && req ? req : {}),
      signature,
      message,
    };
  }
}
