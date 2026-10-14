import { getStableflowLogo } from "@/utils/format/logo";
import clsx from "clsx";

const MainTitle = (props: any) => {
  const { className } = props;

  return (
    <div className={clsx("flex justify-center items-center gap-[5px] md:gap-[10px] w-full", className)}>
      <img
        src={getStableflowLogo("logo-stableflow-full-2.svg")}
        alt="logo"
        className="h-8 md:h-9.5 object-center object-contain shrink-0"
      />
    </div>
  );
};

export default MainTitle;
