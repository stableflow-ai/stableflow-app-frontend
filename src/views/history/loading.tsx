import Skeleton from "@/components/skeleton";

export function PendingTitleSkeleton() {
  return (
    <div className="flex items-center gap-[6px]">
      <Skeleton width={24} height={16} borderRadius={4} />
      <Skeleton width={140} height={16} borderRadius={4} />
    </div>
  );
}

function PendingItemSkeleton() {
  return (
    <div className="w-full md:w-[300px] bg-[#EDF0F7] rounded-[12px]">
      <div className="rounded-[12px] bg-white border border-[#EDF0F7] p-[12px] pt-[6px]">
        <div className="mb-2 flex justify-between items-center">
          <Skeleton width={62} height={16} borderRadius={4} />
        </div>
        <div className="flex items-center gap-[10px]">
          <Skeleton variant="circle" width={28} height={28} />
          <Skeleton width={56} height={16} borderRadius={4} />
          <Skeleton width={5} height={8} borderRadius={2} />
          <Skeleton variant="circle" width={28} height={28} />
          <Skeleton width={56} height={16} borderRadius={4} />
        </div>
        <div className="mt-[10px]">
          <Skeleton width="80%" height={12} borderRadius={4} />
        </div>
        <div className="mt-[10px] flex items-center justify-between">
          <div className="flex items-center gap-[6px]">
            <Skeleton variant="circle" width={26} height={26} />
            <div className="flex flex-col gap-[4px]">
              <Skeleton width={56} height={12} borderRadius={4} />
              <Skeleton width={72} height={12} borderRadius={4} />
            </div>
          </div>
          <Skeleton width={5} height={8} borderRadius={2} />
          <div className="flex items-center gap-[6px]">
            <Skeleton variant="circle" width={26} height={26} />
            <div className="flex flex-col gap-[4px]">
              <Skeleton width={56} height={12} borderRadius={4} />
              <Skeleton width={72} height={12} borderRadius={4} />
            </div>
          </div>
        </div>
      </div>
      <div className="h-[30px] flex justify-center items-center">
        <Skeleton width={140} height={12} borderRadius={4} />
      </div>
    </div>
  );
}

export function PendingSkeleton() {
  return (
    <>
      {Array.from({ length: 2 }).map((_, i) => (
        <PendingItemSkeleton key={i} />
      ))}
    </>
  );
}

function CompleteTransferItemSkeleton() {
  return (
    <div className="flex items-center justify-between border-b border-[#EBF0F8] py-[10px] gap-[10px] min-w-[350px]">
      <div className="flex items-center gap-[10px] shrink-0">
        <Skeleton
          variant="circle"
          className="!w-[20px] !h-[20px] md:!w-[28px] md:!h-[28px]"
        />
        <Skeleton width={72} height={16} borderRadius={4} />
      </div>
      <div className="flex items-center gap-[10px] shrink-0">
        <Skeleton
          variant="circle"
          className="!w-[20px] !h-[20px] md:!w-[26px] md:!h-[26px]"
        />
        <Skeleton width={5} height={10} borderRadius={2} />
        <Skeleton
          variant="circle"
          className="!w-[20px] !h-[20px] md:!w-[26px] md:!h-[26px]"
        />
        <Skeleton width={80} height={14} borderRadius={4} className="hidden md:block" />
        <div className="flex flex-col items-end gap-[4px] md:hidden">
          <Skeleton width={56} height={10} borderRadius={4} />
          <Skeleton width={48} height={12} borderRadius={4} />
        </div>
        <Skeleton width={60} height={14} borderRadius={4} className="hidden md:block" />
      </div>
    </div>
  );
}

export function CompleteTransfersSkeleton() {
  return (
    <div className="w-full">
      {Array.from({ length: 5 }).map((_, i) => (
        <CompleteTransferItemSkeleton key={i} />
      ))}
    </div>
  );
}
