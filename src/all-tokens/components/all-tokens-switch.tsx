import { isHistoryPath, MODE_ROUTES, useIsAllTokens } from "@/all-tokens/route-mode";
import { motion, useReducedMotion } from "framer-motion";
import { useLocation, useNavigate } from "react-router-dom";

const TRACK_OFF = "#B3BBCE";
const TRACK_ON = "#6284F5";

export default function AllTokensSwitch() {
  const enabled = useIsAllTokens();
  const reduceMotion = useReducedMotion();
  const navigate = useNavigate();
  const { pathname } = useLocation();

  const onToggle = () => {
    const next = enabled ? "stablecoin" : "allTokens";
    const target = isHistoryPath(pathname) ? MODE_ROUTES[next].history : MODE_ROUTES[next].bridge;
    navigate(target);
  };

  const transition = reduceMotion
    ? { duration: 0 }
    : { type: "spring" as const, stiffness: 500, damping: 30 };

  return (
    <button
      type="button"
      className="button flex items-center gap-[8px] shrink-0"
      onClick={onToggle}
      aria-pressed={enabled}
      data-all-tokens-switch=""
    >
      <span className="font-['Space_Grotesk'] text-[14px] font-normal leading-none text-[#9FA7BA] whitespace-nowrap">
        All Tokens
      </span>
      <motion.span
        aria-hidden
        className="relative block h-[16px] w-[30px] shrink-0 rounded-full"
        animate={{ backgroundColor: enabled ? TRACK_ON : TRACK_OFF }}
        transition={transition}
      >
        <motion.span
          className="absolute top-[2px] left-[2px] block h-[12px] w-[12px] rounded-full bg-white"
          animate={{ x: enabled ? 14 : 0 }}
          transition={transition}
        />
      </motion.span>
    </button>
  );
}
