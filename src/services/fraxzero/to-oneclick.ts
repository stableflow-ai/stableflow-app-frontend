import { csl } from "@/utils/log";
import { FraxZeroService, excludeFees as fraxExcludeFees } from ".";
import { FRAXZERO_MIDDLE_TOKEN_USDC, FRAXZERO_MIDDLE_TOKEN_FRXUSD, FRAXZERO_REDEEM_USDC_CONTRACT, FRAXZERO_REDEEM_RWA_CONTRACT, FRAXZERO_REDEEM_AND_MINT_CONTRACT, FRAXZERO_GAS_USED, FRAXZERO_REDEMPTION_CONTRACT } from "./config";
import { MIDDLE_CHAIN_REFUND_ADDRESS } from "../utils";
import RainbowWallet from "@/libs/wallets/rainbow/wallet";
import { ethers } from "ethers";
import oneClickService, { excludeFees as oneClickExcludeFees } from "../oneclick";
import Big from "big.js";
import { numberRemoveEndZero } from "@/utils/format/number";
import { SendType } from "@/libs/wallets/types";
import { FRAXZERO_REDEEM_MINT_ABI } from "./contract";
import { getPrice } from "@/utils/format/price";
import { ExecTime } from "@/utils/exec-time";
import { getRouteStatus, OneClickSwapType, Service } from "../constants";
import { evmRpcFallbackProvider } from "@/utils/evm-rpc-providers";
import { isStableToken } from "@/config/tokens";

export class FraxZero2OneClickService extends FraxZeroService {
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

    csl("FraxZero2OneClickService quote", "yellow-500", "params: %o", params);

    const _quoteType = `FraxZero2OneClick ${fromToken?.chainName}->${toToken?.chainName}`;
    const execTime = new ExecTime({ type: _quoteType, logStyle: "fuchsia-700" });

    const isFromEthereumFrxUSD = fromToken.chainId === 1 && fromToken.symbol === FRAXZERO_MIDDLE_TOKEN_FRXUSD.symbol;
    const isToEthereumUSDC = toToken.chainId === 1 && toToken.symbol === FRAXZERO_MIDDLE_TOKEN_USDC.symbol;

    const routeStatus = getRouteStatus(Service.FraxZeroOneClick);

    const provider = evmRpcFallbackProvider(FRAXZERO_MIDDLE_TOKEN_FRXUSD);

    let middleChainWallet = wallets?.evm?.wallet;
    let middleChainRecipientAddress = wallets?.evm?.account;
    if (!middleChainWallet) {
      middleChainWallet = new RainbowWallet(provider, {});
    }
    if (!middleChainRecipientAddress) {
      middleChainRecipientAddress = MIDDLE_CHAIN_REFUND_ADDRESS;
    }

    // fraxzero quote result
    let firstStepResult: any;
    if (!isFromEthereumFrxUSD) {
      execTime.breakpoint();
      // bridge to Ethereum
      firstStepResult = await super.quote({
        ...params,
        toToken: FRAXZERO_MIDDLE_TOKEN_FRXUSD,
        recipient: middleChainRecipientAddress,
      });
      execTime.log("FraxZero.quote");
    }
    csl("FraxZero2OneClickService quote", "yellow-600", "firstStepResult: %o", firstStepResult);
    const ethereumFrxUSDAmountWei = isFromEthereumFrxUSD
      ? amountWei
      : Big(firstStepResult.outputAmount || 0).times(10 ** FRAXZERO_MIDDLE_TOKEN_FRXUSD.decimals).toFixed(0, Big.roundDown);
    const ethereumFrxUSDAmount = isFromEthereumFrxUSD
      ? Big(amountWei || 0).div(10 ** fromToken.decimals).toFixed(fromToken.decimals, Big.roundDown)
      : firstStepResult.outputAmount;

    // oneclick quote result
    let thirdStepResult: any;
    let preivewRedeemResult: any;
    if (!isToEthereumUSDC) {
      let oneClickFeeRatio = "0";
      // These fees are currently all 0
      // No need to request for now
      // if (!isFromEthereumFrxUSD) {
      //   execTime.breakpoint();
      //   const { usd, wei, amount } = await middleChainWallet.getEstimateGas({
      //     gasLimit: FRAXZERO_GAS_USED.REDEEM * 120n / 100n,
      //     price: getPrice(prices, FRAXZERO_MIDDLE_TOKEN_FRXUSD.nativeToken.symbol),
      //     nativeToken: FRAXZERO_MIDDLE_TOKEN_FRXUSD.nativeToken,
      //     provider,
      //     gasPrice: dry ? evmGasFees[FRAXZERO_MIDDLE_TOKEN_FRXUSD.chainId as number].gasPrice : void 0,
      //   });
      //   execTime.log("middleChainWallet.getEstimateGas");
      //   const secondStepGasToAmount = Big(usd).div(getPrice(prices, FRAXZERO_MIDDLE_TOKEN_USDC.symbol) || 1).toFixed(FRAXZERO_MIDDLE_TOKEN_USDC.decimals);
      //   oneClickFeeRatio = Big(secondStepGasToAmount)
      //     .div(Big(secondStepGasToAmount).plus(Big(ethereumFrxUSDAmountWei).div(10 ** FRAXZERO_MIDDLE_TOKEN_USDC.decimals).toFixed(FRAXZERO_MIDDLE_TOKEN_USDC.decimals)))
      //     .times(10000)
      //     .toFixed(0, Big.roundUp);
      // }

      // estimate redeem amount
      // If it's a quote, use a 1:1 exchange rate
      let ethereumUSDCAmountWei = Big(ethereumFrxUSDAmount || 0).times(10 ** FRAXZERO_MIDDLE_TOKEN_USDC.decimals).toFixed(0, Big.roundDown);
      try {
        execTime.breakpoint();
        preivewRedeemResult = await middleChainWallet.preivewRedeemFrxUSD({
          dry,
          amountWei: ethereumFrxUSDAmountWei,
          fromToken: FRAXZERO_MIDDLE_TOKEN_FRXUSD,
          abi: FRAXZERO_REDEEM_MINT_ABI,
          usdcCustodianAddress: FRAXZERO_REDEEM_USDC_CONTRACT,
          rwaCustodianAddress: FRAXZERO_REDEEM_RWA_CONTRACT,
          redemptionAddress: FRAXZERO_REDEMPTION_CONTRACT,
        });
        execTime.log("middleChainWallet.preivewRedeemFrxUSD");
        ethereumUSDCAmountWei = preivewRedeemResult.totalAssetsOut.toString();
      } catch (error) {
        csl("FraxZero2OneClickService quote", "red-500", "estimate redeem amount failed: %o", error);
      }

      // from ethereum USDC to toToken
      execTime.breakpoint();
      thirdStepResult = await oneClickService.quote({
        ...params,
        amountWei: ethereumUSDCAmountWei,
        fromToken: FRAXZERO_MIDDLE_TOKEN_USDC,
        originAsset: FRAXZERO_MIDDLE_TOKEN_USDC.assetId,
        swapType: OneClickSwapType.Flex,
        isProxy: false,
        refundTo: middleChainRecipientAddress,
        wallet: middleChainWallet,
        appFees: [
          {
            recipient: "reffer.near",
            // No bridge fee will be charged temporarily
            fee: +oneClickFeeRatio, // 10000 = 100% 1000 = 10% 100=1% 1=0.01%
          },
        ],
      });
      execTime.log("oneClickService.quote");
    }
    csl("FraxZero2OneClickService quote", "yellow-600", "thirdStepResult: %o", thirdStepResult);

    // redeem from ethereum frxUSD to ethereum USDC
    execTime.breakpoint();
    const secondStepResult = await middleChainWallet.redeemFrxUSD({
      ...params,
      preivewRedeemResult,
      fromToken: FRAXZERO_MIDDLE_TOKEN_FRXUSD,
      amountWei: ethereumFrxUSDAmountWei,
      toToken: FRAXZERO_MIDDLE_TOKEN_USDC,
      refundTo: middleChainRecipientAddress,
      recipient: !isToEthereumUSDC ? (thirdStepResult?.quote?.depositAddress || middleChainRecipientAddress) : recipient,
      abi: FRAXZERO_REDEEM_MINT_ABI,
      usdcCustodianAddress: FRAXZERO_REDEEM_USDC_CONTRACT,
      rwaCustodianAddress: FRAXZERO_REDEEM_RWA_CONTRACT,
      redemptionAddress: FRAXZERO_REDEMPTION_CONTRACT,
      redeemAndMintContractAddress: FRAXZERO_REDEEM_AND_MINT_CONTRACT,
    });
    execTime.log("middleChainWallet.redeemFrxUSD");
    csl("FraxZero2OneClickService quote", "yellow-600", "secondStepResult: %o", secondStepResult);

    const withOneClick = (_result: any) => {
      let totalFeesUsd = Big(0);
      let estimateTime = _result?.estimateTime || 0;
      let finalOutputAmount = _result?.outputAmount || "0";
      let depositAddress = thirdStepResult?.quote?.depositAddress;

      const fees = {
        ..._result?.fees,
      };
      if (!isToEthereumUSDC) {
        for (const feeKey in thirdStepResult?.fees) {
          if (oneClickExcludeFees.includes(feeKey)) {
            continue;
          }
          fees[feeKey] = thirdStepResult.fees[feeKey];
        }
        estimateTime = estimateTime + (thirdStepResult?.estimateTime || 0);
        finalOutputAmount = thirdStepResult?.outputAmount || "0";
      }
      for (const feeKey in fees) {
        if (fraxExcludeFees.includes(feeKey)) {
          continue;
        }
        totalFeesUsd = Big(totalFeesUsd || 0).plus(fees[feeKey] || 0);
      }

      const inputAmount = Big(amountWei).div(10 ** fromToken.decimals).toFixed(fromToken.decimals, Big.roundDown);
      const amountInUsd = Big(inputAmount).times(getPrice(prices, fromToken.symbol));
      const priceImpact = Big(amountInUsd).minus(Big(finalOutputAmount).times(getPrice(prices, toToken.symbol))).div(amountInUsd);
      const exchangeRate = Big(finalOutputAmount).div(inputAmount);

      return {
        fees,
        totalFeesUsd: numberRemoveEndZero(Big(totalFeesUsd).toFixed(20)),
        estimateTime,
        outputAmount: finalOutputAmount,
        priceImpact: numberRemoveEndZero(Big(priceImpact).toFixed(4)),
        exchangeRate: numberRemoveEndZero(Big(exchangeRate).toFixed(6, Big.roundDown)),
        quoteDeadline: thirdStepResult?.quoteDeadline,
        quoteParam: {
          ..._result?.quoteParam,
          fromToken,
          amountWei,
          toToken,
          refundTo,
          recipient,
          middleToken: FRAXZERO_MIDDLE_TOKEN_USDC,
          middleToken2: FRAXZERO_MIDDLE_TOKEN_FRXUSD,
          isFromEthereumFrxUSD,
          isToEthereumUSDC,
          depositAddress,
        },
        routeDisabled: routeStatus.disabled,
        sourceQuoteParams: params,
      };
    };

    // Redeem from the frontend
    if (isFromEthereumFrxUSD) {

      const oneClickResult = withOneClick(secondStepResult);

      execTime.logTotal("FraxZero2OneClickService.quote is From EthereumFrxUSD");

      return {
        ...secondStepResult,
        ...oneClickResult,
        routeDisabled: routeStatus.disabled,
        sourceQuoteParams: params,
      };
    }

    // Redeem is done by the backend, and the frontend calls FraxZero to bridge to Ethereum frxUSD
    const oneClickResult = withOneClick({
      ...firstStepResult,
      outputAmount: secondStepResult.outputAmount,
    });

    execTime.logTotal("FraxZero2OneClickService.quote is NOT From EthereumFrxUSD");

    return {
      ...firstStepResult,
      ...oneClickResult,
      recipient,
      needPermit: true,
      permitSpender: FRAXZERO_REDEEM_AND_MINT_CONTRACT,
      permitToken: FRAXZERO_MIDDLE_TOKEN_FRXUSD,
      permitAmountWei: ethereumFrxUSDAmountWei,
      permitAdditionalData: {},
      routeDisabled: routeStatus.disabled,
      sourceQuoteParams: params,
    };
  }
}

export default new FraxZero2OneClickService();
