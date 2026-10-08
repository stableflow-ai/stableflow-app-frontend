import { useState, useEffect, useMemo, useRef } from "react";
import { ServiceMap } from "@/services";
import {
  validateAddress,
  type AddressValidationResult
} from "@/utils/address-validation";
import useWalletsStore, { type WalletType } from "@/stores/use-wallets";
import Big from "big.js";
import { useDebounceFn } from "ahooks";
import { useHistoryStore } from "@/stores/use-history";
import { useConfigStore } from "@/stores/use-config";
import useWalletStore from "@/stores/use-wallet";
import useBridgeStore, { type QuoteData } from "@/stores/use-bridge";
import useTokenBalance from "@/hooks/use-token-balance";
import useToast from "@/hooks/use-toast";
import useBalancesStore, { type BalancesState } from "@/stores/use-balances";
import { BridgeDefaultWallets, PRICE_IMPACT_THRESHOLD } from "@/config";
import { formatNumber } from "@/utils/format/number";
import { getRouteStatus, Service, ServiceBackend } from "@/services/constants";
import usePricesStore from "@/stores/use-prices";
import { v4 as uuidV4 } from "uuid";
import { BridgeFees, TronTransferStepStatus } from "@/config/tron";
import { useTronEnergy } from "./use-tron";
import { BridgeFee } from "@/services/oneclick";
import { useAccount, useSwitchChain } from "wagmi";
import { usePendingHistory } from "@/views/history/hooks/use-pending-history";
import { csl } from "@/utils/log";
import { addTradeReport } from "@/stores/use-trade-report";
import { createEvmAllowanceProvider, formatBridgeRpcErrorMessage, sortQuoteData, verifyPostApproveAllowance } from "../utils";
import { getQuoteModes } from "@/services/utils";
import useEvmGasFeesStore from "@/stores/use-evm-gas-fees";
import { ExecTime } from "@/utils/exec-time";
import { useTrack } from "@/hooks/use-track";
import { useAllTokensStore } from "@/all-tokens/store";
import { formatTemporarySwapLimitMessage } from "@/utils/quote-error";

const TRANSFER_MIN_AMOUNT = import.meta.env.VITE_TRANSFER_MIN_AMOUNT || 1;
const CCTP_AUTO_REQUOTE_DURATION = 20000; // 20s

export default function useBridge(props?: any) {
  const { } = props ?? {};

  const {
    getEstimateNeedsEnergy,
    getEnergy,
  } = useTronEnergy();
  const { debouncedGetList: getPendingList } = usePendingHistory();
  const allTokensEnabled = useAllTokensStore((state) => state.enabled);

  const prices = usePricesStore((state) => state.prices);
  const wallets = useWalletsStore();
  const historyStore = useHistoryStore();
  const configStore = useConfigStore();
  const walletStore = useWalletStore();
  const bridgeStore = useBridgeStore();
  const { getBalance } = useTokenBalance(walletStore.fromToken, false);
  const balancesStore = useBalancesStore();
  const evmAccount = useAccount();
  const { switchChainAsync } = useSwitchChain();
  const [errorChain, setErrorChain] = useState<number>(0);
  const toast = useToast();
  const prevToTokenRef = useRef<any>(null);
  const { byChainId: evmGasFees } = useEvmGasFeesStore();
  const { addQuote: addQuoteTrack, addTransfer: addTransferTrack, addCreateSolanaATA: addCreateSolanaATATrack } = useTrack();

  const [fromWalletAddress, toWalletAddress] = useMemo(() => {
    const _fromChainType: WalletType = walletStore.fromToken?.chainType;
    const _toChainType: WalletType = walletStore.toToken?.chainType;
    if (!_fromChainType || !_toChainType) return [];
    const _fromWallet = wallets[_fromChainType];
    const _toWallet = wallets[_toChainType];
    const _fromWalletAddress =
      _fromWallet?.account || BridgeDefaultWallets[_fromChainType];
    const _toWalletAddress =
      bridgeStore.recipientAddress || _toWallet?.account || BridgeDefaultWallets[_toChainType];
    return [_fromWalletAddress, _toWalletAddress];
  }, [wallets, walletStore, bridgeStore.recipientAddress]);

  // Recipient address state
  const [addressValidation, setAddressValidation] =
    useState<AddressValidationResult>({
      isValid: false
    });

  // Amount state
  const [amountError, setAmountError] = useState<string>("");

  const quoteRoutes = async (service: Service, params: any, requestId: number): Promise<QuoteData> => {
    const execTime = new ExecTime({ type: "useBridge QuoteRoutes", logStyle: "sky-300" });
    // Check request ID, skip setting loading state if not the latest request
    if (requestId !== requestIdRef.current) {
      throw new Error("Request cancelled: outdated request");
    }
    bridgeStore.setQuoting(service, requestId, true);
    const isFromTron = walletStore.fromToken.chainType === "tron";

    const formatQuoteParams = async () => {
      const _params: any = {
        dry: params.dry,
        amountWei: params.amountWei,
        refundTo: fromWalletAddress || "",
        recipient: bridgeStore.recipientAddress || toWalletAddress || "",
        wallet: params.wallet,
        wallets: params.wallets,
        switchChainAsync: params.switchChainAsync,
        fromToken: walletStore.fromToken,
        toToken: walletStore.toToken,
        prices,
        evmGasFees,
        slippageTolerance: configStore.slippage,
      };
      if (([
        Service.OneClick,
        Service.Usdt0OneClick,
        Service.OneClickUsdt0,
        Service.CCTPOneClick,
        Service.OneClickCCTP,
        Service.FraxZeroOneClick,
        Service.OneClickFraxZero,
      ] as Service[]).includes(service)) {
        _params.originAsset = walletStore.fromToken.assetId;
        _params.destinationAsset = walletStore.toToken.assetId;
        _params.refundType = "ORIGIN_CHAIN";
        _params.acceptTronEnergy = bridgeStore.acceptTronEnergy;

        if (isFromTron) {
          const { needsEnergy, needsBandwidth, needsBandwidthTRX, needsEnergyTRX } = await getEstimateNeedsEnergy({
            wallet: params.wallet,
            account: fromWalletAddress || "",
          });
          _params.needsEnergy = needsEnergy;
          _params.needsBandwidth = needsBandwidth;
          _params.needsBandwidthTRX = needsBandwidthTRX;

          if (needsEnergy) {
            _params.needsEnergyAmount = needsEnergyTRX;
          } else {
            if (bridgeStore.acceptTronEnergy) {
              const fixedFee = BridgeFees.Normal;
              const fixedFeePercentage = Number(Big(fixedFee).div(bridgeStore.amount).times(10000).toFixed(0, 0));
              _params.appFees = [
                {
                  recipient: BridgeFee[0].recipient,
                  fee: BridgeFee[0].fee + fixedFeePercentage,
                },
              ];
            }
          }
        }

        if (params.appFees) {
          _params.appFees = params.appFees;
        }
      }
      if (([Service.Usdt0, Service.CCTP, Service.Usdt0OneClick, Service.OneClickUsdt0, Service.CCTPOneClick, Service.OneClickCCTP] as Service[]).includes(service)) {
        _params.originChain = walletStore.fromToken.chainName;
        _params.destinationChain = walletStore.toToken.chainName;
      }
      if (([Service.Native] as Service[]).includes(service)) {
        _params.dry = params.dry;
      }

      return _params;
    };

    const quoteParams = await formatQuoteParams();

    try {
      const quoteRes = await ServiceMap[service].quote(quoteParams);
      quoteRes.quoteId = requestId;

      execTime.logTotal("useBridge QuoteRoutes");

      bridgeStore.setQuoting(service, requestId, false);

      // Check request ID again before setting result to ensure it's still the latest request
      if (requestId !== requestIdRef.current) {
        throw new Error("Request cancelled: outdated request");
      }

      bridgeStore.setQuoteData(service, quoteRes);

      if (params.dry) {
        ServiceMap[service].estimateTransaction(quoteParams, quoteRes)
          .then((estimateRes: any) => {
            csl("QuoteRoutes", "green-500", "%s estimateTransaction res: %o", service, estimateRes);
            if (estimateRes.quoteId !== requestIdRef.current) {
              return;
            }
            bridgeStore.setQuoteData(service, estimateRes);
          })
          .catch((estimateErr: any) => {
            // csl("QuoteRoutes", "red-500", "%s estimateTransaction failed: %o", service, estimateErr);
          });
      }

      addQuoteTrack({
        quoteData: quoteRes,
        service,
      });

      return {
        type: service,
        data: quoteRes,
      };
    } catch (error: any) {
      bridgeStore.setQuoting(service, requestId, false);

      // If it's a cancelled request error, return directly without setting error state
      if (error?.message === "Request cancelled: outdated request") {
        throw error;
      }

      // Check request ID, ignore error if not the latest request
      if (requestId !== requestIdRef.current) {
        throw new Error("Request cancelled: outdated request");
      }

      const defaultErrorMessage = "Failed to get quote, please try again later";
      const oneClickErrorResponse = error?.response?.data?.message;
      let _finalErrorMessage = oneClickErrorResponse || error?.message || defaultErrorMessage;
      let _finalReportErrorMessage = oneClickErrorResponse || error?.message || (error ? error + "" : defaultErrorMessage);
      if (([Service.OneClick, Service.OneClickUsdt0, Service.Usdt0OneClick, Service.CCTPOneClick, Service.OneClickCCTP, Service.FraxZeroOneClick, Service.OneClickFraxZero] as Service[]).includes(service)) {
        const getQuoteErrorMessage = (): { message: string; sourceMessage: string; } => {
          const _messageResult = {
            message: oneClickErrorResponse || defaultErrorMessage,
            sourceMessage: oneClickErrorResponse || error?.message || (error ? error + "" : defaultErrorMessage),
          };
          if (oneClickErrorResponse && oneClickErrorResponse !== "Internal server error") {
            // quote failed, maybe out of liquidity
            if (oneClickErrorResponse === "Failed to get quote") {
              _messageResult.message = "Amount exceeds max";
              return _messageResult;
            }
            // Amount is too low for bridge
            if (oneClickErrorResponse?.includes("Amount is too low for bridge, try at least")) {
              const match = error.response.data.message.match(/try at least\s+(\d+(?:\.\d+)?)/i);
              let minimumAmount = match ? match[1] : Big(1).times(10 ** walletStore.fromToken.decimals).toFixed(0);
              minimumAmount = Big(minimumAmount).div(10 ** walletStore.fromToken.decimals);
              _messageResult.message = `Amount is too low, at least ${formatNumber(minimumAmount, walletStore.fromToken.decimals, true)}`;
              _messageResult.sourceMessage = _messageResult.message;
              return _messageResult;
            }
            // over 5% appFee
            if (oneClickErrorResponse?.includes("Cannot convert undefined or null to object")) {
              _messageResult.message = "app fees exceeds 5% of amount";
              _messageResult.sourceMessage = "app fees exceeds 5% of amount";
            }
            return _messageResult;
          }
          // Unknown error
          return _messageResult;
        };

        const _errorMessage = getQuoteErrorMessage();
        _finalErrorMessage = _errorMessage.message;
        _finalReportErrorMessage = _errorMessage.sourceMessage;
      }

      _finalErrorMessage = formatTemporarySwapLimitMessage(_finalErrorMessage);

      const _quoteData = {
        type: service,
        quoteId: requestId,
        quoteParam: quoteParams,
        correlationId: error?.response?.data?.correlationId,
        errMsg: _finalErrorMessage,
      };
      bridgeStore.setQuoteData(service, _quoteData);

      addQuoteTrack({
        quoteData: {
          ..._quoteData,
          errMsg: _finalReportErrorMessage,
        },
        service,
      });

      return _quoteData;
    }
  };

  const [isAutoSelect, setAutoSelect] = useState(false);
  // Request ID counter to ensure only the latest request results are processed
  const requestIdRef = useRef(0);
  // Auto requote timer ref for CCTP from Solana USDC
  const autoRequoteTimerRef = useRef<NodeJS.Timeout | null>(null);
  // Track previous quoting state to detect when quote completes
  const prevQuotingRef = useRef<boolean>(false);

  const quote = async (params: { dry: boolean; }, isSync?: boolean, requestId?: number) => {
    const execTime = new ExecTime({ type: "useBridge.quote", logStyle: "sky-400" });

    if (!isSync) {
      bridgeStore.clearQuoteData();
    }

    if (
      !walletStore.toToken ||
      !walletStore.fromToken ||
      !fromWalletAddress ||
      !(bridgeStore.recipientAddress || toWalletAddress) ||
      Big(bridgeStore.amount || 0).lt(TRANSFER_MIN_AMOUNT)
    ) {
      bridgeStore.clearQuoteData();
      return;
    }

    // @ts-ignore
    const wallet = wallets[walletStore.fromToken.chainType];
    const amountWei = Big(bridgeStore.amount)
      .times(10 ** walletStore.fromToken.decimals)
      .toFixed(0);

    const quoteParams = {
      ...params,
      amountWei,
      wallet: wallet.wallet,
      wallets,
      switchChainAsync,
    };

    const pushQuoteService = (_service: Service) => {
      const serviceStatus = getRouteStatus(_service);
      if (serviceStatus.disabled) {
        return;
      }
      quoteServices.push({
        service: _service,
        quote: (_requestId: number) => {
          return quoteRoutes(_service, quoteParams, _requestId);
        }
      });
    };

    const quoteServices: any = [];
    for (const service of Object.values(Service)) {
      if (walletStore.fromToken.services.includes(service) && walletStore.toToken.services.includes(service)) {
        pushQuoteService(service);
      }
    }
    // Usdt0OneClick mode
    // First, check if fromToken supports Usdt0 and toToken supports OneClick
    // If both conditions are met, find an intermediate chain that supports both Usdt0 and OneClick
    // This intermediate chain is fixed as USDT Arbitrum

    const isFromUsdt = ["USDT", "USD₮0"].includes(walletStore.fromToken.symbol);
    const isToUsdt = ["USDT", "USD₮0"].includes(walletStore.toToken.symbol);
    const isFromUsdc = walletStore.fromToken.symbol === "USDC";
    const isToUsdc = walletStore.toToken.symbol === "USDC";

    // If fromToken is usdt0 and toToken is usdc, Usdt0OneClick mode can be used
    if (
      walletStore.fromToken.services.includes(Service.Usdt0)
      && walletStore.toToken.services.includes(Service.OneClick)
      && walletStore.fromToken.chainName !== "Arbitrum"
    ) {
      if (isFromUsdt && isToUsdt) {
        if (walletStore.toToken.chainName !== "Arbitrum") {
          pushQuoteService(Service.Usdt0OneClick);
        }
      } else {
        pushQuoteService(Service.Usdt0OneClick);
      }
    }

    // OneClickUsdt0 mode
    if (
      walletStore.fromToken.services.includes(Service.OneClick)
      && walletStore.toToken.services.includes(Service.Usdt0)
      && walletStore.toToken.chainName !== "Arbitrum"
    ) {
      if (isFromUsdt && isToUsdt) {
        if (walletStore.fromToken.chainName !== "Arbitrum") {
          pushQuoteService(Service.OneClickUsdt0);
        }
      } else {
        pushQuoteService(Service.OneClickUsdt0);
      }
    }

    // CCTPOneClick mode
    if (
      walletStore.fromToken.services.includes(Service.CCTP)
      && walletStore.toToken.services.includes(Service.OneClick)
      && walletStore.fromToken.chainName !== "Arbitrum"
    ) {
      if (isFromUsdc && isToUsdc) {
        if (walletStore.toToken.chainName !== "Arbitrum") {
          pushQuoteService(Service.CCTPOneClick);
        }
      } else {
        pushQuoteService(Service.CCTPOneClick);
      }
    }

    // OneClickCCTP mode
    if (
      walletStore.fromToken.services.includes(Service.OneClick)
      && walletStore.toToken.services.includes(Service.CCTP)
      && walletStore.toToken.chainName !== "Arbitrum"
    ) {
      if (isFromUsdc && isToUsdc) {
        if (walletStore.fromToken.chainName !== "Arbitrum") {
          pushQuoteService(Service.OneClickCCTP);
        }
      } else {
        pushQuoteService(Service.OneClickCCTP);
      }
    }

    // FraxZeroOneClick mode
    if (
      walletStore.fromToken.services.includes(Service.FraxZero)
      && walletStore.toToken.services.includes(Service.OneClick)
    ) {
      pushQuoteService(Service.FraxZeroOneClick);
    }

    // OneClickFraxZero mode
    if (
      walletStore.fromToken.services.includes(Service.OneClick)
      && walletStore.toToken.services.includes(Service.FraxZero)
    ) {
      pushQuoteService(Service.OneClickFraxZero);
    }

    // Use request ID to ensure only the latest request results are processed
    const currentRequestId = requestId ?? requestIdRef.current;

    if (isSync) {
      const currentQuoteService = quoteServices.find((service: any) => service.service === bridgeStore.quoteDataService);
      // Sync calls don't need request ID check
      const _quoteRes = await currentQuoteService.quote(currentRequestId);
      execTime.logTotal("useBridge.quote sync");
      csl("quote", "green-400", "[%s]Sync Quote Result: %o", bridgeStore.quoteDataService, _quoteRes);
      return _quoteRes;
    }

    csl("quote", "pink-950", "quoteServices: %o", quoteServices);

    const quotePromises: Promise<any>[] = [];
    for (let i = 0; i < quoteServices.length; i++) {
      const quoteService = quoteServices[i];
      const execTime = new ExecTime({ type: "useBridge: quote a Service", logStyle: "sky-500" });
      // Pass request ID to service function
      const p = quoteService.quote(currentRequestId).then((_quoteRes: any) => {
        // Check if it's the latest request, ignore result if not
        if (currentRequestId !== requestIdRef.current) {
          csl("quote", "gray-500", "[%s] Ignored outdated quote result, current requestId: %s, result requestId: %s", quoteService.service, requestIdRef.current, currentRequestId);
          return;
        }

        execTime.logTotal("service success", "(%s)", quoteService.service);
        csl("quote", "green-400", "[%s]Quote Result: %o", quoteService.service, _quoteRes);
      }).catch((error: any) => {
        execTime.logTotal("service failed", "(%s)", quoteService.service);
        // Silently ignore if it's a cancelled request error
        if (error?.message === "Request cancelled: outdated request") {
          csl("quote", "gray-500", "[%s] Request cancelled: outdated request", quoteService.service);
          return;
        }
        // Also check request ID to avoid old request errors overwriting new requests
        if (currentRequestId !== requestIdRef.current) {
          csl("quote", "gray-500", "[%s] Ignored outdated quote error, current requestId: %s, error requestId: %s", quoteService.service, requestIdRef.current, currentRequestId);
          return;
        }
        // Re-throw other errors for the caller to handle
        console.error(`[${quoteService.service}] Quote error:`, error);
      }).finally(() => {
        if (i >= quoteServices.length - 1) {
          setAutoSelect(true);
        }
      });
      quotePromises.push(p);

      // Change to sequential requests to avoid exceeding RPC request rate limits
      // try {
      //   const _quoteRes: any = await quoteService.quote(currentRequestId);
      //   // Check if it's the latest request, ignore result if not
      //   if (currentRequestId !== requestIdRef.current) {
      //     csl("quote", "gray-500", "[%s] Ignored outdated quote result, current requestId: %s, result requestId: %s", quoteService.service, requestIdRef.current, currentRequestId);
      //     return;
      //   }

      //   csl("quote", "green-400", "[%s]Quote Result: %o", quoteService.service, _quoteRes);
      // } catch (error: any) {
      //   // Silently ignore if it's a cancelled request error
      //   if (error?.message === "Request cancelled: outdated request") {
      //     csl("quote", "gray-500", "[%s] Request cancelled: outdated request", quoteService.service);
      //     return;
      //   }
      //   // Also check request ID to avoid old request errors overwriting new requests
      //   if (currentRequestId !== requestIdRef.current) {
      //     csl("quote", "gray-500", "[%s] Ignored outdated quote error, current requestId: %s, error requestId: %s", quoteService.service, requestIdRef.current, currentRequestId);
      //     return;
      //   }
      //   // Re-throw other errors for the caller to handle
      //   console.error(`[${quoteService.service}] Quote error:`, error);
      // }

      // setAutoSelect(true);
    }

    Promise.allSettled(quotePromises).then(() => {
      execTime.logTotal("useBridge.quote all services", "(services: %s)", quoteServices.map((s: any) => s.service).join(", "));
    });
  };

  const estimateNativeTokenBalance = async (params?: { estimateGas?: number | string; }) => {
    const result = { isContinue: true };

    // @ts-ignore
    const wallet = wallets[walletStore.fromToken.chainType];

    if (!wallet) {
      return result;
    }

    const _quoteData = bridgeStore.quoteDataMap.get(bridgeStore.quoteDataService);
    let _estimateSourceGas = _quoteData?.totalEstimateSourceGas || 0n;

    // stale chain
    // The native token of the stable chain is USDT0, so the transfer amount also needs to be included in the estimateGas.
    // Moreover, the native usdt0 has 18 decimals, while erc20 has 6 decimals
    if (_quoteData?.quoteParam?.fromToken?.chainId === 988) {
      _estimateSourceGas = Big(_estimateSourceGas.toString()).plus(Big(_quoteData?.quoteParam?.amountWei || 0).div(10 ** 6).times(10 ** 18)).toFixed(0);
    }

    // Estimate transfer gas and check native token balance
    try {
      const estimateGas = params?.estimateGas ?? _estimateSourceGas;
      // get native token balance
      let nativeBalance = await wallet.wallet.getBalance({ symbol: "native" }, wallet.account);
      const nativeTokenName = walletStore.fromToken.nativeToken.symbol;

      // tron chain
      // For Tron chain, need to check if the user has energy
      // If the user has energy, it should be added together with TRX
      if (!params?.estimateGas && _quoteData?.quoteParam?.fromToken?.chainType === "tron") {
        const tronAccountResources = await wallet.wallet.getAccountResources({ account: wallet.account });
        const tronAccountEnergyAsTRX = Big(tronAccountResources.energy || 0).times(10 ** 2);
        csl("estimateNativeTokenBalance", "teal-700", "Estimate %s balance. Required: %s %s, Available: %s %s, Available Energy: %s(as %s %s), Total Available: %s %s", nativeTokenName, estimateGas, nativeTokenName, nativeBalance, nativeTokenName, tronAccountResources.energy, Big(tronAccountEnergyAsTRX).toFixed(0), nativeTokenName, Big(nativeBalance || 0).plus(tronAccountEnergyAsTRX).toFixed(0), nativeTokenName);
        nativeBalance = Big(nativeBalance || 0).plus(tronAccountEnergyAsTRX);
      } else {
        csl("estimateNativeTokenBalance", "teal-700", "Estimate %s balance. Required: %s %s, Available: %s %s", nativeTokenName, estimateGas, nativeTokenName, nativeBalance, nativeTokenName);
      }

      // Check if balance is sufficient
      if (Big(nativeBalance || 0).lt(estimateGas || 0)) {
        result.isContinue = false;
        return result;
      }
    } catch (error) {
      csl("estimateNativeTokenBalance", "red-500", "check estimate gas failed: %o", error);
    }
    return result;
  };

  const permitSignature = async (params: any) => {
    const {
      _quote,
    } = params;

    if (!_quote?.data || !_quote?.data?.needPermit) {
      return void 0;
    }

    const {
      permitToken,
      permitSpender,
      permitAmountWei,
      permitAdditionalData,
      quoteParam,
    } = _quote.data;

    const evmWallet = wallets.evm.wallet;

    if (!evmWallet) {
      throw new Error("Permit wallet not connected");
    }

    await switchChainAsync({ chainId: permitToken.chainId! });

    const signature = await evmWallet?.signTypedData({
      fromToken: permitToken,
      amountWei: permitAmountWei,
      spender: permitSpender,
    });

    // After signing, need to switch back to the source chain
    if (quoteParam.fromToken.chainType === "evm") {
      await switchChainAsync({ chainId: quoteParam.fromToken.chainId! });
    }

    csl("transfer", "sky-600", "permit signature: %o", signature);

    const permitResult = {
      amount: signature.value,
      deadline: signature.deadline,
      nonce: signature.nonce,
      owner: signature.owner,
      r: signature.r,
      s: signature.s,
      v: signature.v,
      ...permitAdditionalData,
    };

    csl("transfer", "sky-600", "permit data: %o", permitResult);

    return permitResult;
  };

  const transfer = async () => {
    const addTrackParams: any = {
      type: "transfer_button",
      service: bridgeStore.quoteDataService,
      quoteData: bridgeStore.quoteDataMap.get(bridgeStore.quoteDataService),
    };

    try {
      if (([Service.OneClickUsdt0, Service.Usdt0OneClick, Service.CCTPOneClick, Service.OneClickCCTP] as Service[]).includes(bridgeStore.quoteDataService)) {
        const evmAddress = wallets.evm.account;
        if (!evmAddress) {
          throw new Error("Arbitrum wallet not connected");
        }
      }
      if (!walletStore.fromToken) {
        throw new Error("Please select a source token");
      }
      bridgeStore.set({ transferring: true });
      const _quote = await quoteWithRequestId({ dry: false }, true);

      if (!_quote.data) {
        throw new Error(_quote.errMsg || "Transfer failed");
      }

      if (_quote.data.routeDisabled) {
        throw new Error("This route is temporarily unavailable");
      }

      addTrackParams.quoteData = _quote.data;

      // @ts-ignore
      const wallet = wallets[walletStore.fromToken.chainType];
      // @ts-ignore
      const toWallet = wallets[walletStore.toToken.chainType];
      let _amount = Big(bridgeStore.amount)
        .times(10 ** walletStore.fromToken.decimals)
        .toFixed(0);

      const {
        isExactOutput,
        isOneClickService,
        isQuoteParamDepositAddress,
      } = getQuoteModes({
        quoteData: _quote.data,
        bridgeStore,
      });
      const isFromTron = walletStore.fromToken.chainType === "tron";
      const isFromTronEnergy = isFromTron && bridgeStore.acceptTronEnergy && isOneClickService;

      if (isExactOutput) {
        _amount = _quote.data.quote.amountIn;
      }

      // check latest balance
      const { wei: latestBalanceWei, error: latestBalanceError } = await getBalance();
      csl("transfer", "teal-400", "latest balance: %s", latestBalanceWei.toString());
      if (latestBalanceError) {
        throw new Error(latestBalanceError);
      }
      if (Big(latestBalanceWei.toString()).lt(_amount)) {
        throw new Error("Insufficient balance");
      }

      // approve
      const needApprove = _quote?.data?.needApprove;
      const approveSpender = _quote?.data?.approveSpender;
      const isFromEthereum = walletStore.fromToken.chainName === "Ethereum";
      const approveAmount = isExactOutput ? _quote?.data?.quote?.amountInFormatted : bridgeStore.amount;
      const approveAmountWei = Big(approveAmount || 0).times(10 ** walletStore.fromToken.decimals).toFixed(0);
      if (needApprove && !isFromTronEnergy) {
        if (_quote?.data?.estimateApproveGas) {
          const { isContinue } = await estimateNativeTokenBalance({
            estimateGas: _quote?.data?.estimateApproveGas,
          });
          if (!isContinue) {
            throw new Error("Insufficient native token balance for approve");
          }
        }

        // If it's Ethereum, if there was a previous approval, it needs to be revoked first
        // Then approve the new amount
        if (isFromEthereum) {
          const evmAllowanceProvider = createEvmAllowanceProvider(walletStore.fromToken);
          const allowance = await wallet.wallet.allowance({
            contractAddress: walletStore.fromToken.contractAddress,
            spender: approveSpender,
            address: fromWalletAddress,
            amountWei: approveAmountWei,
            strict: true,
            provider: evmAllowanceProvider,
          });
          if (Big(allowance.allowance || 0).gt(0) && allowance.needApprove) {
            const resetAllowanceResult = await wallet.wallet.approve({
              contractAddress: walletStore.fromToken.contractAddress,
              spender: approveSpender,
              // revoked approval
              amountWei: "0",
              isDetails: true,
            });
            if (!resetAllowanceResult.success) {
              throw new Error(resetAllowanceResult.message || "Approve failed");
            }
          }
        }

        // Normal approve
        const approveResult = await wallet.wallet.approve({
          contractAddress: walletStore.fromToken.contractAddress,
          spender: approveSpender,
          amountWei: approveAmountWei,
          isDetails: true,
        });
        if (!approveResult.success) {
          throw new Error(approveResult.message || "Approve failed");
        }

        const latestAllowance = await verifyPostApproveAllowance({
          wallet: wallet.wallet,
          chainType: walletStore.fromToken.chainType,
          fromToken: walletStore.fromToken,
          contractAddress: walletStore.fromToken.contractAddress,
          spender: approveSpender,
          address: fromWalletAddress || "",
          amountWei: approveAmountWei,
          approveResult,
        });

        csl("transfer", "blue-600", "verified allowance after approve: %o", latestAllowance);

        toast.success({
          title: "Approve success"
        });
        bridgeStore.modifyQuoteData(bridgeStore.quoteDataService, {
          needApprove: false,
        });
      }

      // Try to re-estimate gas
      if (ServiceMap[bridgeStore.quoteDataService].estimateTransaction) {
        const estimateTransactionQuoteData = {
          ..._quote.data,
          needApprove: false,
        };
        try {
          const estimateTransactionResult = await ServiceMap[bridgeStore.quoteDataService].estimateTransaction(_quote.data.sourceQuoteParams, estimateTransactionQuoteData);
          csl("transfer", "green-500", "final estimate transaction result: %o", estimateTransactionResult);
          _quote.data = estimateTransactionResult;
          bridgeStore.modifyQuoteData(bridgeStore.quoteDataService, {
            fees: estimateTransactionResult.fees,
            estimateSourceGas: estimateTransactionResult.estimateSourceGas,
            totalEstimateSourceGas: estimateTransactionResult.totalEstimateSourceGas,
            estimateSourceGasUsd: estimateTransactionResult.estimateSourceGasUsd,
            totalFeesUsd: estimateTransactionResult.totalFeesUsd,
          });
        } catch (error) {
          csl("transfer", "red-500", "final estimate transaction failed: %o", error);
        }
      }

      // create solana usdc account for CCTP
      if (_quote?.data?.needCreateTokenAccount) {
        const createResult = await toWallet.wallet?.createAssociatedTokenAddress?.({
          tokenMint: walletStore.toToken.contractAddress,
        });
        bridgeStore.set({ transferring: false });
        if (!createResult) {
          throw new Error(`Initialize Solana ${walletStore.toToken.symbol} Account failed`);
        }
        toast.success({
          title: `Initialize Solana ${walletStore.toToken.symbol} Account success`,
        });
        bridgeStore.modifyQuoteData(bridgeStore.quoteDataService, {
          needCreateTokenAccount: false,
        });
        addCreateSolanaATATrack(addTrackParams);
        return;
      }

      const reportData: any = {
        project: ServiceBackend[bridgeStore.quoteDataService],
        address: wallet.account,
        amount: isExactOutput ? _quote.data.quote.amountInFormatted : bridgeStore.amount,
        out_amount: _quote.data.outputAmount,
        deposit_address: isOneClickService ? _quote.data.quote.depositAddress : "",
        receive_address: _quote.data.quoteParam.recipient,
        from_chain: walletStore.fromToken.blockchain,
        symbol: /^USD₮0$/i.test(walletStore.fromToken.symbol) ? "USDT" : walletStore.fromToken.symbol,
        to_chain: walletStore.toToken.blockchain,
        to_symbol: /^USD₮0$/i.test(walletStore.toToken.symbol) ? "USDT" : walletStore.toToken.symbol,
        tx_hash: "",
      };
      const localHistoryData: any = {
        type: bridgeStore.quoteDataService,
        depositAddress: isOneClickService ? _quote.data.quote.depositAddress : "",
        amount: isExactOutput ? _quote.data.quote.amountInFormatted : bridgeStore.amount,
        fromToken: walletStore.fromToken,
        toToken: walletStore.toToken,
        fromAddress: wallet.account,
        toAddress: _quote.data.quoteParam.recipient,
        time: Date.now(),
        txHash: "",
        toChainTxHash: "",
        timeEstimate: _quote.data.estimateTime,
      };

      // 1click transfer
      if (isOneClickService) {
        const estNativeTokenParams: any = {};
        const fromTronParams = {
          wallet: wallet.wallet,
          account: wallet.account,
        };
        let needsEnergy = false;
        let needsBandwidth = false;
        if (isFromTron && bridgeStore.acceptTronEnergy) {
          const estimateNeeds = await getEstimateNeedsEnergy(fromTronParams);
          needsEnergy = estimateNeeds.needsEnergy;
          needsBandwidth = estimateNeeds.needsBandwidth;
          estNativeTokenParams.estimateGas = Big(estimateNeeds.needsEnergyTRX).plus(estimateNeeds.needsBandwidthTRX).times(10 ** walletStore.fromToken.nativeToken.decimals).toFixed(0);
        }
        const { isContinue } = await estimateNativeTokenBalance(estNativeTokenParams);
        if (!isContinue) {
          throw new Error("Insufficient native token balance for transaction");
        }

        if (!_quote?.data?.quote?.depositAddress) {
          throw new Error("Failed to get quote");
        }

        // oneclick-usdt0 permit signature
        const permitResultData = await permitSignature({ _quote });
        if (permitResultData) {
          if (([Service.OneClickUsdt0] as Service[]).includes(bridgeStore.quoteDataService)) {
            reportData.layer_zero_permit = permitResultData;
          }
          if (([Service.OneClickCCTP] as Service[]).includes(bridgeStore.quoteDataService)) {
            reportData.cctp_permit = permitResultData;
          }
          if (([Service.OneClickFraxZero] as Service[]).includes(bridgeStore.quoteDataService)) {
            reportData.frax_zero_permit = permitResultData;
          }
        }

        if (isFromTron && bridgeStore.acceptTronEnergy) {
          bridgeStore.setTronTransferVisible(true, { quoteData: _quote });
          if (needsEnergy) {
            await getEnergy(fromTronParams);
          } else {
            bridgeStore.setTronTransferStep(TronTransferStepStatus.EnergyReady);
          }
          bridgeStore.setTronTransferStep(TronTransferStepStatus.WalletPrompt);

          historyStore.addHistory(localHistoryData);
          historyStore.updateStatus(_quote.data.quote.depositAddress, "CONTINUE");
          addTradeReport({
            ...reportData,
            status: 4, // continue
          });
          getPendingList();
        }

        if (_quote?.data?.sendParam?.param) {
          // proxyTransfer.recipient = depositAddress
          _quote.data.sendParam.param[1] = _quote.data.quote.depositAddress;
        }
        const hash = await ServiceMap[bridgeStore.quoteDataService].send({
          sendParam: _quote?.data?.sendParam,
          wallet: wallet.wallet,
          fromToken: walletStore.fromToken,
          depositAddress: _quote.data.quote.depositAddress,
          amountWei: _amount,
          isFromTronEnergy,
        });

        localHistoryData.txHash = hash;
        localHistoryData.time = Date.now();

        historyStore.addHistory(localHistoryData);
        historyStore.updateStatus(_quote.data.quote.depositAddress, "PENDING_DEPOSIT");

        reportData.tx_hash = hash;
        addTradeReport(reportData);
        getPendingList();
        addTrackParams.txHash = hash;
        addTransferTrack(addTrackParams);

        if (isFromTron && bridgeStore.acceptTronEnergy) {
          bridgeStore.setTronTransferStep(TronTransferStepStatus.Broadcasting);

          // polling transaction status
          let pollingResult = true;
          try {
            pollingResult = await wallet.wallet.pollingTransactionStatus(hash, {
              maxPolls: 120,
              pollInterval: 3000,
            });
          } catch (error) {
            csl("transfer", "red-500", "polling transaction status failed: %o", error);
          }
          if (!pollingResult) {
            toast.fail({
              title: "Transfer failed",
              text: hash,
            });
          }

          bridgeStore.setTronTransferVisible(false);
        }
      }
      // others transfer
      else {
        const { isContinue } = await estimateNativeTokenBalance();
        if (!isContinue) {
          throw new Error("Insufficient native token balance for transaction");
        }

        // oneclick-usdt0 permit signature
        const permitResultData = await permitSignature({ _quote });
        if (permitResultData) {
          if (([Service.FraxZeroOneClick] as Service[]).includes(bridgeStore.quoteDataService)) {
            reportData.frax_zero_permit = permitResultData;
          }
        }

        const sendParams: any = {
          ..._quote?.data?.sendParam,
          wallet: wallet.wallet,
        };
        const hash = await ServiceMap[bridgeStore.quoteDataService].send(sendParams);
        let _depositAddress = hash;
        if (isQuoteParamDepositAddress) {
          _depositAddress = _quote?.data?.quoteParam?.depositAddress || hash;
        }
        localHistoryData.txHash = hash;
        localHistoryData.toChainTxHash = hash;
        localHistoryData.depositAddress = _depositAddress;
        reportData.deposit_address = _depositAddress;
        reportData.tx_hash = hash;

        if (bridgeStore.quoteDataService === Service.Native) {
          const quoteIds = _quote?.data?.orders?.map?.((order: any) => order.quoteId) || [];
          localHistoryData.quoteIds = quoteIds;
          reportData.quoteIds = quoteIds;
        }

        historyStore.addHistory(localHistoryData);
        historyStore.updateStatus(hash, "PENDING_DEPOSIT");

        addTradeReport(reportData);
        getPendingList();
        addTrackParams.txHash = hash;
        addTransferTrack(addTrackParams);
      }

      bridgeStore.set({
        transferring: false,
        amount: "",
      });
      bridgeStore.clearQuoteData();
      getBalance();
      toast.success({
        title: "Transfer submitted"
      });
      // reload quotes
      // debouncedQuote({ dry: true });

    } catch (error: any) {
      console.error(error);
      bridgeStore.set({ transferring: false });
      bridgeStore.setTronTransferVisible(false);
      let _finalErrorMessage = error?.message || error?.toString?.() || "Transfer failed";
      addTrackParams.sourceErrMsg = _finalErrorMessage;
      if (
        // evm
        _finalErrorMessage.includes("user rejected action") ||
        // tron
        _finalErrorMessage.includes("Confirmation declined by user") ||
        _finalErrorMessage.includes("User denied request signature") ||
        // ton
        _finalErrorMessage.includes("Reject request")
      ) {
        _finalErrorMessage = "User rejected transaction";
      }

      // get rpc error message
      _finalErrorMessage = formatBridgeRpcErrorMessage(_finalErrorMessage);

      // get near wallet can not open error
      if (_finalErrorMessage.toLowerCase().includes("couldn't open popup window to complete wallet action")) {
        _finalErrorMessage = "Browser blocked the Wallet popup. Allow pop-ups for stableflow and try again.";
      }

      toast.fail({
        title: _finalErrorMessage,
      });
      addTrackParams.errMsg = _finalErrorMessage;
      addTransferTrack(addTrackParams);
    }
  };

  // Clear recipient address when target chain changes
  useEffect(() => {
    if (prevToTokenRef.current && walletStore.toToken) {
      // Check if the target chain actually changed (compare by chainName or chainId)
      const prevChainId = prevToTokenRef.current?.chainId;
      const currentChainId = walletStore.toToken?.chainId;
      const prevChainName = prevToTokenRef.current?.chainName;
      const currentChainName = walletStore.toToken?.chainName;

      if (
        (prevChainId && currentChainId && prevChainId !== currentChainId) ||
        (prevChainName && currentChainName && prevChainName !== currentChainName)
      ) {
        // Target chain changed, clear recipient address
        bridgeStore.set({ recipientAddress: "" });
      }
    }
    // Update ref to current toToken
    prevToTokenRef.current = walletStore.toToken;
  }, [walletStore.toToken]);

  // Validate address when recipient address or target chain changes
  useEffect(() => {
    if (bridgeStore.recipientAddress && walletStore.toToken) {
      const validation = validateAddress(
        bridgeStore.recipientAddress,
        walletStore.toToken.chainType
      );
      setAddressValidation(validation);
    }
  }, [bridgeStore.recipientAddress, walletStore.toToken]);

  // Amount validation and handler
  const validateAmount = (value: string): string => {
    if (!value || !value.trim()) {
      return "Amount is required";
    }

    const numValue = parseFloat(value);

    if (isNaN(numValue)) {
      return "Please enter a valid number";
    }

    if (Big(numValue).lt(TRANSFER_MIN_AMOUNT)) {
      return `Amount is too low, at least ${TRANSFER_MIN_AMOUNT}`;
    }

    // Check for too many decimal places (max 6 for most tokens)
    const decimalPlaces = (value.split(".")[1] || "").length;
    if (decimalPlaces > walletStore.fromToken.decimals) {
      return `Maximum ${walletStore.fromToken.decimals} decimal places allowed`;
    }

    // Check balance if wallet and token are available
    if (walletStore.fromToken && walletStore.toToken && wallets) {
      try {
        const balance =
          balancesStore[
          `${walletStore.fromToken.chainType}Balances` as keyof BalancesState
          ]?.[walletStore.fromToken.chainId || walletStore.fromToken.blockchain]?.[walletStore.fromToken.contractAddress] || 0;

        if (Big(value).gt(balance)) {
          return `Insufficient balance`;
        }
      } catch (error) {
        console.error("Error checking balance:", error);
        return "Failed to check balance";
      }
    }

    return "";
  };

  // Wrap quote function to generate a new request ID on each call
  const quoteWithRequestId = async (params: { dry: boolean; from?: string; }, isSync?: boolean) => {
    csl("Trigger quote with request id", "purple-600", "from: %o", params.from)
    // Generate a new request ID
    requestIdRef.current += 1;
    const currentRequestId = requestIdRef.current;
    return quote({ dry: params.dry }, isSync, currentRequestId);
  };

  const { run: debouncedQuote, cancel: cancelQuote } = useDebounceFn(quoteWithRequestId, {
    wait: 1000
  });

  // Re-validate amount when token or chain changes
  useEffect(() => {
    if (bridgeStore.amount && walletStore.fromToken) {
      const error = validateAmount(bridgeStore.amount);
      setAmountError(error);
    }
  }, [
    walletStore.fromToken,
    bridgeStore.amount,
    balancesStore,
  ]);

  useEffect(() => {
    if (allTokensEnabled) return;
    // Only trigger quote if both tokens have selected a specific chain (have chainType)
    // Don't trigger quote when just switching token type (USDT/USDC) without selecting a chain
    if (!walletStore.fromToken?.chainType || !walletStore.toToken?.chainType) {
      cancelQuote();
      bridgeStore.clearQuoteData();
      return;
    }
    cancelQuote();
    debouncedQuote({ dry: true, from: "effect" });
  }, [
    walletStore.fromToken,
    walletStore.toToken,
    bridgeStore.amount,
    bridgeStore.recipientAddress,
    amountError,
    addressValidation,
    fromWalletAddress,
    toWalletAddress,
    // Re-request quote when slippage changes
    configStore.slippage,
    allTokensEnabled,
  ]);

  // button status check
  useEffect(() => {
    const check = () => {
      if (!walletStore.fromToken?.contractAddress) {
        return "Select source chain";
      }
      if (!walletStore.toToken?.contractAddress) {
        return "Select destination chain";
      }
      if (!bridgeStore.amount) {
        return "Please enter amount";
      }
      // const validQuote = Array.from(bridgeStore.quoteDataMap.values()).filter((quote) => !quote.errMsg);
      // if (!bridgeStore.getQuoting() && validQuote.length <= 0) {
      //   return "No routes found";
      // }
      if (bridgeStore.quoteDataMap?.get(bridgeStore.quoteDataService)?.errMsg) {
        return bridgeStore.quoteDataMap?.get(bridgeStore.quoteDataService)?.errMsg;
      }
      if (
        walletStore.fromToken.chainType === "evm" &&
        walletStore.fromToken.chainId !== walletStore.fromToken.chainId
      ) {
        return "Select source chain";
      }
      if (
        walletStore.fromToken?.chainType === "evm" &&
        (
          walletStore.fromToken?.chainId !== wallets.evm?.chainId ||
          (evmAccount && walletStore.fromToken?.chainId !== evmAccount.chainId)
        )
      ) {
        setErrorChain(walletStore.fromToken.chainId);
      } else {
        setErrorChain(0);
      }
      if (amountError) {
        return amountError;
      }
      if (
        Object.values(BridgeDefaultWallets).includes(fromWalletAddress || "")
      ) {
        return "Refund wallet not connected";
      }
      if (Object.values(BridgeDefaultWallets).includes(toWalletAddress || "")) {
        return "Recipient address is empty";
      }
      if (!addressValidation.isValid && bridgeStore.recipientAddress && addressValidation.error) {
        return addressValidation.error;
      }

      const quoteData = bridgeStore.quoteDataMap?.get(bridgeStore.quoteDataService);
      const priceImpact = quoteData?.priceImpact;
      if (priceImpact) {
        if (Big(priceImpact || 0).gt(PRICE_IMPACT_THRESHOLD) && !bridgeStore.acceptPriceImpact) {
          return "Large Price Impact";
        }
      }
      if (quoteData?.routeDisabled) {
        return "This route is temporarily unavailable";
      }

      const { isExactOutput, isPermitWithNonce } = getQuoteModes({
        quoteData,
        bridgeStore,
      });

      if (isExactOutput) {
        const balance = balancesStore[
          `${walletStore.fromToken.chainType}Balances` as keyof BalancesState
        ]?.[walletStore.fromToken.chainId || walletStore.fromToken.blockchain]?.[walletStore.fromToken.contractAddress] || 0;
        if (Big(quoteData?.quote?.amountInFormatted || 0).gt(balance)) {
          return "Insufficient balance";
        }
      }

      if (isPermitWithNonce) {
        const specailPendingNumber = historyStore.servicePendingNumberWithPermit?.[bridgeStore.quoteDataService];
        if (specailPendingNumber && specailPendingNumber > 0) {
          return "Please wait for the previous transaction to complete";
        }
      }

      return "";
    };
    const error = check();

    bridgeStore.set({ errorTips: error });
  }, [
    amountError,
    addressValidation,
    walletStore.fromToken,
    bridgeStore.amount,
    walletStore.toToken,
    bridgeStore.quoteDataMap,
    bridgeStore.quoteDataService,
    bridgeStore.acceptPriceImpact,
    bridgeStore.quotingMap,
    fromWalletAddress,
    toWalletAddress,
    wallets.evm?.chainId,
    evmAccount?.chainId,
    balancesStore,
    historyStore.servicePendingNumberWithPermit
  ]);

  useEffect(() => {
    const allQuoteList = Array.from(bridgeStore.quoteDataMap.entries());
    const validQuoteList = Array.from(bridgeStore.quoteDataMap.entries()).filter(([_, data]) => !data.errMsg);
    const isQuoting = bridgeStore.getQuoting();

    if (bridgeStore.transferring || isQuoting || !isAutoSelect) {
      return;
    }

    if (!validQuoteList.length) {
      if (allQuoteList?.[0]?.[0]) {
        bridgeStore.set({ quoteDataService: allQuoteList[0][0], showFee: false });
      }
      setAutoSelect(false);
      return;
    }

    // Auto-select the best quote as soon as any quote is available
    // This allows immediate selection when first request completes, and updates when better quotes arrive
    if (validQuoteList.length === 1) {
      bridgeStore.set({ quoteDataService: validQuoteList[0][0], showFee: true });
      csl("QuoteRoutes", "pink-950", "Quote Sorted Result: %o", validQuoteList);
      setAutoSelect(false);
      return;
    }
    // sort and select the best one
    const sortedQuoteData = sortQuoteData(bridgeStore.quoteDataMap);
    csl("QuoteRoutes", "pink-950", "Quote Sorted Result: %o", sortedQuoteData);
    bridgeStore.set({ quoteDataService: sortedQuoteData[0][0], showFee: true });
    setAutoSelect(false);
  }, [
    bridgeStore.transferring,
    bridgeStore.quoteDataMap,
    bridgeStore.quotingMap,
    isAutoSelect,
  ]);

  // Auto requote for CCTP from Solana USDC to any chain USDC
  useEffect(() => {
    // Check conditions: from Solana USDC to any chain USDC
    const isFromSolanaUSDC =
      walletStore.fromToken?.chainType === "sol" &&
      walletStore.fromToken?.symbol === "USDC";
    const isToUSDC = walletStore.toToken?.symbol === "USDC";

    // Check if quote is completed (not quoting and has quote data)
    const isQuoting = Array.from(bridgeStore.quotingMap.values()).some(Boolean);
    const hasQuoteData = bridgeStore.quoteDataMap.size > 0;

    // Check if quote just completed (was quoting, now not quoting)
    const quoteJustCompleted = prevQuotingRef.current && !isQuoting;

    // Update previous quoting state
    prevQuotingRef.current = isQuoting;

    // Clear existing timer if conditions no longer met
    if (
      !isFromSolanaUSDC ||
      !isToUSDC ||
      bridgeStore.transferring ||
      isQuoting ||
      !hasQuoteData
    ) {
      if (autoRequoteTimerRef.current) {
        clearTimeout(autoRequoteTimerRef.current);
        autoRequoteTimerRef.current = null;
      }
      return;
    }

    // Only start timer when quote just completed (not on every render)
    if (quoteJustCompleted && !autoRequoteTimerRef.current) {
      // Start timer to auto requote after CCTP_AUTO_REQUOTE_DURATION
      autoRequoteTimerRef.current = setTimeout(() => {
        // Only requote if still not transferring and conditions still met
        if (
          !bridgeStore.transferring &&
          walletStore.fromToken?.chainType === "sol" &&
          walletStore.fromToken?.symbol === "USDC" &&
          walletStore.toToken?.symbol === "USDC"
        ) {
          csl("autoRequote", "gray-800", "Auto requoting after %s ms", CCTP_AUTO_REQUOTE_DURATION);
          debouncedQuote({ dry: true, from: "requote for CCTP from Solana USDC" });
        }
        // Clear timer ref after execution
        autoRequoteTimerRef.current = null;
      }, CCTP_AUTO_REQUOTE_DURATION);
    }

    // Cleanup timer on unmount
    return () => {
      if (autoRequoteTimerRef.current) {
        clearTimeout(autoRequoteTimerRef.current);
        autoRequoteTimerRef.current = null;
      }
    };
  }, [
    bridgeStore.transferring,
    bridgeStore.quotingMap,
    bridgeStore.quoteDataMap,
    walletStore.fromToken?.chainType,
    walletStore.fromToken?.symbol,
    walletStore.toToken?.symbol,
    debouncedQuote,
  ]);

  const onRefreshQuote = () => {
    if (bridgeStore.getQuoting()) return;
    void quoteWithRequestId({ dry: true, from: "refresh" });
  };

  return {
    quote,
    transfer,
    errorChain,
    addressValidation,
    onRefreshQuote,
  };
}
