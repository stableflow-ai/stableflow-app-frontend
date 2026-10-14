import { useState } from "react";
import Big from "big.js";
import { QRCodeCanvas } from "qrcode.react";
import Modal from "@/components/modal";
import useBridgeStore from "@/all-tokens/bridge-store";
import useCopy from "@/hooks/use-copy";
import useToast from "@/hooks/use-toast";
import { addTradeReport } from "@/stores/use-trade-report";
import type { RheaReportPayload } from "@/all-tokens/services/rhea/status";
import { useHistoryStore } from "@/stores/use-history";
import { csl } from "@/utils/log";
import { numberRemoveEndZero } from "@/utils/format/number";
import { useTrack } from "@/hooks/use-track";
import { Service } from "@/all-tokens/constants";

export default function ZcashDepositModal() {
  const bridgeStore = useBridgeStore();
  const depositInfo = bridgeStore.depositInfo;
  const { onCopy } = useCopy();
  const toast = useToast();
  const requestPendingRefresh = useHistoryStore((s) => s.requestPendingRefresh);
  const { addTransfer: addTransferTrack } = useTrack();
  const [submitting, setSubmitting] = useState(false);

  const open = !!(depositInfo?.manual && depositInfo?.depositAddress);
  const depositAddress = depositInfo?.depositAddress || "";
  const decimals = Number(depositInfo?.decimals ?? 8);
  const symbol = depositInfo?.symbol || "ZEC";
  const amountDisplay =
    depositInfo?.amountDisplay ||
    numberRemoveEndZero(
      Big(depositInfo?.amount || 0)
        .div(10 ** decimals)
        .toFixed(decimals)
    );

  const onClose = () => {
    if (submitting) return;
    bridgeStore.set({ depositInfo: null });
  };

  const onConfirmSent = async () => {
    if (!depositInfo || submitting) return;
    setSubmitting(true);

    const orderId = depositInfo.orderId || depositInfo.depositAddress;
    const router = depositInfo.router || "";
    const reportBase = depositInfo.reportBase || {};

    try {
      const fromChain = String(depositInfo.fromChain ?? "");
      const toChain = String(depositInfo.toChain ?? "");
      const rheaReportData: RheaReportPayload = {
        sender: depositInfo.sender,
        recipient: depositInfo.recipient,
        from_hash: orderId || "",
        from_token: depositInfo.fromTokenAddress,
        to_token: depositInfo.toTokenAddress,
        deposit_address: depositInfo.depositAddress ?? "",
        from_chain: fromChain,
        to_chain: toChain,
        amount_in: depositInfo.amount,
        router,
        estimated_out: depositInfo.estimatedOut,
        min_amount_out: depositInfo.minAmountOut,
        swap_id: orderId,
        swapId: orderId,
        is_cross_chain:
          depositInfo.isCrossChain ??
          depositInfo.selectedQuote?.isCrossChain ??
          (fromChain !== toChain && !!fromChain && !!toChain),
      };
      const reportData = {
        ...reportBase,
        deposit_address: orderId,
        tx_hash: "",
        status: 0,
        router,
        volume: depositInfo.volume ?? reportBase.volume,
        rhea_report_data: rheaReportData,
      };
      addTradeReport(reportData);
      requestPendingRefresh();

      if (depositInfo.selectedQuote) {
        addTransferTrack({
          type: "transfer_button",
          service: Service.Rhea,
          quoteData: depositInfo.selectedQuote,
          txHash: "",
        });
      }

      toast.success({ title: "Transfer submitted" });
      bridgeStore.set({
        depositInfo: null,
        transferring: false,
        amount: "",
      });
      bridgeStore.clearQuoteData();
    } catch (error) {
      csl("ZcashDepositModal", "red-500", "confirm failed: %o", error);
      toast.fail({ title: "Failed to submit transfer" });
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <Modal
      open={open}
      onClose={onClose}
      className="flex items-center justify-center"
    >
      <div className="p-[24px] bg-white rounded-b-none md:rounded-b-[16px] rounded-t-[16px] w-full md:w-[400px] max-w-[unset] md:max-w-[90vw]">
        <div className="flex items-center justify-between mb-[20px]">
          <h2 className="text-[20px] font-semibold text-[#1A1A1A]">
            Transaction
          </h2>
          <button
            type="button"
            onClick={onClose}
            disabled={submitting}
            className="cursor-pointer w-[32px] h-[32px] rounded-full bg-[#F5F5F5] flex items-center justify-center hover:bg-[#E5E5E5] transition-colors disabled:opacity-50"
          >
            <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
              <path
                d="M12 4L4 12M4 4L12 12"
                stroke="#666666"
                strokeWidth="1.5"
                strokeLinecap="round"
                strokeLinejoin="round"
              />
            </svg>
          </button>
        </div>

        <div className="flex items-center justify-between h-[48px] px-[14px] rounded-[12px] bg-[#F5F7FB] mb-[12px]">
          <span className="text-[14px] text-[#9FA7BA]">Amount</span>
          <span className="text-[16px] font-[500] text-[#1A1A1A]">
            {amountDisplay} {symbol}
          </span>
        </div>

        <p className="text-[12px] text-[#9FA7BA] leading-[150%] mb-[16px]">
          Supports transparent or shield Zcash transactions across all Zcash
          wallets.
        </p>

        <div className="flex justify-center mb-[16px]">
          <div className="p-[12px] bg-white rounded-[12px] border border-[#EDF0F7]">
            <QRCodeCanvas value={depositAddress} size={220} level="M" />
          </div>
        </div>

        <div className="flex items-center gap-[8px] p-[12px] rounded-[12px] bg-[#F5F7FB] mb-[20px]">
          <p className="flex-1 text-[13px] font-[500] text-[#444C59] break-all">
            {depositAddress}
          </p>
          <button
            type="button"
            onClick={() => onCopy(depositAddress)}
            className="button shrink-0 w-[32px] h-[32px] flex items-center justify-center rounded-[8px] hover:bg-[#E8ECF5]"
            aria-label="Copy address"
          >
            <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
              <rect
                x="5"
                y="5"
                width="8"
                height="8"
                rx="1.5"
                stroke="#666666"
                strokeWidth="1.4"
              />
              <path
                d="M3 10.5V3.5C3 2.67157 3.67157 2 4.5 2H10.5"
                stroke="#666666"
                strokeWidth="1.4"
                strokeLinecap="round"
              />
            </svg>
          </button>
        </div>

        <button
          type="button"
          disabled={submitting}
          onClick={onConfirmSent}
          className="button w-full h-[48px] rounded-[12px] bg-[#1A1A1A] text-white text-[16px] font-[500] disabled:opacity-50"
        >
          {submitting ? "Submitting..." : "I Have Sent It"}
        </button>
      </div>
    </Modal>
  );
}
