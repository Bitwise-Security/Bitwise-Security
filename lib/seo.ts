import type { Metadata } from "next";

export const SITE_NAME = "Bitwise Security";
export const SITE_URL = "https://bitwise-security.nl";
export const DEFAULT_DESCRIPTION =
  "OSCP, OSWE and OSEP-certified penetration testing in the Netherlands for web applications, Active Directory, Azure, mobile applications, source code and hardware.";

type PageMetadataOptions = {
  title: string;
  description: string;
  path: string;
  index?: boolean;
};

export function createPageMetadata({
  title,
  description,
  path,
  index = true,
}: PageMetadataOptions): Metadata {
  const canonicalPath = path.startsWith("/") ? path : `/${path}`;

  return {
    title,
    description,
    alternates: {
      canonical: canonicalPath,
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
      locale: "en_NL",
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
