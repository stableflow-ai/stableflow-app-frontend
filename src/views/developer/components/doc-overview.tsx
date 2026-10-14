import { ArrowRightIcon } from "./icons";

interface DocColumnProps {
  title: string;
  href: string;
  items: string[];
}

function DocColumn({ title, items, href }: DocColumnProps) {
  return (
    <div
      className="w-full group cursor-pointer p-4 bg-white rounded-2xl shadow-[0_0_10px_0_rgba(0,0,0,0.10)] hover:translate-y-[-1px] hover:translate-x-[-1px] hover:shadow-[0_0_15px_0_rgba(0,0,0,0.20)] duration-150"
      onClick={() => {
        // window.location.href = href;
        window.open(href, '_blank');
      }}
    >
      <h3 className="text-xl font-semibold text-[#000] flex justify-between items-center gap-2 leading-[100%]">
        {title}
        <div className="w-7.5 h-7.5 border border-[#D9D9D9] rounded-lg flex justify-center items-center text-[#d9d9d9] group-hover:bg-black duration-150 group-hover:text-white group-hover:border-black">
          <ArrowRightIcon />
        </div>
      </h3>
      <ul className="space-y-3 mt-4 pl-4 text-black font-light">
        {items.map((item, index) => (
          <li key={index} className="text-sm list-disc">
            {item}
          </li>
        ))}
      </ul>
    </div>
  );
}

const DocOverview = () => {
  const columns = [
    {
      title: "Routing",
      items: [
        "Cross-chain stablecoin routing",
        "Unified quotes across chains",
        "Exact output guarantees",
      ],
      href: "/developer/documentation#322-full-integration-flow",
    },
    {
      title: "Economics",
      items: [
        "Custom affiliate fees (bps-based)",
        "On-chain fee distribution",
        "No hidden markups",
      ],
      href: "/developer/documentation#42-oneclickparams",
    },
    {
      title: "Integration",
      items: [
        "Simple REST API & SDKs",
        "Webhooks and error handling",
        "Integration support for partners",
      ],
      href: "/developer/documentation#23-api-integration-flow",
    },
  ];

  return (
    <section className="pt-16 md:pt-20">
      <h2 className="text-2xl font-semibold text-[#000] leading-[100%]">
        Explore the StableFlow documentation
      </h2>

      <div className="grid md:grid-cols-3 gap-2.5 mt-8">
        {columns.map((column, index) => (
          <DocColumn
            key={index}
            title={column.title}
            items={column.items}
            href={column.href}
          />
        ))}
      </div>
    </section>
  );
}

export default DocOverview;
