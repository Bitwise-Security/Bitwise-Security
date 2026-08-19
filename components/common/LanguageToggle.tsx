"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { localeFromPathname, localizedPath } from "@/lib/i18n";

type LanguageToggleProps = {
  mobile?: boolean;
  onNavigate?: () => void;
};

export default function LanguageToggle({
  mobile = false,
  onNavigate,
}: LanguageToggleProps) {
  const pathname = usePathname();
  const locale = localeFromPathname(pathname);
  const commonClass =
    "rounded-md px-2.5 py-1.5 text-xs font-bold tracking-wider transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-cyber-blue";

  return (
    <div
      className={`flex items-center rounded-lg border border-cyber-blue/30 bg-cyber-dark/80 p-1 ${
        mobile ? "w-fit" : "shrink-0"
      }`}
      aria-label={locale === "nl" ? "Taal kiezen" : "Choose language"}
    >
      <Link
        href={localizedPath(pathname, "en")}
        hrefLang="en"
        lang="en"
        aria-current={locale === "en" ? "page" : undefined}
        onClick={onNavigate}
        className={`${commonClass} ${
          locale === "en"
            ? "bg-cyber-blue text-cyber-dark"
            : "text-gray-300 hover:text-white"
        }`}
      >
        EN
      </Link>
      <Link
        href={localizedPath(pathname, "nl")}
        hrefLang="nl"
        lang="nl"
        aria-current={locale === "nl" ? "page" : undefined}
        onClick={onNavigate}
        className={`${commonClass} ${
          locale === "nl"
            ? "bg-cyber-blue text-cyber-dark"
            : "text-gray-300 hover:text-white"
        }`}
      >
        NL
      </Link>
    </div>
  );
}

