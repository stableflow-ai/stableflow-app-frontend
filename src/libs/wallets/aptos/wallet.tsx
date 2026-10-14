import { Aptos, AptosConfig, AuthenticationKey, Ed25519PublicKey, Network, parseTypeTag, TypeTagAddress, TypeTagU64, type EntryFunctionABI } from "@aptos-labs/ts-sdk";
import Big from "big.js";
import { getPrice } from "@/utils/format/price";
import { numberRemoveEndZero } from "@/utils/format/number";
import { SendType } from "../types";
import { Service } from "@/services/constants";
import { csl } from "@/utils/log";
import { ExecTime } from "@/utils/exec-time";

const DEFAULT_GAS_LIMIT = 5000n;
const DEFAULT_GAS_LIMIT_FAILED = 4000000n;

export default class AptosWallet {
  connection: any;
  private account: any | null;
  private aptos: Aptos;
  private signAndSubmitTransaction: any;

  constructor(options: { account: any | null; signAndSubmitTransaction: any; }) {
    const config = new AptosConfig({
      network: Network.MAINNET,
    });
    const aptos = new Aptos(config);

    this.aptos = aptos;
    this.signAndSubmitTransaction = options.signAndSubmitTransaction;
    this.account = options.account;
  }

  // Transfer APT
  async transferAPT(to: string, amount: string): Promise<string> {
    if (!this.account) {
      throw new Error("Wallet not connected");
    }

    try {
      // Convert amount to octas (1 APT = 10^8 octas)
      const amountInOctas = Math.floor(parseFloat(amount) * 100000000);

      // Sign and submit transaction
      const result = await this.signAndSubmitTransaction({
        data: {
          function: "0x1::coin::transfer",
          typeArguments: ["0x1::aptos_coin::AptosCoin"],
          functionArguments: [to, amountInOctas.toString()],
        },
      });

      const executedTransaction = await this.aptos.waitForTransaction({ transactionHash: typeof result === "string" ? result : result.hash });
      if (executedTransaction.success !== true) {
        csl("Aptos transferAPT", "red-500", "Transfer APT token failed: %o", executedTransaction);
        throw new Error("Transfer token failed");
      }

      return typeof result === "string" ? result : result.hash;
    } catch (error) {
      csl("Aptos transferAPT", "red-500", "Transfer APT failed: %o", error);
      throw error;
    }
  }

  // Transfer Fungible Asset token
  async transferToken(contractAddress: string, to: string, amount: string): Promise<string> {
    if (!this.account) {
      throw new Error("Wallet not connected");
    }

    try {
      const result = await this.signAndSubmitTransaction({
        data: {
          function: "0x1::primary_fungible_store::transfer",
          typeArguments: ["0x1::fungible_asset::Metadata"],
          functionArguments: [contractAddress, to, amount],
          abi: faTransferAbi,
        },
      });

      const executedTransaction = await this.aptos.waitForTransaction({ transactionHash: typeof result === "string" ? result : result.hash });
      if (executedTransaction.success !== true) {
        csl("Aptos transferToken", "red-500", "Transfer token failed: %o", executedTransaction);
        throw new Error("Transfer token failed");
      }

      return typeof result === "string" ? result : result.hash;
    } catch (error) {
      csl("Aptos transferToken", "red-500", "Transfer token failed: %o", error);
      throw error;
    }
  }

  // Generic transfer method
  async transfer(data: {
    originAsset: string;
    depositAddress: string;
    amount: string;
  }): Promise<string> {
    const { originAsset, depositAddress, amount } = data;

    // Transfer APT
    if (originAsset === "APT" || originAsset === "apt") {
      return await this.transferAPT(depositAddress, amount);
    }

    // Transfer SPL token
    const result = await this.transferToken(
      originAsset,
      depositAddress,
      amount
    );
    return result;
  }

  async getAPTBalance(account: string, options?: { isCatchError?: boolean; }) {
    const { isCatchError = false } = options || {};

    try {
      const accountAPTAmount = await this.aptos.getAccountAPTAmount({
        accountAddress: account,
      });
      return accountAPTAmount.toString();
    } catch (error) {
      csl("Aptos getAPTBalance", "red-500", "Get APT balance failed: %o", error);
      if (isCatchError) {
        throw error;
      }
      return "0";
    }
  }

  async getTokenBalance(contractAddress: string, account: string, options?: { isCatchError?: boolean; }) {
    const { isCatchError = false } = options || {};

    try {
      const balance = await this.aptos.getBalance({
        accountAddress: account,
        asset: contractAddress,
      });
      return balance.toString();
    } catch (error) {
      csl("Aptos getTokenBalance", "red-500", "Get token balance failed: %o", error);
      if (isCatchError) {
        throw error;
      }
      return "0";
    }
  }

  async getBalance(token: any, account: string, options?: { isCatchError?: boolean; }) {
    if (token.symbol === "APT" || token.symbol === "apt" || token.symbol === "native") {
      return await this.getAPTBalance(account, options);
    }
    return await this.getTokenBalance(token.contractAddress, account, options);
  }

  async balanceOf(token: any, account: string, options?: { isCatchError?: boolean; }) {
    return await this.getBalance(token, account, options);
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
    if (!this.account) {
      throw new Error("Wallet not connected");
    }

    const { fromToken, depositAddress, amount } = data;
    const originAsset = fromToken.contractAddress;
    const isOriginNative = originAsset === "APT" || originAsset === "apt";
    const sender = this.account?.address?.toString();

    if (!sender) {
      throw new Error("Invalid sender address");
    }

    // Get signer public key for simulation
    // The account object from wallet adapter should have publicKey or we can derive it from address
    let signerPublicKey: any;
    if (this.account.publicKey) {
      signerPublicKey = this.account.publicKey;
    } else if (this.account.address) {
      // If publicKey is not available, we can use the address as PublicKey for simulation
      // Aptos SDK can handle this in some cases, but ideally we need the actual public key
      signerPublicKey = this.account.address;
    } else {
      throw new Error("Unable to get signer public key");
    }

    // For simulation, we might need to use a smaller amount if balance is insufficient
    // First try with the actual amount, if it fails due to insufficient balance, use a minimal amount
    let simulationAmount = amount;
    let useMinimalAmount = false;

    try {
      // Check balance first for APT transfers
      if (isOriginNative) {
        try {
          const balance = await this.aptos.getAccountAPTAmount({
            accountAddress: sender,
          });
          const amountBigInt = BigInt(amount);
          // If amount exceeds balance, use a minimal amount for estimation (1 octa)
          if (amountBigInt > balance) {
            simulationAmount = "1";
            useMinimalAmount = true;
          }
        } catch (error) {
          // If balance check fails, try with minimal amount
          simulationAmount = "1";
          useMinimalAmount = true;
        }
      }
    } catch (error) {
      // If check fails, proceed with original amount
    }

    let rawTxn;
    if (isOriginNative) {
      // For APT, ensure amount is in octas (smallest unit)
      // If amount might be in APT units, convert it, but typically it's already in octas
      rawTxn = await this.aptos.transaction.build.simple({
        sender,
        data: {
          function: "0x1::coin::transfer",
          typeArguments: ["0x1::aptos_coin::AptosCoin"],
          functionArguments: [depositAddress, simulationAmount],
        },
      });
    } else {
      rawTxn = await this.aptos.transaction.build.simple({
        sender,
        data: {
          function: "0x1::primary_fungible_store::transfer",
          typeArguments: ["0x1::fungible_asset::Metadata"],
          functionArguments: [originAsset, depositAddress, simulationAmount],
        },
      });
    }

    let simulation: any;
    try {
      const simulationResult = await this.aptos.transaction.simulate.simple({
        signerPublicKey,
        transaction: rawTxn,
        options: {
          estimateGasUnitPrice: true,
          estimateMaxGasAmount: true,
          estimatePrioritizedGasUnitPrice: true,
        },
      });
      simulation = simulationResult[0];
    } catch (error: any) {
      // If simulation fails with insufficient balance and we haven't tried minimal amount, retry
      if (!useMinimalAmount && (error.message?.includes("INSUFFICIENT_BALANCE") || error.message?.includes("EINSUFFICIENT_BALANCE"))) {
        simulationAmount = isOriginNative ? "1" : "1";
        // Rebuild transaction with minimal amount
        if (isOriginNative) {
          rawTxn = await this.aptos.transaction.build.simple({
            sender,
            data: {
              function: "0x1::coin::transfer",
              typeArguments: ["0x1::aptos_coin::AptosCoin"],
              functionArguments: [depositAddress, simulationAmount],
            },
          });
        } else {
          rawTxn = await this.aptos.transaction.build.simple({
            sender,
            data: {
              function: "0x1::primary_fungible_store::transfer",
              typeArguments: ["0x1::fungible_asset::Metadata"],
              functionArguments: [originAsset, depositAddress, simulationAmount],
            },
          });
        }

        const simulationResult = await this.aptos.transaction.simulate.simple({
          signerPublicKey,
          transaction: rawTxn,
          options: {
            estimateGasUnitPrice: true,
            estimateMaxGasAmount: true,
            estimatePrioritizedGasUnitPrice: true,
          },
        });
        simulation = simulationResult[0];
      } else {
        throw error;
      }
    }

    if (!simulation.success) {
      // If simulation still fails, return default values
      const defaultGasLimit = isOriginNative ? 2400n : 6000n; // 2000 * 1.2 or 5000 * 1.2
      const defaultGasPrice = 100n; // 100 octas per gas unit
      const defaultEstimateGas = defaultGasLimit * defaultGasPrice;

      console.warn(`Simulation failed: ${simulation.vm_status}, using default gas estimates`);
      return {
        gasLimit: defaultGasLimit,
        gasPrice: defaultGasPrice,
        estimateGas: defaultEstimateGas,
      };
    }

    const gasUsed = BigInt(simulation.gas_used || 0);
    const gasLimit = (gasUsed * 150n) / 100n;

    const gasPrice = BigInt(simulation.gas_unit_price || 100);

    const estimateGas = gasLimit * gasPrice;

    return {
      gasLimit,
      gasPrice,
      estimateGas,
    };
  }

  async getEstimateGas(params: any) {
    const { gasLimit, price, nativeToken, gasPrice } = params;

    let finalGasPrice = gasPrice;
    if (!finalGasPrice) {
      const feeData = await this.aptos.getGasPriceEstimation();
      finalGasPrice = feeData.gas_estimate || feeData.prioritized_gas_estimate || BigInt("100");
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
      function: functionId,
      typeArguments,
      functionArguments,
      fromToken,
      prices,
      defaultGasLimit = DEFAULT_GAS_LIMIT,
    } = params;

    const nativeTokenPrice = getPrice(prices, fromToken.nativeToken.symbol);

    const result = {
      estimateSourceGasLimit: dry ? DEFAULT_GAS_LIMIT_FAILED : DEFAULT_GAS_LIMIT,
      estimateSourceGas: 0n,
      estimateSourceGasUsd: "0",
    };

    const setDefaultGasLimit = async () => {
      const { usd, wei } = await this.getEstimateGas({
        gasLimit: DEFAULT_GAS_LIMIT,
        price: nativeTokenPrice,
        nativeToken: fromToken.nativeToken,
        gasPrice: dry ? "100" : void 0,
      });
      result.estimateSourceGas = wei;
      result.estimateSourceGasUsd = usd;
    };

    let finalGasLimit = defaultGasLimit;

    if (dry) {
      await setDefaultGasLimit();
      return result;
    }

    const zeroPublicKey = new Ed25519PublicKey(new Uint8Array(32));
    let signerPublicKey: any;
    if (this.account.publicKey) {
      signerPublicKey = this.account.publicKey;
    } else if (this.account.address) {
      signerPublicKey = this.account.address;
    } else {
      signerPublicKey = zeroPublicKey;
    }
    let sender = this.account?.address?.toString();
    if (!sender) {
      const authKey = AuthenticationKey.fromPublicKey({ publicKey: zeroPublicKey });
      sender = authKey.derivedAddress();
    }
    let simulation: any;
    try {
      const rawTxn = await this.aptos.transaction.build.simple({
        sender,
        data: {
          function: functionId,
          typeArguments,
          functionArguments,
        },
      });
      const simulationResult = await this.aptos.transaction.simulate.simple({
        signerPublicKey,
        transaction: rawTxn,
        options: {
          estimateGasUnitPrice: true,
          estimateMaxGasAmount: true,
          estimatePrioritizedGasUnitPrice: true,
        },
      });
      simulation = simulationResult[0];
      if (!simulation.success) {
        throw new Error(`Simulation failed: ${simulation}`);
      }
      const gasUsed = BigInt(simulation.gas_used || 0);
      finalGasLimit = (gasUsed * 150n) / 100n; // Add 50% buffer
      result.estimateSourceGasLimit = finalGasLimit;
      const gasPrice = BigInt(simulation.gas_unit_price || 100);
      const { usd, wei } = await this.getEstimateGas({
        gasLimit: finalGasLimit,
        price: nativeTokenPrice,
        nativeToken: fromToken.nativeToken,
        gasPrice: gasPrice,
      });
      result.estimateSourceGas = wei;
      result.estimateSourceGasUsd = usd;
    } catch (error) {
      csl("Aptos estimateTransaction", "red-500", "simulation failed: %o", error);
      await setDefaultGasLimit();
      result.estimateSourceGasLimit = DEFAULT_GAS_LIMIT_FAILED / 2n;
    }

    return result;
  }

  async checkTransactionStatus(signature: string) {
    try {
      // Get transaction by hash
      const transaction = await this.aptos.getTransactionByHash({
        transactionHash: signature,
      });

      if (!transaction) {
        return false;
      }

      // Check if transaction is successful by checking the success field
      // The transaction object should have a success property or we can check the status
      return (transaction as any).success === true || (transaction as any).status === "success";
    } catch (error) {
      csl("Aptos checkTransactionStatus", "red-500", "Check transaction status failed: %o", error);
      return false;
    }
  }

  async quoteOneClickProxy(params: any) {
    const {
      proxyAddress,
      fromToken,
      depositAddress,
      amountWei,
      prices,
    } = params;

    const execTime = new ExecTime({ type: "OneClick Aptos", logStyle: "sky-200" });

    const result: any = { fees: {} };

    if (!this.account) {
      throw new Error("Wallet not connected");
    }

    if (!depositAddress) {
      throw new Error("depositAddress is required");
    }

    try {
      const sender = this.account?.address?.toString();
      if (!sender) {
        throw new Error("Invalid sender address");
      }

      const typeArgument = `0x1::fungible_asset::Metadata`;

      // const functionId = `${proxyAddress}::stableflow_proxy::proxy_transfer` as `${string}::${string}::${string}`;
      const functionId = `${proxyAddress}::stableflow_proxy::proxy_transfer_fa` as `${string}::${string}::${string}`;
      const functionArguments = [fromToken.contractAddress, depositAddress, amountWei];

      result.sendParam = {
        function: functionId,
        typeArguments: [typeArgument],
        functionArguments: functionArguments,
      };

    } catch (error) {
      csl("Aptos quoteOneClickProxy", "red-500", "oneclick quote proxy failed: %o", error);
      // Return default values on error
      const defaultGasLimit = 5000n;
      const defaultGasPrice = 100n;
      const defaultEstimateGas = defaultGasLimit * defaultGasPrice;

      const estimateGasUsd = Big(defaultEstimateGas.toString())
        .div(10 ** fromToken.nativeToken.decimals)
        .times(getPrice(prices, fromToken.nativeToken.symbol));

      result.fees.estimateGasUsd = numberRemoveEndZero(Big(estimateGasUsd).toFixed(20));
      result.estimateSourceGas = defaultEstimateGas;
      result.totalEstimateSourceGas = defaultEstimateGas;
      result.estimateSourceGasUsd = numberRemoveEndZero(Big(estimateGasUsd).toFixed(20));
    }

    execTime.logTotal("quoteOneClickProxy");
    return result;
  }

  async sendTransaction(params: any) {
    if (!this.account) {
      throw new Error("Wallet not connected");
    }

    const { function: functionId, typeArguments, functionArguments } = params;

    if (!functionId || !typeArguments || !functionArguments) {
      throw new Error("Invalid sendParam: function, typeArguments, and functionArguments are required");
    }

    try {
      const sender = this.account?.address?.toString();
      if (!sender) {
        throw new Error("Invalid sender address");
      }

      const result = await this.signAndSubmitTransaction({
        data: {
          function: functionId as `${string}::${string}::${string}`,
          typeArguments,
          functionArguments,
        },
      });

      const executedTransaction = await this.aptos.waitForTransaction({
        transactionHash: typeof result === "string" ? result : result.hash
      });

      if (executedTransaction.success !== true) {
        csl("Aptos sendTransaction", "red-500", "Proxy transfer failed: %o", executedTransaction);
        throw new Error("Proxy transfer failed");
      }

      return typeof result === "string" ? result : result.hash;
    } catch (error) {
      csl("Aptos sendTransaction", "red-500", "Send transaction failed: %o", error);
      throw error;
    }
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
   * Sign and send a Rhea Aptos tx payload ({ function, type_arguments, arguments }).
   */
  async sendRheaTx(tx: any): Promise<string> {
    const functionId = tx?.function;
    const typeArguments = tx?.typeArguments ?? tx?.type_arguments;
    const functionArguments = tx?.functionArguments ?? tx?.arguments;

    if (!functionId || !typeArguments || !functionArguments) {
      throw new Error(
        "Invalid Aptos Rhea tx: function, type_arguments, and arguments are required"
      );
    }

    return this.sendTransaction({
      function: functionId,
      typeArguments,
      functionArguments,
    });
  }

  /**
   * Unified send method that routes to specific send methods based on type
   * @param type Send type from SendTypeSENDm
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

const faTransferAbi: EntryFunctionABI = {
  typeParameters: [{ constraints: [] }],
  parameters: [parseTypeTag("0x1::object::Object"), new TypeTagAddress(), new TypeTagU64()],
};
