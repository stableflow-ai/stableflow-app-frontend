import { formatAddress } from "@/utils/format/address";
import useCopy from "@/hooks/use-copy";
import useWalletsStore, { type WalletType } from "@/stores/use-wallets";
import clsx from "clsx";

interface AddressProps {
  type: WalletType;
  className?: string;
  walletIconClassName?: string;
  addressClassName?: string;
  copyButtonClassName?: string;
  disconnectButtonClassName?: string;
}

export default function Address({
  type = "evm",
  className,
  walletIconClassName,
  addressClassName,
  copyButtonClassName,
  disconnectButtonClassName,
}: AddressProps) {
  const wallets = useWalletsStore();
  const { onCopy } = useCopy();
  const wallet = wallets[type || "evm"];

  return (
    wallet?.account && (
      <div className={clsx("flex items-center", className)}>
        <div className="flex items-center gap-[8px]">
          {type === "evm" ? (
            <img className={clsx("w-[12px] h-[12px]", walletIconClassName)} src={wallet.walletIcon as string} />
          ) : (
            wallet.walletIcon && (
              <img className={clsx("w-[12px] h-[12px]", walletIconClassName)} src={wallet.walletIcon} />
            )
          )}
          <span className={clsx("text-[14px] font-[500]", addressClassName)}>
            {formatAddress(wallet.account, 5, 4)}
          </span>
        </div>
        <div className={clsx("flex items-center pl-[4px]", copyButtonClassName)}>
          <CopyButton
            className={copyButtonClassName}
            onClick={() => {
              wallet.account && onCopy(wallet.account);
            }}
          />
          <DisconnectButton
            className={disconnectButtonClassName}
            onClick={(ev: any) => {
              ev.stopPropagation();
              wallet.disconnect();
            }}
          />
        </div>
      </div>
    )
  );
}

const CopyButton = ({ onClick, className }: any) => {
  return (
    <button
      className={clsx("p-[4px] rounded-[8px] hover:bg-white hover:shadow-[0_0_4px_0_rgba(0,0,0,0.15)] button")}
      onClick={onClick}
    >
      <svg
        xmlns="http://www.w3.org/2000/svg"
        width="14"
        height="14"
        viewBox="0 0 14 14"
        fill="none"
        className={className}
      >
        <path
          d="M7.55176 3.19824C8.82199 3.19827 9.85156 4.22781 9.85156 5.49805V11.2998C9.85153 12.57 8.82197 13.5996 7.55176 13.5996H2.2998C1.02957 13.5996 3.29792e-05 12.57 0 11.2998V5.49805C5.03009e-07 4.22779 1.02955 3.19824 2.2998 3.19824H7.55176ZM2.2998 4.79785C1.91321 4.79785 1.59961 5.11145 1.59961 5.49805V11.2998C1.59964 11.6864 1.91323 12 2.2998 12H7.55176C7.93831 12 8.25192 11.6864 8.25195 11.2998V5.49805C8.25195 5.11147 7.93833 4.79788 7.55176 4.79785H2.2998ZM11.3027 0C12.5729 0.00015536 13.6025 1.02965 13.6025 2.2998V8.10156C13.6025 9.37172 12.5729 10.4012 11.3027 10.4014H10.5518V8.80176H11.3027C11.6892 8.8016 12.0029 8.48807 12.0029 8.10156V2.2998C12.0029 1.9133 11.6892 1.59976 11.3027 1.59961H6.05078C5.66418 1.59961 5.35059 1.91321 5.35059 2.2998V2.7998H3.75098V2.2998C3.75098 1.02955 4.78053 0 6.05078 0H11.3027Z"
          fill="#B3BBCE"
        />
      </svg>
    </button>
  );
};

const DisconnectButton = ({ onClick, className }: any) => {
  return (
    <button
      className={clsx("p-[4px] rounded-[8px] hover:bg-white hover:shadow-[0_0_4px_0_rgba(0,0,0,0.15)] button")}
      onClick={onClick}
    >
      <svg
        xmlns="http://www.w3.org/2000/svg"
        width="11"
        height="12"
        viewBox="0 0 11 12"
        fill="none"
        className={className}
      >
        <path
          d="M0 6.00072V11.3082C0 11.6903 0.332601 12 0.744799 12H4.46595C4.87673 12 5.21075 11.6903 5.21075 11.3082C5.21075 10.9261 4.87815 10.6163 4.46595 10.6163H1.4896V1.38367H4.46737C4.87815 1.38367 5.21217 1.07394 5.21217 0.691835C5.21217 0.309734 4.87957 0 4.46737 0H0.744799C0.334023 0 0 0.309734 0 0.691835V6.00072ZM10.7669 5.49994C10.9105 5.62731 11 5.81112 11 6.0152C11 6.22072 10.9105 6.40309 10.7669 6.53045L8.41595 8.60596C8.29086 8.71596 8.12456 8.78398 7.94405 8.78398C7.55459 8.78398 7.23905 8.4728 7.23905 8.0907C7.23905 7.88662 7.33002 7.70281 7.47358 7.57689L8.45859 6.70703H4.18026C3.7908 6.70703 3.47526 6.3973 3.47526 6.0152C3.47526 5.6331 3.7908 5.32336 4.18026 5.32336H8.45574L7.47073 4.4535C7.32717 4.32758 7.23621 4.14232 7.23621 3.93825C7.23621 3.55614 7.55317 3.24641 7.94121 3.24641C8.12314 3.24641 8.28802 3.31299 8.4131 3.42444L10.7669 5.49994Z"
          fill="#B3BBCE"
        />
      </svg>
    </button>
  );
};
