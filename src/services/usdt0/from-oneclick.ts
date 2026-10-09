import oneClickService, { excludeFees as oneClickExcludeFees } from "../oneclick";
import usdt0Service, { excludeFees as usdt0ExcludeFees } from "./index";
import cctpService from "../cctp";
import Big from "big.js";
import { numberRemoveEndZero } from "@/utils/format/number";
import { MIDDLE_CHAIN_REFUND_ADDRESS } from "../utils";
import { USDT0_MIDDLE_CHAIN_LAYERZERO_EXECUTOR, USDT0_MIDDLE_TOKEN_CHAIN } from "./config";
import RainbowWallet from "@/libs/wallets/rainbow/wallet";
import { getPrice } from "@/utils/format/price";
import { ExecTime } from "@/utils/exec-time";
import { getRouteStatus, OneClickSwapType, Service } from "../constants";
import { QuoteErrorLevel } from "../quote-error";
import { evmRpcFallbackProvider } from "@/utils/evm-rpc-providers";
import { isStableToken } from "@/config/tokens";

export class OneClickUsdt0Service {
  public async quote(params: any) {
    const {
      wallets,
      fromToken,
      prices,
    } = params;

    const execTime = new ExecTime({ type: "OneClickUsdt0", logStyle: "lime-500" });

    let middleChainWallet = wallets?.evm?.wallet;
    let middleChainRecipientAddress = wallets?.evm?.account;
    if (!middleChainWallet) {
      const provider = evmRpcFallbackProvider(fromToken);
      middleChainWallet = new RainbowWallet(provider, {});
    }
    if (!middleChainRecipientAddress) {
      middleChainRecipientAddress = MIDDLE_CHAIN_REFUND_ADDRESS;
    }

    // If it is not a USD stablecoin
    // Need to convert based on price
    let secondStepAmountWei = Big(params.amountWei || 0).div(10 ** fromToken.decimals).times(10 ** USDT0_MIDDLE_TOKEN_CHAIN.decimals).toFixed(0);
    if (!isStableToken(fromToken)) {
      const inputPrice = getPrice(prices, fromToken.symbol);
      const inputValue = Big(params.amountWei || 0).div(10 ** fromToken.decimals).times(inputPrice);
      secondStepAmountWei = Big(inputValue).times(10 ** USDT0_MIDDLE_TOKEN_CHAIN.decimals).toFixed(0);
    }

    // First, call the usdt0 quote method
    // Retrieve sendParam, fees, and estimated costs
    // usdt0 is the second step, so the source chain is arb
    // The refund address is middleChainRecipientAddress
    // Since the first step uses oneclick with OneClickSwapType.Output mode,
    // params.amountWei is the input amount for the second step
    const usdt0Params = {
      ...params,
      amountWei: secondStepAmountWei,
      fromToken: USDT0_MIDDLE_TOKEN_CHAIN,
      originChain: USDT0_MIDDLE_TOKEN_CHAIN.chainName,
      refundTo: middleChainRecipientAddress,
      wallet: middleChainWallet,
    };

    execTime.breakpoint();
    const usdt0Result = await usdt0Service.quote(usdt0Params);
    execTime.log("usdt0Service.quote");

    const usdt0MessageFeeBuffer = 1.2;
    usdt0Result.fees.nativeFeeUsd = numberRemoveEndZero(Big(usdt0Result.fees?.nativeFeeUsd || 0).times(1 + usdt0MessageFeeBuffer).toFixed(20));
    usdt0Result.fees.nativeFee = numberRemoveEndZero(Big(usdt0Result.fees?.nativeFee || 0).times(1 + usdt0MessageFeeBuffer).toFixed(fromToken.nativeToken.decimals));
    // LZ message fee to USD
    const usdt0MessageFeeUsd = usdt0Result.fees.nativeFeeUsd;

    if (usdt0Result.errMsg) {
      return usdt0Result;
    }

    // OneClick charges a proportional fee on fromToken input
    // Convert LZ message fee USD to fromToken amount so fee ratio uses consistent units
    // fee bp = fee amount / (fee amount + amount), minimum is 1, maximum is 10000
    const usdt0MessageFeeAmountInFromToken = Big(usdt0MessageFeeUsd || 0)
      .div(getPrice(prices, fromToken.symbol) || 1)
      .toFixed(fromToken.decimals);
    const fromTokenAmount = Big(params.amountWei).div(10 ** fromToken.decimals).toFixed(fromToken.decimals);
    const oneClickFeeRatio = Big(usdt0MessageFeeAmountInFromToken || 0)
      .div(Big(usdt0MessageFeeAmountInFromToken || 0).plus(fromTokenAmount))
      .times(10000)
      .toFixed(0, Big.roundUp);

    if (Big(oneClickFeeRatio).gt(10000)) {
      return { errMsg: `Amount is too low, at least ${usdt0MessageFeeAmountInFromToken}`, errLevel: QuoteErrorLevel.Business };
    }

    // Call oneclick quote method again
    // The destination chain is arb
    // Since the exact amount transferred by oneclick needs to be signed, OneClickSwapType.Output mode must be used
    // In OneClickSwapType.Output mode, the output amount equals the expected value
    execTime.breakpoint();

    const oneClickResult = await oneClickService.quote({
      ...params,
      amountWei: secondStepAmountWei,
      toToken: USDT0_MIDDLE_TOKEN_CHAIN,
      destinationAsset: USDT0_MIDDLE_TOKEN_CHAIN.assetId,
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

    let totalFeesUsd = Big(0);
    let _destinationGasFeeUsd = Big(oneClickResult.fees?.destinationGasFeeUsd || 0).minus(usdt0MessageFeeUsd);
    if (Big(_destinationGasFeeUsd).lt(0)) {
      _destinationGasFeeUsd = Big(0);
    }
    const fees = {
      ...oneClickResult.fees,
      destinationGasFeeUsd: numberRemoveEndZero(Big(_destinationGasFeeUsd).toFixed(20)),
    };
    for (const feeKey in usdt0Result.fees) {
      if (usdt0ExcludeFees.includes(feeKey)) {
        continue;
      }
      fees[feeKey] = usdt0Result.fees[feeKey];
    }
    for (const feeKey in fees) {
      if (oneClickExcludeFees.includes(feeKey)) {
        continue;
      }
      totalFeesUsd = Big(totalFeesUsd || 0).plus(fees[feeKey] || 0);
    }

    const usdt0SendParam = usdt0Result.sendParam?.param?.[0];
    const usdt0MessageFee = usdt0Result.sendParam?.param?.[1];

    execTime.log("OneClickUsdt0Service.quote");

    const routeStatus = getRouteStatus(Service.OneClickUsdt0);

    return {
      ...oneClickResult,
      quoteDeadline: oneClickResult.quoteDeadline,
      needPermit: true,
      permitSpender: USDT0_MIDDLE_CHAIN_LAYERZERO_EXECUTOR,
      permitToken: USDT0_MIDDLE_TOKEN_CHAIN,
      permitAmountWei: oneClickResult?.quote?.amountOut,
      permitAdditionalData: {
        amount_ld: usdt0SendParam?.amountLD,
        compose_msg: usdt0SendParam?.composeMsg,
        dst_eid: usdt0SendParam?.dstEid,
        extra_options: usdt0SendParam?.extraOptions,
        min_amount_ld: usdt0SendParam?.minAmountLD?.toString(),
        oft_cmd: usdt0SendParam?.oftCmd,
        to: usdt0SendParam?.to,
        native_fee: usdt0MessageFee?.nativeFee?.toString(),
      },
      fees,
      totalFeesUsd: numberRemoveEndZero(Big(totalFeesUsd).toFixed(20)),
      estimateTime: usdt0Result.estimateTime + oneClickResult.estimateTime,
      outputAmount: usdt0Result.outputAmount,
      quoteParam: {
        ...oneClickResult.quoteParam,
        toToken: params.toToken,
        middleToken: USDT0_MIDDLE_TOKEN_CHAIN,
        recipient: params.recipient,
        isOriginLegacy: usdt0Result.quoteParam?.isOriginLegacy,
        isDestinationLegacy: usdt0Result.quoteParam?.isDestinationLegacy,
      },
      usdt0SendParam,
      usdt0MessageFee,
      routeDisabled: routeStatus.disabled,
      sourceQuoteParams: params,
    };
  }

  public async estimateTransaction(params: any, quoteData: any) {
    const { } = params;

    return oneClickService.estimateTransaction(params, quoteData);
  }

  public async send(params: any) {
    return oneClickService.send(params);
  }

  public async getStatus(params: any): Promise<{ status: string; toTxHash?: string }> {
    const { depositAddress } = params;

    // First, get the status of oneclick
    const oneClickResult = await oneClickService.getStatus({ depositAddress });

    if (oneClickResult.status !== "SUCCESS") {
      return oneClickResult;
    }

    // Then get the status of usdt0
    // Since the transaction is initiated on the server side, the frontend cannot obtain the txhash
    // Therefore, it is necessary to call the server-side API to get the result
    return cctpService.getStatus({ hash: depositAddress });
  }
}

export default new OneClickUsdt0Service();
