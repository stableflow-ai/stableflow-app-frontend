import BackButton from "@/components/back-button";
import Pending from "./pending";
import CompleteTransfers from "./complete-transfers";
import { useHistory } from "./hooks/use-history";
import { usePendingHistory } from "./hooks/use-pending-history";
import { useTrack } from "@/hooks/use-track";
import { useEffect } from "react";
import AllTokensSwitch from "@/all-tokens/components/all-tokens-switch";
import { useIsAllTokens } from "@/all-tokens/route-mode";
import { useRheaTokens } from "@/all-tokens/hooks/use-rhea-tokens";
import { useMaintenanceStore } from "@/stores/use-maintenance";
import clsx from "clsx";

function AllTokensHistoryTokens() {
  useRheaTokens();
  return null;
}

export default function History() {
  const history = useHistory();
  const pendingHistory = usePendingHistory(history);
  const { addHistory } = useTrack();
  const bannerVisible = useMaintenanceStore((s) => s.getBannerVisible());
  const allTokensEnabled = useIsAllTokens();

  useEffect(() => {
    addHistory({ type: "view" });
  }, []);

  return (
    <div
      className={clsx(
        "w-full md:w-[680px] px-[10px] md:px-0 mx-auto relative pb-[150px]",
        bannerVisible ? "pt-30" : "pt-18",
      )}
    >
      <div className="w-full flex justify-between items-center">
        <BackButton className="" />
        <div className="relative text-center text-[20px] font-[500]">
          Transaction History
        </div>
        <AllTokensSwitch />
      </div>
      {allTokensEnabled ? <AllTokensHistoryTokens /> : null}
      <Pending history={pendingHistory} />
      <CompleteTransfers history={history} />
    </div>
  );
}
