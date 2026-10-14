import { Link, useLocation } from "react-router-dom";
import clsx from "clsx";
import { getStableflowLogo } from "@/utils/format/logo";
import Popover from "../popover";
import { lazy, Suspense, useRef } from "react";
import { menuItems } from "./menu-items";
import { isBridgePath, MODE_ROUTES, useRouteMode } from "@/all-tokens/route-mode";

const Social = lazy(() => import("@/components/social"));
const HyperliquidDeposit = lazy(() => import("@/components/navigation-menu/hyper-liquid"));

export default function NavigationMenu() {
  const location = useLocation();
  const mode = useRouteMode();
  const transferPath = MODE_ROUTES[mode].bridge;

  const popoverRef = useRef<any>(null);

  return (
    <nav className="flex items-center gap-6 md:gap-7.5">
      <Link to="/" className="shrink-0 flex items-center">
        <img
          src={getStableflowLogo("logo-stableflow-full-2.svg")}
          alt="StableFlow"
          className="w-33.5 h-8 md:h-8"
        />
      </Link>
      <div className="hidden md:flex items-center gap-6 md:gap-8">
        {menuItems.map((item, index) => {
          if (typeof item.path !== "string") {
            return (
              <Popover
                key={index}
                ref={popoverRef}
                placement="Bottom"
                trigger="Hover"
                offset={14}
                content={(
                  <div className="w-53 bg-white shadow-[0_0_10px_0_rgba(0,0,0,0.10)] rounded-2xl pt-1.5 pb-5.5 font-normal text-base text-[#444C59] font-['SpaceGrotesk']">
                    <div className="px-1.5">
                      {item.children.map((child, index) => {
                        const isActive = location.pathname.startsWith(child.path);
                        return (
                          <Link
                            key={index}
                            to={child.path}
                            className={clsx(
                              "w-full h-11 rounded-lg flex justify-between items-center gap-2 px-3.5 hover:bg-[#F5F7FD] duration-150 cursor-pointer",
                              isActive ? "bg-[#F5F7FD]" : "bg-white",
                            )}
                            target={child.isExternal ? "_blank" : undefined}
                            onClick={() => popoverRef.current?.close()}
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
                      })}
                    </div>
                    <div className="border-t border-[#F2F2F2] mt-0.5 pt-3.5 px-5">
                      <div className="">
                        Social
                      </div>
                      <Suspense fallback={null}>
                        <Social className="gap-2.5! mt-3" />
                      </Suspense>
                    </div>
                  </div>
                )}
                triggerContainerClassName="flex justify-center items-center gap-1.5 group cursor-pointer"
              >
                <div className="text-[#444C59] text-sm font-normal font-['SpaceGrotesk'] group-hover:text-black group-hover:font-medium duration-150">
                  More
                </div>
                <svg
                  xmlns="http://www.w3.org/2000/svg"
                  width="11"
                  height="5"
                  viewBox="0 0 11 5"
                  fill="none"
                  className="rotate-180 group-hover:rotate-0 duration-150"
                >
                  <path d="M0.5 4.5L5.67241 0.5L10.5 4.5" stroke="#444C59" strokeLinecap="round" strokeLinejoin="round" />
                </svg>
              </Popover>
            );
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
                className={clsx(
                  "text-sm md:text-[15px] font-normal hover:text-black transition-colors duration-150",
                  isActive ? "text-black" : "text-[#444C59]",
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
              className={clsx(
                "text-[14px] md:text-[15px] hover:text-black font-normal transition-colors duration-150 relative",
                isActive ? "text-black" : "text-[#444C59]",
              )}
            >
              {item.label}
              {isActive && (
                <div className="w-7.5 mx-auto absolute -bottom-1 left-0 right-0 h-[2px] bg-[#0E3616] rounded-full" />
              )}
            </Link>
          );
        })}
      </div>
      <Suspense>
        <HyperliquidDeposit />
      </Suspense>
    </nav>
  );
}
