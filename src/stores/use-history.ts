import { Service } from "@/services/constants";
import { create } from "zustand";
import { createJSONStorage, persist } from "zustand/middleware";

export type HistoryMode = "stablecoin" | "allTokens";

type HistoryBucket = {
  history: Record<string, any>;
  status: Record<string, any>;
  pendingStatus: any[];
  completeStatus: any[];
  latestHistories: string[];
  pendingNumber: number;
  servicePendingNumber: Partial<Record<Service, number>>;
  servicePendingNumberWithPermit: Partial<Record<Service, number>>;
};

const emptyBucket = (): HistoryBucket => ({
  history: {},
  status: {},
  pendingStatus: [],
  completeStatus: [],
  latestHistories: [],
  pendingNumber: 0,
  servicePendingNumber: {},
  servicePendingNumberWithPermit: {},
});

const bucketFrom = (state: Partial<HistoryBucket> | undefined): HistoryBucket => ({
  history: state?.history ?? {},
  status: state?.status ?? {},
  pendingStatus: state?.pendingStatus ?? [],
  completeStatus: state?.completeStatus ?? [],
  latestHistories: state?.latestHistories ?? [],
  pendingNumber: state?.pendingNumber ?? 0,
  servicePendingNumber: state?.servicePendingNumber ?? {},
  servicePendingNumberWithPermit: state?.servicePendingNumberWithPermit ?? {},
});

interface HistoryState extends HistoryBucket {
  mode: HistoryMode;
  buckets: Record<HistoryMode, HistoryBucket>;
  openDrawer: boolean;
  pendingRefreshNonce: number;
  setOpenDrawer: (open?: boolean) => void;
  addHistory: (item: any) => void;
  updateStatus: (address: string, status: any) => void;
  closeLatestHistory: (address?: string) => void;
  updateHistory: (address?: string, item?: any) => void;
  updatePendingNumber: (number: number) => void;
  requestPendingRefresh: () => void;
  activate: (mode: HistoryMode) => void;
  updateServicePendingNumber: (params: { services?: Partial<Record<Service, number>>; isClear?: boolean }) => void;
  updateServicePendingNumberWithPermit: (params: { services?: Partial<Record<Service, number>>; isClear?: boolean }) => void;
}

const writeBucket = (
  set: (partial: Partial<HistoryState>) => void,
  get: () => HistoryState,
  bucket: HistoryBucket,
) => {
  const mode = get().mode;
  set({
    ...bucket,
    buckets: {
      ...get().buckets,
      [mode]: bucket,
    },
  });
};

export const useHistoryStore = create(
  persist<HistoryState>(
    (set, get) => ({
      mode: "stablecoin",
      buckets: {
        stablecoin: emptyBucket(),
        allTokens: emptyBucket(),
      },
      ...emptyBucket(),
      openDrawer: false,
      pendingRefreshNonce: 0,
      activate: (mode) => {
        if (get().mode === mode) return;
        const saved = bucketFrom(get());
        const buckets = {
          ...get().buckets,
          [get().mode]: saved,
        };
        const next = buckets[mode] ?? emptyBucket();
        set({
          mode,
          buckets: {
            ...buckets,
            [mode]: next,
          },
          ...next,
        });
      },
      addHistory: (item: any) => {
        const current = bucketFrom(get());
        writeBucket(set, get, {
          ...current,
          history: {
            ...current.history,
            [item.depositAddress]: item,
          },
          latestHistories: [item.depositAddress],
        });
      },
      updateStatus: (address: string, status: any) => {
        if (!address) return;
        const current = bucketFrom(get());
        const pendingStatus = [...current.pendingStatus];
        const completeStatus = [...current.completeStatus];
        const nextStatus = { ...current.status, [address]: status };
        const index = pendingStatus.indexOf(address);

        if (status === "PENDING_DEPOSIT" || status === "PROCESSING") {
          if (index === -1) pendingStatus.unshift(address);
        } else {
          if (index !== -1) pendingStatus.splice(index, 1);
          if (!completeStatus.includes(address)) completeStatus.unshift(address);
        }

        writeBucket(set, get, {
          ...current,
          pendingStatus,
          completeStatus,
          status: nextStatus,
        });
      },
      setOpenDrawer: (open?: boolean) => {
        set({ openDrawer: open || false });
      },
      closeLatestHistory: (address) => {
        const current = bucketFrom(get());
        if (!address) {
          writeBucket(set, get, { ...current, latestHistories: [] });
          return;
        }
        const latestHistories = current.latestHistories.filter((item) => item !== address);
        writeBucket(set, get, { ...current, latestHistories });
      },
      updateHistory: (address, item) => {
        if (!address || !item) return;
        const current = bucketFrom(get());
        if (!current.history[address]) return;
        writeBucket(set, get, {
          ...current,
          history: {
            ...current.history,
            [address]: {
              ...current.history[address],
              ...item,
            },
          },
        });
      },
      updatePendingNumber: (number: number) => {
        writeBucket(set, get, { ...bucketFrom(get()), pendingNumber: number });
      },
      requestPendingRefresh: () => {
        set({ pendingRefreshNonce: get().pendingRefreshNonce + 1 });
      },
      updateServicePendingNumber: (params) => {
        const current = bucketFrom(get());
        writeBucket(set, get, {
          ...current,
          servicePendingNumber: params.isClear ? {} : { ...(params.services ?? {}) },
        });
      },
      updateServicePendingNumberWithPermit: (params) => {
        const current = bucketFrom(get());
        writeBucket(set, get, {
          ...current,
          servicePendingNumberWithPermit: params.isClear ? {} : { ...(params.services ?? {}) },
        });
      },
    }),
    {
      name: "_history",
      version: 0.2,
      storage: createJSONStorage(() => localStorage),
      partialize: (state) => {
        const { pendingRefreshNonce: _nonce, ...rest } = state;
        return rest as HistoryState;
      },
      migrate: (persisted: any, version) => {
        if (!persisted || version >= 0.2 && persisted.buckets) return persisted;
        const stablecoin = bucketFrom(persisted);
        return {
          ...persisted,
          mode: "stablecoin",
          buckets: {
            stablecoin,
            allTokens: emptyBucket(),
          },
          ...stablecoin,
          openDrawer: persisted.openDrawer ?? false,
        };
      },
    }
  )
);
