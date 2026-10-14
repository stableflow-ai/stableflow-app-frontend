import { getRouteStatus, Service } from "@/services/constants";
import { QuoteError, QuoteErrorLevel } from "@/services/quote-error";
import { FRAXZERO_CONFIG, FRAXZERO_REQUIRED_DVN_COUNT } from "./config";
import { FRAXZERO_ABI } from "./contract";
import { calculateEstimateTime } from "../utils";
import { Usdt0Service } from "../usdt0";
import { OFT_ABI } from "../usdt0/contract";
import { csl } from "@/utils/log";
import { ExecTime } from "@/utils/exec-time";

export const PayInLzToken = false;

export const excludeFees: string[] = ["estimateGasUsd"];

export class FraxZeroService extends Usdt0Service {
  public override async quote(params: any) {
    const {
      wallet,
      amountWei,
      refundTo,
      recipient,
      fromToken,
      toToken,
      slippageTolerance,
      prices,
    } = params;

    const _quoteType = `FraxZeroService ${fromToken?.chainName}->${toToken?.chainName}`;
    const execTime = new ExecTime({ type: _quoteType, logStyle: "fuchsia-600" });

    const originLayerzero = FRAXZERO_CONFIG[fromToken.chainName];
    const destinationLayerzero = FRAXZERO_CONFIG[toToken.chainName];

    const isFromEthereumOrFraxtal = fromToken.chainId === 1 || fromToken.chainId === 252;
    const isToEthereumOrFraxtal = toToken.chainId === 1 || toToken.chainId === 252;
    const isFraxtal = fromToken.chainId === 252 || toToken.chainId === 252;
    const isFromSolana = fromToken.chainName === "Solana";

    const routeStatus = getRouteStatus(Service.FraxZero);

    if (isFromSolana) {
      // only support Ethereum and Fraxtal
      if (![1, 252].includes(toToken.chainId)) {
        throw new QuoteError("Invalid destination chain", QuoteErrorLevel.Business);
      }
    }

    const estimateTime = calculateEstimateTime({
      requiredDvnCount: FRAXZERO_REQUIRED_DVN_COUNT,
      originConfig: originLayerzero,
      destinationConfig: destinationLayerzero,
    });

    if (isFraxtal && !isFromSolana) {
      const result = await wallet.quote(Service.Usdt0, {
        ...params,
        abi: OFT_ABI,
        dstEid: destinationLayerzero.eid,
        payInLzToken: PayInLzToken,
        originLayerzeroAddress: isFromEthereumOrFraxtal ? originLayerzero.lockbox : fromToken.contractAddress,
        destinationLayerzeroAddress: isToEthereumOrFraxtal ? destinationLayerzero.lockbox : toToken.contractAddress,
        excludeFees,
        originLayerzero,
        destinationLayerzero,
      });

      result.estimateTime = estimateTime;
      result.routeDisabled = routeStatus.disabled;
      result.sourceQuoteParams = params;

      execTime.logTotal("FraxZeroService.quote isFraxtal");

      return result;
    }

    const result = await wallet.quote(Service.FraxZero, {
      ...params,
      abi: FRAXZERO_ABI,
      originLayerzero,
      destinationLayerzero,
      excludeFees,
    });

    result.estimateTime = estimateTime;
    result.routeDisabled = routeStatus.disabled;
    result.sourceQuoteParams = params;

    execTime.logTotal("FraxZeroService.quote");

    return result;
  }
}

export default new FraxZeroService();
