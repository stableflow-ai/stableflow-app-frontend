import { Suspense, lazy, useEffect } from "react";
import useBridge from "./hooks/use-bridge";
import { useTrack } from "@/hooks/use-track";
import { useMaintenanceStore } from "@/stores/use-maintenance";
import { useAllTokensStore } from "@/all-tokens/store";
import { useIsAllTokens } from "@/all-tokens/route-mode";
import AllTokensBridge from "@/all-tokens/bridge";
import AllTokensGuide from "@/all-tokens/components/all-tokens-guide";
import PrivatePayBanner from "./components/private-pay-banner";
import clsx from "clsx";

// Dynamic import components
const Networks = lazy(() => import("./components/networks"));
const BridgeButton = lazy(() => import("./components/button"));
const HistoryDrawer = lazy(() => import("../history/drawer"));
const PendingTransfer = lazy(() => import("./components/pending"));

// Loading component
const LoadingSpinner = () => null;

function StablecoinBridge() {
  const { quote, transfer, addressValidation, errorChain, onRefreshQuote } = useBridge();

  return (
    <>
      <Suspense fallback={<LoadingSpinner />}>
        <PendingTransfer className="block" />
      </Suspense>
      <Suspense fallback={<LoadingSpinner />}>
        <Networks addressValidation={addressValidation} onRefreshQuote={onRefreshQuote} />
      </Suspense>
      <div className="px-[10px] md:px-0 w-full">
        <Suspense fallback={<LoadingSpinner />}>
          <BridgeButton
            onClick={transfer}
            onQuote={quote}
            errorChain={errorChain}
          />
        </Suspense>
      </div>
    </>
  );
}

export default function Bridge() {
  const allTokensEnabled = useIsAllTokens();
  const guideDismissed = useAllTokensStore((state) => state.guideDismissed);
  const { addOpen } = useTrack();
  const bannerVisible = useMaintenanceStore((s) => s.getBannerVisible());

  useEffect(() => {
    addOpen();
  }, []);

  return (
    <div
      className={clsx(
        "relative w-full min-h-dvh md:pt-[20dvh] pb-25 flex flex-col items-center overflow-y-auto overflow-x-hidden",
        bannerVisible ? "pt-[20dvh]" : "pt-[10dvh]",
      )}
    >
      <div className="w-full flex items-stretch gap-[10px] justify-center mt-[20px] md:min-h-[490px]">
        <div className="md:w-150 w-full mx-auto shrink-0 relative">
          {allTokensEnabled ? (
            <AllTokensBridge />
          ) : (
            <StablecoinBridge />
          )}
          <PrivatePayBanner />
        </div>
      </div>
      <Suspense fallback={null}>
        <HistoryDrawer />
      </Suspense>
      {!allTokensEnabled && !guideDismissed ? <AllTokensGuide /> : null}
    </div>
  );
}
