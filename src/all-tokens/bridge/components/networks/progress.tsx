import InputNumber from "@/components/input-number";
import { numberRemoveEndZero } from "@/utils/format/number";
import Big from "big.js";
import clsx from "clsx";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";

const CURSOR_SIZE = 16;
const MAX_PROGRESS = 100;
const PROGRESS_DECIMALS = 2;

type TokenLike = { decimals?: number } | null | undefined;

const formatProgressValue = (value: number) => {
  return numberRemoveEndZero(Big(value || 0).round(PROGRESS_DECIMALS, Big.roundUp).toFixed(PROGRESS_DECIMALS)) || "0";
};

export type FromAmountProgressProps = {
  amount: string;
  balance: string;
  balanceLoading: boolean;
  token: TokenLike;
  onAmountChange: (value: string) => void;
};

const FromAmountProgress = ({
  amount,
  balance,
  balanceLoading,
  token,
  onAmountChange
}: FromAmountProgressProps) => {
  const invalidBalance = useMemo(() => {
    if (balance == null || balance === "" || balance === "-") return true;
    const n = Number(balance);
    return !Number.isFinite(n) || n <= 0;
  }, [balance]);

  const [progress, setProgress] = useState(0);
  const [progressInputValue, setProgressInputValue] = useState("0");
  const [isEditingProgress, setIsEditingProgress] = useState(false);
  const [isDragging, setIsDragging] = useState(false);
  const progressBarRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (invalidBalance) {
      setProgress(0);
      return;
    }
    if (!amount || amount === "0") {
      setProgress(0);
      return;
    }
    const p = Math.min(MAX_PROGRESS, (Number(amount) / Number(balance)) * MAX_PROGRESS);
    setProgress(Math.max(0, p));
  }, [amount, balance, invalidBalance]);

  useEffect(() => {
    if (isEditingProgress) return;
    setProgressInputValue(formatProgressValue(progress));
  }, [progress, isEditingProgress]);

  const handleProgressChange = useCallback(
    (newProgress: number) => {
      if (balanceLoading) {
        return;
      }
      const clamped = Math.max(0, Math.min(MAX_PROGRESS, newProgress));
      setProgress(clamped);
      const _amount = Big(balance)
        .mul(clamped / 100)
        .toFixed(token?.decimals ?? 6);
      onAmountChange(numberRemoveEndZero(_amount));
    },
    [balance, token?.decimals, onAmountChange, balanceLoading]
  );

  const handleProgressInputChange = useCallback(
    (value: string) => {
      if (balanceLoading) {
        return;
      }
      if (!value) {
        setProgressInputValue("");
        setProgress(0);
        onAmountChange("");
        return;
      }
      const nextProgress = Math.min(MAX_PROGRESS, Number(value));
      if (!Number.isFinite(nextProgress)) {
        return;
      }
      const nextValue = nextProgress === MAX_PROGRESS ? String(MAX_PROGRESS) : value;
      setProgressInputValue(nextValue);
      handleProgressChange(nextProgress);
    },
    [balanceLoading, handleProgressChange, onAmountChange]
  );

  const setProgressFromClientX = useCallback(
    (clientX: number) => {
      if (balanceLoading) {
        return;
      }
      const el = progressBarRef.current;
      if (!el) return;
      const rect = el.getBoundingClientRect();
      if (rect.width <= 0) return;
      const x = clientX - rect.left;
      const percentage = (x / rect.width) * 100;
      handleProgressChange(percentage);
    },
    [handleProgressChange]
  );

  const handleProgressBarClick = (e: React.MouseEvent) => {
    if (balanceLoading) {
      return;
    }
    setProgressFromClientX(e.clientX);
  };

  const handleProgressBarTouch = (e: React.TouchEvent) => {
    if (balanceLoading) {
      return;
    }
    const touch = e.touches[0];
    if (!touch) return;
    setProgressFromClientX(touch.clientX);
  };

  const handleThumbMouseDown = (e: React.MouseEvent) => {
    if (balanceLoading) {
      return;
    }
    e.preventDefault();
    setIsDragging(true);
  };

  const handleThumbTouchStart = (e: React.TouchEvent) => {
    if (balanceLoading) {
      return;
    }
    e.preventDefault();
    setIsDragging(true);
  };

  const handleMouseMove = useCallback(
    (e: MouseEvent) => {
      if (!isDragging || balanceLoading) return;
      setProgressFromClientX(e.clientX);
    },
    [isDragging, setProgressFromClientX]
  );

  const handleTouchMove = useCallback(
    (e: TouchEvent) => {
      if (!isDragging || balanceLoading) return;
      const touch = e.touches[0];
      if (!touch) return;
      setProgressFromClientX(touch.clientX);
    },
    [isDragging, setProgressFromClientX]
  );

  const handleMouseUp = useCallback(() => {
    setIsDragging(false);
  }, []);

  const handleTouchEnd = useCallback(() => {
    setIsDragging(false);
  }, []);

  useEffect(() => {
    if (!isDragging) return;
    document.addEventListener("mousemove", handleMouseMove);
    document.addEventListener("mouseup", handleMouseUp);
    document.addEventListener("touchmove", handleTouchMove, {
      passive: false
    });
    document.addEventListener("touchend", handleTouchEnd);
    return () => {
      document.removeEventListener("mousemove", handleMouseMove);
      document.removeEventListener("mouseup", handleMouseUp);
      document.removeEventListener("touchmove", handleTouchMove);
      document.removeEventListener("touchend", handleTouchEnd);
    };
  }, [isDragging, handleMouseMove, handleMouseUp, handleTouchMove, handleTouchEnd]);

  return (
    <div className="flex items-center gap-5 mt-2.5 pl-5 pr-2.5">
      <div className="flex-1">
        <div
          ref={progressBarRef}
          className={clsx(
            "w-full h-1.5 bg-[#EDF0F7] rounded-sm relative",
            balanceLoading ? "cursor-not-allowed opacity-30" : "cursor-pointer",
          )}
          onClick={handleProgressBarClick}
          onTouchStart={handleProgressBarTouch}
        >
          <div
            className="h-full bg-[#6284F5] rounded-sm pointer-events-none"
            style={{ width: `${progress}%` }}
          />
          <button
            type="button"
            disabled={balanceLoading}
            className={clsx(
              "bg-white rounded-full absolute top-1/2 -translate-y-1/2 left-0 w-4 h-4 border border-[#D2D2D2] shadow-sm",
              balanceLoading ? "cursor-not-allowed opacity-30" : "cursor-pointer",
            )}
            style={{
              width: CURSOR_SIZE,
              height: CURSOR_SIZE,
              left: `calc(${progress}% - ${CURSOR_SIZE / 2}px)`
            }}
            onMouseDown={handleThumbMouseDown}
            onTouchStart={handleThumbTouchStart}
            onClick={(e) => {
              e.stopPropagation();
            }}
          />
        </div>
        <div className="w-full mt-2 flex items-center justify-between">
          {[0, 0.25, 0.5, 0.75, 1].map((percent) => (
            <button
              type="button"
              disabled={balanceLoading}
              className={clsx(
                "w-7.5 text-center text-xs text-[#9FA7BA] font-normal leading-[100%] font-['SpaceGrotesk']",
                balanceLoading ? "cursor-not-allowed opacity-30" : "cursor-pointer",
              )}
              key={percent}
              onClick={() => {
                handleProgressChange(percent * 100);
              }}
            >
              {percent * 100}%
            </button>
          ))}
        </div>
      </div>
      <div className="border border-[#F2F2F2] rounded-lg bg-white h-9.5 w-18 shrink-0 text-[#0E3616] text-sm flex justify-center items-center gap-0.5">
        <InputNumber
          className="w-11 bg-transparent text-[#0E3616] text-sm text-right outline-none font-['SpaceGrotesk'] disabled:cursor-not-allowed"
          value={progressInputValue}
          decimals={PROGRESS_DECIMALS}
          disabled={balanceLoading}
          onFocus={() => {
            setIsEditingProgress(true);
          }}
          onBlur={() => {
            setIsEditingProgress(false);
            setProgressInputValue(formatProgressValue(progress));
          }}
          onNumberChange={handleProgressInputChange}
        />
        <span>%</span>
      </div>
    </div>
  );
};

export default FromAmountProgress;
