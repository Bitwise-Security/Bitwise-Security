/* eslint-disable @next/next/next-script-for-ga -- Google Site Verification must detect the tag in the initial HTML. */
import "./globals.css";
import type { Metadata } from "next";
import { Inter } from "next/font/google";
import { GoogleTagConsent, Navigation } from "@/components/common";
import StructuredData from "@/components/common/StructuredData";
import DocumentLanguage from "@/components/common/DocumentLanguage";
import {
  DEFAULT_DESCRIPTION,
  organizationStructuredData,
  SITE_NAME,
  SITE_URL,
} from "@/lib/seo";

// PERF FIX: Orbitron & Rajdhani loaded via next/font instead of @import inside CSS.
// CSS @import blocks rendering; next/font preloads fonts with zero render-blocking.
import { Orbitron, Rajdhani } from "next/font/google";

const inter = Inter({ subsets: ["latin"] });

const orbitron = Orbitron({
  subsets: ["latin"],
  weight: ["400", "700", "900"],
  variable: "--font-orbitron",
  display: "swap",
});

const rajdhani = Rajdhani({
  subsets: ["latin"],
  weight: ["400", "500", "600", "700"],
  variable: "--font-rajdhani",
  display: "swap",
});

export const metadata: Metadata = {
  metadataBase: new URL(SITE_URL),
  title: {
    default: "Penetration Testing Netherlands | Bitwise Security",
    template: "%s | Bitwise Security",
  },
  description: DEFAULT_DESCRIPTION,
  applicationName: SITE_NAME,
  authors: [{ name: SITE_NAME, url: SITE_URL }],
  creator: SITE_NAME,
  publisher: SITE_NAME,
  category: "Cybersecurity",
  alternates: {
    canonical: "/",
    languages: {
      en: "/",
      nl: "/nl",
      "x-default": "/",
    },
  },
  robots: {
    index: true,
    follow: true,
    googleBot: {
      index: true,
      follow: true,
      "max-image-preview": "large",
      "max-snippet": -1,
      "max-video-preview": -1,
    },
  },
  openGraph: {
    type: "website",
    locale: "en_NL",
    alternateLocale: ["nl_NL"],
    url: "/",
    siteName: SITE_NAME,
    title: "Penetration Testing Netherlands | Bitwise Security",
    description: DEFAULT_DESCRIPTION,
  },
  twitter: {
    card: "summary",
    title: "Penetration Testing Netherlands | Bitwise Security",
    description: DEFAULT_DESCRIPTION,
  },
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en" className={`${orbitron.variable} ${rajdhani.variable}`}>
      <head>
        <script
          id="document-language"
          dangerouslySetInnerHTML={{
            __html: `document.documentElement.lang = location.pathname === '/nl' || location.pathname.indexOf('/nl/') === 0 ? 'nl' : 'en';`,
          }}
        />
        <script
          id="google-consent-default"
          dangerouslySetInnerHTML={{
            __html: `
            window.dataLayer = window.dataLayer || [];
            function gtag(){dataLayer.push(arguments);}
            window.gtag = gtag;

            var storedGoogleConsent = null;
            try {
              storedGoogleConsent = window.localStorage.getItem('bitwise-google-consent');
            } catch (error) {}

            var googleConsentDefault = storedGoogleConsent === 'granted'
              ? 'granted'
              : 'denied';

            gtag('consent', 'default', {
              analytics_storage: googleConsentDefault,
              ad_storage: googleConsentDefault,
              ad_user_data: googleConsentDefault,
              ad_personalization: googleConsentDefault
            });
            gtag('set', 'ads_data_redaction', true);
          `,
          }}
        />
        <script
          defer
          src="https://www.googletagmanager.com/gtag/js?id=G-PYJ7K51X2H"
        />
        <script
          id="google-tag-config"
          dangerouslySetInnerHTML={{
            __html: `
            gtag('js', new Date());
            gtag('config', 'G-PYJ7K51X2H');
          `,
          }}
        />
      </head>
      <body className={inter.className}>
        <DocumentLanguage />
        <StructuredData data={organizationStructuredData} />
        <Navigation />
        {children}
        <GoogleTagConsent />
      </body>
    </html>
  );
}
