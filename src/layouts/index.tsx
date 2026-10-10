import { Outlet, useLocation, useNavigate } from "react-router-dom";
import { lazy, Suspense, useEffect, useRef } from "react";
import UserActions from "./user-actions";
import LayoutContext from "./context";
import { applyEntryMode, readEntryMode, searchWithoutEntryMode, subscribeEntryMode } from "@/all-tokens/apply-entry-mode";
import { useAllTokensStore } from "@/all-tokens/store";
import useWalletBalances from "@/all-tokens/hooks/use-wallet-balances";

// import useUpdateTxns from "@/hooks/use-update-txns";
// import SupportButton from "@/components/support-button";
// import { AuroraBackground } from "./bg";

const Footer = lazy(() => import("./footer"));
const Footer2 = lazy(() => import("./footer2"));
const Wallet = lazy(() => import("@/sections/wallet"));
const AllTokensWallet = lazy(() => import("@/all-tokens/wallet"));
const PixelBlast = lazy(() => import("@/components/pixel-blast"));

const LoadingSpinner = () => null;

function AllTokensBalanceFetcher() {
  useWalletBalances();
  return null;
}

export default function Layout() {
  const containerRef = useRef<HTMLDivElement>(null);
  const location = useLocation();
  const navigate = useNavigate();

  useEffect(() => {
    return subscribeEntryMode(() => {
      const mode = readEntryMode(window.location.search);
      if (!mode) return;
      applyEntryMode(mode);
      navigate(
        {
          pathname: window.location.pathname,
          search: searchWithoutEntryMode(window.location.search),
          hash: window.location.hash,
        },
        { replace: true }
      );
    });
  }, [navigate]);

  const allTokensEnabled = useAllTokensStore((state) => state.enabled);
  const isHomePage = location.pathname === "/";
  const ishistoryPage = location.pathname === "/history";
  const isFooter2 = !isHomePage && !ishistoryPage;

  // useUpdateTxns();

  return (
    <LayoutContext.Provider
      value={{
        containerRef,
        isHomePage,
        ishistoryPage,
        isFooter2,
      }}
    >
      <div className="relative w-full h-screen overflow-hidden bg-[#F6F8FC]">
        {/* Video Background */}
        {
          isHomePage && (
            <div className="absolute inset-0 w-full h-full z-0">
              <Suspense fallback={<LoadingSpinner />}>
                <PixelBlast />
              </Suspense>
            </div>
          )
        }
        {/* <AuroraBackground /> */}

        {/* Content Layer */}
        <div ref={containerRef} className="relative z-10 w-full h-full overflow-y-auto">
          <Suspense fallback={<LoadingSpinner />}>
            <UserActions />
          </Suspense>
          <Outlet />
          {allTokensEnabled ? <AllTokensBalanceFetcher /> : null}
          <Suspense fallback={<LoadingSpinner />}>
            {allTokensEnabled ? <AllTokensWallet /> : <Wallet />}
          </Suspense>

          {
            isFooter2 ? (
              <Suspense fallback={<LoadingSpinner />}>
                <Footer2 />
              </Suspense>
            ) : (
              <Suspense fallback={<LoadingSpinner />}>
                <Footer containerRef={containerRef} />
              </Suspense>
            )
          }
        </div>
      </div>
    </LayoutContext.Provider>
  );
}
