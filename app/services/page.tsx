"use client";

import { useState } from "react";
import { CyberBackground } from "@/components/common";
import {
  ServiceModal,
  ServiceCard,
  MethodologySection,
  WhyWorkWithMe,
  PageHeader,
} from "@/components/services";
import servicesData from "@/data/services.json";
import servicesDataNl from "@/data/services.nl.json";
import { useLocale } from "@/lib/use-locale";

const services = servicesData.services;

export default function Services() {
  const locale = useLocale();
  const localizedServices =
    locale === "nl" ? servicesDataNl.services : servicesData.services;
  const [activeModal, setActiveModal] = useState<(typeof services)[0] | null>(
    null,
  );

  return (
    <main className="relative min-h-screen pt-24 pb-16">
      <CyberBackground />

      {activeModal && (
        <ServiceModal
          service={activeModal}
          onClose={() => setActiveModal(null)}
        />
      )}

      <div className="max-w-7xl mx-auto px-6 relative z-10">
        <PageHeader />

        {/* Services Grid */}
        <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-8 mb-16">
          {localizedServices.map((service, index) => (
            <ServiceCard
              key={index}
              service={service}
              onLearnMore={() => setActiveModal(service)}
            />
          ))}
        </div>

        <MethodologySection />

        <WhyWorkWithMe />
      </div>
    </main>
  );
}
