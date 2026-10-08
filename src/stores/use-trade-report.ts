import axios from "axios";
import { v4 as uuidV4 } from "uuid";
import { create } from "zustand";
import { createJSONStorage, persist } from "zustand/middleware";
import { STABLECOIN_TRADE_TYPE } from "@/all-tokens/config";
import { BASE_API_URL } from "@/config/api";
import { csl } from "@/utils/log";

const TRADE_REPORT_STORAGE_KEY = "stableflow_trade_report_queue";
const TRADE_REPORT_BASE_RETRY_MS = 5000;

export interface TradeReportItem {
  id: string;
  payload: Record<string, any>;
  createdAt: number;
}

interface TradeReportState {
  queue: TradeReportItem[];
  enqueue: (item: TradeReportItem) => void;
  remove: (id: string) => void;
}

interface TaskMeta {
  inFlight: boolean;
  timer?: ReturnType<typeof setTimeout>;
}

const taskMetaMap = new Map<string, TaskMeta>();

const getRetryDelay = (retryCount: number) => TRADE_REPORT_BASE_RETRY_MS * Math.pow(2, retryCount);

const clearTaskMeta = (id: string) => {
  const meta = taskMetaMap.get(id);
  if (meta?.timer) {
    clearTimeout(meta.timer);
  }
  taskMetaMap.delete(id);
};

const scheduleRetry = (id: string, payload: Record<string, any>, retryCount: number) => {
  const delay = getRetryDelay(retryCount);
  const meta = taskMetaMap.get(id) ?? { inFlight: false };
  if (meta.timer) {
    clearTimeout(meta.timer);
  }
  meta.timer = setTimeout(() => {
    const currentMeta = taskMetaMap.get(id);
    if (currentMeta) {
      currentMeta.timer = undefined;
      taskMetaMap.set(id, currentMeta);
    }
    void processReport(id, payload, retryCount + 1);
  }, delay);
  taskMetaMap.set(id, meta);
};

const processReport = async (id: string, payload: Record<string, any>, retryCount = 0) => {
  const meta = taskMetaMap.get(id);
  if (meta?.inFlight) {
    return;
  }

  taskMetaMap.set(id, {
    ...meta,
    inFlight: true,
  });

  try {
    await axios.post(`${BASE_API_URL}/v1/trade/add`, payload);
    useTradeReportStore.getState().remove(id);
    clearTaskMeta(id);
  } catch (error) {
    csl("trade report", "red-500", "report failed, id: %s, retryCount: %o, error: %o", id, retryCount, error);
    taskMetaMap.set(id, {
      ...(taskMetaMap.get(id) ?? {}),
      inFlight: false,
    });
    scheduleRetry(id, payload, retryCount);
  }
};

export const useTradeReportStore = create(persist<TradeReportState>(
  (set) => ({
    queue: [],
    enqueue: (item) => {
      set((state) => ({
        queue: [...state.queue, item],
      }));
    },
    remove: (id) => {
      set((state) => ({
        queue: state.queue.filter((item) => item.id !== id),
      }));
    },
  }),
  {
    name: TRADE_REPORT_STORAGE_KEY,
    version: 0.1,
    storage: createJSONStorage(() => localStorage),
    partialize: (state) => ({ queue: state.queue }) as TradeReportState,
  },
));

export const addTradeReport = (payload: Record<string, any>) => {
  const item: TradeReportItem = {
    id: uuidV4(),
    payload: {
      type: STABLECOIN_TRADE_TYPE,
      ...payload,
    },
    createdAt: Date.now(),
  };
  useTradeReportStore.getState().enqueue(item);
  void processReport(item.id, item.payload, 0);
};

export const processAllPendingTradeReports = () => {
  const { queue } = useTradeReportStore.getState();
  queue.forEach((item) => {
    const meta = taskMetaMap.get(item.id);
    if (meta?.inFlight || meta?.timer) {
      return;
    }
    void processReport(item.id, item.payload, 0);
  });
};

