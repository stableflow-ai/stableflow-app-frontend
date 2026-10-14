import { lazy, Suspense } from "react";
import clsx from "clsx";
import { getStableflowIcon } from "@/utils/format/logo";
import AllTokensSwitch from "./all-tokens-switch";

const Setting = lazy(() => import("@/sections/setting"));

export default function BridgeToolbar({
  isQuoting,
  onRefreshQuote,
}: {
  isQuoting: boolean;
  onRefreshQuote?: () => void;
}) {
  return (
    <div className="flex items-center gap-1 shrink-0">
      <AllTokensSwitch />
      <button
        type="button"
        className={clsx(
          "button p-[5px] duration-300 rounded-[8px] hover:bg-white hover:shadow-[0_0_4px_0_rgba(0,0,0,0.15)]",
          isQuoting && "cursor-not-allowed opacity-60",
        )}
        disabled={isQuoting}
        onClick={() => {
          if (isQuoting) return;
          onRefreshQuote?.();
        }}
        title="Refresh quote"
      >
        <img
          src={getStableflowIcon("icon-refresh.svg")}
          alt="Refresh"
          className={clsx("w-4 h-4", isQuoting && "animate-spin")}
        />
      </button>
      <Suspense fallback={null}>
        <Setting />
      </Suspense>
    </div>
  );
}
