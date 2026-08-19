export type Locale = "en" | "nl";

export const DEFAULT_LOCALE: Locale = "en";

export function localeFromPathname(pathname: string): Locale {
  return pathname === "/nl" || pathname.startsWith("/nl/") ? "nl" : "en";
}

export function stripLocale(pathname: string): string {
  if (pathname === "/nl") return "/";
  if (pathname.startsWith("/nl/")) return pathname.slice(3) || "/";
  return pathname || "/";
}

export function localizedPath(pathname: string, locale: Locale): string {
  const basePath = stripLocale(pathname);

  if (locale === "nl") {
    return basePath === "/" ? "/nl" : `/nl${basePath}`;
  }

  return basePath;
}

