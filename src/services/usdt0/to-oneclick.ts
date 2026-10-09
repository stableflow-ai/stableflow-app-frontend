import { SendType } from "@/libs/wallets/types";

import oneClickService, { excludeFees as oneClickExcludeFees } from "../oneclick";
import usdt0Service, { excludeFees as usdt0ExcludeFees } from "./index";
import Big from "big.js";
import { numberRemoveEndZero } from "@/utils/format/number";
import { MIDDLE_CHAIN_REFUND_ADDRESS } from "../utils";
import { USDT0_MIDDLE_TOKEN_CHAIN } from "./config";
import RainbowWallet from "@/libs/wallets/rainbow/wallet";
import { csl } from "@/utils/log";
import { ExecTime } from "@/utils/exec-time";
import { getRouteStatus, OneClickSwapType, Service } from "../constants";
import { evmRpcFallbackProvider } from "@/utils/evm-rpc-providers";
import { isStableToken } from "@/config/tokens";

export class Usdt0OneClickService {
  public async quote(params: any) {
    const {
      dry,
      wallets,
      fromToken,
      toToken,
    } = params;

    const execTime = new ExecTime({ type: "Usdt0OneClickService", logStyle: "lime-700" });

    let middleChainWallet = wallets?.evm?.wallet;
    let middleChainRecipientAddress = wallets?.evm?.account;
    if (!middleChainWallet) {
      const provider = evmRpcFallbackProvider(fromToken);
      middleChainWallet = new RainbowWallet(provider, {});
    }

    if (!middleChainRecipientAddress) {
      middleChainRecipientAddress = MIDDLE_CHAIN_REFUND_ADDRESS;
    }

    const usdt0Params = {
      ...params,
      toToken: USDT0_MIDDLE_TOKEN_CHAIN,
      destinationChain: USDT0_MIDDLE_TOKEN_CHAIN.chainName,
      recipient: MIDDLE_CHAIN_REFUND_ADDRESS,
    };
    const oneClickParams = {
      ...params,
      fromToken: USDT0_MIDDLE_TOKEN_CHAIN,
      originAsset: USDT0_MIDDLE_TOKEN_CHAIN.assetId,
      swapType: OneClickSwapType.Flex,
      isProxy: false,
      refundTo: middleChainRecipientAddress,
      wallet: middleChainWallet,
    };

    // First, use the middle chain arb address (our refund address) to request Usdt0 for the output amount
    execTime.breakpoint();
    let usdt0Result = await usdt0Service.quote(usdt0Params);
    execTime.log("usdt0Service.quote: %o", usdt0Result);

    if (usdt0Result.errMsg) {
      return usdt0Result;
    }

    // Use the output amount from Usdt0 to request near-intents for the depositAddress
    oneClickParams.amountWei = Big(usdt0Result.outputAmount || 0).times(10 ** USDT0_MIDDLE_TOKEN_CHAIN.decimals).toFixed(0, 0);
    execTime.breakpoint();
    const oneClickResult = await oneClickService.quote(oneClickParams);
    execTime.log("oneClickService.quote: %o", oneClickResult);

    if (oneClickResult.errMsg) {
      return oneClickResult;
    }

    if (!dry) {
      usdt0Params.recipient = oneClickResult.quote.depositAddress;

      execTime.breakpoint();
      usdt0Result = await usdt0Service.quote(usdt0Params);
      execTime.log("usdt0Service.quote again: %o", usdt0Result);
    }

    csl("Usdt0OneClickService quote", "rose-600", "oneClickResult: %o", oneClickResult);
    csl("Usdt0OneClickService quote", "rose-600", "usdt0Result: %o", usdt0Result);

    let totalFeesUsd = Big(0);
    const fees = {
      ...usdt0Result.fees,
    };
    for (const feeKey in oneClickResult.fees) {
      if (oneClickExcludeFees.includes(feeKey)) {
        continue;
      }
      fees[feeKey] = oneClickResult.fees[feeKey];
    }
    for (const feeKey in fees) {
      if (usdt0ExcludeFees.includes(feeKey)) {
        continue;
      }
      totalFeesUsd = Big(totalFeesUsd || 0).plus(fees[feeKey] || 0);
    }

    execTime.logTotal("Usdt0OneClickService.quote");

    const routeStatus = getRouteStatus(Service.Usdt0OneClick);

    return {
      ...usdt0Result,
      fees,
      totalFeesUsd: numberRemoveEndZero(Big(totalFeesUsd).toFixed(20)),
      estimateTime: usdt0Result.estimateTime + oneClickResult.estimateTime,
      outputAmount: oneClickResult.outputAmount,
      priceImpact: oneClickResult.priceImpact,
      exchangeRate: oneClickResult.exchangeRate,
      quoteDeadline: oneClickResult.quoteDeadline,
      quoteParam: {
        ...usdt0Result.quoteParam,
        toToken: params.toToken,
        middleToken: USDT0_MIDDLE_TOKEN_CHAIN,
        recipient: params.recipient,
        depositAddress: oneClickResult.quote.depositAddress,
      },
      routeDisabled: routeStatus.disabled,
      sourceQuoteParams: params,
    };
  }

  public async estimateTransaction(params: any, quoteData: any) {
    const { } = params;

    return usdt0Service.estimateTransaction(params, quoteData);
  }

  public async send(params: any) {
    const {
      wallet,
      ...rest
    } = params;

    return wallet.send(SendType.SEND, rest);
  }

  public async getStatus(params: any): Promise<{ status: string; toTxHash?: string }> {
    const { hash, history, fromWallet } = params;

    // First, get the status of layerzero
    const usdt0Result = await usdt0Service.getStatus(params);

    // Only get the oneclick status if the first step is successful
    if (usdt0Result.status !== "SUCCESS") {
      return usdt0Result;
    }

    return oneClickService.getStatus({
      depositAddress: history?.depositAddress,
    });
  }
}

export default new Usdt0OneClickService();
