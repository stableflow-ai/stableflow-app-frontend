import dayjs from "dayjs";
import { formatNumber } from "@/utils/format/number";
import clsx from "clsx";
import useIsMobile from "@/hooks/use-is-mobile";
import Pagination from "@/components/pagination";
import { TradeStatus, TradeStatusMap } from "@/config/trade";
import ContinueTransfer from "./continue";
import { CompleteTransfersSkeleton } from "./loading";
import TokenIcon from "@/all-tokens/components/token-icon";
import { useIsAllTokens } from "@/all-tokens/route-mode";

export default function CompleteTransfers(props: any) {
  const { className, contentClassName, history } = props;

  const isMobile = useIsMobile();
  const showSkeleton = history.loading && !history.list.length;

  return (
    <div className={clsx("mt-[12px] rounded-[12px] px-[30px] pt-[20px] pb-[30px] bg-white border border-[#F2F2F2] shadow-[0_0_6px_0_rgba(0,0,0,0.10)]", className)}>
      <div className="text-[16px] font-[500] text-[#444C59]">History transfers</div>
      <div className={clsx("mt-[14px] w-full overflow-x-auto", contentClassName)}>
        {
          showSkeleton ? (
            <CompleteTransfersSkeleton />
          ) : (
            !history.list.length ? (
              <div className="text-[14px] font-[300] h-[200px] flex items-center justify-center opacity-50 text-center">
                No Data.
              </div>
            ) : history.list.map((item: any, index: number) => (
              <CompleteTransferItem
                key={index}
                data={item}
                isMobile={isMobile}
                reload={history.getList}
              />
            ))
          )
        }
      </div>
      <Pagination
        className="py-[18px] justify-end"
        totalPage={history.page.totalPage}
        page={history.page.current}
        pageSize={history.page.size}
        onPageChange={(page: number) => {
          history.handleChangePage(page);
        }}
      />
    </div>
  );
}

const CompleteTransferItem = ({ data, isMobile, reload }: any) => {
  const allTokensEnabled = useIsAllTokens();

  return (
    <div className="flex items-center justify-between border-b border-[#EBF0F8] py-[10px] gap-[10px] min-w-[350px]">
      <div className="flex items-center gap-[10px] shrink-0">
        {allTokensEnabled ? (
          <TokenIcon
            symbol={data.symbol}
            blockchain={data.from_chain}
            containerClassName="md:w-[28px] md:h-[28px] w-[20px] h-[20px] shrink-0"
            className="object-center object-contain"
          />
        ) : (
          <img
            src={data.token_icon}
            alt=""
            className="md:w-[28px] md:h-[28px] w-[20px] h-[20px]"
          />
        )}
        <span>
          <span className="text-[14px] md:text-[16px] font-bold">
            {formatNumber(data.token_in_amount, 2, true)}
          </span>{" "}
          <span className="text-[10px] md:text-[12px] font-[500]">
            {data.symbol}
          </span>
        </span>
      </div>
      <div className="flex items-center gap-[10px] shrink-0">
        <div
          className="md:w-[26px] md:h-[26px] w-[20px] h-[20px] relative bg-no-repeat bg-center bg-contain"
          style={allTokensEnabled ? undefined : {
            backgroundImage: `url(${data.token_icon})`,
          }}
        >
          {allTokensEnabled && (
            <TokenIcon
              symbol={data.symbol}
              blockchain={data.from_chain}
              containerClassName="w-full h-full"
              className="object-center object-contain"
            />
          )}
          <img
            src={data.source_chain?.chainIcon}
            alt=""
            className="w-[12px] h-[12px] absolute bottom-[-2px] right-[-4px] z-[1] object-center object-contain"
          />
        </div>
        {
          !!data.tx_hash && (
            <button
              className="text-[14px] font-[500] underline button"
              onClick={() => {
                window.open(
                  `${data.source_chain?.blockExplorerUrl}/${data.tx_hash}`,
                  "_blank"
                );
              }}
            >
              Tx
            </button>
          )
        }
        <svg
          xmlns="http://www.w3.org/2000/svg"
          width="5"
          height="10"
          viewBox="0 0 5 10"
          fill="none"
        >
          <path
            d="M1 1L4 5.13793L1 9"
            stroke="#444C59"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
        </svg>
        <div
          className="md:w-[26px] md:h-[26px] w-[20px] h-[20px] relative bg-no-repeat bg-center bg-contain"
          style={allTokensEnabled ? undefined : {
            backgroundImage: `url(${data.to_token_icon})`,
          }}
        >
          {allTokensEnabled && (
            <TokenIcon
              symbol={data.to_symbol}
              blockchain={data.to_chain}
              containerClassName="w-full h-full"
              className="object-center object-contain"
            />
          )}
          <img
            src={data.destination_chain?.chainIcon}
            alt=""
            className="w-[12px] h-[12px] absolute bottom-[-2px] right-[-4px] z-[1] object-center object-contain"
          />
        </div>
        {
          !!data.to_tx_hash && (
            <button
              type="button"
              className="text-[14px] font-[500] underline button"
              onClick={() => {
                window.open(
                  `${data.destination_chain.blockExplorerUrl}/${data.to_tx_hash}`,
                  "_blank"
                );
              }}
            >
              Tx
            </button>
          )
        }
        {
          isMobile ? (
            <div className="flex flex-col items-end gap-[0px] leading-[100%]">
              <div className="text-[10px] font-[500] text-[#444C59]">
                {dayjs(data.create_time).format("M D, YY hh:m")}
              </div>
              <div className="flex justify-end items-center gap-[6px]">
                <StatusText history={data} reload={reload} />
              </div>
            </div>
          ) : (
            <>
              <div className="text-[14px] font-[500]">
                {dayjs(data.create_time).format("MMM D, YYYY h:mm A")}
              </div>
              <StatusText history={data} />
            </>
          )
        }
      </div>
    </div>
  );
};

const StatusText = (props: any) => {
  const { history, reload } = props;

  const isSuccess = history.status === 1;
  const isFromTron = history.from_chain === "tron";

  if (history.status === TradeStatus.Continue && isFromTron) {
    return (
      <ContinueTransfer history={history} reload={reload} />
    );
  }

  return (
    <div
      className={clsx(
        "text-[14px] font-[500px] w-[60px]",
        isSuccess ? "text-[#4DCF5E]" : "text-[#FF6A19]"
      )}
    >
      {isSuccess ? "Success" : (history.trade_status || TradeStatusMap[history.status as TradeStatus]?.name || "Pending")}
    </div>
  );
};
