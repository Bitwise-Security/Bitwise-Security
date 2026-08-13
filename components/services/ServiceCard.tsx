"use client";

import Link from "next/link";
import servicesData from "@/data/services.json";
import { useLocale } from "@/lib/use-locale";
import { localizedPath } from "@/lib/i18n";

const services = servicesData.services;

interface ServiceCardProps {
  service: (typeof services)[0];
  onLearnMore: () => void;
}

export default function ServiceCard({ service, onLearnMore }: ServiceCardProps) {
  const locale = useLocale();

  return (
    <div
      className={`bg-cyber-darkBlue/80 backdrop-blur-md border ${
        service.color === "cyber-blue"
          ? "border-cyber-blue/30 box-glow"
          : "border-cyber-orange/30 box-glow-orange"
      } rounded-2xl p-8 hover:scale-105 transition-all duration-300 group`}
    >
      <div className="text-6xl mb-6 transform group-hover:scale-110 transition-transform duration-300">
        {service.icon}
      </div>

      <h3
        className={`text-2xl font-bold mb-4 ${
          service.color === "cyber-blue"
            ? "text-cyber-blue"
            : "text-cyber-orange"
        }`}
      >
        {service.title}
      </h3>

      <p className="text-gray-300 leading-relaxed mb-5">
        {service.description}
      </p>

      {/* Key focus tags */}
      <div className="flex flex-wrap gap-2 mb-6">
        {service.keyFocus.map((focus, fi) => (
          <span
            key={fi}
            className={`text-xs px-2 py-1 rounded font-mono ${
              service.color === "cyber-blue"
                ? "bg-cyber-blue/10 text-cyber-blue/70 border border-cyber-blue/20"
                : "bg-cyber-orange/10 text-cyber-orange/70 border border-cyber-orange/20"
            }`}
          >
            {focus}
          </span>
        ))}
      </div>

      <button
        onClick={onLearnMore}
        className={`flex items-center gap-2 text-sm font-mono transition-all duration-300 group/btn ${
          service.color === "cyber-blue"
            ? "text-cyber-blue"
            : "text-cyber-orange"
        }`}
      >
        <div
          className={`w-2 h-2 rounded-full ${
            service.color === "cyber-blue"
              ? "bg-cyber-blue"
              : "bg-cyber-orange"
          } animate-pulse`}
        />
        <span className="group-hover/btn:tracking-widest transition-all duration-300">
          {locale === "nl" ? "MEER INFORMATIE" : "LEARN MORE"}
        </span>
        <span className="transform group-hover/btn:translate-x-1 transition-transform duration-300">
          →
        </span>
      </button>
      <Link
        href={localizedPath(`/services/${service.id}`, locale)}
        className="mt-4 inline-flex text-xs font-mono tracking-wider text-gray-400 underline decoration-cyber-blue/30 underline-offset-4 transition-colors hover:text-white"
        aria-label={
          locale === "nl"
            ? `Lees de volledige dienstenpagina over ${service.title}`
            : `Read the full ${service.title} service page`
        }
      >
        {locale === "nl" ? "VOLLEDIGE DIENSTINFORMATIE" : "FULL SERVICE DETAILS"}
      </Link>
    </div>
  );
}
