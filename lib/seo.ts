import type { Metadata } from "next";
import type { Locale } from "@/lib/i18n";
import { localizedPath, stripLocale } from "@/lib/i18n";

export const SITE_NAME = "Bitwise Security";
export const SITE_URL = "https://bitwise-security.nl";
export const DEFAULT_DESCRIPTION =
  "OSCP, OSWE and OSEP-certified penetration testing in the Netherlands for web applications, Active Directory, Azure, mobile applications, source code and hardware.";

type PageMetadataOptions = {
  title: string;
  description: string;
  path: string;
  index?: boolean;
  locale?: Locale;
};

export function createPageMetadata({
  title,
  description,
  path,
  index = true,
  locale = "en",
}: PageMetadataOptions): Metadata {
  const suppliedPath = path.startsWith("/") ? path : `/${path}`;
  const englishPath = stripLocale(suppliedPath);
  const canonicalPath = localizedPath(englishPath, locale);

  return {
    title: { absolute: `${title} | ${SITE_NAME}` },
    description,
    alternates: {
      canonical: canonicalPath,
      languages: {
        en: localizedPath(englishPath, "en"),
        nl: localizedPath(englishPath, "nl"),
        "x-default": localizedPath(englishPath, "en"),
      },
    },
    robots: {
      index,
      follow: true,
      googleBot: {
        index,
        follow: true,
        "max-image-preview": "large",
        "max-snippet": -1,
        "max-video-preview": -1,
      },
    },
    openGraph: {
      type: "website",
      locale: locale === "nl" ? "nl_NL" : "en_NL",
      alternateLocale: locale === "nl" ? ["en_NL"] : ["nl_NL"],
      url: canonicalPath,
      siteName: SITE_NAME,
      title: `${title} | ${SITE_NAME}`,
      description,
    },
    twitter: {
      card: "summary",
      title: `${title} | ${SITE_NAME}`,
      description,
    },
  };
}

export const organizationStructuredData = {
  "@context": "https://schema.org",
  "@graph": [
    {
      "@type": "Organization",
      "@id": `${SITE_URL}/#organization`,
      name: SITE_NAME,
      url: SITE_URL,
      logo: `${SITE_URL}/logo.png`,
      email: "info@bitwise-security.nl",
      description: DEFAULT_DESCRIPTION,
      areaServed: {
        "@type": "Country",
        name: "Netherlands",
      },
      knowsAbout: [
        "Web application penetration testing",
        "Active Directory security",
        "Microsoft Azure security",
        "Mobile application security",
        "Secure code review",
        "Hardware security",
        "Secure website development",
      ],
    },
    {
      "@type": "WebSite",
      "@id": `${SITE_URL}/#website`,
      url: SITE_URL,
      name: SITE_NAME,
      publisher: {
        "@id": `${SITE_URL}/#organization`,
      },
      inLanguage: "en",
    },
  ],
};
