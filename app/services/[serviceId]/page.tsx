import type { Metadata } from "next";
import Image from "next/image";
import Link from "next/link";
import { notFound } from "next/navigation";
import { CyberBackground } from "@/components/common";
import StructuredData from "@/components/common/StructuredData";
import contactData from "@/data/contact.json";
import contactDataNl from "@/data/contact.nl.json";
import servicesData from "@/data/services.json";
import servicesDataNl from "@/data/services.nl.json";
import { createPageMetadata, SITE_URL } from "@/lib/seo";
import type { Locale } from "@/lib/i18n";
import { localizedPath } from "@/lib/i18n";

const services = servicesData.services;
const serviceSeo: Record<string, { title: string; description: string }> = {
  "web-app-pentest": {
    title: "Web Application Pentesting",
    description:
      "Manual web application and API penetration testing for authentication, access-control, OWASP Top 10 and complex business-logic flaws.",
  },
  "active-directory-pentest": {
    title: "Active Directory Pentesting",
    description:
      "Hands-on Active Directory penetration testing to map attack paths, privilege escalation, domain risk and practical remediation priorities.",
  },
  "azure-pentest": {
    title: "Azure Security Audit",
    description:
      "Review Azure and Entra ID identities, permissions, storage, Key Vault, service principals and configuration risks before attackers exploit them.",
  },
  "mobile-app-pentest": {
    title: "Mobile App Pentesting",
    description:
      "iOS and Android penetration testing covering application binaries, local storage, runtime behaviour, transport security and backend APIs.",
  },
  "source-code-analysis": {
    title: "Secure Source Code Review",
    description:
      "Manual source code security review for business-logic flaws, hardcoded secrets, insecure cryptography and vulnerable implementation patterns.",
  },
  "hardware-pentest": {
    title: "Hardware & IoT Pentesting",
    description:
      "Hardware and IoT security testing for debug interfaces, firmware extraction, embedded secrets, physical access and update mechanisms.",
  },
  "website-development": {
    title: "Secure Website Development",
    description:
      "Professional website development with responsive design, clear customer journeys, technical SEO, accessibility and secure deployment.",
  },
};

type ServicePageProps = {
  params: {
    serviceId: string;
  };
};

export const dynamicParams = false;

export function generateStaticParams() {
  return services.map((service) => ({ serviceId: service.id }));
}

export function generateMetadata({ params }: ServicePageProps): Metadata {
  const service = services.find((item) => item.id === params.serviceId);

  if (!service) return {};

  const seo = serviceSeo[service.id] ?? {
    title: service.title,
    description: service.description,
  };
  const metadata = createPageMetadata({
    title: seo.title,
    description: seo.description,
    path: `/services/${service.id}`,
  });

  return {
    ...metadata,
    title: { absolute: `${seo.title} | Bitwise Security` },
  };
}

export default function ServiceDetailPage({ params }: ServicePageProps) {
  return <ServiceDetailContent params={params} locale="en" />;
}

function ServiceDetailContent({
  params,
  locale,
}: ServicePageProps & { locale: Locale }) {
  const localizedServices =
    locale === "nl" ? servicesDataNl.services : servicesData.services;
  const localizedContactData = locale === "nl" ? contactDataNl : contactData;
  const service = localizedServices.find((item) => item.id === params.serviceId);

  if (!service) notFound();

  const labels = locale === "nl"
    ? {
        home: "Home",
        services: "Diensten",
        delivery: "VEILIGE DIGITALE OPLEVERING",
        assessment: "PRAKTISCH BEVEILIGINGSONDERZOEK",
        discuss: "Bespreek deze dienst",
        reporting: "Bekijk rapportage en oplevering",
        deliverables: "OPLEVERING",
        receive: "Wat u ontvangt",
        fit: "GESCHIKT VOOR",
        forWho: "Voor wie dit bedoeld is",
        frameworks: "Kaders en standaarden",
        selected: "GESELECTEERD LIVEWERK",
        websites: "Websites die al voor echte organisaties werken",
        projects: "Deze liveprojecten laten zien hoe evenementinformatie, clubidentiteit en klantconversie ieder tot een ander ontwerp leiden.",
        visit: "Bekijk liveproject ↗",
        related: "Bekijk gerelateerde diensten",
      }
    : {
        home: "Home",
        services: "Services",
        delivery: "SECURE DIGITAL DELIVERY",
        assessment: "HANDS-ON SECURITY ASSESSMENT",
        discuss: "Discuss this service",
        reporting: "See reporting and delivery",
        deliverables: "DELIVERABLES",
        receive: "What you receive",
        fit: "BEST FIT",
        forWho: "Who this is for",
        frameworks: "Frameworks and standards",
        selected: "SELECTED LIVE WORK",
        websites: "Websites already working for real organisations",
        projects: "These live projects show how event information, club identity, and customer conversion can each lead to a different design.",
        visit: "Visit live project ↗",
        related: "Explore related services",
      };

  const isBlue = service.color === "cyber-blue";
  const accentText = isBlue ? "text-cyber-blue" : "text-cyber-orange";
  const accentBorder = isBlue
    ? "border-cyber-blue/30"
    : "border-cyber-orange/30";
  const relatedServices = localizedServices
    .filter((item) => item.id !== service.id)
    .slice(0, 3);
  const localizedServicePath = localizedPath(`/services/${service.id}`, locale);
  const pageUrl = `${SITE_URL}${localizedServicePath}`;
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
        areaServed: { "@type": "Country", name: "Netherlands" },
      },
      {
        "@type": "BreadcrumbList",
        itemListElement: [
          { "@type": "ListItem", position: 1, name: labels.home, item: `${SITE_URL}${localizedPath("/", locale)}` },
          {
            "@type": "ListItem",
            position: 2,
            name: labels.services,
            item: `${SITE_URL}${localizedPath("/services", locale)}`,
          },
          {
            "@type": "ListItem",
            position: 3,
            name: service.title,
            item: pageUrl,
          },
        ],
      },
    ],
  };

  return (
    <main className="relative min-h-screen pb-20 pt-24">
      <CyberBackground />
      <StructuredData data={structuredData} />

      <div className="relative z-10 mx-auto max-w-6xl px-6">
        <nav
          aria-label="Breadcrumb"
          className="mb-8 flex flex-wrap items-center gap-2 font-mono text-xs text-gray-400"
        >
          <Link href={localizedPath("/", locale)} className="transition-colors hover:text-cyber-blue">
            {labels.home}
          </Link>
          <span aria-hidden="true">/</span>
          <Link
            href={localizedPath("/services", locale)}
            className="transition-colors hover:text-cyber-blue"
          >
            {labels.services}
          </Link>
          <span aria-hidden="true">/</span>
          <span className={accentText}>{service.title}</span>
        </nav>

        <header
          className={`mb-12 rounded-3xl border ${accentBorder} bg-cyber-darkBlue/85 p-8 backdrop-blur-md md:p-12`}
        >
          <div className="mb-6 flex items-center gap-4">
            <span className="text-5xl" aria-hidden="true">
              {service.icon}
            </span>
            <p className={`font-mono text-xs tracking-[0.3em] ${accentText}`}>
              {service.id === "website-development"
                ? labels.delivery
                : labels.assessment}
            </p>
          </div>
          <h1 className="max-w-4xl text-4xl font-bold leading-tight text-white md:text-6xl">
            {service.title}
          </h1>
          <p className="mt-6 max-w-4xl text-lg leading-relaxed text-gray-300 md:text-xl">
            {service.fullDetails.overview}
          </p>
          <div className="mt-7 flex flex-wrap gap-2">
            {service.keyFocus.map((focus) => (
              <span
                key={focus}
                className={`rounded-full border ${accentBorder} bg-cyber-dark/60 px-3 py-1.5 text-sm ${accentText}`}
              >
                {focus}
              </span>
            ))}
          </div>
          <div className="mt-9 flex flex-col gap-4 sm:flex-row">
            <Link
              href={localizedPath("/contact", locale)}
              className="inline-flex items-center justify-center rounded-xl bg-gradient-to-r from-cyber-blue to-cyan-500 px-6 py-3 font-semibold text-cyber-dark transition-transform hover:scale-105"
            >
              {labels.discuss}
            </Link>
            <Link
              href={localizedPath("/reporter", locale)}
              className="inline-flex items-center justify-center rounded-xl border border-cyber-orange/40 bg-cyber-dark/55 px-6 py-3 font-semibold text-white transition-colors hover:border-cyber-orange hover:text-cyber-orange"
            >
              {labels.reporting}
            </Link>
          </div>
        </header>

        <section className="mb-12 grid gap-8 lg:grid-cols-[1.1fr_0.9fr]">
          <article className="rounded-3xl border border-cyber-blue/25 bg-cyber-darkBlue/80 p-8">
            <p className="mb-3 font-mono text-xs tracking-[0.3em] text-cyber-blue">
              {labels.deliverables}
            </p>
            <h2 className="mb-6 text-3xl font-bold text-white">
              {labels.receive}
            </h2>
            <ul className="space-y-4">
              {service.fullDetails.whatYouGet.map((item) => (
                <li key={item} className="flex items-start gap-3 text-gray-300">
                  <span className="mt-2 h-2 w-2 flex-shrink-0 rounded-full bg-cyber-blue" />
                  <span className="leading-relaxed">{item}</span>
                </li>
              ))}
            </ul>
          </article>

          <aside className="space-y-6">
            <div className="rounded-3xl border border-cyber-orange/25 bg-cyber-darkBlue/80 p-8">
              <p className="mb-3 font-mono text-xs tracking-[0.3em] text-cyber-orange">
                {labels.fit}
              </p>
              <h2 className="mb-4 text-2xl font-bold text-white">
                {labels.forWho}
              </h2>
              <p className="leading-relaxed text-gray-300">
                {service.fullDetails.ideal}
              </p>
            </div>

            <div className="rounded-3xl border border-cyber-blue/25 bg-cyber-darkBlue/80 p-8">
              <h2 className="mb-4 text-2xl font-bold text-white">
                {labels.frameworks}
              </h2>
              <div className="flex flex-wrap gap-2">
                {service.fullDetails.frameworks.map((framework) => (
                  <span
                    key={framework}
                    className="rounded-lg border border-cyber-blue/20 bg-cyber-dark/55 px-3 py-2 text-sm text-gray-300"
                  >
                    {framework}
                  </span>
                ))}
              </div>
            </div>
          </aside>
        </section>

        {service.id === "website-development" && (
          <section className="mb-12">
            <div className="mb-7 max-w-3xl">
              <p className="mb-3 font-mono text-xs tracking-[0.3em] text-cyber-blue">
                {labels.selected}
              </p>
              <h2 className="text-3xl font-bold text-white">
                {labels.websites}
              </h2>
              <p className="mt-4 leading-relaxed text-gray-300">
                {labels.projects}
              </p>
            </div>
            <div className="grid gap-6 md:grid-cols-3">
              {localizedContactData.websiteProjects.items.map((project) => (
                <a
                  key={project.url}
                  href={project.url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="group overflow-hidden rounded-2xl border border-cyber-blue/20 bg-cyber-darkBlue/80 transition-colors hover:border-cyber-blue/60"
                >
                  <div className="relative aspect-[16/10] overflow-hidden border-b border-cyber-blue/15">
                    <Image
                      src={project.image}
                      alt={project.imageAlt}
                      fill
                      sizes="(min-width: 768px) 33vw, 100vw"
                      className="object-cover transition-transform duration-500 group-hover:scale-[1.03]"
                    />
                  </div>
                  <div className="p-5">
                    <p className="font-mono text-xs text-cyber-orange">
                      {project.type}
                    </p>
                    <h3 className="mt-2 text-xl font-semibold text-white">
                      {project.title}
                    </h3>
                    <p className="mt-3 text-sm leading-relaxed text-gray-400">
                      {project.description}
                    </p>
                    <span className="mt-4 inline-flex text-sm font-semibold text-cyber-blue">
                      {labels.visit}
                    </span>
                  </div>
                </a>
              ))}
            </div>
          </section>
        )}

        <section className="rounded-3xl border border-cyber-blue/20 bg-gradient-to-br from-cyber-darkBlue/85 to-cyber-dark/90 p-8">
          <h2 className="mb-6 text-2xl font-bold text-white">
            {labels.related}
          </h2>
          <div className="grid gap-4 md:grid-cols-3">
            {relatedServices.map((relatedService) => (
              <Link
                key={relatedService.id}
                href={localizedPath(`/services/${relatedService.id}`, locale)}
                className="rounded-2xl border border-cyber-blue/20 bg-cyber-dark/55 p-5 transition-colors hover:border-cyber-blue/60"
              >
                <span className="text-2xl" aria-hidden="true">
                  {relatedService.icon}
                </span>
                <h3 className="mt-3 font-semibold text-white">
                  {relatedService.title}
                </h3>
                <p className="mt-2 text-sm leading-relaxed text-gray-400">
                  {relatedService.description}
                </p>
              </Link>
            ))}
          </div>
        </section>
      </div>
    </main>
  );
}
