import Link from "next/link";
import { CyberBackground } from "@/components/common";
import reporterData from "@/data/reporter.json";
import ReporterGallery from "@/components/reporter/ReporterGallery";

export const metadata = {
  title: reporterData.seo.title,
  description: reporterData.seo.description,
};

export default function ReporterPage() {
  return (
    <main className="relative min-h-screen pt-24 pb-16">
      <CyberBackground />

      <div className="max-w-7xl mx-auto px-6 relative z-10">
        <section className="text-center mb-16">
          <p className="text-cyber-orange font-mono text-sm tracking-[0.3em] mb-4">
            {reporterData.hero.eyebrow}
          </p>
          <h1 className="text-5xl font-bold mb-4">
            <span className="text-white">{reporterData.hero.titlePrefix}</span>{" "}
            <span className="text-cyber-blue text-glow">
              {reporterData.hero.titleAccent}
            </span>
          </h1>
          <div className="h-1 w-32 bg-gradient-to-r from-cyber-blue to-cyber-orange mx-auto mb-6" />
          <p className="text-gray-300 text-xl max-w-4xl mx-auto leading-relaxed">
            {reporterData.hero.description}
          </p>
        </section>

        <section className="grid lg:grid-cols-[1.1fr_0.9fr] gap-8 mb-16">
          <div className="bg-cyber-darkBlue/85 backdrop-blur-md border border-cyber-blue/30 rounded-3xl p-8 box-glow">
            <div className="flex flex-wrap gap-3 mb-6">
              {reporterData.pillars.map((pillar) => (
                <span
                  key={pillar.label}
                  className="px-4 py-2 rounded-full border border-cyber-blue/30 bg-cyber-dark/60 text-sm text-gray-200"
                >
                  {pillar.label}
                </span>
              ))}
            </div>
            <h2 className="text-3xl font-bold text-cyber-orange mb-4">
              {reporterData.pillars[0].title}
            </h2>
            <p className="text-gray-300 leading-relaxed text-lg mb-6">
              {reporterData.pillars[0].text}
            </p>

            <div className="grid md:grid-cols-3 gap-4">
              {reporterData.audience.map((card) => (
                <div
                  key={card.title}
                  className="rounded-2xl border border-cyber-blue/20 bg-cyber-dark/50 p-5"
                >
                  <div className="w-10 h-10 rounded-lg bg-cyber-blue/15 border border-cyber-blue/30 flex items-center justify-center mb-4">
                    <div className="w-3 h-3 rounded-full bg-cyber-blue" />
                  </div>
                  <h3 className="text-white font-semibold mb-2">{card.title}</h3>
                  <p className="text-sm text-gray-400 leading-relaxed">
                    {card.text}
                  </p>
                </div>
              ))}
            </div>
          </div>

          <div className="space-y-4">
            <div className="bg-cyber-darkBlue/85 backdrop-blur-md border border-cyber-orange/30 rounded-3xl p-6 box-glow-orange">
              <p className="text-cyber-orange font-mono text-xs tracking-[0.35em] mb-3">
                {reporterData.trust.title}
              </p>
              <p className="text-gray-300 leading-relaxed">
                {reporterData.trust.text}
              </p>
            </div>

            <div className="bg-cyber-darkBlue/85 backdrop-blur-md border border-cyber-blue/30 rounded-3xl p-6 box-glow">
              <p className="text-cyber-blue font-mono text-xs tracking-[0.35em] mb-4">
                {reporterData.solves.title}
              </p>
              <p className="text-gray-300 leading-relaxed mb-4">
                {reporterData.solves.text}
              </p>
              <div className="grid grid-cols-2 gap-3 text-sm">
                {reporterData.solves.highlights.map((item) => (
                  <div
                    key={item}
                    className="rounded-xl border border-cyber-blue/20 bg-cyber-dark/50 px-3 py-2 text-gray-200"
                  >
                    {item}
                  </div>
                ))}
              </div>
            </div>
          </div>
        </section>

        <section className="grid lg:grid-cols-2 gap-8 mb-16">
          <div className="bg-cyber-darkBlue/85 backdrop-blur-md border border-cyber-blue/30 rounded-3xl p-8 scanline box-glow">
            <h2 className="text-3xl font-bold text-cyber-blue mb-4">
              {reporterData.capabilities.title}
            </h2>
            <div className="grid md:grid-cols-2 gap-4">
              {reporterData.capabilities.items.map((card) => (
                <div
                  key={card.title}
                  className="rounded-2xl border border-cyber-blue/20 bg-cyber-dark/45 p-5"
                >
                  <h3 className="text-white font-semibold mb-2">{card.title}</h3>
                  <p className="text-sm text-gray-400 leading-relaxed">
                    {card.text}
                  </p>
                </div>
              ))}
            </div>
          </div>

          <div className="space-y-4">
            <div className="bg-cyber-darkBlue/85 backdrop-blur-md border border-cyber-orange/30 rounded-3xl p-8 box-glow-orange">
              <h2 className="text-3xl font-bold text-cyber-orange mb-4">
                {reporterData.governance.title}
              </h2>
              <div className="space-y-3">
                {reporterData.governance.items.map((item) => (
                  <div
                    key={item}
                    className="flex items-start gap-3 rounded-2xl border border-cyber-orange/15 bg-cyber-dark/50 p-4"
                  >
                    <div className="mt-1 w-2.5 h-2.5 rounded-full bg-cyber-orange flex-shrink-0" />
                    <p className="text-gray-300 leading-relaxed">{item}</p>
                  </div>
                ))}
              </div>
            </div>

            <div className="bg-gradient-to-br from-cyber-darkBlue to-cyber-dark border border-cyber-blue/30 rounded-3xl p-8 box-glow">
              <h3 className="text-2xl font-bold text-cyber-blue mb-4">
                {reporterData.outcomes.title}
              </h3>
              <div className="space-y-3">
                {reporterData.outcomes.items.map((item) => (
                  <div key={item} className="flex items-start gap-3">
                    <div className="mt-2 w-2 h-2 rounded-full bg-cyber-blue" />
                    <p className="text-sm text-gray-300 leading-relaxed">
                      {item}
                    </p>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </section>

        <section className="mb-16">
          <div className="flex items-end justify-between gap-4 mb-6">
            <div>
              <p className="text-cyber-orange font-mono text-xs tracking-[0.35em] mb-2">
                PRODUCT IN MOTION
              </p>
              <h2 className="text-3xl font-bold text-white">
                {reporterData.gallery.title}
              </h2>
            </div>
            <p className="hidden md:block text-sm text-gray-400 max-w-xl text-right">
              {reporterData.gallery.subtitle}
            </p>
          </div>

          <ReporterGallery items={reporterData.gallery.items} />
        </section>

        <section className="grid lg:grid-cols-[1.05fr_0.95fr] gap-8">
          <div className="bg-cyber-darkBlue/85 backdrop-blur-md border border-cyber-blue/30 rounded-3xl p-8 box-glow">
            <h2 className="text-3xl font-bold text-cyber-blue mb-4">
              {reporterData.why.title}
            </h2>
            <div className="space-y-4 text-gray-300 leading-relaxed">
              {reporterData.why.items.map((item) => (
                <p key={item}>{item}</p>
              ))}
            </div>
          </div>

          <div className="bg-cyber-darkBlue/85 backdrop-blur-md border border-cyber-orange/30 rounded-3xl p-8 box-glow-orange">
            <h2 className="text-3xl font-bold text-cyber-orange mb-4">
              {reporterData.delivery.title}
            </h2>
            <p className="text-gray-300 leading-relaxed mb-6">
              {reporterData.delivery.text}
            </p>
            <div className="flex flex-col sm:flex-row gap-4">
              <Link
                href="/contact"
                className="inline-flex items-center justify-center rounded-xl bg-gradient-to-r from-cyber-blue to-cyan-500 px-6 py-3 font-semibold text-cyber-dark transition-transform duration-300 hover:scale-105"
              >
                {reporterData.delivery.primaryCta}
              </Link>
              <Link
                href="/services"
                className="inline-flex items-center justify-center rounded-xl border border-cyber-orange/40 bg-cyber-dark/50 px-6 py-3 font-semibold text-white transition-colors duration-300 hover:border-cyber-orange hover:text-cyber-orange"
              >
                {reporterData.delivery.secondaryCta}
              </Link>
            </div>
          </div>
        </section>
      </div>
    </main>
  );
}
