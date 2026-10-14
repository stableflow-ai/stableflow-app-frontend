import { useEffect, useMemo, useState } from "react";
import Modal from "@/components/modal";
import { validateAddress } from "@/utils/address-validation";

type PasteAddressModalProps = {
  open: boolean;
  onClose: () => void;
  onConfirm: (address: string) => void;
};

function isLoginAllowedAddress(address: string): boolean {
  const trimmed = address.trim();
  // Login only allows transparent (t1/t3) and unified (u1), not sapling zs1
  if (/^zs1/i.test(trimmed)) return false;
  return validateAddress(trimmed, "zcash").isValid;
}

export default function PasteAddressModal({
  open,
  onClose,
  onConfirm,
}: PasteAddressModalProps) {
  const [value, setValue] = useState("");

  useEffect(() => {
    if (!open) setValue("");
  }, [open]);

  const valid = useMemo(() => isLoginAllowedAddress(value), [value]);

  const onPaste = async () => {
    try {
      const text = await navigator.clipboard.readText();
      if (text) setValue(text.trim());
    } catch {
      // fall back to system paste into the input
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
            Connect Wallet
          </h2>
          <button
            type="button"
            onClick={onClose}
            className="cursor-pointer w-[32px] h-[32px] rounded-full bg-[#F5F5F5] flex items-center justify-center hover:bg-[#E5E5E5] transition-colors"
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

        <div className="relative mb-[16px]">
          <input
            type="text"
            value={value}
            onChange={(e) => setValue(e.target.value)}
            placeholder="Please enter a valid ZEC address."
            className="w-full h-[48px] px-[14px] pr-[72px] rounded-[12px] border border-[#E5E5E5] text-[14px] text-[#1A1A1A] outline-none focus:border-[#6284F5]"
          />
          <button
            type="button"
            onClick={onPaste}
            className="absolute right-[10px] top-1/2 -translate-y-1/2 text-[14px] font-[500] text-[#6284F5] button"
          >
            Paste
          </button>
        </div>

        <button
          type="button"
          disabled={!valid}
          onClick={() => onConfirm(value.trim())}
          className="button w-full h-[48px] rounded-[12px] bg-[#1A1A1A] text-white text-[16px] font-[500] disabled:bg-[#D7DFEF] disabled:text-[#9FA7BA] disabled:cursor-not-allowed"
        >
          Confirm Address
        </button>

        <p className="mt-[16px] text-[12px] text-[#9FA7BA] leading-[150%]">
          Supports T and U Zcash addresses. Use a transparent (T) address when
          possible for the best cross-chain experience.
        </p>
      </div>
    </Modal>
  );
}
