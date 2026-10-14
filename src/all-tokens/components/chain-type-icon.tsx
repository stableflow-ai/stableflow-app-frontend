import clsx from "clsx";
import { chainTypes } from "@/all-tokens/chains";

export default function ChainTypeIcon({
  type,
  className,
  size = 24,
  radius = 6,
}: {
  type: string;
  className?: string;
  size?: number;
  radius?: number;
}) {
  const meta = chainTypes[type];
  if (!meta?.icon) return null;

  return (
    <div
      className={clsx("flex items-center justify-center shrink-0 overflow-hidden", className)}
      style={{
        width: size,
        height: size,
        borderRadius: radius,
        backgroundColor: meta.bgColor,
      }}
    >
      <img
        src={meta.icon}
        alt=""
        className="w-full h-full object-contain"
      />
    </div>
  );
}
