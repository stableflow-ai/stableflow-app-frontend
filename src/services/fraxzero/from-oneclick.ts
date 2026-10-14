import oneClickService, { excludeFees as oneClickExcludeFees } from "../oneclick";
import fraxZeroService, { FraxZeroService, excludeFees as fraxZeroExcludeFees } from ".";
import { csl } from "@/utils/log";
import { ethers } from "ethers";
import RainbowWallet from "@/libs/wallets/rainbow/wallet";
import { FRAXZERO_CONFIG, FRAXZERO_GAS_USED, FRAXZERO_MIDDLE_TOKEN_FRXUSD, FRAXZERO_MIDDLE_TOKEN_USDC, FRAXZERO_REDEEM_AND_MINT_CONTRACT, FRAXZERO_REDEEM_USDC_CONTRACT } from "./config";
import { MIDDLE_CHAIN_REFUND_ADDRESS } from "../utils";
import { getPrice } from "@/utils/format/price";
import { FRAXZERO_REDEEM_MINT_ABI } from "./contract";
import Big from "big.js";
import { numberRemoveEndZero } from "@/utils/format/number";
import { SendType } from "@/libs/wallets/types";
import { ExecTime } from "@/utils/exec-time";
import { getRouteStatus, OneClickSwapType, Service } from "../constants";
import { evmRpcFallbackProvider } from "@/utils/evm-rpc-providers";
import { isStableToken } from "@/config/tokens";

export class OneClick2FraxZeroService extends FraxZeroService {
  public override async quote(params: any) {
    const {
      dry,
      wallet,
      amountWei,
      refundTo,
      recipient,
      fromToken,
      toToken,
      slippageTolerance,
      prices,
      evmGasFees,
      wallets,
      switchChainAsync,
    } = params;

    csl("OneClick2FraxZeroService quote", "yellow-600", "params: %o", params);

    const _quoteType = `OneClick2FraxZero ${fromToken?.chainName}->${toToken?.chainName}`;
    const execTime = new ExecTime({ type: _quoteType, logStyle: "fuchsia-500" });

    const isFromEthereumUSDC = fromToken.chainId === 1 && fromToken.symbol === FRAXZERO_MIDDLE_TOKEN_USDC.symbol;
    const isToEthereumFrxUSD = toToken.chainId === 1 && toToken.symbol === FRAXZERO_MIDDLE_TOKEN_FRXUSD.symbol;
    const isToSolana = toToken.chainName === "Solana";
    const isToFraxtal = toToken.chainId === 252;
    const isSend = !isToEthereumFrxUSD && !isToSolana && !isToFraxtal;

    const routeStatus = getRouteStatus(Service.OneClickFraxZero);

    const provider = evmRpcFallbackProvider(FRAXZERO_MIDDLE_TOKEN_USDC);

    let middleChainWallet = wallets?.evm?.wallet;
    let middleChainRecipientAddress = wallets?.evm?.account;
    if (!middleChainWallet) {
      middleChainWallet = new RainbowWallet(provider, {});
    }
    if (!middleChainRecipientAddress) {
      middleChainRecipientAddress = MIDDLE_CHAIN_REFUND_ADDRESS;
    }

    let previewMintResult: any;
    // 1. use OneClick to bridge to Ethereum USDC first
    if (!isFromEthereumUSDC) {
      // estimate gas
      let gasLimit = FRAXZERO_GAS_USED.MINT.SEND;
      if (isToEthereumFrxUSD) {
        gasLimit = FRAXZERO_GAS_USED.MINT.TO_ETHEREUM;
      }
      if (isToSolana) {
        gasLimit = FRAXZERO_GAS_USED.MINT.TO_SOL;
      }
      if (isToFraxtal) {
        gasLimit = FRAXZERO_GAS_USED.MINT.TO_FRAXTAL;
      }
      gasLimit = gasLimit * 120n / 100n;

      let firstStepAmountWei = Big(params.amountWei || 0).div(10 ** fromToken.decimals).times(10 ** FRAXZERO_MIDDLE_TOKEN_USDC.decimals).toFixed(0, 0);
      if (!isStableToken(fromToken)) {
        const inputPrice = getPrice(prices, fromToken.symbol);
        const inputValue = Big(params.amountWei || 0).div(10 ** fromToken.decimals).times(inputPrice);
        firstStepAmountWei = Big(inputValue).times(10 ** FRAXZERO_MIDDLE_TOKEN_USDC.decimals).toFixed(0, 0);
      }

      // Mint should be a 1:1 conversion from Ethereum USDC to Ethereum frxUSD.
      // The ratio can be obtained from the contract.
      execTime.breakpoint();
      previewMintResult = await middleChainWallet.previewMintFrxUSD({
        dry,
        amountWei: firstStepAmountWei,
        fromToken: FRAXZERO_MIDDLE_TOKEN_USDC,
        abi: FRAXZERO_REDEEM_MINT_ABI,
        usdcCustodianAddress: FRAXZERO_REDEEM_USDC_CONTRACT,
      });
      const { totalAssetsOut: estimateEthereumFrxUSDAmountWei } = previewMintResult;
      execTime.log("previewMintFrxUSD");

      execTime.breakpoint();
      const { usd, wei, amount } = await middleChainWallet.getEstimateGas({
        gasLimit,
        price: getPrice(prices, FRAXZERO_MIDDLE_TOKEN_USDC.nativeToken.symbol),
        nativeToken: FRAXZERO_MIDDLE_TOKEN_USDC.nativeToken,
        provider: provider,
        gasPrice: dry ? evmGasFees[FRAXZERO_MIDDLE_TOKEN_USDC.chainId as number].gasPrice : void 0,
      });
      execTime.log("middleChainWallet.getEstimateGas");
      const secondStepGasToAmount = Big(usd || 0).div(getPrice(prices, fromToken.symbol) || 1).toFixed(fromToken.decimals);

      csl("OneClick2FraxZeroService quote", "yellow-600", "NOT FromEthereumUSDC EstimateGas usd: %o, wei: %o, amount: %o", usd, wei, amount);

      // estimate lz message fee
      // from Ethereum frxUSD to toToken
      let secondStepResult: any;
      if (!isToEthereumFrxUSD) {
        execTime.breakpoint();
        secondStepResult = await super.quote({
          ...params,
          fromToken: FRAXZERO_MIDDLE_TOKEN_FRXUSD,
          wallet: middleChainWallet,
          amountWei: estimateEthereumFrxUSDAmountWei.toString(),
          refundTo: middleChainRecipientAddress,
        });
        execTime.log("FraxZero.quote");
      }
      csl("OneClick2FraxZeroService quote", "yellow-600", "NOT FromEthereumUSDC secondStepResult: %o", secondStepResult);

      let secondStepLzMsgFeeUsd = secondStepResult?.fees?.nativeFeeUsd || "0";
      let secondStepLzMsgFee = secondStepResult?.fees?.nativeFee || "0";
      // add 120% buffer
      const usdt0MessageFeeBuffer = 1.2;
      // super.quote has already added a buffer, but here we add a bit more to further reduce the chance of failure
      secondStepLzMsgFeeUsd = Big(secondStepLzMsgFeeUsd || 0).times(1 + usdt0MessageFeeBuffer);
      secondStepLzMsgFee = Big(secondStepLzMsgFee || 0).times(1 + usdt0MessageFeeBuffer);
      csl("OneClick2FraxZeroService quote", "yellow-600", "NOT FromEthereumUSDC secondStepLzMsgFeeUsd: %o", secondStepLzMsgFeeUsd.toString());
      csl("OneClick2FraxZeroService quote", "yellow-600", "NOT FromEthereumUSDC secondStepLzMsgFee: %o", secondStepLzMsgFee.toString());
      const secondStepLzMsgFeeAmount = Big(secondStepLzMsgFeeUsd).div(getPrice(prices, fromToken.symbol) || 1).toFixed(fromToken.decimals);

      const totalAppFeesAmount = Big(secondStepGasToAmount).plus(secondStepLzMsgFeeAmount);
      csl("OneClick2FraxZeroService quote", "yellow-600", "NOT FromEthereumUSDC totalAppFeesAmount: %o", totalAppFeesAmount.toString());
      const oneClickFeeRatio = Big(totalAppFeesAmount)
        .div(Big(totalAppFeesAmount).plus(Big(params.amountWei).div(10 ** fromToken.decimals).toFixed(fromToken.decimals)))
        .times(10000)
        .toFixed(0, Big.roundUp);
      csl("OneClick2FraxZeroService quote", "yellow-600", "NOT FromEthereumUSDC oneClickFeeRatio: %o", oneClickFeeRatio.toString());
      if (secondStepResult) {
        secondStepResult.fees.nativeFee = secondStepLzMsgFee.toString();
        secondStepResult.fees.nativeFeeUsd = secondStepLzMsgFeeUsd.toString();
      }

      execTime.breakpoint();
      const firstStepResult = await oneClickService.quote({
        ...params,
        amountWei: firstStepAmountWei,
        toToken: FRAXZERO_MIDDLE_TOKEN_USDC,
        destinationAsset: FRAXZERO_MIDDLE_TOKEN_USDC.assetId,
        swapType: OneClickSwapType.Output,
        isProxy: true,
        recipient: middleChainRecipientAddress,
        appFees: [
          {
            recipient: "reffer.near",
            // No bridge fee will be charged temporarily
            fee: +oneClickFeeRatio, // 10000 = 100% 1000 = 10% 100=1% 1=0.01%
          },
        ],
      });
      execTime.log("oneClickService.quote");
      csl("OneClick2FraxZeroService quote", "yellow-600", "NOT FromEthereumUSDC firstStepResult: %o", firstStepResult);

      let totalFeesUsd = Big(0);
      let _destinationGasFeeUsd = Big(firstStepResult.fees?.destinationGasFeeUsd || 0).minus(secondStepLzMsgFeeUsd);
      if (Big(_destinationGasFeeUsd).lt(0)) {
        _destinationGasFeeUsd = Big(0);
      }
      const fees = {
        ...firstStepResult.fees,
        destinationGasFeeUsd: numberRemoveEndZero(Big(_destinationGasFeeUsd).toFixed(20)),
      };
      for (const feeKey in secondStepResult?.fees) {
        if (fraxZeroExcludeFees.includes(feeKey)) {
          continue;
        }
        fees[feeKey] = secondStepResult.fees[feeKey];
      }
      for (const feeKey in fees) {
        if (oneClickExcludeFees.includes(feeKey)) {
          continue;
        }
        totalFeesUsd = Big(totalFeesUsd || 0).plus(fees[feeKey] || 0);
      }

      execTime.logTotal("OneClick2FraxZeroService.quote is NOT FromEthereumUSDC");

      const notFromEthUSDCFinalOutputAmount = isToEthereumFrxUSD
        ? numberRemoveEndZero(Big(estimateEthereumFrxUSDAmountWei.toString()).div(10 ** toToken.decimals).toFixed(toToken.decimals, Big.roundDown))
        : secondStepResult.outputAmount;

      return {
        ...firstStepResult,
        quoteDeadline: firstStepResult.quoteDeadline,
        routeDisabled: routeStatus.disabled,
        needPermit: true,
        permitSpender: FRAXZERO_REDEEM_AND_MINT_CONTRACT,
        permitToken: FRAXZERO_MIDDLE_TOKEN_USDC,
        permitAmountWei: firstStepResult?.quote?.amountOut,
        permitAdditionalData: {},
        fees,
        totalFeesUsd: numberRemoveEndZero(Big(totalFeesUsd).toFixed(20)),
        estimateTime: (isToEthereumFrxUSD ? 0 : secondStepResult.estimateTime) + firstStepResult.estimateTime,
        outputAmount: notFromEthUSDCFinalOutputAmount,
        quoteParam: {
          ...firstStepResult.quoteParam,
          toToken: params.toToken,
          middleToken: FRAXZERO_MIDDLE_TOKEN_USDC,
          middleToken2: FRAXZERO_MIDDLE_TOKEN_FRXUSD,
          recipient: params.recipient,
          depositAddress: firstStepResult.quote?.depositAddress,
          isFromEthereumUSDC,
          isToEthereumFrxUSD,
        },
        sendParam: {
          ...firstStepResult.sendParam,
          isOneClickTransfer: !firstStepResult.sendParam ? {
            originAsset: fromToken.contractAddress,
            depositAddress: firstStepResult.quote?.depositAddress,
            amount: firstStepResult.quote?.amountIn,
          } : false,
          isFromEthereumUSDC,
          isToEthereumFrxUSD,
        },
        sourceQuoteParams: params,
      };
    }

    // 2. If is from Ethereum USDC, skip the first step
    // mint and bridge use contract directly
    if (isToEthereumFrxUSD) {
      execTime.breakpoint();
      const firstStepResult = await middleChainWallet.mintFrxUSD({
        ...params,
        toToken: FRAXZERO_MIDDLE_TOKEN_FRXUSD,
        abi: FRAXZERO_REDEEM_MINT_ABI,
        usdcCustodianAddress: FRAXZERO_REDEEM_USDC_CONTRACT,
        previewMintResult,
      });
      execTime.log("middleChainWallet.mintFrxUSD");
      csl("OneClick2FraxZeroService quote", "yellow-600", "FromEthereumUSDC firstStepResult: %o", firstStepResult);

      execTime.logTotal("OneClick2FraxZeroService.quote is To EthereumFrxUSD");

      return {
        ...firstStepResult,
        routeDisabled: routeStatus.disabled,
        quoteParam: {
          ...firstStepResult.quoteParam,
          middleToken: FRAXZERO_MIDDLE_TOKEN_USDC,
          middleToken2: FRAXZERO_MIDDLE_TOKEN_FRXUSD,
          isFromEthereumUSDC,
          isToEthereumFrxUSD,
        },
        sendParam: {
          ...firstStepResult.sendParam,
          isFromEthereumUSDC,
          isToEthereumFrxUSD,
        },
        sourceQuoteParams: params,
      };
    }

    // 3. to other chain frxUSD
    // The mintAndSend method of the FRAXZERO_REDEEM_AND_MINT_CONTRACT contract should be called here
    const originLayerzero = FRAXZERO_CONFIG[fromToken.chainName];
    const destinationLayerzero = FRAXZERO_CONFIG[toToken.chainName];

    execTime.breakpoint();
    const firstStepResult = await middleChainWallet.mintAndSendFrxUSD({
      ...params,
      abi: FRAXZERO_REDEEM_MINT_ABI,
      usdcCustodianAddress: FRAXZERO_REDEEM_USDC_CONTRACT,
      redeemAndMintContractAddress: FRAXZERO_REDEEM_AND_MINT_CONTRACT,
      originLayerzero,
      destinationLayerzero,
      previewMintResult,
    });
    execTime.log("middleChainWallet.mintAndSendFrxUSD");
    csl("OneClick2FraxZeroService quote", "yellow-600", "FromEthereumUSDC firstStepResult: %o", firstStepResult);

    // estimate lz message fee
    // from Ethereum frxUSD to toToken
    execTime.breakpoint();
    const secondStepResult = await super.quote({
      ...params,
      fromToken: FRAXZERO_MIDDLE_TOKEN_FRXUSD,
      wallet: middleChainWallet,
      amountWei: Big(firstStepResult.outputAmount).times(10 ** FRAXZERO_MIDDLE_TOKEN_FRXUSD.decimals).toFixed(0, Big.roundDown),
    });
    execTime.log("FraxZero.quote");
    csl("OneClick2FraxZeroService quote", "yellow-600", "FromEthereumUSDC estimate fraxzero: %o", secondStepResult);

    let totalFeesUsd = Big(0);
    const fees = {
      ...firstStepResult.fees,
    };
    for (const feeKey in secondStepResult.fees) {
      if (fraxZeroExcludeFees.includes(feeKey)) {
        continue;
      }
      fees[feeKey] = secondStepResult.fees[feeKey];
    }
    for (const feeKey in fees) {
      if (oneClickExcludeFees.includes(feeKey)) {
        continue;
      }
      totalFeesUsd = Big(totalFeesUsd || 0).plus(fees[feeKey] || 0);
    }

    const sendParamOptions = firstStepResult.sendParam.param[firstStepResult.sendParam.param.length - 1];
    const fraxzeroSendParamOptions = secondStepResult.sendParam.param[secondStepResult.sendParam.param.length - 1];
    firstStepResult.sendParam.param[firstStepResult.sendParam.param.length - 1] = {
      ...sendParamOptions,
      value: fraxzeroSendParamOptions.value,
    };

    execTime.logTotal("OneClick2FraxZeroService.quote is To Other Chain FrxUSD");

    return {
      ...firstStepResult,
      routeDisabled: routeStatus.disabled,
      fees,
      totalFeesUsd: numberRemoveEndZero(Big(totalFeesUsd).toFixed(20)),
      estimateTime: firstStepResult.estimateTime + secondStepResult.estimateTime,
      outputAmount: secondStepResult.outputAmount,
      quoteParam: {
        ...firstStepResult.quoteParam,
        middleToken: FRAXZERO_MIDDLE_TOKEN_USDC,
        middleToken2: FRAXZERO_MIDDLE_TOKEN_FRXUSD,
        isFromEthereumUSDC,
        isToEthereumFrxUSD,
      },
      sendParam: {
        ...firstStepResult.sendParam,
        isFromEthereumUSDC,
        isToEthereumFrxUSD,
      },
      sourceQuoteParams: params,
    };
  }

  public override async send(params: any) {
    const {
      wallet,
      sendParam,
      ...rest
    } = params;

    // proxy transfer
    if (sendParam) {
      if (sendParam.isOneClickTransfer) {
        return wallet.send(SendType.TRANSFER, sendParam.isOneClickTransfer);
      }
      const tx = await wallet.send(SendType.SEND, sendParam);
      return tx;
    }

    return wallet.send(SendType.SEND, rest);
  }

  public override async estimateTransaction(params: any, quoteData: any) {
    const {
      wallet,
      sendParam,
    } = quoteData;

    // proxy transfer
    if (sendParam) {
      if (sendParam.isOneClickTransfer) {
        return quoteData;
      }
      return super.estimateTransaction(params, quoteData);
    }

    return quoteData;
  }
}

export default new OneClick2FraxZeroService();
