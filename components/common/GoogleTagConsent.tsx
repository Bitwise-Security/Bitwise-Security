"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { useLocale } from "@/lib/use-locale";
import { localizedPath } from "@/lib/i18n";

const GOOGLE_TAG_ID = "G-PYJ7K51X2H";
const CONSENT_STORAGE_KEY = "bitwise-google-consent";

type ConsentChoice = "granted" | "denied";
type ConsentState = ConsentChoice | null;

declare global {
  interface Window {
    dataLayer: unknown[];
    gtag: (...args: unknown[]) => void;
  }
}

const consentValues = (choice: ConsentChoice) => ({
  analytics_storage: choice,
  ad_storage: choice,
  ad_user_data: choice,
  ad_personalization: choice,
});

function deleteGoogleCookies() {
  const cookieNames = ["_ga", `_ga_${GOOGLE_TAG_ID.slice(2)}`];
  const baseDomain = window.location.hostname.replace(/^www\./, "");
  const domains = ["", window.location.hostname, `.${baseDomain}`];

  for (const name of cookieNames) {
    for (const domain of domains) {
      const domainAttribute = domain ? `; Domain=${domain}` : "";
      document.cookie = `${name}=; Max-Age=0; Path=/${domainAttribute}; SameSite=Lax`;
    }
  }
}

export default function GoogleTagConsent() {
  const locale = useLocale();
  const copy = locale === "nl"
    ? {
        aria: "Cookievoorkeuren",
        title: "Analytics- en advertentiecookies",
        text: "Wij gebruiken Google Analytics om het gebruik van de website en advertentieprestaties te meten. Opslag en advertentiefuncties blijven uitgeschakeld totdat u toestemming geeft. U kunt uw keuze altijd wijzigen. Lees ons",
        privacy: "Privacy- en cookiebeleid",
        accept: "Alles accepteren",
        reject: "Niet-essentieel weigeren",
        settings: "Cookie-instellingen",
      }
    : {
        aria: "Cookie preferences",
        title: "Analytics and advertising cookies",
        text: "We use Google Analytics to understand site usage and measure advertising performance. Storage and advertising use remain disabled unless you accept. You can change your choice at any time. Read our",
        privacy: "Privacy & Cookie Policy",
        accept: "Accept all",
        reject: "Reject non-essential",
        settings: "Cookie settings",
      };
  const [choice, setChoice] = useState<ConsentState>(null);
  const [settingsOpen, setSettingsOpen] = useState(false);

  useEffect(() => {
    const storedChoice = window.localStorage.getItem(CONSENT_STORAGE_KEY);

    if (storedChoice === "granted" || storedChoice === "denied") {
      window.gtag("consent", "update", consentValues(storedChoice));
      setChoice(storedChoice);
    }
  }, []);

  const saveChoice = (nextChoice: ConsentChoice) => {
    window.localStorage.setItem(CONSENT_STORAGE_KEY, nextChoice);
    window.gtag("consent", "update", consentValues(nextChoice));

    if (nextChoice === "denied") {
      deleteGoogleCookies();
    }

    setChoice(nextChoice);
    setSettingsOpen(false);
  };

  const showConsentPanel = choice === null || settingsOpen;

  return (
    <>
      {showConsentPanel ? (
        <section
          aria-label={copy.aria}
          className="fixed inset-x-4 bottom-4 z-[100] mx-auto max-w-3xl rounded-xl border border-cyber-blue/40 bg-cyber-dark/95 p-5 text-gray-200 shadow-2xl shadow-cyber-blue/20 backdrop-blur-md sm:p-6"
        >
          <div className="flex flex-col gap-5 sm:flex-row sm:items-center sm:justify-between">
            <div className="max-w-xl">
              <h2 className="font-orbitron text-base font-bold text-white">
                {copy.title}
              </h2>
              <p className="mt-2 text-sm leading-6 text-gray-300">
                {copy.text}{" "}
                <Link
                  href={localizedPath("/privacy", locale)}
                  className="text-cyber-blue underline decoration-cyber-blue/50 underline-offset-4 hover:text-cyan-300"
                >
                  {copy.privacy}
                </Link>
                .
              </p>
            </div>
            <div className="flex shrink-0 flex-col gap-2 sm:min-w-40">
              <button
                type="button"
                onClick={() => saveChoice("granted")}
                className="rounded-lg bg-cyber-blue px-4 py-2.5 text-sm font-semibold text-cyber-dark transition-colors hover:bg-cyan-300 focus:outline-none focus:ring-2 focus:ring-cyan-200 focus:ring-offset-2 focus:ring-offset-cyber-dark"
              >
                {copy.accept}
              </button>
              <button
                type="button"
                onClick={() => saveChoice("denied")}
                className="rounded-lg border border-gray-500 px-4 py-2.5 text-sm font-semibold text-gray-200 transition-colors hover:border-gray-300 hover:text-white focus:outline-none focus:ring-2 focus:ring-gray-300 focus:ring-offset-2 focus:ring-offset-cyber-dark"
              >
                {copy.reject}
              </button>
            </div>
          </div>
        </section>
      ) : (
        <div className="fixed bottom-3 left-3 z-[90] flex items-center gap-2 text-xs">
          <button
            type="button"
            onClick={() => setSettingsOpen(true)}
            className="rounded-md border border-cyber-blue/30 bg-cyber-dark/90 px-3 py-2 text-gray-300 shadow-lg backdrop-blur-sm transition-colors hover:border-cyber-blue hover:text-white focus:outline-none focus:ring-2 focus:ring-cyber-blue"
          >
            {copy.settings}
          </button>
          <Link
            href={localizedPath("/privacy", locale)}
            className="rounded-md border border-gray-600/40 bg-cyber-dark/90 px-3 py-2 text-gray-400 shadow-lg backdrop-blur-sm transition-colors hover:border-gray-400 hover:text-white focus:outline-none focus:ring-2 focus:ring-gray-300"
          >
            Privacy
          </Link>
        </div>
      )}
    </>
  );
}
