import { create } from "zustand/index";
import { Service } from "@/all-tokens/constants";

export interface BridgeState {
  amount: string;
  recipientAddress: string;
  /** Selected quote key within Rhea allQuotes */
  quoteDataService: string;
  quoteDataMap: Map<string, any>;
  quotingMap: Map<string, Record<string, boolean>>;
  transferring: boolean;
  errorTips: string;
  showFee: boolean;
  showRoutes: boolean;
  shouldAutoSelect: boolean;
  acceptPriceImpact: boolean;
  /** Last router the user manually selected (e.g. rango / nearintents) */
  lastSelectedRouter: string;
  /** Active Rhea deposit payload when swap returns deposit address */
  depositInfo: any;
  set: (params: any) => void;
  setQuoteData: (key: string, value: any) => void;
  modifyQuoteData: (key: string, value: any) => void;
  clearQuoteData: () => void;
  setQuoting: (key: string, requestId: number, value: boolean) => void;
  clearQuoting: (key?: string) => void;
  getQuoting: (key?: string) => boolean;
  setAcceptPriceImpact: (value: boolean) => void;
}

const useBridgeStore = create<BridgeState>((set, get) => ({
  amount: "",
  recipientAddress: "",
  quoteDataService: "",
  quoteDataMap: new Map(),
  quotingMap: new Map(),
  transferring: false,
  errorTips: "",
  showFee: false,
  showRoutes: true,
  shouldAutoSelect: true,
  acceptPriceImpact: true,
  lastSelectedRouter: "",
  depositInfo: null,
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
    set((state) => ({
      ...state,
      quoteDataMap: new Map(),
      quoteDataService: "",
      depositInfo: null,
    }));
  },
  setQuoting: (key, requestId, value) => {
    set((state) => {
      const _quotingMap = new Map(state.quotingMap);
      if (value) {
        // Replace entire record so stale requestIds cannot keep getQuoting() true
        _quotingMap.set(key, { [requestId]: true });
      } else {
        const _quoting = { ...(_quotingMap.get(key) || {}) };
        delete _quoting[requestId];
        _quotingMap.set(key, _quoting);
      }
      return { ...state, quotingMap: _quotingMap };
    });
  },
  clearQuoting: (key) => {
    set((state) => {
      if (!key) {
        return { ...state, quotingMap: new Map() };
      }
      const _quotingMap = new Map(state.quotingMap);
      _quotingMap.delete(key);
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
    set((state) => ({ ...state, acceptPriceImpact: value }));
  },
}));

export default useBridgeStore;

export interface QuoteData {
  type: string;
  errMsg?: string;
  data?: any;
}

export { Service };
