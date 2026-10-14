export type RheaReportPayload = {
  sender: string;
  recipient?: string;
  from_hash: string;
  from_token: string;
  to_token: string;
  deposit_address: string;
  from_chain: string;
  to_chain: string;
  amount_in: string;
  router?: string;
  estimated_out?: string;
  min_amount_out?: string;
  swap_id?: string;
  /** CamelCase alias accepted by Rhea API (same as swap_id) */
  swapId?: string;
  is_cross_chain?: boolean;
};
