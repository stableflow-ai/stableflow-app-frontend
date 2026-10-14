import Modal from "@/components/modal";

type CostEfficientModalProps = {
  open: boolean;
  onClose: () => void;
};

const CostEfficientModal = ({ open, onClose }: CostEfficientModalProps) => {
  return (
    <Modal open={open} onClose={onClose} className="backdrop-blur-sm">
      <div className="relative max-h-[90vh] w-full overflow-y-auto rounded-t-[20px] border border-[#F2F2F2] bg-white px-4 py-8 shadow-[0_2px_10px_rgba(0,0,0,0.08)] md:mx-4 md:max-w-[748px] md:rounded-xl md:px-[33px] md:pt-[30px] md:pb-[26px]">
        <button
          type="button"
          className="absolute right-5 top-5 flex size-4 cursor-pointer items-center justify-center text-[#444C59] transition-opacity hover:opacity-70 md:right-[22px] md:top-[22px]"
          aria-label="Close cost efficiency modal"
          onClick={onClose}
        >
          <svg viewBox="0 0 16 16" fill="none" className="size-4" aria-hidden>
            <path d="M1 1L15 15M15 1L1 15" stroke="currentColor" strokeLinecap="round" />
          </svg>
        </button>

        <div className="mx-auto max-w-[676px] text-center">
          <h2 className="text-[26px] font-light leading-[120%] text-black">
            Why StableFlow can be more cost-efficient
          </h2>
          <div className="mt-4 text-sm font-light leading-[150%] text-black">
            <p>StableFlow uses a simpler routing cost structure.</p>
            <p>There are no bridge fees, and no Legacy Mesh or messaging fees are added to the route.</p>
            <p>That means more of the user’s transfer amount can arrive on the destination chain.</p>
          </div>
        </div>

        <div className="mt-10 grid gap-3.5 md:grid-cols-[398px_262px] md:grid-rows-[246px_146px] md:gap-4">
          <div className="relative min-h-[246px] overflow-hidden rounded-xl border border-[#F2F2F2] bg-[#F0F3F7] p-5 md:p-[19px]">
            <div className="relative z-1">
              <div className="text-[32px] font-medium leading-none text-black">+$12.78</div>
              <div className="mt-4 text-base font-light leading-none text-black">per $100K</div>
            </div>
            <img
              src="/bridge/icons/icon-average.png"
              alt=""
              className="absolute right-3 top-6 w-[203px] object-contain md:right-2 md:top-[23px]"
            />
            <p className="relative z-1 mt-[98px] max-w-[363px] text-base font-light leading-[120%] text-black">
              Average estimated extra received on selected stablecoin routes.
            </p>
          </div>

          <div className="relative min-h-[246px] overflow-hidden rounded-xl border border-[#F2F2F2] bg-black p-6 text-white">
            <p className="relative z-1 max-w-[219px] text-base font-light leading-[120%]">
              Weighted average received amount advantage.
            </p>
            <img
              src="/bridge/icons/icon-weighted.png"
              alt=""
              className="absolute left-3 top-[72px] w-[236px] object-contain"
            />
            <div className="absolute bottom-8 left-6 text-[32px] font-medium leading-none">+0.0128%</div>
          </div>

          <div className="relative min-h-[146px] overflow-hidden rounded-xl border border-[#F2F2F2] bg-[#E4ECFF] p-5 md:col-span-2 md:p-[18px]">
            <div className="relative z-1 text-base font-light leading-none text-black">Up to</div>
            <div className="relative z-1 mt-3 text-[32px] font-medium leading-none text-black">+0.145%</div>
            <p className="relative z-1 mt-7 text-base font-light leading-[120%] text-black">
              Highest observed percentage advantage.
            </p>
            <img
              src="/bridge/icons/icon-highest.png"
              alt=""
              className="absolute bottom-0 right-6 h-[138px] object-contain md:right-12"
            />
          </div>
        </div>

        <p className="mx-auto mt-4 max-w-[676px] text-center text-sm font-light leading-[120%] text-black">
          Based on selected USDT and USDC route comparisons. Actual results may vary by route, amount, liquidity, gas, and network conditions.
        </p>
      </div>
    </Modal>
  );
};

export default CostEfficientModal;
