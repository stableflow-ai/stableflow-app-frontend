import LazyImage from "@/components/lazy-image";
import useRheaTokensStore from "@/all-tokens/rhea-tokens-store";
import { DefaultIcon, getStableflowTokenLogo } from "@/utils/format/logo";
import clsx from "clsx";
import { useMemo } from "react";

type TokenIconProps = {
  /** Prefer when caller already has a URL (API or mapped token.icon). */
  src?: string;
  symbol?: string;
  blockchain?: string;
  width?: number;
  height?: number;
  className?: string;
  containerClassName?: string;
};

const isPresent = (v?: string | null): boolean =>
  !!v && String(v).trim() !== "";

/** Token icon via src / store / CDN logo; load failure falls back to DefaultIcon. */
export default function TokenIcon({
  src,
  symbol,
  blockchain,
  width,
  height,
  className,
  containerClassName,
}: TokenIconProps) {
  const tokens = useRheaTokensStore((s) => s.tokens);

  const icon = useMemo(() => {
    if (isPresent(src)) return String(src).trim();

    if (symbol) {
      const found = tokens.find(
        (t) =>
          t.symbol === symbol &&
          (!blockchain || t.blockchain === blockchain)
      );
      if (isPresent(found?.icon)) return String(found!.icon).trim();
      return getStableflowTokenLogo(symbol);
    }

    return DefaultIcon;
  }, [src, tokens, symbol, blockchain]);

  return (
    <LazyImage
      src={icon || DefaultIcon}
      fallbackSrc={DefaultIcon}
      alt={symbol || ""}
      width={width}
      height={height}
      className={className}
      containerClassName={clsx(containerClassName, "isolate shrink-0 rounded-full overflow-hidden")}
    />
  );
}
