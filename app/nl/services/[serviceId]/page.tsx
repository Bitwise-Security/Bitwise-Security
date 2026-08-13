import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { CyberBackground } from "@/components/common";
import StructuredData from "@/components/common/StructuredData";
import servicesData from "@/data/services.nl.json";
import { createPageMetadata, SITE_URL } from "@/lib/seo";

type ServicePageProps = {
  params: {
    serviceId: string;
  };
};

export const dynamicParams = false;

export function generateStaticParams() {
  return servicesData.services.map((service) => ({ serviceId: service.id }));
}

export function generateMetadata({ params }: ServicePageProps): Metadata {
  const service = servicesData.services.find(
    (item) => item.id === params.serviceId,
  );

  if (!service) return {};

  const metadata = createPageMetadata({
    title: service.title,
    description: service.description,
    path: `/services/${service.id}`,
    locale: "nl",
  });

  return {
    ...metadata,
    title: { absolute: `${service.title} | Bitwise Security` },
  };
}

export default function DutchServiceDetailPage({ params }: ServicePageProps) {
  const service = servicesData.services.find(
    (item) => item.id === params.serviceId,
  );

  if (!service) notFound();

  const related = servicesData.services
    .filter((item) => item.id !== service.id)
    .slice(0, 3);
  const pageUrl = `${SITE_URL}/nl/services/${service.id}`;
  const structuredData = {
    "@context": "https://schema.org",
    "@graph": [
      {
        "@type": "Service",
        "@id": `${pageUrl}#service`,
        name: service.title,
        serviceType: service.title,
        description: service.description,
        url: pageUrl,
        provider: { "@id": `${SITE_URL}/#organization` },
        areaServed: { "@type": "Country", name: "Nederland" },
      },
      {
        "@type": "BreadcrumbList",
        itemListElement: [
          { "@type": "ListItem", position: 1, name: "Home", item: `${SITE_URL}/nl` },
          { "@type": "ListItem", position: 2, name: "Diensten", item: `${SITE_URL}/nl/services` },
          { "@type": "ListItem", position: 3, name: service.title, item: pageUrl },
        ],
      },
    ],
  };

  const isBlue = service.color === "cyber-blue";
  const accent = isBlue ? "text-cyber-blue" : "text-cyber-orange";
  const border = isBlue ? "border-cyber-blue/30" : "border-cyber-orange/30";

  return (
    <main className="relative min-h-screen pb-20 pt-24">
      <CyberBackground />
      <StructuredData data={structuredData} />
      <div className="relative z-10 mx-auto max-w-6xl px-6">
        <nav aria-label="Broodkruimelpad" className="mb-8 flex flex-wrap gap-2 font-mono text-xs text-gray-400">
          <Link href="/nl" className="hover:text-cyber-blue">Home</Link>
          <span aria-hidden="true">/</span>
          <Link href="/nl/services" className="hover:text-cyber-blue">Diensten</Link>
          <span aria-hidden="true">/</span>
          <span className={accent}>{service.title}</span>
        </nav>

        <header className={`mb-12 rounded-3xl border ${border} bg-cyber-darkBlue/85 p-8 backdrop-blur-md md:p-12`}>
          <div className="mb-5 flex items-center gap-4">
            <span className="text-5xl" aria-hidden="true">{service.icon}</span>
            <p className={`font-mono text-xs tracking-[0.3em] ${accent}`}>
              {service.id === "website-development" ? "VEILIGE DIGITALE OPLEVERING" : "PRAKTISCH BEVEILIGINGSONDERZOEK"}
            </p>
          </div>
          <h1 className="max-w-4xl text-4xl font-bold leading-tight text-white md:text-6xl">{service.title}</h1>
          <p className="mt-6 max-w-4xl text-lg leading-relaxed text-gray-300 md:text-xl">{service.fullDetails.overview}</p>
          <div className="mt-7 flex flex-wrap gap-2">
            {service.keyFocus.map((focus) => (
              <span key={focus} className={`rounded-full border ${border} bg-cyber-dark/60 px-3 py-1.5 text-sm ${accent}`}>{focus}</span>
            ))}
          </div>
          <div className="mt-9 flex flex-col gap-4 sm:flex-row">
            <Link href="/nl/contact" className="inline-flex items-center justify-center rounded-xl bg-gradient-to-r from-cyber-blue to-cyan-500 px-6 py-3 font-semibold text-cyber-dark transition-transform hover:scale-105">Bespreek deze dienst</Link>
            <Link href="/nl/reporter" className="inline-flex items-center justify-center rounded-xl border border-cyber-orange/40 bg-cyber-dark/55 px-6 py-3 font-semibold text-white hover:text-cyber-orange">Bekijk rapportage en oplevering</Link>
          </div>
        </header>

        <section className="mb-12 grid gap-8 lg:grid-cols-[1.1fr_0.9fr]">
          <article className="rounded-3xl border border-cyber-blue/25 bg-cyber-darkBlue/80 p-8">
            <p className="mb-3 font-mono text-xs tracking-[0.3em] text-cyber-blue">OPLEVERING</p>
            <h2 className="mb-6 text-3xl font-bold text-white">Wat u ontvangt</h2>
            <ul className="space-y-4">
              {service.fullDetails.whatYouGet.map((item) => (
                <li key={item} className="flex items-start gap-3 text-gray-300"><span className="mt-2 h-2 w-2 flex-shrink-0 rounded-full bg-cyber-blue" /><span>{item}</span></li>
              ))}
            </ul>
          </article>
          <aside className="space-y-6">
            <div className="rounded-3xl border border-cyber-orange/25 bg-cyber-darkBlue/80 p-8">
              <p className="mb-3 font-mono text-xs tracking-[0.3em] text-cyber-orange">GESCHIKT VOOR</p>
              <h2 className="mb-4 text-2xl font-bold text-white">Voor wie dit bedoeld is</h2>
              <p className="leading-relaxed text-gray-300">{service.fullDetails.ideal}</p>
            </div>
            <div className="rounded-3xl border border-cyber-blue/25 bg-cyber-darkBlue/80 p-8">
              <h2 className="mb-4 text-2xl font-bold text-white">Kaders en standaarden</h2>
              <div className="flex flex-wrap gap-2">
                {service.fullDetails.frameworks.map((framework) => (
                  <span key={framework} className="rounded-lg border border-cyber-blue/20 bg-cyber-dark/55 px-3 py-2 text-sm text-gray-300">{framework}</span>
                ))}
              </div>
            </div>
          </aside>
        </section>

        <section className="rounded-3xl border border-cyber-blue/20 bg-cyber-darkBlue/80 p-8">
          <h2 className="mb-6 text-2xl font-bold text-white">Bekijk gerelateerde diensten</h2>
          <div className="grid gap-4 md:grid-cols-3">
            {related.map((item) => (
              <Link key={item.id} href={`/nl/services/${item.id}`} className="rounded-2xl border border-cyber-blue/20 bg-cyber-dark/55 p-5 hover:border-cyber-blue/60">
                <span className="text-2xl" aria-hidden="true">{item.icon}</span>
                <h3 className="mt-3 font-semibold text-white">{item.title}</h3>
                <p className="mt-2 text-sm leading-relaxed text-gray-400">{item.description}</p>
              </Link>
            ))}
          </div>
        </section>
      </div>
    </main>
  );
}
