import useBridgeStore from "@/stores/use-bridge";
import oneClickService from "@/services/oneclick";
import useToast from "@/hooks/use-toast";
import { useRequest } from "ahooks";
import Loading from "@/components/loading/icon";
import { useTronEnergy } from "../bridge/hooks/use-tron";
import useWalletsStore from "@/stores/use-wallets";
import { tokens } from "@/config/tokens";
import usePricesStore from "@/stores/use-prices";
import { TRON_RENTAL_FEE, TronTransferStepStatus } from "@/config/tron";
import Big from "big.js";
import { ServiceMap } from "@/services";
import { OneClickSwapType, Service } from "@/services/constants";
import { useHistoryStore } from "@/stores/use-history";
import Modal from "@/components/modal";
import { useState } from "react";
import { formatNumber } from "@/utils/format/number";
import { formatAddress } from "@/utils/format/address";
import Skeleton from "@/components/skeleton";
import { csl } from "@/utils/log";
import { getRealService, TradeProject } from "@/config/trade";
import { USDT0_MIDDLE_CHAIN_LAYERZERO_EXECUTOR, USDT0_MIDDLE_TOKEN_CHAIN } from "@/services/usdt0/config";
import { CCTP_PROXY_RELAY_CONTRACT, MIDDLE_TOKEN_CHAIN as CCTP_MIDDLE_TOKEN_CHAIN } from "@/services/cctp/config";
import { MIDDLE_CHAIN_REFUND_ADDRESS } from "@/services/utils";
import { FRAXZERO_MIDDLE_TOKEN_USDC, FRAXZERO_REDEEM_AND_MINT_CONTRACT } from "@/services/fraxzero/config";
import { useSwitchChain } from "wagmi";
import usdt0Service from "@/services/usdt0";
import cctpService from "@/services/cctp";
import { useConfigStore } from "@/stores/use-config";
import { useTrack } from "@/hooks/use-track";
import { addTradeReport } from "@/stores/use-trade-report";

const ContinueTransfer = (props: any) => {
  const { history, reload } = props;

  const toast = useToast();
  const bridgeStore = useBridgeStore();
  const { getEstimateNeedsEnergy, getEnergy } = useTronEnergy();
  const wallets = useWalletsStore();
  const prices = usePricesStore((state) => state.prices);
  const historyStore = useHistoryStore();
  const { switchChainAsync } = useSwitchChain();
  const configStore = useConfigStore();
  const { addTransfer: addTransferTrack } = useTrack();

  const [continueVisible, setContinueVisible] = useState(false);
  const [transactionData, setTransactionData] = useState<any>();
  const [transactionDataLoading, setTransactionDataLoading] = useState<any>(false);

  const { runAsync: handleContinue, loading } = useRequest(async () => {
    // @ts-ignore
    const wallet = wallets["tron"];
    // @ts-ignore
    const evmWallet = wallets["evm"];

    const isFromOneClickHybridProject = [TradeProject.OneClickUsdt0, TradeProject.OneClickCCTP, TradeProject.OneClickFraxZero].includes(history.project);
    // Need to sign permit for USDT(MIDDLE_TOKEN_CHAIN) on the Arbitrum chain
    const isOneClickUsdt0 = history.project === TradeProject.OneClickUsdt0;
    const isOneClickCCTP = history.project === TradeProject.OneClickCCTP;
    // Need to sign permit for USDC(FRAXZERO_MIDDLE_TOKEN_USDC) on the Ethereum chain
    const isOneClickFraxZero = history.project === TradeProject.OneClickFraxZero;

    const fromToken = tokens.find((token) => token.blockchain === history.from_chain && token.symbol === history.symbol);
    const sourceToToken = tokens.find((token) => token.blockchain === history.to_chain && token.symbol === history.to_symbol);
    let toToken = sourceToToken;
    let permitSpender;
    if (isOneClickUsdt0) {
      toToken = USDT0_MIDDLE_TOKEN_CHAIN;
      permitSpender = USDT0_MIDDLE_CHAIN_LAYERZERO_EXECUTOR;
    }
    if (isOneClickCCTP) {
      toToken = CCTP_MIDDLE_TOKEN_CHAIN;
      permitSpender = CCTP_PROXY_RELAY_CONTRACT;
    }
    if (isOneClickFraxZero) {
      toToken = FRAXZERO_MIDDLE_TOKEN_USDC;
      permitSpender = FRAXZERO_REDEEM_AND_MINT_CONTRACT;
    }

    const addTrackParams: any = {
      type: "continue_button",
      service: getRealService(history.project as TradeProject, { symbol: history.symbol }).service,
      quoteData: {
        quoteParam: {
          estimateTime: history.complete_time,
          outputAmount: history.token_out_amount,
          amountWei: Big(history.token_in_amount || 0).times(10 ** (fromToken?.decimals || 6)).toFixed(0),
          recipient: history.receive_address,
          refundTo: history.address,
          fromToken: {
            blockchain: history.from_chain,
            symbol: history.symbol,
            address: fromToken?.contractAddress,
            decimals: fromToken?.decimals,
            chainType: fromToken?.chainType,
          },
          toToken: {
            blockchain: history.to_chain,
            symbol: history.to_symbol,
            address: sourceToToken?.contractAddress,
            decimals: sourceToToken?.decimals,
            chainType: sourceToToken?.chainType,
          },
        },
        quote: {
          depositAddress: history.deposit_address,
        }
      },
    };

    try {
      if (!fromToken || !toToken) {
        throw new Error(`Get quote data failed: no quote response or no from token or no to token`);
      }

      if (!wallet.account) {
        wallet.connect();
        return;
      }

      if (isFromOneClickHybridProject) {
        if (!evmWallet.account) {
          evmWallet.connect();
          return;
        }
      }

      setContinueVisible(true);
      setTransactionDataLoading(true);

      let quoteResponse;
      try {
        const data = await oneClickService.getStatusData({
          depositAddress: history.deposit_address,
        });
        const {
          correlationId,
          status,
          swapDetails,
          updatedAt,
        } = data;
        if (!["PENDING_DEPOSIT", "INCOMPLETE_DEPOSIT"].includes(status)) {
          throw new Error(`This transaction cannot be continued, status code: ${status}`);
        }
        quoteResponse = data.quoteResponse;
      } catch (error: any) {
        throw new Error(`Get quote data failed: ${error.message}`);
      }

      const { needsEnergy } = await getEstimateNeedsEnergy({
        wallet: wallet.wallet,
        account: wallet.account || "",
      });

      if (!quoteResponse) {
        throw new Error(`Get quote data failed: no quote response or no from token or no to token`);
      }

      const { quote, quoteRequest } = quoteResponse;

      csl("ContinueTransfer handleContinue", "rose-400", "quoteRequest: %o", quoteRequest);
      csl("ContinueTransfer handleContinue", "rose-400", "quote: %o", quote);

      const _formatQuoteDataParams: any = {
        amountWei: quoteRequest.amount,
        toToken: toToken,
        fromToken: fromToken,
        wallet: wallet.wallet,
        prices,
        refundTo: wallet.account || "",
        recipient: history.receive_address || "",
        refundType: "ORIGIN_CHAIN",
        originAsset: fromToken.assetId,
        destinationAsset: toToken.assetId,
      };
      let permitResult;
      if (isFromOneClickHybridProject) {
        _formatQuoteDataParams.swapType = OneClickSwapType.Output;
        _formatQuoteDataParams.amountWei = quote.amountIn;
        _formatQuoteDataParams.recipient = evmWallet.account;

        // User needs to sign permit on EVM chain
        // Now switch to the corresponding EVM chain
        await switchChainAsync({ chainId: toToken.chainId! });
        const signature = await evmWallet.wallet.signTypedData({
          fromToken: toToken,
          amountWei: quote.amountOut,
          spender: permitSpender,
        });
        permitResult = {
          amount: signature.value,
          deadline: signature.deadline,
          nonce: signature.nonce,
          owner: signature.owner,
          r: signature.r,
          s: signature.s,
          v: signature.v,
        };
      }

      csl("ContinueTransfer handleContinue", "rose-400", "_formatQuoteDataParams: %o", _formatQuoteDataParams);

      const _quoteData = await oneClickService.formatQuoteData({
        data: quoteResponse,
        params: _formatQuoteDataParams,
      });

      addTrackParams.quoteData = _quoteData;

      csl("ContinueTransfer handleContinue", "rose-400", "_quoteData: %o", _quoteData);

      setTransactionData({
        ..._quoteData,
        needsEnergy,
        estimatedEnergy: TRON_RENTAL_FEE.Normal || 0,
        estimatedEnergyUsd: Big(TRON_RENTAL_FEE.Normal || 0).times(prices[fromToken.nativeToken.symbol] || 0).toFixed(2),
      });
      setTransactionDataLoading(false);

      const quoteData = {
        type: Service.OneClick,
        data: _quoteData,
      };

      csl("ContinueTransfer handleContinue", "rose-400", "final quoteData: %o", quoteData);

      // get TRX balance
      try {
        const estimateGas = Big(TRON_RENTAL_FEE.Normal).times(10 ** fromToken.nativeToken.decimals).toFixed(0);
        const nativeBalance = await wallet.wallet.getBalance({ symbol: "native" }, wallet.account);
        const nativeTokenName = fromToken.nativeToken.symbol;

        csl("ContinueTransfer handleContinue", "teal-400", "estimate %s balance. Required: %s %s, Available: %s %s", nativeTokenName, estimateGas, nativeTokenName, nativeBalance, nativeTokenName);

        if (Big(nativeBalance || 0).lt(estimateGas || 0)) {
          throw new Error(`Insufficient ${nativeTokenName} balance: You need at least ${TRON_RENTAL_FEE.Normal} ${nativeTokenName} to continue this transaction`);
        }
      } catch (error: any) {
        console.error("get TRX balance failed: %o", error);
      }

      const localHistoryData = {
        type: Service.OneClick,
        depositAddress: quote.depositAddress,
        amount: quote.amountInFormatted,
        fromToken: fromToken,
        toToken: sourceToToken,
        fromAddress: wallet.account,
        toAddress: quoteRequest.recipient,
        time: Date.now(),
        txHash: "",
        timeEstimate: quote.timeEstimate,
      };
      const reportData: any = {
        project: "nearintents",
        address: wallet.account,
        amount: quote.amountInFormatted,
        out_amount: quoteData.data.outputAmount,
        deposit_address: quote.depositAddress,
        receive_address: quoteRequest.recipient,
        from_chain: history.from_chain,
        symbol: history.symbol,
        to_chain: history.to_chain,
        to_symbol: history.to_symbol,
        tx_hash: "",
      };

      if (isOneClickUsdt0) {
        // second step quote
        // is from USDT(MIDDLE_TOKEN_CHAIN) on the Arbitrum chain to sourceToToken
        const usdt0Result = await usdt0Service.quote({
          wallet: evmWallet.wallet,
          fromToken: USDT0_MIDDLE_TOKEN_CHAIN,
          toToken: sourceToToken,
          originChain: USDT0_MIDDLE_TOKEN_CHAIN.chainName,
          destinationChain: sourceToToken?.chainName,
          amountWei: quote.amountOut,
          refundTo: MIDDLE_CHAIN_REFUND_ADDRESS,
          recipient: history.receive_address,
          slippageTolerance: configStore.slippage,
          prices,
        });

        if (usdt0Result.errMsg) {
          throw new Error(usdt0Result.errMsg);
        }

        const usdt0SendParam = usdt0Result.sendParam?.param?.[0];
        const usdt0MessageFee = usdt0Result.sendParam?.param?.[1];

        reportData.layer_zero_permit = {
          ...permitResult,
          amount_ld: usdt0SendParam?.amountLD,
          compose_msg: usdt0SendParam?.composeMsg,
          dst_eid: usdt0SendParam?.dstEid,
          extra_options: usdt0SendParam?.extraOptions,
          min_amount_ld: usdt0SendParam?.minAmountLD?.toString(),
          oft_cmd: usdt0SendParam?.oftCmd,
          to: usdt0SendParam?.to,
          native_fee: usdt0MessageFee?.nativeFee?.toString(),
        };
      }

      if (isOneClickCCTP) {
        const cctpResult = await cctpService.quote({
          wallet: evmWallet.wallet,
          fromToken: CCTP_MIDDLE_TOKEN_CHAIN,
          toToken: sourceToToken,
          originChain: CCTP_MIDDLE_TOKEN_CHAIN.chainName,
          destinationChain: sourceToToken?.chainName,
          amountWei: quote.amountOut,
          refundTo: MIDDLE_CHAIN_REFUND_ADDRESS,
          recipient: history.receive_address,
          slippageTolerance: configStore.slippage,
          prices,
        });

        if (cctpResult.errMsg) {
          throw new Error(cctpResult.errMsg);
        }

        const cctpSendParam = cctpResult.sendParam?.param;

        reportData.cctp_permit = {
          ...permitResult,
          amount_wei: cctpSendParam?.[0]?.toString(),
          charged_amount: cctpSendParam?.[1]?.toString(),
          destination_domain: cctpSendParam?.[2]?.toString(),
          mint_recipient: cctpSendParam?.[3]?.toString(),
          burn_token: cctpSendParam?.[4]?.toString(),
          destination_caller: cctpSendParam?.[5]?.toString(),
          max_fee: cctpSendParam?.[6]?.toString(),
          finality_threshold: cctpSendParam?.[7]?.toString(),
          receipt_address: evmWallet.account,
        };
      }

      if (isOneClickFraxZero) {
        reportData.frax_zero_permit = {
          ...permitResult,
        };
      }

      csl("ContinueTransfer handleContinue", "rose-400", "reportData: %o", reportData);

      bridgeStore.setTronTransferVisible(true, { quoteData });

      if (needsEnergy) {
        await getEnergy({
          wallet: wallet.wallet,
          account: wallet.account || "",
        });
      } else {
        bridgeStore.setTronTransferStep(TronTransferStepStatus.EnergyReady);
      }

      bridgeStore.setTronTransferStep(TronTransferStepStatus.WalletPrompt);

      if (quoteData?.data?.sendParam?.param) {
        // proxyTransfer.recipient = depositAddress
        quoteData.data.sendParam.param[1] = quoteData.data.quote.depositAddress;
      }
      const hash = await ServiceMap[Service.OneClick].send({
        sendParam: quoteData?.data?.sendParam,
        wallet: wallet.wallet,
        fromToken: fromToken,
        depositAddress: quoteData.data.quote.depositAddress,
        amountWei: quoteRequest.amount,
      });

      localHistoryData.txHash = hash;
      localHistoryData.time = Date.now();

      historyStore.addHistory(localHistoryData);
      historyStore.updateStatus(quoteData.data.quote.depositAddress, "PENDING_DEPOSIT");

      reportData.tx_hash = hash;
      addTradeReport(reportData);

      toast.success({
        title: "Transfer submitted"
      });

      addTrackParams.txHash = hash;
      addTransferTrack(addTrackParams);

      // reload history list
      await reload?.();
    } catch (error: any) {
      console.error("continue transfer failed: %o", error);
      let errorMsg = error.meesage || error?.toString?.() || "";
      if (errorMsg.includes("user rejected action") || errorMsg.includes("Confirmation declined by user")) {
        errorMsg = "User rejected transaction";
      }
      toast.fail({
        title: "Continue transfer failed",
        text: errorMsg,
      });

      addTrackParams.errMsg = errorMsg;
      addTransferTrack(addTrackParams);
    }

    setTransactionData(null);
    setContinueVisible(false);
    bridgeStore.setTronTransferVisible(false);

  }, {
    manual: true,
  });

  return (
    <>
      <button
        type="button"
        className="button flex justify-center items-center gap-1 text-[12px] font-[500] bg-[#6284F5] shadow-[0_2px_6px_0_rgba(0,0,0,0.10)] text-white px-2 py-1 rounded-xl disabled:opacity-50 disabled:cursor-not-allowed duration-150"
        onClick={handleContinue}
        disabled={loading}
      >
        {loading && <Loading size={12} />} Continue
      </button>
      <Modal
        open={continueVisible}
        onClose={() => {
          setContinueVisible(false);
        }}
      >
        <div className="relative px-4 text-card-foreground flex flex-col gap-4 md:gap-6 py-4 md:py-6 w-full max-w-md bg-white border border-[#f2f2f2] rounded-b-none md:rounded-b-xl rounded-xl shadow-[0px_2px_6px_0px_rgba(0,0,0,0.1)]">
          {/* <button
            type="button"
            className="absolute top-4 right-4 cursor-pointer p-2 opacity-70 hover:opacity-100 transition-all"
            onClick={() => {
              setContinueVisible(false);
            }}
          >
            <img
              src={getStableflowIcon("icon-x.svg")}
              className="w-3 h-3 shrink-0"
            />
          </button> */}
          {/* Title */}
          <div className="text-[16px] font-[500]">Continue Transaction</div>

          {/* Amount Display Box */}
          <div className="bg-[#F5F5F5] rounded-xl px-4 py-6 flex items-center justify-between">
            {
              transactionDataLoading ? (
                <Skeleton width={150} height={36} className="" />
              ) : (
                <div className="text-[24px] font-[500] text-[#444C59]">
                  {formatNumber(transactionData?.outputAmount, 6, true)} {transactionData?.quoteParam?.toToken?.symbol}
                </div>
              )
            }
            {
              transactionDataLoading ? (
                <Skeleton width={70} height={30} borderRadius={15} />
              ) : (
                <div className="px-3 py-1.5 bg-[#6284F5] rounded-full text-white text-[12px] font-[500] h-[30px] min-w-[50px]">
                  {transactionData?.quoteParam?.toToken?.chainName}
                </div>
              )
            }
          </div>

          {/* Transaction Details */}
          <div className="flex flex-col gap-3 text-[12px]">
            <div className="flex items-center justify-between">
              <div className="text-[#70788A] font-[400]">Send Amount</div>
              {
                transactionDataLoading ? (
                  <Skeleton variant="text" width={90} height={18} />
                ) : (
                  <div className="text-black font-[400]">
                    {formatNumber(transactionData?.quote?.amountInFormatted, 6, true)} {transactionData?.quoteParam?.fromToken?.symbol}
                  </div>
                )
              }
            </div>
            <div className="flex items-center justify-between">
              <div className="text-[#70788A] font-[400]">Estimated Receive</div>
              {
                transactionDataLoading ? (
                  <Skeleton variant="text" width={90} height={18} />
                ) : (
                  <div className="text-black font-[400]">
                    {formatNumber(transactionData?.outputAmount, 6, true)} {transactionData?.quoteParam?.toToken?.symbol}
                  </div>
                )
              }
            </div>
            {
              transactionData?.needsEnergy && (
                <div className="flex items-center justify-between">
                  <div className="text-[#70788A] font-[400]">Energy Fee</div>
                  {
                    transactionDataLoading ? (
                      <Skeleton variant="text" width={90} height={18} />
                    ) : (
                      <div className="flex items-center gap-1">
                        <div className="text-black font-[400]">
                          {formatNumber(transactionData.estimatedEnergyUsd, 2, true, { prefix: "$" })}
                        </div>
                        <img
                          src={transactionData?.quoteParam?.fromToken?.chainIcon}
                          alt=""
                          className="w-3 h-3"
                        />
                        <div className="text-[#70788A] font-[400]">
                          {transactionData?.quoteParam?.fromToken?.nativeToken?.symbol}
                        </div>
                      </div>
                    )
                  }
                </div>
              )
            }
            <div className="flex items-center justify-between">
              <div className="text-[#70788A] font-[400]">Net fee</div>
              {
                transactionDataLoading ? (
                  <Skeleton variant="text" width={90} height={18} />
                ) : (
                  <div className="flex items-center gap-1">
                    <div className="text-black font-[400]">
                      {formatNumber(transactionData?.totalFeesUsd, 2, true, { prefix: "$" })}
                    </div>
                    <img
                      src={transactionData?.quoteParam?.fromToken?.icon}
                      alt=""
                      className="w-3 h-3"
                    />
                    <div className="text-[#70788A] font-[400]">{transactionData?.quoteParam?.fromToken?.symbol}</div>
                  </div>
                )
              }
            </div>
            <div className="flex items-center justify-between">
              <div className="text-[#70788A] font-[400]">Receiving Address</div>
              {
                transactionDataLoading ? (
                  <Skeleton variant="text" width={90} height={18} />
                ) : (
                  <div className="text-black font-[400]">
                    {formatAddress(transactionData?.quoteParam?.recipient, 5, 4)}
                  </div>
                )
              }
            </div>
            <div className="flex items-center justify-between">
              <div className="text-[#70788A] font-[400]">Route</div>
              {
                transactionDataLoading ? (
                  <Skeleton variant="text" width={90} height={18} />
                ) : (
                  <div className="text-black font-[400]">
                    {transactionData?.quoteParam?.fromToken?.chainName} → {transactionData?.quoteParam?.toToken?.chainName}
                  </div>
                )
              }
            </div>
          </div>

          {/* Energy Fee Notice */}
          {
            transactionData?.needsEnergy && (
              <div className="text-[12px] text-[#6284F5] font-[500] text-center">
                The transaction will automatically pay approximately {formatNumber(TRON_RENTAL_FEE.Normal, 2, true)} TRX in energy fees
              </div>
            )
          }
        </div>
      </Modal>
    </>
  );
};

export default ContinueTransfer;
