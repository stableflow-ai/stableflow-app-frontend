import { addressToBytes32 } from "@/utils/address-validation";
import { numberRemoveEndZero } from "@/utils/format/number";
import { getPrice } from "@/utils/format/price";
import { ethers } from "ethers";
import Big from "big.js";
import { TronWeb } from "tronweb";
import { getChainRpcUrl } from "@/config/chains";
import { BridgeDefaultWallets } from "@/config";
import { SendType } from "../types";
import { Service } from "@/services/constants";
import { QuoteErrorLevel } from "@/services/quote-error";
import { DATA_HEX_PROTOBUF_EXTRA, LZ_RECEIVE_VALUE, SIGNATURE_SIZE, USDT0_LEGACY_MESH_TRANSFTER_FEE } from "@/services/usdt0/config";
import { getHopMsgFee } from "@/services/usdt0/hop-composer";
import { getDestinationAssociatedTokenAddress } from "../utils/solana";
import { csl } from "@/utils/log";
import { NATIVE_MSG_FEE_BUFFER } from "../utils/layerzero";
import { ExecTime } from "@/utils/exec-time";
import { generateRpcSignature } from "@/libs/signature";

const DefaultTronWalletAddress = BridgeDefaultWallets["tron"];
const customTronWeb = new TronWeb({
  fullHost: getChainRpcUrl("Tron").rpcUrl,
  headers: {},
  privateKey: "",
});

export default class TronWallet {
  private signAndSendTransaction: any;
  private address: string;
  private tronWeb: any;

  constructor(options: any) {
    this.signAndSendTransaction = options.signAndSendTransaction;
    this.address = options.address;

    customTronWeb.setAddress(this.address || DefaultTronWalletAddress);
    this.tronWeb = customTronWeb;
  }

  async waitForTronWeb() {
    return new Promise((resolve) => {
      if (this.tronWeb) {
        const address = this.tronWeb.defaultAddress.base58 || DefaultTronWalletAddress;
        customTronWeb.setAddress(address);
        const rpcSignature = generateRpcSignature("tron");
        customTronWeb.setHeader(rpcSignature.headers);
        this.tronWeb = customTronWeb;
        resolve(this.tronWeb);
        return;
      }

      const checkTronWeb = () => {
        if ((window as any).tronWeb) {
          this.tronWeb = (window as any).tronWeb;
          const address = this.tronWeb.defaultAddress.base58 || DefaultTronWalletAddress;
          customTronWeb.setAddress(address);
          const rpcSignature = generateRpcSignature("tron");
          customTronWeb.setHeader(rpcSignature.headers);
          this.tronWeb = customTronWeb;
          resolve(this.tronWeb);
        } else {
          setTimeout(checkTronWeb, 100);
        }
      };

      checkTronWeb();

      setTimeout(() => {
        customTronWeb.setAddress(DefaultTronWalletAddress);
        const rpcSignature = generateRpcSignature("tron");
        customTronWeb.setHeader(rpcSignature.headers);
        this.tronWeb = customTronWeb;
        resolve(this.tronWeb);
        csl("TronWallet waitForTronWeb", "red-500", "TronWeb initialization timeout");
      }, 10000);
    });
  }

  async transfer(data: {
    originAsset: string;
    depositAddress: string;
    amount: string;
  }) {
    const { originAsset, depositAddress, amount } = data;

    await this.waitForTronWeb();

    if (originAsset === "TRX" || originAsset === "trx") {
      return await this.transferTRX(depositAddress, amount);
    }

    // Transfer TRC20 token (USDT, USDC, etc.)
    return await this.transferToken(originAsset, depositAddress, amount);
  }

  async transferTRX(to: string, amount: string) {
    await this.waitForTronWeb();

    const transaction = await this.tronWeb.transactionBuilder.sendTrx(
      to,
      this.tronWeb.toSun(amount)
    );

    return this.sendTransaction({ tx: { transaction } });
  }

  async transferToken(contractAddress: string, to: string, amount: string) {
    await this.waitForTronWeb();

    const functionSelector = 'transfer(address,uint256)';
    const parameter = [{ type: 'address', value: to }, { type: 'uint256', value: amount }];
    const tx = await this.tronWeb.transactionBuilder.triggerSmartContract(contractAddress, functionSelector, {}, parameter);

    return this.sendTransaction({ tx });

    // // Get contract instance
    // const contract = await this.tronWeb.contract().at(contractAddress);

    // // Call transfer function
    // const transaction = await contract.transfer(to, amount).send({
    //   feeLimit: 100_000_000
    // });

    // return transaction;
  }

  async getBalance(token: any, account: string, options?: { isCatchError?: boolean; }) {
    await this.waitForTronWeb();

    if (token.symbol === "TRX" || token.symbol === "trx" || token.symbol === "native") {
      return await this.getTRXBalance(account, options);
    }

    return await this.getTokenBalance(token.contractAddress, account, options);
  }

  async getTRXBalance(account: string, options?: { isCatchError?: boolean; }) {
    const { isCatchError = false } = options || {};

    await this.waitForTronWeb();

    try {
      const balance = await this.tronWeb.trx.getBalance(account);
      return balance.toString();
    } catch (error) {
      csl("Tron getTRXBalance", "red-500", "Get TRX balance failed: %o", error);
      if (isCatchError) {
        throw error;
      }
      return "0";
    }
  }

  async getTokenBalance(contractAddress: string, account: string, options?: { isCatchError?: boolean; }) {
    const { isCatchError = false } = options || {};

    await this.waitForTronWeb();

    try {
      const contract = await this.tronWeb.contract().at(contractAddress);
      const balance = await contract.balanceOf(account).call();

      // Convert from smallest unit to token unit (assuming 6 decimals)
      return balance.toString();
    } catch (error) {
      csl("Tron getTokenBalance", "red-500", "Get token balance failed: %o", error);
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
   * Estimate gas limit for transfer transaction
   * @param data Transfer data
   * @returns Gas limit estimate (bandwidth or energy), gas price, and estimated gas cost
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
    const { fromToken } = data;
    const originAsset = fromToken.contractAddress;

    // Tron uses bandwidth for TRX transfers and energy for smart contract calls
    // TRX transfer: ~268 bandwidth
    // TRC20 transfer: ~30000 energy (estimated)
    let gasLimit: bigint;

    if (originAsset === "TRX" || originAsset === "trx") {
      // TRX transfer uses bandwidth (typically 268)
      gasLimit = 268n;
    } else {
      // TRC20 token transfer uses energy (typically 30000-35000)
      gasLimit = 30000n;
    }

    // Increase by 20% to provide buffer
    gasLimit = (gasLimit * 120n) / 100n;

    // Get current energy price from Tron (in sun)
    // For bandwidth, it's free if you have bandwidth
    // For energy, the price varies, typically 420 sun per energy unit
    let gasPrice: bigint = 100n;
    // try {
    //   const chainParameters = await this.tronWeb.trx.getChainParameters();
    //   const energyPrice = chainParameters?.find((p: any) => p.key === "getEnergyFee")?.value || 420;
    //   gasPrice = BigInt(energyPrice);
    // } catch (error) {
    //   // Default energy price: 420 sun per energy unit
    //   gasPrice = 420n;
    // }

    // Calculate estimated gas cost: gasLimit * gasPrice
    const estimateGas = gasLimit * gasPrice;

    return {
      gasLimit,
      gasPrice,
      estimateGas
    };
  }

  async getEstimateGas(params: any) {
    const { gasLimit, price, nativeToken } = params;

    const energyPrice = BigInt(100);
    const estimateGas = Big(gasLimit.toString()).times(energyPrice.toString());
    const estimateGasAmount = Big(estimateGas).div(10 ** nativeToken.decimals);
    const estimateGasUsd = Big(estimateGasAmount).times(price || 1);

    return {
      gasPrice: energyPrice,
      usd: numberRemoveEndZero(Big(estimateGasUsd).toFixed(20)),
      wei: BigInt(estimateGas.toFixed(0)),
      amount: numberRemoveEndZero(Big(estimateGasAmount).toFixed(nativeToken.decimals)),
    };
  }

  async estimateTransaction(params: any) {
    const {
      dry,
      transactionParams,
      fromToken,
      prices,
      defaultEnergyUsed,
      defaultRawDataHexLength,
      buffer,
    } = params;

    const nativeTokenPrice = getPrice(prices, fromToken.nativeToken.symbol);

    let energyUsed = defaultEnergyUsed || 200000;
    let rawDataHexLength = defaultRawDataHexLength || 1000;
    try {
      const transaction = await this.tronWeb.transactionBuilder.triggerConstantContract(...transactionParams);
      energyUsed = transaction.energy_used || 200000;
      rawDataHexLength = transaction.transaction.raw_data_hex.length || 1000;
    } catch (error) {
      csl("Usdt0 Tron", "red-500", "estimateTransaction triggerConstantContract error: %o, action: %o", error, transactionParams?.[1]);
    }
    const bandwidthAmount = Big(Big(rawDataHexLength).div(2).plus(DATA_HEX_PROTOBUF_EXTRA).plus(SIGNATURE_SIZE)).times(1e-3);
    const bandwidthUsed = Big(bandwidthAmount).div(1e2).times(10 ** fromToken.nativeToken.decimals);
    let totalUsed = Big(energyUsed).plus(bandwidthUsed);

    if (buffer) {
      totalUsed = Big(totalUsed).times(Big(1).plus(buffer));
    }

    const { usd, wei } = await this.getEstimateGas({
      gasLimit: totalUsed.toFixed(0),
      price: nativeTokenPrice,
      nativeToken: fromToken.nativeToken,
    });

    const result = {
      estimateSourceGasLimit: energyUsed,
      estimateSourceGas: wei,
      estimateSourceGasUsd: usd,
    };

    return result;
  }

  async estimateApprove(params: any) {
    const {
      dry,
      spender,
      amountWei,
      fromToken,
      prices,
    } = params;

    const approveParams = [
      fromToken.contractAddress,
      "approve(address,uint256)",
      {},
      [
        { type: "address", value: spender },
        { type: "uint256", value: amountWei }
      ]
    ];
    return this.estimateTransaction({
      dry,
      transactionParams: approveParams,
      fromToken,
      prices,
      defaultEnergyUsed: 100000,
      defaultRawDataHexLength: 500,
      // +10%
      buffer: 0.1,
    });
  }

  async pollingTransactionStatus(txHash: string, options?: {
    maxPolls?: number;
    pollInterval?: number;
    isTRX?: boolean;
  }) {
    await this.waitForTronWeb();

    const { maxPolls = 60, pollInterval = 2000, isTRX } = options || {};
    let pollCount = 0;

    return new Promise((resolve) => {
      const poll = async () => {
        pollCount++;
        csl("TronWallet pollingTransactionStatus", "teal-400", "polling transaction status (%s), %d times", txHash, pollCount);

        try {
          const txInfo = await this.tronWeb.trx.getTransactionInfo(txHash);
          csl("TronWallet pollingTransactionStatus", "teal-400", "transaction info (%s): %o", txHash, txInfo);

          // if the transaction info exists and has receipt, the transaction has been on-chain
          if (txInfo && txInfo.receipt) {
            if (isTRX) {
              resolve(true);
              return;
            }

            const result = txInfo.receipt.result;

            if (result === "SUCCESS") {
              csl("TronWallet pollingTransactionStatus", "teal-400", "transaction success (%s)", txHash);
              resolve(true);
              return;
            } else if (result === "FAILED" || result === "REVERT") {
              csl("TronWallet pollingTransactionStatus", "red-500", "transaction failed (%s), result: %s", txHash, result);
              resolve(false);
              return;
            } else {
              // other status, continue polling
              csl("TronWallet pollingTransactionStatus", "teal-400", "unknown transaction status (%s), result: %s, continue polling...", txHash, result);
            }
          } else {
            // transaction info exists but no receipt, maybe still being packed, continue polling
            csl("TronWallet pollingTransactionStatus", "teal-400", "transaction not confirmed (%s), continue polling...", txHash);
          }
        } catch (error: any) {
          // if the transaction does not exist (maybe still being packed), continue polling
          // common error messages include "not found" or "does not exist"
          const errorMessage = error?.message || String(error);
          if (
            errorMessage.includes("not found") ||
            errorMessage.includes("does not exist") ||
            errorMessage.includes("not exist")
          ) {
            csl("TronWallet pollingTransactionStatus", "teal-400", "transaction not on-chain (%s), continue polling...", txHash);
          } else {
            // other error, log but continue polling
            console.warn(`query transaction status error (${txHash}): %o`, errorMessage);
          }
        }

        // check if the maximum polling times is reached
        if (pollCount >= maxPolls) {
          console.error(`polling timeout (${txHash}), maximum polling times reached: ${maxPolls}`);
          resolve(false);
          return;
        }

        // continue polling
        setTimeout(poll, pollInterval);
      };

      // start polling
      poll();
    });
  }

  async checkTransactionStatus(txHash: string) {
    await this.waitForTronWeb();

    try {
      const txInfo = await this.tronWeb.trx.getTransactionInfo(txHash);

      if (txInfo && txInfo.receipt) {
        return txInfo.receipt.result === "SUCCESS";
      }

      return false;
    } catch (error) {
      return false;
    }
  }

  async getTransactionResult(txHash: string) {
    await this.waitForTronWeb();

    try {
      const txInfo = await this.tronWeb.trx.getTransactionInfo(txHash);
      return txInfo;
    } catch (error) {
      return {};
    }
  }

  async allowance(params: any) {
    const {
      dry,
      contractAddress,
      spender,
      address,
      amountWei,
      strict = false,
    } = params;

    // Get contract instance
    const contract = await this.tronWeb.contract().at(contractAddress);

    if (dry) {
      return {
        contract,
        allowance: "0",
        needApprove: false,
      };
    }

    await this.waitForTronWeb();

    try {
      // Get allowance
      let allowance = "0";
      try {
        const allowanceResult = await contract.allowance(address, spender).call();
        allowance = allowanceResult.toString();
      } catch (error) {
        csl("TronWallet allowance", "red-500", "Error getting allowance: %o", error);
        if (strict) {
          throw error;
        }
      }

      return {
        contract,
        allowance,
        needApprove: Big(amountWei || 0).gt(allowance || 0),
      };
    } catch (error) {
      csl("TronWallet allowance", "red-500", "Error in allowance: %o", error);
      if (strict) {
        throw error;
      }
      // Return default values on error
      return {
        contract: null,
        allowance: "0",
        needApprove: true,
      };
    }
  }

  async approve(params: any) {
    const {
      contractAddress,
      spender,
      amountWei,
      isApproveMax = false,
      isDetails = false,
      isWaitTxReceipt = true,
    } = params;

    await this.waitForTronWeb();

    const detailResult: any = {
      success: false,
      data: {},
      message: null,
    };

    try {
      // Determine approval amount
      let _amountWei = amountWei;
      if (isApproveMax) {
        // Max uint256 value: 2^256 - 1
        _amountWei = "115792089237316195423570985008687907853269984665640564039457584007913129639935";
      }

      // Build approve transaction using triggerSmartContract
      const functionSelector = 'approve(address,uint256)';
      const parameter = [
        { type: 'address', value: spender },
        { type: 'uint256', value: _amountWei }
      ];
      const tx = await this.tronWeb.transactionBuilder.triggerSmartContract(
        contractAddress,
        functionSelector,
        {},
        parameter
      );

      // Sign and send transaction
      const txHash = await this.sendTransaction({ tx });
      let txInfo: Record<string, unknown> | null = null;

      if (isWaitTxReceipt) {
        const pollingResult = await this.pollingTransactionStatus(txHash, {
          maxPolls: 120,
          pollInterval: 2000,
        });
        if (!pollingResult) {
          csl("TronWallet approve", "red-500", "Failed polling approve transaction status");
          if (isDetails) {
            detailResult.message = "Failed to get approve result";
            return detailResult;
          }
          return false;
        }
        txInfo = await this.getTransactionResult(txHash);
      }

      if (isDetails) {
        const txReceipt = txInfo?.receipt as { result?: string } | undefined;
        detailResult.success = true;
        detailResult.data = {
          txHash,
          txInfo,
          receiptResult: txReceipt?.result,
          blockNumber: txInfo?.blockNumber,
          blockTimeStamp: txInfo?.blockTimeStamp,
        };
        return detailResult;
      }

      return txHash;
    } catch (error: any) {
      csl("TronWallet approve", "red-500", "Error approve: %o", error);
      if (isDetails) {
        detailResult.message = error.message;
        return detailResult;
      }
      return false;
    }
  }

  toBytes32(addr: string): string {
    const hex = this.tronWeb.address.toHex(addr).slice(2);
    return "0x" + hex.padStart(64, "0");
  }

  async quoteOFT(params: any) {
    const {
      dry,
      abi,
      dstEid,
      recipient,
      amountWei,
      slippageTolerance,
      payInLzToken,
      fromToken,
      toToken,
      prices,
      originLayerzeroAddress,
      destinationLayerzeroAddress,
      excludeFees,
      refundTo,
      multiHopComposer,
      isMultiHopComposer,
      isOriginLegacy,
      isDestinationLegacy,
      originLayerzero,
      destinationLayerzero,
      hopQuote,
    } = params;

    const { Options } = await import("@layerzerolabs/lz-v2-utilities");

    const result: any = {
      needApprove: false,
      approveSpender: originLayerzeroAddress,
      sendParam: void 0,
      quoteParam: {
        ...params,
        originLayerzeroAddress: originLayerzeroAddress,
        destinationLayerzeroAddress: destinationLayerzeroAddress,
      },
      fees: {},
      totalFeesUsd: void 0,
      estimateSourceGas: void 0,
      totalEstimateSourceGas: 0n,
      estimateSourceGasUsd: void 0,
      estimateTime: 0, // seconds - dynamically calculated using LayerZero formula
      outputAmount: numberRemoveEndZero(Big(amountWei || 0).div(10 ** params.fromToken.decimals).toFixed(params.fromToken.decimals, 0)),
    };

    const execTime = new ExecTime({ type: "USDT0 Tron", logStyle: "indigo-300" });
    await this.waitForTronWeb();
    execTime.log("waitForTronWeb");

    execTime.breakpoint();
    const oftContract = await this.tronWeb.contract(abi, originLayerzeroAddress);
    execTime.log("tronWeb.contract originLayerzeroAddress");

    execTime.breakpoint();
    const userAddress = refundTo || this.tronWeb.defaultAddress.base58;
    const approvalRequired = isOriginLegacy ? originLayerzero.oftLegacyApprovalRequired : originLayerzero.oftApprovalRequired;
    execTime.log("approvalRequired");

    const lzReceiveOptionGas = isDestinationLegacy ? destinationLayerzero.lzReceiveOptionGasLegacy : destinationLayerzero.lzReceiveOptionGas;
    let lzReceiveOptionValue = 0;

    execTime.breakpoint();
    const destATA = await getDestinationAssociatedTokenAddress({
      recipient,
      toToken,
    });
    execTime.log("getDestinationAssociatedTokenAddress");
    if (destATA.needCreateTokenAccount) {
      lzReceiveOptionValue = LZ_RECEIVE_VALUE[toToken.chainName] || 0;
    }

    let unMultiHopExtraOptions = Options.newOptions().toHex();
    if (!isMultiHopComposer && lzReceiveOptionValue) {
      unMultiHopExtraOptions = Options.newOptions().addExecutorLzReceiveOption(lzReceiveOptionGas, lzReceiveOptionValue).toHex();
    }

    // 2. quote send
    const sendParam: any = [
      // dstEid
      dstEid,
      // to
      // "0x0000000000000000000000000000000000000000000000000000000000000000",
      addressToBytes32(toToken.chainType, recipient),
      // amountLD
      amountWei,
      // minAmountLD
      "0",
      // extraOptions
      unMultiHopExtraOptions,
      // composeMsg
      "0x",
      // oftCmd
      "0x",
    ];

    if (isMultiHopComposer) {
      // multiHopComposer: Arbitrum legacy mesh MultiHopComposer, eid = 30110
      sendParam[0] = multiHopComposer.eid; // dstEid
      sendParam[1] = addressToBytes32("evm", multiHopComposer.oftMultiHopComposer); // to
    }

    // 0.03% fee for Legacy Mesh transfers only (native USDT0 transfers are free)
    if (isOriginLegacy || isDestinationLegacy) {
      result.fees.legacyMeshFeeUsd = numberRemoveEndZero(Big(amountWei || 0).div(10 ** fromToken.decimals).times(USDT0_LEGACY_MESH_TRANSFTER_FEE).toFixed(fromToken.decimals));
      result.outputAmount = numberRemoveEndZero(Big(Big(amountWei || 0).div(10 ** params.fromToken.decimals)).minus(result.fees.legacyMeshFeeUsd || 0).toFixed(params.fromToken.decimals, 0));
    }

    if (!dry) {
      execTime.breakpoint();
      const oftData = await oftContract.quoteOFT(sendParam).call();
      execTime.log("quoteOFT");
      const [, , oftReceipt] = oftData;
      // The slippage is calculated based on the user-defined value and the user-input amount
      sendParam[3] = Big(amountWei).times(Big(1).minus(Big(slippageTolerance || 0).div(100))).toFixed(0);
      // The actual received amount is based on the contract return value
      result.outputAmount = numberRemoveEndZero(Big(oftReceipt[1].toString()).div(10 ** params.toToken.decimals).toFixed(params.toToken.decimals, 0));
    }

    // Check if the output amount exceeds the slippage tolerance
    // If it exceeds, return an error message
    csl("TronWallet quoteOFT", "red-600", "result.outputAmount: %o", result.outputAmount);
    csl("TronWallet quoteOFT", "red-600", "slippageTolerance: %o", slippageTolerance + "%");
    csl("TronWallet quoteOFT", "red-600", "Minimum received amount: %o", Big(amountWei).div(10 ** fromToken.decimals).times(Big(1).minus(Big(slippageTolerance || 0).div(100))).toFixed(6, 0));
    if (Big(result.outputAmount).lt(Big(amountWei).div(10 ** fromToken.decimals).times(Big(1).minus(Big(slippageTolerance || 0).div(100))))) {
      result.errMsg = "Slippage limit exceeded";
      result.errLevel = QuoteErrorLevel.Business;
      return result;
    }

    if (isMultiHopComposer) {
      const destinationLzReceiveGas = hopQuote?.destinationLzReceiveOptionGas ?? lzReceiveOptionGas;
      const destinationLzReceiveValue = hopQuote?.destinationLzReceiveOptionValue ?? lzReceiveOptionValue;
      const shouldAddDestinationLzReceive = hopQuote?.destinationLzReceiveRequired || destinationLzReceiveValue > 0;
      let multiHopExtraOptions = Options.newOptions().toHex();
      if (shouldAddDestinationLzReceive) {
        multiHopExtraOptions = Options.newOptions()
          .addExecutorLzReceiveOption(destinationLzReceiveGas, destinationLzReceiveValue || 0)
          .toHex();
      }

      const composeMsgSendParam = {
        dstEid,
        to: addressToBytes32(toToken.chainType, recipient),
        amountLD: sendParam[2],
        minAmountLD: sendParam[3],
        extraOptions: multiHopExtraOptions,
        composeMsg: "0x",
        oftCmd: "0x",
      };
      execTime.breakpoint();
      const hopMsgFee = await getHopMsgFee({
        sendParam: composeMsgSendParam,
        toToken,
        hopQuote,
      });
      execTime.log("getHopMsgFee");

      const composeOptionValue = hopQuote?.composeOptionValue ?? hopMsgFee;
      let firstHopOptions = Options.newOptions();
      if (hopQuote?.hubLzReceiveOptionGas) {
        firstHopOptions = firstHopOptions.addExecutorLzReceiveOption(
          hopQuote.hubLzReceiveOptionGas,
          hopQuote.hubLzReceiveOptionValue || 0,
        );
      }
      sendParam[4] = firstHopOptions
        .addExecutorComposeOption(
          0,
          hopQuote?.composeOptionGas ?? (originLayerzero.composeOptionGas || 800000),
          composeOptionValue,
        )
        .toHex();
      const abiCoder = ethers.AbiCoder.defaultAbiCoder();
      sendParam[5] = abiCoder.encode(
        ["tuple(uint32 dstEid, bytes32 to, uint256 amountLD, uint256 minAmountLD, bytes extraOptions, bytes composeMsg, bytes oftCmd)"],
        [Object.values(composeMsgSendParam)]
      );
    }

    execTime.breakpoint();
    const mergedCalls = [
      oftContract.quoteSend(sendParam, payInLzToken).call(),
    ];
    if (approvalRequired) {
      mergedCalls.push(
        this.allowance({
          dry,
          contractAddress: fromToken.contractAddress,
          spender: originLayerzeroAddress,
          address: userAddress,
          amountWei,
        })
      );
    }
    const [msgFee, allowanceResult] = await Promise.all(mergedCalls);
    if (approvalRequired) {
      result.needApprove = allowanceResult.needApprove;
    }
    execTime.log("quoteSend & allowance", "allowanceResult: %o", allowanceResult);

    let nativeMsgFee: BigInt = msgFee[0]["nativeFee"];
    csl("Tron quoteOFT", "red-600", "nativeFee: %o", nativeMsgFee);
    if (nativeMsgFee) {
      nativeMsgFee = BigInt(Big(nativeMsgFee.toString()).times(Number(NATIVE_MSG_FEE_BUFFER) / 100).toFixed(0));
    }
    csl("Tron quoteOFT", "red-600", "nativeFee after buffer: %o", nativeMsgFee);
    result.totalEstimateSourceGas = nativeMsgFee;

    csl("TronWallet quoteOFT", "teal-400", "MsgFee: %o", msgFee);

    result.sendParam = {
      param: [
        // sendParam
        sendParam,
        // feeParam
        [
          // nativeFee
          nativeMsgFee.toString(),
          // lzTokenFee
          msgFee[0]["lzTokenFee"].toString(),
        ],
        // refundAddress
        refundTo,
      ],
      options: { callValue: nativeMsgFee.toString() },
    };

    // csl("TronWallet quoteOFT", "teal-400", "Params: %o", result.sendParam);

    // 3. estimate gas
    const nativeFeeUsd = Big(nativeMsgFee?.toString() || 0).div(10 ** fromToken.nativeToken.decimals).times(getPrice(prices, fromToken.nativeToken.symbol));
    result.fees.nativeFee = numberRemoveEndZero(Big(nativeMsgFee?.toString() || 0).div(10 ** fromToken.nativeToken.decimals).toFixed(fromToken.nativeToken.decimals));
    result.fees.nativeFeeUsd = numberRemoveEndZero(Big(nativeFeeUsd).toFixed(20));
    result.fees.lzTokenFeeUsd = numberRemoveEndZero(Big(msgFee[0]["lzTokenFee"]?.toString() || 0).div(10 ** fromToken.decimals).toFixed(20));

    const transactionParams = [
      originLayerzeroAddress,
      "send((uint32,bytes32,uint256,uint256,bytes,bytes,bytes),(uint256,uint256),address)",
      result.sendParam.options,
      [
        {
          type: "tuple(uint32,bytes32,uint256,uint256,bytes,bytes,bytes)",
          value: result.sendParam.param[0]
        },
        {
          type: "tuple(uint256,uint256)",
          value: result.sendParam.param[1]
        },
        {
          type: "address",
          value: result.sendParam.param[2]
        }
      ],
      this.tronWeb.defaultAddress.base58 || refundTo
    ];

    if (!dry) {
      execTime.breakpoint();
      const tx = await this.tronWeb.transactionBuilder.triggerSmartContract(...transactionParams);
      execTime.log("transactionBuilder.triggerSmartContract");
      result.sendParam.tx = tx;
    }

    execTime.breakpoint();
    const ett = await this.estimateTransaction({
      dry,
      transactionParams,
      fromToken,
      prices,
      defaultEnergyUsed: 300000,
      defaultRawDataHexLength: 1000,
    });
    execTime.log("estimateTransaction");
    result.fees.estimateGasUsd = ett.estimateSourceGasUsd;
    result.estimateSourceGas = ett.estimateSourceGas;
    result.totalEstimateSourceGas += ett.estimateSourceGas;
    result.estimateSourceGasUsd = ett.estimateSourceGasUsd;

    if (result.needApprove) {
      execTime.breakpoint();
      const estApproveGas = await this.estimateApprove({
        dry,
        amountWei,
        spender: result.approveSpender,
        fromToken,
        prices,
      });
      result.estimateApproveGas = estApproveGas.estimateSourceGas;
      execTime.log("estimateApprove");
    }

    // calculate total fees
    for (const feeKey in result.fees) {
      if (excludeFees.includes(feeKey) || !/Usd$/.test(feeKey)) {
        continue;
      }
      result.totalFeesUsd = Big(result.totalFeesUsd || 0).plus(result.fees[feeKey] || 0);
    }
    result.totalFeesUsd = numberRemoveEndZero(Big(result.totalFeesUsd).toFixed(20));

    result.sendParam.transactionParams = transactionParams;

    execTime.log("quoteOFT");

    return result;
  }

  async sendTransaction(params: any) {
    const {
      tx,
    } = params;

    const transaction = tx?.transaction;
    if (!transaction?.raw_data) {
      throw new Error("Invalid transaction");
    }

    csl("Tron sendTransaction", "red-400", "transaction: %o", transaction);

    const startTimestamp = Date.now();
    const expirationDuration = 5 * 60 * 1000;
    const expiration = startTimestamp + expirationDuration;
    let transactionWithExpiration = {
      ...transaction,
      raw_data: {
        ...transaction.raw_data,
        expiration,
      },
    };

    try {
      await this.waitForTronWeb();
      transactionWithExpiration = await this.tronWeb.transactionBuilder.newTxID(transactionWithExpiration, { txLocal: true });
    } catch (error) {
      console.warn("Failed to refresh transaction ID after extending expiration:", error);
    }

    csl("Tron sendTransaction", "red-400", "override transaction: %o", transactionWithExpiration);

    const result = await this.signAndSendTransaction(transactionWithExpiration);

    csl("Tron sendTransaction", "red-400", "Transaction sent with result: %o", result);

    if (typeof result === "object") {
      const code = result.code ? String(result.code) : "";
      const message = result.message ? String(result.message) : "";
      const combined = `${code} ${message}`.toUpperCase();
      if (combined.includes("TRANSACTION_EXPIRATION_ERROR")
        || combined.includes("TRANSACTION_EXPIRED")
        || combined.includes("EXPIRED")
      ) {
        throw new Error("Transaction expired. Try again.");
      }
    }

    csl("Tron sendTransaction", "red-400", "success: %o", result);

    if (typeof result === "string") {
      return result;
    }

    return result?.txid || result?.txID || transactionWithExpiration.txID;
  }

  /**
   * Unified quote method that routes to specific quote methods based on type
   * @param type Service type from Service
   * @param params Parameters for the quote
   */
  async quote(type: Service, params: any) {
    switch (type) {
      case Service.Usdt0:
      case Service.Pyusd:
        return await this.quoteOFT(params);
      case Service.OneClick:
        return await this.quoteOneClickProxy(params);
      default:
        throw new Error(`Unsupported quote type: ${type}`);
    }
  }

  /**
   * Sign and send a Rhea Tron tx payload ({ kind: tron_transfer, amount, depositAddress, tokenAddress }).
   * Amount is in sun / token smallest units from Rhea — do not run toSun again for TRX.
   */
  async sendRheaTx(tx: any): Promise<string> {
    const kind = String(tx?.kind || "").toLowerCase();
    if (kind !== "tron_transfer") {
      throw new Error(`Unsupported Tron Rhea tx kind: ${tx?.kind}`);
    }

    const to = tx.depositAddress || tx.to;
    if (!to) {
      throw new Error("Invalid Rhea Tron tx: missing depositAddress");
    }

    const amount = tx.amount;
    if (amount == null || amount === "") {
      throw new Error("Invalid Rhea Tron tx: missing amount");
    }

    await this.waitForTronWeb();

    const tokenAddress = tx.tokenAddress;
    const standard = String(tx.standard || "").toLowerCase();
    const isNative =
      !tokenAddress ||
      tokenAddress === "TRX" ||
      tokenAddress === "trx" ||
      standard === "trx";

    if (isNative) {
      const transaction = await this.tronWeb.transactionBuilder.sendTrx(
        to,
        Number(amount)
      );
      return this.sendTransaction({ tx: { transaction } });
    }

    return this.transferToken(tokenAddress, to, String(amount));
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

  async quoteOneClickProxy(params: any) {
    const {
      dry,
      proxyAddress,
      abi,
      fromToken,
      refundTo,
      depositAddress,
      amountWei,
    } = params;

    const result: any = { fees: {} };

    const execTime = new ExecTime({ type: "Oneclick Tron", logStyle: "indigo-400" });
    await this.waitForTronWeb();
    execTime.log("waitForTronWeb");
    const userAddress = refundTo || this.tronWeb.defaultAddress.base58;

    execTime.breakpoint();
    const allowance = await this.allowance({
      dry,
      contractAddress: fromToken.contractAddress,
      address: userAddress,
      spender: proxyAddress,
      amountWei: amountWei,
    });
    result.needApprove = allowance.needApprove;
    result.approveSpender = proxyAddress;
    execTime.log("allowance");

    const proxyParam: any = [
      // tokenAddress
      fromToken.contractAddress,
      // recipient
      depositAddress,
      // amount
      amountWei,
    ];
    result.sendParam = {
      param: proxyParam,
    };

    const transactionParams = [
      proxyAddress,
      "proxyTransfer(address,address,uint256)",
      {},
      [
        {
          type: "address",
          value: result.sendParam.param[0] // tokenAddress
        },
        {
          type: "address",
          value: result.sendParam.param[1] // recipient
        },
        {
          type: "uint256",
          value: result.sendParam.param[2] // amount
        }
      ],
      this.tronWeb.defaultAddress.base58 || refundTo
    ];

    execTime.breakpoint();
    const tx = await this.tronWeb.transactionBuilder.triggerSmartContract(...transactionParams);
    execTime.log("transactionBuilder.triggerSmartContract");
    result.sendParam.tx = tx;
    // Gas simulation runs after the quote is shown. The unsigned tx already carries fee_limit.
    result.sendParam.transactionParams = transactionParams;

    execTime.logTotal("quoteOneClickPorxy");

    return result;
  }

  async getAccountResources(params: any) {
    const { account } = params;

    const result: any = {
      energy: 0,
      bandwidth: 0,
      success: false,
      error: "TronWeb is not initialized or the wallet is not connected",
    };

    await this.waitForTronWeb();

    if (!this.tronWeb || !account) {
      return result;
    }

    try {
      let availableEnergy;
      let availableBandwidth;

      try {
        if (this.tronWeb.trx.getAccountResources) {
          const resources: any = await this.tronWeb.trx.getAccountResources(account);
          csl("TronWallet getAccountResources", "teal-400", "resources: %o", resources);
          if (resources) {
            // Get available energy (EnergyLimit - EnergyUsed)
            availableEnergy = (resources.EnergyLimit || 0) - (resources.EnergyUsed || 0);
            // Get available bandwidth (NetLimit - NetUsed)
            availableBandwidth = (resources.freeNetLimit || 0) - (resources.freeNetUsed || 0);
          }
        }
      } catch (resourcesErr) {
        console.warn("getAccountResources API is not available, try other way:", resourcesErr);
      }

      if (availableEnergy === void 0 && availableBandwidth === void 0) {
        const accountInfo: any = await this.tronWeb.trx.getAccount(account);

        if (accountInfo.account_resource) {
          const accountResource = accountInfo.account_resource;
          availableEnergy = (accountResource.EnergyLimit || 0) - (accountResource.EnergyUsed || 0);
          availableBandwidth = (accountResource.NetLimit || 0) - (accountResource.NetUsed || 0);
        } else if (accountInfo.energy !== undefined) {
          availableEnergy = accountInfo.energy || 0;
        }

        // Try to get bandwidth information
        if (accountInfo.bandwidth !== undefined) {
          if (typeof accountInfo.bandwidth === "number") {
            availableBandwidth = accountInfo.bandwidth;
          } else if (accountInfo.bandwidth) {
            availableBandwidth = accountInfo.bandwidth.available || accountInfo.bandwidth.freeNetUsage || 0;
          }
        }
      }

      result.energy = Math.max(0, availableEnergy);
      result.bandwidth = Math.max(0, availableBandwidth);
      result.success = true;
      result.error = null;
    } catch (error) {
      console.error("Failed to get account resources:", error);
    }

    return result;
  }
}
