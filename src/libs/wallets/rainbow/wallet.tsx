import erc20Abi from "@/config/abi/erc20";
import { numberRemoveEndZero } from "@/utils/format/number";
import { getPrice } from "@/utils/format/price";
import Big from "big.js";
import { ethers } from "ethers";
import { addressToBytes32 } from "@/utils/address-validation";
import { LZ_RECEIVE_VALUE, USDT0_CONFIG, USDT0_LEGACY_MESH_TRANSFTER_FEE } from "@/services/usdt0/config";
import { quoteSignature } from "../utils/cctp";
import { SendType } from "../types";
import { Service } from "@/services/constants";
import { QuoteError, QuoteErrorLevel } from "@/services/quote-error";
import { getHopMsgFee } from "@/services/usdt0/hop-composer";
import { getDestinationAssociatedTokenAddress } from "../utils/solana";
import { allUsdtChains } from "@/config/tokens";
import { buildEndpointV2LzComposePayload, NATIVE_MSG_FEE_BUFFER } from "../utils/layerzero";
import { removeOftDust } from "../utils/oft";
import { OFT_ABI } from "@/services/usdt0/contract";
import { csl } from "@/utils/log";
import { createMulticall3, type Call } from "@/utils/multicall3";
import { ExecTime } from "@/utils/exec-time";
import { evmRpcFallbackProvider } from "@/utils/evm-rpc-providers";
import { FRAXZERO_MIDDLE_TOKEN_FRXUSD, FRAXZERO_MIDDLE_TOKEN_USDC } from "@/services/fraxzero/config";

const DEFAULT_GAS_LIMIT = 100000n;
const DEFAULT_GAS_LIMIT_FAILED = 4000000n;

export default class RainbowWallet {
  provider: any;
  signer: any;

  constructor(_provider: any, _signer?: any) {
    this.provider = _provider;
    this.signer = _signer;
  }

  async transfer(data: {
    originAsset: string;
    depositAddress: string;
    amount: string;
  }) {
    const { originAsset, depositAddress, amount } = data;

    if (originAsset === "eth") {
      const tx = await this.signer.sendTransaction({
        to: depositAddress,
        value: ethers.parseEther(amount)
      });
      await tx.wait();
      return tx;
    }

    const contract = new ethers.Contract(originAsset, erc20Abi, this.signer);

    const tx = await contract.transfer(depositAddress, amount);
    const result = await tx.wait();

    return result.hash;
  }

  async getBalance(token: any, account: string, options?: { isCatchError?: boolean; }) {
    const { isCatchError = false } = options || {};

    try {
      let provider = this.provider;
      if (token.rpcUrls) {
        provider = evmRpcFallbackProvider(token);
      }

      if (token.symbol === "eth" || token.symbol === "ETH" || token.symbol === "native") {
        const balance = await provider.getBalance(account);
        return balance.toString();
      }

      // Use provider instead of _signer for read-only operations
      const contract = new ethers.Contract(token.contractAddress, erc20Abi, provider);

      const balance = await contract.balanceOf(account);
      csl("EVM getBalance", "green-500", "Success getting %s token balance: %o", token.contractAddress, balance);

      return balance.toString();
    } catch (err) {
      csl("EVM getBalance", "red-500", "Get balance failed: %o", err);
      if (isCatchError) {
        throw err;
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
   * @returns Gas limit estimate, gas price, and estimated gas cost
   */
  async estimateTransferGas(data: {
    fromToken: any;
    depositAddress: string;
    amount: string;
    account: string;
  }): Promise<{
    gasLimit: bigint;
    gasPrice: bigint;
    estimateGas: bigint;
  }> {
    const { fromToken, depositAddress, amount, account } = data;
    const originAsset = fromToken.contractAddress;
    const provider = evmRpcFallbackProvider(fromToken);

    let gasLimit: bigint;

    if (originAsset === "eth") {
      // Estimate gas for ETH transfer
      const tx = {
        from: account,
        to: depositAddress,
        value: ethers.parseEther(amount)
      };
      gasLimit = await provider.estimateGas(tx);
    } else {
      // Estimate gas for ERC20 token transfer
      const contract = new ethers.Contract(originAsset, erc20Abi, provider);
      gasLimit = await contract.transfer.estimateGas(depositAddress, amount);
    }

    // Increase gas limit by 20% to provide buffer
    gasLimit = (gasLimit * 120n) / 100n;

    // Get gas price
    const feeData = await provider.getFeeData();
    const gasPrice = feeData.gasPrice || 0n;

    // Calculate estimated gas cost: gasLimit * gasPrice
    const estimateGas = gasLimit * gasPrice;

    return {
      gasLimit,
      gasPrice,
      estimateGas
    };
  }

  getContract(params: any) {
    const {
      contractAddress,
      abi,
    } = params;

    return new ethers.Contract(contractAddress, abi, this.signer);
  }

  async allowance(params: any) {
    const {
      dry,
      contractAddress,
      spender,
      address,
      amountWei,
      provider,
      blockTag,
      strict = false,
    } = params;

    const runner = provider || this.provider;
    const contract = new ethers.Contract(contractAddress, erc20Abi, runner);

    // If querying for a quote
    // Directly return the default value
    if (dry) {
      return {
        contract,
        allowance: "0",
        needApprove: false,
      };
    }

    // get allowance
    let allowance = "0";
    try {
      allowance = blockTag
        ? await contract.allowance(address, spender, { blockTag })
        : await contract.allowance(address, spender);
      allowance = allowance.toString();
    } catch (error) {
      csl("EVM allowance", "red-500", "Error getting allowance: %o", error);
      if (strict) {
        throw error;
      }
    }

    return {
      contract,
      allowance,
      needApprove: Big(amountWei || 0).gt(allowance || 0),
    };
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

    const contract = new ethers.Contract(contractAddress, erc20Abi, this.signer);

    let _amountWei = amountWei;
    if (isApproveMax) {
      _amountWei = ethers.MaxUint256;
    }

    const detailResult: any = {
      success: false,
      data: {},
      message: null,
    };

    try {
      const tx = await contract.approve(spender, _amountWei);
      const txReceipt = await tx.wait();
      if (txReceipt.status === 1) {
        if (isDetails) {
          const confirmations = typeof txReceipt.confirmations === "function"
            ? await txReceipt.confirmations()
            : txReceipt.confirmations;
          detailResult.success = true;
          detailResult.data = {
            txHash: txReceipt.hash,
            blockNumber: txReceipt.blockNumber,
            confirmations,
          };
          return detailResult;
        }
        return true;
      }
      if (isDetails) {
        detailResult.message = "Arrove failed";
        return detailResult;
      }
      return false;
    } catch (error: any) {
      console.error("Error approve: %o", error)
      if (isDetails) {
        detailResult.message = error.message;
      }
    }

    if (isDetails) {
      return detailResult;
    }

    return false;
  }

  async getEstimateGas(params: any) {
    const { gasLimit, price, nativeToken, provider, gasPrice } = params;

    let finalGasPrice = gasPrice;
    if (!finalGasPrice) {
      const feeData = await provider.getFeeData();
      finalGasPrice = feeData.maxFeePerGas || feeData.gasPrice || BigInt("20000000000"); // Default 20 gwei
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
      contract,
      method,
      param,
      fromToken,
      prices,
      evmGasFees,
      defaultGasLimit = DEFAULT_GAS_LIMIT,
      refundTo,
      txRequest,
    } = params;

    const provider = evmRpcFallbackProvider(fromToken);
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
        provider,
        gasPrice: dry ? evmGasFees[fromToken.chainId].gasPrice : void 0,
      });
      result.estimateSourceGas = wei;
      result.estimateSourceGasUsd = usd;
    };

    let finalGasLimit = defaultGasLimit;

    if (dry) {
      await setDefaultGasLimit();
      return result;
    }

    if (txRequest) {
      try {
        const gasLimit = await provider.estimateGas({
          to: txRequest.target,
          data: txRequest.calldata,
          value: txRequest.value ? BigInt(txRequest.value) : void 0,
          from: refundTo || this.signer?.address,
        });
        finalGasLimit = gasLimit * 120n / 100n;
        const { usd, wei } = await this.getEstimateGas({
          gasLimit: finalGasLimit,
          price: nativeTokenPrice,
          nativeToken: fromToken.nativeToken,
          provider,
        });
        result.estimateSourceGasLimit = finalGasLimit;
        result.estimateSourceGas = wei;
        result.estimateSourceGasUsd = usd;
      } catch (error) {
        csl("EVM estimateTransaction", "red-500", "%s estimateGas failed: %o", method, error);
        await setDefaultGasLimit();
        result.estimateSourceGasLimit = DEFAULT_GAS_LIMIT_FAILED / 2n;
      }

      return result;
    }

    try {
      // Estimate via the signed RPC provider instead of the signer's provider.
      // Mobile WalletConnect routes read calls (eth_estimateGas) through its own
      // HTTP client to the proxy RPC without HMAC headers, causing a 401. The
      // fallback provider re-generates the HMAC signature on every request.
      const readContract = contract.connect(provider);
      const populated = await readContract[method].populateTransaction(...param);
      const { gasLimit: _ignoredGasLimit, ...txData } = populated;
      const gasLimit = await provider.estimateGas({
        ...txData,
        from: refundTo || this.signer?.address,
      });
      finalGasLimit = gasLimit * 120n / 100n;
      const { usd, wei } = await this.getEstimateGas({
        gasLimit: finalGasLimit,
        price: nativeTokenPrice,
        nativeToken: fromToken.nativeToken,
        provider,
      });
      result.estimateSourceGasLimit = finalGasLimit;
      result.estimateSourceGas = wei;
      result.estimateSourceGasUsd = usd;
    } catch (error) {
      csl("EVM estimateTransaction", "red-500", "%s estimateGas failed: %o", method, error);
      await setDefaultGasLimit();
      result.estimateSourceGasLimit = DEFAULT_GAS_LIMIT_FAILED / 2n;
    }

    return result;
  }

  async quoteOFT(params: any) {
    const { Options } = await import("@layerzerolabs/lz-v2-utilities");
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
      evmGasFees,
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

    const amountLdClean = removeOftDust(amountWei || 0, fromToken.decimals);

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
      totalFeesUsd: "0",
      estimateSourceGas: 0n,
      totalEstimateSourceGas: 0n,
      estimateSourceGasUsd: "0",
      estimateTime: 0, // seconds - dynamically calculated using LayerZero formula
      outputAmount: numberRemoveEndZero(Big(amountLdClean || 0).div(10 ** params.fromToken.decimals).toFixed(params.fromToken.decimals, 0)),
    };

    if (BigInt(amountLdClean) === 0n) {
      result.errMsg = "Amount below minimum cross-chain unit";
      result.errLevel = QuoteErrorLevel.Business;
      return result;
    }

    const execTime = new ExecTime({ type: `Usdt0 EVM ${fromToken.chainName}->${toToken.chainName}`, logStyle: "stone-100" });

    const provider = evmRpcFallbackProvider(fromToken);

    const oftContract = new ethers.Contract(originLayerzeroAddress, abi, this.signer);
    const oftContractRead = new ethers.Contract(originLayerzeroAddress, abi, provider);

    // csl("EVM quoteOFT", "blue-900", "params: %o", params);
    execTime.breakpoint();

    // 1. check if need approve
    const approvalRequired = isOriginLegacy ? originLayerzero.oftLegacyApprovalRequired : originLayerzero.oftApprovalRequired;
    csl("EVM quoteOFT", "blue-900", "approvalRequired: %o", approvalRequired);
    execTime.log("approvalRequired");

    const lzReceiveOptionGas = isDestinationLegacy ? destinationLayerzero.lzReceiveOptionGasLegacy : (destinationLayerzero.lzReceiveOptionGas || 200000);
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
    const sendParam: any = {
      dstEid: dstEid,
      to: addressToBytes32(toToken.chainType, recipient),
      amountLD: amountLdClean,
      minAmountLD: 0n,
      extraOptions: unMultiHopExtraOptions,
      composeMsg: "0x",
      oftCmd: "0x"
    };

    // csl("EVM quoteOFT", "blue-900", "isMultiHopComposer: %o", isMultiHopComposer);
    if (isMultiHopComposer) {
      // multiHopComposer: Arbitrum MultiHopComposer, eid = 30110
      sendParam.dstEid = multiHopComposer.eid;
      sendParam.to = addressToBytes32("evm", multiHopComposer.oftMultiHopComposer);

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
        amountLD: sendParam.amountLD,
        minAmountLD: sendParam.minAmountLD,
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
      sendParam.extraOptions = firstHopOptions
        .addExecutorComposeOption(
          0,
          hopQuote?.composeOptionGas ?? (originLayerzero.composeOptionGas || 800000),
          composeOptionValue,
        )
        .toHex();
      const abiCoder = ethers.AbiCoder.defaultAbiCoder();
      sendParam.composeMsg = abiCoder.encode(
        ["tuple(uint32 dstEid, bytes32 to, uint256 amountLD, uint256 minAmountLD, bytes extraOptions, bytes composeMsg, bytes oftCmd)"],
        [[
          composeMsgSendParam.dstEid,
          composeMsgSendParam.to,
          composeMsgSendParam.amountLD,
          composeMsgSendParam.minAmountLD,
          composeMsgSendParam.extraOptions,
          composeMsgSendParam.composeMsg,
          composeMsgSendParam.oftCmd,
        ]]
      );
    }

    // 0.03% fee for Legacy Mesh transfers only (native USDT0 transfers are free)
    if (isOriginLegacy || isDestinationLegacy) {
      result.fees.legacyMeshFeeUsd = numberRemoveEndZero(Big(amountLdClean || 0).div(10 ** params.fromToken.decimals).times(USDT0_LEGACY_MESH_TRANSFTER_FEE).toFixed(params.fromToken.decimals));
      result.outputAmount = numberRemoveEndZero(Big(Big(amountLdClean || 0).div(10 ** params.fromToken.decimals)).minus(result.fees.legacyMeshFeeUsd || 0).toFixed(params.fromToken.decimals, 0));
    }

    // csl("EVM quoteOFT", "blue-900", "sendParam: %o", sendParam);
    if (!dry) {
      execTime.breakpoint();
      const oftData = await oftContractRead.quoteOFT.staticCall(sendParam);
      const [, , oftReceipt] = oftData;
      // Align send amount with dust-removed amountSentLD from the OFT
      sendParam.amountLD = oftReceipt[0].toString();
      // The slippage is calculated based on the user-defined value and the cleaned send amount
      sendParam.minAmountLD = Big(sendParam.amountLD).times(Big(1).minus(Big(slippageTolerance || 0).div(100))).toFixed(0);
      // The actual received amount is based on the contract return value
      result.outputAmount = numberRemoveEndZero(Big(oftReceipt[1].toString()).div(10 ** params.toToken.decimals).toFixed(params.toToken.decimals, 0));
      // csl("EVM quoteOFT", "blue-900", "oftData: %o", oftData);
      execTime.log("quoteOFT.staticCall");
    }

    // Check if the output amount exceeds the slippage tolerance
    // If it exceeds, return an error message
    csl("EVMWallet quoteOFT", "red-600", "result.outputAmount: %o", result.outputAmount);
    csl("EVMWallet quoteOFT", "red-600", "slippageTolerance: %o", slippageTolerance + "%");
    csl("EVMWallet quoteOFT", "red-600", "Minimum received amount: %o", Big(amountLdClean).div(10 ** fromToken.decimals).times(Big(1).minus(Big(slippageTolerance || 0).div(100))).toFixed(6, 0));
    if (Big(result.outputAmount).lt(Big(amountLdClean).div(10 ** fromToken.decimals).times(Big(1).minus(Big(slippageTolerance || 0).div(100))))) {
      result.errMsg = "Slippage limit exceeded";
      result.errLevel = QuoteErrorLevel.Business;
      return result;
    }

    execTime.breakpoint();
    const mergedCall = [
      oftContractRead.quoteSend.staticCall(sendParam, payInLzToken),
    ];
    if (approvalRequired) {
      mergedCall.push(
        this.allowance({
          dry,
          contractAddress: fromToken.contractAddress,
          spender: originLayerzeroAddress,
          address: refundTo,
          amountWei: amountLdClean,
          provider,
        })
      );
    }
    const [msgFee, allowanceResult] = await Promise.all(mergedCall);
    // csl("EVM quoteOFT", "blue-900", "quoteSend: %o", msgFee);
    if (approvalRequired) {
      result.needApprove = allowanceResult?.needApprove;
    }
    execTime.log("quoteSend.staticCall and allowance");

    // const msgFee = await oftContractRead.quoteSend.staticCall(sendParam, payInLzToken);
    let nativeMsgFee = msgFee[0];
    const lzMsgFee = msgFee[1];
    result.totalEstimateSourceGas = nativeMsgFee;
    // csl("EVM quoteOFT", "blue-900", "msgFee: %o, nativeMsgFee: %o", msgFee, nativeMsgFee);
    // add 5% buffer
    nativeMsgFee = nativeMsgFee * NATIVE_MSG_FEE_BUFFER / 100n;
    // csl("EVM quoteOFT", "blue-900", "msgFee after buffer: %o", nativeMsgFee);

    // csl("EVM quoteOFT", "blue-900", "Params: %o", result.sendParam);

    // 3. estimate gas
    const nativeFeeUsd = Big(nativeMsgFee?.toString() || 0).div(10 ** fromToken.nativeToken.decimals).times(getPrice(prices, fromToken.nativeToken.symbol));
    result.fees.nativeFee = numberRemoveEndZero(Big(nativeMsgFee?.toString() || 0).div(10 ** fromToken.nativeToken.decimals).toFixed(fromToken.nativeToken.decimals));
    result.fees.nativeFeeUsd = numberRemoveEndZero(Big(nativeFeeUsd).toFixed(20));
    result.fees.lzTokenFeeUsd = numberRemoveEndZero(Big(lzMsgFee?.toString() || 0).div(10 ** fromToken.decimals).toFixed(20));

    const finalSendParam = [
      sendParam,
      {
        nativeFee: nativeMsgFee,
        lzTokenFee: lzMsgFee,
      },
      refundTo,
      { value: nativeMsgFee }
    ];

    execTime.breakpoint();
    const ett = await this.estimateTransaction({
      dry,
      contract: oftContract,
      method: "send",
      param: finalSendParam,
      fromToken,
      prices,
      evmGasFees,
    });
    result.fees.estimateGasUsd = ett.estimateSourceGasUsd;
    result.estimateSourceGas = ett.estimateSourceGas;
    result.totalEstimateSourceGas += ett.estimateSourceGas;
    result.estimateSourceGasUsd = ett.estimateSourceGasUsd;
    finalSendParam[3].gasLimit = ett.estimateSourceGasLimit;
    execTime.log("send.estimateGas");

    result.sendParam = {
      contract: oftContract,
      method: "send",
      param: finalSendParam,
    };

    // calculate total fees
    for (const feeKey in result.fees) {
      if (excludeFees.includes(feeKey) || !/Usd$/.test(feeKey)) {
        continue;
      }
      result.totalFeesUsd = Big(result.totalFeesUsd || 0).plus(result.fees[feeKey] || 0);
    }
    result.totalFeesUsd = numberRemoveEndZero(Big(result.totalFeesUsd).toFixed(20));

    execTime.logTotal("quoteOFT");

    return result;
  }

  async sendTransaction(params: any) {
    const {
      method,
      contract,
      param,
    } = params;

    // Add gas fee buffer to prevent "max fee per gas less than block base fee" error.
    // Between quote and send, the baseFee may increase, causing the estimated
    // maxFeePerGas to be lower than the current baseFee.
    const overridesIndex = param.length - 1;
    const overrides = param[overridesIndex] && typeof param[overridesIndex] === "object" && !Array.isArray(param[overridesIndex])
      ? { ...param[overridesIndex] }
      : {};

    if (!overrides.maxFeePerGas) {
      try {
        const feeData = await this.provider.getFeeData();
        if (feeData.maxFeePerGas) {
          // Add 20% buffer to maxFeePerGas to account for baseFee fluctuations
          overrides.maxFeePerGas = (feeData.maxFeePerGas * 120n) / 100n;
        }
        if (feeData.maxPriorityFeePerGas && !overrides.maxPriorityFeePerGas) {
          overrides.maxPriorityFeePerGas = feeData.maxPriorityFeePerGas;
        }
      } catch (error) {
        csl("EVM sendTransaction", "red-500", "Failed to get fee data for gas buffer: %o", error);
      }
    }

    const finalParam = [...param];
    if (param[overridesIndex] && typeof param[overridesIndex] === "object" && !Array.isArray(param[overridesIndex])) {
      finalParam[overridesIndex] = overrides;
    } else {
      finalParam.push(overrides);
    }

    try {
      const tx = await contract[method](...finalParam);

      return tx.hash;
    } catch (error: any) {
      csl("EVM sendTransaction", "red-500", "Error sending transaction: %o, message: %o", error, error.message);
      let _finalErrorMessage = `Transaction failed: ${error.message}`;
      if (error?.message?.includes("user rejected action")) {
        _finalErrorMessage = error.message;
      }
      throw new Error(_finalErrorMessage);
    }

    // const DefaultErrorMsg = "Transaction failed";
    // try {
    //   const txReceipt = await tx.wait();

    //   if (txReceipt.status !== 1) {
    //     throw new Error(DefaultErrorMsg);
    //   }

    //   return txReceipt.hash;
    // } catch (error: any) {
    //   return tx.hash;
    // }
  }

  /**
   * Unified quote method that routes to specific quote methods based on type
   * @param type Service type from Service
   * @param params Parameters for the quote
   */
  async quote(type: Service, params: any) {
    switch (type) {
      case Service.CCTP:
        return await this.quoteCCTP(params);
      case Service.Usdt0:
      case Service.Pyusd:
        return await this.quoteOFT(params);
      case Service.OneClick:
        return await this.quoteOneClickProxy(params);
      case Service.Native:
        return await this.quoteNative(params);
      case Service.FraxZero:
        return await this.quoteFraxZero(params);
      default:
        throw new Error(`Unsupported quote type: ${type}`);
    }
  }

  /**
   * Sign and send a Rhea EVM tx payload ({ to, data, value, gasLimit }).
   * Stablecoin contract calls stay on sendTransaction.
   */
  async sendRheaTx(tx: any) {
    if (!tx?.to) {
      throw new Error("Invalid Rhea tx: missing to");
    }
    const request: Record<string, any> = {
      to: tx.to,
      data: tx.data || "0x",
      value: tx.value != null && tx.value !== "" ? BigInt(tx.value) : 0n,
    };
    if (tx.gasLimit != null && tx.gasLimit !== "") {
      request.gasLimit = BigInt(tx.gasLimit);
    }
    if (tx.maxFeePerGas != null && tx.maxFeePerGas !== "") {
      request.maxFeePerGas = BigInt(tx.maxFeePerGas);
    }
    if (tx.maxPriorityFeePerGas != null && tx.maxPriorityFeePerGas !== "") {
      request.maxPriorityFeePerGas = BigInt(tx.maxPriorityFeePerGas);
    }

    try {
      const hash = await this.signer.sendUncheckedTransaction(request);
      return hash;
    } catch (error: any) {
      csl("EVM sendRheaTx", "red-500", "Error sending Rhea tx: %o", error);
      let finalErrorMessage = `Transaction failed: ${error.message}`;
      if (error?.message?.includes("user rejected action")) {
        finalErrorMessage = error.message;
      }
      throw new Error(finalErrorMessage);
    }
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

  async quoteCCTP(params: any) {
    const {
      dry,
      proxyAddress,
      abi,
      refundTo,
      recipient,
      amountWei,
      slippageTolerance,
      fromToken,
      toToken,
      prices,
      evmGasFees,
      excludeFees,
      destinationDomain,
      sourceDomain,
    } = params;

    const result: any = {
      needApprove: false,
      approveSpender: proxyAddress,
      sendParam: void 0,
      quoteParam: {
        sourceDomain,
        destinationDomain,
        proxyAddress,
        ...params,
      },
      fees: {},
      totalFeesUsd: void 0,
      estimateSourceGas: void 0,
      totalEstimateSourceGas: 0n,
      estimateSourceGasUsd: void 0,
      estimateTime: Math.floor(Math.random() * 8) + 3,
      outputAmount: numberRemoveEndZero(Big(amountWei || 0).div(10 ** fromToken.decimals).toFixed(fromToken.decimals, 0)),
    };

    const provider = evmRpcFallbackProvider(fromToken);

    const execTime = new ExecTime({ type: `CCTP EVM ${fromToken.chainName}->${toToken.chainName}`, logStyle: "stone-200" });

    const proxyContract = new ethers.Contract(proxyAddress, abi, this.signer);
    const proxyContractRead = new ethers.Contract(proxyAddress, abi, provider);

    let realRecipient = recipient;
    execTime.breakpoint();
    // 1. get user nonce
    const getUsrNonce = async () => {
      let userNonce = 0n;
      try {
        userNonce = await proxyContract.userNonces(refundTo);
      } catch (error) {
      }
      return userNonce;
    };
    const mergedCalls = [
      getDestinationAssociatedTokenAddress({
        recipient,
        toToken,
      }),
      getUsrNonce(),
      this.allowance({
        dry,
        contractAddress: fromToken.contractAddress,
        address: refundTo,
        spender: proxyAddress,
        amountWei,
        provider,
      })
    ];
    const [destATA, userNonce, allowance]: any = await Promise.all(mergedCalls);
    execTime.log("getDestinationATA & getUsrNonce & get allowance", "destATA: %o, userNonce: %o, allowance: %o", destATA, userNonce, allowance);
    result.needCreateTokenAccount = destATA.needCreateTokenAccount;
    if (destATA.associatedTokenAddress) {
      realRecipient = destATA.associatedTokenAddress;
    }
    result.needApprove = allowance.needApprove;

    execTime.breakpoint();
    // 2. quote signature
    const signatureRes = await quoteSignature({
      address: refundTo,
      amount: numberRemoveEndZero(Big(amountWei || 0).div(10 ** fromToken.decimals).toFixed(fromToken.decimals, 0)),
      destination_domain_id: destinationDomain,
      receipt_address: realRecipient,
      source_domain_id: sourceDomain,
      user_nonce: Number(userNonce),
    });
    const {
      bridge_fee,
      finality_threshold,
      max_fee,
      mint_fee,
      receipt_amount,
      signature,
      destination_caller,
    } = signatureRes;
    execTime.log("quoteSignature");

    result.fees.estimateMintGasUsd = numberRemoveEndZero(Big(mint_fee || 0).div(10 ** fromToken.decimals).toFixed(fromToken.decimals));
    result.fees.bridgeFeeUsd = numberRemoveEndZero(Big(bridge_fee || 0).div(10 ** fromToken.decimals).toFixed(fromToken.decimals));
    const chargedAmount = BigInt(amountWei) - BigInt(mint_fee);
    result.outputAmount = numberRemoveEndZero(Big(receipt_amount || 0).div(10 ** fromToken.decimals).toFixed(fromToken.decimals, 0));

    const cctpFeeRate = Big(max_fee || 0).div(amountWei || 1);
    const slippageLimit = Big(slippageTolerance || 0).div(100);
    csl("EVMWallet quoteCCTP", "red-600", "cctpFeeRate: %o, slippageLimit: %o", cctpFeeRate.toFixed(6), slippageLimit.toFixed(6));
    if (max_fee && amountWei && cctpFeeRate.gt(slippageLimit)) {
      result.errMsg = "Slippage limit exceeded";
      result.errLevel = QuoteErrorLevel.Business;
      return result;
    }

    const depositParam = [
      // originalAmount
      amountWei,
      // chargedAmount = originalAmount - gas fee
      chargedAmount,
      // destinationDomain
      destinationDomain,
      // mintRecipient
      addressToBytes32(toToken.chainType, realRecipient),
      // burnToken
      fromToken.contractAddress,
      // destinationCaller
      destination_caller ? addressToBytes32(toToken.chainType, destination_caller) : "0x0000000000000000000000000000000000000000000000000000000000000000",
      // maxFee
      max_fee,
      // minFinalityThreshold
      finality_threshold,
      // signature
      signature,
    ];

    execTime.breakpoint();
    // 3. estimate deposit gas
    const ett = await this.estimateTransaction({
      dry,
      contract: proxyContract,
      method: "depositWithFee",
      param: depositParam,
      fromToken,
      prices,
      evmGasFees,
    });
    result.fees.estimateGasUsd = ett.estimateSourceGasUsd;
    result.estimateSourceGas = ett.estimateSourceGas;
    result.totalEstimateSourceGas = ett.estimateSourceGas;
    result.estimateSourceGasUsd = ett.estimateSourceGasUsd;
    depositParam.push({ gasLimit: ett.estimateSourceGasLimit });
    execTime.log("estimateTransaction");

    result.sendParam = {
      method: "depositWithFee",
      contract: proxyContract,
      param: depositParam,
    };

    // 5. calculate total fees
    for (const feeKey in result.fees) {
      if (excludeFees.includes(feeKey) || !/Usd$/.test(feeKey)) {
        continue;
      }
      result.totalFeesUsd = Big(result.totalFeesUsd || 0).plus(result.fees[feeKey] || 0);
    }
    result.totalFeesUsd = numberRemoveEndZero(Big(result.totalFeesUsd).toFixed(20));

    execTime.logTotal("quoteCCTP");

    return result;
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

    const execTime = new ExecTime({ type: `OneClick EVM ${fromToken.chainName}`, logStyle: "stone-300" });

    const result: any = { fees: {} };

    const provider = evmRpcFallbackProvider(fromToken);

    const proxyContract = new ethers.Contract(proxyAddress, abi, this.signer);
    const proxyParam: any = [
      // tokenAddress
      fromToken.contractAddress,
      // recipient
      depositAddress,
      // amount
      amountWei,
    ];

    execTime.breakpoint();
    const allowance = await this.allowance({
      dry,
      contractAddress: fromToken.contractAddress,
      address: refundTo,
      spender: proxyAddress,
      amountWei: amountWei,
      provider,
    });
    result.needApprove = allowance.needApprove;
    result.approveSpender = proxyAddress;
    // Placeholder so the async gas estimate can overwrite gasLimit before send.
    proxyParam.push({ gasLimit: DEFAULT_GAS_LIMIT_FAILED / 2n });
    execTime.log("allowance");

    result.sendParam = {
      method: "proxyTransfer",
      contract: proxyContract,
      param: proxyParam,
    };

    execTime.logTotal("quoteOneClickPorxy");

    return result;
  }

  async quoteNative(params: any) {
    const {
      quoteResponse,
      bridgeRouterAddress,
      ...restParams
    } = params;
    const {
      dry,
      amountWei,
      refundTo,
      fromToken,
      toToken,
      prices,
      evmGasFees,
    } = restParams;

    const result: any = {
      ...quoteResponse,
      fees: {},
      needApprove: false,
      approveSpender: bridgeRouterAddress,
      quoteParam: {
        ...restParams,
      },
      sendParam: {
        txRequest: quoteResponse.txRequest,
      },
      totalFeesUsd: void 0,
      estimateSourceGas: void 0,
      totalEstimateSourceGas: 0n,
      estimateSourceGasUsd: void 0,
      estimateTime: quoteResponse.priority === "fast" ? Math.floor(Math.random() * 10) + 50 : Math.floor(Math.random() * 60) + 300,
      outputAmount: 0,
    };

    const execTime = new ExecTime({ type: `Native EVM ${fromToken.chainName}->${toToken.chainName}`, logStyle: "stone-400" });

    const estimateNativeGas = async () => {
      if (dry) {
        const ett = await this.estimateTransaction({
          dry,
          fromToken,
          prices,
          evmGasFees,
        });

        result.outputAmount = quoteResponse.buyerTokenAmount + "";
        result.fees = {
          estimateGasUsd: ett.estimateSourceGasUsd,
          widgetFeeUsd: quoteResponse.widgetFeeUsd,
          liquidityProviderFeeUsd: quoteResponse.liquidityProviderFeeUsd,
        };
        result.estimateSourceGas = ett.estimateSourceGas;
        result.totalEstimateSourceGas = ett.estimateSourceGas;
        result.estimateSourceGasUsd = ett.estimateSourceGasUsd;
        result.totalFeesUsd = numberRemoveEndZero(Big(quoteResponse.totalFeeUsd).toFixed(20));
      }
      else {
        const ett = await this.estimateTransaction({
          dry,
          fromToken,
          prices,
          evmGasFees,
          txRequest: quoteResponse.txRequest,
          refundTo,
        });

        result.outputAmount = Big(quoteResponse.amountOut || 0).div(10 ** (toToken.decimals || 6)).toFixed(toToken.decimals || 6, 0);
        result.fees = {
          estimateGasUsd: ett.estimateSourceGasUsd,
          // maybe 100 = 1%
          widgetFeeUsd: numberRemoveEndZero(Big(amountWei || 0).div(10 ** (fromToken.decimals || 6)).times(quoteResponse.widgetFee.feeRate || 0).toFixed(20, 0)),
          // not return by api
          liquidityProviderFeeUsd: "0",
        };
        result.estimateSourceGas = ett.estimateSourceGas;
        result.totalEstimateSourceGas = ett.estimateSourceGas;
        result.estimateSourceGasUsd = ett.estimateSourceGasUsd;
        result.totalFeesUsd = numberRemoveEndZero(Big(quoteResponse.amountOutBeforeFee || 0).minus(quoteResponse.amountOut).div(10 ** (fromToken.decimals || 6)).toFixed(20, 0));
        result.txRequest.gasLimit = ett.estimateSourceGasLimit;
      }
    };

    execTime.breakpoint();
    const mergedCalls = [
      this.allowance({
        dry,
        contractAddress: fromToken.contractAddress,
        spender: bridgeRouterAddress,
        address: refundTo,
        amountWei,
      }),
      estimateNativeGas()
    ];
    const [allowanceResult]: any = await Promise.all(mergedCalls);
    result.needApprove = allowanceResult.needApprove;
    execTime.log("allowance & estimateNativeGas");

    execTime.logTotal("quoteNative");

    return result;
  }

  async quoteFraxZero(params: any) {
    const {
      dry,
      abi,
      recipient,
      amountWei,
      slippageTolerance,
      fromToken,
      toToken,
      prices,
      evmGasFees,
      excludeFees,
      refundTo,
      originLayerzero,
      destinationLayerzero,
    } = params;

    const {
      eid: srcEid,
      remoteHop,
      lockbox,
    } = originLayerzero;
    const {
      eid: dstEid,
    } = destinationLayerzero;

    const isFromEthereum = fromToken.chainId === 1;
    const oftAddress = isFromEthereum ? lockbox : fromToken.contractAddress;
    const provider = evmRpcFallbackProvider(fromToken);

    let amountLdClean = removeOftDust(amountWei || 0, fromToken.decimals);
    if (!dry) {
      try {
        const oftContractRead = new ethers.Contract(oftAddress, OFT_ABI, provider);
        amountLdClean = (await oftContractRead.removeDust.staticCall(amountWei)).toString();
      } catch (error) {
        csl("EVM quoteFraxZero", "yellow-500", "removeDust failed, use local: %o", error);
        amountLdClean = removeOftDust(amountWei || 0, fromToken.decimals);
      }
    }

    const result: any = {
      needApprove: false,
      approveSpender: remoteHop,
      sendParam: void 0,
      quoteParam: {
        ...params,
      },
      fees: {},
      totalFeesUsd: 0,
      estimateSourceGas: 0n,
      totalEstimateSourceGas: 0n,
      estimateSourceGasUsd: 0,
      estimateTime: 0,
      outputAmount: numberRemoveEndZero(Big(amountLdClean || 0).div(10 ** params.fromToken.decimals).toFixed(params.fromToken.decimals, 0)),
    };

    if (BigInt(amountLdClean) === 0n) {
      result.errMsg = "Amount below minimum cross-chain unit";
      result.errLevel = QuoteErrorLevel.Business;
      return result;
    }

    const execTime = new ExecTime({ type: `FraxZero EVM ${fromToken.chainName}->${toToken.chainName}`, logStyle: "stone-500" });

    const remoteHopContract = new ethers.Contract(remoteHop, abi, this.signer);
    const remoteHopContractRead = new ethers.Contract(remoteHop, abi, provider);

    // 1. check if need approve
    // 2. get message fee
    const sendParams = [
      // _oft
      oftAddress,
      // _dstEid
      dstEid,
      // _to
      addressToBytes32(toToken.chainType, recipient),
      // _amountLD (OFT sharedDecimals dust removed)
      amountLdClean
    ];
    execTime.breakpoint();
    const mergedCalls = [
      this.allowance({
        dry,
        contractAddress: fromToken.contractAddress,
        spender: remoteHop,
        address: refundTo,
        amountWei: amountLdClean,
        provider,
      }),
      remoteHopContractRead.quote.staticCall(...sendParams)
    ];
    const [allowanceResult, msgFee]: any = await Promise.all(mergedCalls);
    execTime.log("allowance & quote.staticCall");

    result.needApprove = allowanceResult.needApprove;

    let nativeMsgFee = msgFee[0];
    csl("EVM quoteFraxZero", "blue-700", "nativeMsgFee: %o", nativeMsgFee);

    // add 5% buffer
    nativeMsgFee = nativeMsgFee * NATIVE_MSG_FEE_BUFFER / 100n;
    csl("EVM quoteFraxZero", "blue-700", "nativeMsgFee after buffer: %o", nativeMsgFee);
    result.totalEstimateSourceGas = nativeMsgFee;

    const nativeFeeUsd = Big(nativeMsgFee?.toString() || 0).div(10 ** fromToken.nativeToken.decimals).times(getPrice(prices, fromToken.nativeToken.symbol));
    result.fees.nativeFee = numberRemoveEndZero(Big(nativeMsgFee?.toString() || 0).div(10 ** fromToken.nativeToken.decimals).toFixed(fromToken.nativeToken.decimals));
    result.fees.nativeFeeUsd = numberRemoveEndZero(Big(nativeFeeUsd).toFixed(20));
    result.fees.lzTokenFeeUsd = numberRemoveEndZero(Big(msgFee[1]?.toString() || 0).div(10 ** fromToken.decimals).toFixed(20));

    csl("EVM quoteFraxZero", "blue-700", "msgFee: %o", msgFee);
    csl("EVM quoteFraxZero", "blue-700", "amountLdClean: %o", amountLdClean);

    execTime.breakpoint();
    // 3. estimate send gas
    const finalSendParam = [...sendParams, { value: nativeMsgFee }];
    const ett = await this.estimateTransaction({
      dry,
      contract: remoteHopContract,
      method: "sendOFT",
      param: finalSendParam,
      fromToken,
      prices,
      evmGasFees,
    });
    result.fees.estimateGasUsd = ett.estimateSourceGasUsd;
    result.estimateSourceGas = ett.estimateSourceGas;
    result.totalEstimateSourceGas += ett.estimateSourceGas;
    result.estimateSourceGasUsd = ett.estimateSourceGasUsd;
    finalSendParam[finalSendParam.length - 1].gasLimit = ett.estimateSourceGasLimit;
    execTime.log("sendOFT.estimateTransaction");

    // 4. generate transaction
    result.sendParam = {
      contract: remoteHopContract,
      method: "sendOFT",
      param: finalSendParam,
    };

    // 5. calculate total fees
    for (const feeKey in result.fees) {
      if (excludeFees.includes(feeKey) || !/Usd$/.test(feeKey)) {
        continue;
      }
      result.totalFeesUsd = Big(result.totalFeesUsd || 0).plus(result.fees[feeKey] || 0);
    }
    result.totalFeesUsd = numberRemoveEndZero(Big(result.totalFeesUsd).toFixed(20));

    execTime.logTotal("quoteFraxZero");

    return result;
  }

  async preivewRedeemFrxUSD(params: any) {
    const {
      dry,
      amountWei,
      fromToken,
      abi,
      usdcCustodianAddress,
      rwaCustodianAddress,
      redemptionAddress,
    } = params;

    // csl("EVM preivewRedeemFrxUSD", "blue-700", "params: %o", params);

    if (dry) {
      return {
        maxUsdc: 0n,
        maxRwa: 0n,
        amountWeiBigInt: 0n,
        // The token obtained from redeem is Ethereum USDC
        totalAssetsOut: BigInt(Big(amountWei || 0).div(10 ** fromToken.decimals).times(10 ** FRAXZERO_MIDDLE_TOKEN_USDC.decimals).toFixed(0, 0)),
        isInsufficientLiquidity: false,
      };
    }

    const execTime = new ExecTime({ type: `FraxZero EVM preivewRedeemFrxUSD ${fromToken.chainName}`, logStyle: "stone-600" });

    const provider = evmRpcFallbackProvider(fromToken);

    // Get maxSharesRedeemable (index 3) from mdwrComboView for both custodians
    const usdcCustodian = new ethers.Contract(usdcCustodianAddress, abi, provider);
    const rwaCustodian = new ethers.Contract(rwaCustodianAddress, abi, provider);
    const redemption = new ethers.Contract(redemptionAddress, abi, provider);

    execTime.breakpoint();
    const [usdcView, redemptionView] = await Promise.all([
      usdcCustodian.mdwrComboView.staticCall(),
      redemption.maxUstbRedemptionAmount.staticCall(),
    ]);
    execTime.log("usdcCustodian & redemption");

    // This value is the frxUSD wei amount
    const maxUsdc = usdcView[3]; // maxSharesRedeemable
    const superstateTokenAmount = redemptionView[0]; // superstateTokenAmount

    // This value represents the wei amount of USDC
    const [maxRwa] = await redemption.calculateUsdcOut.staticCall(superstateTokenAmount);

    const amountWeiBigInt = BigInt(amountWei || 0);

    csl("EVM preivewRedeemFrxUSD", "blue-700", "usdcCustodian maxSharesRedeemable(frxUSD wei amount): %o", maxUsdc);
    csl("EVM preivewRedeemFrxUSD", "blue-700", "rwaCustodian maxSharesRedeemable(USDC wei amount): %o", maxRwa);
    csl("EVM preivewRedeemFrxUSD", "blue-700", "amountWei: %o", amountWeiBigInt);

    let totalAssetsOut = 0n;
    let isInsufficientLiquidity = false;

    if (amountWeiBigInt <= maxUsdc) {
      // USDC path only
      execTime.breakpoint();
      const assetsOut = await usdcCustodian.previewRedeem.staticCall(amountWeiBigInt);
      execTime.log("usdcCustodian.previewRedeem (USDC only)");
      csl("EVM preivewRedeemFrxUSD", "blue-700", "USDC path only, usdcCustodian previewRedeem input: %o, value: %o", amountWeiBigInt, assetsOut);
      totalAssetsOut = assetsOut;
      csl("EVM preivewRedeemFrxUSD", "blue-700", "USDC path only, totalAssetsOut: %o", totalAssetsOut);
    } else {
      // USDC first (maxUsdc), then RWA for remainder
      if (maxUsdc > 0n) {
        execTime.breakpoint();
        const usdcAssetsOut = await usdcCustodian.previewRedeem.staticCall(maxUsdc);
        execTime.log("usdcCustodian.previewRedeem (mixed)");
        csl("EVM preivewRedeemFrxUSD", "blue-700", "USDC first (maxUsdc), usdcCustodian previewRedeem input: %o, value: %o", maxUsdc, usdcAssetsOut);
        totalAssetsOut += usdcAssetsOut;
        csl("EVM preivewRedeemFrxUSD", "blue-700", "USDC first (maxUsdc), totalAssetsOut: %o", totalAssetsOut);
      }
      const rwaAmount = amountWeiBigInt - maxUsdc;
      csl("EVM preivewRedeemFrxUSD", "blue-700", "RWA for remainder, rwaAmount: %o", rwaAmount);
      if (rwaAmount > 0n) {
        execTime.breakpoint();
        const superstateTokenInAmount = await rwaCustodian.previewRedeem.staticCall(rwaAmount);
        execTime.log("rwaCustodian.previewRedeem (mixed)");
        csl("EVM preivewRedeemFrxUSD", "blue-700", "USDC first (maxUsdc), rwaCustodian previewRedeem input: %o, superstateTokenInAmount: %o", rwaAmount, superstateTokenInAmount);
        execTime.breakpoint();
        const [rwaAssetsOut] = await redemption.calculateUsdcOut.staticCall(superstateTokenInAmount);
        execTime.log("redemption.calculateUsdcOut (mixed)");
        csl("EVM preivewRedeemFrxUSD", "blue-700", "USDC first (maxUsdc), rwaCustodian previewRedeem input: %o, value: %o", rwaAmount, rwaAssetsOut);
        totalAssetsOut += rwaAssetsOut;
        csl("EVM preivewRedeemFrxUSD", "blue-700", "RWA for remainder, totalAssetsOut: %o", totalAssetsOut);

        if (rwaAssetsOut > maxRwa) {
          isInsufficientLiquidity = true;
        }
      }
    }

    csl("EVM preivewRedeemFrxUSD", "blue-700", "final totalAssetsOut: %o", totalAssetsOut);
    csl("EVM preivewRedeemFrxUSD", "blue-700", "final insufficient liquidity: %o", isInsufficientLiquidity);

    execTime.logTotal("preivewRedeemFrxUSD");

    return {
      maxUsdc,
      maxRwa,
      amountWeiBigInt,
      totalAssetsOut,
      isInsufficientLiquidity,
    };
  }

  async previewMintFrxUSD(params: any) {
    const {
      dry,
      amountWei,
      fromToken,
      abi,
      usdcCustodianAddress,
    } = params;

    csl("EVM previewMintFrxUSD", "blue-700", "params: %o", params);

    if (dry) {
      return {
        maxUsdc: 0n,
        amountWeiBigInt: 0n,
        totalMax: 0n,
        // Minting means converting Ethereum USDC into Ethereum frxUSD
        totalAssetsOut: BigInt(Big(amountWei || 0).div(10 ** fromToken.decimals).times(10 ** FRAXZERO_MIDDLE_TOKEN_FRXUSD.decimals).toFixed(0, 0)),
      };
    }

    const execTime = new ExecTime({ type: `FraxZero EVM previewMintFrxUSD ${fromToken.chainName}`, logStyle: "stone-700" });

    const provider = evmRpcFallbackProvider(fromToken);

    // Get maxAssetsDepositable (index 0) from mdwrComboView for both custodians
    const usdcCustodian = new ethers.Contract(usdcCustodianAddress, abi, provider);

    execTime.breakpoint();
    const usdcView = await usdcCustodian.mdwrComboView.staticCall();
    execTime.log("usdcCustodian.mdwrComboView");

    const maxUsdc = usdcView[0]; // maxAssetsDepositable

    const amountWeiBigInt = BigInt(amountWei || 0);
    const totalMax = maxUsdc;

    execTime.breakpoint();
    const totalAssetsOut = await usdcCustodian.previewDeposit.staticCall(amountWeiBigInt);
    execTime.log("usdcCustodian.previewDeposit");

    execTime.logTotal("previewMintFrxUSD");

    return {
      maxUsdc,
      amountWeiBigInt,
      totalMax,
      totalAssetsOut,
    };
  }

  /**
   * Redeem frxUSD to USDC via USDC and/or RWA custodian contracts.
   * Uses mdwrComboView to get max redeemable liquidity and splits redemption across USDC/RWA paths.
   * Uses previewRedeem to get accurate output amount (USDC).
   */
  async redeemFrxUSD(params: any) {
    const {
      dry,
      recipient,
      amountWei,
      fromToken,
      toToken,
      prices,
      evmGasFees,
      refundTo,
      abi,
      usdcCustodianAddress,
      rwaCustodianAddress,
      redeemAndMintContractAddress,
      preivewRedeemResult,
    } = params;

    csl("EVM redeemFrxUSD", "blue-700", "params: %o", params);

    // Ethereum average block time ~12s, random ±5 seconds
    const ETH_AVG_BLOCK_TIME = 12;
    const estimateTime = (ETH_AVG_BLOCK_TIME * 2) + Math.floor(Math.random() * 11) - 5;

    const result: any = {
      needApprove: false,
      approveSpender: redeemAndMintContractAddress,
      sendParam: void 0,
      quoteParam: {
        ...params,
      },
      fees: {},
      totalFeesUsd: 0,
      estimateSourceGas: 0n,
      totalEstimateSourceGas: 0n,
      estimateSourceGasUsd: 0,
      estimateTime,
      outputAmount: "0",
    };

    const provider = evmRpcFallbackProvider(fromToken);

    const execTime = new ExecTime({ type: `FraxZero EVM redeemFrxUSD ${fromToken.chainName}->${toToken.chainName}`, logStyle: "stone-800" });

    const redeemContractRead = new ethers.Contract(redeemAndMintContractAddress, abi, provider);
    const redeemContract = new ethers.Contract(redeemAndMintContractAddress, abi, this.signer);

    execTime.breakpoint();
    let finalPreivewRedeemResult = preivewRedeemResult;
    if (!finalPreivewRedeemResult) {
      finalPreivewRedeemResult = await this.preivewRedeemFrxUSD(params);
    }
    const {
      isInsufficientLiquidity,
      totalAssetsOut,
    } = finalPreivewRedeemResult;
    execTime.log("preivewRedeemFrxUSD");

    if (isInsufficientLiquidity) {
      throw new QuoteError("Insufficient liquidity", QuoteErrorLevel.Business);
    }

    // outputAmount = USDC amount (6 decimals), human-readable
    result.outputAmount = numberRemoveEndZero(
      Big(totalAssetsOut.toString()).div(10 ** toToken.decimals).toFixed(toToken.decimals, 0)
    );

    execTime.breakpoint();
    // check allowance of fromToken for redeemAndMintContractAddress
    const allowanceResult = await this.allowance({
      dry,
      contractAddress: fromToken.contractAddress,
      spender: redeemAndMintContractAddress,
      address: refundTo,
      amountWei,
      provider,
    });
    result.needApprove = allowanceResult.needApprove;
    execTime.log("allowance");

    result.sendParam = {
      contract: redeemContract,
      method: "redeemToUsdcAndTransfer",
      param: [
        amountWei,
        recipient,
      ],
    };

    execTime.breakpoint();
    // Estimate gas for multicall aggregate and compute fees
    const ett = await this.estimateTransaction({
      dry,
      contract: redeemContract,
      method: result.sendParam.method,
      param: [...result.sendParam.param, { gasLimit: DEFAULT_GAS_LIMIT_FAILED }],
      fromToken,
      prices,
      evmGasFees,
    });
    result.fees.estimateGasUsd = ett.estimateSourceGasUsd;
    result.estimateSourceGas = ett.estimateSourceGas;
    result.totalEstimateSourceGas = ett.estimateSourceGas;
    result.estimateSourceGasUsd = ett.estimateSourceGasUsd;
    result.totalFeesUsd = ett.estimateSourceGasUsd;
    result.sendParam.param[2] = { gasLimit: ett.estimateSourceGasLimit };
    execTime.log("estimateTransaction");

    execTime.logTotal("redeemFrxUSD");

    return result;
  }

  /**
   * Mint frxUSD by depositing USDC into the custodian contract.
   * Calls deposit(assetsIn, receiver) on usdcCustodianAddress.
   * assetsIn = USDC amount (6 decimals), sharesOut = frxUSD amount (18 decimals).
   */
  async mintFrxUSD(params: any) {
    const {
      dry,
      recipient,
      amountWei,
      fromToken,
      toToken,
      prices,
      evmGasFees,
      refundTo,
      abi,
      usdcCustodianAddress,
      previewMintResult,
    } = params;

    csl("EVM mintFrxUSD", "blue-700", "params: %o", params);

    // Ethereum average block time ~12s, estimateTime = 12*2 + random(-5, 5) seconds
    const ETH_AVG_BLOCK_TIME = 12;
    const estimateTime = (ETH_AVG_BLOCK_TIME * 2) + Math.floor(Math.random() * 11) - 5;

    const result: any = {
      needApprove: false,
      approveSpender: usdcCustodianAddress,
      sendParam: void 0,
      quoteParam: {
        ...params,
      },
      fees: {},
      totalFeesUsd: 0,
      estimateSourceGas: 0n,
      totalEstimateSourceGas: 0n,
      estimateSourceGasUsd: 0,
      estimateTime,
      outputAmount: "0",
    };

    const execTime = new ExecTime({ type: `FraxZero EVM mintFrxUSD ${fromToken.chainName}->${toToken.chainName}`, logStyle: "stone-900" });

    const provider = evmRpcFallbackProvider(fromToken);

    execTime.breakpoint();
    // Check allowance of fromToken for usdcCustodianAddress (USDC must be approved to custodian)
    const allowanceResult = await this.allowance({
      dry,
      contractAddress: fromToken.contractAddress,
      spender: usdcCustodianAddress,
      address: refundTo,
      amountWei,
      provider,
    });
    result.needApprove = allowanceResult.needApprove;
    execTime.log("allowance");

    const usdcCustodian = new ethers.Contract(usdcCustodianAddress, abi, provider);
    const usdcCustodianWithSigner = new ethers.Contract(usdcCustodianAddress, abi, this.signer);

    execTime.breakpoint();
    let finalPreviewMintResult = previewMintResult;
    if (!finalPreviewMintResult) {
      finalPreviewMintResult = await this.previewMintFrxUSD(params);
    }
    const {
      maxUsdc,
      amountWeiBigInt,
      totalMax,
      totalAssetsOut,
    } = finalPreviewMintResult;
    execTime.log("previewMintFrxUSD");

    result.outputAmount = numberRemoveEndZero(
      Big(totalAssetsOut.toString()).div(10 ** toToken.decimals).toFixed(toToken.decimals, 0)
    );

    result.sendParam = {
      contract: usdcCustodianWithSigner,
      method: "deposit",
      param: [
        amountWeiBigInt,
        recipient,
      ],
    };

    execTime.breakpoint();
    // Estimate gas fees
    const ett = await this.estimateTransaction({
      dry,
      contract: usdcCustodianWithSigner,
      method: "deposit",
      param: [...result.sendParam.param, { gasLimit: DEFAULT_GAS_LIMIT_FAILED }],
      fromToken,
      prices,
      evmGasFees,
    });
    result.fees.estimateGasUsd = ett.estimateSourceGasUsd;
    result.estimateSourceGas = ett.estimateSourceGas;
    result.totalEstimateSourceGas = ett.estimateSourceGas;
    result.estimateSourceGasUsd = ett.estimateSourceGasUsd;
    result.totalFeesUsd = ett.estimateSourceGasUsd;
    result.sendParam.param[2] = { gasLimit: ett.estimateSourceGasLimit };
    execTime.log("estimateTransaction");

    execTime.logTotal("mintFrxUSD");

    return result;
  }

  async mintAndSendFrxUSD(params: any) {
    const {
      dry,
      recipient,
      amountWei,
      fromToken,
      toToken,
      prices,
      evmGasFees,
      refundTo,
      abi,
      usdcCustodianAddress,
      redeemAndMintContractAddress,
      originLayerzero,
      destinationLayerzero,
      previewMintResult,
    } = params;

    csl("EVM mintAndSendFrxUSD", "blue-700", "params: %o", params);

    const {
      eid: dstEid,
    } = destinationLayerzero;

    // Ethereum average block time ~12s, estimateTime = 12*2 + random(-5, 5) seconds
    const ETH_AVG_BLOCK_TIME = 12;
    const estimateTime = (ETH_AVG_BLOCK_TIME * 2) + Math.floor(Math.random() * 11) - 5;

    const result: any = {
      needApprove: false,
      approveSpender: redeemAndMintContractAddress,
      sendParam: void 0,
      quoteParam: {
        ...params,
      },
      fees: {},
      totalFeesUsd: 0,
      estimateSourceGas: 0n,
      totalEstimateSourceGas: 0n,
      estimateSourceGasUsd: 0,
      estimateTime,
      outputAmount: "0",
    };

    const execTime = new ExecTime({ type: `FraxZero EVM mintAndSendFrxUSD ${fromToken.chainName}->${toToken.chainName}`, logStyle: "stone-950" });

    const provider = evmRpcFallbackProvider(fromToken);

    execTime.breakpoint();
    // Check allowance of fromToken for usdcCustodianAddress (USDC must be approved to custodian)
    const allowanceResult = await this.allowance({
      dry,
      contractAddress: fromToken.contractAddress,
      spender: redeemAndMintContractAddress,
      address: refundTo,
      amountWei,
      provider,
    });
    result.needApprove = allowanceResult.needApprove;
    execTime.log("allowance");

    const redeemAndMintContractWithSigner = new ethers.Contract(redeemAndMintContractAddress, abi, this.signer);

    execTime.breakpoint();
    let finalPreviewMintResult = previewMintResult;
    if (!finalPreviewMintResult) {
      finalPreviewMintResult = await this.previewMintFrxUSD(params);
    }
    const {
      totalAssetsOut,
    } = finalPreviewMintResult;
    execTime.log("previewMintFrxUSD");
    csl("EVM mintAndSendFrxUSD", "gray-600", "previewMintFrxUSD totalAssetsOut: %o", totalAssetsOut);

    result.outputAmount = numberRemoveEndZero(
      Big(totalAssetsOut.toString()).div(10 ** 18).toFixed(18, 0)
    );

    // Build sendParam for deposit(assetsIn, receiver)
    const mintAndSendParam = [
      // assetsIn
      amountWei,
      // dstEid
      dstEid,
      // receiver
      addressToBytes32(toToken.chainType, recipient)
    ];

    result.sendParam = {
      contract: redeemAndMintContractWithSigner,
      method: "mintAndSend",
      param: mintAndSendParam,
    };

    execTime.breakpoint();
    // Estimate gas fees
    const ett = await this.estimateTransaction({
      dry,
      contract: redeemAndMintContractWithSigner,
      method: "mintAndSend",
      param: [...mintAndSendParam, { gasLimit: DEFAULT_GAS_LIMIT_FAILED }],
      fromToken,
      prices,
      evmGasFees,
    });
    result.fees.estimateGasUsd = ett.estimateSourceGasUsd;
    result.estimateSourceGas = ett.estimateSourceGas;
    result.totalEstimateSourceGas = ett.estimateSourceGas;
    result.estimateSourceGasUsd = ett.estimateSourceGasUsd;
    result.totalFeesUsd = ett.estimateSourceGasUsd;
    result.sendParam.param.push({ gasLimit: ett.estimateSourceGasLimit });
    execTime.log("estimateTransaction");

    execTime.logTotal("mintAndSendFrxUSD");

    return result;
  }

  /**
   * Execute multicall batch transaction (e.g. redeem frxUSD via multiple custodian contracts).
   * Uses utils/multicall3 for transaction submission.
   * @param params Must contain multicallCalls: { target, callData }[] and chainId
   * @returns Transaction hash
   */
  async sendBatchCall(params: any) {
    const { multicallCalls, chainId } = params;

    if (!multicallCalls?.length || !chainId) {
      throw new Error("sendBatchCall requires multicallCalls and chainId");
    }

    try {
      const multicall = createMulticall3(this.provider, chainId);
      return await multicall.sendAggregate(multicallCalls as Call[], this.signer);
    } catch (error: any) {
      csl("EVM sendBatchCall", "red-500", "Error executing multicall: %o", error);
      const msg = error?.message?.includes("user rejected") ? error.message : "Transaction failed";
      throw new Error(msg);
    }
  }

  async retryLayerzeroLzComponse(params: any) {
    const { Options } = await import("@layerzerolabs/lz-v2-utilities");
    const {
      layerzeroData,
      history,
    } = params;

    const LayerZeroEndpointV2 = "0x1a44076050125825900e736c501f859c50fe728c";
    const LayerZeroEndpointV2ABI = [
      {
        "inputs": [
          {
            "internalType": "address",
            "name": "_from",
            "type": "address"
          },
          {
            "internalType": "address",
            "name": "_to",
            "type": "address"
          },
          {
            "internalType": "bytes32",
            "name": "_guid",
            "type": "bytes32"
          },
          {
            "internalType": "uint16",
            "name": "_index",
            "type": "uint16"
          },
          {
            "internalType": "bytes",
            "name": "_message",
            "type": "bytes"
          },
          {
            "internalType": "bytes",
            "name": "_extraData",
            "type": "bytes"
          }
        ],
        "name": "lzCompose",
        "outputs": [],
        "stateMutability": "payable",
        "type": "function"
      }
    ];
    // lzCompose(address _from,address _to,bytes32 _guid,uint16 _index,bytes _message,bytes _extraData)
    const LayerZeroEndpointV2Contract = new ethers.Contract(LayerZeroEndpointV2, LayerZeroEndpointV2ABI, this.signer);

    const toToken: any = allUsdtChains[history.destination_chain.blockchain as keyof typeof allUsdtChains];
    const amountWei = Big(history.token_in_amount).times(10 ** (toToken.decimals || 6)).toFixed(0);

    const originLayerzero = USDT0_CONFIG["Arbitrum"];
    const isOriginLegacy = layerzeroData.destination.lzCompose.failedTx[0].from.toLowerCase() === originLayerzero.oftLegacy?.toLowerCase();
    const lzReceiveOptionGas = isOriginLegacy ? originLayerzero.lzReceiveOptionGasLegacy : originLayerzero.lzReceiveOptionGas;
    let lzReceiveOptionValue = 0;

    const destATA = await getDestinationAssociatedTokenAddress({
      recipient: history.receive_address,
      toToken,
    });
    if (destATA.needCreateTokenAccount) {
      lzReceiveOptionValue = LZ_RECEIVE_VALUE[toToken.chainName] || 0;
    }

    const composeFrom = layerzeroData.source.tx.from;
    const composeMsg = layerzeroData.source.tx.payload.split(composeFrom.replace(/^0x/, ""))[1];
    const _message = buildEndpointV2LzComposePayload({
      nonce: layerzeroData.pathway.nonce,
      srcEid: layerzeroData.pathway.srcEid,
      amountLD: amountWei,
      composeFrom: composeFrom,
      composeMsg: composeMsg,
    });

    const contractParams = [
      layerzeroData.destination.lzCompose.failedTx[0].from,
      layerzeroData.destination.lzCompose.failedTx[0].to,
      layerzeroData.guid,
      layerzeroData.destination.lzCompose.failedTx[0].index,
      _message,
      "0x",
    ];

    const dstOFT = isOriginLegacy ? originLayerzero.oft : originLayerzero.oftLegacy;
    const sendParam: any = {
      dstEid: USDT0_CONFIG[history.destination_chain.chainName].eid,
      to: addressToBytes32(toToken.chainType, history.receive_address),
      amountLD: amountWei,
      minAmountLD: 0n,
      extraOptions: Options.newOptions()
        // .addExecutorLzReceiveOption(lzReceiveOptionGas, lzReceiveOptionValue)
        .toHex(),
      composeMsg: "0x",
      oftCmd: "0x"
    };

    const dstOFTContract = new ethers.Contract(dstOFT!, OFT_ABI, this.provider);
    const msgFee = await dstOFTContract.quoteSend.staticCall(sendParam, false);
    let nativeFee = msgFee[0];
    nativeFee = nativeFee * NATIVE_MSG_FEE_BUFFER / 100n;

    const tx = await LayerZeroEndpointV2Contract.lzCompose(
      ...contractParams,
      {
        gasLimit: originLayerzero.composeOptionGas || 800000,
        value: nativeFee,
      }
    );

    const txReceipt = await tx.wait();

    if (txReceipt.status === 1) {
      return txReceipt.hash;
    }

    return null;
  }

  async signTypedData(params: any) {
    const { fromToken, amountWei, spender } = params;

    csl("EVM signTypedData", "blue-900", "params: %o", params);

    const provider = evmRpcFallbackProvider(fromToken);

    const value = amountWei;
    const tokenAddress = fromToken.contractAddress;
    const chainId = fromToken.chainId;
    // 3 days
    const deadline = Math.floor(Date.now() / 1000) + (60 * 60 * 24 * 3);
    const account = this.signer.address;

    const erc20 = new ethers.Contract(tokenAddress, erc20Abi, provider);
    const nonce = await erc20.nonces(account);
    const name = await erc20.name();

    let _version = "1";
    if (fromToken.symbol === "USDC") {
      _version = "2";
    }

    const domain = {
      name,
      version: _version,
      chainId: Number(chainId),
      verifyingContract: tokenAddress
    };

    const types = {
      Permit: [
        { name: "owner", type: "address" },
        { name: "spender", type: "address" },
        { name: "value", type: "uint256" },
        { name: "nonce", type: "uint256" },
        { name: "deadline", type: "uint256" }
      ]
    };

    const values = {
      owner: account,
      spender,
      value,
      nonce: nonce.toString(),
      deadline
    };

    const signature = await this.signer?.signTypedData(domain, types, values);

    const { v, r, s } = ethers.Signature.from(signature);

    // Check if signature is available
    try {
      const permitParams = [
        account,
        spender,
        value,
        deadline,
        v,
        r,
        s,
      ];
      const permitResponse = await erc20.permit.staticCall(...permitParams);
      csl("EVM signTypedData", "green-500", "permit response: %o", permitResponse);
    } catch (error: any) {
      csl("EVM signTypedData", "red-500", "check permit signature failed: %o", error);
      throw new Error("Permit signature verification failed");
    }

    return {
      owner: account,
      value,
      deadline,
      nonce: Number(nonce),
      v,
      r,
      s,
    };
  }

  async signEip712TypedData(params: {
    domain: Record<string, unknown>;
    types: Record<string, Array<{ name: string; type: string; }>>;
    primaryType?: string;
    message: Record<string, unknown>;
  }) {
    const { domain, types, message } = params;

    // ethers v6: EIP712Domain must not be in types (domain is passed separately),
    // otherwise it throws "ambiguous primary types or unused types".
    const { EIP712Domain: _eip712Domain, ...signTypes } = types;

    csl("EVM signEip712TypedData", "blue-900", "domain: %o", domain);

    const signature = await this.signer?.signTypedData(
      domain as any,
      signTypes as any,
      message as any,
    );

    if (!signature) {
      throw new Error("Signature failed");
    }

    return signature;
  }

  async sendEncodedTransaction(params: {
    encoded: {
      to: string;
      data: string;
      value?: string;
      gasLimit?: string;
      chainId?: number;
    };
  }) {
    const { encoded } = params;

    const txRequest: Record<string, unknown> = {
      to: encoded.to,
      data: encoded.data,
      value: encoded.value ? BigInt(encoded.value) : 0n,
    };

    if (encoded.gasLimit) {
      txRequest.gasLimit = BigInt(encoded.gasLimit);
    }

    try {
      const feeData = await this.provider.getFeeData();
      if (feeData.maxFeePerGas) {
        txRequest.maxFeePerGas = (feeData.maxFeePerGas * 120n) / 100n;
      }
      if (feeData.maxPriorityFeePerGas) {
        txRequest.maxPriorityFeePerGas = feeData.maxPriorityFeePerGas;
      }
    } catch (error) {
      csl("EVM sendEncodedTransaction", "red-500", "Failed to get fee data for gas buffer: %o", error);
    }

    try {
      const tx = await this.signer.sendTransaction(txRequest as any);
      return tx.hash;
    } catch (error: any) {
      csl("EVM sendEncodedTransaction", "red-500", "Error sending transaction: %o, message: %o", error, error.message);
      let finalErrorMessage = `Transaction failed: ${error.message}`;
      if (error?.message?.includes("user rejected action")) {
        finalErrorMessage = error.message;
      }
      throw new Error(finalErrorMessage);
    }
  }

  async waitForTransaction(hash: string) {
    const receipt = await this.provider.waitForTransaction(hash);
    if (!receipt || receipt.status !== 1) {
      throw new Error("Transaction failed");
    }
    return receipt;
  }
}
