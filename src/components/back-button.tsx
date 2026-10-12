import clsx from "clsx";
import { useNavigate } from "react-router-dom";
import { MODE_ROUTES, useRouteMode } from "@/all-tokens/route-mode";

export default function BackButton({ className }: { className: string }) {
  const navigate = useNavigate();
  const mode = useRouteMode();
  return (
    <button
      className={clsx(
        "button pl-[14px] md:pl-[17px] pr-[14px] md:pr-[22px] h-[32px] flex justify-center items-center gap-[14px] rounded-[16px] bg-white shadow-[0_0_6px_0_rgba(0,0,0,0.10)]",
        className
      )}
      onClick={() => {
        navigate(MODE_ROUTES[mode].bridge);
      }}
    >
      <svg
        xmlns="http://www.w3.org/2000/svg"
        width="5"
        height="10"
        viewBox="0 0 5 10"
        fill="none"
      >
        <path
          d="M4 1L1 5.13793L4 9"
          stroke="#444C59"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
      </svg>
      <span className="text-[14px] text-[#444C59] hidden md:block">Back</span>
    </button>
  );
}
