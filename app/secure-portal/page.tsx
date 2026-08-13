"use client";

import Link from "next/link";
import { CyberBackground } from "@/components/common";
import ProductGallery from "@/components/reporter/ReporterGallery";
import portalDataEn from "@/data/secure-portal.json";
import portalDataNl from "@/data/secure-portal.nl.json";
import { useLocale } from "@/lib/use-locale";
import { localizedPath } from "@/lib/i18n";

export default function SecurePortalPage() {
  const locale = useLocale();
  const portalData = locale === "nl" ? portalDataNl : portalDataEn;
  const labels = locale === "nl"
    ? {
        how: "Bekijk hoe het werkt",
        private: "STANDAARD PRIVÉ",
        anonymous: "Geen anonieme bestandsdeling",
        access: "Toegang wordt expliciet verleend. Alleen een bestands-ID kennen is nooit voldoende om klantgegevens op te halen.",
        lifecycle: "VAN UPLOAD TOT VERWIJDERING",
        security: "BEVEILIGINGSMODEL",
        control: "MAATREGEL",
        views: "OPGESCHOONDE PRODUCTBEELDEN",
        retention: "BEWAARTERMIJN EN AVG",
        start: "VEILIG BEGINNEN",
      }
    : {
        how: "See how it works",
        private: "PRIVATE BY DEFAULT",
        anonymous: "No anonymous file sharing",
        access: "Access is explicitly granted. Knowing a file identifier is never enough to retrieve a customer's data.",
        lifecycle: "FROM UPLOAD TO DELETION",
        security: "SECURITY MODEL",
        control: "CONTROL",
        views: "SANITIZED PRODUCT VIEWS",
        retention: "RETENTION & GDPR",
        start: "START SECURELY",
      };
  return (
    <main className="relative min-h-screen overflow-hidden pb-20 pt-24">
      <CyberBackground />

      <div className="relative z-10 mx-auto max-w-7xl px-6">
        <section className="grid items-center gap-10 py-12 lg:grid-cols-[1.05fr_0.95fr] lg:py-20">
          <div>
            <p className="mb-5 font-mono text-sm tracking-[0.3em] text-cyber-orange">
              {portalData.hero.eyebrow}
            </p>
            <h1 className="max-w-5xl text-5xl font-bold leading-[1.04] tracking-tight md:text-6xl">
              <span className="text-white">{portalData.hero.titlePrefix}</span>{" "}
              <span className="text-cyber-blue text-glow">{portalData.hero.titleAccent}</span>
            </h1>
            <div className="my-7 h-1 w-32 bg-gradient-to-r from-cyber-blue to-cyber-orange" />
            <p className="max-w-3xl text-lg leading-relaxed text-gray-300 md:text-xl">
              {portalData.hero.description}
            </p>
            <div className="mt-8 flex flex-col gap-4 sm:flex-row">
              <Link
                href={localizedPath("/contact", locale)}
                className="inline-flex items-center justify-center rounded-xl bg-gradient-to-r from-cyber-blue to-cyan-500 px-6 py-3 font-semibold text-cyber-dark transition-transform duration-300 hover:scale-105"
              >
                {portalData.delivery.primaryCta}
              </Link>
              <a
                href="#how-it-works"
                className="inline-flex items-center justify-center rounded-xl border border-cyber-orange/40 bg-cyber-dark/60 px-6 py-3 font-semibold text-white transition-colors hover:border-cyber-orange hover:text-cyber-orange"
              >
                {labels.how}
              </a>
            </div>
          </div>

          <div className="relative rounded-[2rem] border border-cyber-blue/25 bg-cyber-darkBlue/85 p-6 shadow-2xl shadow-cyber-blue/10 backdrop-blur-md md:p-8">
            <div className="absolute -right-10 -top-10 h-36 w-36 rounded-full bg-cyber-blue/10 blur-3xl" />
            <div className="relative">
              <div className="mb-6 flex items-center justify-between border-b border-cyber-blue/15 pb-5">
                <div>
                  <p className="font-mono text-xs tracking-[0.28em] text-cyber-blue">{labels.private}</p>
                  <h2 className="mt-2 text-2xl font-bold text-white">{labels.anonymous}</h2>
                </div>
                <div className="flex h-12 w-12 items-center justify-center rounded-2xl border border-cyber-blue/30 bg-cyber-blue/10 font-bold text-cyber-blue">B</div>
              </div>
              <div className="space-y-3">
                {portalData.principles.map((principle, index) => (
                  <div key={principle} className="flex items-center gap-4 rounded-2xl border border-cyber-blue/15 bg-cyber-dark/55 p-4">
                    <span className="flex h-9 w-9 flex-shrink-0 items-center justify-center rounded-xl bg-cyber-blue/10 font-mono text-xs text-cyber-blue">0{index + 1}</span>
                    <span className="text-sm font-medium text-gray-200">{principle}</span>
                  </div>
                ))}
              </div>
              <p className="mt-6 text-sm leading-relaxed text-gray-400">
                {labels.access}
              </p>
            </div>
          </div>
        </section>

        <section className="mb-20 grid gap-6 lg:grid-cols-2">
          {portalData.modes.map((mode, index) => (
            <article key={mode.title} className={`rounded-3xl border p-8 backdrop-blur-md ${index === 0 ? "border-cyber-blue/30 bg-cyber-darkBlue/85 box-glow" : "border-cyber-orange/30 bg-cyber-darkBlue/85 box-glow-orange"}`}>
              <p className={`mb-3 font-mono text-xs tracking-[0.3em] ${index === 0 ? "text-cyber-blue" : "text-cyber-orange"}`}>{mode.label}</p>
              <h2 className="mb-4 text-3xl font-bold text-white">{mode.title}</h2>
              <p className="text-lg leading-relaxed text-gray-300">{mode.text}</p>
            </article>
          ))}
        </section>

        <section id="how-it-works" className="mb-20 scroll-mt-28">
          <div className="mb-8 max-w-3xl">
            <p className="mb-2 font-mono text-xs tracking-[0.35em] text-cyber-orange">{labels.lifecycle}</p>
            <h2 className="text-3xl font-bold text-white md:text-4xl">{portalData.capabilities.title}</h2>
          </div>
          <div className="grid gap-5 md:grid-cols-2 lg:grid-cols-3">
            {portalData.capabilities.items.map((item) => (
              <article key={item.step} className="group rounded-3xl border border-cyber-blue/20 bg-gradient-to-br from-cyber-darkBlue/90 to-cyber-dark/90 p-6 transition-colors hover:border-cyber-blue/45">
                <span className="mb-7 flex h-11 w-11 items-center justify-center rounded-2xl border border-cyber-blue/25 bg-cyber-blue/10 font-mono text-xs text-cyber-blue">{item.step}</span>
                <h3 className="mb-3 text-xl font-semibold text-white">{item.title}</h3>
                <p className="leading-relaxed text-gray-400">{item.text}</p>
              </article>
            ))}
          </div>
        </section>

        <section className="mb-20 grid gap-8 lg:grid-cols-[1.08fr_0.92fr]">
          <div className="rounded-3xl border border-cyber-blue/30 bg-cyber-darkBlue/85 p-8 backdrop-blur-md box-glow">
            <p className="mb-3 font-mono text-xs tracking-[0.35em] text-cyber-blue">{labels.security}</p>
            <h2 className="mb-4 text-3xl font-bold text-white">{portalData.security.title}</h2>
            <p className="text-lg leading-relaxed text-gray-300">{portalData.security.text}</p>
          </div>
          <div className="grid gap-3 sm:grid-cols-2">
            {portalData.security.items.map((item, index) => (
              <div key={item} className="flex min-h-24 items-start gap-3 rounded-2xl border border-cyber-orange/20 bg-cyber-darkBlue/75 p-4">
                <span className="mt-1 h-2.5 w-2.5 flex-shrink-0 rounded-full bg-cyber-orange shadow-[0_0_14px_rgba(255,107,53,.75)]" />
                <div>
                  <span className="font-mono text-[10px] tracking-[0.24em] text-cyber-orange">{labels.control} 0{index + 1}</span>
                  <p className="mt-2 text-sm font-medium leading-relaxed text-gray-200">{item}</p>
                </div>
              </div>
            ))}
          </div>
        </section>

        <section className="mb-20">
          <div className="mb-7 flex items-end justify-between gap-6">
            <div>
              <p className="mb-2 font-mono text-xs tracking-[0.35em] text-cyber-orange">{labels.views}</p>
              <h2 className="text-3xl font-bold text-white">{portalData.gallery.title}</h2>
            </div>
            <p className="hidden max-w-xl text-right text-sm text-gray-400 md:block">{portalData.gallery.subtitle}</p>
          </div>
          <ProductGallery items={portalData.gallery.items} />
        </section>

        <section className="grid gap-8 lg:grid-cols-[1.05fr_0.95fr]">
          <div className="rounded-3xl border border-cyber-blue/30 bg-cyber-darkBlue/85 p-8 backdrop-blur-md box-glow">
            <p className="mb-3 font-mono text-xs tracking-[0.35em] text-cyber-blue">{labels.retention}</p>
            <h2 className="mb-4 text-3xl font-bold text-white">{portalData.retention.title}</h2>
            <p className="text-lg leading-relaxed text-gray-300">{portalData.retention.text}</p>
          </div>
          <div className="rounded-3xl border border-cyber-orange/30 bg-cyber-darkBlue/85 p-8 backdrop-blur-md box-glow-orange">
            <p className="mb-3 font-mono text-xs tracking-[0.35em] text-cyber-orange">{labels.start}</p>
            <h2 className="mb-4 text-3xl font-bold text-white">{portalData.delivery.title}</h2>
            <p className="mb-7 leading-relaxed text-gray-300">{portalData.delivery.text}</p>
            <div className="flex flex-col gap-4 sm:flex-row">
              <Link href={localizedPath("/contact", locale)} className="inline-flex items-center justify-center rounded-xl bg-gradient-to-r from-cyber-blue to-cyan-500 px-6 py-3 font-semibold text-cyber-dark transition-transform duration-300 hover:scale-105">
                {portalData.delivery.primaryCta}
              </Link>
              <Link href={localizedPath("/services", locale)} className="inline-flex items-center justify-center rounded-xl border border-cyber-orange/40 bg-cyber-dark/50 px-6 py-3 font-semibold text-white transition-colors hover:border-cyber-orange hover:text-cyber-orange">
                {portalData.delivery.secondaryCta}
              </Link>
            </div>
          </div>
        </section>
      </div>
    </main>
  );
}
