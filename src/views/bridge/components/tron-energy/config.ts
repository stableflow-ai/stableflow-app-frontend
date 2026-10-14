import { TronTransferStepStatus } from "@/config/tron";

export interface TronTransferStep {
  id: TronTransferStepStatus;
  title: string;
  description: string;
}

export const TronTransferSteps: TronTransferStep[] = [
  {
    id: TronTransferStepStatus.EnergyPayment,
    title: "Pay Energy Rental Fee",
    description: "Transferring TRX...",
  },
  {
    id: TronTransferStepStatus.EnergyPaying,
    title: "Waiting for Payment Confirmation",
    description: "Estimated 30–60 seconds",
  },
  {
    id: TronTransferStepStatus.EnergyRequest,
    title: "Requesting Energy",
    description: "Estimated 3–10 seconds",
  },
  {
    id: TronTransferStepStatus.EnergyReady,
    title: "Energy Ready",
    description: "Energy rental completed",
  },
  {
    id: TronTransferStepStatus.WalletPrompt,
    title: "Opening Wallet for Authorization",
    description: "Please confirm in wallet",
  },
  {
    id: TronTransferStepStatus.Broadcasting,
    title: "Broadcasting Transaction",
    description: "Processing, please wait",
  },
];
