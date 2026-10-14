import clsx from "clsx";
import type { ReactNode } from "react";

const AlertIcon = () => (
  <svg width="16" height="16" viewBox="0 0 16 16" fill="none" xmlns="http://www.w3.org/2000/svg" className="shrink-0">
    <circle cx="8" cy="8" r="8" fill="#FF584A" />
    <path d="M8 3.8V8.6" stroke="white" strokeWidth="1.4" strokeLinecap="round" />
    <circle cx="8" cy="11.3" r="0.85" fill="white" />
  </svg>
);

export default function FieldAlert({
  active,
  iconPosition = "end",
  className,
  children,
}: {
  active?: boolean;
  iconPosition?: "start" | "end";
  className?: string;
  children: ReactNode;
}) {
  if (!active) return <>{children}</>;

  return (
    <div className={clsx("inline-flex items-center gap-1 h-[26px] px-1.5 rounded-[6px] bg-[#FF584A]/10", className)}>
      {iconPosition === "start" ? <AlertIcon /> : null}
      {children}
      {iconPosition === "end" ? <AlertIcon /> : null}
    </div>
  );
}
