import { BridgeDefaultWallets } from "@/config";
import type { WalletType } from "@/stores/use-wallets";
import { numberRemoveEndZero } from "@/utils/format/number";
import { getPrice } from "@/utils/format/price";
import axios, { type AxiosInstance } from "axios";
import Big from "big.js";
import { ONECLICK_PROXY, ONECLICK_PROXY_ABI } from "./contract";
import { SendType } from "@/libs/wallets/types";
import { getRouteStatus, OneClickSwapType, Service } from "@/services/constants";
import { csl } from "@/utils/log";
import { ExecTime } from "@/utils/exec-time";
import { BASE_API_URL } from "@/config/api";
import { NEAR_INTENTS_QUOTE_DEADLINE_MS } from "./config";

export const BridgeFee = [
  {
    includeChains: ["BNB Chain", "Tron"],
    recipient: "reffer.near",
    // No bridge fee will be charged temporarily
    fee: 1, // 100=1% 1=0.01%
  },
];

export const checkIsBridgeFee = (params?: any) => {
  const currentBridgeFee = BridgeFee[0];
  const { fromToken, toToken } = params ?? {};

  if (!fromToken || !toToken) {
    return false;
  }

  const fromTokenSymbol = fromToken?.symbol === "USD₮0" ? "USDT" : fromToken?.symbol;
  const toTokenSymbol = toToken?.symbol === "USD₮0" ? "USDT" : toToken?.symbol;

  if (
    // 1. bridge chains is bsc / tron
    (currentBridgeFee.includeChains.includes(fromToken?.chainName) || currentBridgeFee.includeChains.includes(toToken?.chainName))
    // 2. is swap
    || fromTokenSymbol !== toTokenSymbol
  ) {
    return true;
  }

  return false;
};

export const excludeFees: string[] = ["estimateGasUsd"];

export class OneClickService {
  private api: AxiosInstance;
  private quoteApi: AxiosInstance;
  private offsetTime = NEAR_INTENTS_QUOTE_DEADLINE_MS;
  constructor() {
    this.api = axios.create({
      baseURL: "https://1click.chaindefuser.com/v0",
      timeout: 30000,
      headers: {
        "Content-Type": "application/json",
      }
    });
    this.quoteApi = axios.create({
      baseURL: `${BASE_API_URL}/v1/nearintents`,
      timeout: 30000,
      headers: {
        "Content-Type": "application/json",
      }
    });
  }

  public async formatQuoteData(res: { data: any; params: any; }) {
    const { params } = res;
    const { isProxy = true, needsBandwidthTRX, needsEnergyAmount, prices } = params;

    const isFromTron = params.fromToken.chainType === "tron";
    const isFromTronEnergy = isFromTron && params.acceptTronEnergy;
    const isExactOutput = params.swapType === OneClickSwapType.Output;
    const nativeTokenPrice = getPrice(prices, params.fromToken.nativeToken.symbol);
    const nativeTokenDecimals = params.fromToken.nativeToken.decimals;

    const execTime = new ExecTime({ type: "OneClickService formatQuoteData", logStyle: "lime-300" });

    if (res.data) {
      // Updated the time estimate for bridge quotes to ensure it does not exceed a maximum threshold.
      // If the calculated time exceeds 60 seconds, it is randomized between 40 and 45 seconds,
      // enhancing user experience by providing more realistic estimates.
      if (res.data?.quote) {
        if (Big(res.data.quote.timeEstimate || 0).gt(60)) {
          res.data.quote.timeEstimate = Math.floor(Math.random() * 6) + 40;
        }
      }

      res.data.estimateTime = res.data?.quote?.timeEstimate; // seconds
      res.data.outputAmount = numberRemoveEndZero(Big(res.data?.quote?.amountOut || 0).div(10 ** params.toToken.decimals).toFixed(params.toToken.decimals, 0));
      let priceImpact = Big(0);
      let _amountInUsd = res.data?.quote?.amountInUsd || 0;
      let _amountOutUsd = res.data?.quote?.amountOutUsd || 0;
      try {
        priceImpact = Big(Big(_amountInUsd).minus(_amountOutUsd)).div(_amountInUsd || 1);
        if (Big(priceImpact).lt(0)) {
          priceImpact = Big(0);
        }
      } catch (error) { }
      res.data.priceImpact = numberRemoveEndZero(Big(priceImpact).toFixed(4));

      const fromTokenSymbol = params.fromToken.symbol === "USD₮0" ? "USDT" : params.fromToken.symbol;
      const toTokenSymbol = params.toToken.symbol === "USD₮0" ? "USDT" : params.toToken.symbol;
      res.data.exchangeRate = "1";
      if (fromTokenSymbol !== toTokenSymbol) {
        res.data.exchangeRate = numberRemoveEndZero(Big(res.data.quote?.amountOutFormatted || 0).div(res.data.quote?.amountInFormatted || 1).toFixed(params.toToken.decimals, 0));
      }

      if (isFromTron) {
        const energySourceGasFee = {
          estimateGas: Big(Big(needsBandwidthTRX || 0).plus(needsEnergyAmount || 0)).times(10 ** nativeTokenDecimals).toFixed(nativeTokenDecimals)
        };
        res.data.energySourceGasFee = energySourceGasFee.estimateGas;
        const energySourceGasFeeUsd = Big(energySourceGasFee.estimateGas || 0).div(10 ** nativeTokenDecimals).times(nativeTokenPrice);
        res.data.energySourceGasFeeUsd = numberRemoveEndZero(Big(energySourceGasFeeUsd).toFixed(20));
      }

      try {
        // const bridgeFee = BridgeFee.reduce((acc, item) => {
        //   return acc.plus(Big(item.fee).div(100));
        // }, Big(0)).toFixed(2) + "%";
        // const netFee = Big(params.amountWei).div(10 ** params.fromToken.decimals).minus(Big(res.data?.quote?.amountOut || 0).div(10 ** params.toToken.decimals));
        const netFee = Big(_amountInUsd).minus(_amountOutUsd);
        const isBridgeFee = checkIsBridgeFee(params);
        let bridgeFeeValue = Big(0);
        if (isBridgeFee) {
          bridgeFeeValue = BridgeFee.reduce((acc, item) => {
            return acc.plus(
              Big(params.amountWei)
                .div(10 ** params.fromToken.decimals)
                .times(Big(item.fee).div(10000))
                .times(getPrice(params.prices, params.fromToken.symbol))
            );
          }, Big(0));
        }
        let destinationGasFee = Big(netFee).minus(bridgeFeeValue);
        destinationGasFee = Big(destinationGasFee).lt(0) ? Big(0) : destinationGasFee;
        if (fromTokenSymbol !== toTokenSymbol) {
          destinationGasFee = Big(0);
        }
        res.data.fees = {
          bridgeFeeUsd: numberRemoveEndZero(Big(bridgeFeeValue).toFixed(20)),
          destinationGasFeeUsd: numberRemoveEndZero(Big(destinationGasFee).toFixed(20)),
        };

        // calculate total fees
        res.data.totalFeesUsd = "0";
        for (const feeKey in res.data.fees) {
          if (excludeFees.includes(feeKey) || !/Usd$/.test(feeKey)) {
            continue;
          }
          res.data.totalFeesUsd = Big(res.data.totalFeesUsd || 0).plus(res.data.fees[feeKey] || 0);
        }
        res.data.totalFeesUsd = numberRemoveEndZero(Big(res.data.totalFeesUsd).toFixed(20));

      } catch (error) {
        csl("OneClickService formatQuoteData", "red-500", "oneclick estimate failed: %o", error);
      }

      const proxyAddress = ONECLICK_PROXY[params.fromToken.chainName];
      let proxyParams: any = {};
      if (proxyAddress && isProxy) {
        proxyParams = {
          dry: params.dry,
          proxyAddress,
          abi: ONECLICK_PROXY_ABI,
          fromToken: params.fromToken,
          refundTo: params.refundTo,
          recipient: params.recipient,
          amountWei: isExactOutput ? res.data?.quote?.amountIn : params.amountWei,
          prices: params.prices,
          evmGasFees: params.evmGasFees,
          depositAddress: res.data?.quote?.depositAddress ?? BridgeDefaultWallets[params.fromToken.chainType as WalletType],
        };
        try {
          execTime.breakpoint();
          const proxyResult = await params.wallet.quote(Service.OneClick, proxyParams);
          execTime.log("wallet.quoteOneClickProxy");

          for (const proxyKey in proxyResult) {
            if (proxyKey === "fees") {
              for (const feeKey in proxyResult.fees) {
                if (excludeFees.includes(feeKey) || !/Usd$/.test(feeKey)) {
                  continue;
                }
                res.data.fees[feeKey] = proxyResult.fees[feeKey];
              }
              continue;
            }
            res.data[proxyKey] = proxyResult[proxyKey];
          }

          res.data.transferSourceGasFee = proxyResult.estimateSourceGas;
          const transferSourceGasFeeUsd = Big(proxyResult.estimateSourceGas || 0).div(10 ** params.fromToken.nativeToken.decimals).times(getPrice(params.prices, params.fromToken.nativeToken.symbol));
          res.data.transferSourceGasFeeUsd = numberRemoveEndZero(Big(transferSourceGasFeeUsd).toFixed(20));
        } catch (error) {
          csl("OneClickService formatQuoteData", "red-500", "oneclick quote proxy failed: %o", error);
        }
      }

      res.data.quoteParam = {
        ...params,
        ...proxyParams,
      };
    }

    execTime.logTotal("OneClickService.formatQuoteData");

    return res.data || {};
  }

  public async quote(params: {
    wallet: any,
    fromToken: any,
    toToken: any,
    dry: boolean;
    slippageTolerance: number;
    originAsset: string;
    destinationAsset: string;
    amountWei: string;
    refundTo: string;
    refundType: "ORIGIN_CHAIN";
    recipient: string;
    connectedWallets?: string[];
    prices: Record<string, string>;
    appFees: any[];
    isProxy?: boolean;
    swapType?: OneClickSwapType;
  }) {
    const {
      fromToken,
      toToken,
      refundTo,
      recipient,
      slippageTolerance,
      dry,
      originAsset,
      destinationAsset,
      amountWei,
      refundType,
      appFees,
      swapType,
    } = params;

    const _quoteType = `OneClickService ${fromToken?.chainName}->${toToken?.chainName}`;
    const execTime = new ExecTime({ type: _quoteType, logStyle: "lime-400" });

    const quoteParams: any = {
      depositMode: "SIMPLE",
      swapType: swapType || OneClickSwapType.Input,
      depositType: "ORIGIN_CHAIN",
      sessionId: `session_${Date.now()}_${Math.random()
        .toString(36)
        .substr(2, 9)}`,
      recipientType: "DESTINATION_CHAIN",
      deadline: new Date(Date.now() + this.offsetTime).toISOString(),
      quoteWaitingTimeMs: 3000,
      appFees,
      referral: "stableflow",
      refundTo,
      recipient,
      slippageTolerance: slippageTolerance * 100,
      dry,
      originAsset,
      destinationAsset,
      amount: amountWei,
      refundType,
    };

    const isBridgeFee = checkIsBridgeFee(params);
    if (isBridgeFee) {
      if (Array.isArray(quoteParams.appFees)) {
        quoteParams.appFees = quoteParams.appFees.concat(BridgeFee.map((it) => ({ recipient: it.recipient, fee: it.fee })));
      } else {
        quoteParams.appFees = BridgeFee.map((it) => ({ recipient: it.recipient, fee: it.fee }));
      }
    }
    // if (swapType === OneClickSwapType.Output) {
    //   quoteParams.amount = Big(amountWei || 0).div(10 ** fromToken.decimals).times(10 ** toToken.decimals).toFixed(0);
    // }

    execTime.breakpoint();
    const res = await this.quoteApi.post("/quote", quoteParams);
    execTime.log("1click API /quote");

    execTime.breakpoint();
    const result = await this.formatQuoteData({ data: res.data, params });
    execTime.log("formatQuoteData");

    execTime.logTotal("OneClickService.quote");

    const routeStatus = getRouteStatus(Service.OneClick);
    result.routeDisabled = routeStatus.disabled;
    result.sourceQuoteParams = params;
    result.quoteDeadline = quoteParams.deadline;

    return result;
  }

  public async estimateTransaction(params: any, quoteData: any) {
    const {
      fromToken,
      isProxy = true,
      wallet,
      amountWei,
      refundTo,
      prices,
      acceptTronEnergy,
      evmGasFees,
    } = params;

    const result: any = { fees: {}, ...quoteData };

    const proxyAddress = ONECLICK_PROXY[fromToken.chainName];
    const isFromTron = fromToken.chainType === "tron";
    const isFromTronEnergy = isFromTron && acceptTronEnergy;
    const isFinalProxy = proxyAddress && isProxy;
    const nativeTokenPrice = getPrice(prices, fromToken.nativeToken.symbol);
    const nativeTokenDecimals = fromToken.nativeToken.decimals;

    if (isFromTron) {
      try {
        const _estGas = await wallet.estimateTransferGas({
          fromToken: fromToken,
          depositAddress: BridgeDefaultWallets[fromToken.chainType as WalletType],
          amount: amountWei,
          account: refundTo,
        });
        result.transferSourceGasFee = _estGas.estimateGas;
        const transferSourceGasFeeUsd = Big(result.transferSourceGasFee || 0).div(10 ** nativeTokenDecimals).times(nativeTokenPrice);
        result.transferSourceGasFeeUsd = numberRemoveEndZero(Big(transferSourceGasFeeUsd).toFixed(20));
      } catch (error) {
        csl("OneClickService estimateTransaction", "red-500", "oneclick estimate transaction without proxy failed: %o", error);
      }
    }

    if (isFinalProxy) {
      const estimateTransactionParams = {
        dry: false,
        ...quoteData.sendParam,
        fromToken,
        prices,
        evmGasFees,
      };
      if (isFromTron) {
        estimateTransactionParams.defaultEnergyUsed = 200000;
        estimateTransactionParams.defaultRawDataHexLength = 500;
      }
      const ett = await wallet.estimateTransaction(estimateTransactionParams);
      result.fees.estimateGasUsd = ett.estimateSourceGasUsd;
      result.estimateSourceGas = ett.estimateSourceGas;
      // Solana only: rent for the accounts this transaction creates. It is not a network fee,
      // but the wallet still needs to hold it, so it belongs in the native balance gate.
      if (ett.accountRentUsd) {
        result.fees.accountRentUsd = ett.accountRentUsd;
      }
      result.totalEstimateSourceGas = ett.estimateSourceGas + (ett.accountRentLamports ? BigInt(ett.accountRentLamports) : 0n);
      result.estimateSourceGasUsd = ett.estimateSourceGasUsd;

      result.transferSourceGasFee = ett.estimateSourceGas;
      result.transferSourceGasFeeUsd = ett.estimateSourceGasUsd;

      if (fromToken.chainType === "evm") {
        const sendParams = result.sendParam?.param;
        if (
          sendParams
          && Array.isArray(sendParams)
          && sendParams[sendParams.length - 1]
          && typeof sendParams[sendParams.length - 1] === "object"
          && sendParams[sendParams.length - 1].gasLimit !== void 0
        ) {
          csl("OneClickService estimateTransaction", "green-500", "Old gasLimit: %o", sendParams[sendParams.length - 1].gasLimit);
          sendParams[sendParams.length - 1].gasLimit = ett.estimateSourceGasLimit;
          csl("OneClickService estimateTransaction", "green-500", "Updated gasLimit: %o", sendParams[sendParams.length - 1].gasLimit);
        }
      }
    } else {
      let sourceGasFee = result.transferSourceGasFee || {};
      if (isFromTronEnergy) {
        sourceGasFee = result.energySourceGasFee;
      }
      const estimateGasUsd = Big(sourceGasFee.estimateGas || 0).div(10 ** nativeTokenDecimals).times(nativeTokenPrice);
      result.fees.estimateGasUsd = numberRemoveEndZero(Big(estimateGasUsd).toFixed(20));
      result.estimateSourceGas = sourceGasFee.estimateGas;
      result.totalEstimateSourceGas = sourceGasFee.estimateGas;
      result.estimateSourceGasUsd = numberRemoveEndZero(Big(estimateGasUsd).toFixed(20));
    }

    if (result.needApprove && wallet.estimateApprove) {
      const estApptroveGas = await wallet.estimateApprove({
        dry: false,
        amountWei,
        spender: result.approveSpender,
        fromToken,
        prices,
      });
      result.estimateApproveGas = estApptroveGas.estimateSourceGas;
    }

    result.totalFeesUsd = "0";
    for (const feeKey in result.fees) {
      if (excludeFees.includes(feeKey) || !/Usd$/.test(feeKey)) {
        continue;
      }
      result.totalFeesUsd = Big(result.totalFeesUsd || 0).plus(result.fees[feeKey] || 0);
    }
    result.totalFeesUsd = numberRemoveEndZero(Big(result.totalFeesUsd).toFixed(20));

    return result;
  }

  public async send(params: any) {
    const {
      wallet,
      fromToken,
      depositAddress,
      amountWei,
      sendParam,
      isFromTronEnergy,
    } = params;

    const proxyAddress = ONECLICK_PROXY[fromToken.chainName];

    if (isFromTronEnergy || !proxyAddress) {
      const hash = await wallet.send(SendType.TRANSFER, {
        originAsset: fromToken.contractAddress,
        depositAddress: depositAddress,
        amount: amountWei,
      });
      return hash;
    }

    // proxy transfer
    const tx = await wallet.send(SendType.SEND, sendParam);
    return tx;
  }

  public async submitHash(params: { txHash: string; depositAddress: string }) {
    return await this.api.post("/deposit/submit", params);
  }

  public async getStatus(params: {
    depositAddress: string;
    depositMemo?: string;
  }): Promise<{ status: string; toTxHash?: string }> {
    try {
      const response = await this.api.get("/status", { params });

      const status = response.data.status;
      const toTxHash = response.data.swapDetails?.destinationChainTxHashes?.[0]?.hash;

      return { status, toTxHash };
    } catch (error) {
      console.error("oneclick get status failed: %o", error);
      return { status: "PENDING_DEPOSIT" };
    }
  }

  public async getStatusData(params: {
    depositAddress: string;
  }): Promise<any> {
    try {
      const response = await this.api.get("/status", { params });

      if (response.status !== 200 || !response.data) {
        return null;
      }

      return response.data;
    } catch (error) {
      console.error("oneclick get status data failed: %o", error);
      return null;
    }
  }
}

export default new OneClickService();
