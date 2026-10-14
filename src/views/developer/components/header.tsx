import Button from "@/components/button";

export function Header() {
  return (
    <header className="py-6 flex items-center justify-between">
      <div className="flex items-center gap-8">
        <a href="/" className="font-semibold text-lg text-[#2B3337]">
          StableFlow
        </a>
        <nav className="hidden md:flex items-center gap-6">
          <a
            href="/developer/documentation"
            target="_blank"
            className="text-sm text-[#9FA7BA] hover:text-[#2B3337] transition-colors"
          >
            Documentation
          </a>
          <a
            href="/developer/documentation#32-api-reference"
            target="_blank"
            className="text-sm text-[#9FA7BA] hover:text-[#2B3337] transition-colors"
          >
            API Reference
          </a>
          <a
            href="/developer/documentation#2-getting-started"
            target="_blank"
            className="text-sm text-[#9FA7BA] hover:text-[#2B3337] transition-colors"
          >
            Guides
          </a>
        </nav>
      </div>
      <Button
        className="h-8 px-3 text-sm border border-[#DFE7ED] bg-transparent hover:bg-[#F5F7FA]"
        isPrimary={false}
      >
        Sign In
      </Button>
    </header>
  );
}
