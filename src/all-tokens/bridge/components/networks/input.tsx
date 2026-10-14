import useBridgeStore from "@/all-tokens/bridge-store";
import { formatNumber } from "@/utils/format/number";

export default function Input() {
  const bridgeStore = useBridgeStore();
  return (
    <div className="md:min-w-[100px] relative z-[2] grow">
      <input
        className="text-[32px] font-[500] border-none outline-none text-center w-full text-black"
        type="text"
        placeholder="0"
        value={bridgeStore.amount}
        onChange={(e) => {
          const value = e.target.value;
          // Only allow numbers and decimal point
          const sanitizedValue = value.replace(/[^0-9.]/g, "");

          // Prevent multiple decimal points
          const parts = sanitizedValue.split(".");
          if (parts.length > 2) {
            return;
          }

          bridgeStore.set({ amount: sanitizedValue });
        }}
      />
      <div className="text-[12px] text-[#9FA7BA] text-center w-full">
        ${bridgeStore.amount ? formatNumber(bridgeStore.amount, 2, true) : "-"}
      </div>
    </div>
  );
}
