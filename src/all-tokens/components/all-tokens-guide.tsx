import { useAllTokensStore } from "@/all-tokens/store";
import { useLayoutContext } from "@/layouts/context";
import { useEffect, useState } from "react";
import { createPortal } from "react-dom";

const NARROW_QUERY = "(max-width: 767px)";
const HOLE_PAD = 8;
const CONNECTOR = 28;
const TIP_WIDTH = 220;
const VIEWPORT_GAP = 12;

type Hole = {
  top: number;
  left: number;
  width: number;
  height: number;
};

const findSwitch = () => {
  const nodes = document.querySelectorAll<HTMLElement>("[data-all-tokens-switch]");
  for (const node of nodes) {
    const rect = node.getBoundingClientRect();
    if (rect.width > 0 && rect.height > 0) return node;
  }
  return null;
};

export default function AllTokensGuide() {
  const dismissGuide = useAllTokensStore((state) => state.dismissGuide);
  const { containerRef } = useLayoutContext();
  const [hole, setHole] = useState<Hole | null>(null);
  const [narrow, setNarrow] = useState(() => window.matchMedia(NARROW_QUERY).matches);

  useEffect(() => {
    const scroller = containerRef.current;
    if (!scroller) return;
    const previous = scroller.style.overflowY;
    scroller.style.overflowY = "hidden";
    return () => {
      scroller.style.overflowY = previous;
    };
  }, [containerRef]);

  useEffect(() => {
    let frame = 0;
    const tick = () => {
      const node = findSwitch();
      const nextNarrow = window.matchMedia(NARROW_QUERY).matches;
      setNarrow((current) => (current === nextNarrow ? current : nextNarrow));
      if (!node) {
        setHole((current) => (current === null ? current : null));
        frame = window.requestAnimationFrame(tick);
        return;
      }
      const rect = node.getBoundingClientRect();
      const next = {
        top: rect.top - HOLE_PAD,
        left: rect.left - HOLE_PAD,
        width: rect.width + HOLE_PAD * 2,
        height: rect.height + HOLE_PAD * 2,
      };
      setHole((current) => {
        if (
          current
          && current.top === next.top
          && current.left === next.left
          && current.width === next.width
          && current.height === next.height
        ) {
          return current;
        }
        return next;
      });
      frame = window.requestAnimationFrame(tick);
    };
    frame = window.requestAnimationFrame(tick);
    return () => window.cancelAnimationFrame(frame);
  }, []);

  if (!hole || typeof document === "undefined") return null;

  const tipMaxWidth = Math.min(TIP_WIDTH, window.innerWidth - VIEWPORT_GAP * 2);
  const roomOnRight = window.innerWidth - (hole.left + hole.width) - VIEWPORT_GAP;
  const placeBelow = narrow || roomOnRight < tipMaxWidth + CONNECTOR;

  const tipStyle = placeBelow
    ? {
        top: hole.top + hole.height + CONNECTOR,
        left: Math.max(
          VIEWPORT_GAP,
          Math.min(hole.left + hole.width - tipMaxWidth, window.innerWidth - VIEWPORT_GAP - tipMaxWidth),
        ),
        width: tipMaxWidth,
      }
    : {
        top: hole.top + hole.height / 2,
        left: hole.left + hole.width + CONNECTOR,
        width: tipMaxWidth,
        transform: "translateY(-50%)",
      };

  const connectorStyle = placeBelow
    ? {
        top: hole.top + hole.height,
        left: hole.left + hole.width / 2,
        width: 0,
        height: CONNECTOR,
        borderLeft: "1px dotted rgba(255,255,255,0.9)",
      }
    : {
        top: hole.top + hole.height / 2,
        left: hole.left + hole.width,
        width: CONNECTOR,
        height: 0,
        borderTop: "1px dotted rgba(255,255,255,0.9)",
      };

  return createPortal(
    <div className="fixed inset-0 z-[100]" role="dialog" aria-modal="true" aria-label="All Tokens guide">
      <div
        className="fixed rounded-[12px] border border-dashed border-white pointer-events-auto"
        style={{
          top: hole.top,
          left: hole.left,
          width: hole.width,
          height: hole.height,
          boxShadow: "0 0 0 9999px rgba(17, 24, 39, 0.45)",
        }}
      />
      <div className="fixed pointer-events-none" style={connectorStyle} />
      <div
        className="fixed rounded-[12px] bg-white p-[14px] shadow-[0_8px_24px_rgba(0,0,0,0.16)]"
        style={tipStyle}
      >
        <p className="font-['Space_Grotesk'] text-[14px] font-normal leading-[1.35] text-[#1F2430]">
          Swap other tokens by Switching to [All Tokens] Mode
        </p>
        <button
          type="button"
          className="button mt-[12px] rounded-[8px] bg-black px-[14px] py-[6px] font-['Space_Grotesk'] text-[13px] font-medium leading-none text-white"
          onClick={dismissGuide}
        >
          Got it!
        </button>
      </div>
    </div>,
    document.body,
  );
}
