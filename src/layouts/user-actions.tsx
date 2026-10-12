import useWalletStore from "@/stores/use-wallet";
import ChainIcon from "./chain-icon";
import useWalletsStore, { type WalletType } from "@/stores/use-wallets";
import { Link, useLocation, useNavigate } from "react-router-dom";
import { useHistoryStore } from "@/stores/use-history";
import { lazy, Suspense, useEffect, useMemo, useState } from "react";
import { useLayoutContext } from "./context";
import useIsMobile from "@/hooks/use-is-mobile";
import { stablecoinWithChains } from "@/config/tokens";
import { isBridgePath, isHistoryPath, MODE_ROUTES, useIsAllTokens, useRouteMode } from "@/all-tokens/route-mode";
import { chainTypes as rheaChainTypes, RHEA_WALLET_TYPES } from "@/all-tokens/chains";
import clsx from "clsx";
import { menuItems } from "@/components/navigation-menu/menu-items";
import { useTrack } from "@/hooks/use-track";
import { getStableflowIcon, getStableflowLogo } from "@/utils/format/logo";

const Social = lazy(() => import("@/components/social"));
const NavigationMenu = lazy(() => import("@/components/navigation-menu"));
const HyperliquidDeposit = lazy(() => import("@/components/navigation-menu/hyper-liquid"));
const Terms = lazy(() => import("@/components/terms"));
const MaintenanceBanner = lazy(() => import("@/components/maintenance-banner"));

const HEADER_SCROLL_BLUR_PX = 35;

export default function UserActions() {
  const { pathname } = useLocation();
  const isMobile = useIsMobile();
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const { containerRef } = useLayoutContext();
  const [showHeaderBg, setShowHeaderBg] = useState(false);

  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;

    const onScroll = () => {
      setShowHeaderBg(el.scrollTop >= HEADER_SCROLL_BLUR_PX);
    };

    onScroll();
    el.addEventListener("scroll", onScroll, { passive: true });
    return () => el.removeEventListener("scroll", onScroll);
  }, [containerRef]);

  const isAppBar = useMemo(() => {
    return isMobile && (isBridgePath(pathname) || isHistoryPath(pathname));
  }, [pathname, isMobile]);

  const hideActions = useMemo(() => {
    const regs = [
      /^\/developer/,
      /^\/learn-more/
    ];
    return regs.some((reg) => reg.test(pathname));
  }, [pathname]);

  return (
    <>
      <div className="w-full fixed z-9">
        <Suspense fallback={null}>
          <MaintenanceBanner />
        </Suspense>
        <div 
        className={clsx(
          "w-full pl-1.5 md:pl-5 pr-2.5 top-0 py-4 flex justify-between items-center gap-2.5 duration-150",
          showHeaderBg && "bg-[rgba(246,248,252,0.30)] backdrop-blur-[10px]",
        )}
        >
          {
            isMobile ? (
              <>
                <div className="flex items-center gap-2">
                  <Link to="/" className="shrink-0 h-10 w-[41px] flex items-center justify-center">
                    <img
                      src={getStableflowLogo("logo-stableflow.svg")}
                      alt="StableFlow"
                      className="h-10 w-[41px] object-contain"
                    />
                  </Link>
                  <MobileMenuButton
                    isOpen={mobileMenuOpen}
                    onClick={() => setMobileMenuOpen(!mobileMenuOpen)}
                    isSimple
                  />
                </div>
                {
                  isAppBar
                    ? (
                      <AccountButton />
                    )
                    : (
                      <Link
                        to="/"
                        className="shrink-0 h-9 px-4 rounded-[26px] bg-black text-white text-[16px] font-normal leading-none flex items-center gap-2"
                      >
                        Launch App
                        <span className="text-[14px]" aria-hidden>
                          →
                        </span>
                      </Link>
                    )
                }
              </>
            ) : (
              <>
                <Suspense fallback={null}>
                  <NavigationMenu />
                </Suspense>
                <div className="shrink-0 flex items-center gap-2">
                  {!hideActions ? (
                    <AccountButton />
                  ) : (
                    <div className="h-9.5"></div>
                  )}
                  {/* Mobile menu button */}
                  <MobileMenuButton
                    isOpen={mobileMenuOpen}
                    onClick={() => setMobileMenuOpen(!mobileMenuOpen)}
                  />
                </div>
              </>
            )
          }
        </div>
      </div>
      {/* Mobile menu drawer */}
      <MobileMenuDrawer
        isOpen={mobileMenuOpen}
        onClose={() => setMobileMenuOpen(false)}
      />
    </>
  );
}

const HistoryButton = ({ onClick }: any) => {
  const pendingNumber = useHistoryStore((state) => state.pendingNumber);
  return (
    <>
      <button
        onClick={onClick}
        className="flex md:hidden relative button px-3 md:px-4.5 h-9.5 md:h-9 justify-center items-center text-[14px] gap-2 rounded-[19px] md:rounded-[18px] bg-white shadow-[0_0_6px_0_rgba(0,0,0,0.10)]"
      >
        <img
          src={getStableflowIcon("icon-records.svg")}
          alt=""
          className="w-[14px] h-[16px] object-center object-contain shrink-0"
        />
        {pendingNumber > 0 && (
          <div className="w-[9px] h-[9px] rounded-full bg-[#FFBF19] absolute right-[10px] top-[8px] border border-white z-[1]"></div>
        )}
      </button>
      <button
        onClick={onClick}
        className="hidden md:flex button px-[10px] md:px-[18px] h-[32px] md:h-[36px] justify-center items-center text-[14px] gap-[8px] rounded-[18px] bg-white shadow-[0_0_6px_0_rgba(0,0,0,0.10)]"
      >
        {pendingNumber > 0 ? (
          <>
            <div className="w-[20px] h-[20px] rounded-[50%] bg-[#6284F5] text-white font-[400] flex justify-center items-center">
              {pendingNumber}
            </div>
            <div className="font-[400]">Pending</div>
          </>
        ) : (
          <>
            <img
              src={getStableflowIcon("icon-records.svg")}
              alt=""
              className="w-[14px] h-[16px] object-center object-contain shrink-0"
            />
            <span className="text-[#444C59]">History</span>
          </>
        )}
      </button>
    </>
  );
};

const ChainsButton = ({
  onClick,
}: any) => {
  const walletsStore = useWalletsStore();
  const allTokensEnabled = useIsAllTokens();

  const chainsToDisplay = useMemo(() => {
    if (allTokensEnabled) {
      return RHEA_WALLET_TYPES.filter((type) => !!rheaChainTypes[type]);
    }
    return Object.keys(stablecoinWithChains);
  }, [allTokensEnabled]);

  return (
    <button
      onClick={onClick}
      className="p-[6px] flex justify-center items-center button rounded-[18px] bg-white shadow-[0_0_6px_0_rgba(0,0,0,0.10)]"
    >
      {
        chainsToDisplay.map((chain, index) => {
          return (
            <ChainIcon
              key={chain}
              chain={chain}
              types={allTokensEnabled ? rheaChainTypes : undefined}
              connected={!!walletsStore?.[chain as WalletType]?.account}
              className={clsx("relative", index > 0 && "ml-[-8px]")}
              style={{
                zIndex: index,
              }}
            />
          );
        })
      }
      <svg
        xmlns="http://www.w3.org/2000/svg"
        width="10"
        height="5"
        viewBox="0 0 10 5"
        fill="none"
        className="ml-[10px]"
      >
        <path
          d="M9 1L4.86207 4L1 0.999999"
          stroke="#A1A699"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
      </svg>
    </button>
  );
};

const MobileMenuButton = ({ isOpen, onClick, isSimple = false }: { isOpen: boolean; onClick: () => void; isSimple?: boolean; }) => {
  // Hide when menu is open since close button is inside the drawer
  if (isOpen) {
    return null;
  }

  return (
    <button
      onClick={onClick}
      className={clsx(
        "flex md:hidden w-[38px] h-[38px] justify-center items-center button rounded-[19px]",
        isSimple ? "" : "bg-white shadow-[0_0_6px_0_rgba(0,0,0,0.10)]",
      )}
    >
      <svg
        xmlns="http://www.w3.org/2000/svg"
        width="16"
        height="16"
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
        className="text-[#444C59]"
      >
        <line x1="3" y1="6" x2="21" y2="6" />
        <line x1="3" y1="12" x2="21" y2="12" />
        <line x1="3" y1="18" x2="21" y2="18" />
      </svg>
    </button>
  );
};

const MobileMenuDrawer = ({ isOpen, onClose }: { isOpen: boolean; onClose: () => void }) => {
  const location = useLocation();
  const mode = useRouteMode();
  const transferPath = MODE_ROUTES[mode].bridge;

  return (
    <>
      {/* Backdrop */}
      <div
        className={clsx(
          "fixed inset-0 bg-black/30 z-99 md:hidden transition-opacity duration-300",
          isOpen ? "opacity-100" : "opacity-0 pointer-events-none"
        )}
        onClick={onClose}
      />
      {/* Drawer */}
      <div
        className={clsx(
          "fixed top-0 left-0 right-0 bg-white/95 backdrop-blur-[10px] z-100 md:hidden transition-transform duration-300 ease-out max-h-[80dvh] overflow-y-auto",
          isOpen ? "translate-y-0" : "-translate-y-full"
        )}
      >
        <div className="relative flex justify-center items-center pt-[15px]">
          {/* Close button inside drawer */}
          <button
            onClick={onClose}
            className="absolute left-2 top-3.5 w-9 h-9 flex justify-center items-center button rounded-full text-[#444C59]"
            aria-label="Close menu"
          >
            <svg
              xmlns="http://www.w3.org/2000/svg"
              width="14"
              height="14"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
              className="text-[#444C59]"
            >
              <line x1="18" y1="6" x2="6" y2="18" />
              <line x1="6" y1="6" x2="18" y2="18" />
            </svg>
          </button>
          <Suspense fallback={null}>
            <HyperliquidDeposit className="flex! md:flex! w-[287px] justify-center" />
          </Suspense>
        </div>

        <div className="pt-3.5 pb-8 px-3.5">
          <nav className="flex flex-col gap-1">
            {menuItems.map((item, index) => {
              if (typeof item.path !== "string") {
                return (
                  <div className="contents" key={index}>
                    {
                      item.children.map((child, idx) => {
                        const isActive = location.pathname.startsWith(child.path);
                        return (
                          <Link
                            key={`${index}-${idx}`}
                            to={child.path}
                            target={child.isExternal ? "_blank" : undefined}
                            className={clsx(
                              "w-full h-[60px] px-4 rounded-lg text-lg text-black text-center font-['SpaceGrotesk'] flex justify-center items-center gap-2 font-normal hover:bg-[#F5F7FD] duration-150 cursor-pointer",
                              isActive ? "bg-[#F5F7FD]" : "bg-transparent",
                            )}
                            onClick={onClose}
                          >
                            {child.label}
                            {
                              child.isExternal && (
                                <svg xmlns="http://www.w3.org/2000/svg" width="11" height="11" viewBox="0 0 11 11" fill="none">
                                  <path d="M3.83333 0.5H2.5C1.39543 0.5 0.5 1.39543 0.5 2.5V8.5C0.5 9.60457 1.39543 10.5 2.5 10.5H8.5C9.60457 10.5 10.5 9.60457 10.5 8.5V7M4.5 6.81579L10.5 0.5M10.5 0.5H6.5M10.5 0.5V4.5" stroke="#9FA7BA" strokeLinecap="round" strokeLinejoin="round" />
                                </svg>
                              )
                            }
                          </Link>
                        );
                      })
                    }
                  </div>
                )
              }

              const isActive = item.path === "/"
                ? isBridgePath(location.pathname)
                : location.pathname.startsWith(item.path);

              if (item.isExternal) {
                return (
                  <a
                    key={index}
                    href={item.path}
                    target="_blank"
                    rel="noopener noreferrer"
                    onClick={onClose}
                    className={clsx(
                      "w-full h-[60px] px-4 rounded-lg text-lg text-black text-center font-['SpaceGrotesk'] font-normal hover:bg-[#F5F7FD] transition-colors duration-150 flex justify-center items-center",
                      isActive ? "bg-[#F5F7FD]" : "bg-transparent",
                    )}
                  >
                    {item.label}
                  </a>
                );
              }

              return (
                <Link
                  key={index}
                  to={item.path === "/" ? transferPath : item.path}
                  onClick={onClose}
                  className={clsx(
                    "w-full h-[60px] px-4 rounded-lg text-lg text-black text-center font-['SpaceGrotesk'] font-normal hover:bg-[#F5F7FD] transition-colors duration-150 relative flex justify-center items-center",
                    isActive ? "bg-[#F5F7FD]" : "bg-transparent",
                  )}
                >
                  <span className="flex items-center gap-[8px]">
                    {item.label}
                  </span>
                </Link>
              );
            })}
          </nav>
          <div className="mt-6 flex justify-center">
            <Suspense fallback={null}>
              <Social className="gap-4! justify-center [&_a]:w-9! [&_a]:h-9! [&_a]:bg-size-[16px_16px]!" />
            </Suspense>
          </div>
          <div onClick={onClose} className="mt-7 flex justify-center">
            <Suspense fallback={null}>
              <Terms className="w-auto! justify-center gap-11" />
            </Suspense>
          </div>
        </div>
      </div>
    </>
  );
};

const AccountButton = () => {
  const walletsStore = useWalletsStore();
  const walletStore = useWalletStore();
  const { addHistory } = useTrack();
  const navigate = useNavigate();
  const historyStore = useHistoryStore();
  const isMobile = useIsMobile();
  const { pathname } = useLocation();
  const mode = useRouteMode();

  const isHistory = useMemo(() => {
    return isHistoryPath(pathname);
  }, [pathname]);

  const isConnected = useMemo(() => {
    const accounts = Object.values(walletsStore).map((wallet) => wallet.account);
    return accounts.some((account) => !!account);
  }, [walletsStore]);

  return (
    !isConnected ? (
      <button
        onClick={() => {
          walletStore.set({ showWallet: true });
        }}
        className="button px-3.5 md:px-5 py-1.5 md:py-2 bg-[#6284F5] rounded-4.5 text-base text-white"
      >
        Connect
      </button>
    ) : (
      <div className="flex items-center gap-2">
        {!isHistory && !isMobile && (
          <HistoryButton
            onClick={() => {
              addHistory({ type: "click" });
              if (isMobile) {
                historyStore.setOpenDrawer(!historyStore.openDrawer);
                return;
              }
              navigate(MODE_ROUTES[mode].history);
            }}
          />
        )}
        <ChainsButton
          onClick={() => {
            walletStore.set({ showWallet: true });
          }}
        />
      </div>
    )
  );
};
