import useIsMobile from "@/hooks/use-is-mobile";
import { useTrack } from "@/hooks/use-track";
import { getStableflowIcon } from "@/utils/format/logo";
import clsx from "clsx";
import { lazy, Suspense, useEffect, useMemo, useState } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import { useZendeskContext } from "../components/zendesk-widget";
import { isBridgePath, isHistoryPath, MODE_ROUTES, useRouteMode } from "@/all-tokens/route-mode";

const Terms = lazy(() => import("../components/terms"));

const Footer = (props: any) => {
  const { className, containerRef } = props;

  const isMobile = useIsMobile();
  const { pathname } = useLocation();
  const navigate = useNavigate();
  const mode = useRouteMode();
  const bridgePath = MODE_ROUTES[mode].bridge;
  const historyPath = MODE_ROUTES[mode].history;
  const { addHistory } = useTrack();
  const {
    opened: isZendeskOpened,
    mounted: isZendeskMounted,
    onOpen: onZendeskOpen,
  } = useZendeskContext();

  const [isNearBottom, setIsNearBottom] = useState(false);

  const isAppBar = useMemo(() => {
    return isMobile && (isBridgePath(pathname) || isHistoryPath(pathname));
  }, [pathname, isMobile]);

  useEffect(() => {
    const container = containerRef?.current;
    if (!container) return;

    const updateBottomState = () => {
      const distanceToBottom = container.scrollHeight - container.scrollTop - container.clientHeight;
      setIsNearBottom(distanceToBottom <= 44);
    };

    updateBottomState();
    container.addEventListener("scroll", updateBottomState, { passive: true });

    return () => {
      container.removeEventListener("scroll", updateBottomState);
    };
  }, [containerRef]);

  return (
    <div className={clsx(
      "w-full flex justify-between items-center z-11",
      isAppBar ? "shadow-[0_-2px_2px_0_rgba(0,0,0,0.05)] fixed left-0 bottom-0 gap-0" : "gap-1 static md:fixed bottom-2 py-1 pl-4 pr-2.5",
      className,
    )}>
      {
        isAppBar
          ? (
            <>
              <button
                type="button"
                className={clsx(
                  "cursor-pointer duration-150 backdrop-blur-md h-15 flex-1 flex justify-center items-center gap-2 text-[#444C59] text-base font-normal leading-[100%]",
                  pathname === bridgePath ? "bg-[#F7F9FD]" : "bg-white",
                )}
                onClick={() => {
                  if (pathname === bridgePath) return;
                  navigate(bridgePath);
                }}
              >
                <svg width="16" height="13" viewBox="0 0 16 13" fill="none" xmlns="http://www.w3.org/2000/svg">
                  <path d="M0.965633 5.25253H15.021C15.5547 5.25253 15.9866 4.81317 15.9866 4.27011C15.9866 3.72705 15.5547 3.28769 15.021 3.28769H3.30997L4.89254 1.67762C5.27075 1.29284 5.27075 0.670638 4.89254 0.288586C4.51433 -0.0961952 3.90277 -0.0961952 3.52724 0.288586L0.383571 3.48418C0.15021 3.66429 0 3.9481 0 4.27011C0 4.81317 0.431852 5.25253 0.965633 5.25253ZM15.7184 8.03605C15.4904 7.80409 15.1738 7.71131 14.8761 7.76316H0.965633C0.431852 7.76316 0 8.20252 0 8.74558C0 9.28864 0.431852 9.728 0.965633 9.728H12.69L11.1209 11.3244C10.7427 11.7092 10.7427 12.3314 11.1209 12.7135C11.3086 12.9045 11.5554 13 11.8049 13C12.0543 13 12.2984 12.9045 12.4889 12.7135L15.7184 9.42781C16.0939 9.04303 16.0939 8.42083 15.7184 8.03605Z" fill="black" />
                </svg>
                <div className="">
                  Transfer
                </div>
              </button>
              <button
                type="button"
                className={clsx(
                  "cursor-pointer duration-150 backdrop-blur-md h-15 flex-1 flex justify-center items-center gap-2 text-[#444C59] text-base font-normal leading-[100%]",
                  pathname === historyPath ? "bg-[#F7F9FD]" : "bg-white",
                )}
                onClick={() => {
                  if (pathname === historyPath) return;
                  navigate(historyPath);
                  addHistory({ type: "click" });
                }}
              >
                <svg xmlns="http://www.w3.org/2000/svg" width="19" height="19" viewBox="0 0 19 19" fill="none">
                  <path d="M9.5 17.4167C13.8724 17.4167 17.4167 13.8724 17.4167 9.5C17.4167 5.12762 13.8724 1.58333 9.5 1.58333C5.12762 1.58333 1.58333 5.12762 1.58333 9.5C1.58333 13.8724 5.12762 17.4167 9.5 17.4167ZM9.5 19C4.25362 19 0 14.7464 0 9.5C0 4.25362 4.25362 0 9.5 0C14.7464 0 19 4.25362 19 9.5C19 14.7464 14.7464 19 9.5 19ZM10.2917 9.96629V5.53929C10.2917 5.10862 9.937 4.75 9.5 4.75C9.05983 4.75 8.70833 5.10308 8.70833 5.53929V10.294C8.70767 10.3968 8.72733 10.4986 8.76618 10.5937C8.80504 10.6889 8.86233 10.7753 8.93475 10.8482L11.1847 13.0981C11.2581 13.1711 11.3452 13.2288 11.4409 13.268C11.5367 13.3073 11.6393 13.3272 11.7428 13.3267C11.8462 13.3262 11.9486 13.3052 12.044 13.265C12.1394 13.2249 12.2259 13.1663 12.2985 13.0926C12.446 12.9451 12.5293 12.7454 12.5303 12.5368C12.5314 12.3282 12.4501 12.1277 12.3041 11.9787L10.2917 9.96629Z" fill="#3D3D3D" />
                </svg>
                <div className="">
                  History
                </div>
              </button>
            </>
          )
          : (
            <>
              <div className="hidden md:block"></div>
              <div className="w-full md:w-auto flex justify-between flex-row-reverse md:flex-row md:justify-end items-end gap-9">
                <Suspense fallback={null}>
                  <Terms />
                </Suspense>
                <Suspense fallback={null}>
                </Suspense>
                {
                  isZendeskMounted && !isZendeskOpened && (
                    <button
                      type="button"
                      className={clsx(
                        "fixed md:static z-12 button text-md font-[SpaceGrotesk] font-normal leading-[100%] flex justify-center items-center gap-2 bg-black text-white h-9 pl-3 pr-4.5 rounded-3xl",
                        isNearBottom ? "bottom-2" : "bottom-2",
                      )}
                      onClick={() => {
                        onZendeskOpen();
                      }}
                    >
                      <img
                        src={getStableflowIcon("icon-help.svg")}
                        alt=""
                        className="w-4 h-4 object-center object-contain shrink-0"
                      />
                      <div>
                        Help
                      </div>
                    </button>
                  )
                }
              </div>
            </>
          )
      }
    </div>
  );
};

export default Footer;
