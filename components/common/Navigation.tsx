"use client";

import Link from "next/link";
import Image from "next/image";
import { useState, useEffect } from "react";
import { usePathname } from "next/navigation";
import LanguageToggle from "@/components/common/LanguageToggle";
import { localeFromPathname, localizedPath, stripLocale } from "@/lib/i18n";

export default function Navigation() {
  const [scrolled, setScrolled] = useState(false);
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const pathname = usePathname();
  const locale = localeFromPathname(pathname);
  const activePath = stripLocale(pathname);

  useEffect(() => {
    const handleScroll = () => {
      setScrolled(window.scrollY > 20);
    };
    window.addEventListener("scroll", handleScroll);
    return () => window.removeEventListener("scroll", handleScroll);
  }, []);

  const navLinks =
    locale === "nl"
      ? [
          { name: "HOME", path: "/" },
          { name: "DIENSTEN", path: "/services" },
          { name: "REPORTER", path: "/reporter" },
          { name: "PORTAAL", path: "/secure-portal" },
          { name: "OVER MIJ", path: "/about" },
          { name: "CONTACT", path: "/contact" },
        ]
      : [
          { name: "HOME", path: "/" },
          { name: "SERVICES", path: "/services" },
          { name: "REPORTER", path: "/reporter" },
          { name: "PORTAL", path: "/secure-portal" },
          { name: "ABOUT", path: "/about" },
          { name: "CONTACT", path: "/contact" },
        ];

  return (
    <nav
      className={`fixed top-0 w-full z-50 transition-all duration-300 ${
        scrolled || mobileMenuOpen
          ? "bg-cyber-dark/98 backdrop-blur-md shadow-lg shadow-cyber-blue/20"
          : "bg-cyber-dark/80 backdrop-blur-sm"
      }`}
    >
      <div className="max-w-7xl mx-auto px-4 sm:px-6 py-3 sm:py-4">
        <div className="flex items-center justify-between">
          {/* Logo */}
          <Link href={localizedPath("/", locale)} className="flex items-center group" onClick={() => setMobileMenuOpen(false)}>
            <div className="relative">
              <div className="w-10 h-10 sm:w-12 sm:h-12 rounded-lg transform group-hover:rotate-6 transition-transform duration-300 box-glow overflow-hidden">
                <Image
                  src="/logo-nav.webp"
                  alt="Bitwise Security"
                  width={48}
                  height={48}
                  className="w-full h-full object-cover"
                />
              </div>
            </div>
          </Link>

          {/* Desktop Navigation Links */}
          <div className="hidden md:flex items-center gap-4 lg:gap-7">
            {navLinks.map((link) => (
              <Link
                key={link.path}
                href={localizedPath(link.path, locale)}
                className={`relative text-sm font-medium tracking-wider transition-all duration-300 group ${
                  activePath === link.path
                    ? "text-cyber-blue"
                    : "text-gray-300 hover:text-cyber-blue"
                }`}
              >
                {link.name}
                <span
                  className={`absolute -bottom-1 left-0 h-0.5 bg-cyber-blue transition-all duration-300 ${
                    activePath === link.path ? "w-full" : "w-0 group-hover:w-full"
                  }`}
                ></span>
              </Link>
            ))}
            <LanguageToggle />
          </div>

          {/* Mobile Menu Button */}
          <button
            onClick={() => setMobileMenuOpen(!mobileMenuOpen)}
            aria-label={
              mobileMenuOpen
                ? locale === "nl"
                  ? "Navigatiemenu sluiten"
                  : "Close navigation menu"
                : locale === "nl"
                  ? "Navigatiemenu openen"
                  : "Open navigation menu"
            }
            aria-expanded={mobileMenuOpen}
            aria-controls="mobile-navigation"
            className="md:hidden p-2 rounded-lg border border-cyber-blue/30 hover:border-cyber-blue hover:bg-cyber-blue/10 transition-all duration-300"
          >
            <svg
              className="w-6 h-6 text-cyber-blue"
              fill="none"
              stroke="currentColor"
              viewBox="0 0 24 24"
            >
              {mobileMenuOpen ? (
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M6 18L18 6M6 6l12 12"
                />
              ) : (
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M4 6h16M4 12h16M4 18h16"
                />
              )}
            </svg>
          </button>
        </div>

        {/* Mobile Menu */}
        {mobileMenuOpen && (
          <div id="mobile-navigation" className="md:hidden mt-4 pb-2 space-y-2 border-t border-cyber-blue/20 pt-4">
            <div className="mb-3 px-4">
              <LanguageToggle
                mobile
                onNavigate={() => setMobileMenuOpen(false)}
              />
            </div>
            {navLinks.map((link) => (
              <Link
                key={link.path}
                href={localizedPath(link.path, locale)}
                onClick={() => setMobileMenuOpen(false)}
                className={`block text-sm font-medium tracking-wider transition-all duration-300 py-3 px-4 rounded-lg ${
                  activePath === link.path
                    ? "text-cyber-blue bg-cyber-blue/10 border border-cyber-blue/30"
                    : "text-gray-300 hover:text-cyber-blue hover:bg-cyber-blue/5"
                }`}
              >
                {link.name}
              </Link>
            ))}
          </div>
        )}
      </div>
    </nav>
  );
}
