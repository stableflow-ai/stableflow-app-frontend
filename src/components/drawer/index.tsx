import useIsMobile from "@/hooks/use-is-mobile";
import clsx from "clsx";
import { AnimatePresence, motion } from "framer-motion";
import { useEffect, useState, type ReactNode } from "react";
import ReactDOM from "react-dom";
import DrawerTitle from "./title";

type DrawerProps = {
  open: boolean;
  onClose: () => void;
  title?: ReactNode;
  children?: ReactNode;
  className?: string;
  titleClassName?: string;
  showBack?: boolean;
  onBack?: () => void;
  showMask?: boolean;
  maskClosable?: boolean;
  lockScroll?: boolean;
  showCollapse?: boolean;
};

const Drawer = (props: DrawerProps) => {
  const {
    open,
    onClose,
    showMask = true,
    maskClosable = true,
    lockScroll = true,
  } = props;

  const isMobile = useIsMobile();
  const [contentOpen, setContentOpen] = useState(false);

  useEffect(() => {
    if (open) {
      setContentOpen(true);
      if (lockScroll) {
        document.body.classList.add("drawer-open");
      }
      return () => {
        document.body.classList.remove("drawer-open");
      };
    }
    setContentOpen(false);
    document.body.classList.remove("drawer-open");
  }, [open, lockScroll]);

  if (typeof window === "undefined") {
    return null;
  }

  return ReactDOM.createPortal((
    <AnimatePresence>
      {
        open && showMask && (
          <motion.div
            key="drawer-backdrop"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{
              ease: "easeInOut",
              duration: 0.05,
              delay: open ? 0 : 0.3,
            }}
            className="fixed z-50 left-0 top-0 w-full h-full bg-black/50"
            onClick={(e) => {
              if (!maskClosable) return;
              if (e.target !== e.currentTarget) {
                return;
              }
              onClose();
            }}
          />
        )
      }
      {
        contentOpen && (
          <DrawerContent
            key="drawer-content"
            isMobile={isMobile}
            {...props}
          />
        )
      }
    </AnimatePresence>
  ), document.body);
};

export default Drawer;

const DrawerContent = (props: DrawerProps & { isMobile: boolean }) => {
  const {
    className,
    titleClassName,
    open,
    children,
    isMobile,
    title,
    onClose,
    showBack,
    onBack,
    showCollapse = false,
  } = props;

  return (
    <motion.div
      initial={isMobile ? { y: "100%", opacity: 0 } : { x: "100%", opacity: 0 }}
      animate={isMobile ? { y: 0, opacity: 1 } : { x: 0, opacity: 1 }}
      exit={isMobile ? { y: "100%", opacity: 0 } : { x: "100%", opacity: 0 }}
      transition={{
        type: "spring",
        stiffness: 300,
        damping: isMobile ? 20 : 30,
        duration: 0.3,
        delay: open ? 0.05 : 0,
      }}
      className={clsx(
        "fixed z-[51] right-[unset] md:right-[10px] bottom-0 md:bottom-[unset] md:top-[10px] w-full md:w-[320px] h-[calc(100%-70px)] md:h-[calc(100%-20px)]",
        !isMobile && showCollapse && "overflow-visible",
      )}
    >
      {!isMobile && showCollapse && (
        <button
          type="button"
          aria-label="Collapse"
          onClick={onClose}
          className="button absolute left-0 top-1/2 -translate-x-full -translate-y-1/2 z-[1] w-[20px] h-[214px] p-0 border-0 bg-transparent cursor-pointer"
        >
          <img
            src="/icons/wallet-drawer-collapse.svg"
            alt=""
            width={20}
            height={214}
            className="block w-[20px] h-[214px]"
          />
        </button>
      )}
      <div
        className={clsx(
          "w-full h-full overflow-y-auto overflow-x-hidden rounded-b-[0px] md:rounded-b-[16px] rounded-t-[16px] bg-white shadow-[0_0_10px_0_rgba(0,0,0,0.10)]",
          className,
        )}
      >
        <DrawerTitle
          onClose={onClose}
          className={titleClassName}
          showBack={showBack}
          onBack={onBack}
        >
          {title}
        </DrawerTitle>
        {children}
      </div>
    </motion.div>
  );
};
