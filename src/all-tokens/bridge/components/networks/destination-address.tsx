import useIsMobile from "@/hooks/use-is-mobile";
import { formatAddress } from "@/utils/format/address";
import clsx from "clsx";

const DestinationAddress = ({ isError, address, onClick }: any) => {
  const isMobile = useIsMobile();

  return (
    <div className="flex items-center">
      {isError ? (
        <svg width="14" height="14" viewBox="0 0 14 14" fill="none">
          <rect opacity="0.2" width="14" height="14" rx="4" fill="#FF6A19" />
          <path
            d="M7 4V7"
            stroke="#FF6A19"
            strokeWidth="1.6"
            strokeLinecap="round"
          />
          <circle cx="7" cy="10" r="1" fill="#FF6A19" />
        </svg>
      ) : (
        <svg
          xmlns="http://www.w3.org/2000/svg"
          width="14"
          height="14"
          viewBox="0 0 14 14"
          fill="none"
        >
          <rect opacity="0.2" width="14" height="14" rx="4" fill="#4DCF5E" />
          <path
            d="M4 7L6 9L10 5"
            stroke="#4DCF5E"
            strokeWidth="1.6"
            strokeLinecap="round"
          />
        </svg>
      )}
      <span
        className={clsx(
          "text-[12px] font-[400] ml-[6px] mr-[2px]",
          isError ? "text-[#FF6A19]" : "text-[#444C59]"
        )}
      >
        {formatAddress(address, isMobile ? 5 : 12, isMobile ? 4 : 10)}
      </span>
      <button className="button p-[2px]" onClick={onClick}>
        <svg
          xmlns="http://www.w3.org/2000/svg"
          width="12"
          height="12"
          viewBox="0 0 12 12"
          fill="none"
        >
          <circle cx="6" cy="6" r="5.2" stroke="#B3BBCE" strokeWidth="1.6" />
          <path
            d="M3.5 6H8.5"
            stroke="#B3BBCE"
            strokeWidth="1.6"
            strokeLinecap="round"
          />
        </svg>
      </button>
    </div>
  );
};

export default DestinationAddress;
