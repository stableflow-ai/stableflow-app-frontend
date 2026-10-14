import { BridgeDefaultWallets } from "@/config";
import { BASE_API_URL } from "@/config/api";
import { OneClickSwapType, Service, ServiceBackend } from "@/services/constants";
import { getQuoteModes } from "@/services/utils";
import { useTrackStore } from "@/stores/use-track";
import useWalletStore from "@/stores/use-wallet";
import useWalletsStore, { type WalletType } from "@/stores/use-wallets";
import { csl } from "@/utils/log";
import { useDebounceFn } from "ahooks";
import axios from "axios";
import Big from "big.js";
import { useMemo } from "react";
import { v4 as uuidv4 } from "uuid";
import useIsMobile from "./use-is-mobile";

export const TrackAction = {
  Connect: "connect_wallet",
  Open: "page_view",
  Quote: "quote_request",
  Transfer: "trade_submit",
  EnterAmount: "enter_amount",
  SetSlippage: "set_slippage",
  ExternalLinkClick: "external_link_click",
  History: "history_page",
  CreateSolanaATA: "create_solana_ata",
  Disconnect: "logout_wallet",
  ProphetEntrance: "prophet_entrance",
  SolanaBroadcast: "solana_broadcast",
} as const;
export type TrackAction = (typeof TrackAction)[keyof typeof TrackAction];

interface TrackParams {
  action: TrackAction;
  route?: string;
  content?: string;
  address?: string;
}

type JSONLeaf = string | number | boolean | null;
type JSONObject = { [key: string]: JSONValue };
type JSONArray = JSONValue[];
type JSONValue = JSONLeaf | JSONObject | JSONArray;
type JSONContainer = JSONObject | JSONArray;

const TRACK_CONTENT_LIMIT = 5000;
const TRACK_ERROR_LIMIT = 1500;

/** Keep the revert or reason sentence and drop calldata plus stack frames. */
const compactTrackedError = (message: string) => {
  const withoutStack = message.split(/\n\s*at\s+/)[0] ?? message;
  const withoutCalldata = withoutStack.split(/transaction=\{/i)[0] ?? withoutStack;
  const reverted = withoutCalldata.match(/execution reverted(?::[^\n.]*)?/i)?.[0];
  const reason = withoutCalldata.match(/\breason(?:=|:)\s*[^,}\n]+/i)?.[0];
  const compact = (reverted || reason || withoutCalldata).replace(/\s+/g, " ").trim();
  return compact.slice(0, TRACK_ERROR_LIMIT);
};

const compactTrackedContent = (content: string) => {
  let next = content;
  try {
    const parsed = JSON.parse(content) as unknown;
    const visit = (value: unknown): unknown => {
      if (Array.isArray(value)) return value.map(visit);
      if (!value || typeof value !== "object") return value;
      const record = value as Record<string, unknown>;
      const nextRecord: Record<string, unknown> = {};
      for (const [key, child] of Object.entries(record)) {
        if (
          (key === "error_message" || key === "source_error_message") &&
          typeof child === "string"
        ) {
          nextRecord[key] = compactTrackedError(child);
        } else {
          nextRecord[key] = visit(child);
        }
      }
      return nextRecord;
    };
    next = JSON.stringify(visit(parsed));
  } catch {
    next = content;
  }
  return next.length > TRACK_CONTENT_LIMIT ? next.slice(0, TRACK_CONTENT_LIMIT) : next;
};

/**
 * Non-hook reporting channel, usable from stores and background tasks.
 * Returns whether the event reached the backend so callers can queue and retry.
 */
export async function trackEvent(params: TrackParams): Promise<boolean> {
  const { sessionId, initSessionId } = useTrackStore.getState();

  let _sessionId = sessionId;
  if (!_sessionId) {
    _sessionId = uuidv4();
    initSessionId(_sessionId);
    csl("useTrack", "yellow-700", "init session id: %o", _sessionId);
  }

  try {
    await axios.post(`${BASE_API_URL}/v1/track`, {
      source: "stableflow",
      session_id: _sessionId,
      ...params,
      ...(typeof params.content === "string"
        ? { content: compactTrackedContent(params.content) }
        : {}),
    });
    return true;
  } catch (error) {
    csl("useTrack", "red-500", "report track failed: %o", error);
    return false;
  }
}

export function useTrack(props?: { isRoot?: boolean; }) {
  const { isRoot } = props ?? {};

  const { sessionId } = useTrackStore();
  const wallets = useWalletsStore();
  const walletStore = useWalletStore();
  const isMobile = useIsMobile();

  const [accounts, _accountAddresses, accountAddressesStr] = useMemo(() => {
    const _connectedWallets = Object.entries(wallets)
      .filter(([chainType]) => !["set"].includes(chainType));
    const __accounts = _connectedWallets
      .map(([chainType, wallet]) => ({
        chain_type: chainType,
        address: wallet.account,
        wallet_name: wallet.walletName,
      }))
      .filter((wallet) => !!wallet.address);
    const __accountAddresses = __accounts.map((account: any) => account.address);
    return [__accounts, __accountAddresses, __accountAddresses.join(",")];
  }, [wallets]);

  const add = (params: TrackParams) => trackEvent(params);

  const checkIsValidAddress = (addr?: string) => {
    if (!addr) return false;
    const defaultWalletAddress = Object.values(BridgeDefaultWallets);
    if (defaultWalletAddress.some((_addr) => _addr.toLowerCase() === addr.toLowerCase())) {
      return false;
    }
    return true;
  };

  const toSnakeCase = (str: string): string => {
    try {
      return str.replace(/[A-Z]/g, (letter) => `_${letter.toLowerCase()}`);
    } catch {
      return str;
    }
  };

  const transformObject = (obj: any): any => {
    try {
      if (obj === null || typeof obj !== 'object') {
        if (typeof obj === 'bigint') {
          return obj.toString();
        }
        return obj;
      }

      if (Array.isArray(obj)) {
        return obj.map(v => transformObject(v));
      }

      return Object.keys(obj).reduce((acc, key) => {
        const snakeKey = toSnakeCase(key);
        const value = obj[key];

        acc[snakeKey] = transformObject(value);

        return acc;
      }, {} as Record<string, any>);
    } catch {
      return obj;
    }
  }

  const formatQuoteData = (quoteData: any, service: Service | string) => {
    try {
      const {
        fromToken,
        toToken,
        amountWei,
        recipient,
        refundTo,
        slippageTolerance,
        dry,
      } = quoteData?.quoteParam ?? {};
      const { depositAddress } = quoteData?.quote ?? {};
      const { appFees } = quoteData?.quoteRequest ?? {};

      const feeDetail = { ...quoteData?.fees };

      const originWalletName = accounts.find((account) => account.chain_type === fromToken?.chainType)?.wallet_name;

      const quoteDataResult: any = {
        estimate_time: quoteData?.estimateTime ?? 0,
        output_amount: quoteData?.outputAmount ?? "0",
        input_amount: Big(amountWei || 0).div(10 ** (fromToken?.decimals || 6)).toFixed(fromToken?.decimals || 6, Big.roundDown),
        recipient: checkIsValidAddress(recipient) ? recipient : "",
        refund_to: checkIsValidAddress(refundTo) ? refundTo : "",
        slippage: slippageTolerance,
        from_chain: fromToken?.blockchain,
        from_token: {
          symbol: fromToken?.symbol,
          address: fromToken?.contractAddress,
          decimals: fromToken?.decimals,
          chain: fromToken?.blockchain,
          chain_type: fromToken?.chainType,
        },
        to_chain: toToken?.blockchain,
        to_token: {
          symbol: toToken?.symbol,
          address: toToken?.contractAddress,
          decimals: toToken?.decimals,
          chain: toToken?.blockchain,
          chain_type: toToken?.chainType,
        },
        estimate_from_gas: quoteData?.estimateSourceGas?.toString() ?? "0",
        // exclude estimate_from_gas
        total_fees_usd: quoteData?.totalFeesUsd ?? "0",
        fees: transformObject(feeDetail),
        deposit_address: depositAddress,
        dry,
        app_fees: appFees,
        wallet_name: originWalletName,
      };

      const { isOneClickService } = getQuoteModes({
        quoteData,
        bridgeStore: ({ quoteDataService: service } as any),
      });

      const getOneClickSwapType = () => {
        let swap_type = OneClickSwapType.Input;
        switch (service) {
          case Service.OneClick:
            swap_type = OneClickSwapType.Input;
            break;
          case Service.OneClickUsdt0:
            swap_type = OneClickSwapType.Output;
            break;
          case Service.OneClickCCTP:
            swap_type = OneClickSwapType.Output;
            break;
          case Service.Usdt0OneClick:
            swap_type = OneClickSwapType.Flex;
            break;
          case Service.CCTPOneClick:
            swap_type = OneClickSwapType.Flex;
            break;
          case Service.OneClickFraxZero:
            swap_type = OneClickSwapType.Output;
            break;
          case Service.FraxZeroOneClick:
            swap_type = OneClickSwapType.Flex;
            break;
          default:
            break;
        }
        return swap_type;
      };

      if (isOneClickService) {
        quoteDataResult.correlation_id = quoteData?.correlationId;
        quoteDataResult.deposit_mode = "SIMPLE";
        quoteDataResult.deposit_type = "ORIGIN_CHAIN";
        quoteDataResult.recipient_type = "DESTINATION_CHAIN";
        quoteDataResult.quoteWaiting_time_ms = 3000;
        quoteDataResult.referral = "stableflow";
        quoteDataResult.swap_type = getOneClickSwapType();
        quoteDataResult.quoteRequest = quoteData?.quoteRequest;
        quoteDataResult.quote = quoteData?.quote;
        quoteDataResult.signature = quoteData?.signature;
        quoteDataResult.timestamp = quoteData?.timestamp;
      }

      return quoteDataResult;
    } catch {
      return {};
    }
  };

  const fromTokenAddress = useMemo(() => {
    return wallets?.[walletStore.fromToken?.chainType as WalletType]?.account ?? "";
  }, [walletStore.fromToken, wallets]);

  const addOpen = () => {
    return add({ action: TrackAction.Open });
  };

  const addConnect = (params: { address: string; walletName?: string | null; walletType?: string; }) => {
    return add({
      action: TrackAction.Connect,
      address: params.address,
      content: JSON.stringify([
        {
          address: params.address,
          chain_type: params.walletType,
          wallet_name: params.walletName,
        },
      ]),
    });
  };

  const addQuote = (params: { quoteData: any; service: Service | string; }) => {
    const { quoteData, service } = params;

    const { errMsg } = quoteData ?? {};
    const { refundTo } = quoteData?.quoteParam ?? {};

    const reportContent: any = {
      route: ServiceBackend[service as Service],
      is_mobile: isMobile,
      ...formatQuoteData(quoteData, service),
    };

    // quote failed
    if (errMsg) {
      reportContent.error_message = errMsg;
    }
    const reportParams: any = {
      action: TrackAction.Quote,
      content: JSON.stringify(reportContent),
    };
    if (checkIsValidAddress(refundTo)) {
      reportParams.addresss = refundTo;
    }
    return add(reportParams);
  };

  const addTransfer = (
    params: {
      type: "transfer_button" | "continue_button";
      quoteData?: any;
      service: Service | string;
      errMsg?: string;
      sourceErrMsg?: string;
      txHash?: string;
    }
  ) => {
    const { type, quoteData, service, errMsg, sourceErrMsg, txHash } = params;

    const reportContent: any = {
      type,
      tx_hash: txHash,
      route: ServiceBackend[service as Service],
      is_mobile: isMobile,
      ...formatQuoteData(quoteData, service),
    };
    if (errMsg) {
      reportContent.error_message = errMsg;
    }
    if (sourceErrMsg) {
      reportContent.source_error_message = sourceErrMsg;
    }

    return add({
      action: TrackAction.Transfer,
      address: checkIsValidAddress(quoteData?.quoteParam?.refundTo) ? quoteData?.quoteParam?.refundTo : "",
      content: JSON.stringify(reportContent),
    });
  };

  const { run: addEnterAmount } = useDebounceFn((params: { amount?: string; }) => {
    const { amount } = params ?? {};
    return add({
      action: TrackAction.EnterAmount,
      address: fromTokenAddress,
      content: JSON.stringify({
        amount: amount ?? "",
      }),
    });
  }, { wait: 1000 });

  const addSetSlippage = (params: { value?: string; }) => {
    const { value } = params ?? {};
    return add({
      action: TrackAction.SetSlippage,
      address: fromTokenAddress,
      content: JSON.stringify({
        value: value ?? "",
      }),
    });
  };

  const addExternalLinkClick = (params: { link: string; }) => {
    const { link } = params ?? {};
    return add({
      action: TrackAction.ExternalLinkClick,
      address: fromTokenAddress,
      content: JSON.stringify({
        link: link,
      }),
    });
  };

  const addHistory = (params: { type: "click" | "view" }) => {
    const { type } = params ?? {};
    return add({
      action: TrackAction.History,
      address: fromTokenAddress,
      content: JSON.stringify({
        type,
      }),
    });
  };

  const addCreateSolanaATA = (params: {
    quoteData?: any;
    service: Service;
    errMsg?: string;
  }) => {
    const { quoteData, service, errMsg } = params;

    const reportContent: any = {
      route: ServiceBackend[service as Service],
      ...formatQuoteData(quoteData, service),
    };
    if (errMsg) {
      reportContent.error_message = errMsg;
    }

    return add({
      action: TrackAction.CreateSolanaATA,
      address: checkIsValidAddress(quoteData?.quoteParam?.refundTo) ? quoteData?.quoteParam?.refundTo : "",
      content: JSON.stringify(reportContent),
    });
  };

  const addDisconnect = (params: {
    address: string;
    walletName: string | null;
    walletType: string;
  }) => {
    const { address, walletName, walletType } = params;
    return add({
      action: TrackAction.Disconnect,
      address,
      content: JSON.stringify({
        address,
        wallet_name: walletName ?? "",
        wallet_type: walletType,
      }),
    });
  };

  const addProphetEntrance = () => {
    return add({
      action: TrackAction.ProphetEntrance,
      content: JSON.stringify({ is_mobile: isMobile }),
    });
  };

  return {
    sessionId,
    add,
    addOpen,
    addConnect,
    addQuote,
    addTransfer,
    addEnterAmount,
    addSetSlippage,
    addExternalLinkClick,
    addHistory,
    addCreateSolanaATA,
    addDisconnect,
    addProphetEntrance,
  };
}
