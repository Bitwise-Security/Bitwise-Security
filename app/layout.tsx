/* eslint-disable @next/next/next-script-for-ga -- Google Site Verification must detect the tag in the initial HTML. */
import "./globals.css";
import type { Metadata } from "next";
import { Inter } from "next/font/google";
import { GoogleTagConsent, Navigation } from "@/components/common";

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
  title: "Bitwise Security - Professional Penetration Testing",
  description:
    "Expert cybersecurity services including web application pentesting, Active Directory security, Azure audits, and more.",
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
        <Navigation />
        {children}
        <GoogleTagConsent />
      </body>
    </html>
  );
}
