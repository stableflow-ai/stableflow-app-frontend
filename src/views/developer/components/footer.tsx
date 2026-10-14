import { DiscordLink, GithubLink } from "../config";
import { ExternalLinkIcon } from "./icons";

const Footer = () => {
  const links = [
    { label: "API Reference", href: "/developer/documentation#32-api-reference" },
    { label: "Integration Guide", href: "/developer/documentation#22-configuration" },
    { label: "GitHub", href: GithubLink, external: true },
    { label: "Contact Support", href: DiscordLink, external: true },
  ];

  return (
    <footer className="py-10">
      <nav className="flex flex-wrap gap-x-8 gap-y-3">
        {links.map((link, index) => (
          <a
            key={index}
            href={link.href}
            target="_blank"
            className="text-sm text-[#9FA7BA] hover:text-[#2B3337] transition-colors flex items-center gap-1"
          >
            {link.label}
            {link.external && <ExternalLinkIcon />}
          </a>
        ))}
      </nav>
      <p className="text-xs text-[#9FA7BA] mt-6">
        © {new Date().getFullYear()} StableFlow. All rights reserved.
      </p>
    </footer>
  );
}

export default Footer;
