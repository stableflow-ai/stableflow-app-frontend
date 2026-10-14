import { coinWithBalance, Transaction } from "@mysten/sui/transactions";
import Big from "big.js";
import { getPrice } from "@/utils/format/price";
import { numberRemoveEndZero } from "@/utils/format/number";
import { SendType } from "../types";
import { Service } from "@/services/constants";
import { csl } from "@/utils/log";
import { BridgeDefaultWallets } from "@/config";
import { SuiGrpcClient } from "@mysten/sui/grpc";
import { getChainRpcUrl } from "@/config/chains";

const SUI_COIN_TYPE = "0x2::sui::SUI";
const DEFAULT_GAS_LIMIT = 3000000n;
const DEFAULT_GAS_LIMIT_FAILED = 4000000n;

export default class SuiWallet {
  private account: any | null;
  private signAndExecuteTransaction: any;
  private suiClient: SuiGrpcClient;

  constructor(options: { account: any | null; signAndExecuteTransaction: any; }) {
    this.signAndExecuteTransaction = options.signAndExecuteTransaction;
    this.account = options.account;
    this.suiClient = new SuiGrpcClient({
      network: "mainnet",
      baseUrl: getChainRpcUrl("Sui").rpcUrl,
    });
  }

  // Transfer SUI
  async transferSUI(to: string, amount: string): Promise<string> {
    if (!this.account) {
      throw new Error("Wallet not connected");
    }

    try {
      const tx = new Transaction();

      // Convert amount to octas (1 SUI = 10^9)
      const amountInMist = BigInt(Math.floor(parseFloat(amount) * 10 ** 9));

      const [coinToSend] = tx.splitCoins(tx.gas, [amountInMist]);

      tx.transferObjects([coinToSend], to);

      // Sign and submit transaction
      const result = await this.signAndExecuteTransaction({
        transaction: tx,
        options: {
          showEffects: true,
          showBalanceChanges: true,
        },
      });

      return typeof result === "string" ? result : result.Transaction.digest;
    } catch (error) {
      csl("Sui transferSUI", "red-500", "Transfer APT failed: %o", error);
      throw error;
    }
  }

  // Transfer token
  async transferToken(contractAddress: string, to: string, amount: string): Promise<string> {
    if (!this.account) {
      throw new Error("Wallet not connected");
    }

    try {
      const owner = this.account?.address?.toString();
      if (!owner) {
        throw new Error("Invalid sender address");
      }

      const amountBigInt = BigInt(amount);
      const coinsResponse = await this.suiClient.listCoins({
        owner,
        coinType: contractAddress,
        limit: 50,
      });

      if (!coinsResponse.objects?.length) {
        throw new Error("Insufficient token balance");
      }

      const [primaryCoin, ...restCoins] = coinsResponse.objects;
      const tx = new Transaction();
      const primaryInput = tx.object(primaryCoin.objectId);

      if (restCoins.length) {
        tx.mergeCoins(
          primaryInput,
          restCoins.map((coin: any) => tx.object(coin.objectId)),
        );
      }

      const [coinToSend] = tx.splitCoins(primaryInput, [amountBigInt]);
      tx.transferObjects([coinToSend], to);

      const result = await this.signAndExecuteTransaction({
        transaction: tx,
        options: {
          showEffects: true,
          showBalanceChanges: true,
        },
      });

      return typeof result === "string" ? result : result.Transaction.digest;
    } catch (error) {
      csl("Sui transferToken", "red-500", "Transfer token failed: %o", error);
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

    // Transfer SUI
    if (originAsset === "SUI" || originAsset === "sui" || originAsset === "native") {
      return await this.transferSUI(depositAddress, amount);
    }

    // Transfer token
    const result = await this.transferToken(
      originAsset,
      depositAddress,
      amount
    );
    return result;
  }

  async getSUIBalance(account: string) {
    try {
      const response = await this.suiClient.core.getBalance({
        owner: account,
        coinType: SUI_COIN_TYPE,
      });
      return response.balance.balance || "0";
    } catch (error) {
      csl("Sui getSUIBalance", "red-500", "Get SUI balance failed: %o", error);
      return "0";
    }
  }

  async getTokenBalance(contractAddress: string, account: string) {
    try {
      const response = await this.suiClient.core.getBalance({
        owner: account,
        coinType: contractAddress,
      });
      return response.balance.balance || "0";
    } catch (error) {
      csl("Sui getTokenBalance", "red-500", "Get token balance failed: %o", error);
      return "0";
    }
  }

  async getBalance(token: any, account: string) {
    if (token.symbol === "SUI" || token.symbol === "sui" || token.symbol === "native") {
      return await this.getSUIBalance(account);
    }
    return await this.getTokenBalance(token.contractAddress, account);
  }

  async balanceOf(token: any, account: string) {
    return await this.getBalance(token, account);
  }

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
    const sender = this.account?.address?.toString();
    if (!sender) {
      throw new Error("Invalid sender address");
    }

    const tx = new Transaction();
    const originAsset = fromToken?.contractAddress;
    const isNative = originAsset === "SUI" || originAsset === "sui" || originAsset === "native";

    if (isNative) {
      const [coinToSend] = tx.splitCoins(tx.gas, [BigInt(amount)]);
      tx.transferObjects([coinToSend], depositAddress);
    } else {
      const coinsResponse = await this.suiClient.listCoins({
        owner: sender,
        coinType: originAsset,
        limit: 50,
      });

      if (!coinsResponse.objects?.length) {
        throw new Error("No token coins found for gas estimation");
      }

      const [primaryCoin, ...restCoins] = coinsResponse.objects;
      const primaryInput = tx.object(primaryCoin.objectId);
      if (restCoins.length) {
        tx.mergeCoins(
          primaryInput,
          restCoins.map((coin: any) => tx.object(coin.objectId)),
        );
      }
      const [coinToSend] = tx.splitCoins(primaryInput, [BigInt(amount)]);
      tx.transferObjects([coinToSend], depositAddress);
    }

    const ett = await this.estimateTransaction({
      dry: false,
      tx,
      fromToken,
      prices: {},
    });

    return {
      gasLimit: ett.estimateSourceGasLimit,
      gasPrice: 1n,
      estimateGas: ett.estimateSourceGas,
    };
  }

  async getEstimateGas(params: any) {
    const { gasLimit, price, nativeToken } = params;

    const finalGasPrice = 1;
    // try {
    //   const { referenceGasPrice } = await this.suiClient.getReferenceGasPrice();
    //   finalGasPrice = referenceGasPrice || BigInt("600");
    // } catch {
    // }

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
      tx,
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
      });
      result.estimateSourceGas = wei;
      result.estimateSourceGasUsd = usd;
    };

    let finalGasLimit = defaultGasLimit;

    if (dry) {
      await setDefaultGasLimit();
      return result;
    }

    let sender = this.account?.address;
    if (!sender) {
      sender = BridgeDefaultWallets["sui"];
    }
    let simulation: any;
    try {
      tx.setSender(sender);

      const txBytes = await tx.build({ client: this.suiClient });

      const simulation = await this.suiClient.core.simulateTransaction({
        transaction: txBytes,
        checksEnabled: false,
        include: {
          effects: true,
        },
      });

      const simulationTx = simulation.$kind === "Transaction" ? simulation.Transaction : simulation.FailedTransaction;
      const gasUsed = simulationTx?.effects?.gasUsed;
      finalGasLimit = BigInt(gasUsed?.computationCost || "0")
        + BigInt(gasUsed?.storageCost || "0")
        - BigInt(gasUsed?.storageRebate || "0");

      finalGasLimit = (finalGasLimit * 150n) / 100n; // Add 50% buffer

      const { usd, wei } = await this.getEstimateGas({
        gasLimit: finalGasLimit,
        price: nativeTokenPrice,
        nativeToken: fromToken.nativeToken,
      });

      result.estimateSourceGasLimit = finalGasLimit;
      result.estimateSourceGas = wei;
      result.estimateSourceGasUsd = usd;
    } catch (error) {
      csl("Sui estimateTransaction", "red-500", "simulation failed: %o", error);
      await setDefaultGasLimit();
      result.estimateSourceGasLimit = DEFAULT_GAS_LIMIT_FAILED;
    }

    return result;
  }

  async checkTransactionStatus(signature: string) {
    try {
      const tx = await this.suiClient.core.waitForTransaction({
        digest: signature,
      });
      return tx.Transaction?.status?.success === true;
    } catch (error) {
      csl("Sui checkTransactionStatus", "red-500", "Check transaction status failed: %o", error);
      return false;
    }
  }

  async quoteOneClickProxy(params: any) {
    const {
      proxyAddress,
      fromToken,
      depositAddress,
      amountWei,
    } = params;

    const result: any = { fees: {} };

    if (!depositAddress) {
      throw new Error("depositAddress is required");
    }

    const tx = new Transaction();

    const payCoin = coinWithBalance({
      type: fromToken.contractAddress,
      balance: amountWei,
      useGasCoin: false,
    });

    tx.moveCall({
      target: `${proxyAddress}::proxy_transfer::proxy_transfer`,
      typeArguments: [fromToken.contractAddress],
      arguments: [payCoin, tx.pure.u64(amountWei), tx.pure.address(depositAddress)],
    });

    result.sendParam = { tx };

    return result;
  }

  async sendTransaction(params: any) {
    if (!this.account) {
      throw new Error("Wallet not connected");
    }

    const { tx } = params;

    try {
      const sender = this.account?.address?.toString();
      if (!sender) {
        throw new Error("Invalid sender address");
      }

      const result = await this.signAndExecuteTransaction({
        transaction: tx,
        options: {
          showEffects: true,
          showBalanceChanges: true,
        },
      });

      return typeof result === "string" ? result : result.Transaction.digest;
    } catch (error) {
      csl("Sui sendTransaction", "red-500", "Send transaction failed: %o", error);
      throw error;
    }
  }

  async quote(type: Service, params: any) {
    switch (type) {
      case Service.OneClick:
        return await this.quoteOneClickProxy(params);
      default:
        throw new Error(`Unsupported quote type: ${type}`);
    }
  }

  /**
   * Sign and send a Rhea Sui tx payload ({ kind: sui_transfer, amount, depositAddress, coinType }).
   * Amount is already in mist / coin smallest units.
   */
  async sendRheaTx(tx: any): Promise<string> {
    const kind = String(tx?.kind || "").toLowerCase();
    if (kind !== "sui_transfer") {
      throw new Error(`Unsupported Sui Rhea tx kind: ${tx?.kind}`);
    }

    if (!this.account) {
      throw new Error("Wallet not connected");
    }

    const to = tx.depositAddress || tx.to;
    if (!to) {
      throw new Error("Invalid Rhea Sui tx: missing depositAddress");
    }

    const amount = tx.amount;
    if (amount == null || amount === "") {
      throw new Error("Invalid Rhea Sui tx: missing amount");
    }

    const coinType = tx.coinType || tx.tokenAddress || SUI_COIN_TYPE;
    const amountBigInt = BigInt(amount);

    if (coinType === SUI_COIN_TYPE) {
      try {
        const suiTx = new Transaction();
        const [coinToSend] = suiTx.splitCoins(suiTx.gas, [amountBigInt]);
        suiTx.transferObjects([coinToSend], to);

        const result = await this.signAndExecuteTransaction({
          transaction: suiTx,
          options: {
            showEffects: true,
            showBalanceChanges: true,
          },
        });

        return typeof result === "string" ? result : result.Transaction.digest;
      } catch (error) {
        csl("Sui sendRheaTx", "red-500", "Transfer SUI failed: %o", error);
        throw error;
      }
    }

    return this.transferToken(coinType, to, String(amount));
  }

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
