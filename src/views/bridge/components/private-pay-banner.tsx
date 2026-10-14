import { Icon2Right } from "@stableflow/pay-ui/icons/outline/to-right";
import { IconPrivate } from "@stableflow/pay-ui/icons/outline/private";
import { motion, useReducedMotion } from "framer-motion";
import clsx from "clsx";

const PRIVATE_PAY_HREF = "https://www.stableflow.ai/private-payment?source=app";

const TICKER_ROWS = [
  {
    clear: "0xe20... Send 50,000",
    hidden: "********",
    clearClass: "text-[8px]",
    hiddenClass: "text-[10px]",
    duration: 14,
  },
  {
    clear: "10,000 USDT to 0x5d2...",
    hidden: "**********",
    clearClass: "text-[13px]",
    hiddenClass: "text-[16px]",
    duration: 20,
  },
  {
    clear: "Send 90,000 USDT to",
    hidden: "*********",
    clearClass: "text-[8px]",
    hiddenClass: "text-[10px]",
    duration: 16,
  },
] as const;

const STRIP_REPEAT = 8;

function TickerStrip(props: {
  text: string;
  duration: number;
  reduceMotion: boolean;
  className?: string;
}) {
  const copies = (prefix: string) =>
    Array.from({ length: STRIP_REPEAT }, (_, index) => (
      <span
        key={`${prefix}-${index}`}
        className={clsx(
          "shrink-0 px-4 font-medium leading-none whitespace-nowrap text-white",
          props.className,
        )}
      >
        {props.text}
      </span>
    ));

  return (
    <div className="overflow-hidden">
      <motion.div
        className="flex w-max"
        animate={props.reduceMotion ? undefined : { x: ["-50%", "0%"] }}
        transition={{
          duration: props.duration,
          ease: "linear",
          repeat: Infinity,
        }}
      >
        <div className="flex">{copies("a")}</div>
        <div className="flex" aria-hidden>
          {copies("b")}
        </div>
      </motion.div>
    </div>
  );
}

function PrivatePayLock() {
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      width="86"
      height="86"
      viewBox="0 0 86 86"
      fill="none"
      aria-hidden
      className="z-10 -mx-6 shrink-0 size-26"
    >
      <g filter="url(#privatePayLockShadow)">
        <rect x="20" y="20" width="46" height="46" rx="12" fill="url(#privatePayLockFill)" />
        <rect x="20.5" y="20.5" width="45" height="45" rx="11.5" stroke="url(#privatePayLockStroke)" />
      </g>
      <path
        d="M42.7018 35.3334C45.2382 35.3334 47.2829 37.4606 47.2829 40.0712V41.7868L47.3319 41.7887C47.8419 41.8177 48.3215 42.0408 48.6723 42.4121C49.0231 42.7834 49.2185 43.2749 49.2185 43.7857V48.9474C49.2185 49.4779 49.0078 49.9866 48.6327 50.3617C48.2576 50.7368 47.7488 50.9476 47.2183 50.9476H38.1853C37.6549 50.9476 37.1461 50.7368 36.771 50.3617C36.3959 49.9866 36.1852 49.4779 36.1852 48.9474V43.7857C36.1852 43.2664 36.3872 42.7675 36.7485 42.3945C37.1097 42.0215 37.6018 41.8036 38.1208 41.7868V40.0712C38.1208 37.4606 40.1655 35.3334 42.7018 35.3334ZM47.2183 43.205H38.1853C38.0313 43.205 37.8836 43.2662 37.7747 43.3751C37.6658 43.484 37.6047 43.6317 37.6047 43.7857V48.9474C37.6047 49.1014 37.6658 49.2491 37.7747 49.358C37.8836 49.4669 38.0313 49.5281 38.1853 49.5281H47.2183C47.3724 49.5281 47.5201 49.4669 47.629 49.358C47.7379 49.2491 47.799 49.1014 47.799 48.9474V43.7857C47.799 43.6317 47.7379 43.484 47.629 43.3751C47.5201 43.2662 47.3724 43.205 47.2183 43.205ZM42.7018 44.4309C42.9924 44.4306 43.2746 44.5284 43.5026 44.7085C43.7307 44.8885 43.8913 45.1403 43.9585 45.423C44.0257 45.7056 43.9955 46.0027 43.8728 46.2661C43.7501 46.5295 43.5422 46.7438 43.2825 46.8743V47.4899C43.2825 47.6439 43.2214 47.7916 43.1125 47.9005C43.0036 48.0094 42.8559 48.0705 42.7018 48.0705C42.5478 48.0705 42.4001 48.0094 42.2912 47.9005C42.1823 47.7916 42.1211 47.6439 42.1211 47.4899L42.1205 46.8737C41.8612 46.743 41.6535 46.5286 41.5311 46.2653C41.4087 46.002 41.3787 45.7051 41.4459 45.4226C41.5131 45.1401 41.6737 44.8885 41.9016 44.7085C42.1295 44.5286 42.4115 44.4308 42.7018 44.4309ZM42.7018 36.7528C40.9623 36.7528 39.5403 38.2323 39.5403 40.0712V41.7855H45.8634V40.0712C45.8634 38.2323 44.4413 36.7528 42.7018 36.7528Z"
        fill="url(#privatePayLockGlyph)"
      />
      <defs>
        <filter id="privatePayLockShadow" x="0" y="0" width="86" height="86" filterUnits="userSpaceOnUse" colorInterpolationFilters="sRGB">
          <feFlood floodOpacity="0" result="BackgroundImageFix" />
          <feColorMatrix in="SourceAlpha" type="matrix" values="0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 127 0" result="hardAlpha" />
          <feOffset />
          <feGaussianBlur stdDeviation="10" />
          <feComposite in2="hardAlpha" operator="out" />
          <feColorMatrix type="matrix" values="0 0 0 0 1 0 0 0 0 1 0 0 0 0 1 0 0 0 0.4 0" />
          <feBlend mode="normal" in2="BackgroundImageFix" result="effect1_dropShadow" />
          <feBlend mode="normal" in="SourceGraphic" in2="effect1_dropShadow" result="shape" />
        </filter>
        <linearGradient id="privatePayLockFill" x1="43" y1="20" x2="43" y2="66" gradientUnits="userSpaceOnUse">
          <stop stopColor="#3D3D3D" />
          <stop offset="1" stopColor="#171717" />
        </linearGradient>
        <linearGradient id="privatePayLockStroke" x1="43" y1="20" x2="43" y2="66" gradientUnits="userSpaceOnUse">
          <stop stopColor="#A0A0A0" />
          <stop offset="1" />
        </linearGradient>
        <linearGradient id="privatePayLockGlyph" x1="42.7018" y1="35.3334" x2="42.7018" y2="50.9476" gradientUnits="userSpaceOnUse">
          <stop stopColor="#C6C6C6" />
          <stop offset="1" stopColor="#E8E8E8" />
        </linearGradient>
      </defs>
    </svg>
  );
}

function PrivatePayButton(props: { reduceMotion: boolean }) {
  return (
    <span className="relative inline-flex h-[27px] w-[167px] shrink-0 items-center justify-center gap-1.5 overflow-hidden rounded-[8px] border border-[#6b6b6b] bg-[#2d2d2d] text-[12px] font-medium leading-none text-white">
      {!props.reduceMotion ? (
        <motion.span
          aria-hidden
          className="pointer-events-none absolute inset-y-0 left-0 w-1/3 bg-[linear-gradient(90deg,transparent,rgba(255,255,255,0.5),transparent)]"
          animate={{ x: ["-100%", "400%"] }}
          transition={{ duration: 1, ease: "linear", repeat: Infinity, repeatDelay: 2 }}
        />
      ) : null}
      <IconPrivate className="relative z-10 size-3 shrink-0 text-white" />
      <span className="relative z-10">Private Pay Now</span>
      <Icon2Right className="relative z-10 shrink-0 text-white" />
    </span>
  );
}

function PrivatePayTicker(props: { reduceMotion: boolean }) {
  return (
    <div className="flex min-w-0 flex-1 items-center">
      <div
        className="flex h-12 min-w-0 flex-[1.4] flex-col justify-between"
        style={{
          maskImage: "linear-gradient(to right, transparent 0%, #fff 22%)",
          WebkitMaskImage: "linear-gradient(to right, transparent 0%, #fff 22%)",
        }}
      >
        {TICKER_ROWS.map((row) => (
          <TickerStrip
            key={row.clear}
            text={row.clear}
            duration={row.duration}
            reduceMotion={props.reduceMotion}
            className={row.clearClass}
          />
        ))}
      </div>
      <PrivatePayLock />
      <div
        className="flex h-12 min-w-0 flex-1 flex-col justify-between"
        style={{
          maskImage: "linear-gradient(to right, #fff 0%, transparent 72%)",
          WebkitMaskImage: "linear-gradient(to right, #fff 0%, transparent 72%)",
        }}
      >
        {TICKER_ROWS.map((row) => (
          <TickerStrip
            key={row.hidden}
            text={row.hidden}
            duration={row.duration}
            reduceMotion={props.reduceMotion}
            className={row.hiddenClass}
          />
        ))}
      </div>
    </div>
  );
}

export default function PrivatePayBanner() {
  const reduceMotion = Boolean(useReducedMotion());

  return (
    <a
      href={PRIVATE_PAY_HREF}
      target="_blank"
      rel="noopener noreferrer"
      className="mt-[30px] block w-full cursor-pointer px-[10px] md:px-0"
    >
      <img
        src="/bridge/banners/private-payment.png"
        alt="Move big. Stay invisible. Stay secure."
        className="h-auto w-full md:hidden"
      />
      <div className="hidden h-[84px] w-full items-center gap-3 overflow-hidden rounded-[16px] border border-[#ebebeb] bg-gradient-to-r from-black to-[#666] pl-5 md:flex">
        <div className="flex shrink-0 flex-col justify-center gap-3">
          <p className="bg-gradient-to-r from-white to-[#999] bg-clip-text text-[16px] font-medium leading-none whitespace-nowrap text-transparent">
            Move big. Stay invisible. Stay secure.
          </p>
          <PrivatePayButton reduceMotion={reduceMotion} />
        </div>
        <PrivatePayTicker reduceMotion={reduceMotion} />
      </div>
    </a>
  );
}
