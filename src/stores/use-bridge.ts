import { create } from "zustand/index";
import { Service } from "@/services/constants";
import { TronTransferStepStatus } from "@/config/tron";
import type { QuoteErrorLevel } from "@/services/quote-error";

export interface BridgeState {
  amount: string;
  recipientAddress: string;
  quoteDataService: Service;
  quoteDataMap: Map<string, any>;
  quotingMap: Map<string, Record<string, boolean>>;
  transferring: boolean;
  errorTips: string;
  showFee: boolean;
  showRoutes: boolean;
  shouldAutoSelect: boolean;
  acceptPriceImpact: boolean;
  set: (params: any) => void;
  setQuoteData: (key: string, value: any) => void;
  modifyQuoteData: (key: string, value: any) => void;
  clearQuoteData: () => void;
  setQuoting: (key: string, requestId: number, value: boolean) => void;
  getQuoting: (key?: string) => boolean;
  setAcceptPriceImpact: (value: boolean) => void;

  // tron energy rental
  tronTransferVisible: boolean;
  tronTransferQuoteData?: any;
  tronTransferStep: TronTransferStepStatus;
  setTronTransferVisible: (value: boolean, params?: { quoteData: any; }) => void;
  setTronTransferStep: (step: TronTransferStepStatus) => void;
  acceptTronEnergy: boolean;
  setAcceptTronEnergy: (value: boolean) => void;
}

const useBridgeStore = create<BridgeState>((set, get) => ({
  amount: "",
  recipientAddress: "",
  quoteDataService: Service.OneClick,
  quoteDataMap: new Map(),
  quotingMap: new Map(),
  transferring: false,
  errorTips: "",
  showFee: false,
  showRoutes: true,
  shouldAutoSelect: false,
  acceptPriceImpact: true,
  set: (params) => set(() => ({ ...params })),
  setQuoteData: (key, value) => {
    set((state) => {
      const _quoteDataMap = new Map(state.quoteDataMap);
      _quoteDataMap.set(key, value);
      return { ...state, quoteDataMap: _quoteDataMap };
    });
  },
  modifyQuoteData: (key, value) => {
    set((state) => {
      const _quoteDataMap = new Map(state.quoteDataMap);
      _quoteDataMap.set(key, {
        ..._quoteDataMap.get(key),
        ...value,
      });
      return { ...state, quoteDataMap: _quoteDataMap };
    });
  },
  clearQuoteData: () => {
    set((state) => {
      return {
        ...state,
        quoteDataMap: new Map(),
      };
    });
  },
  setQuoting: (key, requestId, value) => {
    set((state) => {
      const _quotingMap = new Map(state.quotingMap);
      if (_quotingMap.has(key)) {
        const _quoting = _quotingMap.get(key);
        if (value) {
          _quoting![requestId] = value;
        } else {
          delete _quoting![requestId];
        }
        _quotingMap.set(key, _quoting!);
      } else {
        _quotingMap.set(key, { [requestId]: value });
      }
      return { ...state, quotingMap: _quotingMap };
    });
  },
  getQuoting: (key) => {
    const _quotingMap = get().quotingMap;
    if (!key) {
      return Array.from(_quotingMap.values()).some((record) => {
        const requestIds = Object.keys(record);
        if (requestIds.length === 0) return false;
        const maxRequestId = String(Math.max(...requestIds.map(Number)));
        return record[maxRequestId] === true;
      });
    }
    const _quoting = _quotingMap.get(key);
    if (!_quoting) return false;
    const requestIds = Object.keys(_quoting);
    if (requestIds.length === 0) return false;
    const maxRequestId = String(Math.max(...requestIds.map(Number)));
    return _quoting[maxRequestId] === true;
  },
  setAcceptPriceImpact: (value) => {
    set((state) => {
      return { ...state, acceptPriceImpact: value };
    });
  },

  // tron energy rental
  tronTransferVisible: false,
  tronTransferQuoteData: null,
  tronTransferStep: TronTransferStepStatus.EnergyPayment,
  setTronTransferVisible: (visible, params) => {
    set((state) => {
      return {
        ...state,
        // reset step to initial
        tronTransferStep: TronTransferStepStatus.EnergyPayment,
        tronTransferVisible: visible,
        tronTransferQuoteData: params?.quoteData ?? null,
      };
    });
  },
  setTronTransferStep: (step) => {
    set((state) => {
      return {
        ...state,
        tronTransferStep: step,
      };
    });
  },
  acceptTronEnergy: true,
  setAcceptTronEnergy: (value) => {
    set((state) => {
      return { ...state, acceptTronEnergy: value };
    });
  },
}));

export default useBridgeStore;


export interface QuoteData {
  type: Service;
  errMsg?: string;
  errLevel?: QuoteErrorLevel;
  data?: any;
}
