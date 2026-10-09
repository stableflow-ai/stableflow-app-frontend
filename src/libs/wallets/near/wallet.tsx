import { Buffer } from "buffer";
import Big from "big.js";
import { getPrice } from "@/utils/format/price";
import { numberRemoveEndZero } from "@/utils/format/number";
import { SendType } from "../types";
import { Service } from "@/services/constants";
import { csl } from "@/utils/log";
import { ExecTime } from "@/utils/exec-time";
import { actionCreators } from "@near-wallet-selector/core";

const createFunctionCallAction = (
  methodName: string,
  args: Record<string, any>,
  gas: string,
  deposit: string
) => actionCreators.functionCall(methodName, args, BigInt(gas), BigInt(deposit));

export default class NearWallet {
  private selector: any;
  private rpcUrl: string;
  constructor(_selector: any) {
    this.selector = _selector;
    // https://rpc.mainnet.near.org
    // https://nearinner.deltarpc.com
    this.rpcUrl = "https://nearinner.deltarpc.com";
  }

  private async query(contractId: string, methodName: string, args: any = {}) {
    const response = await fetch(this.rpcUrl, {
      method: "POST",
      headers: {
        "Content-Type": "application/json"
      },
      body: JSON.stringify({
        jsonrpc: "2.0",
        id: "dontcare",
        method: "query",
        params: {
          request_type: "call_function",
          finality: "final",
          account_id: contractId,
          method_name: methodName,
          args_base64: Buffer.from(JSON.stringify(args)).toString("base64")
        }
      })
    });
    const result = await response.json();
    if (result.result && result.result.result) {
      return JSON.parse(Buffer.from(result.result.result).toString());
    }
    return result;
  }

  async transfer(data: {
    originAsset: string;
    depositAddress: string;
    amount: string;
  }) {
    const wallet = await this.selector.wallet();
    const checkStorage = await this.query(
      data.originAsset,
      "storage_balance_of",
      {
        account_id: data.depositAddress
      }
    );
    const transactions = [];
    if (!checkStorage?.available) {
      transactions.push({
        receiverId: data.originAsset,
        actions: [
          createFunctionCallAction(
            "storage_deposit",
            {
              account_id: data.depositAddress,
              registration_only: true
            },
            "15000000000000",
            "1250000000000000000000"
          )
        ]
      });
    }
    transactions.push({
      receiverId: data.originAsset,
      actions: [
        createFunctionCallAction(
          "ft_transfer",
          {
            receiver_id: data.depositAddress,
            amount: data.amount,
            memo: null
          },
          "30000000000000",
          "1"
        )
      ]
    });

    const result = await wallet.signAndSendTransactions({
      transactions,
      callbackUrl: "/"
    });

    if (result.slice(-1).length) {
      return result.slice(-1)[0].transaction.hash;
    }

    return "";
  }

  async getBalance(token: any, _account: string, options?: { isCatchError?: boolean; }) {
    const { isCatchError = false } = options || {};

    if (token.symbol === "near" || token.symbol === "NEAR" || token.symbol === "native") {
      return this.getNearBalance(_account, options);
    }
    try {
      const balance = await this.query(token.contractAddress, "ft_balance_of", {
        account_id: _account
      });
      return balance || "0";
    } catch (error) {
      csl("Near getTokenBalance", "red-500", "Get token balance failed: %o", error);
      if (isCatchError) {
        throw error;
      }
      return "0";
    }
  }

  async balanceOf(token: any, account: string, options?: { isCatchError?: boolean; }) {
    return await this.getBalance(token, account, options);
  }

  /**
   * Get native NEAR balance
   * @param account Account ID
   * @returns NEAR balance in yoctoNEAR (smallest unit)
   */
  async getNearBalance(account: string, options?: { isCatchError?: boolean; }): Promise<string> {
    const { isCatchError = false } = options || {};

    try {
      const response = await fetch(this.rpcUrl, {
        method: "POST",
        headers: {
          "Content-Type": "application/json"
        },
        body: JSON.stringify({
          jsonrpc: "2.0",
          id: "dontcare",
          method: "query",
          params: {
            request_type: "view_account",
            finality: "final",
            account_id: account
          }
        })
      });
      const result = await response.json();
      return result.result?.amount || "0";
    } catch (error) {
      console.error("Failed to get NEAR balance:", error);
      if (isCatchError) {
        throw error;
      }
      return "0";
    }
  }

  /**
   * Estimate gas limit for transfer transaction
   * @param data Transfer data
   * @returns Gas limit estimate, gas price, and estimated gas cost
   */
  async estimateTransferGas(data: {
    fromToken: any;
    depositAddress: string;
    amount: string;
  }): Promise<{
    gasLimit: bigint;
    gasPrice: bigint;
    estimateGas: bigint;
  }> {
    const { fromToken, depositAddress } = data;
    const originAsset = fromToken.contractAddress;

    // Check if storage deposit is needed
    const checkStorage = await this.query(
      originAsset,
      "storage_balance_of",
      {
        account_id: depositAddress
      }
    );

    let gasLimit: bigint;

    if (!checkStorage?.available) {
      // Storage deposit: 15000000000000 gas
      // ft_transfer: 30000000000000 gas
      gasLimit = BigInt("15000000000000") + BigInt("30000000000000");
    } else {
      // Only ft_transfer needed: 30000000000000 gas
      gasLimit = BigInt("30000000000000");
    }

    // Increase by 20% to provide buffer
    gasLimit = (gasLimit * 120n) / 100n;

    // NEAR gas price is typically 100000000 yoctoNEAR per gas unit
    const gasPrice = BigInt("100000000");

    // Calculate estimated gas cost: gasLimit * gasPrice
    const estimateGas = gasLimit * gasPrice;

    return {
      gasLimit,
      gasPrice,
      estimateGas
    };
  }

  async getEstimateGas(params: any) {
    const { gasLimit, price, nativeToken, gasPrice } = params;

    let finalGasPrice = gasPrice;
    if (!finalGasPrice) {
      try {
        const gasPriceResponse = await fetch(this.rpcUrl, {
          method: "POST",
          headers: {
            "Content-Type": "application/json"
          },
          body: JSON.stringify({
            jsonrpc: "2.0",
            id: "dontcare",
            method: "gas_price",
            params: {}
          })
        });
        const gasPriceJson = await gasPriceResponse.json();
        finalGasPrice = BigInt(gasPriceJson.result.gas_price);
      } catch {
        finalGasPrice = BigInt("100000000");
      }
    }

    const estimateGas = BigInt(gasLimit) * BigInt(finalGasPrice);
    const estimateGasAmount = Big(estimateGas.toString()).div(10 ** nativeToken.decimals);
    const estimateGasUsd = Big(estimateGasAmount).times(price || 1);

    return {
      gasPrice: finalGasPrice,
      usd: numberRemoveEndZero(Big(estimateGasUsd).toFixed(20)),
      wei: estimateGas,
      amount: numberRemoveEndZero(Big(estimateGasAmount).toFixed(nativeToken.decimals)),
    };
  }

  async estimateTransaction(params: any) {
    const {
      dry,
      transactions,
      fromToken,
      prices,
    } = params;

    const nativeTokenPrice = getPrice(prices, fromToken.nativeToken.symbol);

    let totalGasLimit = BigInt("50000000000000"); // ft_transfer_call gas
    for (let i = 1; i < transactions.length; i++) {
      totalGasLimit += BigInt("15000000000000");
    }
    // Add 20% buffer
    totalGasLimit = (totalGasLimit * 120n) / 100n;

    const result = {
      estimateSourceGasLimit: totalGasLimit,
      estimateSourceGas: 0n,
      estimateSourceGasUsd: "0",
    };

    const setDefaultGasLimit = async () => {
      const { usd, wei } = await this.getEstimateGas({
        gasLimit: totalGasLimit,
        price: nativeTokenPrice,
        nativeToken: fromToken.nativeToken,
        gasPrice: dry ? "100000000" : void 0,
      });
      result.estimateSourceGas = wei;
      result.estimateSourceGasUsd = usd;
    };

    await setDefaultGasLimit();

    return result;
  }

  async checkTransactionStatus(txHash: string) {
    const wallet = await this.selector.wallet();
    const accounts = await wallet.getAccounts();
    const accountId = accounts[0]?.accountId;

    try {
      const response = await fetch(this.rpcUrl, {
        method: "POST",
        headers: {
          "Content-Type": "application/json"
        },
        body: JSON.stringify({
          jsonrpc: "2.0",
          id: "dontcare",
          method: "EXPERIMENTAL_tx_status",
          params: {
            tx_hash: txHash,
            sender_account_id: accountId,
            wait_until: "EXECUTED" // wait_until: "NONE" | "EXECUTED_OPTIMISTIC" | "EXECUTED"
          }
        })
      });
      const txStatus = await response.json();
      csl("Near checkTransactionStatus", "green-400", "fetch rpc success: %o", txStatus);
      csl("Near checkTransactionStatus", "green-400", "fetch rpc status success: %o", typeof txStatus.result?.status?.SuccessValue !== "undefined");
    } catch (error) {
      csl("Near checkTransactionStatus", "red-500", "fetch rpc failed: %o", error);
    }
  }

  async quoteOneClickProxy(params: any) {
    const {
      proxyAddress,
      fromToken,
      refundTo,
      depositAddress,
      amountWei,
    } = params;

    const execTime = new ExecTime({ type: "OneClick NEAR", logStyle: "lime-200" });

    const result: any = { fees: {} };

    try {
      const wallet = await this.selector.wallet();
      const accounts = await wallet.getAccounts();
      const userAccountId = refundTo || accounts[0]?.accountId;

      if (!userAccountId) {
        throw new Error("No account found");
      }

      const tokenContract = fromToken.contractAddress;
      // proxyAddress should be stableflowstg.near, use default if not provided
      const STABLEFLOW_CONTRACT = proxyAddress || "stableflowstg.near";

      if (!depositAddress) {
        throw new Error("depositAddress is required");
      }

      // Check and register token: register for intents address (depositAddress) and stableflowstg.near contract
      const transactions: any[] = [];

      // Check if depositAddress (intents address) is registered
      // Check if stableflowstg.near is registered
      execTime.breakpoint();
      const mergedCalls = [
        this.query(
          tokenContract,
          "storage_balance_of",
          {
            account_id: depositAddress
          }
        ),
        this.query(
          tokenContract,
          "storage_balance_of",
          {
            account_id: STABLEFLOW_CONTRACT
          }
        )
      ];
      const [checkStorageDepositAddress, checkStorageStableflow] = await Promise.all(mergedCalls);
      execTime.log("query storage_balance_of (depositAddress and STABLEFLOW_CONTRACT)");

      if (!checkStorageDepositAddress?.available) {
        transactions.push({
          receiverId: tokenContract,
          actions: [
            createFunctionCallAction(
              "storage_deposit",
              {
                account_id: depositAddress,
                registration_only: true
              },
              "15000000000000",
              "1250000000000000000000"
            )
          ]
        });
      }

      if (!checkStorageStableflow?.available) {
        transactions.push({
          receiverId: tokenContract,
          actions: [
            createFunctionCallAction(
              "storage_deposit",
              {
                account_id: STABLEFLOW_CONTRACT,
                registration_only: true
              },
              "15000000000000",
              "1250000000000000000000"
            )
          ]
        });
      }

      // Build ft_transfer_call transaction
      transactions.push({
        receiverId: tokenContract,
        actions: [
          createFunctionCallAction(
            "ft_transfer_call",
            {
              receiver_id: STABLEFLOW_CONTRACT,
              amount: amountWei,
              msg: depositAddress
            },
            "50000000000000", // ft_transfer_call requires more gas
            "1"
          )
        ]
      });

      result.sendParam = {
        transactions,
        callbackUrl: "/"
      };

    } catch (error) {
      csl("Near quoteOneClickProxy", "red-500", "oneclick quote proxy failed: %o", error);
    }

    execTime.logTotal("quoteOneClickProxy");
    return result;
  }

  async sendTransaction(params: any) {
    const { transactions, callbackUrl } = params;

    if (!transactions || !Array.isArray(transactions)) {
      throw new Error("Invalid sendParam: transactions array is required");
    }

    const wallet = await this.selector.wallet();
    const result = await wallet.signAndSendTransactions({
      transactions,
      callbackUrl: callbackUrl || "/"
    });

    if (result.slice(-1).length) {
      return result.slice(-1)[0].transaction.hash;
    }

    return "";
  }

  /**
   * Unified quote method that routes to specific quote methods based on type
   * @param type Service type from Service
   * @param params Parameters for the quote
   */
  async quote(type: Service, params: any) {
    switch (type) {
      case Service.OneClick:
        return await this.quoteOneClickProxy(params);
      default:
        throw new Error(`Unsupported quote type: ${type}`);
    }
  }

  /**
   * Sign and send a Rhea Near tx payload ({ receiverId, actions } or transaction array).
   */
  async sendRheaTx(tx: any): Promise<string> {
    const rawTransactions = Array.isArray(tx)
      ? tx
      : Array.isArray(tx?.transactions)
        ? tx.transactions
        : tx?.receiverId
          ? [tx]
          : null;

    if (!rawTransactions?.length) {
      throw new Error("Invalid Near Rhea tx: missing receiverId/actions or transactions");
    }

    const transactions = rawTransactions.map((item: any) => {
      if (!item?.receiverId || !Array.isArray(item.actions)) {
        throw new Error("Invalid Near Rhea tx entry: receiverId and actions are required");
      }

      const actions = item.actions.map((action: any) => {
        const type = action?.type || action?.enum;
        const params = action?.params || action;

        if (type === "FunctionCall" || params?.methodName) {
          let args = params.args ?? {};
          if (typeof args === "string") {
            try {
              args = JSON.parse(args);
            } catch {
              // keep string args if not valid JSON
            }
          }
          return createFunctionCallAction(
            params.methodName,
            args,
            String(params.gas ?? "30000000000000"),
            String(params.deposit ?? "0")
          );
        }

        return action;
      });

      return {
        receiverId: item.receiverId,
        actions,
      };
    });

    return this.sendTransaction({ transactions });
  }

  /**
   * Unified send method that routes to specific send methods based on type
   * @param type Send type from SendType enum
   * @param params Parameters for the send transaction
   */
  async send(type: SendType, params: any) {
    switch (type) {
      case SendType.SEND:
        return await this.sendTransaction(params);
      case SendType.TRANSFER:
        return await this.transfer(params);
      default:
        throw new Error(`Unsupported send type: ${type}`);
    }
  }
}
