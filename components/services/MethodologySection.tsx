"use client";

import servicesData from "@/data/services.json";
import servicesDataNl from "@/data/services.nl.json";
import { useLocale } from "@/lib/use-locale";

const iconMap: any = {
  check: (
    <svg className="w-12 h-12" fill="currentColor" viewBox="0 0 24 24">
      <path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm-2 15l-5-5 1.41-1.41L10 14.17l7.59-7.59L19 8l-9 9z" />
    </svg>
  ),
  search: (
    <svg className="w-12 h-12" fill="currentColor" viewBox="0 0 24 24">
      <path d="M15.5 14h-.79l-.28-.27C15.41 12.59 16 11.11 16 9.5 16 5.91 13.09 3 9.5 3S3 5.91 3 9.5 5.91 16 9.5 16c1.61 0 3.09-.59 4.23-1.57l.27.28v.79l5 4.99L20.49 19l-4.99-5zm-6 0C7.01 14 5 11.99 5 9.5S7.01 5 9.5 5 14 7.01 14 9.5 11.99 14 9.5 14z" />
    </svg>
  ),
  shield: (
    <svg className="w-12 h-12" fill="currentColor" viewBox="0 0 24 24">
      <path d="M12 2L2 7v10c0 5.55 3.84 10.74 9 12 5.16-1.26 9-6.45 9-12V7l-10-5z" />
    </svg>
  ),
  document: (
    <svg className="w-12 h-12" fill="currentColor" viewBox="0 0 24 24">
      <path d="M14 2H6c-1.1 0-1.99.9-1.99 2L4 20c0 1.1.89 2 1.99 2H18c1.1 0 2-.9 2-2V8l-6-6zm2 16H8v-2h8v2zm0-4H8v-2h8v2zm-3-5V3.5L18.5 9H13z" />
    </svg>
  ),
};

export default function MethodologySection() {
  const locale = useLocale();
  const methodology =
    locale === "nl" ? servicesDataNl.methodology : servicesData.methodology;

  return (
    <div className="bg-cyber-darkBlue/80 backdrop-blur-md border border-cyber-blue/30 rounded-2xl p-12 box-glow mb-8">
      <h2 className="text-4xl font-bold text-cyber-blue mb-8 text-center">
        {locale === "nl" ? "Mijn methodologie" : "My Methodology"}
      </h2>
      <p className="text-gray-300 text-center mb-12 text-lg max-w-3xl mx-auto">
        {locale === "nl"
          ? "Iedere opdracht volgt een zorgvuldig proces op basis van erkende standaarden"
          : "Every engagement follows a rigorous, industry-standard process"}
      </p>

      <div className="grid md:grid-cols-4 gap-8">
        {methodology.map((item, index) => (
          <div key={index} className="text-center group">
            <div className="mb-6 flex justify-center">
              <div className="w-24 h-24 bg-cyber-dark border-2 border-cyber-blue rounded-full flex items-center justify-center text-cyber-blue group-hover:scale-110 group-hover:border-cyber-orange group-hover:text-cyber-orange transition-all duration-300">
                {iconMap[item.icon]}
              </div>
            </div>
            <div className="text-5xl font-bold text-cyber-blue/20 mb-2">
              {item.step}
            </div>
            <h3 className="text-xl font-bold text-white mb-3">
              {item.title}
            </h3>
            <p className="text-gray-400 text-sm">{item.description}</p>
          </div>
        ))}
      </div>
    </div>
  );
}
