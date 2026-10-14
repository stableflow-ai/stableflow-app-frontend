import clsx from "clsx";
import { getStableflowIcon } from "@/utils/format/logo";

const DrawerTitle = (props: any) => {
  const { onClose, children, className, showBack, onBack } = props;

  return (
    <div className={clsx("px-[20px] py-[16px] flex justify-between items-center gap-2", className)}>
      <div className="flex items-center gap-[8px] min-w-0 flex-1">
        {showBack && (
          <button
            type="button"
            className="button shrink-0 w-[20px] h-[20px] flex items-center justify-center"
            onClick={onBack}
            aria-label="Back"
          >
            <img
              src={getStableflowIcon("icon-arrow-right.svg")}
              alt=""
              className="w-[10px] h-[10px] rotate-180"
            />
          </button>
        )}
        <span className="text-[18px] font-[500] min-w-0 flex-1">{children}</span>
      </div>
      <button className="button" onClick={onClose}>
        <svg
          xmlns="http://www.w3.org/2000/svg"
          width="15"
          height="15"
          viewBox="0 0 15 15"
          fill="none"
        >
          <line
            x1="13.1284"
            y1="1.41421"
            x2="1.41443"
            y2="13.1282"
            stroke="#A1A699"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
          <path
            d="M6.97455 6.97455L1.23096 1.23096M9.84634 9.84634L13.5386 13.5386"
            stroke="#A1A699"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
        </svg>
      </button>
    </div>
  );
};

export default DrawerTitle;
