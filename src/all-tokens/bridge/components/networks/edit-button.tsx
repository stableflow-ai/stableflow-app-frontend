import Popover from "@/components/popover";
import type { WalletType } from "@/stores/use-wallets";
import useWalletsStore from "@/stores/use-wallets";
import { getStableflowIcon } from "@/utils/format/logo";
import { useDebounceFn } from "ahooks";
import { useEffect, useMemo, useRef } from "react";

const EditButton = ({ onClick, token }: any) => {
  const editRecipientAddressRef = useRef<any>(null);

  const walletStore = useWalletsStore();

  const wallet = useMemo(() => {
    if (!token) {
      return null;
    }
    return walletStore[token.chainType as WalletType];
  }, [walletStore, token]);

  const [chainName] = useMemo(() => {
    return [token?.chainName, token?.chainType];
  }, [token]);

  const { run: toggleEditTooltip, cancel: cancelToggleEditTooltip } = useDebounceFn(() => {
    if (token?.chainType && !wallet?.account) {
      editRecipientAddressRef.current?.onOpen();
      return;
    }
    editRecipientAddressRef.current?.onClose();
  }, { wait: 1000 });

  useEffect(() => {
    toggleEditTooltip();

    return () => {
      cancelToggleEditTooltip();
    }
  }, [wallet?.account, chainName, token?.chainType]);

  return (
    <Popover
      ref={editRecipientAddressRef}
      content={
        <div className="w-[160px] p-2 bg-white shadow-[0_0_4px_0_rgba(0,0,0,0.15)] rounded-[8px] text-[12px]">
          <img
            src={getStableflowIcon("icon-info.svg")}
            alt=""
            className="inline-block mr-[4px] translate-y-[-1px]"
          />
          <span>Please click to enter recipient address</span>
        </div>
      }
      placement="Top"
      trigger="Hover"
      closeDelayDuration={0}
    >
      <button
        className={"button text-[#B3BBCE] hover:text-[#6284F5] duration-300"}
        onClick={onClick}
      >
        <svg
          xmlns="http://www.w3.org/2000/svg"
          width="12"
          height="12"
          viewBox="0 0 12 12"
          fill="none"
          className="translate-y-[1px]"
        >
          <path
            d="M11.1429 10.3099H0.857143C0.342857 10.3099 0 10.6479 0 11.1549C0 11.662 0.342857 12 0.857143 12H11.1429C11.6571 12 12 11.662 12 11.1549C12 10.6479 11.6571 10.3099 11.1429 10.3099ZM1.71429 9.46479H4.28571C4.54286 9.46479 4.71429 9.38028 4.88571 9.21127L9.68571 4.47887C10.2 3.97183 10.4571 3.38028 10.4571 2.70423C10.4571 2.02817 10.2 1.43662 9.68571 0.929578L9.51429 0.760563C9 0.253521 8.4 0 7.71429 0C7.02857 0 6.42857 0.253521 5.91429 0.760563L1.11429 5.49296C0.942857 5.66197 0.857143 5.83099 0.857143 6.08451V8.61972C0.857143 9.12676 1.2 9.46479 1.71429 9.46479ZM2.57143 6.42254L7.11429 1.94366C7.28571 1.77465 7.45714 1.69014 7.71429 1.69014C7.97143 1.69014 8.14286 1.77465 8.31429 1.94366L8.48571 2.11268C8.65714 2.28169 8.74286 2.4507 8.74286 2.70423C8.74286 2.95775 8.65714 3.12676 8.48571 3.29577L3.94286 7.77465H2.57143V6.42254Z"
            fill="currentColor"
          />
        </svg>
      </button>
    </Popover>
  );
};

export default EditButton;
