import type { Metadata } from "next";
import Link from "next/link";
import { CyberBackground } from "@/components/common";

export const metadata: Metadata = {
  title: "Privacy & Cookie Policy | Bitwise Security",
  description:
    "How Bitwise Security handles contact details, website analytics, cookies, and privacy rights.",
};

const Section = ({
  title,
  children,
}: {
  title: string;
  children: React.ReactNode;
}) => (
  <section className="rounded-2xl border border-cyber-blue/25 bg-cyber-darkBlue/80 p-6 backdrop-blur-md sm:p-8">
    <h2 className="mb-4 text-2xl font-bold text-cyber-blue">{title}</h2>
    <div className="space-y-4 leading-7 text-gray-300">{children}</div>
  </section>
);

const ExternalLink = ({
  href,
  children,
}: {
  href: string;
  children: React.ReactNode;
}) => (
  <a
    href={href}
    target="_blank"
    rel="noreferrer"
    className="text-cyber-blue underline decoration-cyber-blue/40 underline-offset-4 transition-colors hover:text-cyan-300"
  >
    {children}
  </a>
);

export default function PrivacyPage() {
  return (
    <main className="relative min-h-screen pb-16 pt-24">
      <CyberBackground />

      <div className="relative z-10 mx-auto max-w-4xl px-6">
        <header className="mb-12 text-center">
          <p className="mb-3 font-mono text-sm tracking-[0.25em] text-cyber-orange">
            [ DATA HANDLING PROTOCOL ]
          </p>
          <h1 className="mb-4 text-4xl font-bold sm:text-5xl">
            <span className="text-white">PRIVACY &amp; </span>
            <span className="text-cyber-blue text-glow">COOKIE POLICY</span>
          </h1>
          <div className="mx-auto h-1 w-32 bg-gradient-to-r from-cyber-blue to-cyber-orange" />
          <p className="mt-5 text-sm text-gray-400">Last updated: 11 August 2026</p>
        </header>

        <div className="space-y-6">
          <Section title="1. Who is responsible">
            <p>
              Bitwise Security is responsible for the personal data described in
              this policy. We are based in the Netherlands. Questions or privacy
              requests can be sent to{" "}
              <a
                href="mailto:info@bitwise-security.nl"
                className="text-cyber-blue underline decoration-cyber-blue/40 underline-offset-4 hover:text-cyan-300"
              >
                info@bitwise-security.nl
              </a>
              .
            </p>
          </Section>

          <Section title="2. Information we process">
            <ul className="list-disc space-y-3 pl-5 marker:text-cyber-orange">
              <li>
                <strong className="text-white">Contact requests:</strong> your
                name, email address, optional company name, selected service,
                message, and the related email metadata.
              </li>
              <li>
                <strong className="text-white">Website usage:</strong> if you
                accept analytics and advertising cookies, Google Analytics may
                collect page interactions, session information, approximate
                location, and browser or device information.
              </li>
              <li>
                <strong className="text-white">Technical and security data:</strong>{" "}
                hosting and security services may process IP addresses, request
                headers, timestamps, and similar logs needed to deliver and
                protect the website.
              </li>
            </ul>
            <p>
              Please do not include passwords, access tokens, vulnerability
              evidence, or other highly sensitive material in the public contact
              form. We will arrange an appropriate secure channel when needed.
            </p>
          </Section>

          <Section title="3. Why we use this information">
            <ul className="list-disc space-y-3 pl-5 marker:text-cyber-orange">
              <li>
                To answer enquiries, discuss a potential engagement, and prepare
                a quotation or agreement.
              </li>
              <li>
                To operate, secure, troubleshoot, and prevent abuse of the
                website.
              </li>
              <li>
                With your consent, to understand website usage and measure
                advertising performance.
              </li>
              <li>To meet applicable legal and administrative obligations.</li>
            </ul>
            <p>
              Depending on the situation, the legal basis is taking steps at
              your request before entering a contract, performing a contract,
              our legitimate interest in operating a secure business website,
              compliance with law, or your consent. You can withdraw cookie
              consent at any time without affecting earlier lawful processing.
            </p>
            <p>
              We do not sell or rent contact-form information, and we do not use
              it for automated decision-making.
            </p>
          </Section>

          <Section title="4. Cookies and consent">
            <p>
              Analytics and advertising storage is denied by default. The Google
              tag uses Consent Mode and changes its behaviour after you accept or
              reject the optional categories. If you reject them, Google
              Analytics does not read or write analytics or advertising cookies;
              limited cookieless consent and measurement signals may still be
              transmitted.
            </p>

            <div className="overflow-x-auto">
              <table className="w-full min-w-[620px] border-collapse text-left text-sm">
                <caption className="sr-only">
                  Storage used by Bitwise Security and Google Analytics
                </caption>
                <thead>
                  <tr className="border-b border-cyber-blue/30 text-white">
                    <th className="px-3 py-3">Storage</th>
                    <th className="px-3 py-3">Purpose</th>
                    <th className="px-3 py-3">Duration</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-cyber-blue/15">
                  <tr>
                    <td className="px-3 py-3 font-mono text-cyber-orange">
                      bitwise-google-consent
                    </td>
                    <td className="px-3 py-3">
                      Remembers whether you accepted or rejected optional
                      analytics and advertising storage.
                    </td>
                    <td className="px-3 py-3">
                      Until you change it or clear site data
                    </td>
                  </tr>
                  <tr>
                    <td className="px-3 py-3 font-mono text-cyber-orange">
                      _ga, _ga_*
                    </td>
                    <td className="px-3 py-3">
                      Distinguishes users and maintains session state in Google
                      Analytics, only after consent.
                    </td>
                    <td className="px-3 py-3">Up to 2 years by default</td>
                  </tr>
                </tbody>
              </table>
            </div>

            <p>
              Use the <strong className="text-white">Cookie settings</strong>{" "}
              control at the bottom of any page to change your choice. Rejecting
              optional cookies does not prevent you from using the website or
              contact form.
            </p>
          </Section>

          <Section title="5. Service providers and transfers">
            <p>We use a limited number of providers to operate this website:</p>
            <ul className="list-disc space-y-3 pl-5 marker:text-cyber-orange">
              <li>
                <ExternalLink href="https://www.cloudflare.com/privacypolicy/">
                  Cloudflare
                </ExternalLink>{" "}
                for website hosting, delivery, and security.
              </li>
              <li>
                <ExternalLink href="https://resend.com/legal/privacy-policy">
                  Resend
                </ExternalLink>{" "}
                for transmitting contact-form email.
              </li>
              <li>
                <ExternalLink href="https://policies.google.com/privacy">
                  Google
                </ExternalLink>{" "}
                for Analytics and advertising measurement subject to your
                consent choice.
              </li>
            </ul>
            <p>
              These providers may process information outside the European
              Economic Area. Where required, transfers are covered by applicable
              contractual and legal safeguards, including data-processing terms
              and standard contractual clauses.
            </p>
          </Section>

          <Section title="6. Retention and security">
            <p>
              Contact enquiries are kept only as long as reasonably necessary to
              respond, evaluate a potential engagement, maintain business
              records, and meet legal obligations. If no engagement follows,
              enquiry data is ordinarily deleted or anonymised within 24 months
              after the last meaningful contact. Contract and accounting records
              may need to be retained longer where required by law.
            </p>
            <p>
              Analytics information is retained according to the settings of the
              Google Analytics property. Provider security logs are retained in
              accordance with the relevant service configuration and legitimate
              security needs. We use reasonable technical and organisational
              measures to protect personal data, but no internet transmission is
              completely risk-free.
            </p>
          </Section>

          <Section title="7. Your privacy rights">
            <p>
              Subject to applicable law, you may ask to access, correct, erase,
              restrict, or receive a copy of your personal data, and you may
              object to certain processing. Where processing is based on consent,
              you can withdraw that consent.
            </p>
            <p>
              Send requests to{" "}
              <a
                href="mailto:info@bitwise-security.nl"
                className="text-cyber-blue underline decoration-cyber-blue/40 underline-offset-4 hover:text-cyan-300"
              >
                info@bitwise-security.nl
              </a>
              . You may also lodge a complaint with the{" "}
              <ExternalLink href="https://autoriteitpersoonsgegevens.nl/">
                Dutch Data Protection Authority
              </ExternalLink>
              .
            </p>
          </Section>

          <Section title="8. Changes and contact">
            <p>
              We may update this policy when the website, providers, or legal
              requirements change. The current version and update date will
              remain available on this page.
            </p>
            <p>
              For privacy questions, email{" "}
              <a
                href="mailto:info@bitwise-security.nl"
                className="text-cyber-blue underline decoration-cyber-blue/40 underline-offset-4 hover:text-cyan-300"
              >
                info@bitwise-security.nl
              </a>{" "}
              or return to the{" "}
              <Link
                href="/contact"
                className="text-cyber-blue underline decoration-cyber-blue/40 underline-offset-4 hover:text-cyan-300"
              >
                contact page
              </Link>
              .
            </p>
          </Section>
        </div>
      </div>
    </main>
  );
}
