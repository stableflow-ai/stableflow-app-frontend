import { BASE_API_URL, TRON_ENERGY_API_URL } from "@/config/api";
import axios, { type AxiosInstance, type AxiosResponse } from "axios";

export const ENERGY_RENT_FIRST_DELAY_MS = 15000;
export const ENERGY_RENT_POLL_INTERVAL_MS = 15000;
export const ENERGY_RENT_TIMEOUT_MS = 15 * 60 * 1000;
export const ENERGY_RENT_STOP_CODE = 10009;

export class EnergyRentError extends Error {
  code?: number;

  constructor(message: string, code?: number) {
    super(message);
    this.name = "EnergyRentError";
    this.code = code;
  }
}

const toEnergyRentError = (error: any): EnergyRentError => {
  if (error instanceof EnergyRentError) {
    return error;
  }

  const code = error?.response?.data?.code;
  const message = error?.response?.data?.message || error?.message || "Energy rent request failed";
  return new EnergyRentError(message, typeof code === "number" ? code : undefined);
};

export type EnergyPeriod = "1H" | "1D" | "3D" | "30D";
export type EnergyAmount = 65000n | 131000n;
export type EnergyStatus = "pending" | "delegated";

class EnergyService {
  private api: AxiosInstance;
  constructor() {
    this.api = axios.create({
      baseURL: TRON_ENERGY_API_URL,
      // timeout: 30000,
      headers: {
        "Content-Type": "application/json"
      }
    });
  }

  public async getPrice(params: {
    period: EnergyPeriod;
    energyAmount: EnergyAmount;
  }) {
    // return {
    //   data: {
    //     "errno": 0,
    //     "data": {
    //       "period": "1H",
    //       "energy_amount": "131000",
    //       "price": 27,
    //       "total_price": 3537000,
    //       "addition": 0
    //     }
    //   }
    // };
    return await this.api.get("/api/price", { params });
  }

  public async getEnergy(params: {
    receiveAddress: string;
    txHash: string;
  }) {
    try {
      const response = await axios.post<EnergyRentParams, AxiosResponse<StableflowApiResponse<EnergyRentResponse>>>(`${BASE_API_URL}/v1/tron/energy/rent`, {
        address: params.receiveAddress,
        tx_hash: params.txHash,
      });

      const payload = response.data;
      const code = payload?.code;

      if (code === ENERGY_RENT_STOP_CODE) {
        throw new EnergyRentError(payload?.message || "Energy rent failed", code);
      }

      if (code === 200 && payload?.data?.order_serial) {
        return payload.data;
      }

      throw new EnergyRentError(
        payload?.message || (code === 200 ? "Missing order_serial" : response.statusText),
        code,
      );
    } catch (error: any) {
      throw toEnergyRentError(error);
    }
  }

  public async getEnergyStatus(params: {
    orderSerial: string;
  }) {
    const { orderSerial } = params;
    try {
      const response = await axios.get<EnergyRentStatusParams, AxiosResponse<StableflowApiResponse<EnergyRentStatusResponse>>>(`${BASE_API_URL}/v1/tron/energy/order`, {
        params: {
          order_serial: orderSerial,
        },
      });

      if (response.status !== 200 || response.data.code !== 200) {
        throw new Error(response.data.message || response.statusText);
      }

      return response.data.data;
    } catch (error: any) {
      throw new Error(error.response?.data?.message || error.message);
    }
  }
}

export default new EnergyService();

export interface EnergyPriceResponse {
  period: EnergyPeriod;
  energy_amount: EnergyAmount;
  price: number;
  total_price: number;
  addition: number;
}

export interface EnergyResponse {
  orderId: string;
  serial: string;
  status: string;
}

export interface EnergyStatusResponse {
  id: string;
  out_trade_no: string;
  serial: string;
  receive_address: string;
  period: string;
  energy_amount: number;
  status: string;
  trxx_status: string | null;
  txid: string | null;
  bandwidth_hash: string | null;
  active_hash: string | null;
  price_sun: number | null;
  details_json: any | null;
  created_at: number;
  updated_at: number;
}

function sortObject(obj: any): any {
  if (Array.isArray(obj)) {
    return obj.map(sortObject);
  }
  if (obj && typeof obj === "object" && obj !== null) {
    return Object.keys(obj)
      .sort()
      .reduce((acc: any, key: any) => {
        acc[key] = sortObject(obj[key]);
        return acc;
      }, {});
  }
  return obj;
}

function canonical(obj: any) {
  return JSON.stringify(sortObject(obj));
}

interface EnergyRentResponse {
  address: string;
  energy_amount: number;
  id: number;
  order_serial: string;
  trx_amount: number;
  tx_hash: string;
  tx_time: number;
}

interface StableflowApiResponse<T> {
  code: number;
  message?: string;
  data: T;
}

interface EnergyRentParams {
  address: string;
  tx_hash: string;
}


interface EnergyRentStatusParams {
  order_serial: string;
}

interface EnergyRentStatusDetail {
  delegate_hash: string;
  delegate_time: string;
  reclaim_hash: string;
  reclaim_time: string;
  reclaim_time_real: string;
  status: number;
}

/**
 * Order status enum for EnergyRentStatusResponse.
 * 
 * 0  - Timeout closed
 * 10 - Waiting for payment
 * 20 - Paid
 * 30 - Delegation in preparation
 * 31 - Partial commission
 * 32 - Exception retrying
 * 40 - Normal completion
 * 41 - Refund termination
 * 43 - Abnormal termination
 */
export const EnergyOrderStatus = {
  TimeoutClosed: 0,
  WaitingForPayment: 10,
  Paid: 20,
  DelegationPreparation: 30,
  PartialCommission: 31,
  ExceptionRetrying: 32,
  NormalCompletion: 40,
  RefundTermination: 41,
  AbnormalTermination: 43,
} as const;
export type EnergyOrderStatus = (typeof EnergyOrderStatus)[keyof typeof EnergyOrderStatus];

export const EnergyOrderStatusMessage: Record<EnergyOrderStatus, string> = {
  [EnergyOrderStatus.TimeoutClosed]: "Timeout closed",
  [EnergyOrderStatus.WaitingForPayment]: "Waiting for payment",
  [EnergyOrderStatus.Paid]: "Paid",
  [EnergyOrderStatus.DelegationPreparation]: "Delegation in preparation",
  [EnergyOrderStatus.PartialCommission]: "Partial commission",
  [EnergyOrderStatus.ExceptionRetrying]: "Exception retrying",
  [EnergyOrderStatus.NormalCompletion]: "Normal completion",
  [EnergyOrderStatus.RefundTermination]: "Refund termination",
  [EnergyOrderStatus.AbnormalTermination]: "Abnormal termination",
};

interface EnergyRentStatusResponse {
  errno: number;
  message: string;
  receive_address: string;
  order_no: string;
  energy_amount: number;
  pay_amount: number;
  amount: number;
  details: EnergyRentStatusDetail[];
  create_time: string;
  api_name: string;
  period: number;
  status: EnergyOrderStatus; // Order status, see EnergyOrderStatus enum above
  refund_amount: number;
}