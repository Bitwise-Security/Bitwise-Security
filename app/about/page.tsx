"use client";

import { CyberBackground } from "@/components/common";
import Image from "next/image";
import { useLocale } from "@/lib/use-locale";

export default function About() {
  const locale = useLocale();
  const copy = locale === "nl"
    ? {
        titlePrefix: "DE KERN",
        titleAccent: "AANPAK",
        status: "[ STATUS: GEVERIFIEERD ]",
        specialist: "Beveiligingsspecialist",
        about: "OVER MIJ",
        intro: "Ik ben altijd gedreven geweest door nieuwsgierigheid naar hoe systemen werken en worden gebouwd. Hacking is voor mij niet alleen werk, maar een blijvende passie. Ik verdiep mij voortdurend in nieuwe software, verfijn mijn methodologie en onderzoek nieuwe manieren om beveiliging te verbeteren. Daardoor combineer ik actuele kennis met een creatieve, praktische aanpak in iedere opdracht.",
        learning: "Blijven leren",
        learningText: "Voortdurend onderzoek naar nieuwe aanvalstechnieken en verdedigingsmaatregelen",
        creative: "Creatieve aanpak",
        creativeText: "Denken als een aanvaller om kwetsbaarheden te vinden die anderen missen",
        expertise: "Diensten en expertise",
        expertiseText: "Ik voer uitgebreide beveiligingsonderzoeken uit om kwetsbaarheden te vinden voordat ze worden misbruikt. Mijn kernwerk omvat webapplicaties, Active Directory, Azure, mobiele apps, broncode en hardware. Van een start-up met een eerste MVP tot een organisatie met terugkerende compliancebehoeften: u ontvangt een helder en praktisch rapport waarin remediatie op basis van werkelijk bedrijfsrisico wordt geprioriteerd.",
        why: "Waarom samenwerken met mij?",
        whyText: "Dreigingen blijven veranderen. Daarom werkt u met een specialist die zich voortdurend blijft ontwikkelen. Ik bezit de erkende certificeringen OSCP, OSWE en OSEP en heb ervaring met het vinden van kritieke kwetsbaarheden in complexe omgevingen. U krijgt geen oppervlakkige scan, maar een betrokken beveiligingspartner. Iedere opdracht wordt afgesloten met een duidelijke toelichting zodat uw team de bevindingen en vervolgstappen begrijpt.",
        approach: "Mijn aanpak",
        approachText: "Beveiliging is geen standaardoplossing. Ik werk volgens een gestructureerde, ethische methode: van verkenning en kwetsbaarheidsanalyse tot veilige exploitatie en rapportage. Erkende kaders zoals OWASP en PTES ondersteunen de diepgang. Het doel is niet alleen fouten vinden, maar uw ontwikkelteam een duidelijke route bieden om de beveiliging te verbeteren zonder de dagelijkse werkzaamheden onnodig te verstoren.",
        steps: ["Verkenning", "Analyse", "Exploitatie", "Rapportage"],
        deliverables: "Gedetailleerde oplevering",
        deliverablesText: "Na iedere opdracht ontvangt u meer dan een lijst met kwetsbaarheden. Een managementsamenvatting maakt het bedrijfsrisico begrijpelijk voor niet-technische belanghebbenden, terwijl de technische verdieping uw ontwikkelteam ondersteunt. Iedere bevinding bevat een ernstscore, proof-of-concept en heldere remediatiestappen.",
        deliverableItems: ["Managementsamenvatting", "Technische verdieping", "Ernstscores", "Remediatiestappen"],
      }
    : {
        titlePrefix: "THE CORE",
        titleAccent: "PROTOCOL",
        status: "[ STATUS: AUTHORIZED ]",
        specialist: "Security Specialist",
        about: "ABOUT ME",
        intro: "I have always been driven by a deep-seated curiosity about how systems work and how they are built. For me, hacking isn't just a career—it's a lifelong passion. I am constantly diving into the latest software, refining my methodology, and studying new ways to improve security. This relentless drive to learn ensures that when I test your environment, I am bringing the most up-to-date knowledge and a creative problem-solving approach to every project.",
        learning: "Continuous Learning",
        learningText: "Always studying the latest attack vectors and defense mechanisms",
        creative: "Creative Approach",
        creativeText: "Thinking like an attacker to find vulnerabilities others miss",
        expertise: "Services & Expertise",
        expertiseText: "I specialize in comprehensive security assessments designed to identify vulnerabilities before they can be exploited. My core services cover web applications, Active Directory, Azure, mobile applications, source code, and hardware. Whether you are a startup securing an MVP or an established enterprise needing recurring compliance checks, I provide detailed, actionable reports that prioritize remediation based on actual business risk.",
        why: "Why Work With Me?",
        whyText: "In an era of evolving threats, you need a partner who stays ahead of the curve. I hold industry-recognized OSCP, OSWE, and OSEP certifications and have experience uncovering critical vulnerabilities in complex environments. You are not just getting a scan—you are getting a dedicated security partner. Every engagement concludes with a comprehensive debriefing so your team understands the findings and the necessary remediation steps.",
        approach: "My Approach",
        approachText: "Security is not a one-size-fits-all solution. I follow a structured, ethical methodology beginning with deep reconnaissance and moving through vulnerability analysis to exploitation and reporting. I use industry-standard OWASP and PTES frameworks to ensure thoroughness. My goal is not just to find bugs, but to provide a clear roadmap for your development team to strengthen security without disrupting daily operations.",
        steps: ["Reconnaissance", "Analysis", "Exploitation", "Reporting"],
        deliverables: "Detailed Deliverables",
        deliverablesText: "At the conclusion of every engagement, you receive more than a list of vulnerabilities. I provide an Executive Summary for non-technical stakeholders alongside a Technical Deep-Dive for your engineering team. Each finding includes a severity rating, a proof-of-concept, and clear remediation steps.",
        deliverableItems: ["Executive Summary", "Technical Deep-Dive", "Severity Ratings", "Remediation Steps"],
      };
  return (
    <main className="relative min-h-screen pt-24 pb-16">
      <CyberBackground />

      <div className="max-w-7xl mx-auto px-6 relative z-10">
        <div className="text-center mb-16">
          <h1 className="text-5xl font-bold mb-4">
            <span className="text-white">{copy.titlePrefix}</span>{" "}
            <span className="text-cyber-blue text-glow">{copy.titleAccent}</span>
          </h1>
          <div className="h-1 w-32 bg-gradient-to-r from-cyber-blue to-cyber-orange mx-auto"></div>
          <p className="text-cyber-orange font-mono text-sm mt-4">
            {copy.status}
          </p>
        </div>

        {/* Main Content Grid */}
        <div className="grid lg:grid-cols-3 gap-8 mb-16">
          {/* Profile Image */}
          <div className="lg:col-span-1">
            <div className="relative">
              <div className="absolute inset-0 bg-gradient-to-br from-cyber-blue to-cyber-orange blur-2xl opacity-30 animate-pulse"></div>
              <div className="relative bg-cyber-darkBlue border-2 border-cyber-blue/50 rounded-2xl p-4 box-glow">
                <div className="w-full aspect-square rounded-xl overflow-hidden bg-gradient-to-br from-cyber-dark to-cyber-darkBlue flex items-center justify-center">
                  {/* Placeholder for profile image */}
                  <div className="w-full h-full bg-gradient-to-br from-gray-700 to-gray-900 flex items-center justify-center">
                    {/* <svg
                      className="w-32 h-32 text-cyber-blue opacity-50"
                      fill="currentColor"
                      viewBox="0 0 24 24"
                    >
                      <path d="M12 12c2.21 0 4-1.79 4-4s-1.79-4-4-4-4 1.79-4 4 1.79 4 4 4zm0 2c-2.67 0-8 1.34-8 4v2h16v-2c0-2.66-5.33-4-8-4z" />
                    </svg> */}
                    <Image
                      src="/profile.jpg"
                      alt={
                        locale === "nl"
                          ? "Pentestspecialist van Bitwise Security"
                          : "Bitwise Security penetration testing specialist"
                      }
                      width={400}
                      height={400}
                      className="w-full h-full object-cover rounded-xl"
                    />
                  </div>
                </div>
                <div className="mt-4 text-center">
                  <h3 className="text-xl font-bold text-white mb-1">
                    {copy.specialist}
                  </h3>
                  <p className="text-cyber-blue text-sm font-mono">
                    OSCP • OSWE • OSEP
                  </p>
                </div>
              </div>
            </div>
          </div>

          {/* About Me Content */}
          <div className="lg:col-span-2">
            <div className="bg-cyber-darkBlue/80 backdrop-blur-md border border-cyber-blue/30 rounded-2xl p-8 box-glow scanline">
              <h2 className="text-3xl font-bold text-cyber-orange mb-6">
                {copy.about}
              </h2>

              <p className="text-gray-300 leading-relaxed mb-6 text-lg">
                {copy.intro}
              </p>

              <div className="grid md:grid-cols-2 gap-6 mt-8">
                <div className="flex items-start gap-4">
                  <div className="w-12 h-12 bg-cyber-blue/20 border border-cyber-blue rounded-lg flex items-center justify-center flex-shrink-0">
                    <svg
                      className="w-6 h-6 text-cyber-blue"
                      fill="currentColor"
                      viewBox="0 0 24 24"
                    >
                      <path d="M9 11H7v2h2v-2zm4 0h-2v2h2v-2zm4 0h-2v2h2v-2zm2-7h-1V2h-2v2H8V2H6v2H5c-1.11 0-1.99.9-1.99 2L3 20c0 1.1.89 2 2 2h14c1.1 0 2-.9 2-2V6c0-1.1-.9-2-2-2zm0 16H5V9h14v11z" />
                    </svg>
                  </div>
                  <div>
                    <h4 className="text-white font-semibold mb-1">
                      {copy.learning}
                    </h4>
                    <p className="text-gray-400 text-sm">
                      {copy.learningText}
                    </p>
                  </div>
                </div>

                <div className="flex items-start gap-4">
                  <div className="w-12 h-12 bg-cyber-orange/20 border border-cyber-orange rounded-lg flex items-center justify-center flex-shrink-0">
                    <svg
                      className="w-6 h-6 text-cyber-orange"
                      fill="currentColor"
                      viewBox="0 0 24 24"
                    >
                      <path d="M12 2L2 7v10c0 5.55 3.84 10.74 9 12 5.16-1.26 9-6.45 9-12V7l-10-5z" />
                    </svg>
                  </div>
                  <div>
                    <h4 className="text-white font-semibold mb-1">
                      {copy.creative}
                    </h4>
                    <p className="text-gray-400 text-sm">
                      {copy.creativeText}
                    </p>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* Additional Sections */}
        <div className="grid md:grid-cols-2 gap-8 mb-8">
          {/* Services & Expertise */}
          <div className="bg-cyber-darkBlue/80 backdrop-blur-md border border-cyber-blue/30 rounded-2xl p-8 box-glow">
            <h2 className="text-2xl font-bold text-cyber-blue mb-4">
              {copy.expertise}
            </h2>
            <p className="text-gray-300 leading-relaxed">
              {copy.expertiseText}
            </p>
          </div>

          {/* Why Work With Me */}
          <div className="bg-cyber-darkBlue/80 backdrop-blur-md border border-cyber-orange/30 rounded-2xl p-8 box-glow-orange">
            <h2 className="text-2xl font-bold text-cyber-orange mb-4">
              {copy.why}
            </h2>
            <p className="text-gray-300 leading-relaxed">
              {copy.whyText}
            </p>
          </div>
        </div>

        {/* My Approach */}
        <div className="bg-cyber-darkBlue/80 backdrop-blur-md border border-cyber-blue/30 rounded-2xl p-8 box-glow mb-8">
          <h2 className="text-2xl font-bold text-cyber-blue mb-4">
            {copy.approach}
          </h2>
          <p className="text-gray-300 leading-relaxed mb-6">
            {copy.approachText}
          </p>

          <div className="grid md:grid-cols-4 gap-4">
            {copy.steps.map(
              (step, index) => (
                <div
                  key={index}
                  className="bg-cyber-dark/50 border border-cyber-blue/20 rounded-lg p-4 text-center"
                >
                  <div className="text-2xl font-bold text-cyber-blue mb-2">
                    {index + 1}
                  </div>
                  <div className="text-sm text-gray-300">{step}</div>
                </div>
              ),
            )}
          </div>
        </div>

        {/* Detailed Deliverables */}
        <div className="bg-cyber-darkBlue/80 backdrop-blur-md border border-cyber-orange/30 rounded-2xl p-8 box-glow-orange">
          <h2 className="text-2xl font-bold text-cyber-orange mb-4">
            {copy.deliverables}
          </h2>
          <p className="text-gray-300 leading-relaxed mb-6">
            {copy.deliverablesText}
          </p>

          <div className="grid md:grid-cols-2 gap-4">
            <div className="flex items-center gap-3 bg-cyber-dark/30 rounded-lg p-4">
              <div className="w-2 h-2 bg-cyber-orange rounded-full animate-pulse"></div>
              <span className="text-gray-300">{copy.deliverableItems[0]}</span>
            </div>
            <div className="flex items-center gap-3 bg-cyber-dark/30 rounded-lg p-4">
              <div className="w-2 h-2 bg-cyber-orange rounded-full animate-pulse"></div>
              <span className="text-gray-300">{copy.deliverableItems[1]}</span>
            </div>
            <div className="flex items-center gap-3 bg-cyber-dark/30 rounded-lg p-4">
              <div className="w-2 h-2 bg-cyber-orange rounded-full animate-pulse"></div>
              <span className="text-gray-300">{copy.deliverableItems[2]}</span>
            </div>
            <div className="flex items-center gap-3 bg-cyber-dark/30 rounded-lg p-4">
              <div className="w-2 h-2 bg-cyber-orange rounded-full animate-pulse"></div>
              <span className="text-gray-300">{copy.deliverableItems[3]}</span>
            </div>
          </div>
        </div>
      </div>
    </main>
  );
}
