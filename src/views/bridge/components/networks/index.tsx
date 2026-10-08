import useWalletStore from "@/stores/use-wallet";
import useWalletsStore, { type WalletType } from "@/stores/use-wallets";
import FieldAlert from "@/components/field-alert";
import { isTemporarySwapLimitError } from "@/utils/quote-error";
import { useSwitchChain } from "wagmi";
import { lazy, Suspense, useEffect, useMemo, useRef, useState } from "react";
import Loading from "@/components/loading/icon";
import useBridgeStore from "@/stores/use-bridge";
import { formatNumber, numberRemoveEndZero } from "@/utils/format/number";
import Big from "big.js";
import FromAmountProgress from "./progress";
import NetworkCard from "./card";
import usePricesStore from "@/stores/use-prices";
import LazyImage from "@/components/lazy-image";
import { routeHybridPath } from "../../utils";
import { getStableflowIcon } from "@/utils/format/logo";
import { Service, ServiceLogoSimpleMap } from "@/services/constants";
import { formatDuration } from "@/utils/format/time";
import useBalancesStore, { type BalancesState } from "@/stores/use-balances";
import useTokenBalance from "@/hooks/use-token-balance";
import clsx from "clsx";
import { AnimatePresence, motion } from "framer-motion";
import Destination from "./destination";
import { Swiper, SwiperSlide } from "swiper/react";
import { Autoplay } from "swiper/modules";
import CostEfficientModal from "../cost-efficient-modal";
import { isInTrustWallet } from "@/libs/wallets/utils/device";
import { useInjectedTron } from "@/libs/wallets/tron/use-injected-tron";
import BridgeToolbar from "@/all-tokens/components/bridge-toolbar";

const Result = lazy(() => import("../result"));
const QuoteRoutes = lazy(() => import("../routes"));

type NetworksProps = {
  addressValidation?: {
    isValid?: boolean;
  } | null;
  isRoutes?: boolean;
  onToggleRoutes?: () => void;
  onRefreshQuote?: () => void;
};

export default function Networks({ addressValidation, isRoutes = false, onToggleRoutes, onRefreshQuote }: NetworksProps) {
  const walletStore = useWalletStore();
  const wallets = useWalletsStore();
  const bridgeStore = useBridgeStore();
  const { switchChainAsync } = useSwitchChain();
  const { prices } = usePricesStore();
  const balancesStore = useBalancesStore();
  const { loading: balanceLoading } = useTokenBalance(walletStore.fromToken, true);

  const { hasInjected } = useInjectedTron();

  const timer = useRef<ReturnType<typeof window.setTimeout> | null>(null);
  const [toggleLoading, setToggleLoading] = useState(false);
  const [isProgress, setIsProgress] = useState(false);
  const [isCostModalOpen, setIsCostModalOpen] = useState(false);

  const toggleChain = async () => {
    if (toggleLoading || (!walletStore.fromToken && !walletStore.toToken)) return;

    const fromToken = walletStore.fromToken;
    const toToken = walletStore.toToken;

    if (isInTrustWallet() && toToken?.chainType === "tron" && !hasInjected) return;

    setToggleLoading(true);

    if (toToken?.chainType === "evm") {
      await switchChainAsync({
        chainId: toToken.chainId,
        addEthereumChainParameter: {
          chainName: toToken.chainName,
          nativeCurrency: {
            name: toToken.nativeToken.symbol,
            symbol: toToken.nativeToken.symbol,
            decimals: toToken.nativeToken.decimals,
          },
          rpcUrls: toToken.rpcUrls,
          blockExplorerUrls: toToken.blockExplorerUrls,
        },
      });
    }

    return new Promise((resolve) => {
      timer.current = setTimeout(() => {
        walletStore.set({ fromToken: toToken, toToken: fromToken });
        if (timer.current) {
          clearTimeout(timer.current);
        }
        timer.current = null;
        resolve(true);
        setToggleLoading(false);
      }, 150);
    });
  };

  const quoteData = useMemo(() => {
    return bridgeStore.quoteDataMap.get(bridgeStore.quoteDataService);
  }, [bridgeStore.quoteDataMap, bridgeStore.quoteDataService]);

  const hybridPath = routeHybridPath(quoteData, bridgeStore.quoteDataService);
  const isFromTron = quoteData?.quoteParam?.fromToken?.chainType === "tron";
  const isQuoting = bridgeStore.getQuoting(bridgeStore.quoteDataService);
  const isRefreshing = bridgeStore.getQuoting();
  const isFromDisabled = !walletStore.fromToken || balanceLoading;
  const isToDisabled = isQuoting || !quoteData;

  const balance = useMemo(() => {
    if (!walletStore.fromToken) {
      return "0.00";
    }
    const key = `${walletStore.fromToken.chainType}Balances` as keyof BalancesState;
    const _balance = balancesStore[key]?.[walletStore.fromToken.chainId || walletStore.fromToken.blockchain]?.[walletStore.fromToken.contractAddress];
    return _balance ? _balance : "0.00";
  }, [walletStore.fromToken, balancesStore]);

  const fromWallet = walletStore.fromToken ? wallets[walletStore.fromToken.chainType as WalletType] : undefined;
  const errorConnect = !!fromWallet && !fromWallet.account;
  const errorConnectEvm = (
    [Service.OneClickUsdt0, Service.OneClickCCTP, Service.CCTPOneClick, Service.FraxZeroOneClick, Service.OneClickFraxZero] as Service[]
  ).includes(bridgeStore.quoteDataService) && !wallets.evm?.account;
  const showsFieldError = !errorConnect && !errorConnectEvm;
  const swapLimitAlert = showsFieldError && isTemporarySwapLimitError(bridgeStore.errorTips);
  const balanceAlert = showsFieldError && bridgeStore.errorTips === "Insufficient balance";

  useEffect(() => {
    return () => {
      if (timer.current) {
        clearTimeout(timer.current);
      }
    };
  }, []);

  return (
    <div className="w-full px-[10px] md:px-0">
      <div className="w-full flex justify-between items-center">
        <div className="text-[#444C59] text-sm md:text-base w-full flex items-center gap-1">
          <div className="select-none">
            <span className="hidden md:inline">Best price</span> <span>compared</span> <span className="hidden md:inline">with</span>
          </div>
          <div className="w-17.5 h-5 overflow-hidden shrink-0">
            <Swiper
              className="w-full h-full"
              slidesPerView={1}
              loop={true}
              modules={[Autoplay]}
              autoplay={{
                delay: 3000,
                pauseOnMouseEnter: false,
              }}
            >
              <SwiperSlide>
                <img
                  src="/about/icons/icon-usdt0-gray.png"
                  alt=""
                  className="w-17.5 h-5 object-center object-contain"
                />
              </SwiperSlide>
              <SwiperSlide>
                <img
                  src="/about/icons/icon-circle-gray.png"
                  alt=""
                  className="w-17.5 h-5 object-center object-contain"
                />
              </SwiperSlide>
            </Swiper>
          </div>
          <button
            type="button"
            className="w-3.5 h-3.5 shrink-0 flex justify-center items-center cursor-pointer"
            onClick={() => setIsCostModalOpen(true)}
          >
            <img
              src={getStableflowIcon("icon-info.svg")}
              alt=""
              className="w-full h-full object-center object-contain"
            />
          </button>
        </div>
        <BridgeToolbar isQuoting={isRefreshing} onRefreshQuote={onRefreshQuote} />
      </div>
      <CostEfficientModal
        open={isCostModalOpen}
        onClose={() => setIsCostModalOpen(false)}
      />

      <div className="relative w-full">
        <NetworkCard
          key="from"
          direction="from"
          className="mt-2"
          titleContent="From"
          amount={bridgeStore.amount}
          onAmountChange={(value: string) => {
            bridgeStore.set({ amount: value });
          }}
          token={walletStore.fromToken}
          prices={prices}
          disabled={!walletStore.fromToken}
          valueAlert={swapLimitAlert}
          rightContent={(
            <div className="flex items-center justify-end gap-3.5">
              {
                !!walletStore.fromToken && (
                  <FieldAlert active={balanceAlert} iconPosition="start">
                    <div className="flex items-center gap-1 text-xs text-[#9FA7BA] leading-[100%] font-['SpaceGrotesk] font-normal">
                      <div className="">
                        Balance:
                      </div>
                      <div className="text-[#0E3616]">
                        {
                          balanceLoading ? (
                            <Loading size={12} className="text-[#B3BBCE]" />
                          ) : formatNumber(balance, 2, true, { round: Big.roundDown })
                        }
                      </div>
                    </div>
                  </FieldAlert>
                )
              }
              <div className="flex items-center gap-1.5">
                <button
                  type="button"
                  disabled={isFromDisabled}
                  className={clsx(
                    "cursor-pointer hover:bg-[#FAFBFF] duration-150 disabled:cursor-not-allowed disabled:opacity-30 flex justify-center items-center shrink-0 border bg-white h-6 w-10 rounded-xl text-[#9FA7BA] text-xs font-normal leading-[100%] font-['SpaceGrotesk']",
                    isProgress ? "border-[#6284F5]" : "border-[#F2F2F2]",
                  )}
                  onClick={() => {
                    setIsProgress((prev) => !prev);
                  }}
                >
                  <svg width="20" height="9" viewBox="0 0 20 9" fill="none" xmlns="http://www.w3.org/2000/svg">
                    <path d="M0.800049 4.50018H18.8" stroke={isProgress ? "#6284F5" : "#9FA7BA"} strokeWidth="1.6" strokeLinecap="round" />
                    <circle cx="9.80005" cy="4.5" r="3.7" fill="white" stroke={isProgress ? "#6284F5" : "#9FA7BA"} strokeWidth="1.6" />
                  </svg>
                </button>
                <button
                  type="button"
                  disabled={isFromDisabled}
                  className="cursor-pointer hover:bg-[#FAFBFF] duration-150 disabled:cursor-not-allowed disabled:opacity-30 flex justify-center items-center shrink-0 border border-[#F2F2F2] bg-white h-6 w-10 rounded-xl text-[#9FA7BA] text-xs font-normal leading-[100%] font-['SpaceGrotesk']"
                  onClick={() => {
                    bridgeStore.set({ amount: numberRemoveEndZero(balance) });
                  }}
                >
                  Max
                </button>
              </div>
            </div>
          )}
        >
          <AnimatePresence>
            {
              isProgress && (
                <motion.div
                  initial={{ height: 0, opacity: 0 }}
                  animate={{ height: "auto", opacity: 1 }}
                  exit={{ height: 0, opacity: 0 }}
                  transition={{
                    duration: 0.15,
                    ease: "linear"
                  }}
                  className="overflow-hidden"
                >
                  <FromAmountProgress
                    amount={bridgeStore.amount}
                    balance={balance}
                    token={walletStore.fromToken}
                    onAmountChange={(value: string) => {
                      bridgeStore.set({ amount: value });
                    }}
                    balanceLoading={balanceLoading}
                  />
                </motion.div>
              )
            }
          </AnimatePresence>
        </NetworkCard>

        <div className="w-full h-1.5 relative">
          <ExchangeButton
            onClick={toggleChain}
            loading={toggleLoading}
          />
        </div>

        <NetworkCard
          key="to"
          direction="to"
          className=""
          titleContent={(
            <div className="flex items-center justify-start gap-2 h-4">
              <div className="">To</div>
              <Destination
                token={walletStore.toToken}
                isTo={true}
                addressValidation={addressValidation}
              />
            </div>
          )}
          amount={quoteData?.outputAmount}
          token={walletStore.toToken}
          prices={prices}
          disabled={isToDisabled}
          rightContent={(
            <div className="flex items-center justify-end gap-5 pr-3">
              <div className={clsx("flex items-center gap-0 duration-150", isRoutes ? "opacity-0" : "opacity-100")}>
                {
                  isToDisabled
                    ? (
                      null
                    )
                    : (
                      hybridPath?.length > 0
                        ? hybridPath.map((route, idx) => (
                          <>
                            <LazyImage
                              key={`simplePathImg${idx}`}
                              src={ServiceLogoSimpleMap[route.service]}
                              containerClassName="w-4 h-4 shrink-0"
                            />
                            {
                              idx < hybridPath.length - 1 && (
                                <LazyImage
                                  key={`simplePathArrow${idx}`}
                                  src={getStableflowIcon("icon-arrow-down.svg")}
                                  containerClassName="w-4 h-1.5 -rotate-90"
                                />
                              )
                            }
                          </>
                        ))
                        : (
                          <LazyImage
                            src={ServiceLogoSimpleMap[bridgeStore.quoteDataService]}
                            containerClassName="w-4 h-4 shrink-0"
                          />
                        )
                    )
                }
              </div>
              <div className="flex items-center gap-2 text-xs text-[#444C59] leading-[100%] font-normal font-['SpaceGrotesk']">
                <AnimatePresence>
                  {
                    !isRoutes && (
                      <motion.div
                        className={clsx("flex items-center gap-4")}
                        initial={{ opacity: 0 }}
                        animate={{ opacity: 1 }}
                        exit={{ opacity: 0 }}
                      >
                        <div className={clsx("flex items-center gap-1", isToDisabled ? "opacity-30" : "")}>
                          <LazyImage
                            src={getStableflowIcon("icon-fee.svg")}
                            containerClassName="w-3 h-3.5 shrink-0"
                          />
                          {
                            isToDisabled ? (
                              <div className="">
                                $-
                              </div>
                            ) : (
                              <div className="">
                                {
                                  (([Service.OneClick, Service.OneClickUsdt0, Service.OneClickCCTP] as Service[]).includes(bridgeStore.quoteDataService) && isFromTron) ? (
                                    bridgeStore.acceptTronEnergy ?
                                      formatNumber(quoteData?.energySourceGasFeeUsd, 2, true, { prefix: "$", isZeroPrecision: true, round: Big.roundDown }) :
                                      formatNumber(quoteData?.transferSourceGasFeeUsd, 2, true, { prefix: "$", isZeroPrecision: true, round: Big.roundDown })
                                  ) :
                                    formatNumber(quoteData?.estimateSourceGasUsd, 2, true, { prefix: "$", isZeroPrecision: true, round: Big.roundDown })
                                }
                              </div>
                            )
                          }
                        </div>
                        <div className={clsx("flex items-center gap-1", isToDisabled ? "opacity-30" : "")}>
                          <LazyImage
                            src={getStableflowIcon("icon-time.svg")}
                            containerClassName="w-3.5 h-3.5 shrink-0"
                          />
                          <div className="">
                            {isToDisabled ? "-" : `~${formatDuration(quoteData?.estimateTime, { compound: true })}`}
                          </div>
                        </div>
                      </motion.div>
                    )
                  }
                </AnimatePresence>
                <button
                  type="button"
                  className="cursor-pointer pl-2 py-1.5 hover:opacity-80 duration-150"
                  onClick={() => {
                    onToggleRoutes?.();
                  }}
                >
                  <LazyImage
                    src={getStableflowIcon("icon-arrow-down.svg")}
                    containerClassName={clsx(
                      "w-[15px] h-[7px] shrink-0 duration-150",
                      isRoutes ? "rotate-180" : "",
                    )}
                  />
                </button>
              </div>
            </div>
          )}
        >
          <AnimatePresence>
            {
              isRoutes && (
                <motion.div
                  initial={{ height: 0, opacity: 0 }}
                  animate={{ height: "auto", opacity: 1 }}
                  exit={{ height: 0, opacity: 0 }}
                  transition={{
                    duration: 0.15,
                    ease: "linear"
                  }}
                  className="overflow-hidden border-t border-[#EBF0F8] mt-4"
                >
                  <Suspense fallback={null}>
                    <Result />
                  </Suspense>
                  <Suspense fallback={null}>
                    <QuoteRoutes />
                  </Suspense>
                </motion.div>
              )
            }
          </AnimatePresence>
        </NetworkCard>
      </div>
    </div>
  );
}

const ExchangeButton = ({ onClick, loading }: { onClick: () => void; loading: boolean; }) => {
  return (
    <button
      type="button"
      onClick={onClick}
      className="absolute z-1 top-1/2 -translate-y-1/2 left-1/2 -translate-x-1/2 flex items-center justify-center button w-8 h-8 rounded-lg bg-white border border-[#F2F2F2] shadow-[0_0_6px_0_rgba(0,0,0,0.10)] duration-150 hover:shadow-[0_0_3px_0_rgba(0,0,0,0.06)]"
    >
      {
        loading ? (
          <Loading size={12} className="text-[#B3BBCE]" />
        ) : (
          <svg
            xmlns="http://www.w3.org/2000/svg"
            width="12"
            height="12"
            viewBox="0 0 12 12"
            fill="none"
            className="shrink-0 rotate-90"
          >
            <path
              d="M1 3.8913H10.913L7.6087 1"
              stroke="#B3BBCE"
              strokeWidth="1.3"
              strokeLinecap="round"
              strokeLinejoin="round"
            />
            <path
              d="M10.9131 7.6087H1.00004L4.30439 10.5"
              stroke="#B3BBCE"
              strokeWidth="1.3"
              strokeLinecap="round"
              strokeLinejoin="round"
            />
          </svg>
        )
      }
    </button>
  );
};
