import React, { Suspense, lazy, useEffect, useState } from "react";

const fallbackProvider = (children: React.ReactNode) => <>{children}</>;
const makeLazy = (importFn: () => Promise<any>) =>
  lazy(() => importFn().catch(() => ({ default: ({ children }: { children: React.ReactNode }) => fallbackProvider(children) })));

const WALLET_PROVIDER_IMPORTS = [
  () => import("./okxconnect"),
  () => import("./rainbow/provider"),
  () => import("./solana/provider"),
  () => import("./near/provider"),
  () => import("./tron/provider"),
  () => import("./aptos/provider"),
  () => import("./ton/provider"),
  () => import("./sui/provider"),
  () => import("@/all-tokens/wallets/btc/provider"),
  () => import("@/all-tokens/wallets/zcash/provider"),
] as const;

// @okxconnect/core + @okxconnect/universal-provider moved out of main bundle
const OKXConnectProvider = makeLazy(WALLET_PROVIDER_IMPORTS[0]);
const RainbowProvider = makeLazy(WALLET_PROVIDER_IMPORTS[1]);
const SolanaProvider = makeLazy(WALLET_PROVIDER_IMPORTS[2]);
const NEARProvider = makeLazy(WALLET_PROVIDER_IMPORTS[3]);
const TronProvider = makeLazy(WALLET_PROVIDER_IMPORTS[4]);
const AptosProvider = makeLazy(WALLET_PROVIDER_IMPORTS[5]);
const TonProvider = makeLazy(WALLET_PROVIDER_IMPORTS[6]);
const SuiProvider = makeLazy(WALLET_PROVIDER_IMPORTS[7]);
const BtcProvider = makeLazy(WALLET_PROVIDER_IMPORTS[8]);
const ZcashProvider = makeLazy(WALLET_PROVIDER_IMPORTS[9]);

const TOTAL_PROVIDERS = WALLET_PROVIDER_IMPORTS.length;
const PROVIDER_WEIGHTS = [10, 10, 10, 10, 10, 10, 10, 10, 10, 10] as const;
const PROVIDER_PENDING_CAPS = [8, 8, 8, 8, 8, 8, 8, 8, 8, 8] as const;

const LoadingSpinner = ({
  progress
}: {
  progress: number;
}) => {
  const clampedProgress = Math.max(0, Math.min(100, progress));

  return (
    <div className="w-full h-dvh flex justify-center items-center px-4">
      <div className="w-full max-w-xs flex flex-col items-center gap-4">
      <img
        src="https://assets.dapdap.net/stableflow/logos/logo-stableflow.svg"
        alt="Loading"
        className="w-30 h-30 object-center object-contain animate-pulse"
      />
        <div
          className="w-full h-2 rounded-full bg-[#D7DFEF] overflow-hidden"
          role="progressbar"
          aria-label="Wallet providers loading progress"
          aria-valuemin={0}
          aria-valuemax={100}
          aria-valuenow={Math.round(clampedProgress)}
        >
          <div
            className="h-full rounded-full bg-[#4D79FC] transition-[width] duration-300 ease-out"
            style={{ width: `${clampedProgress}%` }}
          />
        </div>
        <p className="text-xs text-[#5E6A82] tabular-nums">
          {Math.round(clampedProgress)}% / 100%
        </p>
      </div>
    </div>
  );
};

export default function WalletsProvider({
  children
}: {
  children: React.ReactNode;
}) {
  const [progress, setProgress] = useState(0);
  const [prefetchDone, setPrefetchDone] = useState(false);

  useEffect(() => {
    let cancelled = false;
    let loadedCount = 0;
    const providerProgress = Array(TOTAL_PROVIDERS).fill(0) as number[];
    const timers: Array<ReturnType<typeof setInterval>> = [];

    const updateProgress = () => {
      if (cancelled) return;
      const total = providerProgress.reduce((sum, item) => sum + item, 0);
      setProgress(Math.min(100, total));
    };

    const growToCap = (index: number) => {
      const cap = PROVIDER_PENDING_CAPS[index];
      const timer = setInterval(() => {
        if (cancelled) {
          clearInterval(timer);
          return;
        }

        if (providerProgress[index] >= cap) {
          clearInterval(timer);
          return;
        }

        providerProgress[index] = Math.min(cap, providerProgress[index] + 1);
        updateProgress();
      }, 120);

      timers.push(timer);
    };

    WALLET_PROVIDER_IMPORTS.forEach((importFn, index) => {
      growToCap(index);
      importFn()
        .catch(() => null)
        .finally(() => {
          if (cancelled) return;

          providerProgress[index] = PROVIDER_WEIGHTS[index];
          updateProgress();
          loadedCount += 1;

          if (loadedCount >= TOTAL_PROVIDERS) {
            setProgress(100);
            setPrefetchDone(true);
          }
        });
    });

    return () => {
      cancelled = true;
      timers.forEach((timer) => clearInterval(timer));
    };
  }, []);

  if (!prefetchDone) {
    return <LoadingSpinner progress={progress} />;
  }

  return (
    <Suspense fallback={<LoadingSpinner progress={100} />}>
      <OKXConnectProvider>
        <RainbowProvider>
          <SolanaProvider>
            <NEARProvider>
              <TronProvider>
                <AptosProvider>
                  <TonProvider>
                    <SuiProvider>
                      <BtcProvider>
                        <ZcashProvider>
                          {children}
                        </ZcashProvider>
                      </BtcProvider>
                    </SuiProvider>
                  </TonProvider>
                </AptosProvider>
              </TronProvider>
            </NEARProvider>
          </SolanaProvider>
        </RainbowProvider>
      </OKXConnectProvider>
    </Suspense>
  );
}
