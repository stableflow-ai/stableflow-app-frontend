import { Suspense, lazy, useEffect, useState } from "react";
import useBridge from "./hooks/use-bridge";
import { useRheaTokens } from "@/all-tokens/hooks/use-rhea-tokens";
import { usePendingHistory } from "@/views/history/hooks/use-pending-history";

const Networks = lazy(() => import("./components/networks"));
const BridgeButton = lazy(() => import("./components/button"));
const PendingTransfer = lazy(() => import("./components/pending"));
const ZcashDepositModal = lazy(() => import("./components/zcash-deposit-modal"));
const TokenSelectModal = lazy(() => import("./components/token-select-modal"));

export default function AllTokensBridge() {
  useRheaTokens();
  usePendingHistory();
  const { onTransfer, addressValidation, errorChain, onRefreshQuote } = useBridge();
  const [isRoutes, setIsRoutes] = useState(false);

  useEffect(() => {
    return () => {
      setIsRoutes(false);
    };
  }, []);

  return (
    <>
      <Suspense fallback={null}>
        <PendingTransfer className="block" />
      </Suspense>
      <Suspense fallback={null}>
        <Networks
          addressValidation={addressValidation}
          onRefreshQuote={onRefreshQuote}
          isRoutes={isRoutes}
          onToggleRoutes={() => setIsRoutes((prev) => !prev)}
        />
      </Suspense>
      <div className="px-[10px] md:px-0 w-full">
        <Suspense fallback={null}>
          <BridgeButton
            onClick={onTransfer}
            errorChain={errorChain}
          />
        </Suspense>
      </div>
      <Suspense fallback={null}>
        <ZcashDepositModal />
      </Suspense>
      <Suspense fallback={null}>
        <TokenSelectModal />
      </Suspense>
    </>
  );
}
