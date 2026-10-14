import useBridgeStore from "@/stores/use-bridge";
import { useEffect, useRef, useState } from "react";
import { EnergyAmounts, TRON_RENTAL_FEE, TRON_RENTAL_RECEIVING_ADDRESS, TronBandwidthTransderTRX, TronBandwidthTransferToken, TronTransferStepStatus } from "@/config/tron";
import Big from "big.js";
import energyService, { ENERGY_RENT_FIRST_DELAY_MS, ENERGY_RENT_POLL_INTERVAL_MS, ENERGY_RENT_STOP_CODE, ENERGY_RENT_TIMEOUT_MS, EnergyOrderStatus, EnergyOrderStatusMessage, EnergyRentError } from "@/libs/energy";
import { numberRemoveEndZero } from "@/utils/format/number";
import { csl } from "@/utils/log";

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

export function useTronEnergy(props?: any) {
  const { } = props ?? {};

  const bridgeStore = useBridgeStore();

  const { setTronTransferStep } = bridgeStore;

  const getEstimateNeedsEnergy = async (params: { wallet: any; account: string; }) => {
    const accountResources = await params.wallet.getAccountResources({ account: params.account });
    let accountTRXBalance: any;

    try {
      accountTRXBalance = await params.wallet.getBalance({ symbol: "TRX" }, params.account);
      accountTRXBalance = numberRemoveEndZero(Big(accountTRXBalance || 0).div(10 ** 6).toFixed(6));
    } catch (error) { }

    if (!accountResources.success) {
      console.warn("Failed to get account resources:", accountResources.error);
    }

    const estimatedEnergy = EnergyAmounts.New;
    const availableEnergy = accountResources.energy;
    const availableBandwidth = accountResources.bandwidth;

    csl("useTronEnergy getEstimateNeedsEnergy", "teal-500", "Estimated energy: %s, available energy: %s", estimatedEnergy, availableEnergy);
    csl("useTronEnergy getEstimateNeedsEnergy", "teal-500", "accountTRXBalance: %o", accountTRXBalance);

    const needsEnergy = availableEnergy < estimatedEnergy;
    let estimatedBandwidth = TronBandwidthTransferToken;
    // needEnergy, TronBandwidthTransderTRX + TronBandwidthTransferToken
    if (needsEnergy) {
      estimatedBandwidth = TronBandwidthTransderTRX + TronBandwidthTransferToken;
    }

    let needsBandwidthAmount = 0;
    if (availableBandwidth < TronBandwidthTransderTRX) {
      needsBandwidthAmount = TronBandwidthTransderTRX + (needsEnergy ? TronBandwidthTransferToken : 0);
    } else if (needsEnergy && availableBandwidth < TronBandwidthTransderTRX + TronBandwidthTransferToken) {
      needsBandwidthAmount = TronBandwidthTransferToken;
    }

    const needsBandwidth = estimatedBandwidth > availableBandwidth;
    const insufficientBandwidth = needsBandwidth && Big(accountTRXBalance || 0).lt(Big(estimatedBandwidth).times(10 ** 3).div(10 ** 6));

    csl("useTronEnergy getEstimateNeedsEnergy", "teal-500", "Estimated bandwidth: %s, available bandwidth: %s", estimatedBandwidth, availableBandwidth);
    csl("useTronEnergy getEstimateNeedsEnergy", "teal-500", "bandwidth payment required: %s TRX", Big(needsBandwidthAmount).times(10 ** 3).div(10 ** 6).toString());

    return {
      estimatedEnergy,
      availableEnergy,
      availableBandwidth,
      needsEnergy,
      needsEnergyTRX: needsEnergy ? TRON_RENTAL_FEE.Normal : 0,
      needsBandwidth: insufficientBandwidth,
      needsBandwidthAmount,
      needsBandwidthTRX: numberRemoveEndZero(Big(needsBandwidthAmount).times(10 ** 3).div(10 ** 6).toFixed(6)),
    };
  }

  // Wait 15s after txHash, then call rent. Retry every 15s until 15 minutes. code 10009 stops immediately.
  const pollEnergyRent = async (params: { receiveAddress: string; txHash: string }) => {
    const startedAt = Date.now();
    const throwIfTimedOut = () => {
      if (Date.now() - startedAt >= ENERGY_RENT_TIMEOUT_MS) {
        throw new Error("Energy rental fee payment timed out or failed, please try again later");
      }
    };

    await sleep(ENERGY_RENT_FIRST_DELAY_MS);
    throwIfTimedOut();

    let attempt = 0;
    while (true) {
      if (attempt > 0) {
        const remaining = ENERGY_RENT_TIMEOUT_MS - (Date.now() - startedAt);
        if (remaining <= 0) {
          throw new Error("Energy rental fee payment timed out or failed, please try again later");
        }
        await sleep(Math.min(ENERGY_RENT_POLL_INTERVAL_MS, remaining));
        throwIfTimedOut();
      }

      attempt += 1;
      csl("useTronEnergy pollEnergyRent", "teal-500", "Polling energy rent for tx: %s, attempt: %d", params.txHash, attempt);

      try {
        return await energyService.getEnergy(params);
      } catch (error: any) {
        if (error instanceof EnergyRentError && error.code === ENERGY_RENT_STOP_CODE) {
          throw error;
        }
        csl("useTronEnergy pollEnergyRent", "teal-500", "Energy rent not ready: %s", error?.message || error);
        throwIfTimedOut();
      }
    }
  };

  // Poll the energy rental result
  const pollingTimer = useRef<NodeJS.Timeout | null>(null);
  const [pollCount, setPollCount] = useState(0);
  const pollEnergyResult = async (orderSerial: string): Promise<any> => {
    return new Promise((resolve) => {
      let currentPollCount = 0;
      const maxPolls = 120;

      const poll = async () => {
        pollingTimer.current && clearTimeout(pollingTimer.current);
        currentPollCount++;
        setPollCount(currentPollCount);
        csl("useTronEnergy pollEnergyResult", "teal-500", "Polling energy result for order: %s, count: %d", orderSerial, currentPollCount);

        try {
          const result = await energyService.getEnergyStatus({ orderSerial });

          if (result.errno !== 0) {
            setPollCount(0);
            resolve({ success: false, error: result.message || EnergyOrderStatusMessage[result.status] });
            return;
          }

          const status = result.status;

          if (([EnergyOrderStatus.NormalCompletion] as EnergyOrderStatus[]).includes(status)) {
            setPollCount(0);
            resolve({ success: true });
            return;
          }

          // If not completed yet, continue polling
          if (currentPollCount >= maxPolls) {
            setPollCount(0);
            resolve({ success: false, error: "Polling timed out, please try again later" });
            return;
          }

          // Continue polling after 1 second
          pollingTimer.current = setTimeout(poll, 1000);
        } catch (error: any) {
          setPollCount(0);
          resolve({ success: false, error: error.message });
        }
      };

      // Start polling
      poll();
    });
  };

  const getEnergy = async (params: { wallet: any; account: string; }, options?: { report?: any; }) => {
    const { report } = options ?? {};

    const rentalFee = TRON_RENTAL_FEE.Normal;

    // 1. First, pay the energy rental fee
    csl("useTronEnergy getEnergy", "teal-500", "1. Start paying energy rental fee... %o", rentalFee);

    let energyResponse;
    if (rentalFee > 0) {
      const txHash = await params.wallet.transfer({
        originAsset: "TRX",
        depositAddress: TRON_RENTAL_RECEIVING_ADDRESS,
        amount: rentalFee.toString(),
      });
      csl("useTronEnergy getEnergy", "teal-500", "Energy rental fee transfer sent, TXID: %o", txHash);

      if (!txHash) {
        throw new Error("Failed to pay rental fee, please try again later");
      }
      report?.();

      setTronTransferStep(TronTransferStepStatus.EnergyPaying);
      energyResponse = await pollEnergyRent({
        receiveAddress: params.account,
        txHash,
      });
    } else {
      setTronTransferStep(TronTransferStepStatus.EnergyRequest);
      energyResponse = await energyService.getEnergy({
        receiveAddress: params.account,
        txHash: "",
      });
    }

    csl("useTronEnergy getEnergy", "green-500", "Energy order: %o", energyResponse);

    setTronTransferStep(TronTransferStepStatus.EnergyRequest);

    const orderSerial = energyResponse.order_serial;

    // 4. Polling the rental result
    const pollingRes = await pollEnergyResult(orderSerial);
    if (!pollingRes.success) {
      throw new Error(pollingRes.error || "Energy rental failed, please try again later");
    }

    // 5. Energy rental successful
    setTronTransferStep(TronTransferStepStatus.EnergyReady);
  };

  useEffect(() => {
    return () => {
      if (pollingTimer.current) {
        clearTimeout(pollingTimer.current);
        pollingTimer.current = null;
      }
    };
  }, []);

  return {
    getEstimateNeedsEnergy,
    getEnergy,
  };
}
