"use client";

import { usePathname } from "next/navigation";
import { localeFromPathname } from "@/lib/i18n";

export function useLocale() {
  return localeFromPathname(usePathname());
}

